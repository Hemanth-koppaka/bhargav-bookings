import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { withHistory, type HistoryEntry } from "./history";

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
  source: "online" | "walk-in" | "phone" | "whatsapp" | "admin";
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

const toMin = (t: string | null | undefined) => {
  if (!t) return undefined;
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
const hhmm = (t: string) => t.slice(0, 5);
type PersistedBreaks = Record<string, { start: string; end: string }[]>;

const loadConfig = async () => (await import("./config.server")).loadConfig();

export const getSalonConfig = createServerFn({ method: "GET" }).handler(async () => {
  return { configJson: JSON.stringify(await loadConfig()) };
});

// Booking writes live in a server-only module (also exercised by tests).
const B = () => import("./bookings.server");
const engine = async () => (await B()).engine();
type Sb = Awaited<ReturnType<typeof db>>;
const insertBooking = async (...a: Parameters<Awaited<ReturnType<typeof B>>["insertBooking"]>) => (await B()).insertBooking(...a);
const patchBooking = async (_sb: Sb, ...a: Parameters<Awaited<ReturnType<typeof B>>["patchBooking"]>) => (await B()).patchBooking(...a);

const bookingInput = z.object({
  // accepted for compatibility; the server issues the real booking ID
  reference: z.string().max(20).optional(),
  audience: z.enum(["men", "women"]),
  serviceIds: z.array(z.string().max(80)).min(1).max(20),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time: z.number().int().min(0).max(1440),
  slots: z.number().int().min(1).max(40).optional(),
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
    const r = await insertBooking(
      {
        audience: data.audience,
        serviceIds: data.serviceIds,
        date: data.date,
        time: data.time,
        customer: data.customer,
        source: "online",
      },
      { staff: false, ...(data.photos?.length ? { photos: data.photos } : {}) },
    );
    const { sweepPhotos } = await import("./photos.server");
    await sweepPhotos().catch(() => {});
    if (!r.ok) return { ok: false as const, error: r.error };
    return { ok: true as const, reference: r.reference };
  });

/** Bookable start times for a day, for the selected services (customer time picker). */
export const getAvailability = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        audience: z.enum(["men", "women"]),
        serviceIds: z.array(z.string().max(80)).min(1).max(20),
        // when moving an existing booking, its own time doesn't count as taken
        reference: z.string().max(20).optional(),
        phone: z.string().max(20).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const E = await engine();
    const rules = await E.loadRules();
    let q: { minutes: number; buffer: number } = E.quote(data.audience, data.serviceIds) ?? { minutes: 30, buffer: 0 };
    let ignore: string | undefined;
    if (data.reference && data.phone) {
      const sb = await db();
      const { data: r } = await sb.from("bookings").select("*").eq("reference", data.reference).maybeSingle();
      if (r && last10((r.customer as { phone: string }).phone) === last10(data.phone)) {
        ignore = r.reference;
        // a booking keeps the length it was made with
        const row = r as Record<string, unknown>;
        q = { minutes: (row["duration_minutes"] as number | null) ?? r.slots * 30, buffer: (row["buffer_minutes"] as number | null) ?? 0 };
      }
    }
    return E.availability(data.date, q, rules, ignore ? { ignoreReference: ignore } : {});
  });

