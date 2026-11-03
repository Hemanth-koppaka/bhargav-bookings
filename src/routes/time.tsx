import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  SelectionThumb,
  Accent,
  DesktopBar,
  DesktopCTA,
  DesktopPage,
  DesktopStepHeader,
  StepTitle,
} from "@/components/desktop";
import { useBooking } from "@/lib/booking-store";
import { YourAppointment, BookingDock } from "@/components/booking-dock";
import { DayArc } from "@/components/day-arc";
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
  const { draft, hydrated, totalMinutes, selected, update } = useBooking();
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
  // No date chosen yet: open on today, or the first day with free times, so
  // the guest sees real times straight away (never replaces a chosen date).
  const opening = useRef(false);
  useEffect(() => {
    if (!hydrated || draft.date || opening.current || !draft.audience || !draft.serviceIds.length) return;
    opening.current = true;
    const open = days.filter((d) => d.selectable).slice(0, 14);
    const key = draft.serviceIds.join(",");
    void (async () => {
      for (const d of open) {
        try {
          const r = await fetchDay(d.iso, draft.audience!, key);
          if (!r.closed && !r.message && r.slots.some((x) => x.available)) {
            update((cur) => (cur.date ? {} : { date: d.iso, time: null }));
            return;
          }
        } catch {
          break;
        }
      }
      if (open[0]) update((cur) => (cur.date ? {} : { date: open[0]!.iso, time: null }));
    })();
  }, [hydrated, draft.date, draft.audience, draft.serviceIds, days, update]);

  // The guest's date is never swapped for another one. Only a saved date that
  // has since passed is cleared (never replaced), so they choose again.
  useEffect(() => {
    if (hydrated && draft.date && draft.date < days[0]!.iso) update({ date: null, time: null });
  }, [hydrated, draft.date, days, update]);
  const [barOpen, setBarOpen] = useState(false);
  // the three open days after the chosen one load in the background
  const ahead = useMemo(() => {
    if (!draft.date) return [];
    return days
      .filter((d) => d.selectable && d.iso > draft.date!)
      .slice(0, 3)
      .map((d) => d.iso);
  }, [days, draft.date]);
  const rawDay = useDayAvailability(draft.date, draft.audience, draft.serviceIds, ahead);
  // a service with a preferred stylist (Bhargav's Signature) shows that stylist's times
  const day = forStylist(rawDay, draft.staffId ?? rawDay.data?.preferred?.id, Boolean(rawDay.data?.preferred) && !draft.staffId);
  const slots = day.data?.slots ?? [];
  const selectedBreaks = day.data?.breaks ?? [];

  // Services changed after a time was chosen: check that time again with the new
  // length and stylist. Keep it quietly if it still works (nothing for the guest
  // to do); only if it no longer fits, say so and clear it.
  const [timeNote, setTimeNote] = useState("");
  useEffect(() => {
    if (!draft.timeStale || draft.time == null || !day.data || day.loading || day.data.date !== draft.date) return;
    const slot = day.data.slots.find((x) => x.minute === draft.time);
    if (slot?.available) {
      update({ timeStale: false });
    } else {
      update({ time: null, timeStale: false });
      setTimeNote("Your services have changed, so the previously selected time is no longer available. Please choose a new time.");
    }
  }, [draft.timeStale, draft.time, draft.date, day.data, day.loading, update]);

  const breakNote = selectedBreaks.length
    ? ` · ${selectedBreaks.map((b) => `${b.label ?? "Break"} ${minuteLabel(b.start)}–${minuteLabel(b.end)}`).join(", ")}`
    : "";

  return (
    <>
      <DesktopTime days={days} day={day} rawDay={rawDay} timeNote={timeNote} />
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
                {timeNote ? <TimeNote text={timeNote} /> : null}
              <SlotGroups day={day} />
              </div>
            ) : (
              <p className="mt-8 text-sm text-muted-foreground">Select a date to see free slots.</p>
            )}
          </Screen>

          <BookingDock
            action="Continue"
            disabled={!draft.date || draft.time == null}
            onAction={() => navigate({ to: "/details" })}
            open={barOpen}
            onToggle={() => setBarOpen((v) => !v)}
            sub={
              draft.date ? (
                <>
                  {shortDate(draft.date)}
                  {draft.time != null ? ` · ${minuteLabel(draft.time)}` : " · pick a time"}
                  {draft.date ? ` · ${stylistLabel(draft.staffId, rawDay)}` : ""}
                </>
              ) : undefined
            }
            sheet={
              <YourAppointment
                onAddMore={() => navigate({ to: "/services" })}
                continueLabel="Done"
                onContinue={() => setBarOpen(false)}
                onClose={() => setBarOpen(false)}
              />
            }
          />
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
function forStylist(day: DayState, staffId: string | null | undefined, offerOthers = false): DayState {
  if (!staffId || !day.data) return day;
  return {
    ...day,
    data: {
      ...day.data,
      slots: day.data.slots.map((x) =>
        x.available && x.staff && !x.staff.includes(staffId)
          ? // the preferred stylist is busy; others are free for the whole service
            { ...x, available: false, reason: "booked" as const, ...(offerOthers && x.staff.length ? { others: x.staff } : {}) }
          : x,
      ),
    },
  };
}

