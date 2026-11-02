// Server-side booking engine: loads the live schedule, rules, blocks and
// bookings from the database and asks the pure engine (availability.ts)
// which times are bookable. Every customer and admin booking goes through
// here, and the database trigger is the final guard against races.
import { supabaseAdmin as sb } from "@/integrations/supabase/client.server";
import { hasPerStylistGuard, loadStore, staffIdOf } from "./staff-store.server";
import { loadRuleSettings, resolveRules } from "./service-rules.server";
import { preferredFor, type ServiceRule } from "./service-rules";
import {
  computeSlots,
  computeStaffSlots,
  type DayPlan,
  type Range,
  type Slot,
  type StaffDay,
  type StaffSlot,
} from "./availability";
import { breaksFor, findService, hoursFor, isClosed, menuFor, type Audience, type Service } from "./salon";

export type BookingRules = {
  /** Spacing of start times offered to guests. */
  slotInterval: 15 | 30 | 45 | 60;
  /** Minimum minutes between now and a same-day start. */
  minNoticeMinutes: number;
  /** How far ahead guests may book. */
  maxAdvanceDays: number;
  allowSameDay: boolean;
  allowMultiple: boolean;
  maxServices: number;
  /** Guests may cancel online until this many minutes before the start. */
  customerCancel: boolean;
  cancelDeadlineMinutes: number;
  customerReschedule: boolean;
  rescheduleDeadlineMinutes: number;
  maxReschedules: number;
  accepting: boolean;
  pauseMessage: string;
};

export const DEFAULT_RULES: BookingRules = {
  slotInterval: 30,
  minNoticeMinutes: 30,
  maxAdvanceDays: 56,
  allowSameDay: true,
  allowMultiple: true,
  maxServices: 6,
  customerCancel: true,
  cancelDeadlineMinutes: 120,
  customerReschedule: true,
  rescheduleDeadlineMinutes: 120,
  maxReschedules: 2,
  accepting: true,
  pauseMessage: "Online bookings are temporarily unavailable. Please contact the studio.",
};

/** Live booking rules (admin → Booking rules), with safe defaults. */
export async function loadRules(): Promise<BookingRules> {
  const { data } = await sb
    .from("site_settings")
    .select("key, value")
    .in("key", ["booking", "booking_rules"]);
  const get = (k: string) => (data?.find((r) => r.key === k)?.value ?? {}) as Partial<BookingRules>;
  const legacy = get("booking") as { accepting?: boolean; maxAdvanceDays?: number };
  const r = { ...DEFAULT_RULES, ...legacy, ...get("booking_rules") };
  if (![15, 30, 45, 60].includes(r.slotInterval)) r.slotInterval = 30;
  return r;
}

/** Salon "now" in Asia/Kolkata, independent of the server's clock zone. */
export function salonNow() {
  const t = new Date(Date.now() + 330 * 60_000);
  return { iso: t.toISOString().slice(0, 10), minute: t.getUTCHours() * 60 + t.getUTCMinutes() };
}

export const dayDiff = (a: string, b: string) =>
  Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);

/**
 * Opening hours, weekly and one-day breaks, closures and blocked periods for a date.
 * Expects the salon config (hours, exceptions) to be applied already (applyConfig).
 */
export async function dayPlan(date: string, store?: Awaited<ReturnType<typeof loadStore>>): Promise<DayPlan> {
  const hours = hoursFor(date);
  const weekly: Range[] = breaksFor(date).map((b) => ({
    start: b.start,
    end: b.end,
    label: "Break",
  }));
  // time_blocks arrives with the Admin OS migration; until then there are simply none
  // blocks and closures load together (one round trip, not two)
  const [{ data, error }, closure] = await Promise.all([
    sb
      .from("time_blocks" as never)
      .select("start_minute, end_minute, kind, reason")
      .eq("date", date)
      .is("archived_at", null),
    salonClosureOn(date, store),
  ]);
  const rows = (error ? [] : (data ?? [])) as {
    start_minute: number;
    end_minute: number;
    kind: string;
    reason: string;
  }[];
  const oneDayBreaks = rows
    .filter((r) => r.kind === "break")
    .map((r) => ({ start: r.start_minute, end: r.end_minute, label: r.reason || "Break" }));
  const blocks = rows
    .filter((r) => r.kind !== "break")
    .map((r) => ({ start: r.start_minute, end: r.end_minute, label: r.reason || "Blocked" }));
  // salon closures: whole days (ranges, or until reopened) or a few hours
  return {
    closed: isClosed(date) || closure.fullDay,
    open: hours.open,
    close: hours.close,
    breaks: [...weekly, ...oneDayBreaks].sort((a, b) => a.start - b.start),
    blocks: [...blocks, ...closure.hours],
    ...(closure.reason ? { note: closure.reason } : {}),
  };
}

