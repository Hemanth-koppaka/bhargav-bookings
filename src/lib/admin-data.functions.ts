import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { staffChoiceOf, staffIdOf } from "./booking-staff";

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
  /** Assigned stylist (multi-stylist salons). */
  staffId: string | null;
  staffName: string;
  staffChosen: boolean;
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
    staffId: staffIdOf(r),
    staffName: (staffIdOf(r) ? staffNames.get(staffIdOf(r)!) : undefined) ?? "",
    staffChosen: staffChoiceOf(r) === "specific",
  };
}

/** Stylist names, refreshed by lookup() for each request. */
const staffNames = new Map<string, string>();

async function lookup() {
  const { findService } = await import("./salon");
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  void supabaseAdmin;
  const { stable } = await import("./staff-store.server");
  const { data: st, error } = await stable("staff").select("id, name");
  if (!error) for (const r of (st ?? []) as { id: string; name: string }[]) staffNames.set(r.id, r.name);
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
    // messaging health: provider connected? any messages that didn't go out today?
    const N = await import("./notify/service.server");
    const ns = await N.loadSettings();
    if (ns) {
      const { getProvider } = await import("./notify/provider.server");
      const st = (await getProvider(ns.provider)).status(ns.providerConfig);
      if (!st.connected) alerts.push({ level: "info", text: "WhatsApp/SMS not connected yet — booking messages are recorded but not sent.", to: "/admin/notifications" });
      const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
      const { data: bad } = await sb.from("notification_logs" as never).select("id").eq("status", "failed").gte("created_at", since).neq("recipient_type", "test");
      const failedCount = (bad ?? []).length;
      if (st.connected && failedCount) alerts.push({ level: "warn", text: `${failedCount} booking message${failedCount > 1 ? "s" : ""} failed in the last 24 hours.`, to: "/admin/notifications" });
    }

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
    // every active stylist's day (hours, breaks, blocks), for the calendar columns
    const team = await E.staffDay(data.date, [], { staffMode: true });
    return {
      date: data.date,
      plan,
      interval: rules.slotInterval,
      now: E.salonNow(),
      team: team
        ? team.eligible.map((st) => {
            const w = team.working.find((x) => x.id === st.id);
            return {
              id: st.id,
              name: st.name,
              working: Boolean(w),
              start: w?.start ?? null,
              end: w?.end ?? null,
              breaks: w?.breaks ?? [],
              blocks: w?.blocks ?? [],
            };
          })
        : null,
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
        /** a stylist id, or "any" */
        staffId: z.string().max(40).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const sb = await admin(data.pin);
    const E = await engine();
    const rules = await E.loadRules();
    let q: { minutes: number; buffer: number } = E.quote(data.audience, data.serviceIds) ?? { minutes: 30, buffer: 0 };
    let choice = data.staffId ?? "any";
    if (data.reference) {
      const { data: r } = await sb.from("bookings").select("*").eq("reference", data.reference).maybeSingle();
      if (r) {
        const row = r as Row;
        q = { minutes: (row["duration_minutes"] as number | null) ?? (row["slots"] as number) * 30, buffer: (row["buffer_minutes"] as number | null) ?? 0 };
        if (!data.staffId) choice = staffChoiceOf(row) === "specific" && staffIdOf(row) ? staffIdOf(row)! : "any";
      }
    }
    return E.availability(data.date, q, rules, {
      staff: true,
      serviceIds: data.serviceIds,
      choice,
      ...(data.reference ? { ignoreReference: data.reference } : {}),
    });
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

/* ── reports & exports (Phase 4) ───────────────────────────── */

const reportShape = (b: AdminBooking) => ({
  reference: b.reference,
  date: b.date,
  time: b.time,
  minutes: b.minutes,
  status: b.status,
  price: b.price,
  amountPaid: b.amountPaid,
  source: b.source,
  customerId: b.customerId,
  phone: b.customer.phone,
  services: b.services,
});

export const adminAnalytics = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ pin, from: isoDate, to: isoDate }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin(data.pin);
    const L = await lookup();
    const { buildReport, daysBetween } = await import("./analytics");
    if (data.to < data.from) throw new Error("Invalid range");
    const span = Math.min(daysBetween(data.from, data.to) + 1, 400);
    const prevTo = addDays(data.from, -1);
    const prevFrom = addDays(data.from, -span);
    const fetchRange = async (from: string, to: string) => {
      const { data: rows } = await sb.from("bookings").select("*").gte("date", from).lte("date", to).limit(10000);
      return ((rows ?? []) as Row[]).map((r) => reportShape(toAdmin(r, L)));
    };
    const [current, previous] = await Promise.all([fetchRange(data.from, data.to), fetchRange(prevFrom, prevTo)]);
    // who had visited before this period (for "returning customers")
    const { data: earlier } = await sb.from("bookings").select("*").lt("date", data.from).neq("status", "cancelled").limit(20000);
    const seenBefore = new Set<string>();
    for (const r of (earlier ?? []) as unknown as Row[]) {
      if (r["customer_id"]) seenBefore.add(r["customer_id"] as string);
      const p = ((r["customer"] as { phone?: string } | null)?.phone ?? "").replace(/\D/g, "").slice(-10);
      if (p) seenBefore.add(p);
    }
    return buildReport(current, { from: data.from, to: data.to, seenBefore, previous });
  });

