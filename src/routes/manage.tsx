import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CalendarDays, ChevronRight, Clock, Search } from "lucide-react";
import { GhostAction, PrimaryAction } from "@/components/screen";
import { InfoPage, InfoTitle, SectionLabel } from "@/components/info-page";
import { ScrollStrip, prettyPhone } from "@/components/desktop";
import { useBooking, servicesOf, type Booking } from "@/lib/booking-store";
import { getBusySlots } from "@/lib/salon.functions";
import { availableSlots, calendarDays, formatDuration, fromISO, inr, minuteLabel } from "@/lib/salon";
import { haptic } from "@/lib/utils";
import portrait from "@/assets/portrait.jpg.asset.json";

export const Route = createFileRoute("/manage")({
  head: () => ({
    meta: [
      { title: "Manage your booking — Hair by Bhargav" },
      {
        name: "description",
        content:
          "Look up your appointment with your reference and mobile number to reschedule or cancel at Hair by Bhargav.",
      },
      { property: "og:title", content: "Manage your booking — Hair by Bhargav" },
      { property: "og:description", content: "Reschedule or cancel an existing appointment." },
    ],
  }),
  component: ManageScreen,
});

const box =
  "w-full rounded-sm border border-foreground/18 bg-card px-5 py-4 text-[1.05rem] outline-none transition-colors placeholder:text-foreground/35 focus:border-foreground/60";

const longDate = (iso: string) =>
  fromISO(iso).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });

