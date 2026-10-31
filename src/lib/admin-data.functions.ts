import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Read side of the admin console: everything is queried on demand (by day,
// range or page) instead of downloading the whole booking history. Every call
// needs an admin session (`pin` carries the session token).

const pin = z.string().max(512);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

async function admin(token: string) {
  const { assertAdmin } = await import("./admin-auth.server");
  return assertAdmin(token);
}

async function engine() {
  const { applyConfig } = await import("./salon");
  const { loadConfig } = await import("./config.server");
  applyConfig((await loadConfig()) as never);
  return import("./engine.server");
}

export type AdminStatus = "pending" | "upcoming" | "arrived" | "in-chair" | "completed" | "no-show" | "cancelled";

export type AdminBooking = {
  reference: string;
  bookingNo: number | null;
  date: string;
  time: number;
  end: number;
  minutes: number;
  status: AdminStatus;
  audience: "men" | "women";
  serviceIds: string[];
  services: { id: string; name: string; price: number; minutes: number }[];
  price: number;
  amountPaid: number | null;
  payment: string;
  customerId: string | null;
  customer: { name: string; phone: string; email: string; notes: string; photos: number };
  note: string;
  source: string;
  createdAt: string;
  cancelReason: string;
  history: { at: string; by: string; action: string; from?: { date: string; time: number }; to?: { date: string; time: number }; reason?: string }[];
};

type Row = Record<string, unknown>;

/** Normalises a raw booking row for the console (snapshots win over today's menu). */
function toAdmin(r: Row, menuLookup: (aud: string, id: string) => { name: string; price: number; minutes: number } | null): AdminBooking {
  const meta = (r["meta"] ?? {}) as Record<string, unknown>;
  const customer = (r["customer"] ?? {}) as Record<string, unknown>;
  const snapshot = (r["services_snapshot"] as { id: string; name: string; price: number; minutes?: number }[] | null) ?? [];
  const ids = (r["service_ids"] as string[] | null) ?? [];
  const services = snapshot.length
    ? snapshot.map((s) => ({ id: s.id, name: s.name, price: s.price, minutes: s.minutes ?? 30 }))
    : ids.map((id) => ({ id, ...(menuLookup(r["audience"] as string, id) ?? { name: id, price: 0, minutes: 30 }) }));
  const minutes = (r["duration_minutes"] as number | null) ?? (r["slots"] as number) * 30;
  const cancelled = r["status"] === "cancelled";
  return {
    reference: r["reference"] as string,
    bookingNo: (r["booking_no"] as number | null) ?? null,
    date: r["date"] as string,
    time: r["time"] as number,
    end: (r["ends_at_minute"] as number | null) ?? (r["time"] as number) + minutes,
    minutes,
    status: cancelled ? "cancelled" : ((meta["status"] as AdminStatus) ?? "upcoming"),
    audience: r["audience"] as "men" | "women",
    serviceIds: ids,
    services,
    price: (r["price_total"] as number | null) ?? services.reduce((n, s) => n + s.price, 0),
    amountPaid: (meta["amount"] as number | null) ?? null,
    payment: (meta["payment"] as string) ?? "unpaid",
    customerId: (r["customer_id"] as string | null) ?? null,
    customer: {
      name: (customer["name"] as string) ?? "",
      phone: (customer["phone"] as string) ?? "",
      email: (customer["email"] as string) ?? "",
      notes: (customer["notes"] as string) ?? "",
      photos: ((customer["photos"] as string[] | undefined) ?? []).length,
    },
    note: (meta["note"] as string) ?? "",
    source: (r["source"] as string) ?? "online",
    createdAt: r["created_at"] as string,
    cancelReason: (r["cancel_reason"] as string) ?? "",
    history: (r["history"] as AdminBooking["history"]) ?? [],
  };
}

async function lookup() {
  const { findService } = await import("./salon");
  return (aud: string, id: string) => {
    const s = findService(aud as "men" | "women", id);
    return s ? { name: s.name, price: s.price, minutes: s.minutes } : null;
  };
}

const active = (b: AdminBooking) => b.status !== "cancelled" && b.status !== "no-show";
const revenueOf = (b: AdminBooking) => (b.status === "completed" ? (b.amountPaid ?? b.price) : 0);

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/* ── dashboard ─────────────────────────────────────────────── */

export const adminDashboard = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ pin }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin(data.pin);
    const E = await engine();
    const L = await lookup();
    const now = E.salonNow();
    const today = now.iso;
    const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
    const weekStart = addDays(today, -((dow + 6) % 7));
    const monthStart = `${today.slice(0, 8)}01`;
    const from = weekStart < monthStart ? weekStart : monthStart;

    const { data: rows } = await sb.from("bookings").select("*").gte("date", from).lte("date", addDays(today, 7)).order("date").order("time");
    const all = (rows ?? []).map((r) => toAdmin(r as Row, L));
    const todays = all.filter((b) => b.date === today);
    const sum = (list: AdminBooking[]) => list.reduce((n, b) => n + revenueOf(b), 0);
    const plan = await E.dayPlan(today);
    const rules = await E.loadRules();

    // alerts that need a decision
    const alerts: { level: "info" | "warn"; text: string; to?: string }[] = [];
    if (!rules.accepting) alerts.push({ level: "warn", text: "Online bookings are paused.", to: "/admin/settings" });
    const pending = all.filter((b) => b.status === "pending" && b.date >= today).length;
    if (pending) alerts.push({ level: "warn", text: `${pending} booking${pending > 1 ? "s" : ""} waiting for confirmation.`, to: "/admin/appointments" });
    const overlapping = todays.filter(active).some((a, i, list) => list.some((b, j) => j > i && a.time < b.end && b.time < a.end));
    if (overlapping) alerts.push({ level: "warn", text: "Two of today's appointments overlap.", to: "/admin/calendar" });
    const tomorrow = all.filter((b) => b.date === addDays(today, 1) && active(b)).length;
    if (tomorrow) alerts.push({ level: "info", text: `Tomorrow has ${tomorrow} booking${tomorrow > 1 ? "s" : ""}.`, to: "/admin/calendar" });
    alerts.push({ level: "info", text: "No message provider connected; guests aren't notified automatically yet." });

    const live = todays.filter((b) => ["pending", "upcoming", "arrived", "in-chair"].includes(b.status));
    return {
      today,
      nowMinute: now.minute,
      plan,
      interval: rules.slotInterval,
      accepting: rules.accepting,
      bookings: todays,
      next: live.find((b) => b.end > now.minute) ?? null,
      counts: {
        total: todays.filter((b) => b.status !== "cancelled").length,
        completed: todays.filter((b) => b.status === "completed").length,
        upcoming: live.length,
        cancelled: todays.filter((b) => b.status === "cancelled").length,
        noShow: todays.filter((b) => b.status === "no-show").length,
      },
      revenue: {
        today: sum(todays),
        expectedToday: todays.filter(active).reduce((n, b) => n + (b.amountPaid ?? b.price), 0),
        week: sum(all.filter((b) => b.date >= weekStart && b.date <= today)),
        month: sum(all.filter((b) => b.date >= monthStart && b.date <= today)),
      },
      alerts,
    };
  });

