// How long before an appointment guests can still change or cancel online,
// read from the salon's booking rules (Admin → Booking rules), as plain words.
import { useEffect, useState } from "react";
import { getPublicRules } from "./salon.functions";

let cached: number | null = null;
let pending: Promise<number> | null = null;

/** "2 hours", "1 hour", "90 minutes". */
export const deadlineWords = (min: number) =>
  min % 60 === 0 ? `${min / 60} ${min === 60 ? "hour" : "hours"}` : `${min} minutes`;

/** The online change/cancel deadline in words (defaults to 2 hours until the rules load). */
export function useChangeDeadline(): string {
  const [min, setMin] = useState<number>(cached ?? 120);
  useEffect(() => {
    if (cached != null) return;
    pending ??= getPublicRules()
      .then((r) => Math.max(r.cancelDeadlineMinutes ?? 120, r.rescheduleDeadlineMinutes ?? 120))
      .catch(() => 120);
    let live = true;
    void pending.then((m) => {
      cached = m;
      if (live) setMin(m);
    });
    return () => {
      live = false;
    };
  }, []);
  return deadlineWords(min);
}