function ManageScreen() {
  const { findBooking, bookings, cancelBooking, rescheduleBooking } = useBooking();
  const [reference, setReference] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [searching, setSearching] = useState(false);
  const [foundRef, setFoundRef] = useState<string | null>(null);

  const booking: Booking | undefined = foundRef ? bookings.find((b) => b.reference === foundRef) : undefined;
  const recent = bookings.filter((b) => b.status === "confirmed").slice(0, 3);

  const lookup = async (e?: FormEvent) => {
    e?.preventDefault();
    if (searching) return;
    setSearching(true);
    const b = await findBooking(reference.trim().toUpperCase(), phone);
    setSearching(false);
    setAttempt((n) => n + 1);
    if (!b) {
      haptic(20);
      setError("No booking matches that reference and mobile number. Please check both and try again.");
      setFoundRef(null);
      return;
    }
    setError("");
    setFoundRef(b.reference);
  };

  return (
    <InfoPage
      label="Manage"
      image={portrait.url}
      panelEyebrow="Plans change"
      panelTitle={
        <>
          We'll keep
          <br />
          <span className="italic text-champagne">your chair.</span>
        </>
      }
      panelSub="Reschedule or cancel in a few taps."
    >
      {!booking ? (
        <>
          <InfoTitle
            eyebrow="Manage booking"
            sub="Enter the reference from your confirmation and the mobile number you booked with."
          >
            Find your <span className="italic text-bronze">appointment.</span>
          </InfoTitle>

          {recent.length ? (
            <div className="mt-9">
              <SectionLabel>On this device</SectionLabel>
              <ul className="stagger mt-4 space-y-2.5">
                {recent.map((b) => (
                  <li key={b.reference}>
                    <button
                      onClick={() => setFoundRef(b.reference)}
                      className="press group flex w-full items-center gap-4 rounded-md border border-hairline bg-card p-4 text-left hover:border-foreground/30"
                    >
                      <span className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-md bg-champagne/18 text-bronze">
                        <span className="text-[0.55rem] uppercase tracking-[0.16em]">
                          {fromISO(b.date).toLocaleDateString("en-GB", { month: "short" })}
                        </span>
                        <span className="font-display text-[1.35rem] leading-none">{fromISO(b.date).getDate()}</span>
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.98rem]">
                          {servicesOf(b).map((x) => x.name).join(", ")}
                        </span>
                        <span className="mt-0.5 block text-[0.8rem] text-muted-foreground">
                          {minuteLabel(b.time)} · {b.reference}
                        </span>
                      </span>
                      <ChevronRight
                        className="h-4 w-4 text-foreground/40 transition-transform group-hover:translate-x-0.5"
                        strokeWidth={1.25}
                      />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <form noValidate onSubmit={lookup} className="mt-9">
            {recent.length ? <SectionLabel>Or look it up</SectionLabel> : null}
            <div className={recent.length ? "mt-5 space-y-5" : "space-y-5"}>
              <div>
                <label className="mb-3 block text-[0.68rem] uppercase tracking-[0.28em] text-foreground/75" htmlFor="ref">
                  Booking reference
                </label>
                <input
                  id="ref"
                  className={box + " uppercase tracking-[0.12em] placeholder:normal-case placeholder:tracking-normal"}
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="HB-XXXXXX"
                  autoCapitalize="characters"
                  autoComplete="off"
                />
              </div>
              <div>
                <label className="mb-3 block text-[0.68rem] uppercase tracking-[0.28em] text-foreground/75" htmlFor="mphone">
                  Mobile number
                </label>
                <div className="flex items-stretch rounded-sm border border-foreground/18 bg-card transition-colors focus-within:border-foreground/60">
                  <span className="flex items-center border-r border-foreground/12 px-5 text-[1.05rem] text-foreground/80">+91</span>
                  <input
                    id="mphone"
                    className="min-w-0 flex-1 bg-transparent px-5 py-4 text-[1.05rem] outline-none placeholder:text-foreground/35"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="10-digit mobile"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel-national"
                  />
                </div>
              </div>
              {error ? (
                <p key={attempt} role="alert" className="shake text-[0.88rem] text-destructive">
                  {error}
                </p>
              ) : null}
              <PrimaryAction type="submit" disabled={searching || !reference.trim() || !phone.trim()}>
                <span className="inline-flex items-center gap-3">
                  <Search className="h-4 w-4" strokeWidth={1.25} />
                  {searching ? "Searching…" : "Find booking"}
                </span>
              </PrimaryAction>
            </div>
          </form>
        </>
      ) : (
        <BookingPanel
          booking={booking}
          onCancel={() => cancelBooking(booking.reference)}
          onReschedule={(date, time) => rescheduleBooking(booking.reference, date, time)}
          onBack={() => setFoundRef(null)}
        />
      )}
    </InfoPage>
  );
}

function BookingPanel({
  booking,
  onCancel,
  onReschedule,
  onBack,
}: {
  booking: Booking;
  onCancel: () => void;
  onReschedule: (date: string, time: number) => void;
  onBack: () => void;
}) {
  const services = servicesOf(booking);
  const total = services.reduce((n, s) => n + s.price, 0);
  const slotsNeeded = services.reduce((n, s) => n + s.slots, 0);
  const cancelled = booking.status === "cancelled";

  const [mode, setMode] = useState<"view" | "reschedule" | "confirm-cancel">("view");
  const [date, setDate] = useState(booking.date);
  const [time, setTime] = useState<number | null>(null);
  const [busy, setBusy] = useState<{ time: number; slots: number }[]>([]);
  const now = useMemo(() => new Date(), []);
  const days = useMemo(() => calendarDays(56, now), [now]);

  useEffect(() => {
    if (mode !== "reschedule") return;
    let live = true;
    setBusy([]);
    getBusySlots({ data: { date } })
      .then((r) => {
        if (!live) return;
        // don't let the booking block itself when moving within the same day
        setBusy(date === booking.date ? r.busy.filter((b) => b.time !== booking.time) : r.busy);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [date, mode, booking.date, booking.time]);

  const slots = useMemo(() => availableSlots(date, slotsNeeded, now, busy), [date, slotsNeeded, now, busy]);

  return (
    <div className="page-in">
      <div className="flex items-center justify-between">
        <span
          className={
            "inline-flex items-center gap-2 rounded-full px-3 py-1 text-[0.68rem] uppercase tracking-[0.2em] " +
            (cancelled ? "bg-foreground/8 text-foreground/55" : "bg-emerald-600/10 text-emerald-800")
          }
        >
          <span className={"h-1.5 w-1.5 rounded-full " + (cancelled ? "bg-foreground/40" : "bg-emerald-600")} />
          {cancelled ? "Cancelled" : "Confirmed"}
        </span>
        <button onClick={onBack} className="press text-[0.85rem] text-bronze underline underline-offset-4">
          Search again
        </button>
      </div>

      <div className="mt-6 text-[0.62rem] uppercase tracking-[0.3em] text-muted-foreground">
        Reservation · {booking.reference}
      </div>
      <h1
        className={
          "mt-3 font-display text-[clamp(2.4rem,10vw,3rem)] leading-[1.02] lg:text-[3.6rem] " +
          (cancelled ? "text-foreground/45 line-through decoration-1" : "")
        }
      >
        {longDate(booking.date)}
        <br />
        <span className="italic text-bronze">{minuteLabel(booking.time)}</span>
      </h1>

      <div className="mt-8 rounded-md border border-hairline bg-card p-5 lg:p-6">
        <ul className="space-y-2">
          {services.map((x) => (
            <li key={x.id} className="flex items-baseline justify-between gap-4">
              <span className="text-[1rem]">{x.name}</span>
              <span className="text-[0.9rem] text-muted-foreground">
                {inr(x.price)}
                {x.from ? "+" : ""}
              </span>
            </li>
          ))}
        </ul>
        <div className="mt-4 flex items-center gap-5 text-[0.85rem] text-muted-foreground">
          <span className="flex items-center gap-2">
            <Clock className="h-3.5 w-3.5" strokeWidth={1.25} />
            {formatDuration(slotsNeeded || 1)}
          </span>
          <span>
            {booking.customer.name} · {prettyPhone(booking.customer.phone)}
          </span>
        </div>
        <div className="mt-4 flex items-baseline justify-between hairline-t pt-4">
          <span className="text-[0.62rem] uppercase tracking-[0.28em] text-foreground/65">Estimated total</span>
          <span className="font-display text-[1.8rem] leading-none">{inr(total)}</span>
        </div>
      </div>

      {cancelled ? null : mode === "view" ? (
        <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
          <PrimaryAction onClick={() => setMode("reschedule")}>Reschedule</PrimaryAction>
          <GhostAction
            onClick={() => setMode("confirm-cancel")}
            className="border-destructive/30 text-destructive hover:border-destructive/70"
          >
            Cancel booking
          </GhostAction>
        </div>
      ) : mode === "confirm-cancel" ? (
        <div className="page-in mt-6 rounded-md border border-destructive/25 bg-destructive/[0.03] p-5">
          <p className="text-[0.95rem] leading-relaxed">Cancel this appointment? Your slot will be released immediately.</p>
          <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
            <GhostAction
              onClick={() => {
                haptic(20);
                onCancel();
                setMode("view");
              }}
              className="border-destructive/40 text-destructive hover:border-destructive"
            >
              Yes, cancel it
            </GhostAction>
            <GhostAction onClick={() => setMode("view")}>Keep my booking</GhostAction>
          </div>
        </div>
      ) : (
        <div className="page-in mt-8">
          <SectionLabel>
            <CalendarDays className="h-3.5 w-3.5" strokeWidth={1.25} /> Pick a new date
          </SectionLabel>
          <ScrollStrip label="Pick a new date" className="mt-4">
            <div className="flex w-max gap-2 pb-1">
              {days.map((d) => {
                const on = date === d.iso;
                return (
                  <button
                    key={d.iso}
                    disabled={!d.selectable}
                    aria-pressed={on}
                    onClick={() => {
                      haptic();
                      setDate(d.iso);
                      setTime(null);
                    }}
                    className={
                      "press flex w-16 shrink-0 flex-col items-center rounded-md border py-2.5 " +
                      (on
                        ? "border-foreground bg-foreground text-background"
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
          </ScrollStrip>

          <div key={date} className="stagger mt-6 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {slots.map((x) => {
              const on = time === x.minute;
              return (
                <button
                  key={x.minute}
                  disabled={!x.available}
                  aria-pressed={on}
                  onClick={() => {
                    haptic();
                    setTime(x.minute);
                  }}
                  className={
                    "press min-h-12 rounded-md border px-1 text-[0.92rem] tabular-nums " +
                    (on
                      ? "ring-pulse border-foreground bg-foreground text-background"
                      : x.available
                        ? "border-foreground/12 bg-card hover:border-foreground/50"
                        : "border-transparent bg-foreground/[0.045] text-foreground/30")
                  }
                >
                  {minuteLabel(x.minute)}
                </button>
              );
            })}
          </div>
          {slots.length === 0 ? (
            <p className="mt-4 text-[0.9rem] text-muted-foreground">The salon is closed on this day.</p>
          ) : null}

          <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
            <PrimaryAction
              disabled={time == null}
              onClick={() => {
                if (time == null) return;
                haptic(15);
                onReschedule(date, time);
                setMode("view");
              }}
            >
              Move appointment
            </PrimaryAction>
            <GhostAction onClick={() => setMode("view")}>Never mind</GhostAction>
          </div>
        </div>
      )}
    </div>
  );
}