/* ── calendar ──────────────────────────────────────────────── */

/** One day: schedule, breaks, blocks and bookings (for the day timeline). */
export const adminDay = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ pin, date: isoDate }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin(data.pin);
    const E = await engine();
    const L = await lookup();
    const [{ data: rows }, plan, rules, blocks] = await Promise.all([
      sb.from("bookings").select("*").eq("date", data.date).order("time"),
      E.dayPlan(data.date),
      E.loadRules(),
      sb.from("time_blocks" as never).select("*").eq("date", data.date).is("archived_at", null),
    ]);
    return {
      date: data.date,
      plan,
      interval: rules.slotInterval,
      now: E.salonNow(),
      bookings: (rows ?? []).map((r) => toAdmin(r as Row, L)),
      blocks: ((blocks.error ? [] : blocks.data) as Row[]).map((b) => ({
        id: b["id"] as string,
        start: b["start_minute"] as number,
        end: b["end_minute"] as number,
        kind: b["kind"] as string,
        reason: b["reason"] as string,
      })),
    };
  });

/** A range of days (week/month views): bookings plus which days are closed. */
export const adminRange = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ pin, from: isoDate, to: isoDate }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin(data.pin);
    const E = await engine();
    const L = await lookup();
    const { isClosed } = await import("./salon");
    const { data: rows } = await sb.from("bookings").select("*").gte("date", data.from).lte("date", data.to).order("date").order("time");
    const days: { date: string; closed: boolean }[] = [];
    for (let d = data.from; d <= data.to && days.length < 45; d = addDays(d, 1)) days.push({ date: d, closed: isClosed(d) });
    return { days, today: E.salonNow().iso, bookings: (rows ?? []).map((r) => toAdmin(r as Row, L)) };
  });

