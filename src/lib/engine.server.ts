// Server-side booking engine: loads the live schedule, rules, blocks and
// bookings from the database and asks the pure engine (availability.ts)
// which times are bookable. Every customer and admin booking goes through
// here, and the database trigger is the final guard against races.
import { supabaseAdmin as sb } from "@/integrations/supabase/client.server";
import { computeSlots, type DayPlan, type Range, type Slot } from "./availability";
import { breaksFor, findService, hoursFor, isClosed, type Audience, type Service } from "./salon";

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
export async function dayPlan(date: string): Promise<DayPlan> {
  const hours = hoursFor(date);
  const weekly: Range[] = breaksFor(date).map((b) => ({
    start: b.start,
    end: b.end,
    label: "Break",
  }));
  // time_blocks arrives with the Admin OS migration; until then there are simply none
  const { data, error } = await sb
    .from("time_blocks" as never)
    .select("start_minute, end_minute, kind, reason")
    .eq("date", date)
    .is("archived_at", null);
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
  return {
    closed: isClosed(date),
    open: hours.open,
    close: hours.close,
    breaks: [...weekly, ...oneDayBreaks].sort((a, b) => a.start - b.start),
    blocks,
  };
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
    snapshot: list.map((x) => ({
      id: x.id,
      name: x.name,
      price: x.price,
      minutes: x.minutes ?? x.slots * 30,
      from: Boolean(x.from),
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
  slots: Slot[];
  bookable: boolean;
  message?: string;
};

/** Everything the time picker needs for one day. */
export async function availability(
  date: string,
  q: Pick<Quote, "minutes" | "buffer">,
  rules: BookingRules,
  options: { ignoreReference?: string; staff?: boolean } = {},
): Promise<DayAvailability> {
  const plan = await dayPlan(date);
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
  const slots = computeSlots({
    plan,
    interval: rules.slotInterval,
    duration: q.minutes,
    buffer: q.buffer,
    busy: await busyOn(date, options.ignoreReference),
    now: date === now.iso ? now.minute : null,
    notice: options.staff ? 0 : rules.minNoticeMinutes,
  });
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
  options: { ignoreReference?: string; staff?: boolean } = {},
): Promise<{ ok: true } | { ok: false; error: string }> {
  const day = await availability(date, q, rules, options);
  if (day.closed) return { ok: false, error: "The studio is closed that day." };
  if (day.message) return { ok: false, error: day.message };
  const slot = day.slots.find((s) => s.minute === time);
  if (!slot)
    return { ok: false, error: "That time is outside opening hours. Please choose another time." };
  if (!slot.available)
    return { ok: false, error: REASON_TEXT[slot.reason ?? "blocked"] ?? REASON_TEXT["blocked"]! };
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