/** Salon closures affecting a date (kept in the settings store). */
export async function salonClosureOn(date: string, store?: Awaited<ReturnType<typeof loadStore>>): Promise<{ fullDay: boolean; hours: Range[]; reason: string }> {
  const s = store ?? (await loadStore());
  const rows = (s.salon_closures as Record<string, unknown>[]).filter(
    (r) => !r["reopened_at"] && (r["start_date"] as string) <= date && (!r["end_date"] || (r["end_date"] as string) >= date),
  );
  const full = rows.find((r) => r["start_minute"] == null);
  return {
    fullDay: Boolean(full),
    hours: rows
      .filter((r) => r["start_minute"] != null)
      .map((r) => ({ start: r["start_minute"] as number, end: r["end_minute"] as number, label: (r["reason"] as string) || "Closed" })),
    reason: ((full ?? rows[0])?.["reason"] as string) ?? "",
  };
}

/* ── stylists ─────────────────────────────────────────────────── */

export type Stylist = { id: string; name: string; gender: string; order: number };

/**
 * Each eligible stylist's day: working window, breaks, temporary blocks and
 * their own appointments. Eligible = active, bookable (unless staff mode),
 * and able to do EVERY chosen service. Returns null before the staff
 * migration (the old single-chair rules then apply).
 */
