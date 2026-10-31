// Server-only booking writes: create (with price/duration snapshot, customer
// record and race-safe insert) and patch. Used by the server functions.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { applyConfig, type SalonConfig } from "./salon";
import { loadConfig } from "./config.server";

async function db() {
  return supabaseAdmin;
}

const last10 = (p: string) => p.replace(/\D/g, "").slice(-10);

/** Loads the live config into the shared salon model and returns the engine. */
export async function engine() {
  applyConfig((await loadConfig()) as SalonConfig);
  return import("./engine.server");
}

type Sb = Awaited<ReturnType<typeof db>>;

/** Next booking ID (HB-2026-00124); falls back to a random one until the migration is applied. */
async function nextReference(sb: Sb) {
  const { data, error } = await (
    sb.rpc as unknown as (fn: string) => Promise<{ data: unknown; error: unknown }>
  )("next_booking_reference");
  const row = (Array.isArray(data) ? data[0] : data) as {
    reference?: string;
    booking_no?: number;
  } | null;
  if (!error && row?.reference)
    return { reference: row.reference, bookingNo: row.booking_no ?? null };
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "HB-";
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return { reference: out, bookingNo: null };
}

/** Finds or creates the customer record for a phone number; returns its id (null before the migration). */
async function upsertCustomer(sb: Sb, c: { name: string; phone: string; email: string }) {
  const key = last10(c.phone);
  if (!key) return null;
  const { data: found, error } = await sb
    .from("customers" as never)
    .select("id")
    .eq("phone_key", key)
    .maybeSingle();
  if (error) return null;
  if (found) return (found as { id: string }).id;
  const { data: made } = await sb
    .from("customers" as never)
    .insert({ name: c.name, phone: c.phone, phone_key: key, email: c.email } as never)
    .select("id")
    .maybeSingle();
  return (made as { id: string } | null)?.id ?? null;
}

export type NewBooking = {
  audience: "men" | "women";
  serviceIds: string[];
  date: string;
  time: number;
  customer: { name: string; phone: string; email: string; notes?: string | undefined };
  source: "online" | "walk-in" | "phone" | "whatsapp" | "admin";
  status?: "confirmed" | "pending";
  meta?: Record<string, unknown>;
};

/**
 * Validates and stores a booking: live services and prices are captured as a
 * snapshot, availability is checked by the engine, and the database trigger
 * rejects the insert if someone took the slot in the meantime.
 */
export async function insertBooking(
  b: NewBooking,
  options: { staff: boolean; photos?: string[] },
): Promise<
  { ok: true; reference: string; price: number; minutes: number } | { ok: false; error: string }
> {
  const sb = await db();
  const E = await engine();
  const rules = await E.loadRules();
  if (!options.staff) {
    if (!rules.accepting) return { ok: false, error: rules.pauseMessage };
    if (!rules.allowMultiple && b.serviceIds.length > 1)
      return { ok: false, error: "Please choose one service per booking." };
    if (b.serviceIds.length > rules.maxServices) {
      return { ok: false, error: `Please choose up to ${rules.maxServices} services per booking.` };
    }
  }
  const q = E.quote(b.audience, b.serviceIds);
  if (!q)
    return {
      ok: false,
      error: "One of the selected services is no longer offered. Please choose again.",
    };
  const check = await E.checkTime(b.date, b.time, q, rules, { staff: options.staff });
  if (!check.ok) return check;

  const { reference, bookingNo } = await nextReference(sb);
  const customerId = await upsertCustomer(sb, b.customer);
  const photoLib = options.photos?.length ? await import("./photos.server") : null;
  const photos = photoLib ? await photoLib.attachPhotos(reference, options.photos!) : [];
  const row: Record<string, unknown> = {
    reference,
    audience: b.audience,
    service_ids: b.serviceIds,
    date: b.date,
    time: b.time,
    slots: Math.max(1, Math.ceil(q.minutes / 30)),
    customer: { ...b.customer, ...(photos.length ? { photos } : {}) },
    services_snapshot: q.snapshot,
    source: b.source,
    status: b.status ?? "confirmed",
    meta: b.meta ?? {},
  };
  // columns added by the Admin OS migration
  const extended = {
    ...row,
    ...(bookingNo != null ? { booking_no: bookingNo } : {}),
    customer_id: customerId,
    duration_minutes: q.minutes,
    buffer_minutes: q.buffer,
    price_total: q.price,
  };
  let { error } = await sb.from("bookings").insert(extended as never);
  if (error && !E.isSlotTaken(error) && /column/i.test(error.message)) {
    ({ error } = await sb.from("bookings").insert(row as never)); // migration not applied yet
  }
  if (error) {
    if (photoLib) await photoLib.deleteBookingPhotos(reference).catch(() => {});
    if (E.isSlotTaken(error))
      return { ok: false, error: "That time was just booked. Please choose another time." };
    console.error("booking insert failed", error.message);
    return { ok: false, error: "We couldn't save your booking. Please try again." };
  }
  return { ok: true, reference, price: q.price, minutes: q.minutes };
}

/** Applies a patch; columns from the Admin OS migration are dropped if it isn't applied yet. */
export async function patchBooking(
  reference: string,
  base: Record<string, unknown>,
  extra: Record<string, unknown>,
) {
  const sb = await db();
  const E = await import("./engine.server");
  let { error } = await sb
    .from("bookings")
    .update({ ...base, ...extra } as never)
    .eq("reference", reference);
  if (error && !E.isSlotTaken(error) && /column/i.test(error.message)) {
    ({ error } = await sb
      .from("bookings")
      .update(base as never)
      .eq("reference", reference));
  }
  return error;
}
