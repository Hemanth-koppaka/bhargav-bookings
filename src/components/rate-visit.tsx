// "How was your visit?": after a finished appointment the guest rates each
// service they had (1–5 stars), once. The salon's server checks the booking is
// theirs, finished and not yet rated, then adds the stars to each service's
// own rating (by service id, so men's and women's services stay separate).
import { useState } from "react";
import { auth, servicesOf, type Booking } from "@/lib/booking-store";
import { rateMyVisit } from "@/lib/salon.functions";
import { sfx } from "@/lib/sfx";
import { cn } from "@/lib/utils";

const RATED_KEY = (ref: string) => `hb.rated.${ref}`;

/** Ended (salon time) and not cancelled: a visit that can be rated. */
export function visitOver(b: Pick<Booking, "date" | "time" | "status">, minutes = 30) {
  if (b.status === "cancelled") return false;
  const now = new Date(Date.now() + 330 * 60_000);
  const today = now.toISOString().slice(0, 10);
  const minute = now.getUTCHours() * 60 + now.getUTCMinutes();
  return b.date < today || (b.date === today && b.time + minutes <= minute);
}

export function ratedHere(reference: string) {
  try {
    return localStorage.getItem(RATED_KEY(reference)) === "1";
  } catch {
    return false;
  }
}

/** Whether to ask this guest to rate this booking. */
export function shouldAskRating(b: Booking) {
  if (b.rateable === false || ratedHere(b.reference)) return false;
  return b.rateable === true || visitOver(b, b.snapshot?.minutes ?? 30);
}

export function RateVisit({ booking, className }: { booking: Booking; className?: string }) {
  const named = booking.snapshot?.services ?? [];
  const menu = servicesOf(booking);
  // each booked service, by its id (the name only for display)
  const items = booking.serviceIds.map((id, i) => ({
    id,
    name: named.find((s) => s.id === id)?.name ?? menu.find((s) => s.id === id)?.name ?? named[i]?.name ?? "Service",
  }));
  const [stars, setStars] = useState<Record<string, number>>({});
  const [state, setState] = useState<"ask" | "saving" | "done">(() => (shouldAskRating(booking) ? "ask" : "done"));
  const [error, setError] = useState("");
  const [thanked, setThanked] = useState(false);
  if (state === "done" && !thanked) return null;

  const submit = async () => {
    const ratings = Object.entries(stars).map(([serviceId, n]) => ({ serviceId, stars: n }));
    if (!ratings.length) return setError("Tap the stars to rate at least one service.");
    setState("saving");
    setError("");
    try {
      const r = await rateMyVisit({ data: { reference: booking.reference, ...auth(booking), ratings } });
      if (!r.ok) {
        setError(r.error);
        setState("ask");
        return;
      }
      try {
        localStorage.setItem(RATED_KEY(booking.reference), "1");
      } catch {
        /* ignore */
      }
      sfx.calendarDone();
      setThanked(true);
      setState("done");
    } catch {
      setError("Couldn't send your rating. Please try again.");
      setState("ask");
    }
  };

  return (
    <section className={cn("rounded-md border border-bronze/30 bg-champagne/15 px-5 py-5 lg:px-6", className)}>
      {thanked ? (
        <p className="font-display text-[1.3rem] leading-snug">Thank you. Your rating helps other guests choose.</p>
      ) : (
        <>
          <div className="text-[0.62rem] uppercase tracking-[0.28em] text-bronze">After your visit</div>
          <h2 className="mt-2 font-display text-[1.35rem] leading-snug">How was your visit?</h2>
          <ul className="mt-3 divide-y divide-hairline">
            {items.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span className="text-[0.95rem]">{s.name}</span>
                <span className="flex" role="radiogroup" aria-label={`Rate ${s.name}`}>
                  {[1, 2, 3, 4, 5].map((n) => {
                    const on = (stars[s.id] ?? 0) >= n;
                    return (
                      <button
                        key={n}
                        type="button"
                        role="radio"
                        aria-checked={stars[s.id] === n}
                        aria-label={`${n} ${n === 1 ? "star" : "stars"}`}
                        data-sfx="select"
                        onClick={() => setStars((x) => ({ ...x, [s.id]: n }))}
                        className={cn(
                          "press flex h-9 w-9 items-center justify-center text-[1.35rem] leading-none transition-colors",
                          on ? "text-bronze" : "text-foreground/20 hover:text-foreground/40",
                        )}
                      >
                        ★
                      </button>
                    );
                  })}
                </span>
              </li>
            ))}
          </ul>
          {error ? <p className="mt-2 text-[0.85rem] text-destructive">{error}</p> : null}
          <button
            type="button"
            onClick={() => void submit()}
            disabled={state === "saving"}
            className="press mt-4 min-h-11 w-full rounded-sm bg-foreground text-[0.7rem] uppercase tracking-[0.2em] text-background disabled:opacity-50 sm:w-auto sm:px-8"
          >
            {state === "saving" ? "Sending…" : "Send rating"}
          </button>
        </>
      )}
    </section>
  );
}