export async function staffDay(
  date: string,
  serviceIds: string[],
  options: {
    ignoreReference?: string | undefined;
    staffMode?: boolean | undefined;
    store?: Awaited<ReturnType<typeof loadStore>> | undefined;
    rules?: Record<string, ServiceRule> | undefined;
  } = {},
): Promise<{ eligible: Stylist[]; working: StaffDay[]; salonBusy: Range[] } | null> {
  const [store, booked, ruleSettings] = await Promise.all([
    options.store ?? loadStore(),
    sb.from("bookings").select("*").eq("date", date).neq("status", "cancelled"),
    options.rules ? Promise.resolve(null) : loadRuleSettings(),
  ]);
  const rules = options.rules ?? resolveRules(store, ruleSettings ?? {});
  const staff = (store.staff as Record<string, unknown>[])
    .filter((r) => r["active"] !== false && !r["archived_at"])
    .sort((a, b) => ((a["display_order"] as number) ?? 0) - ((b["display_order"] as number) ?? 0));
  const all = ((staff ?? []) as Record<string, unknown>[]).filter((r) => options.staffMode || r["bookable"]);
  if (!all.length) return { eligible: [], working: [], salonBusy: [] };
  const ids = all.map((r) => r["id"] as string);
  const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
  type R0 = Record<string, unknown>;
  const svc = { data: (store.staff_services as R0[]).filter((r) => serviceIds.includes(r["service_id"] as string)) };
  const hours = { data: (store.staff_working_hours as R0[]).filter((r) => r["day_of_week"] === dow) };
  const breaks = { data: store.staff_breaks as R0[] };
  const leave = { data: (store.staff_leave as R0[]).filter((r) => !r["archived_at"] && (r["start_date"] as string) <= date && (r["end_date"] as string) >= date) };
  const unavail = { data: (store.staff_unavailability as R0[]).filter((r) => !r["archived_at"] && r["date"] === date) };
  const bookings = booked;
  type R = Record<string, unknown>;
  const can = new Map<string, Set<string>>();
  for (const r of (svc.data ?? []) as R[]) {
    const k = r["staff_id"] as string;
    if (!can.has(k)) can.set(k, new Set());
    can.get(k)!.add(r["service_id"] as string);
  }
  // a service with a preferred stylist may be done by that stylist or its fallback pool;
  // every other service by the stylists who offer it
  const may = (staffId: string, svcId: string) =>
    rules[svcId] ? rules[svcId].preferred === staffId || rules[svcId].fallback.includes(staffId) : Boolean(can.get(staffId)?.has(svcId));
  const eligible = all
    .filter((r) => serviceIds.every((id) => may(r["id"] as string, id)))
    .map((r): Stylist => ({ id: r["id"] as string, name: r["name"] as string, gender: (r["gender"] as string) || "", order: (r["display_order"] as number) ?? 0 }));
  const onLeave = new Set(((leave.data ?? []) as R[]).map((r) => r["staff_id"] as string));
  const working: StaffDay[] = [];
  for (const st of eligible) {
    if (onLeave.has(st.id)) continue;
    const h = ((hours.data ?? []) as R[]).find((r) => r["staff_id"] === st.id);
    if (!h || !h["is_working"]) continue;
    const mine = <T extends R>(rows: T[]) => rows.filter((r) => r["staff_id"] === st.id);
    working.push({
      id: st.id,
      name: st.name,
      start: h["start_minute"] as number,
      end: h["end_minute"] as number,
      breaks: mine((breaks.data ?? []) as R[])
        .filter((r) => r["day_of_week"] == null || r["day_of_week"] === dow)
        .map((r) => ({ start: r["start_minute"] as number, end: r["end_minute"] as number, label: (r["label"] as string) || "Break" })),
      blocks: mine((unavail.data ?? []) as R[]).map((r) => ({ start: r["start_minute"] as number, end: r["end_minute"] as number, label: (r["reason"] as string) || "Unavailable" })),
      busy: ((bookings.data ?? []) as R[])
        .filter((r) => staffIdOf(r) === st.id && r["reference"] !== options.ignoreReference && isLive(r))
        .map((r) => ({ start: r["time"] as number, end: (r["ends_at_minute"] as number | null) ?? (r["time"] as number) + (r["slots"] as number) * 30 })),
    });
  }
  void ids;
  // every live booking that day, whoever it's with (for the one-chair rule)
  const salonBusy: Range[] = ((bookings.data ?? []) as R[])
    .filter((r) => r["reference"] !== options.ignoreReference && isLive(r))
    .map((r) => ({ start: r["time"] as number, end: (r["ends_at_minute"] as number | null) ?? (r["time"] as number) + (r["slots"] as number) * 30 }));
  return { eligible, working, salonBusy };
}

const isLive = (r: Record<string, unknown>) => {
  const st = (r["meta"] as { status?: string } | null)?.status;
  return r["status"] !== "cancelled" && st !== "cancelled" && st !== "no-show" && !r["archived_at"];
};

/** Fair pick for "any available": the free stylist with the fewest booked minutes that day. */
export function pickStylist(free: string[], working: StaffDay[], eligible: Stylist[]): string | null {
  if (!free.length) return null;
  const load = (id: string) => (working.find((w) => w.id === id)?.busy ?? []).reduce((n, b) => n + (b.end - b.start), 0);
  const order = (id: string) => eligible.find((e) => e.id === id)?.order ?? 0;
  return [...free].sort((a, b) => load(a) - load(b) || order(a) - order(b))[0] ?? null;
}

/** Occupied ranges from active bookings on a date (each including its buffer). */
export async function busyOn(date: string, ignoreReference?: string): Promise<Range[]> {
  const { data } = await sb
    .from("bookings")
    .select("*")
    .eq("date", date)
    .neq("status", "cancelled");
  return (data ?? [])
    .filter((r) => {
      const row = r as Record<string, unknown>;
      const status = (row["meta"] as { status?: string } | null)?.status;
      return (
        r.reference !== ignoreReference &&
        status !== "cancelled" &&
        status !== "no-show" &&
        !row["archived_at"]
      );
    })
    .map((r) => {
      const row = r as Record<string, unknown>;
      const end = (row["ends_at_minute"] as number | null) ?? r.time + r.slots * 30;
      return { start: r.time, end };
    });
}

export type Quote = {
  services: Service[];
  minutes: number;
  buffer: number;
  price: number;
  priceFrom: boolean;
  snapshot: { id: string; name: string; price: number; minutes: number; from: boolean }[];
};

