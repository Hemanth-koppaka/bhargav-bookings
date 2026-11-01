import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Coffee,
  Sun,
  Sunrise,
  Sunset,
  UserRound,
} from "lucide-react";
import { haptic } from "@/lib/utils";
import { sfx } from "@/lib/sfx";
import { Page, PrimaryAction, Screen, StepHeader, StepIntro, StickyBar } from "@/components/screen";
import {
  selectionImage,
  Accent,
  DesktopBar,
  DesktopCTA,
  DesktopPage,
  DesktopStepHeader,
  StepTitle,
  Thumb,
} from "@/components/desktop";
import { useBooking } from "@/lib/booking-store";
import { getAvailability } from "@/lib/salon.functions";
import type { DayAvailability } from "@/lib/engine.server";
import {
  calendarDays,
  formatDuration,
  fromISO,
  inr,
  minuteLabel,
  SLOT_MINUTES,
  STYLISTS,
  closureOn,
  stylistsFor,
  toISO,
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
  const { draft, hydrated, totalMinutes, selected } = useBooking();
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
  const [barOpen, setBarOpen] = useState(true);
  // the three open days after the chosen one load in the background
  const ahead = useMemo(() => {
    if (!draft.date) return [];
    return days
      .filter((d) => d.selectable && d.iso > draft.date!)
      .slice(0, 3)
      .map((d) => d.iso);
  }, [days, draft.date]);
  const rawDay = useDayAvailability(draft.date, draft.audience, draft.serviceIds, ahead);
  const day = forStylist(rawDay, draft.staffId);
  const slots = day.data?.slots ?? [];
  const selectedBreaks = day.data?.breaks ?? [];

  const breakNote = selectedBreaks.length
    ? ` · ${selectedBreaks.map((b) => `${b.label ?? "Break"} ${minuteLabel(b.start)}–${minuteLabel(b.end)}`).join(", ")}`
    : "";

  return (
    <>
      <DesktopTime days={days} day={day} rawDay={rawDay} />
      <div className="md:hidden">
        <Page>
          <StepHeader back="/services" step={3} />
          <Screen className="px-5">
            <StepIntro
              eyebrow="Step three"
              sub={`We'll reserve ${formatDuration(totalMinutes)} for your visit.`}
            >
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
                      {day.data?.closed
                        ? closureOn(draft.date)?.reason
                          ? `Salon is closed on this date · ${closureOn(draft.date)!.reason}`
                          : "Salon is closed on this date"
                        : day.data
                          ? `Open ${minuteLabel(day.data.open)} – ${minuteLabel(day.data.close)}${breakNote}`
                          : ""}
                    </div>
                  </div>
                </div>
                {!day.data?.closed ? <StylistPicker day={rawDay} /> : null}
                <SlotGroups day={day} />
                {slots.length > 0 && slots.every((x) => !x.available) ? (
                  <p className="mt-6 text-sm text-muted-foreground">
                    {draft.staffId
                      ? "This stylist has no free times on this day. Try any available stylist or another date."
                      : "No slots left on this day. Please try another date."}
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="mt-8 text-sm text-muted-foreground">Select a date to see free slots.</p>
            )}
          </Screen>

          <StickyBar>
            {barOpen ? (
              <div className="mb-3 flex items-center gap-3 text-[0.88rem]">
                <span className="flex items-center gap-1.5">
                  <CalendarDays className="h-4 w-4 text-muted-foreground" strokeWidth={1.25} />
                  {draft.date ? shortDate(draft.date) : "Pick a day"}
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock className="h-4 w-4 text-muted-foreground" strokeWidth={1.25} />
                  <span key={draft.time ?? "none"} className="tick-in">
                    {draft.time != null ? minuteLabel(draft.time) : "Pick a time"}
                  </span>
                </span>
                {draft.date ? (
                  <button
                    type="button"
                    onClick={goToStylist}
                    className="flex min-w-0 items-center gap-1.5 underline decoration-foreground/25 underline-offset-4"
                  >
                    <UserRound
                      className="h-4 w-4 shrink-0 text-muted-foreground"
                      strokeWidth={1.25}
                    />
                    <span className="truncate">{stylistLabel(draft.staffId, rawDay)}</span>
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setBarOpen(false)}
                  aria-label="Minimise summary"
                  className="ml-auto -mr-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground"
                >
                  <ChevronDown className="h-4 w-4" strokeWidth={1.5} />
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setBarOpen(true)}
                aria-label="Show summary"
                className="-mt-2 mb-2 flex w-full items-center justify-center gap-2 py-1 text-[0.75rem] text-muted-foreground"
              >
                <ChevronUp className="h-4 w-4" strokeWidth={1.5} />
                {draft.date ? shortDate(draft.date) : "Pick a day"} ·{" "}
                {draft.time != null ? minuteLabel(draft.time) : "Pick a time"} ·{" "}
                {stylistLabel(draft.staffId, rawDay)}
              </button>
            )}
            <PrimaryAction
              disabled={!draft.date || draft.time == null}
              onClick={() => navigate({ to: "/details" })}
            >
              Your details
            </PrimaryAction>
          </StickyBar>
        </Page>
      </div>
    </>
  );
}

