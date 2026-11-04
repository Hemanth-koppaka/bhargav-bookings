// Server-only booking writes: create (with price/duration snapshot, customer
// record and race-safe insert) and patch. Used by the server functions.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { metaWithStaff } from "./staff-store.server";
import { applyConfig, type SalonConfig } from "./salon";
import { loadConfig } from "./config.server";

async function db() {
  return supabaseAdmin;
}

const last10 = (p: string) => p.replace(/\D/g, "").slice(-10);

/**
 * Loads the live config into the shared salon model and returns the engine.
 * Screens may use the briefly cached copy; saving a booking always reads the
 * latest hours, closures and prices (`fresh`).
 */
export async function engine(fresh = false) {
  applyConfig((await loadConfig(fresh)) as SalonConfig);
  return import("./engine.server");
}

type Sb = Awaited<ReturnType<typeof db>>;

/**
 * A new booking ID the guest sees, e.g. HB-7KQ2MX: random, so it never tells
 * anyone how many clients the salon has. The salon's own running number
 * (booking_no) is kept alongside for the admin console only.
 */
async function nextReference(sb: Sb) {
  const { data, error } = await (
    sb.rpc as unknown as (fn: string) => Promise<{ data: unknown; error: unknown }>
  )("next_booking_reference");
  const row = (Array.isArray(data) ? data[0] : data) as { booking_no?: number } | null;
  const bookingNo = !error && row?.booking_no != null ? row.booking_no : null;
  // no look-alike characters (0/O, 1/I/L), so it's easy to read out on the phone
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  for (let attempt = 0; attempt < 5; attempt++) {
    const bytes = crypto.getRandomValues(new Uint8Array(6));
    const reference = "HB-" + Array.from(bytes, (x) => chars[x % chars.length]).join("");
    const { data: taken } = await sb.from("bookings").select("reference").eq("reference", reference).maybeSingle();
    if (!taken) return { reference, bookingNo };
  }
  throw new Error("Couldn't issue a booking ID. Please try again.");
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
  /** Guest agreed to booking messages on WhatsApp/SMS (transactional only). */
  notifyConsent?: boolean;
  /** Site the guest booked on, for the "Manage your booking" link. */
  siteOrigin?: string;
  /** "any" (default) or a stylist id chosen by the guest. */
  staffChoice?: string;
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
  | {
      ok: true;
      reference: string;
      price: number;
      minutes: number;
      services: { name: string; price: number; minutes: number }[];
      staffId: string | null;
      staffName: string | null;
    }
  | { ok: false; error: string }
> {
  const sb = await db();
  const E = await engine(true);
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
  // online guests: no accidental doubles, no overlapping bookings of their own,
  // and limits that stop prank or spam bookings filling the diary
  if (!options.staff) {
    const g = await guestGuard(sb, b, q.minutes);
    if (g) return g;
  }
  const choice = b.staffChoice && b.staffChoice !== "any" ? b.staffChoice : "any";
  const checkOpts = { staff: options.staff, serviceIds: b.serviceIds, choice };
  let check = await E.checkTime(b.date, b.time, q, rules, checkOpts);
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
  // columns added by the notifications migration (dropped below if it isn't applied)
  const notifyCols = {
    notify_consent: Boolean(b.notifyConsent),
    notify_consent_at: b.notifyConsent ? new Date().toISOString() : null,
    site_origin: b.siteOrigin ?? "",
  };
  const insert = async (staffId: string | null | undefined) => {
    // newest columns first; older shapes if a migration isn't applied yet
    const staffCols = staffId !== undefined ? { staff_id: staffId, staff_choice: choice === "any" ? "any" : "specific" } : {};
    // the stylist is also kept in meta, which every database version has
    // the stylist (id and name) is kept with the booking, so later changes to
    // the team or the service's stylist rule never rewrite history
    let staffNameNow: string | null = null;
    if (staffId) {
      const { stable } = await import("./staff-store.server");
      const { data: st } = await stable("staff").select("name").eq("id", staffId).maybeSingle();
      staffNameNow = ((st as { name?: string } | null)?.name as string) ?? null;
    }
    const withMeta = <T extends Record<string, unknown>>(x: T) =>
      staffId !== undefined
        ? { ...x, meta: { ...metaWithStaff(x["meta"], staffId, choice === "any" ? "any" : "specific"), ...(staffNameNow ? { staff_name: staffNameNow } : {}) } }
        : x;
    let r = await sb.from("bookings").insert(withMeta({ ...extended, ...notifyCols, ...staffCols }) as never);
    if (r.error && !E.isSlotTaken(r.error) && /column/i.test(r.error.message)) r = await sb.from("bookings").insert(withMeta({ ...extended, ...notifyCols }) as never);
    if (r.error && !E.isSlotTaken(r.error) && /column/i.test(r.error.message)) r = await sb.from("bookings").insert(withMeta(extended) as never);
    if (r.error && !E.isSlotTaken(r.error) && /column/i.test(r.error.message)) r = await sb.from("bookings").insert(withMeta(row) as never);
    return r.error;
  };
  let error = await insert(check.staffId);
  // "any available": if that stylist was taken a moment ago, try the next free one
  const tried: string[] = [];
  for (let n = 0; error && E.isSlotTaken(error) && choice === "any" && check.ok && check.staffId && n < 3; n++) {
    tried.push(check.staffId);
    const again = await E.checkTime(b.date, b.time, q, rules, { ...checkOpts, exclude: tried });
    if (!again.ok || !again.staffId) break;
    check = again;
    error = await insert(check.staffId);
  }
  if (error) {
    if (photoLib) await photoLib.deleteBookingPhotos(reference).catch(() => {});
    if (E.isSlotTaken(error))
      return { ok: false, error: "That time was just booked. Please choose another time." };
    console.error("booking insert failed", error.message);
    return { ok: false, error: "We couldn't save your booking. Please try again." };
  }
  if (b.notifyConsent && customerId) {
    // remember the guest's choice (booking messages only, never marketing)
    await sb
      .from("customers" as never)
      .update({ notify_consent: true, notify_consent_at: new Date().toISOString() } as never)
      .eq("id", customerId)
      .then(
        () => undefined,
        () => undefined,
      );
  }
  const staffId = check.ok ? (check.staffId ?? null) : null;
  let staffName: string | null = null;
  if (staffId) {
    const { stable } = await import("./staff-store.server");
    const { data: st } = await stable("staff").select("name").eq("id", staffId).maybeSingle();
    staffName = ((st as { name?: string } | null)?.name as string) ?? null;
  }
  return {
    ok: true,
    reference,
    price: q.price,
    minutes: q.minutes,
    services: q.snapshot.map((x) => ({ name: x.name, price: x.price, minutes: x.minutes })),
    staffId,
    staffName,
  };
}

/** Most upcoming online bookings one phone number may hold (more: call the salon). */
export const MAX_UPCOMING_PER_PHONE = 3;
/** No-shows in the last 12 months after which a number books by phone only. */
export const MAX_NO_SHOWS = 2;
/** Most online bookings from one internet connection per hour. */
export const MAX_PER_HOUR_PER_CONNECTION = 6;

type Booked = {
  ok: true;
  reference: string;
  price: number;
  minutes: number;
  services: { name: string; price: number; minutes: number }[];
  staffId: string | null;
  staffName: string | null;
};

/**
 * Checks an online guest's booking before it's made:
 *  • the same booking sent twice (double tap, retry after a dropped
 *    connection) within 15 minutes returns the booking already made;
 *  • a different booking overlapping one of their own is refused;
 *  • at most MAX_UPCOMING_PER_PHONE upcoming bookings per phone number;
 *  • at most MAX_PER_HOUR_PER_CONNECTION bookings an hour from one connection.
 * Returns the response to send, or null to carry on.
 */
async function guestGuard(sb: Sb, b: NewBooking, minutes: number): Promise<Booked | { ok: false; error: string } | null> {
  const phone = last10(b.customer.phone);
  const now = new Date(Date.now() + 330 * 60_000);
  const today = now.toISOString().slice(0, 10);
  const { data: rows } = await sb
    .from("bookings")
    .select("*")
    .gte("date", today)
    .neq("status", "cancelled")
    .ilike("customer->>phone" as never, `%${phone.slice(-4)}%`);
  const mine = ((rows ?? []) as Record<string, unknown>[]).filter((r) => {
    const st = ((r["meta"] as Record<string, unknown> | null)?.["status"] as string) ?? "";
    return last10(((r["customer"] as { phone?: string }) ?? {}).phone ?? "") === phone && !["cancelled", "no-show", "completed"].includes(st);
  });
  const sameIds = (r: Record<string, unknown>) =>
    [...((r["service_ids"] as string[]) ?? [])].sort().join(",") === [...b.serviceIds].sort().join(",");
  for (const r of mine) {
    if (r["date"] !== b.date) continue;
    const start = r["time"] as number;
    const end = (r["ends_at_minute"] as number | null) ?? start + ((r["duration_minutes"] as number | null) ?? 30);
    if (start === b.time && sameIds(r) && Date.now() - Date.parse(r["created_at"] as string) < 15 * 60_000) {
      // the same booking again: answer with the one already made
      const snap = (r["services_snapshot"] as { name: string; price: number; minutes?: number }[] | null) ?? [];
      return {
        ok: true,
        reference: r["reference"] as string,
        price: (r["price_total"] as number | null) ?? snap.reduce((n, x) => n + x.price, 0),
        minutes: (r["duration_minutes"] as number | null) ?? minutes,
        services: snap.map((x) => ({ name: x.name, price: x.price, minutes: x.minutes ?? 30 })),
        staffId: (r["staff_id"] as string | null) ?? ((r["meta"] as Record<string, unknown> | null)?.["staff_id"] as string | null) ?? null,
        staffName: ((r["meta"] as Record<string, unknown> | null)?.["staff_name"] as string | null) ?? null,
      };
    }
    if (start < b.time + minutes && b.time < end)
      return {
        ok: false,
        error: `You already have a booking at this time (${r["reference"] as string}). Change it in Manage booking, or call us.`,
      };
  }
  // repeat no-shows book by calling the salon (who can still book them in)
  {
    const since = new Date(now.getTime() - 365 * 86_400_000).toISOString().slice(0, 10);
    const { data: past } = await sb
      .from("bookings")
      .select("customer, meta")
      .gte("date", since)
      .lt("date", today)
      .ilike("customer->>phone" as never, `%${phone.slice(-4)}%`)
      .limit(500);
    const noShows = ((past ?? []) as Record<string, unknown>[]).filter(
      (r) =>
        last10(((r["customer"] as { phone?: string }) ?? {}).phone ?? "") === phone &&
        (r["meta"] as Record<string, unknown> | null)?.["status"] === "no-show",
    ).length;
    if (noShows >= MAX_NO_SHOWS)
      return {
        ok: false,
        error: "We couldn't book this online. Please call us and we'll find you a time.",
      };
  }
  if (mine.length >= MAX_UPCOMING_PER_PHONE)
    return {
      ok: false,
      error: `You already have ${mine.length} upcoming bookings. Please call us to book more.`,
    };
  const ip = (b.meta?.["ip"] as string | undefined) ?? "";
  if (ip) {
    const since = new Date(Date.now() - 3_600_000).toISOString();
    const { data: recent } = await sb
      .from("bookings")
      .select("reference")
      .eq("meta->>ip" as never, ip)
      .gte("created_at", since);
    if ((recent ?? []).length >= MAX_PER_HOUR_PER_CONNECTION)
      return { ok: false, error: "Too many bookings from this connection. Please try again later, or call us." };
  }
  return null;
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