/** Prices and times the chosen services from the live menu (config must be applied). */
export function quote(audience: Audience, serviceIds: string[]): Quote | null {
  const services = serviceIds.map((id) => findService(audience, id));
  if (!services.length || services.some((x) => !x)) return null;
  const list = services as Service[];
  return {
    services: list,
    minutes: list.reduce((n, x) => n + (x.minutes ?? x.slots * 30), 0),
    // one cleanup after the appointment: the longest buffer among the services
    buffer: Math.max(0, ...list.map((x) => x.buffer ?? 0)),
    price: list.reduce((n, x) => n + x.price, 0),
    priceFrom: list.some((x) => x.from),
    // what was booked, as it was then: later menu edits never change history
    snapshot: list.map((x) => ({
      id: x.id,
      name: x.name,
      price: x.price,
      minutes: x.minutes ?? x.slots * 30,
      from: Boolean(x.from),
      category: menuFor(audience).find((c) => c.services.some((s) => s.id === x.id))?.title ?? "",
    })),
  };
}

export type DayAvailability = {
  date: string;
  closed: boolean;
  open: number;
  close: number;
  interval: number;
  breaks: Range[];
  slots: (Slot & { staff?: string[] })[];
  bookable: boolean;
  message?: string;
  /** Stylists who can do the chosen services (multi-stylist salons). */
  stylists?: Stylist[];
  /**
   * The chosen services prefer one stylist (e.g. Bhargav's Signature → Bhargav):
   * booked with them unless the guest explicitly picks another stylist.
   */
  preferred?: { id: string; name: string };
};

/** Everything the time picker needs for one day. */
export async function availability(
  date: string,
  q: Pick<Quote, "minutes" | "buffer">,
  rulesIn: BookingRules | Promise<BookingRules>,
  options: {
    ignoreReference?: string;
    staff?: boolean;
    /** Chosen services: enables per-stylist availability. */
    serviceIds?: string[];
    /** "any" (default) or a stylist id. */
    choice?: string;
  } = {},
): Promise<DayAvailability> {
  // one read of the stylist store, then everything else in parallel
  const [store, rules, ruleSettings] = await Promise.all([loadStore(), rulesIn, loadRuleSettings()]);
  const svcRules = resolveRules(store, ruleSettings);
  const pref = preferredFor(options.serviceIds ?? [], svcRules);
  const [plan, team, perStylist] = await Promise.all([
    dayPlan(date, store),
    options.serviceIds?.length
      ? staffDay(date, options.serviceIds, { ignoreReference: options.ignoreReference, staffMode: options.staff, store, rules: svcRules })
      : Promise.resolve(null),
    hasPerStylistGuard(),
  ]);
  const now = salonNow();
  const base = {
    date,
    closed: plan.closed,
    open: plan.open,
    close: plan.close,
    interval: rules.slotInterval,
    breaks: plan.breaks,
  };
  const ahead = dayDiff(now.iso, date);
  const guestLimit =
    !options.staff &&
    (!rules.accepting
      ? rules.pauseMessage
      : ahead > rules.maxAdvanceDays
        ? "That date is too far ahead to book online."
        : ahead === 0 && !rules.allowSameDay
          ? "Same-day bookings aren't available online."
          : null);
  if (date < now.iso)
    return { ...base, slots: [], bookable: false, message: "That date has passed." };
  if (guestLimit) return { ...base, slots: [], bookable: false, message: guestLimit };
  const common = {
    plan,
    interval: rules.slotInterval,
    duration: q.minutes,
    buffer: q.buffer,
    now: date === now.iso ? now.minute : null,
    notice: options.staff ? 0 : rules.minNoticeMinutes,
  };
  if (team) {
    let slots: StaffSlot[] = computeStaffSlots({ ...common, staff: team.working, choice: options.choice || "any", allowOverrun: true });
    // Until the database guards each stylist separately it accepts one appointment
    // at a time for the whole salon, so never offer a time it would refuse.
    if (!perStylist) {
      const need = q.minutes + q.buffer;
      slots = slots.map((s) =>
        s.available && team.salonBusy.some((b) => s.minute < b.end && b.start < s.minute + need)
          ? { ...s, available: false, reason: "booked", staff: [] }
          : s,
      );
    }
    const message = !team.eligible.length ? "No stylist offers this combination of services. Please book them separately." : undefined;
    const preferred = pref && team.eligible.some((s) => s.id === pref.preferred) ? { id: pref.preferred, name: pref.preferredName } : undefined;
    return { ...base, slots, bookable: slots.some((s) => s.available), stylists: team.eligible, ...(preferred ? { preferred } : {}), ...(message ? { message } : {}) };
  }
  const slots = computeSlots({ ...common, busy: await busyOn(date, options.ignoreReference) });
  return { ...base, slots, bookable: slots.some((s) => s.available) };
}

