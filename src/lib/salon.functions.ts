import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  ACCEPTING_BOOKINGS,
  MAX_ADVANCE_DAYS,
  SLOT_MINUTES,
  applyConfig,
  breaksFor,
  findService,
  hoursFor,
  isClosed,
  type SalonConfig,
} from "./salon";

// All salon data lives in tables with no public access; every read/write goes
// through these handlers. Customer calls expose only free slots or a booking
// matched by reference + phone, and every booking change is re-validated here
// against the live schedule. Admin calls require a signed session token
// (obtained by exchanging the access code in adminSignIn); the `pin` field on
// admin inputs carries that token.

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function assertPin(token: string) {
  const { assertAdmin } = await import("./admin-auth.server");
  return assertAdmin(token);
}

const last10 = (p: string) => p.replace(/\D/g, "").slice(-10);

export type BookingRow = {
  reference: string;
  audience: "men" | "women";
  serviceIds: string[];
  date: string;
  time: number;
  slots: number;
  customer: { name: string; phone: string; email: string; notes?: string };
  status: "confirmed" | "cancelled";
  source: "online" | "walk-in";
  meta: Record<string, string | number | boolean | null>;
  createdAt: string;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toRow(r: any): BookingRow {
  return {
    reference: r.reference,
    audience: r.audience,
    serviceIds: r.service_ids ?? [],
    date: r.date,
    time: r.time,
    slots: r.slots,
    customer: r.customer,
    status: r.status,
    source: r.source,
    meta: r.meta ?? {},
    createdAt: r.created_at,
  };
}

/* ── Public ─────────────────────────────────────────────────── */

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const toMin = (t: string | null | undefined) => {
  if (!t) return undefined;
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
const hhmm = (t: string) => t.slice(0, 5);

type PersistedBreaks = Record<string, { start: string; end: string }[]>;

/** Builds the full salon configuration from the online tables. */
async function loadConfig() {
  const sb = await db();
  const today = new Date().toISOString().slice(0, 10);
  const [cats, svcs, hours, exc, settings, legacy] = await Promise.all([
    sb.from("service_categories").select("*").eq("active", true).order("display_order"),
    sb.from("services").select("*").eq("active", true).order("display_order"),
    sb.from("opening_hours").select("*"),
    sb.from("opening_exceptions").select("*").gte("date", today),
    sb.from("site_settings").select("key, value"),
    sb.from("salon_config").select("data").eq("id", 1).maybeSingle(),
  ]);
  const err = cats.error || svcs.error || hours.error || exc.error || settings.error;
  if (err) throw new Error("Salon data unavailable");
  const set = Object.fromEntries((settings.data ?? []).map((r) => [r.key, r.value])) as Record<
    string,
    Record<string, unknown>
  >;
  const hoursSetting = (set["business_hours"] ?? {}) as { breaksByDay?: PersistedBreaks };
  // Until the salon saves its own break periods, every open day has lunch 1–2 PM.
  const breaksByDay: PersistedBreaks =
    hoursSetting.breaksByDay ??
    Object.fromEntries([0, 1, 2, 3, 4, 5, 6].map((d) => [String(d), [{ start: "13:00", end: "14:00" }]]));
  const media = (set["media"] ?? {}) as Record<string, string>;
  const menu = (g: string) =>
    (cats.data ?? [])
      .filter((c) => c.gender === g)
      .map((c) => ({
        id: c.slug,
        title: c.name,
        blurb: c.description || undefined,
        photo: media[`cat:${c.id}`] || undefined,
        services: (svcs.data ?? [])
          .filter((s) => s.category_id === c.id)
          .map((s) => ({
            id: s.id,
            name: s.name,
            note: s.description || undefined,
            price: s.price,
            from: s.price_from || undefined,
            slots: Math.max(1, Math.round(s.duration_minutes / 30)),
            photo: media[`svc:${s.id}`] || undefined,
          })),
      }))
      .filter((c) => c.services.length > 0);
  // Staff lives alongside the config but is for the console only.
  const { staff: _staff, ...legacyData } = (legacy.data?.data ?? {}) as Record<string, unknown>;
  const booking = set["booking"] ?? {};
  const config: Record<string, unknown> = {
    ...legacyData,
    business: set["business"] ?? legacyData["business"],
    accepting: booking["accepting"] ?? legacyData["accepting"] ?? true,
    maxAdvanceDays: booking["maxAdvanceDays"] ?? legacyData["maxAdvanceDays"] ?? 56,
    exceptions: Object.fromEntries(
      (exc.data ?? []).map((e) => [
        e.date,
        { closed: !e.is_open, open: toMin(e.opening_time), close: toMin(e.closing_time), note: e.note },
      ]),
    ),
  };
  if ((hours.data ?? []).length === 7) {
    const order = [1, 2, 3, 4, 5, 6, 0];
    config["week"] = order.map((d) => {
      const h = hours.data!.find((x) => x.day_of_week === d)!;
      const breaks = (breaksByDay[String(d)] ?? [])
        .map((b) => ({ start: toMin(b.start), end: toMin(b.end) }))
        .filter((b): b is { start: number; end: number } => b.start != null && b.end != null && b.end > b.start);
      return {
        day: DAYS[d],
        closed: !h.is_open,
        open: toMin(h.opening_time),
        close: toMin(h.closing_time),
        breaks,
      };
    });
  }
  const men = menu("men");
  const women = menu("women");
  if (men.length) config["menMenu"] = men;
  if (women.length) config["womenMenu"] = women;
  return config;
}

export const getSalonConfig = createServerFn({ method: "GET" }).handler(async () => {
  return { configJson: JSON.stringify(await loadConfig()) };
});

export const getBusySlots = createServerFn({ method: "GET" })
  .inputValidator((d) => z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).parse(d))
  .handler(async ({ data }) => {
    const sb = await db();
    const { data: rows } = await sb
      .from("bookings")
      .select("time, slots, meta")
      .eq("date", data.date)
      .neq("status", "cancelled");
    return {
      busy: (rows ?? [])
        .filter((r) => (r.meta as { status?: string })?.status !== "cancelled")
        .map((r) => ({ time: r.time, slots: r.slots })),
    };
  });

/** India time, as the salon sees it. */
function salonNow() {
  const t = new Date(Date.now() + 330 * 60_000);
  return { iso: t.toISOString().slice(0, 10), minute: t.getUTCHours() * 60 + t.getUTCMinutes() };
}

const dayDiff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

/**
 * Checks a requested appointment against the live schedule: services exist,
 * the day is open and within the booking window, the time is in opening hours,
 * not in a break, not in the past, and not overlapping another booking.
 * Returns the authoritative number of 30-minute slots.
 */
async function checkSlot(
  input: { audience: "men" | "women"; serviceIds: string[]; date: string; time: number },
  ignoreReference?: string,
): Promise<{ ok: true; slots: number } | { ok: false; error: string }> {
  const sb = await db();
  applyConfig((await loadConfig()) as SalonConfig);
  if (!ACCEPTING_BOOKINGS) return { ok: false, error: "Online booking is paused right now." };

  const services = input.serviceIds.map((id) => findService(input.audience, id));
  if (!services.length || services.some((x) => !x)) {
    return { ok: false, error: "One of the selected services is no longer offered. Please choose again." };
  }
  const slots = Math.max(1, services.reduce((n, x) => n + (x?.slots ?? 0), 0));
  const end = input.time + slots * SLOT_MINUTES;

  const now = salonNow();
  if (input.date < now.iso || (input.date === now.iso && input.time < now.minute + 30)) {
    return { ok: false, error: "That time has already passed. Please pick another." };
  }
  if (dayDiff(now.iso, input.date) > MAX_ADVANCE_DAYS) {
    return { ok: false, error: "That date is too far ahead to book online." };
  }
  if (isClosed(input.date)) return { ok: false, error: "The salon is closed that day." };
  const h = hoursFor(input.date);
  if (input.time < h.open || end > h.close || (input.time - h.open) % SLOT_MINUTES !== 0) {
    return { ok: false, error: "That time is outside opening hours." };
  }
  if (breaksFor(input.date).some((b) => input.time < b.end && b.start < end)) {
    return { ok: false, error: "That time overlaps the salon's break. Please pick another." };
  }
  const { data: rows } = await sb
    .from("bookings")
    .select("reference, time, slots, meta")
    .eq("date", input.date)
    .neq("status", "cancelled");
  const clash = (rows ?? []).some(
    (r) =>
      r.reference !== ignoreReference &&
      (r.meta as { status?: string })?.status !== "cancelled" &&
      input.time < r.time + r.slots * SLOT_MINUTES &&
      r.time < end,
  );
  if (clash) return { ok: false, error: "That time was just taken. Please pick another." };
  return { ok: true, slots };
}

const bookingInput = z.object({
  reference: z.string().regex(/^HB-[A-Z0-9]{6}$/),
  audience: z.enum(["men", "women"]),
  serviceIds: z.array(z.string().max(80)).min(1).max(20),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.number().int().min(0).max(1440),
  slots: z.number().int().min(1).max(40),
  customer: z.object({
    name: z.string().trim().min(1).max(100),
    phone: z.string().trim().min(7).max(20),
    email: z.string().trim().max(255),
    notes: z.string().max(1000).optional(),
  }),
  // Optional reference photos uploaded during booking (pending/<draft>/<file>).
  photos: z
    .array(z.string().regex(/^pending\/[0-9a-f-]{36}\/[a-z0-9]+\.(jpg|png|webp)$/))
    .max(3)
    .optional(),
});

export const createBooking = createServerFn({ method: "POST" })
  .inputValidator((d) => bookingInput.parse(d))
  .handler(async ({ data }) => {
    const sb = await db();
    const check = await checkSlot(data);
    if (!check.ok) return { ok: false as const, error: check.error };
    const photoLib = await import("./photos.server");
    const photos = data.photos?.length ? await photoLib.attachPhotos(data.reference, data.photos) : [];
    const { error } = await sb.from("bookings").insert({
      reference: data.reference,
      audience: data.audience,
      service_ids: data.serviceIds,
      date: data.date,
      time: data.time,
      slots: check.slots,
      customer: { ...data.customer, ...(photos.length ? { photos } : {}) },
      source: "online",
    });
    await photoLib.sweepPhotos().catch(() => {});
    if (error) {
      console.error(error);
      return { ok: false as const, error: "We couldn't save your booking. Please try again." };
    }
    return { ok: true as const };
  });

const lookup = z.object({ reference: z.string().max(20), phone: z.string().max(20) });

export const findMyBooking = createServerFn({ method: "POST" })
  .inputValidator((d) => lookup.parse(d))
  .handler(async ({ data }) => {
    const sb = await db();
    const { data: r } = await sb
      .from("bookings")
      .select("*")
      .eq("reference", data.reference.trim().toUpperCase())
      .maybeSingle();
    if (!r || last10((r.customer as { phone: string }).phone) !== last10(data.phone)) {
      return { booking: null };
    }
    // Staff notes, payment and chair assignments stay internal.
    return { booking: { ...toRow(r), meta: {} } };
  });

export const updateMyBooking = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    lookup
      .extend({
        action: z.enum(["cancel", "reschedule"]),
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        time: z.number().int().min(0).max(1440).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const sb = await db();
    const { data: r } = await sb
      .from("bookings")
      .select("*")
      .eq("reference", data.reference.trim().toUpperCase())
      .maybeSingle();
    if (!r || last10((r.customer as { phone: string }).phone) !== last10(data.phone)) {
      return { ok: false, error: "Booking not found." };
    }
    if (r.status === "cancelled") return { ok: false, error: "This booking was cancelled." };
    if (data.action === "cancel") {
      await sb.from("bookings").update({ status: "cancelled" }).eq("reference", r.reference);
      const { deleteBookingPhotos } = await import("./photos.server");
      await deleteBookingPhotos(r.reference).catch(() => {});
      return { ok: true };
    }
    if (!data.date || data.time == null) return { ok: false, error: "Pick a new date and time." };
    const check = await checkSlot(
      { audience: r.audience as "men" | "women", serviceIds: r.service_ids ?? [], date: data.date, time: data.time },
      r.reference,
    );
    if (!check.ok) return { ok: false, error: check.error };
    await sb
      .from("bookings")
      .update({ date: data.date, time: data.time, slots: check.slots })
      .eq("reference", r.reference);
    return { ok: true };
  });

/* ── Admin (access code) ────────────────────────────────────── */

// `pin` carries the admin session token.
const pinOnly = z.object({ pin: z.string().max(512) });
const hhmmTime = z.string().regex(/^\d{2}:\d{2}$/);

/** Exchanges the access code for a session token (throttled after repeated misses). */
export const adminSignIn = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ code: z.string().trim().min(1).max(32) }).parse(d))
  .handler(async ({ data }) => {
    const { signIn } = await import("./admin-auth.server");
    return signIn(data.code);
  });

