// The booking engine: one pure function that decides which start times are
// bookable on a day. The server uses it to validate every booking and to
// answer availability requests, so the customer screens and the database
// can never disagree. No I/O here, which makes it easy to test.

export type Range = { start: number; end: number; label?: string };

export type DayPlan = {
  closed: boolean;
  open: number; // minutes from midnight (salon time, Asia/Kolkata)
  close: number;
  breaks: Range[]; // weekly + one-day breaks
  blocks: Range[]; // blocked periods set by the salon
  note?: string;
};

/** "closing" is no longer produced (services may run past closing); kept for older callers. */
export type SlotReason = "booked" | "break" | "blocked" | "past" | "closing" | "notice";

export type Slot = { minute: number; available: boolean; reason: SlotReason | null };

export type AvailabilityInput = {
  plan: DayPlan;
  /** Grid spacing for start times (15, 30, 45 or 60). */
  interval: number;
  /** Service time the guest needs (sum of selected services). */
  duration: number;
  /** Extra minutes held after the service (buffer). */
  buffer: number;
  /** Existing active bookings as occupied ranges (already including their buffers). */
  busy: Range[];
  /** Current salon-time minute when the day is today, otherwise null. */
  now: number | null;
  /** Minimum notice before a same-day start, in minutes. */
  notice: number;
};

const overlaps = (a: Range, s: number, e: number) => s < a.end && a.start < e;

/** Every start time on the grid between opening and closing, with a reason when unavailable. */
export function computeSlots(i: AvailabilityInput): Slot[] {
  const { plan } = i;
  if (plan.closed || plan.close <= plan.open || i.interval <= 0) return [];
  const out: Slot[] = [];
  const need = Math.max(1, i.duration);
  for (let m = plan.open; m < plan.close; m += i.interval) {
    // Any start before closing is offered: a longer service may finish after
    // closing (the salon's choice). Breaks are still fully protected.
    const serviceEnd = m + need;
    const heldEnd = serviceEnd + Math.max(0, i.buffer);
    let reason: SlotReason | null = null;
    if (i.now != null && m < i.now) reason = "past";
    else if (i.now != null && m < i.now + i.notice) reason = "notice";
    else if (plan.breaks.some((b) => overlaps(b, m, serviceEnd))) reason = "break";
    else if (plan.blocks.some((b) => overlaps(b, m, heldEnd))) reason = "blocked";
    else if (i.busy.some((b) => overlaps(b, m, heldEnd))) reason = "booked";
    out.push({ minute: m, available: reason === null, reason });
  }
  return out;
}

/** True when `minute` is a bookable start for this request. */
export function isBookable(i: AvailabilityInput, minute: number) {
  return computeSlots(i).some((s) => s.minute === minute && s.available);
}

/** Times that fall entirely inside a break are hidden from guests (shown as a divider instead). */
export const insideBreak = (plan: DayPlan, minute: number) =>
  plan.breaks.some((b) => minute >= b.start && minute < b.end);

/* ── Multi-stylist availability ─────────────────────────────────────────
 * A time is bookable when the salon is open AND at least one eligible
 * stylist (or the chosen stylist) is free for the WHOLE service: working,
 * not on a break, not blocked, and with no overlapping appointment. One
 * stylist being booked never blocks the others. */

export type StaffDay = {
  id: string;
  name: string;
  /** Working window that day (stylists not working that day are left out). */
  start: number;
  end: number;
  breaks: Range[]; // their breaks (lunch etc.)
  blocks: Range[]; // temporary unavailability
  busy: Range[]; // their active appointments (incl. buffers)
};

export type StaffSlot = Slot & { staff: string[] };

export type StaffAvailabilityInput = Omit<AvailabilityInput, "busy"> & {
  /** Eligible stylists for the chosen services who work that day. */
  staff: StaffDay[];
  /** "any" or a stylist id (only that stylist is considered). */
  choice: "any" | string;
  /** A service may start before the stylist's day ends and run past it. */
  allowOverrun?: boolean;
};

/** Why one stylist can't take a start time (null = free for the whole service). */
export function staffReason(
  s: StaffDay,
  m: number,
  serviceEnd: number,
  heldEnd: number,
  allowOverrun: boolean,
): SlotReason | null {
  if (m < s.start || m >= s.end || (!allowOverrun && serviceEnd > s.end)) return "closing";
  if (s.breaks.some((b) => overlaps(b, m, serviceEnd))) return "break";
  if (s.blocks.some((b) => overlaps(b, m, heldEnd))) return "blocked";
  if (s.busy.some((b) => overlaps(b, m, heldEnd))) return "booked";
  return null;
}

export function computeStaffSlots(i: StaffAvailabilityInput): StaffSlot[] {
  const { plan } = i;
  if (plan.closed || plan.close <= plan.open || i.interval <= 0) return [];
  const allowOverrun = i.allowOverrun ?? true;
  const pool = i.choice === "any" ? i.staff : i.staff.filter((s) => s.id === i.choice);
  const out: StaffSlot[] = [];
  const need = Math.max(1, i.duration);
  for (let m = plan.open; m < plan.close; m += i.interval) {
    const serviceEnd = m + need;
    const heldEnd = serviceEnd + Math.max(0, i.buffer);
    let reason: SlotReason | null = null;
    // salon-wide first: these block every stylist
    if (i.now != null && m < i.now) reason = "past";
    else if (i.now != null && m < i.now + i.notice) reason = "notice";
    else if (plan.breaks.some((b) => overlaps(b, m, serviceEnd))) reason = "break";
    else if (plan.blocks.some((b) => overlaps(b, m, heldEnd))) reason = "blocked";
    else if (!allowOverrun && serviceEnd > plan.close) reason = "closing";
    if (reason) {
      out.push({ minute: m, available: false, reason, staff: [] });
      continue;
    }
    const free: string[] = [];
    const why: SlotReason[] = [];
    for (const s of pool) {
      const r = staffReason(s, m, serviceEnd, heldEnd, allowOverrun);
      if (r === null) free.push(s.id);
      else why.push(r);
    }
    if (free.length) out.push({ minute: m, available: true, reason: null, staff: free });
    else {
      // the most useful explanation: booked > break > blocked > not working
      const r = (["booked", "break", "blocked", "closing"] as const).find((x) => why.includes(x)) ?? "closing";
      out.push({ minute: m, available: false, reason: pool.length ? r : "closing", staff: [] });
    }
  }
  return out;
}