const REASON_TEXT: Record<string, string> = {
  booked: "That time was just booked. Please choose another time.",
  break: "That time overlaps the salon's break. Please choose another time.",
  blocked: "That time is no longer available. Please choose another time.",
  past: "That time has already passed. Please choose another time.",
  notice: "That time is too soon to book online. Please choose a later time.",
  closing: "There isn't enough time before closing. Please choose an earlier time.",
};

/** Checks one start time; returns a guest-friendly reason when it can't be booked. */
export async function checkTime(
  date: string,
  time: number,
  q: Pick<Quote, "minutes" | "buffer">,
  rules: BookingRules,
  options: { ignoreReference?: string; staff?: boolean; serviceIds?: string[]; choice?: string; exclude?: string[] } = {},
): Promise<{ ok: true; staffId?: string | null } | { ok: false; error: string }> {
  // A service with a preferred stylist (Bhargav's Signature → Bhargav) is booked
  // with that stylist unless the guest explicitly chose someone from its pool:
  // "any" never quietly becomes someone else.
  let implicitPreferred: ServiceRule | null = null;
  if ((!options.choice || options.choice === "any") && options.serviceIds?.length) {
    const pref = preferredFor(options.serviceIds, resolveRules(await loadStore(), await loadRuleSettings()));
    if (pref) {
      implicitPreferred = pref;
      options = { ...options, choice: pref.preferred };
    }
  }
  const day = await availability(date, q, rules, options);
  if (day.closed) return { ok: false, error: "The studio is closed that day." };
  if (day.message) return { ok: false, error: day.message };
  const slot = day.slots.find((s) => s.minute === time);
  if (!slot)
    return { ok: false, error: "That time is outside opening hours. Please choose another time." };
  if (!slot.available)
    return {
      ok: false,
      error:
        implicitPreferred && slot.reason !== "past" && slot.reason !== "notice"
          ? `${implicitPreferred.preferredName} isn't available at this time. Please choose another time, or continue with another stylist.`
          : options.choice && options.choice !== "any" && slot.reason === "booked"
          ? "That stylist is booked at this time. Please choose another time or any available stylist."
          : (REASON_TEXT[slot.reason ?? "blocked"] ?? REASON_TEXT["blocked"]!),
    };
  if (day.stylists && "staff" in slot && slot.staff) {
    const free = slot.staff.filter((id) => !options.exclude?.includes(id));
    if (!free.length) return { ok: false, error: REASON_TEXT["booked"]! };
    if (options.choice && options.choice !== "any") return { ok: true, staffId: options.choice };
    const team = await staffDay(date, options.serviceIds ?? [], { ignoreReference: options.ignoreReference, staffMode: options.staff });
    return { ok: true, staffId: team ? pickStylist(free, team.working, team.eligible) : free[0] ?? null };
  }
  return { ok: true };
}

/** True when the database refused a write because the slot was taken in the meantime. */
export const isSlotTaken = (e: { message?: string } | null | undefined) =>
  Boolean(e?.message?.includes("HB_SLOT_TAKEN"));

/* ── activity log ─────────────────────────────────────────────── */

export async function audit(entry: {
  action: string;
  entity: string;
  entityId?: string;
  summary: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
  actor?: string;
}) {
  const { error } = await sb.from("audit_log" as never).insert({
    actor: entry.actor ?? "admin",
    action: entry.action,
    entity: entry.entity,
    entity_id: entry.entityId ?? "",
    summary: entry.summary,
    before: (entry.before ?? null) as never,
    after: (entry.after ?? null) as never,
    reason: entry.reason ?? "",
  } as never);
  if (error) console.error("audit log write failed", error.message);
}
