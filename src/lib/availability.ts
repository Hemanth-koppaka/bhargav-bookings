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
    // the service must finish by closing; the buffer may run past it
    const serviceEnd = m + need;
    const heldEnd = serviceEnd + Math.max(0, i.buffer);
    let reason: SlotReason | null = null;
    if (i.now != null && m < i.now) reason = "past";
    else if (i.now != null && m < i.now + i.notice) reason = "notice";
    else if (plan.breaks.some((b) => overlaps(b, m, serviceEnd))) reason = "break";
    else if (plan.blocks.some((b) => overlaps(b, m, heldEnd))) reason = "blocked";
    else if (serviceEnd > plan.close) reason = "closing";
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