export const adminListBookings = createServerFn({ method: "POST" })
  .inputValidator((d) => pinOnly.parse(d))
  .handler(async ({ data }) => {
    const sb = await assertPin(data.pin);
    const { sweepPhotos } = await import("./photos.server");
    await sweepPhotos().catch(() => {});
    const [{ data: rows }, { data: cfg }, { data: booking }] = await Promise.all([
      sb.from("bookings").select("*").order("date", { ascending: false }).limit(2000),
      sb.from("salon_config").select("data").eq("id", 1).maybeSingle(),
      sb.from("site_settings").select("value").eq("key", "booking").maybeSingle(),
    ]);
    const shared = (cfg?.data ?? {}) as { staff?: unknown };
    return {
      bookings: (rows ?? []).map(toRow),
      staffJson: Array.isArray(shared.staff) ? JSON.stringify(shared.staff) : null,
      accepting: ((booking?.value ?? {}) as { accepting?: boolean }).accepting ?? true,
    };
  });

export const adminUpsertBooking = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    pinOnly
      .extend({
        reference: z.string().max(20),
        insert: bookingInput.omit({ reference: true }).extend({ source: z.enum(["online", "walk-in"]) }).optional(),
        patch: z
          .object({
            date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
            time: z.number().int().optional(),
            status: z.enum(["confirmed", "cancelled"]).optional(),
            meta: z.record(z.string(), z.unknown()).optional(),
          })
          .optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const sb = await assertPin(data.pin);
    if (data.insert) {
      const i = data.insert;
      const { error } = await sb.from("bookings").insert({
        reference: data.reference,
        audience: i.audience,
        service_ids: i.serviceIds,
        date: i.date,
        time: i.time,
        slots: i.slots,
        customer: i.customer,
        source: i.source,
      });
      if (error) throw new Error("Couldn't add the walk-in");
    } else if (data.patch) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await sb.from("bookings").update(data.patch as any).eq("reference", data.reference);
      if (error) throw new Error("Couldn't update the appointment");
      // Reference photos are only kept until the visit is over.
      const status = (data.patch.meta as { status?: string } | undefined)?.status;
      if (data.patch.status === "cancelled" || status === "completed" || status === "no-show" || status === "cancelled") {
        const { deleteBookingPhotos } = await import("./photos.server");
        await deleteBookingPhotos(data.reference).catch(() => {});
        const { data: row } = await sb.from("bookings").select("customer").eq("reference", data.reference).maybeSingle();
        const c = row?.customer as Record<string, unknown> | undefined;
        if (c?.["photos"]) {
          const { photos: _gone, ...rest } = c;
          await sb.from("bookings").update({ customer: rest as never }).eq("reference", data.reference);
        }
      }
    }
    return { ok: true };
  });