/** Public booking rules the customer screens need (no internal settings). */
export const getPublicRules = createServerFn({ method: "GET" }).handler(async () => {
  const E = await engine();
  const r = await E.loadRules();
  return {
    accepting: r.accepting,
    pauseMessage: r.pauseMessage,
    allowMultiple: r.allowMultiple,
    maxServices: r.maxServices,
    maxAdvanceDays: r.maxAdvanceDays,
    allowSameDay: r.allowSameDay,
    customerCancel: r.customerCancel,
    cancelDeadlineMinutes: r.cancelDeadlineMinutes,
    customerReschedule: r.customerReschedule,
    rescheduleDeadlineMinutes: r.rescheduleDeadlineMinutes,
  };
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
    const row = r as Record<string, unknown>;
    const status = (r.meta as { status?: string })?.status;
    if (r.status === "cancelled" || status === "cancelled") return { ok: false, error: "This booking was cancelled." };
    if (status === "completed" || status === "no-show") return { ok: false, error: "This appointment has already taken place." };

    const E = await engine();
    const rules = await E.loadRules();
    const now = E.salonNow();
    const minutesUntil = E.dayDiff(now.iso, r.date) * 1440 + r.time - now.minute;

    if (data.action === "cancel") {
      if (!rules.customerCancel) return { ok: false, error: "Online cancellation is off. Please call the studio." };
      if (minutesUntil < rules.cancelDeadlineMinutes) {
        return { ok: false, error: "It's too close to your appointment to cancel online. Please call the studio." };
      }
      const error = await patchBooking(sb, r.reference, { status: "cancelled" }, {
        cancelled_at: new Date().toISOString(),
        cancel_reason: "Cancelled by guest online",
        history: withHistory(row, { by: "guest", action: "cancelled" }),
      });
      if (error) return { ok: false, error: "Couldn't cancel this booking. Please try again." };
      const { deleteBookingPhotos } = await import("./photos.server");
      await deleteBookingPhotos(r.reference).catch(() => {});
      await E.audit({ actor: "guest", action: "booking.cancel", entity: "booking", entityId: r.reference, summary: `Guest cancelled ${r.reference}` });
      return { ok: true };
    }

    if (!data.date || data.time == null) return { ok: false, error: "Pick a new date and time." };
    if (!rules.customerReschedule) return { ok: false, error: "Online rescheduling is off. Please call the studio." };
    if (minutesUntil < rules.rescheduleDeadlineMinutes) {
      return { ok: false, error: "It's too close to your appointment to move it online. Please call the studio." };
    }
    const moves = ((row["history"] as HistoryEntry[] | undefined) ?? []).filter((h) => h.by === "guest" && h.action === "rescheduled").length;
    if (moves >= rules.maxReschedules) return { ok: false, error: "This booking can't be moved online again. Please call the studio." };
    // the appointment keeps the length it was booked with
    const held = {
      minutes: (row["duration_minutes"] as number | null) ?? r.slots * 30,
      buffer: (row["buffer_minutes"] as number | null) ?? 0,
    };
    const check = await E.checkTime(data.date, data.time, held, rules, { ignoreReference: r.reference });
    if (!check.ok) return check;
    const error = await patchBooking(sb, r.reference, { date: data.date, time: data.time }, {
      history: withHistory(row, { by: "guest", action: "rescheduled", from: { date: r.date, time: r.time }, to: { date: data.date, time: data.time } }),
    });
    if (error) {
      return { ok: false, error: E.isSlotTaken(error) ? "That time was just booked. Please choose another time." : "Couldn't move this booking. Please try again." };
    }
    await E.audit({
      actor: "guest",
      action: "booking.reschedule",
      entity: "booking",
      entityId: r.reference,
      summary: `Guest moved ${r.reference}`,
      before: { date: r.date, time: r.time },
      after: { date: data.date, time: data.time },
    });
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
        insert: bookingInput
          .omit({ reference: true })
          .extend({ source: z.enum(["online", "walk-in", "phone", "whatsapp", "admin"]) })
          .optional(),
        patch: z
          .object({
            date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
            time: z.number().int().min(0).max(1440).optional(),
            status: z.enum(["confirmed", "cancelled"]).optional(),
            meta: z.record(z.string(), z.unknown()).optional(),
            cancelReason: z.string().max(200).optional(),
          })
          .optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const sb = await assertPin(data.pin);
    const E = await engine();
    if (data.insert) {
      const i = data.insert;
      const r = await insertBooking(
        { audience: i.audience, serviceIds: i.serviceIds, date: i.date, time: i.time, customer: i.customer, source: i.source },
        { staff: true },
      );
      if (!r.ok) throw new Error(r.error);
      await E.audit({ action: "booking.create", entity: "booking", entityId: r.reference, summary: `Added ${i.source} booking ${r.reference} for ${i.customer.name}`, after: { date: i.date, time: i.time, services: i.serviceIds } });
      return { ok: true, reference: r.reference };
    }
    if (!data.patch) return { ok: true, reference: data.reference };

    const { data: current } = await sb.from("bookings").select("*").eq("reference", data.reference).maybeSingle();
    if (!current) throw new Error("Booking not found");
    const row = current as Record<string, unknown>;
    const p = data.patch;
    const base: Record<string, unknown> = {};
    const extra: Record<string, unknown> = {};
    const moved = (p.date && p.date !== current.date) || (p.time != null && p.time !== current.time);

    if (moved) {
      // admins can't create clashes either; the booking keeps its booked length
      const held = {
        minutes: (row["duration_minutes"] as number | null) ?? current.slots * 30,
        buffer: (row["buffer_minutes"] as number | null) ?? 0,
      };
      const check = await E.checkTime(p.date ?? current.date, p.time ?? current.time, held, await E.loadRules(), {
        staff: true,
        ignoreReference: current.reference,
      });
      if (!check.ok) throw new Error(check.error.replace("just booked", "already booked"));
      base["date"] = p.date ?? current.date;
      base["time"] = p.time ?? current.time;
      extra["history"] = withHistory(row, { by: "admin", action: "rescheduled", from: { date: current.date, time: current.time }, to: { date: base["date"], time: base["time"] } });
    }
    const metaStatus = (p.meta as { status?: string } | undefined)?.status;
    const prevStatus = (current.meta as { status?: string } | null)?.status;
    const cancelling = p.status === "cancelled" || metaStatus === "cancelled";
    if (p.status) base["status"] = p.status;
    if (p.meta) base["meta"] = p.meta;
    if (cancelling && current.status !== "cancelled") {
      base["status"] = "cancelled";
      extra["cancelled_at"] = new Date().toISOString();
      extra["cancel_reason"] = p.cancelReason ?? "";
      extra["history"] = withHistory({ history: extra["history"] ?? row["history"] }, { by: "admin", action: "cancelled", ...(p.cancelReason ? { reason: p.cancelReason } : {}) });
    } else if (metaStatus && metaStatus !== prevStatus) {
      extra["history"] = withHistory({ history: extra["history"] ?? row["history"] }, { by: "admin", action: `status:${metaStatus}` });
      if (current.status === "cancelled" && metaStatus !== "cancelled") base["status"] = "confirmed"; // restored
    }

    const error = await patchBooking(sb, data.reference, base, extra);
    if (error) {
      throw new Error(E.isSlotTaken(error) ? "That time is no longer available." : "Couldn't update the appointment");
    }
    if (moved) {
      await E.audit({ action: "booking.reschedule", entity: "booking", entityId: data.reference, summary: `Moved ${data.reference}`, before: { date: current.date, time: current.time }, after: { date: base["date"], time: base["time"] } });
    }
    if (cancelling && current.status !== "cancelled") {
      await E.audit({ action: "booking.cancel", entity: "booking", entityId: data.reference, summary: `Cancelled ${data.reference}`, reason: p.cancelReason ?? "" });
    } else if (metaStatus && metaStatus !== prevStatus) {
      await E.audit({ action: "booking.status", entity: "booking", entityId: data.reference, summary: `${data.reference}: ${prevStatus ?? "upcoming"} → ${metaStatus}`, before: { status: prevStatus ?? "upcoming" }, after: { status: metaStatus } });
    }

    // Reference photos are only kept until the visit is over.
    if (cancelling || metaStatus === "completed" || metaStatus === "no-show") {
      const { deleteBookingPhotos } = await import("./photos.server");
      await deleteBookingPhotos(data.reference).catch(() => {});
      const c = current.customer as Record<string, unknown> | undefined;
      if (c?.["photos"]) {
        const { photos: _gone, ...rest } = c;
        await sb.from("bookings").update({ customer: rest as never }).eq("reference", data.reference);
      }
    }
    return { ok: true, reference: data.reference };
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
    const E = await import("./engine.server");
    if (c.accepting !== undefined) {
      await E.audit({ action: c.accepting ? "bookings.resume" : "bookings.pause", entity: "settings", entityId: "booking", summary: c.accepting ? "Resumed online bookings" : "Paused online bookings" });
    }
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
    const E = await import("./engine.server");
    await E.audit({ action: "hours.update", entity: "hours", summary: "Updated opening hours and breaks", after: { hours: sorted, breaksByDay } });

    return { ok: true };
  });

/** Changes the access code; needs the current code again. Returns a fresh session. */
export const adminChangePin = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    pinOnly.extend({ current: z.string().max(32), next: z.string().regex(/^\d{6,12}$/) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { changeCode } = await import("./admin-auth.server");
    const r = await changeCode(data.pin, data.current, data.next);
    if (r.ok) {
      const E = await import("./engine.server");
      await E.audit({ action: "security.code_change", entity: "security", summary: "Changed the admin access code" });
    }
    return r;
  });
