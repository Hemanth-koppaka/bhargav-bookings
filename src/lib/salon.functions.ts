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

export const getSalonConfig = createServerFn({ method: "GET" }).handler(async () => {
  const sb = await db();
  const { data } = await sb.from("salon_config").select("data").eq("id", 1).maybeSingle();
  return { configJson: JSON.stringify(data?.data ?? {}) };
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
    const { data: cfg } = await sb.from("salon_config").select("data").eq("id", 1).maybeSingle();
    if ((cfg?.data as { accepting?: boolean })?.accepting === false) {
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
    return { ok: true };
  });

export const adminChangePin = createServerFn({ method: "POST" })
  .inputValidator((d) => pinOnly.extend({ next: z.string().regex(/^\d{4,8}$/) }).parse(d))
  .handler(async ({ data }) => {
    const sb = await assertPin(data.pin);
    await sb.from("admin_secret").update({ pin: data.next }).eq("id", 1);
    return { ok: true };
  });