/* ── bookings ──────────────────────────────────────────────── */

const PAGE = 40;

export const adminBookings = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        pin,
        from: isoDate.optional(),
        to: isoDate.optional(),
        status: z.string().max(20).optional(),
        source: z.string().max(20).optional(),
        q: z.string().max(80).optional(),
        page: z.number().int().min(0).max(1000).default(0),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const sb = await admin(data.pin);
    const L = await lookup();
    let q = sb.from("bookings").select("*").order("date", { ascending: false }).order("time", { ascending: false });
    if (data.from) q = q.gte("date", data.from);
    if (data.to) q = q.lte("date", data.to);
    if (data.source) q = q.eq("source", data.source);
    if (data.status === "cancelled") q = q.eq("status", "cancelled");
    else if (data.status) q = q.neq("status", "cancelled");
    const term = data.q?.trim();
    if (term) {
      const t = term.replace(/[%_,()]/g, "");
      const digits = t.replace(/\D/g, "");
      q = q.or(
        [
          `reference.ilike.%${t}%`,
          `customer->>name.ilike.%${t}%`,
          ...(digits.length >= 4 ? [`customer->>phone.ilike.%${digits.slice(-10)}%`] : []),
        ].join(","),
      );
    }
    // status lives partly in meta; filter after fetching a page window
    const { data: rows, error } = await q.range(data.page * PAGE, data.page * PAGE + PAGE - 1);
    if (error) throw new Error("Couldn't load bookings");
    let list = (rows ?? []).map((r) => toAdmin(r as Row, L));
    if (data.status && data.status !== "cancelled") list = list.filter((b) => b.status === data.status);
    return { bookings: list, more: (rows ?? []).length === PAGE };
  });

export const adminBooking = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ pin, reference: z.string().max(20) }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin(data.pin);
    const L = await lookup();
    const { data: r } = await sb.from("bookings").select("*").eq("reference", data.reference).maybeSingle();
    if (!r) return { booking: null, customerNotes: "", activity: [] as { at: string; summary: string }[] };
    const b = toAdmin(r as Row, L);
    let customerNotes = "";
    if (b.customerId) {
      const { data: c } = await sb.from("customers" as never).select("notes").eq("id", b.customerId).maybeSingle();
      customerNotes = ((c as Row | null)?.["notes"] as string) ?? "";
    }
    const { data: log } = await sb
      .from("audit_log" as never)
      .select("at, summary")
      .eq("entity", "booking")
      .eq("entity_id", data.reference)
      .order("at", { ascending: false })
      .limit(20);
    return { booking: b, customerNotes, activity: ((log ?? []) as { at: string; summary: string }[]) };
  });

/** Bookable times for a booking the salon is making or moving (no online-only limits). */
export const adminAvailability = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        pin,
        date: isoDate,
        audience: z.enum(["men", "women"]),
        serviceIds: z.array(z.string().max(80)).max(20),
        reference: z.string().max(20).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const sb = await admin(data.pin);
    const E = await engine();
    const rules = await E.loadRules();
    let q: { minutes: number; buffer: number } = E.quote(data.audience, data.serviceIds) ?? { minutes: 30, buffer: 0 };
    if (data.reference) {
      const { data: r } = await sb.from("bookings").select("*").eq("reference", data.reference).maybeSingle();
      if (r) {
        const row = r as Row;
        q = { minutes: (row["duration_minutes"] as number | null) ?? (row["slots"] as number) * 30, buffer: (row["buffer_minutes"] as number | null) ?? 0 };
      }
    }
    return E.availability(data.date, q, rules, { staff: true, ...(data.reference ? { ignoreReference: data.reference } : {}) });
  });

/* ── customers ─────────────────────────────────────────────── */

export type AdminCustomer = {
  id: string;
  name: string;
  phone: string;
  email: string;
  notes: string;
  createdAt: string;
  total: number;
  completed: number;
  cancelled: number;
  noShows: number;
  spend: number;
  firstVisit: string | null;
  lastVisit: string | null;
  favourite: string | null;
};

