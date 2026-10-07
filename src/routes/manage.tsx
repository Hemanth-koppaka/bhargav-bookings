import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Page, Screen, ScreenHeader, PrimaryAction, GhostAction, Rule } from "@/components/screen";
import { useBooking, servicesOf, type Booking } from "@/lib/booking-store";
import {
  availableSlots,
  calendarDays,
  formatLongDate,
  inr,
  minuteLabel,
} from "@/lib/salon";

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

const field =
  "w-full border-0 border-b border-foreground/20 bg-transparent px-0 py-3 text-[1.05rem] outline-none transition-colors placeholder:text-foreground/30 focus:border-foreground";

function ManageScreen() {
  const { findBooking, bookings, cancelBooking, rescheduleBooking } = useBooking();
  const [reference, setReference] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [foundRef, setFoundRef] = useState<string | null>(null);

  const booking: Booking | undefined = foundRef
    ? bookings.find((b) => b.reference === foundRef)
    : undefined;

  const lookup = async () => {
    const b = await findBooking(reference, phone);
    if (!b) {
      setError("No booking matches that reference and mobile number. Please check both and try again.");
      setFoundRef(null);
      return;
    }
    setError("");
    setFoundRef(b.reference);
  };

  return (
    <Page>
      <ScreenHeader back="/" title="Manage booking" />
      <Screen>
        {!booking ? (
          <>
            <h1 className="mt-2 font-display text-4xl leading-tight sm:text-5xl">
              Find your <span className="italic">appointment.</span>
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">
              Enter the reference from your confirmation and the mobile number you booked with.
            </p>

            <div className="mt-10 space-y-8">
              <div>
                <label className="eyebrow" htmlFor="ref">
                  Booking reference
                </label>
                <input
                  id="ref"
                  className={field + " uppercase"}
                  value={reference}
                  onChange={(e) => setReference(e.target.value)}
                  placeholder="HB-XXXXXX"
                />
              </div>
              <div>
                <label className="eyebrow" htmlFor="mphone">
                  Mobile number
                </label>
                <input
                  id="mphone"
                  className={field}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="10-digit mobile"
                  inputMode="tel"
                />
              </div>
              {error ? <p className="text-xs text-destructive">{error}</p> : null}
              <PrimaryAction onClick={lookup}>Find booking</PrimaryAction>
            </div>
          </>
        ) : (
          <BookingPanel
            booking={booking}
            onCancel={() => cancelBooking(booking.reference)}
            onReschedule={(date, time) => rescheduleBooking(booking.reference, date, time)}
            onBack={() => setFoundRef(null)}
          />
        )}
      </Screen>
    </Page>
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
  const now = useMemo(() => new Date(), []);
  const days = useMemo(() => calendarDays(56, now), [now]);
  const slots = useMemo(() => availableSlots(date, slotsNeeded, now), [date, slotsNeeded, now]);

  return (
    <div>
      <div className="mt-2 flex items-baseline justify-between">
        <div className="eyebrow">{booking.reference}</div>
        <button onClick={onBack} className="label-caps text-foreground/50">
          Search again
        </button>
      </div>

      <h1 className="mt-4 font-display text-4xl leading-tight">
        {cancelled ? (
          <span className="italic text-foreground/50">Cancelled.</span>
        ) : (
          <>
            {formatLongDate(booking.date)}
            <br />
            <span className="italic">{minuteLabel(booking.time)}</span>
          </>
        )}
      </h1>

      <div className="mt-8 border border-foreground/15 bg-card px-6 py-6">
        <div className="eyebrow">Services</div>
        <ul className="mt-3 space-y-1.5">
          {services.map((s) => (
            <li key={s.id} className="flex justify-between gap-4 text-[0.92rem]">
              <span>{s.name}</span>
              <span className="text-muted-foreground">{inr(s.price)}</span>
            </li>
          ))}
        </ul>
        <div className="my-5">
          <Rule />
        </div>
        <div className="flex items-baseline justify-between">
          <span className="label-caps text-foreground/60">Estimated total</span>
          <span className="font-display text-2xl">{inr(total)}</span>
        </div>
        <div className="mt-5 text-sm text-muted-foreground">
          {booking.customer.name} · {booking.customer.phone}
        </div>
      </div>

      {cancelled ? null : mode === "view" ? (
        <div className="mt-8 space-y-3">
          <GhostAction onClick={() => setMode("reschedule")}>Reschedule</GhostAction>
          <GhostAction
            onClick={() => setMode("confirm-cancel")}
            className="border-destructive/30 text-destructive hover:border-destructive/70"
          >
            Cancel booking
          </GhostAction>
        </div>
      ) : mode === "confirm-cancel" ? (
        <div className="mt-8 border border-destructive/25 px-6 py-6">
          <p className="text-sm leading-relaxed">
            Cancel this appointment? Your slot will be released immediately.
          </p>
          <div className="mt-6 space-y-3">
            <GhostAction
              onClick={onCancel}
              className="border-destructive/40 text-destructive hover:border-destructive"
            >
              Yes, cancel it
            </GhostAction>
            <GhostAction onClick={() => setMode("view")}>Keep my booking</GhostAction>
          </div>
        </div>
      ) : (
        <div className="mt-10">
          <div className="eyebrow">Pick a new date</div>
          <div className="-mx-6 mt-4 overflow-x-auto px-6 pb-2">
            <div className="flex gap-2">
              {days.map((d) => {
                const on = date === d.iso;
                return (
                  <button
                    key={d.iso}
                    disabled={!d.selectable}
                    onClick={() => {
                      setDate(d.iso);
                      setTime(null);
                    }}
                    className={
                      "flex w-16 shrink-0 flex-col items-center border py-3 transition-colors " +
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

          <div className="mt-8 grid grid-cols-3 gap-2 sm:grid-cols-4">
            {slots.map((s) => {
              const on = time === s.minute;
              return (
                <button
                  key={s.minute}
                  disabled={!s.available}
                  onClick={() => setTime(s.minute)}
                  className={
                    "border py-3.5 text-[0.78rem] tracking-[0.08em] transition-colors " +
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

          <div className="mt-8 space-y-3">
            <PrimaryAction
              disabled={time == null}
              onClick={() => {
                if (time == null) return;
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
