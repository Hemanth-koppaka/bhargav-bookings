import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ArrowUpRight, CalendarDays, Lock, MapPin, Pencil, X } from "lucide-react";
import { Page, Screen, ScreenHeader, StickyBar, PrimaryAction, Rule } from "@/components/screen";
import {
  AUDIENCE_IMAGE,
  Accent,
  DesktopBar,
  DesktopCTA,
  DesktopPage,
  DesktopStepHeader,
  StepTitle,
  Thumb,
  prettyPhone,
} from "@/components/desktop";
import { useBooking } from "@/lib/booking-store";
import { BUSINESS, formatDuration, formatLongDate, fromISO, inr, minuteLabel } from "@/lib/salon";

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
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  const ready = Boolean(draft.date && draft.time != null && draft.customer && selected.length);

  useEffect(() => {
    if (hydrated && !ready) navigate({ to: "/book" });
  }, [hydrated, ready, navigate]);

  if (!ready || !draft.customer || !draft.date || draft.time == null) return null;

  const confirm = async () => {
    if (saving) return;
    setSaving(true);
    setSaveError("");
    const res = await commitBooking();
    setSaving(false);
    if ("error" in res) setSaveError(res.error);
    else navigate({ to: "/confirmed", search: { ref: res.booking.reference, seq: 1 } });
  };

  return (
    <>
    <DesktopReview confirm={confirm} saving={saving} saveError={saveError} />
    <div className="lg:hidden">
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
    </div>
    </>
  );
}

function Card({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-sm border border-hairline bg-card">
      <div className="mx-7 flex items-center justify-between hairline-b py-4">
        <h2 className="font-sans text-[0.78rem] font-normal uppercase tracking-[0.3em]">{title}</h2>
        {action}
      </div>
      <div className="px-7 py-4">{children}</div>
    </section>
  );
}

function EditLink({ to }: { to: "/services" | "/time" | "/details" }) {
  return (
    <Link to={to} className="inline-flex items-center gap-2 text-[0.95rem] text-bronze">
      <span className="underline underline-offset-4">Edit</span>
      <Pencil className="h-4 w-4" strokeWidth={1.25} />
    </Link>
  );
}