export const adminSaveConfig = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    pinOnly.extend({ config: z.record(z.string(), z.unknown()) }).parse(d),
  )
  .handler(async ({ data }) => {
    if (JSON.stringify(data.config).length > 500_000) throw new Error("Too large");
    const sb = await assertPin(data.pin);
    // Merge, so saving one setting never wipes the others.
    const { data: existing } = await sb.from("salon_config").select("data").eq("id", 1).maybeSingle();
    const merged = { ...((existing?.data as Record<string, unknown>) ?? {}), ...data.config };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await sb.from("salon_config").update({ data: merged as any }).eq("id", 1);
    if (error) throw new Error("Couldn't save settings");
    const c = data.config as { accepting?: boolean; maxAdvanceDays?: number };
    if (c.accepting !== undefined || c.maxAdvanceDays !== undefined) {
      const { data: cur } = await sb.from("site_settings").select("value").eq("key", "booking").maybeSingle();
      const value = { ...((cur?.value as object) ?? {}), ...(c.accepting !== undefined ? { accepting: c.accepting } : {}), ...(c.maxAdvanceDays !== undefined ? { maxAdvanceDays: c.maxAdvanceDays } : {}) };
      await sb.from("site_settings").upsert({ key: "booking", value });
    }
    return { ok: true };
  });

