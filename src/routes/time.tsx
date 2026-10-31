import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, Clock, Sun, Sunrise, Sunset } from "lucide-react";
import { haptic } from "@/lib/utils";
import { Page, PrimaryAction, Screen, StepHeader, StepIntro, StickyBar } from "@/components/screen";
import {
  AUDIENCE_IMAGE,
  Accent,
  DesktopBar,
  DesktopCTA,
  DesktopPage,
  DesktopStepHeader,
  ImagePanel,
  StepTitle,
  Thumb,
} from "@/components/desktop";
import portrait from "@/assets/portrait.jpg.asset.json";
import { useBooking } from "@/lib/booking-store";
import { getBusySlots } from "@/lib/salon.functions";
import {
  availableSlots,
  breaksFor,
  calendarDays,
  formatDuration,
  hoursFor,
  isClosed,
  fromISO,
  inr,
  minuteLabel,
  SLOT_MINUTES,
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
  const { draft, hydrated, totalSlots, selected } = useBooking();
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
  const selectedHours = draft.date ? hoursFor(draft.date) : null;
  const selectedBreaks = draft.date ? breaksFor(draft.date) : [];

  const breakNote = selectedBreaks.length
    ? ` · Break ${selectedBreaks.map((b) => `${minuteLabel(b.start)}–${minuteLabel(b.end)}`).join(", ")}`
    : "";

  return (
    <>
      <DesktopTime days={days} slots={slots} busy={busy} />
      <div className="lg:hidden">
        <Page>
          <StepHeader back="/services" step={3} />
          <Screen className="px-5">
            <StepIntro eyebrow="Step three" sub={`We'll reserve ${formatDuration(totalSlots)} for your visit.`}>
              Choose a <span className="italic text-bronze">time.</span>
            </StepIntro>

            <div
              ref={dayRow}
              aria-label="Choose a date"
              className="-mx-5 mt-6 overflow-x-auto overscroll-x-contain scroll-px-5 px-5 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
            >
              <DayStrip days={days} />
            </div>

            {draft.date ? (
              <div key={draft.date} className="slide-in mt-4">
                <div className="flex items-center gap-3 rounded-md bg-champagne/12 px-4 py-3">
                  <CalendarDays className="h-5 w-5 shrink-0 text-bronze" strokeWidth={1.25} />
                  <div className="min-w-0">
                    <div className="text-[0.95rem]">{longDate(draft.date)}</div>
                    <div className="text-[0.75rem] text-muted-foreground">
                      {isClosed(draft.date)
                        ? "Salon closed"
                        : selectedHours
                          ? `Open ${minuteLabel(selectedHours.open)} – ${minuteLabel(selectedHours.close)}${breakNote}`
                          : ""}
                    </div>
                  </div>
                </div>
                <SlotGroups slots={slots} busy={busy} />
                {slots.length > 0 && slots.every((x) => !x.available) ? (
                  <p className="mt-6 text-sm text-muted-foreground">No slots left on this day. Please try another date.</p>
                ) : null}
              </div>
            ) : (
              <p className="mt-8 text-sm text-muted-foreground">Select a date to see free slots.</p>
            )}
          </Screen>

          <StickyBar>
            <div className="mb-3 flex items-center justify-between gap-3 text-[0.9rem]">
              <span className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-muted-foreground" strokeWidth={1.25} />
                {draft.date ? shortDate(draft.date) : "Pick a day"}
              </span>
              <span className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" strokeWidth={1.25} />
                <span key={draft.time ?? "none"} className="tick-in">
                  {draft.time != null ? minuteLabel(draft.time) : "Pick a time"}
                </span>
              </span>
            </div>
            <PrimaryAction disabled={!draft.date || draft.time == null} onClick={() => navigate({ to: "/details" })}>
              Your details
            </PrimaryAction>
          </StickyBar>
        </Page>
      </div>
    </>
  );
}

type Slot = { minute: number; available: boolean };

