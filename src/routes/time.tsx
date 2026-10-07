import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Page, Screen, ScreenHeader, StickyBar, PrimaryAction } from "@/components/screen";
import { useBooking } from "@/lib/booking-store";
import { getBusySlots } from "@/lib/salon.functions";
import {
  availableSlots,
  calendarDays,
  formatDuration,
  formatLongDate,
  minuteLabel,
} from "@/lib/salon";

export const Route = createFileRoute("/time")({
  head: () => ({
    meta: [
      { title: "Pick a date and time — Hair by Bhargav" },
      {
        name: "description",
        content:
          "Choose from genuinely free 30-minute slots at Hair by Bhargav, open Wednesday to Monday, 10:00 AM to 8:00 PM.",
      },
      { property: "og:title", content: "Pick a date and time — Hair by Bhargav" },
      { property: "og:description", content: "Only genuinely free 30-minute slots are shown." },
    ],
  }),
  component: TimeScreen,
});

function TimeScreen() {
  const { draft, hydrated, update, totalSlots, selected } = useBooking();
  const navigate = useNavigate();
  const [now] = useState(() => new Date());

  useEffect(() => {
    if (hydrated && selected.length === 0) navigate({ to: "/book" });
  }, [hydrated, selected.length, navigate]);

  const dayRow = useRef<HTMLDivElement>(null);
  useEffect(() => {
    dayRow.current
      ?.querySelector<HTMLElement>('[aria-pressed="true"]')
      ?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [draft.date, hydrated]);

  const days = useMemo(() => calendarDays(56, now), [now]);
  const [busy, setBusy] = useState<{ time: number; slots: number }[]>([]);
  useEffect(() => {
    if (!draft.date) return;
    let live = true;
    setBusy([]);
    getBusySlots({ data: { date: draft.date } })
      .then((r) => live && setBusy(r.busy))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [draft.date]);
  const slots = useMemo(
    () => (draft.date ? availableSlots(draft.date, totalSlots, now, busy) : []),
    [draft.date, totalSlots, now, busy],
  );

  return (
    <Page>
      <ScreenHeader back="/services" title="Step 3 of 5" step={formatDuration(totalSlots)} />
      <Screen>
        <h1 className="mt-2 font-display text-4xl leading-tight sm:text-5xl">
          When suits <span className="italic">you?</span>
        </h1>
        <p className="mt-3 text-sm text-muted-foreground">
          We're closed on Tuesdays. Slots run 10:00 AM to 8:00 PM.
        </p>

        <div ref={dayRow} aria-label="Choose a date" className="-mx-6 mt-8 overflow-x-auto overscroll-x-contain scroll-px-6 px-6 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex w-max gap-2">
            {days.map((d) => {
              const on = draft.date === d.iso;
              return (
                <button
                  key={d.iso}
                  disabled={!d.selectable}
                  aria-pressed={on}
                  aria-label={d.date.toDateString() + (d.selectable ? "" : " (closed)")}
                  onClick={() => update({ date: d.iso, time: null })}
                  className={
                    "flex w-[3.75rem] shrink-0 flex-col items-center border py-3 transition-colors duration-200 " +
                    (on
                      ? "border-foreground bg-foreground text-background"
                      : d.selectable
                        ? "border-foreground/15 hover:border-foreground/45"
                        : "border-transparent text-foreground/25 line-through")
                  }
                >
                  <span className="text-[0.62rem] tracking-[0.16em] uppercase">
                    {d.date.toLocaleDateString("en-GB", { weekday: "short" })}
                  </span>
                  <span className="mt-1.5 font-display text-2xl leading-none">
                    {d.date.getDate()}
                  </span>
                  <span className="mt-1 text-[0.6rem] tracking-[0.16em] uppercase">
                    {d.date.toLocaleDateString("en-GB", { month: "short" })}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {draft.date ? (
          <div className="mt-10">
            <div className="eyebrow">{formatLongDate(draft.date)}</div>
            <div className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5">
              {slots.map((s) => {
                const on = draft.time === s.minute;
                return (
                  <button
                    key={s.minute}
                    disabled={!s.available}
                    aria-pressed={on}
                    onClick={() => update({ time: s.minute })}
                    className={
                      "min-h-12 whitespace-nowrap border px-1 py-3 text-[0.78rem] tracking-[0.08em] transition-colors duration-200 " +
                      (on
                        ? "border-foreground bg-foreground text-background"
                        : s.available
                          ? "border-foreground/15 hover:border-foreground/45"
                          : "border-transparent text-foreground/22 line-through")
                    }
                  >
                    {minuteLabel(s.minute)}
                  </button>
                );
              })}
            </div>
            {slots.every((s) => !s.available) ? (
              <p className="mt-6 text-sm text-muted-foreground">
                No slots left on this day. Please try another date.
              </p>
            ) : null}
          </div>
        ) : (
          <p className="mt-10 text-sm text-muted-foreground">Select a date to see free slots.</p>
        )}
      </Screen>

      <StickyBar>
        <PrimaryAction
          disabled={!draft.date || draft.time == null}
          onClick={() => navigate({ to: "/details" })}
        >
          Your details
        </PrimaryAction>
      </StickyBar>
    </Page>
  );
}