const businessHourInput = z.object({
  day: z.number().int().min(0).max(6),
  open: z.boolean(),
  from: hhmmTime,
  to: hhmmTime,
  breaks: z.array(z.object({ start: hhmmTime, end: hhmmTime })).max(6),
});

export const adminSaveBusinessHours = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    pinOnly.extend({ hours: z.array(businessHourInput).length(7) }).parse(d),
  )
  .handler(async ({ data }) => {
    const sb = await assertPin(data.pin);
    const sorted = [...data.hours].sort((a, b) => a.day - b.day);
    const seen = new Set<number>();
    const breaksByDay: PersistedBreaks = {};

    for (const h of sorted) {
      if (seen.has(h.day)) throw new Error("Duplicate day in schedule");
      seen.add(h.day);
      const open = toMin(h.from) ?? 0;
      const close = toMin(h.to) ?? 0;
      if (h.open && close <= open) throw new Error("Closing time must be after opening time");

      const normalizedBreaks = (h.open ? h.breaks : [])
        .map((b) => ({ start: toMin(b.start) ?? 0, end: toMin(b.end) ?? 0 }))
        .sort((a, b) => a.start - b.start);

      for (let i = 0; i < normalizedBreaks.length; i++) {
        const b = normalizedBreaks[i]!;
        if (b.end <= b.start) throw new Error("Break end must be after break start");
        if (b.start < open || b.end > close) {
          throw new Error("Breaks must be inside opening hours");
        }
        if (i > 0 && b.start < normalizedBreaks[i - 1]!.end) {
          throw new Error("Break periods cannot overlap");
        }
      }

      breaksByDay[String(h.day)] = normalizedBreaks.map((b) => ({
        start: hhmm(`${String(Math.floor(b.start / 60)).padStart(2, "0")}:${String(b.start % 60).padStart(2, "0")}`),
        end: hhmm(`${String(Math.floor(b.end / 60)).padStart(2, "0")}:${String(b.end % 60).padStart(2, "0")}`),
      }));
    }
    if (seen.size !== 7) throw new Error("All 7 days are required");

    const { error: hoursError } = await sb.from("opening_hours").upsert(
      sorted.map((h) => ({
        day_of_week: h.day,
        is_open: h.open,
        opening_time: h.from,
        closing_time: h.to,
      })),
    );
    if (hoursError) throw new Error("Couldn't save opening hours");

    const { data: cur } = await sb
      .from("site_settings")
      .select("value")
      .eq("key", "business_hours")
      .maybeSingle();
    const value = { ...((cur?.value as Record<string, unknown>) ?? {}), breaksByDay };
    const { error: settingError } = await sb
      .from("site_settings")
      .upsert({ key: "business_hours", value });
    if (settingError) throw new Error("Couldn't save break periods");

    return { ok: true };
  });

/** Changes the access code; needs the current code again. Returns a fresh session. */
export const adminChangePin = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    pinOnly.extend({ current: z.string().max(32), next: z.string().regex(/^\d{6,12}$/) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { changeCode } = await import("./admin-auth.server");
    return changeCode(data.pin, data.current, data.next);
  });