const PERIODS = [
  { label: "Morning", icon: Sunrise, test: (m: number) => m < 13 * 60 },
  { label: "Afternoon", icon: Sun, test: (m: number) => m >= 13 * 60 && m < 17 * 60 },
  { label: "Evening", icon: Sunset, test: (m: number) => m >= 17 * 60 },
];

function DayStrip({ days }: { days: { iso: string; date: Date; selectable: boolean }[] }) {
  const { draft, update } = useBooking();
  return (
    <div className="flex w-max gap-2 pb-2">
      {days.map((d) => {
        const on = draft.date === d.iso;
        return (
          <button
            key={d.iso}
            disabled={!d.selectable}
            aria-pressed={on}
            aria-label={d.date.toDateString() + (d.selectable ? "" : " (closed)")}
            onClick={() => {
              haptic();
              update({ date: d.iso, time: null });
            }}
            className={
              "press flex w-[4rem] shrink-0 flex-col items-center rounded-md border py-2.5 lg:w-[4.25rem] " +
              (on
                ? "border-foreground bg-foreground text-background shadow-[0_10px_24px_-14px_color-mix(in_oklab,var(--ink)_70%,transparent)]"
                : d.selectable
                  ? "border-foreground/12 bg-card hover:border-foreground/45"
                  : "border-transparent text-foreground/25")
            }
          >
            <span className="text-[0.62rem] uppercase tracking-[0.16em]">
              {d.date.toLocaleDateString("en-GB", { weekday: "short" })}
            </span>
            <span className={"mt-1 font-display text-2xl leading-none " + (d.selectable ? "" : "line-through")}>
              {d.date.getDate()}
            </span>
            <span className="mt-1 text-[0.6rem] uppercase tracking-[0.16em]">
              {d.selectable ? d.date.toLocaleDateString("en-GB", { month: "short" }) : "Closed"}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function SlotGroups({ slots, busy }: { slots: Slot[]; busy: { time: number; slots: number }[] }) {
  const { draft, update } = useBooking();
  const booked = (m: number) =>
    busy.some((b) => m < b.time + b.slots * SLOT_MINUTES && b.time < m + SLOT_MINUTES);
  return (
    <>
      {PERIODS.map((p) => {
        const group = slots.filter((x) => p.test(x.minute));
        if (group.length === 0) return null;
        const free = group.filter((x) => x.available).length;
        return (
          <section key={p.label} className="mt-5 hairline-t pt-5">
            <div className="flex items-baseline justify-between">
              <h2 className="flex items-center gap-2.5 font-sans text-[0.72rem] font-normal uppercase tracking-[0.3em] lg:text-[0.78rem]">
                <p.icon className="h-4 w-4 text-bronze" strokeWidth={1.25} aria-hidden />
                {p.label}
              </h2>
              <span className="text-[0.78rem] text-muted-foreground lg:text-[0.85rem]">
                {free ? `${free} ${free === 1 ? "slot" : "slots"} available` : "Fully booked"}
              </span>
            </div>
            <div className="stagger mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:gap-3 xl:grid-cols-6">
              {group.map((x) => {
                const on = draft.time === x.minute;
                return (
                  <button
                    key={x.minute}
                    disabled={!x.available}
                    aria-pressed={on}
                    onClick={() => {
                      haptic();
                      update({ time: x.minute });
                    }}
                    className={
                      "press flex min-h-13 flex-col items-center justify-center rounded-md border px-1 py-2 text-[0.92rem] tabular-nums lg:min-h-14 lg:text-[1rem] " +
                      (on
                        ? "ring-pulse border-foreground bg-foreground text-background"
                        : x.available
                          ? "border-foreground/12 bg-card hover:border-foreground/50"
                          : "border-transparent bg-foreground/[0.045] text-foreground/35")
                    }
                  >
                    {minuteLabel(x.minute)}
                    {!x.available ? (
                      <span className="text-[0.68rem] lg:text-[0.75rem]">{booked(x.minute) ? "Booked" : "Unavailable"}</span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </>
  );
}

const shortDate = (iso: string) =>
  fromISO(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const longDate = (iso: string) =>
  fromISO(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

function DesktopTime({
  days,
  slots,
  busy,
}: {
  days: { iso: string; date: Date; selectable: boolean }[];
  slots: Slot[];
  busy: { time: number; slots: number }[];
}) {
  const { draft, totalSlots, totalPrice, hasFromPricing, selected } = useBooking();
  const navigate = useNavigate();
  const dayRow = useRef<HTMLDivElement>(null);
  useEffect(() => {
    dayRow.current
      ?.querySelector<HTMLElement>('[aria-pressed="true"]')
      ?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [draft.date]);

  const img = AUDIENCE_IMAGE[draft.audience ?? "men"];
  const first = selected[0];

  return (
    <DesktopPage>
      <DesktopStepHeader back="/services" step={3} />

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(20rem,32%)]">
        <main className="page-in min-h-0 overflow-y-auto px-14 py-9 [scrollbar-width:thin] xl:px-20">
          <StepTitle step="three">
            Choose a <Accent>time.</Accent>
          </StepTitle>

          <div className="mt-6 flex items-start gap-5">
            <CalendarDays className="mt-0.5 h-7 w-7 shrink-0" strokeWidth={1.1} />
            <div>
              <div className="text-[1.15rem]">{draft.date ? longDate(draft.date) : "Pick a day below"}</div>
              <div className="mt-0.5 text-[0.95rem] text-muted-foreground">
                We'll reserve {formatDuration(totalSlots)} for your visit.
              </div>
            </div>
          </div>

          <div
            ref={dayRow}
            aria-label="Choose a date"
            className="-mx-1 mt-6 overflow-x-auto px-1 py-1 [scrollbar-width:thin]"
          >
            <DayStrip days={days} />
          </div>

          {!draft.date ? (
            <p className="mt-8 text-muted-foreground">Select a date to see free slots.</p>
          ) : slots.length === 0 ? (
            <p className="mt-8 text-muted-foreground">The salon is closed on this day. Please pick another date.</p>
          ) : (
            <div key={draft.date} className="slide-in mt-4">
              <SlotGroups slots={slots} busy={busy} />
              {slots.every((x) => !x.available) ? (
                <p className="mt-6 text-muted-foreground">No slots left on this day. Please try another date.</p>
              ) : null}
            </div>
          )}
        </main>

        <ImagePanel
          src={portrait.url}
          sub="More than a haircut."
          title={
            <>
              Precision
              <br />
              Care
              <br />
              <span className="italic text-champagne">Confidence</span>
            </>
          }
        />
      </div>

      <DesktopBar>
        <div className="flex min-w-0 flex-1 items-center gap-6">
          <Thumb src={img.src} pos={img.pos} className="hidden h-20 w-20 xl:block" />
          <div className="min-w-0">
            <div className="truncate font-display text-[1.6rem] leading-tight">
              {selected.length > 1 ? `${first?.name} + ${selected.length - 1} more` : first?.name}
            </div>
            <div className="mt-0.5 text-[0.95rem] text-muted-foreground">
              {formatDuration(totalSlots)} · {inr(totalPrice)}
              {hasFromPricing ? "+" : ""}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-6 border-x border-hairline px-6 py-4 text-[1.05rem] xl:gap-8 xl:px-10">
          <span className="flex items-center gap-3">
            <CalendarDays className="h-5 w-5" strokeWidth={1.25} />
            {draft.date ? shortDate(draft.date) : "Pick a day"}
          </span>
          <span className="flex items-center gap-3">
            <Clock className="h-5 w-5" strokeWidth={1.25} />
            {draft.time != null ? minuteLabel(draft.time) : "Pick a time"}
          </span>
        </div>
        <div className="text-center">
          <div className="text-[0.85rem] text-muted-foreground">Total</div>
          <div key={totalPrice} className="tick-in font-display text-3xl leading-tight">
            {inr(totalPrice)}
            {hasFromPricing ? "+" : ""}
          </div>
        </div>
        <DesktopCTA disabled={!draft.date || draft.time == null} onClick={() => navigate({ to: "/details" })}>
          Continue
        </DesktopCTA>
      </DesktopBar>
    </DesktopPage>
  );
}
