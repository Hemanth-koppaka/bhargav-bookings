import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// All salon data lives in tables with no public access; every read/write goes
// through these handlers. Customer calls expose only free slots or a booking
// matched by reference + phone. Admin calls require the shared access code.

async function db() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function assertPin(pin: string) {
  const sb = await db();
  const { data } = await sb.from("admin_secret").select("pin").eq("id", 1).maybeSingle();
  if (!data || data.pin !== pin) throw new Error("Access code not accepted");
  return sb;
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
  const breaksByDay = hoursSetting.breaksByDay ?? {};
  const menu = (g: string) =>
    (cats.data ?? [])
      .filter((c) => c.gender === g)
      .map((c) => ({
        id: c.slug,
        title: c.name,
        blurb: c.description || undefined,
        services: (svcs.data ?? [])
          .filter((s) => s.category_id === c.id)
          .map((s) => ({
            id: s.id,
            name: s.name,
            note: s.description || undefined,
            price: s.price,
            from: s.price_from || undefined,
            slots: Math.max(1, Math.round(s.duration_minutes / 30)),
          })),
      }))
      .filter((c) => c.services.length > 0);
  const legacyData = (legacy.data?.data ?? {}) as Record<string, unknown>;
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
});

export const createBooking = createServerFn({ method: "POST" })
  .inputValidator((d) => bookingInput.parse(d))
  .handler(async ({ data }) => {
    const sb = await db();
    const cfg = await loadConfig();
    if (cfg["accepting"] === false) {
      return { ok: false as const, error: "Online booking is paused right now." };
    }
    const { data: rows } = await sb
      .from("bookings")
      .select("time, slots")
      .eq("date", data.date)
      .neq("status", "cancelled");
    const end = data.time + data.slots * 30;
    const clash = (rows ?? []).some((r) => data.time < r.time + r.slots * 30 && r.time < end);
    if (clash) return { ok: false as const, error: "That time was just taken. Please pick another." };
    const { error } = await sb.from("bookings").insert({
      reference: data.reference,
      audience: data.audience,
      service_ids: data.serviceIds,
      date: data.date,
      time: data.time,
      slots: data.slots,
      customer: data.customer,
      source: "online",
    });
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
    return { booking: toRow(r) };
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
      return { ok: false };
    }
    const patch =
      data.action === "cancel"
        ? { status: "cancelled" }
        : { date: data.date ?? r.date, time: data.time ?? r.time };
    await sb.from("bookings").update(patch).eq("reference", r.reference);
    return { ok: true };
  });

/* ── Admin (access code) ────────────────────────────────────── */

const pinOnly = z.object({ pin: z.string().max(32) });
const hhmmTime = z.string().regex(/^\d{2}:\d{2}$/);

export const adminCheckPin = createServerFn({ method: "POST" })
  .inputValidator((d) => pinOnly.parse(d))
  .handler(async ({ data }) => {
    try {
      await assertPin(data.pin);
      return { ok: true };
    } catch {
      return { ok: false };
    }
  });

export const adminListBookings = createServerFn({ method: "POST" })
  .inputValidator((d) => pinOnly.parse(d))
  .handler(async ({ data }) => {
    const sb = await assertPin(data.pin);
    const { data: rows } = await sb
      .from("bookings")
      .select("*")
      .order("date", { ascending: false })
      .limit(2000);
    return { bookings: (rows ?? []).map(toRow) };
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
      await sb.from("bookings").insert({
        reference: data.reference,
        audience: i.audience,
        service_ids: i.serviceIds,
        date: i.date,
        time: i.time,
        slots: i.slots,
        customer: i.customer,
        source: i.source,
      });
    } else if (data.patch) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await sb.from("bookings").update(data.patch as any).eq("reference", data.reference);
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await sb.from("salon_config").update({ data: data.config as any }).eq("id", 1);
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

export const adminChangePin = createServerFn({ method: "POST" })
  .inputValidator((d) => pinOnly.extend({ next: z.string().regex(/^\d{4,8}$/) }).parse(d))
  .handler(async ({ data }) => {
    const sb = await assertPin(data.pin);
    await sb.from("admin_secret").update({ pin: data.next }).eq("id", 1);
    return { ok: true };
  });