function DesktopReview({
  confirm,
  saving,
  saveError,
}: {
  confirm: () => void;
  saving: boolean;
  saveError: string;
}) {
  const { draft, selected, totalSlots, totalPrice, hasFromPricing, removeService } = useBooking();
  if (!draft.customer || !draft.date || draft.time == null) return null;
  const img = AUDIENCE_IMAGE[draft.audience ?? "men"];
  const c = draft.customer;
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(BUSINESS.mapsQuery)}`;
  const embedUrl = `https://maps.google.com/maps?q=${encodeURIComponent(BUSINESS.mapsQuery)}&z=15&output=embed`;
  const [line1, ...line2] = BUSINESS.address.split(", KPHB");

  return (
    <DesktopPage>
      <DesktopStepHeader back="/details" step={5} />

      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
        <main className="page-in mx-auto max-w-6xl px-14 py-6">
          <StepTitle step="five">
            Review your <Accent>appointment</Accent>
          </StepTitle>
          <p className="mt-2 text-[1.1rem] text-muted-foreground">
            Please check your details below. You can edit them if needed.
          </p>

          <div className="mt-6 space-y-3.5">
            <Card title="Appointment details" action={<EditLink to="/services" />}>
              <div className="flex items-center gap-7">
                <Thumb src={img.src} pos={img.pos} className="h-24 w-24" />
                <div className="min-w-0 flex-1">
                  <ul className="space-y-1">
                    {selected.map((x) => (
                      <li key={x.id} className="group flex items-center gap-3">
                        <span className="font-display text-[1.7rem] leading-tight">{x.name}</span>
                        {selected.length > 1 ? (
                          <span className="text-[0.9rem] text-muted-foreground">
                            {inr(x.price)}
                            {x.from ? "+" : ""}
                          </span>
                        ) : null}
                        {selected.length > 1 ? (
                          <button
                            onClick={() => removeService(x.id)}
                            aria-label={`Remove ${x.name}`}
                            className="text-foreground/35 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
                          >
                            <X className="h-4 w-4" strokeWidth={1.25} />
                          </button>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                  <div className="mt-1.5 text-[1.1rem] text-muted-foreground">
                    {fromISO(draft.date).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
                  </div>
                  <div className="mt-1 flex items-center gap-4 text-[1.1rem] text-muted-foreground">
                    {minuteLabel(draft.time)} · {formatDuration(totalSlots)}
                    <Link to="/time" className="text-[0.9rem] text-bronze underline underline-offset-4">
                      Change time
                    </Link>
                  </div>
                </div>
                <div className="self-stretch border-l border-hairline pl-14 pr-6">
                  <div className="flex h-full flex-col justify-center">
                    <div className="text-[0.72rem] uppercase tracking-[0.3em] text-foreground/70">
                      {hasFromPricing ? "Estimated price" : "Price"}
                    </div>
                    <div className="mt-2 font-display text-[2.2rem] leading-none">
                      {inr(totalPrice)}
                      {hasFromPricing ? "+" : ""}
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            <Card title="Your details" action={<EditLink to="/details" />}>
              <dl className="grid grid-cols-3 divide-x divide-hairline">
                {[
                  ["Full name", c.name],
                  ["Mobile number", prettyPhone(c.phone)],
                  ["Email (optional)", c.email || "—"],
                ].map(([k, v]) => (
                  <div key={k} className="px-8 first:pl-0">
                    <dt className="text-[0.68rem] uppercase tracking-[0.26em] text-muted-foreground">{k}</dt>
                    <dd className="mt-2 truncate text-[1.1rem]">{v}</dd>
                  </div>
                ))}
              </dl>
              {c.notes ? (
                <p className="mt-5 hairline-t pt-4 text-[0.95rem] leading-relaxed text-muted-foreground">
                  <span className="mr-3 text-[0.68rem] uppercase tracking-[0.26em]">Note</span>
                  {c.notes}
                </p>
              ) : null}
            </Card>

            <Card
              title="Studio location"
              action={
                <a href={mapsUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-[0.95rem] text-bronze">
                  <span className="underline underline-offset-4">Directions</span>
                  <ArrowUpRight className="h-4 w-4" strokeWidth={1.25} />
                </a>
              }
            >
              <div className="flex items-center gap-7">
                <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-champagne/20 text-bronze">
                  <MapPin className="h-5 w-5" strokeWidth={1.25} />
                </span>
                <address className="flex-1 text-[1.1rem] not-italic leading-relaxed">
                  {line1},
                  <br />
                  KPHB{line2.join(", KPHB")}
                </address>
                <iframe
                  title="Map to the studio"
                  src={embedUrl}
                  loading="lazy"
                  referrerPolicy="no-referrer-when-downgrade"
                  className="h-24 w-80 shrink-0 rounded-sm border-0 bg-muted grayscale"
                />
              </div>
            </Card>

            <div className="flex items-center gap-5 rounded-sm bg-champagne/15 px-7 py-4 text-[0.95rem]">
              <CalendarDays className="h-5 w-5 shrink-0" strokeWidth={1.25} />
              <span>
                Need a change later? Reschedule or cancel any time from{" "}
                <Link to="/manage" className="underline underline-offset-4">Manage booking</Link>. No payment is taken online
                {hasFromPricing ? " — prices marked + are confirmed in the chair" : ""}.
              </span>
            </div>
          </div>
        </main>
      </div>

      <DesktopBar>
        <div className="flex-1">
          {saveError ? (
            <p role="alert" className="text-[0.95rem] text-destructive">{saveError}</p>
          ) : (
            <p className="flex items-center gap-3 text-[0.95rem] text-muted-foreground">
              <Lock className="h-4 w-4" strokeWidth={1.25} />
              Your details are only used to manage your appointment.
            </p>
          )}
        </div>
        <DesktopCTA onClick={confirm} disabled={saving} className="min-w-[30rem] justify-between">
          {saving ? "Confirming…" : "Confirm appointment"}
        </DesktopCTA>
      </DesktopBar>
    </DesktopPage>
  );
}
