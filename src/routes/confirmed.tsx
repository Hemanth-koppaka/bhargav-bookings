import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { Page, Screen, Rule } from "@/components/screen";
import { useBooking, servicesOf } from "@/lib/booking-store";
import { BUSINESS, formatLongDate, inr, minuteLabel } from "@/lib/salon";

export const Route = createFileRoute("/confirmed")({
  validateSearch: (search: Record<string, unknown>) => ({
    ref: typeof search['ref'] === "string" ? search['ref'] : "",
  }),
  head: () => ({
    meta: [
      { title: "Booking confirmed — Hair by Bhargav" },
      {
        name: "description",
        content: "Your chair is reserved at Hair by Bhargav, KPHB Phase 9, Kukatpally, Hyderabad.",
      },
      { property: "og:title", content: "Booking confirmed — Hair by Bhargav" },
      { property: "og:description", content: "Your chair is reserved." },
    ],
  }),
  component: ConfirmedScreen,
});

function ConfirmedScreen() {
  const { ref } = Route.useSearch();
  const { bookings, hydrated, resetDraft } = useBooking();
  const booking = bookings.find((b) => b.reference === ref);

  useEffect(() => {
    if (hydrated && booking) resetDraft();
  }, [hydrated, Boolean(booking)]);

  if (!hydrated) return null;

  if (!booking) {
    return (
      <Page>
        <Screen center>
          <h1 className="font-display text-4xl">Booking not found</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            We couldn't find that reference on this device.
          </p>
          <Link to="/" className="label-caps mt-8 inline-flex border-b border-foreground/30 pb-1">
            Return home
          </Link>
        </Screen>
      </Page>
    );
  }

  const services = servicesOf(booking);
  const total = services.reduce((n, s) => n + s.price, 0);
  const plus = services.some((s) => s.from);

  return (
    <Page>
      <Screen center className="pt-16">
        <div className="mx-auto flex h-14 w-14 items-center justify-center border border-foreground/25 text-xl">
          ✓
        </div>
        <h1 className="mt-8 text-center font-display text-5xl leading-[0.95]">
          Your chair
          <br />
          <span className="italic">is reserved.</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xs text-center text-sm text-muted-foreground">
          We've noted everything down. Please arrive five minutes early.
        </p>

        <div className="mt-10 border border-foreground/15 bg-card px-6 py-7">
          <div className="text-center">
            <div className="eyebrow">Reference</div>
            <div className="mt-2 font-display text-3xl tracking-[0.08em]">{booking.reference}</div>
          </div>

          <div className="my-6">
            <Rule />
          </div>

          <div className="eyebrow">When</div>
          <div className="mt-2 font-display text-2xl">
            {formatLongDate(booking.date)} · {minuteLabel(booking.time)}
          </div>

          <div className="mt-6 eyebrow">Services</div>
          <ul className="mt-2 space-y-1.5">
            {services.map((s) => (
              <li key={s.id} className="flex justify-between gap-4 text-[0.92rem]">
                <span>{s.name}</span>
                <span className="text-muted-foreground">{inr(s.price)}</span>
              </li>
            ))}
          </ul>

          <div className="my-6">
            <Rule />
          </div>

          <div className="flex items-baseline justify-between">
            <span className="label-caps text-foreground/60">Estimated total</span>
            <span className="font-display text-2xl">
              {inr(total)}
              {plus ? "+" : ""}
            </span>
          </div>
        </div>

        <div className="mt-8 text-center text-sm leading-relaxed text-muted-foreground">
          {BUSINESS.address}
        </div>

        <div className="mt-8 space-y-3">
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(BUSINESS.mapsQuery)}`}
            target="_blank"
            rel="noreferrer"
            className="label-caps flex w-full items-center justify-center border border-foreground/20 px-6 py-4 transition-colors hover:border-foreground/50"
          >
            Get directions
          </a>
          <Link
            to="/manage"
            className="label-caps flex w-full items-center justify-center border border-foreground/20 px-6 py-4 transition-colors hover:border-foreground/50"
          >
            Manage this booking
          </Link>
          <Link
            to="/"
            className="label-caps flex w-full items-center justify-center py-3 text-foreground/60"
          >
            Done
          </Link>
        </div>
      </Screen>
    </Page>
  );
}