/** CSV downloads for the salon's own records (admin only). */
export const adminExportCsv = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ pin, kind: z.enum(["bookings", "customers"]), from: isoDate.optional(), to: isoDate.optional() }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin(data.pin);
    const { toCsv } = await import("./analytics");
    const E = await engine();
    const stamp = E.salonNow().iso;
    const L = await lookup();
    if (data.kind === "bookings") {
      let q = sb.from("bookings").select("*").order("date").order("time");
      if (data.from) q = q.gte("date", data.from);
      if (data.to) q = q.lte("date", data.to);
      const { data: rows } = await q.limit(20000);
      const list = ((rows ?? []) as Row[]).map((r) => toAdmin(r, L));
      const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      const csv = toCsv([
        ["Booking ID", "Date", "Start", "End", "Minutes", "Status", "Customer", "Phone", "Email", "Services", "Price", "Paid", "Payment", "Source", "Booked at", "Cancel reason", "Internal note"],
        ...list.map((b) => [b.reference, b.date, hhmm(b.time), hhmm(b.end), b.minutes, b.status, b.customer.name, b.customer.phone, b.customer.email, b.services.map((s) => s.name).join("; "), b.price, b.amountPaid ?? "", b.payment, b.source, b.createdAt, b.cancelReason, b.note]),
      ]);
      await E.audit({ action: "export.bookings", entity: "export", summary: `Exported ${list.length} bookings${data.from ? ` from ${data.from}` : ""}${data.to ? ` to ${data.to}` : ""}` });
      return { filename: `hair-by-bhargav-bookings-${stamp}.csv`, csv, rows: list.length };
    }
    const { data: cust, error } = await sb.from("customers" as never).select("*").is("archived_at", null).order("name").limit(20000);
    if (error) return { filename: "", csv: "", rows: 0 };
    const ids = ((cust ?? []) as Row[]).map((c) => c["id"] as string);
    const { data: bk } = ids.length ? await sb.from("bookings").select("*").not("customer_id" as never, "is", null).limit(50000) : { data: [] };
    const by = new Map<string, AdminBooking[]>();
    for (const r of (bk ?? []) as Row[]) {
      const b = toAdmin(r, L);
      if (b.customerId) by.set(b.customerId, [...(by.get(b.customerId) ?? []), b]);
    }
    const rows = ((cust ?? []) as Row[]).map((c) => summarise(c, by.get(c["id"] as string) ?? []));
    const csv = toCsv([
      ["Name", "Phone", "Email", "Visits", "No-shows", "Cancelled", "Total spent", "First visit", "Last visit", "Usual service", "Booking messages", "Customer since", "Notes"],
      ...rows.map((c, i) => [c.name, c.phone, c.email, c.completed, c.noShows, c.cancelled, c.spend, c.firstVisit ?? "", c.lastVisit ?? "", c.favourite ?? "", ((cust as Row[])[i]?.["notify_consent"] ? "yes" : "no"), c.createdAt.slice(0, 10), c.notes]),
    ]);
    await E.audit({ action: "export.customers", entity: "export", summary: `Exported ${rows.length} customers` });
    return { filename: `hair-by-bhargav-customers-${stamp}.csv`, csv, rows: rows.length };
  });