function summarise(c: Row, bookings: AdminBooking[]): AdminCustomer {
  const done = bookings.filter((b) => b.status === "completed");
  const counts = new Map<string, number>();
  for (const b of done) for (const s of b.services) counts.set(s.name, (counts.get(s.name) ?? 0) + 1);
  const favourite = [...counts.entries()].sort((a, z) => z[1] - a[1])[0]?.[0] ?? null;
  const dates = done.map((b) => b.date).sort();
  return {
    id: c["id"] as string,
    name: c["name"] as string,
    phone: c["phone"] as string,
    email: c["email"] as string,
    notes: c["notes"] as string,
    createdAt: c["created_at"] as string,
    total: bookings.length,
    completed: done.length,
    cancelled: bookings.filter((b) => b.status === "cancelled").length,
    noShows: bookings.filter((b) => b.status === "no-show").length,
    spend: done.reduce((n, b) => n + (b.amountPaid ?? b.price), 0),
    firstVisit: dates[0] ?? null,
    lastVisit: dates[dates.length - 1] ?? null,
    favourite,
  };
}

export const adminCustomers = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ pin, q: z.string().max(80).optional(), page: z.number().int().min(0).max(1000).default(0) }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin(data.pin);
    const L = await lookup();
    let q = sb.from("customers" as never).select("*").is("archived_at", null).order("updated_at", { ascending: false });
    const term = data.q?.trim().replace(/[%_,()]/g, "");
    if (term) {
      const digits = term.replace(/\D/g, "");
      q = q.or([`name.ilike.%${term}%`, `email.ilike.%${term}%`, ...(digits.length >= 3 ? [`phone_key.ilike.%${digits}%`] : [])].join(","));
    }
    const { data: rows, error } = await q.range(data.page * PAGE, data.page * PAGE + PAGE - 1);
    if (error) return { customers: [] as AdminCustomer[], more: false, unavailable: true };
    const list = rows as Row[];
    const ids = list.map((c) => c["id"] as string);
    const { data: bk } = ids.length ? await sb.from("bookings").select("*").in("customer_id" as never, ids as never) : { data: [] };
    const byCustomer = new Map<string, AdminBooking[]>();
    for (const r of (bk ?? []) as Row[]) {
      const b = toAdmin(r, L);
      if (!b.customerId) continue;
      byCustomer.set(b.customerId, [...(byCustomer.get(b.customerId) ?? []), b]);
    }
    return {
      customers: list.map((c) => summarise(c, byCustomer.get(c["id"] as string) ?? [])),
      more: list.length === PAGE,
      unavailable: false,
    };
  });

export const adminCustomer = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ pin, id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin(data.pin);
    const L = await lookup();
    const { data: c } = await sb.from("customers" as never).select("*").eq("id", data.id).maybeSingle();
    if (!c) return { customer: null, bookings: [] as AdminBooking[] };
    const { data: bk } = await sb
      .from("bookings")
      .select("*")
      .eq("customer_id" as never, data.id as never)
      .order("date", { ascending: false })
      .order("time", { ascending: false });
    const bookings = ((bk ?? []) as Row[]).map((r) => toAdmin(r, L));
    return { customer: summarise(c as Row, bookings), bookings };
  });

export const adminSaveCustomer = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        pin,
        id: z.string().uuid(),
        name: z.string().trim().min(1).max(100),
        phone: z.string().trim().max(20),
        email: z.string().trim().max(255),
        notes: z.string().max(2000),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const sb = await admin(data.pin);
    const { data: before } = await sb.from("customers" as never).select("*").eq("id", data.id).maybeSingle();
    const key = data.phone.replace(/\D/g, "").slice(-10);
    const { error } = await sb
      .from("customers" as never)
      .update({ name: data.name, phone: data.phone, phone_key: key, email: data.email, notes: data.notes } as never)
      .eq("id", data.id);
    if (error) {
      return { ok: false as const, error: /duplicate|unique/i.test(error.message) ? "Another client already has that phone number." : "Couldn't save. Please try again." };
    }
    const E = await import("./engine.server");
    const b = before as Row | null;
    const changed = ["name", "phone", "email", "notes"].filter((k) => b?.[k] !== (data as Record<string, unknown>)[k]);
    if (changed.length) {
      await E.audit({ action: "customer.update", entity: "customer", entityId: data.id, summary: `Updated ${data.name}: ${changed.join(", ")}`, before: b, after: { name: data.name, phone: data.phone, email: data.email } });
    }
    return { ok: true as const };
  });