type DayState = { data: DayAvailability | null; loading: boolean; error: string };

/**
 * The day as seen for the chosen stylist: a time is free only if that stylist
 * is free for the whole service ("any" keeps the salon-wide picture, where a
 * time is free if at least one qualified stylist is).
 */
function forStylist(day: DayState, staffId: string | null | undefined): DayState {
  if (!staffId || !day.data) return day;
  return {
    ...day,
    data: {
      ...day.data,
      slots: day.data.slots.map((x) =>
        x.available && x.staff && !x.staff.includes(staffId)
          ? { ...x, available: false, reason: "booked" as const }
          : x,
      ),
    },
  };
}

/** Choose a stylist: "Any available" or a named stylist, with live Available / Busy for the picked time. */
/** Name of the chosen stylist ("Any stylist" when none is chosen). */
function stylistLabel(staffId: string | null | undefined, day: DayState) {
  if (!staffId) return "Any stylist";
  return (
    day.data?.stylists?.find((s) => s.id === staffId)?.name ??
    STYLISTS.find((s) => s.id === staffId)?.name ??
    "Stylist"
  );
}
/** Bring the stylist choice into view (from the bottom bar). */
function goToStylist() {
  const el = [...document.querySelectorAll<HTMLElement>("[data-stylist-picker]")].find(
    (x) => x.offsetParent !== null,
  );
  el?.scrollIntoView({ behavior: "smooth", block: "center" });
  el?.animate?.([{ opacity: 0.55 }, { opacity: 1 }], { duration: 650, easing: "ease-out" });
}