/** Choose a stylist: "Any available" or a named stylist, with live Available / Busy for the picked time. */
/** Name of the chosen stylist ("Any stylist" when none is chosen). */
function stylistLabel(staffId: string | null | undefined, day: DayState) {
  if (!staffId) return day.data?.preferred?.name ?? "Any stylist";
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
  const pref = day.data?.preferred;
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
  if (pref) return <PreferredStylist day={day} />;
  if (team.length < 1) return null;
  const slot =
    draft.time != null ? day.data?.slots.find((x) => x.minute === draft.time) : undefined;
  const status = (id: string) => (slot ? (slot.staff?.includes(id) ? "Available" : "Busy") : null);
  // before a time is chosen: how many free times each stylist has that day
  const freeCount = (id: string) =>
    (day.data?.slots ?? []).filter((x) => x.available && x.staff?.includes(id)).length;
  const at = draft.time != null ? minuteLabel(draft.time) : "";
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
            {slot ? (slot.available ? `Available at ${at}` : `Unavailable at ${at}`) : "First free stylist"}
          </span>
        </button>
        {team.map((t) => {
          const on = chosen === t.id;
          const st = status(t.id);
          const free = day.data ? freeCount(t.id) : null;
          const label =
            st === "Available"
              ? `Available at ${at}`
              : st === "Busy"
                ? `Unavailable at ${at}`
                : free === 0
                  ? "Not available this day"
                  : free != null
                    ? `${free} ${free === 1 ? "time" : "times"} free`
                    : STYLISTS.find((x) => x.id === t.id)?.specialties || "Stylist";
          const away = st === "Busy" || (st == null && free === 0);
          return (
            <button
              key={t.id}
              aria-pressed={on}
              onClick={() => pick(t.id)}
              aria-label={`${t.name}: ${label}`}
              className={chip(on) + (away && !on ? " opacity-60" : "")}
            >
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
                {st || free != null ? (
                  <span
                    className={
                      "h-1.5 w-1.5 shrink-0 rounded-full " +
                      (away ? "bg-[#c2554a]" : "bg-emerald-600")
                    }
                  />
                ) : null}
                <span className="truncate">{label}</span>
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

/**
 * The earliest free appointment from today, for "Soonest" only: open days in
 * order, the chosen stylist (or the services' preferred stylist) respected.
 */
async function findSoonest(
  days: { iso: string; selectable: boolean }[],
  audience: string | null,
  serviceIds: string[],
  staffId: string | null,
): Promise<{ date: string; minute: number } | null> {
  if (!audience || !serviceIds.length) return null;
  const key = serviceIds.join(",");
  for (const d of days.filter((x) => x.selectable)) {
    const r = await fetchDay(d.iso, audience, key);
    if (r.closed || r.message) continue;
    const who = staffId ?? r.preferred?.id ?? null;
    const slot = r.slots.find((x) => x.available && (!who || !x.staff || x.staff.includes(who)));
    if (slot) return { date: d.iso, minute: slot.minute };
  }
  return null;
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

/** A calm line about the chosen time after the services changed. */
function TimeNote({ text }: { text: string }) {
  return (
    <p role="status" className="fade-rise mt-5 rounded-md border border-bronze/30 bg-champagne/20 px-4 py-3 text-[0.88rem] leading-relaxed">
      {text}
    </p>
  );
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
            data-sfx-off=""
            onPointerDown={() =>
              d.selectable && prefetchDay(d.iso, draft.audience, draft.serviceIds)
            }
            aria-pressed={on}
            aria-label={d.date.toDateString() + (d.selectable ? "" : " (closed)")}
            onClick={() => {
              haptic();
              if (!on) sfx.dateSelect();
              // the guest's date is kept exactly, open or closed
              update({ date: d.iso, time: null });
            }}
            className={
              "press flex w-[4rem] shrink-0 flex-col items-center rounded-md border py-2.5 lg:w-[4.25rem] " +
              (on
                ? "border-foreground bg-foreground text-background shadow-[0_10px_24px_-14px_color-mix(in_oklab,var(--ink)_70%,transparent)]"
                : d.selectable
                  ? "border-foreground/12 bg-card hover:border-foreground/45"
                  : "border-transparent text-foreground/30 hover:border-foreground/15")
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

/**
 * Services with a preferred stylist (Bhargav's Signature): the stylist is set,
 * not chosen. If the guest explicitly continued with another stylist, say so
 * and offer the way back.
 */
function PreferredStylist({ day }: { day: DayState }) {
  const { draft, update } = useBooking();
  const pref = day.data!.preferred!;
  const other = draft.staffId && draft.staffId !== pref.id ? stylistLabel(draft.staffId, day) : null;
  const back = () => {
    const slot = draft.time != null ? day.data?.slots.find((x) => x.minute === draft.time) : undefined;
    // keep the time only if the preferred stylist is free then
    update({ staffId: null, ...(slot && slot.staff?.includes(pref.id) ? {} : { time: null }) });
  };
  return (
    <section data-stylist-picker className="mt-6 scroll-mt-28" aria-label="Stylist">
      <div className="flex items-center gap-4">
        <h2 className="shrink-0 font-sans text-[0.72rem] font-normal uppercase tracking-[0.3em] lg:text-[0.78rem]">Stylist</h2>
        <span className="h-px flex-1 bg-hairline" />
      </div>
      <div className="mt-3 flex items-baseline justify-between gap-4">
        <p className="font-display text-[1.25rem] leading-tight lg:text-[1.35rem]">
          <span className="text-muted-foreground">Stylist · </span>
          {other ?? pref.name}
        </p>
        {other ? (
          <button type="button" onClick={back} className="shrink-0 text-[0.8rem] text-bronze underline underline-offset-4">
            Back to {pref.name}
          </button>
        ) : null}
      </div>
      <p className="mt-1 text-[0.8rem] text-muted-foreground">
        {other ? `You chose to continue with ${other}.` : `This signature service is performed by ${pref.name}.`}
      </p>
    </section>
  );
}

/** "Bhargav isn't available at this time": calm choice, never a silent swap. */
function OtherStylistChoice({
  minute,
  others,
  day,
  onClose,
}: {
  minute: number;
  others: string[];
  day: DayState;
  onClose: () => void;
}) {
  const { update } = useBooking();
  const [listing, setListing] = useState(false);
  const pref = day.data!.preferred!;
  const names = others
    .map((id) => ({ id, name: day.data?.stylists?.find((s) => s.id === id)?.name ?? "Stylist" }))
    .filter((s) => s.id !== pref.id);
  // rendered at the top of the page (outside the animated list) so it's never clipped or covered
  return createPortal(
    <div
      role="dialog"
      aria-label={`${pref.name} isn't available at ${minuteLabel(minute)}`}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 sm:items-center"
      onClick={onClose}
    >
      <div
        className="fade-rise w-full max-w-md rounded-md border border-hairline bg-card p-6 shadow-[0_24px_60px_-28px_rgba(30,20,10,0.55)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="text-[0.66rem] uppercase tracking-[0.28em] text-bronze">{minuteLabel(minute)}</div>
        <p className="mt-2 font-display text-[1.45rem] leading-snug">{pref.name} isn't available at this time.</p>
        {!listing ? (
          <>
            <p className="mt-2 text-[0.92rem] text-muted-foreground">Would you like to continue with one of our available stylists?</p>
            <div className="mt-5 grid gap-2">
              <button
                type="button"
                data-sfx="select"
                onClick={() => setListing(true)}
                className="press min-h-12 rounded-sm bg-foreground px-5 text-[0.72rem] uppercase tracking-[0.2em] text-background"
              >
                Continue with another stylist
              </button>
              <button
                type="button"
                data-sfx="secondary"
                onClick={onClose}
                className="press min-h-12 rounded-sm border border-foreground/20 px-5 text-[0.72rem] uppercase tracking-[0.2em]"
              >
                Choose another time with {pref.name}
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="mt-2 text-[0.92rem] text-muted-foreground">Free for your whole appointment at {minuteLabel(minute)}:</p>
            <ul className="mt-4 grid gap-2">
              {names.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => {
                      haptic();
                      sfx.timeSelect();
                      update({ staffId: s.id, time: minute });
                      onClose();
                    }}
                    className="press flex min-h-13 w-full items-center justify-between rounded-md border border-foreground/12 bg-background px-4 text-left hover:border-foreground/50"
                  >
                    <span className="text-[1rem]">{s.name}</span>
                    <span className="flex items-center gap-1.5 text-[0.75rem] text-muted-foreground">
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" /> Available
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            <button type="button" onClick={onClose} className="mt-4 text-[0.8rem] text-muted-foreground underline underline-offset-4">
              Choose another time with {pref.name}
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** A calm message in place of the times (closed, or nothing that fits). */
function EmptyDay({ title, sub }: { title: string; sub: string }) {
  return (
    <div className="mt-6 rounded-md border border-dashed border-foreground/15 px-5 py-8 text-center">
      <p className="font-display text-[1.35rem] leading-snug">{title}</p>
      <p className="mx-auto mt-1.5 max-w-sm text-[0.88rem] text-muted-foreground">{sub}</p>
    </div>
  );
}

function SlotGroups({ day }: { day: DayState }) {
  const { draft, update } = useBooking();
  const [ask, setAsk] = useState<{ minute: number; others: string[] } | null>(null);
  if (day.loading && !day.data) return <SlotSkeleton />;
  if (day.error) return <p className="mt-6 text-sm text-destructive">{day.error}</p>;
  if (day.data?.message)
    return <p className="mt-6 text-[0.95rem] text-muted-foreground">{day.data.message}</p>;
  if (day.data?.closed)
    return (
      <EmptyDay
        title="We're closed on this day."
        sub="Please choose another date to find an available appointment."
      />
    );
  const slots = day.data?.slots ?? [];
  const interval = day.data?.interval ?? SLOT_MINUTES;
  const breaks = day.data?.breaks ?? [];
  // Times that fall inside a break are never bookable, so they're replaced by a divider.
  const visible = slots.filter((x) => !breaks.some((b) => x.minute >= b.start && x.minute < b.end));
  const groups = PERIODS.map((p) => ({ p, items: visible.filter((x) => p.test(x.minute)) })).filter(
    (g) => g.items.length > 0,
  );
  let prevEnd = -1;
  const pref = day.data?.preferred;
  const prefFree = slots.some((x) => x.available);
  const othersFree = slots.some((x) => (x as { others?: string[] }).others);
  if (day.data && !prefFree && !othersFree)
    return (
      <EmptyDay
        title="No times available"
        sub={
          draft.staffId
            ? "This stylist has no suitable time on this day. Try any available stylist, or choose a different date."
            : "Nothing on this day fits your services. Try another time or choose a different date."
        }
      />
    );

  const freeTimes = visible.filter((x) => x.available).map((x) => x.minute);
  const salonToday = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

  return (
    <>
      {day.data ? (
        <DayArc
          className="mt-5"
          open={day.data.open}
          close={day.data.close}
          free={freeTimes}
          selected={draft.time ?? null}
          today={day.data.date === salonToday}
        />
      ) : null}
      {pref && !draft.staffId && !prefFree && othersFree ? (
        <p className="mt-5 text-[0.9rem] text-muted-foreground">
          {pref.name} isn't available on this day. Pick a time to continue with another stylist, or choose another date.
        </p>
      ) : null}
      {ask && pref ? (
        <OtherStylistChoice minute={ask.minute} others={ask.others} day={day} onClose={() => setAsk(null)} />
      ) : null}
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
                const others = (x as { others?: string[] }).others;
                const cell = (
                  <button
                    key={x.minute}
                    disabled={!x.available && !others}
                    data-sfx-off=""
                    aria-pressed={on}
                    onClick={() => {
                      haptic();
                      // the preferred stylist is busy then: ask, never switch silently
                      if (others) return setAsk({ minute: x.minute, others });
                      if (!on) sfx.timeSelect();
                      update({ time: x.minute });
                    }}
                    className={
                      "press relative flex min-h-13 flex-col items-center justify-center overflow-hidden rounded-md border px-1 py-2 text-[0.92rem] tabular-nums lg:min-h-14 lg:text-[1rem] " +
                      (on
                        ? "ring-pulse border-foreground bg-foreground text-background"
                        : x.available
                          ? "border-foreground/12 bg-card hover:border-foreground/50"
                          : others
                            ? "border-dashed border-foreground/18 bg-transparent text-foreground/55 hover:border-foreground/40"
                            : "border-transparent bg-foreground/[0.045] text-foreground/35")
                    }
                  >
                    {/* the chosen time: a soft bubble spreads from its centre */}
                    {on ? <span key={`bubble-${x.minute}`} aria-hidden className="slot-bubble" /> : null}
                    <span className={"relative " + (x.available || others ? "" : "line-through decoration-foreground/25")}>
                      {minuteLabel(x.minute)}
                    </span>
                    {!x.available ? (
                      <span className="relative text-[0.66rem] lg:text-[0.72rem]">
                        {others ? "Other stylists" : x.reason === "booked" ? "Booked" : "Unavailable"}
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
  // "Soonest" is the one place the date may change by itself: the guest asked
  // for the earliest free appointment, so find it (day by day) and select it.
  const [seeking, setSeeking] = useState(false);
  const [soonestNote, setSoonestNote] = useState("");
  const jumpSoonest = async () => {
    if (seeking) return;
    setSeeking(true);
    setSoonestNote("");
    try {
      const found = await findSoonest(days, draft.audience, draft.serviceIds, draft.staffId ?? null);
      if (!found) {
        setSoonestNote("No free times in the coming weeks. Please call us and we'll fit you in.");
        return;
      }
      haptic();
      if (found.date !== draft.date) sfx.dateSelect();
      setView(startOf(fromISO(found.date)));
      update({ date: found.date, time: found.minute });
      onPicked?.();
    } catch {
      setSoonestNote("Couldn't search right now. Please try again.");
    } finally {
      setSeeking(false);
    }
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
          onClick={() => void jumpSoonest()}
          disabled={seeking}
          aria-busy={seeking}
          className="press inline-flex h-11 items-center gap-2.5 rounded-sm border border-foreground/12 bg-card px-4 text-[0.88rem] hover:border-foreground/40 disabled:opacity-60"
        >
          <CalendarDays className="h-4 w-4" strokeWidth={1.25} />
          {seeking ? "Finding…" : "Soonest"}
        </button>
      </div>
      {soonestNote ? <p className="mt-3 text-[0.85rem] text-muted-foreground">{soonestNote}</p> : null}

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
              disabled={!inWindow}
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
  timeNote,
}: {
  days: { iso: string; date: Date; selectable: boolean }[];
  day: DayState;
  rawDay: DayState;
  timeNote: string;
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
          <div className="hidden min-w-0 flex-1 items-center gap-6 lg:flex">
            <SelectionThumb selected={selected} className="hidden h-12 w-12 xl:flex" />
            {/* nothing until the guest's saved services have loaded (never "0 min · ₹0") */}
            <div className={selected.length ? "min-w-0" : "invisible min-w-0"}>
              <div className="truncate font-display text-[1.6rem] leading-tight">
                {selected.length > 1 ? `${first?.name} + ${selected.length - 1} more` : first?.name}
              </div>
              <div className="mt-0.5 text-[0.95rem] text-muted-foreground">
                {formatDuration(totalMinutes)} · {inr(totalPrice)}
              </div>
            </div>
          </div>
          <div className="flex min-w-0 flex-1 items-center gap-6 py-2 text-[1rem] lg:flex-none lg:shrink-0 lg:border-x lg:border-hairline lg:px-6 xl:gap-8 xl:px-10">
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
