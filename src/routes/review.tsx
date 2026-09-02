import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { Page, Screen, ScreenHeader, StickyBar, PrimaryAction, Rule } from "@/components/screen";
import { useBooking } from "@/lib/booking-store";
import { formatDuration, formatLongDate, inr, minuteLabel } from "@/lib/salon";

export const Route = createFileRoute("/review")({
  head: () => ({
    meta: [
      { title: "Review your appointment — Hair by Bhargav" },
      {
        name: "description",
        content: "Check your services, date, time and details before confirming with Hair by Bhargav.",
      },
      { property: "og:title", content: "Review your appointment — Hair by Bhargav" },
      { property: "og:description", content: "One last look before you confirm." },
    ],
  }),
  component: ReviewScreen,
});

function ReviewScreen() {
  const {
    draft,
    hydrated,
    selected,
    totalSlots,
    totalPrice,
    hasFromPricing,
    removeService,
    commitBooking,
  } = useBooking();
  const navigate = useNavigate();

  const ready = Boolean(draft.date && draft.time != null && draft.customer && selected.length);

  useEffect(() => {
    if (hydrated && !ready) navigate({ to: "/book" });
  }, [hydrated, ready, navigate]);

  if (!ready || !draft.customer || !draft.date || draft.time == null) return null;

  const confirm = () => {
    const b = commitBooking();
    if (b) navigate({ to: "/confirmed", search: { ref: b.reference, seq: 1 } });
  };

  return (
    <Page>
      <ScreenHeader back="/details" title="Step 5 of 5" />
      <Screen>
        <h1 className="mt-2 font-display text-4xl leading-tight sm:text-5xl">
          Everything <span className="italic">right?</span>
        </h1>

        <section className="mt-10">
          <div className="flex items-baseline justify-between">
            <div className="eyebrow">Services</div>
            <Link to="/services" className="label-caps border-b border-foreground/30 pb-0.5">
              Edit
            </Link>
          </div>
          <ul className="mt-4 space-y-3">
            {selected.map((s) => (
              <li key={s.id} className="flex items-baseline justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-[0.95rem]">{s.name}</div>
                  <div className="mt-0.5 text-[0.7rem] tracking-[0.14em] uppercase text-muted-foreground">
                    {formatDuration(s.slots)}
                  </div>
                </div>
                <div className="flex items-baseline gap-4">
                  <span className="text-sm text-muted-foreground">
                    {inr(s.price)}
                    {s.from ? "+" : ""}
                  </span>
                  <button
                    onClick={() => removeService(s.id)}
                    className="text-xs text-foreground/40 transition-colors hover:text-destructive"
                    aria-label={`Remove ${s.name}`}
                  >
                    ✕
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <div className="my-8">
          <Rule />
        </div>

        <section>
          <div className="flex items-baseline justify-between">
            <div className="eyebrow">When</div>
            <Link to="/time" className="label-caps border-b border-foreground/30 pb-0.5">
              Edit
            </Link>
          </div>
          <div className="mt-4 font-display text-2xl">
            {formatLongDate(draft.date)} · {minuteLabel(draft.time)}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            Approximately {formatDuration(totalSlots)}
          </div>
        </section>

        <div className="my-8">
          <Rule />
        </div>

        <section>
          <div className="flex items-baseline justify-between">
            <div className="eyebrow">Your details</div>
            <Link to="/details" className="label-caps border-b border-foreground/30 pb-0.5">
              Edit
            </Link>
          </div>
          <div className="mt-4 space-y-1 text-[0.95rem]">
            <div>{draft.customer.name}</div>
            <div className="text-muted-foreground">{draft.customer.phone}</div>
            {draft.customer.email ? (
              <div className="text-muted-foreground">{draft.customer.email}</div>
            ) : null}
            {draft.customer.notes ? (
              <p className="pt-2 text-sm leading-relaxed text-muted-foreground">
                {draft.customer.notes}
              </p>
            ) : null}
          </div>
        </section>

        <p className="mt-10 text-xs leading-relaxed text-muted-foreground">
          Prices marked "onwards" are confirmed in the chair, based on hair length and density. No
          payment is taken online.
        </p>
      </Screen>

      <StickyBar>
        <div className="mb-3 flex items-baseline justify-between">
          <div className="label-caps text-foreground/60">Estimated total</div>
          <div className="font-display text-2xl">
            {inr(totalPrice)}
            {hasFromPricing ? "+" : ""}
          </div>
        </div>
        <PrimaryAction onClick={confirm}>Confirm booking</PrimaryAction>
      </StickyBar>
    </Page>
  );
}