function StylistPicker({ day }: { day: DayState }) {
  const { draft, update } = useBooking();
  const team =
    day.data?.stylists ??
    stylistsFor(draft.serviceIds).map((s) => ({
      id: s.id,
      name: s.name,
      gender: s.gender,
      order: 0,
    }));
  const chosen = draft.staffId ?? null;
  // a stylist who can't do the chosen services is dropped back to "any"
  useEffect(() => {
    if (chosen && team.length && !team.some((t) => t.id === chosen)) update({ staffId: null });
  }, [chosen, team, update]);
  if (team.length < 1) return null;
  const slot =
    draft.time != null ? day.data?.slots.find((x) => x.minute === draft.time) : undefined;
  const status = (id: string) => (slot ? (slot.staff?.includes(id) ? "Available" : "Busy") : null);
  const pick = (id: string | null) => {
    haptic();
    if (id !== chosen) sfx.selection();
    // keep the time if the new choice is free then; otherwise ask for a new time
    const keep = !slot || !id || Boolean(slot.staff?.includes(id));
    update(keep ? { staffId: id } : { staffId: id, time: null });
  };
  const chip = (on: boolean) =>
    "press flex min-h-14 min-w-0 flex-col justify-center rounded-md border px-3.5 py-2 text-left transition-colors " +
    (on
      ? "border-foreground bg-foreground text-background"
      : "border-foreground/12 bg-card hover:border-foreground/45");
  return (
    <section data-stylist-picker className="mt-6 scroll-mt-28" aria-label="Choose stylist">
      <div className="flex items-center gap-4">
        <h2 className="shrink-0 font-sans text-[0.72rem] font-normal uppercase tracking-[0.3em] lg:text-[0.78rem]">
          Stylist
        </h2>
        <span className="h-px flex-1 bg-hairline" />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <button aria-pressed={!chosen} onClick={() => pick(null)} className={chip(!chosen)}>
          <span className="truncate text-[0.95rem]">Any available</span>
          <span
            className={
              "text-[0.72rem] " + (!chosen ? "text-background/65" : "text-muted-foreground")
            }
          >
            {slot ? (slot.available ? "Available" : "Busy") : "First free stylist"}
          </span>
        </button>
        {team.map((t) => {
          const on = chosen === t.id;
          const st = status(t.id);
          return (
            <button key={t.id} aria-pressed={on} onClick={() => pick(t.id)} className={chip(on)}>
              <span className="truncate text-[0.95rem]">{t.name}</span>
              <span
                className={
                  "flex items-center gap-1.5 text-[0.72rem] " +
                  (on
                    ? "text-background/65"
                    : st === "Busy"
                      ? "text-foreground/40"
                      : "text-muted-foreground")
                }
              >
                {st ? (
                  <span
                    className={
                      "h-1.5 w-1.5 rounded-full " +
                      (st === "Available" ? "bg-emerald-600" : "bg-foreground/30")
                    }
                  />
                ) : null}
                {st ?? (STYLISTS.find((x) => x.id === t.id)?.specialties || "Stylist")}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/*
 * Day availability with a short-lived cache: a day already fetched shows
 * instantly (and refreshes quietly), and the next few open days are loaded
 * in the background so tapping them feels immediate.
 */
const FRESH_MS = 60_000;
const dayCache = new Map<string, { at: number; data: DayAvailability }>();
const inflight = new Map<string, Promise<DayAvailability>>();
const cacheKey = (date: string, audience: string, key: string) => `${date}|${audience}|${key}`;

function fetchDay(
  date: string,
  audience: string,
  key: string,
  force = false,
): Promise<DayAvailability> {
  const k = cacheKey(date, audience, key);
  const hit = dayCache.get(k);
  if (!force && hit && Date.now() - hit.at < FRESH_MS) return Promise.resolve(hit.data);
  const running = inflight.get(k);
  if (running) return running;
  const p = getAvailability({
    data: { date, audience: audience as "men" | "women", serviceIds: key.split(",") },
  })
    .then((r) => {
      dayCache.set(k, { at: Date.now(), data: r });
      return r;
    })
    .finally(() => inflight.delete(k));
  inflight.set(k, p);
  return p;
}

/** Warm the cache for a day (e.g. on press, before the tap completes). */
function prefetchDay(date: string, audience: string | null, serviceIds: string[]) {
  if (audience && serviceIds.length)
    void fetchDay(date, audience, serviceIds.join(",")).catch(() => {});
}

/** Live availability for the chosen day and services, straight from the booking engine. */
function useDayAvailability(
  date: string | null,
  audience: string | null,
  serviceIds: string[],
  ahead: string[] = [],
): DayState {
  const [state, setState] = useState<DayState>({ data: null, loading: false, error: "" });
  const key = serviceIds.join(",");
  const aheadKey = ahead.join(",");
  useEffect(() => {
    if (!date || !audience || !key) {
      setState({ data: null, loading: false, error: "" });
      return;
    }
    let live = true;
    const hit = dayCache.get(cacheKey(date, audience, key));
    // a cached day shows at once; otherwise keep the old grid only if it's the same day
    setState((s) =>
      hit
        ? { data: hit.data, loading: false, error: "" }
        : { data: s.data?.date === date ? s.data : null, loading: true, error: "" },
    );
    const load = (force: boolean) =>
      fetchDay(date, audience, key, force)
        .then((r) => live && setState({ data: r, loading: false, error: "" }))
        .catch(
          () =>
            live &&
            !hit &&
            setState({
              data: null,
              loading: false,
              error: "Couldn't load times. Check your connection and try again.",
            }),
        );
    void load(Boolean(hit) && Date.now() - hit!.at > 15_000).then(() => {
      // then the next few open days, one after another, so they're ready when tapped
      if (!live) return;
      let chain = Promise.resolve();
      for (const d of aheadKey ? aheadKey.split(",") : [])
        chain = chain.then(() =>
          live
            ? fetchDay(d, audience, key).then(
                () => {},
                () => {},
              )
            : undefined,
        );
    });
    // keep the picture fresh while the guest decides
    const t = window.setInterval(() => void load(true), 45_000);
    return () => {
      live = false;
      window.clearInterval(t);
    };
  }, [date, audience, key, aheadKey]);
  return state;
}

function SlotSkeleton() {
  return (
    <div
      className="mt-6 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6"
      aria-label="Loading times"
    >
      {Array.from({ length: 12 }, (_, i) => (
        <span key={i} className="h-13 animate-pulse rounded-md bg-foreground/[0.06]" />
      ))}
    </div>
  );
}

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
            data-sfx-off=""
            onPointerDown={() =>
              d.selectable && prefetchDay(d.iso, draft.audience, draft.serviceIds)
            }
            aria-pressed={on}
            aria-label={d.date.toDateString() + (d.selectable ? "" : " (closed)")}
            onClick={() => {
              haptic();
              if (!on) sfx.dateSelect();
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
            <span
              className={
                "mt-1 font-display text-2xl leading-none " + (d.selectable ? "" : "line-through")
              }
            >
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

function BreakDivider({ start, end }: { start: number; end: number }) {
  const lunch = start >= 12 * 60 && start < 15 * 60;
  return (
    <div className="col-span-full my-1 flex items-center gap-4">
      <span className="h-px flex-1 bg-hairline" />
      <span className="flex items-center gap-2.5 text-[0.62rem] uppercase tracking-[0.28em] text-bronze">
        <Coffee className="h-4 w-4" strokeWidth={1.25} aria-hidden />
        {lunch ? "Lunch break" : "Break"} · {minuteLabel(start)} – {minuteLabel(end)}
      </span>
      <span className="h-px flex-1 bg-hairline" />
    </div>
  );
}

function SlotGroups({ day }: { day: DayState }) {
  const { draft, update } = useBooking();
  if (day.loading && !day.data) return <SlotSkeleton />;
  if (day.error) return <p className="mt-6 text-sm text-destructive">{day.error}</p>;
  if (day.data?.message)
    return <p className="mt-6 text-[0.95rem] text-muted-foreground">{day.data.message}</p>;
  const slots = day.data?.slots ?? [];
  const interval = day.data?.interval ?? SLOT_MINUTES;
  const breaks = day.data?.breaks ?? [];
  // Times that fall inside a break are never bookable, so they're replaced by a divider.
  const visible = slots.filter((x) => !breaks.some((b) => x.minute >= b.start && x.minute < b.end));
  const groups = PERIODS.map((p) => ({ p, items: visible.filter((x) => p.test(x.minute)) })).filter(
    (g) => g.items.length > 0,
  );
  let prevEnd = -1;

  return (
    <>
      {groups.map(({ p, items }) => {
        const firstMin = items[0]!.minute;
        const lastMin = items[items.length - 1]!.minute;
        const between = breaks.filter((b) => b.start >= prevEnd && b.start < firstMin);
        const inside = breaks.filter((b) => b.start > firstMin && b.start <= lastMin);
        prevEnd = lastMin + interval;
        const free = items.filter((x) => x.available).length;
        return (
          <section key={p.label} className="mt-5">
            {between.map((b) => (
              <div key={b.start} className="mb-5 grid">
                <BreakDivider start={b.start} end={b.end} />
              </div>
            ))}
            <div className="flex items-center gap-4">
              <h2 className="flex shrink-0 items-center gap-2.5 font-sans text-[0.72rem] font-normal uppercase tracking-[0.3em] lg:text-[0.78rem]">
                <p.icon className="h-[18px] w-[18px] text-bronze" strokeWidth={1.25} aria-hidden />
                {p.label}
              </h2>
              <span className="h-px flex-1 bg-hairline" />
              <span className="shrink-0 text-[0.72rem] uppercase tracking-[0.2em] text-muted-foreground">
                {free ? `${free} ${free === 1 ? "slot" : "slots"}` : "Fully booked"}
              </span>
            </div>
            <div className="stagger mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-4 lg:gap-3 xl:grid-cols-5">
              {items.flatMap((x) => {
                const on = draft.time === x.minute;
                const cell = (
                  <button
                    key={x.minute}
                    disabled={!x.available}
                    data-sfx-off=""
                    aria-pressed={on}
                    onClick={() => {
                      haptic();
                      if (!on) sfx.timeSelect();
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
                    <span className={x.available ? "" : "line-through decoration-foreground/25"}>
                      {minuteLabel(x.minute)}
                    </span>
                    {!x.available ? (
                      <span className="text-[0.66rem] lg:text-[0.72rem]">
                        {x.reason === "booked" ? "Booked" : "Unavailable"}
                      </span>
                    ) : null}
                  </button>
                );
                const br = inside.find(
                  (b) =>
                    b.end <= x.minute &&
                    !items.some((y) => y.minute < x.minute && y.minute >= b.end),
                );
                return br
                  ? [<BreakDivider key={`b${br.start}`} start={br.start} end={br.end} />, cell]
                  : [cell];
              })}
            </div>
          </section>
        );
      })}
    </>
  );
}

function EmptySlots({ text }: { text: string }) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center gap-3 rounded-md border border-dashed border-foreground/15 px-6 text-center text-muted-foreground lg:h-full">
      <Clock className="h-6 w-6 text-bronze/70" strokeWidth={1.1} />
      {text}
    </div>
  );
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Month grid date picker (tablet and laptop). Only the bookable window is selectable. */
function MonthCalendar({
  days,
  onPicked,
}: {
  days: { iso: string; date: Date; selectable: boolean }[];
  onPicked?: () => void;
}) {
  const { draft, update } = useBooking();
  const bookable = useMemo(() => new Map(days.map((d) => [d.iso, d.selectable])), [days]);
  const first = days[0]!.date;
  const last = days[days.length - 1]!.date;
  const todayIso = days[0]!.iso;
  const startOf = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
  // Open on the selected day's month; otherwise skip a month that has under a week left.
  const [view, setView] = useState(() => {
    if (draft.date) return startOf(fromISO(draft.date));
    const leftThisMonth = days.filter(
      (d) => d.selectable && d.date.getMonth() === first.getMonth(),
    ).length;
    return leftThisMonth < 7
      ? new Date(first.getFullYear(), first.getMonth() + 1, 1)
      : startOf(first);
  });
  // Follow the selected day (e.g. once the saved draft loads, or after "Soonest").
  const selectedMonth = draft.date ? startOf(fromISO(draft.date)).getTime() : null;
  useEffect(() => {
    if (selectedMonth != null) setView(new Date(selectedMonth));
  }, [selectedMonth]);
  const minView = startOf(first);
  const maxView = startOf(last);
  const canPrev = view > minView;
  const canNext = view < maxView;

  const offset = (view.getDay() + 6) % 7;
  const inMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
  const cells = Array.from({ length: Math.ceil((offset + inMonth) / 7) * 7 }, (_, i) => {
    const d = new Date(view.getFullYear(), view.getMonth(), 1 - offset + i);
    return { d, iso: toISO(d), current: d.getMonth() === view.getMonth() };
  });

  const pick = (iso: string) => {
    haptic();
    if (iso !== draft.date) sfx.dateSelect();
    update({ date: iso, time: null });
    onPicked?.();
  };
  const jumpToday = () => {
    const firstOpen = days.find((d) => d.selectable);
    if (!firstOpen) return;
    setView(startOf(firstOpen.date));
    pick(firstOpen.iso);
  };
  const nav =
    "press flex h-11 w-11 items-center justify-center rounded-full border border-foreground/12 bg-card text-foreground/75 hover:border-foreground/40 disabled:opacity-30";

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label="Previous month"
            data-sfx="nav"
            disabled={!canPrev}
            onClick={() => setView(new Date(view.getFullYear(), view.getMonth() - 1, 1))}
            className={nav}
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
          </button>
          <div
            key={view.getTime()}
            aria-live="polite"
            className="tick-in min-w-40 text-center font-display text-[1.15rem] uppercase tracking-[0.16em] xl:text-[1.25rem]"
          >
            {view.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
          </div>
          <button
            type="button"
            aria-label="Next month"
            data-sfx="nav"
            disabled={!canNext}
            onClick={() => setView(new Date(view.getFullYear(), view.getMonth() + 1, 1))}
            className={nav}
          >
            <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>
        <button
          type="button"
          onClick={jumpToday}
          className="press inline-flex h-11 items-center gap-2.5 rounded-sm border border-foreground/12 bg-card px-4 text-[0.88rem] hover:border-foreground/40"
        >
          <CalendarDays className="h-4 w-4" strokeWidth={1.25} />
          Soonest
        </button>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-2 text-center text-[0.62rem] uppercase tracking-[0.18em] text-muted-foreground">
        {WEEKDAYS.map((w) => (
          <span key={w}>{w}</span>
        ))}
      </div>
      <div key={view.getTime()} className="slide-in mt-2 grid grid-cols-7 gap-2">
        {cells.map(({ d, iso, current }) => {
          const inWindow = bookable.has(iso);
          const open = bookable.get(iso) === true;
          const closed = inWindow && !open;
          const on = draft.date === iso;
          return (
            <button
              key={iso}
              type="button"
              disabled={!open}
              data-sfx-off=""
              onPointerDown={() => open && prefetchDay(iso, draft.audience, draft.serviceIds)}
              aria-pressed={on}
              aria-label={
                d.toDateString() + (closed ? " (closed)" : !inWindow ? " (unavailable)" : "")
              }
              onClick={() => pick(iso)}
              className={
                "press relative flex h-14 flex-col items-center justify-center rounded-md border lg:h-[3.4rem] " +
                (on
                  ? "ring-pulse border-foreground bg-foreground text-background"
                  : open
                    ? "border-foreground/12 bg-card hover:border-foreground/50"
                    : closed
                      ? "border-transparent bg-foreground/[0.04] text-foreground/30"
                      : "border-transparent text-foreground/20") +
                (current ? "" : " opacity-50")
              }
            >
              <span
                className={
                  "font-display text-[1.35rem] leading-none " +
                  (closed ? "line-through decoration-1" : "")
                }
              >
                {d.getDate()}
              </span>
              <span className="mt-1 text-[0.55rem] uppercase tracking-[0.16em]">
                {closed
                  ? "Closed"
                  : iso === todayIso
                    ? "Today"
                    : d.toLocaleDateString("en-GB", { month: "short" })}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const shortDate = (iso: string) =>
  fromISO(iso).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const longDate = (iso: string) =>
  fromISO(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

function DesktopTime({
  days,
  day,
  rawDay,
}: {
  days: { iso: string; date: Date; selectable: boolean }[];
  day: DayState;
  rawDay: DayState;
}) {
  const slots = day.data?.slots ?? [];
  const { draft, totalMinutes, totalPrice, hasFromPricing, selected } = useBooking();
  const navigate = useNavigate();
  // After the guest picks a day, glide down to its times.
  const slotsRef = useRef<HTMLDivElement>(null);
  const toSlots = () =>
    window.setTimeout(
      () => slotsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      120,
    );

  const img = selectionImage(selected, draft.audience);
  const first = selected[0];
  // the summary bar can be minimised to give the calendar and times more room
  const [compact, setCompact] = useState(false);

  return (
    <DesktopPage>
      <DesktopStepHeader back="/services" step={3} />

      {/* tablet portrait: one column (calendar, then times); from lg the calendar and the times sit side by side */}
      <main className="page-in min-h-0 flex-1 overflow-y-auto px-8 py-8 [scrollbar-width:thin] lg:grid lg:grid-cols-[minmax(21rem,27rem)_minmax(0,1fr)] lg:gap-12 lg:overflow-hidden lg:px-12 lg:py-0 xl:gap-16 xl:px-20">
        <div className="lg:min-h-0 lg:overflow-y-auto lg:py-9 lg:[scrollbar-width:none]">
          <StepTitle step="three">
            Choose a <Accent>time.</Accent>
          </StepTitle>

          <div className="mt-6 flex items-start gap-4">
            <CalendarDays className="mt-0.5 h-6 w-6 shrink-0 text-bronze" strokeWidth={1.1} />
            <div>
              <div className="text-[1.1rem]">
                {draft.date ? longDate(draft.date) : "Pick a day"}
              </div>
              <div className="mt-0.5 text-[0.92rem] text-muted-foreground">
                We'll reserve {formatDuration(totalMinutes)} for your visit.
              </div>
            </div>
          </div>

          <div className="mt-7 max-w-2xl">
            <MonthCalendar days={days} onPicked={toSlots} />
          </div>
        </div>

        <div
          ref={slotsRef}
          className="mt-4 scroll-mt-4 lg:mt-0 lg:min-h-0 lg:overflow-y-auto lg:py-9 lg:pr-2 lg:[scrollbar-width:thin]"
        >
          {!draft.date ? (
            <EmptySlots text="Pick a day on the calendar to see its free times." />
          ) : slots.length === 0 ? (
            <EmptySlots
              text={
                closureOn(draft.date)?.reason
                  ? `Salon is closed on this date (${closureOn(draft.date)!.reason}).`
                  : "Salon is closed on this date. Please pick another date."
              }
            />
          ) : (
            <div key={draft.date} className="slide-in">
              {/* the stylist choice sits right above the times, never hidden under the bar */}
              {!rawDay.data?.closed ? (
                <div className="-mt-6 mb-2 max-w-3xl lg:-mt-6">
                  <StylistPicker day={rawDay} />
                </div>
              ) : null}
              <SlotGroups day={day} />
              {slots.every((x) => !x.available) ? (
                <p className="mt-6 text-muted-foreground">
                  No slots left on this day. Please try another date.
                </p>
              ) : null}
            </div>
          )}
        </div>
      </main>

      {compact ? (
        <DesktopBar>
          <button
            type="button"
            onClick={() => setCompact(false)}
            aria-expanded={false}
            className="flex min-w-0 flex-1 items-center gap-5 text-left text-[1rem]"
          >
            <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.5} />
            <span className="truncate">
              {draft.date ? shortDate(draft.date) : "Pick a day"} ·{" "}
              {draft.time != null ? minuteLabel(draft.time) : "Pick a time"} ·{" "}
              {stylistLabel(draft.staffId, rawDay)} · {inr(totalPrice)}
              {hasFromPricing ? "+" : ""}
            </span>
            <span className="hidden text-[0.8rem] text-muted-foreground lg:inline">
              Show summary
            </span>
          </button>
          <DesktopCTA
            disabled={!draft.date || draft.time == null}
            onClick={() => navigate({ to: "/details" })}
          >
            Continue
          </DesktopCTA>
        </DesktopBar>
      ) : (
        <DesktopBar>
          <button
            type="button"
            onClick={() => setCompact(true)}
            aria-label="Minimise summary"
            title="Minimise"
            className="press -ml-2 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
          >
            <ChevronDown className="h-4 w-4" strokeWidth={1.5} />
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-6">
            <Thumb
              src={img.src}
              pos={img.pos}
              fit={img.fit}
              className="hidden h-20 w-20 xl:block"
            />
            <div className="min-w-0">
              <div className="truncate font-display text-[1.6rem] leading-tight">
                {selected.length > 1 ? `${first?.name} + ${selected.length - 1} more` : first?.name}
              </div>
              <div className="mt-0.5 text-[0.95rem] text-muted-foreground">
                {formatDuration(totalMinutes)} · {inr(totalPrice)}
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
            {draft.date ? (
              <button
                type="button"
                onClick={goToStylist}
                className="flex items-center gap-3 underline-offset-4 hover:underline"
              >
                <UserRound className="h-5 w-5" strokeWidth={1.25} />
                {stylistLabel(draft.staffId, rawDay)}
              </button>
            ) : null}
          </div>
          <div className="hidden text-center xl:block">
            <div className="text-[0.85rem] text-muted-foreground">Total</div>
            <div key={totalPrice} className="tick-in font-display text-3xl leading-tight">
              {inr(totalPrice)}
              {hasFromPricing ? "+" : ""}
            </div>
          </div>
          <DesktopCTA
            disabled={!draft.date || draft.time == null}
            onClick={() => navigate({ to: "/details" })}
          >
            Continue
          </DesktopCTA>
        </DesktopBar>
      )}
    </DesktopPage>
  );
}
