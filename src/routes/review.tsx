import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { CONTENT } from "@/lib/site-content";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ArrowUpRight, Lock, MapPin, Pencil, X } from "lucide-react";
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
  prettyPhone,
} from "@/components/desktop";
import { useBooking } from "@/lib/booking-store";
import { cn, haptic } from "@/lib/utils";
import { useChangeDeadline } from "@/lib/change-deadline";
import { sfx } from "@/lib/sfx";
import { ServiceGlyph, serviceKind } from "@/components/service-icons";
import { BUSINESS, SERVICE_RULES, STYLISTS, formatDuration, fromISO, inr, minuteLabel } from "@/lib/salon";
import { preferredFor } from "@/lib/service-rules";

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
    totalMinutes,
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

  // warm the confirmation film's photo so it starts the moment the guest confirms
  useEffect(() => {
    const img = new Image();
    img.src = "/media/barber-kit.webp";
  }, []);

  // the guest's promise to come, or to tell the salon in advance
  const [pledged, setPledged] = useState(false);
  const [nudge, setNudge] = useState(0);

  if (!ready || !draft.customer || !draft.date || draft.time == null) return null;
  const confirm = async () => {
    if (saving) return;
    if (!pledged) {
      haptic(20);
      sfx.error();
      setNudge((n) => n + 1);
      // the phone and laptop layouts each have the box: scroll to the one on screen,
      // after the nudge re-renders it
      window.requestAnimationFrame(() => {
        const box = [...document.querySelectorAll<HTMLElement>("[data-attendance]")].find((el) => el.offsetParent !== null);
        box?.scrollIntoView({ behavior: "smooth", block: "center" });
        box?.querySelector<HTMLInputElement>("input[type=checkbox]")?.focus({ preventScroll: true });
      });
      return;
    }
    setSaving(true);
    setSaveError("");
    const res = await commitBooking();
    setSaving(false);
    if ("error" in res) {
      haptic(30);
      sfx.error();
      setSaveError(res.error);
      return;
    }
    haptic(15);
    sfx.ambience(); // the room breathes in as the confirmation film begins
    navigate({ to: "/confirmed", search: { ref: res.booking.reference, seq: 1 } });
  };

  const img = selectionImage(selected, draft.audience);
  const c = draft.customer;

  return (
    <>
      <DesktopReview
        confirm={confirm}
        saving={saving}
        saveError={saveError}
        pledge={<AttendancePledge checked={pledged} onChange={setPledged} nudge={nudge} fromPricing={hasFromPricing} />}
      />
      <div className="md:hidden">
        <Page>
          <StepHeader back="/details" step={5} />
          <Screen className="px-5">
            <StepIntro eyebrow="Step five" sub="One last look. You can edit anything below.">
              Review your <span className="italic text-bronze">appointment.</span>
            </StepIntro>

            <div className="stagger mt-6 space-y-3">
              <Card title="Appointment" action={<EditLink to="/services" />}>
                <div className="flex gap-4">
                  <Thumb src={img.src} pos={img.pos} fit={img.fit} className="h-20 w-20" />
                  <div className="min-w-0 flex-1">
                    <ul className="space-y-1">
                      {selected.map((x) => (
                        <li key={x.id} className="flex items-baseline justify-between gap-3">
                          <span className="flex items-center gap-2.5 font-display text-[1.35rem] leading-tight">
                            <ServiceGlyph kind={serviceKind(x)} className="h-4 w-4 shrink-0 text-bronze" />
                            {x.name}
                          </span>
                          {selected.length > 1 ? (
                            <span className="flex shrink-0 items-center gap-2 text-[0.82rem] text-muted-foreground">
                              {inr(x.price)}
                              {x.from ? "+" : ""}
                              <button
                                onClick={() => removeService(x.id)}
                                aria-label={`Remove ${x.name}`}
                                className="press -m-2 inline-flex h-8 w-8 items-center justify-center rounded-full text-foreground/40 hover:text-destructive"
                              >
                                <X className="h-3.5 w-3.5" strokeWidth={1.5} />
                              </button>
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-1.5 text-[0.88rem] text-muted-foreground">
                      {fromISO(draft.date).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-3 text-[0.88rem] text-muted-foreground">
                      <span>
                        {minuteLabel(draft.time)} · {formatDuration(totalMinutes)}
                        {STYLISTS.length ? ` · ${stylistLabel(draft.staffId, draft.serviceIds)}` : ""}
                      </span>
                      <Link to="/time" className="text-[0.8rem] text-bronze underline underline-offset-4">
                        Change time
                      </Link>
                    </div>
                  </div>
                </div>
              </Card>

              <Card title="Your details" action={<EditLink to="/details" />}>
                <dl className="space-y-3">
                  {[
                    ["Full name", c.name],
                    ["Mobile", prettyPhone(c.phone)],
                    ["Email", c.email || "—"],
                    ...(c.notes ? [["Note", c.notes]] : []),
                  ].map(([k, v]) => (
                    <div key={k} className="flex items-baseline justify-between gap-6">
                      <dt className="shrink-0 text-[0.62rem] uppercase tracking-[0.24em] text-muted-foreground">{k}</dt>
                      <dd className="min-w-0 text-right text-[0.95rem] [overflow-wrap:anywhere]">{v}</dd>
                    </div>
                  ))}
                </dl>
                <PhotoStrip />
              </Card>

              <Card
                title="Studio"
                action={
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(BUSINESS.mapsQuery)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 text-[0.85rem] text-bronze"
                  >
                    <span className="underline underline-offset-4">Directions</span>
                    <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.25} />
                  </a>
                }
              >
                <div className="flex gap-3">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-bronze" strokeWidth={1.25} />
                  <address className="text-[0.9rem] not-italic leading-relaxed">{BUSINESS.address}</address>
                </div>
              </Card>

              <AttendancePledge checked={pledged} onChange={setPledged} nudge={nudge} fromPricing={hasFromPricing} />
            </div>
          </Screen>

          <StickyBar>
            <div className="mb-3 flex items-baseline justify-between">
              <span className="text-[0.62rem] uppercase tracking-[0.28em] text-foreground/65">
                {hasFromPricing ? "Estimated total" : "Total"}
              </span>
              <span key={totalPrice} className="tick-in font-display text-[1.7rem] leading-none">
                {inr(totalPrice)}
                {hasFromPricing ? "+" : ""}
              </span>
            </div>
            {saveError ? (
              <p role="alert" className="shake mb-3 text-[0.85rem] text-destructive">
                {saveError}
              </p>
            ) : null}
            <PrimaryAction onClick={confirm} disabled={saving}>
              {saving ? "Confirming…" : "Confirm appointment"}
            </PrimaryAction>
          </StickyBar>
        </Page>
      </div>
    </>
  );
}

function PhotoStrip() {
  const { draft } = useBooking();
  const photos = draft.photos ?? [];
  if (!photos.length) return null;
  return (
    <div className="mt-4 hairline-t pt-4">
      <div className="text-[0.62rem] uppercase tracking-[0.24em] text-muted-foreground">Reference photos</div>
      <div className="mt-2.5 flex gap-2.5">
        {photos.map((p) => (
          <img key={p.path} src={p.thumb} alt="Your reference photo" className="h-16 w-16 rounded-md object-cover lg:h-20 lg:w-20" />
        ))}
      </div>
    </div>
  );
}

/** "with Bhargav" or "any available stylist" (assigned when the booking is confirmed).
 * A service with a preferred stylist (Bhargav's Signature) is with that stylist. */
const stylistLabel = (id: string | null | undefined, serviceIds: string[] = []) => {
  if (id) return `with ${STYLISTS.find((x) => x.id === id)?.name ?? "your stylist"}`;
  const pref = preferredFor(serviceIds, SERVICE_RULES);
  return pref ? `with ${pref.preferredName}` : "any available stylist";
};

function Card({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-md border border-hairline bg-card">
      <div className="mx-4 flex items-center justify-between hairline-b py-3.5 lg:mx-7 lg:py-4">
        <h2 className="font-sans text-[0.68rem] font-normal uppercase tracking-[0.3em] lg:text-[0.78rem]">{title}</h2>
        {action}
      </div>
      <div className="px-4 py-4 lg:px-7">{children}</div>
    </section>
  );
}

function EditLink({ to }: { to: "/services" | "/time" | "/details" }) {
  return (
    <Link to={to} className="press inline-flex items-center gap-2 text-[0.85rem] text-bronze lg:text-[0.95rem]">
      <span className="underline underline-offset-4">Edit</span>
      <Pencil className="h-4 w-4" strokeWidth={1.25} />
    </Link>
  );
}

function DesktopReview({
  confirm,
  saving,
  saveError,
  pledge,
}: {
  confirm: () => void;
  saving: boolean;
  saveError: string;
  pledge: ReactNode;
}) {
  const { draft, selected, totalMinutes, totalPrice, hasFromPricing, removeService } = useBooking();
  if (!draft.customer || !draft.date || draft.time == null) return null;
  const img = selectionImage(selected, draft.audience);
  const c = draft.customer;
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(BUSINESS.mapsQuery)}`;
  const embedUrl = `https://maps.google.com/maps?q=${encodeURIComponent(BUSINESS.mapsQuery)}&z=15&output=embed`;
  const [line1, ...line2] = BUSINESS.address.split(", KPHB");

  return (
    <DesktopPage>
      <DesktopStepHeader back="/details" step={5} />

      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
        <main className="page-in mx-auto max-w-6xl px-8 py-6 lg:px-14">
          <StepTitle step="five">
            Review your <Accent>appointment</Accent>
          </StepTitle>
          <p className="mt-2 text-[1.1rem] text-muted-foreground">
            Please check your details below. You can edit them if needed.
          </p>

          <div className="mt-6 space-y-3.5">
            <Card title="Appointment details" action={<EditLink to="/services" />}>
              <div className="flex items-center gap-7">
                <Thumb src={img.src} pos={img.pos} fit={img.fit} className="h-24 w-24" />
                <div className="min-w-0 flex-1">
                  <ul className="space-y-1">
                    {selected.map((x) => (
                      <li key={x.id} className="group flex items-center gap-3">
                        <ServiceGlyph kind={serviceKind(x)} className="h-5 w-5 shrink-0 text-bronze" />
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
                            className="press -m-2 inline-flex h-9 w-9 items-center justify-center rounded-full text-foreground/35 opacity-0 transition-opacity hover:bg-foreground/5 hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100"
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
                    {minuteLabel(draft.time)} · {formatDuration(totalMinutes)}
                        {STYLISTS.length ? ` · ${stylistLabel(draft.staffId, draft.serviceIds)}` : ""}
                    <Link to="/time" className="text-[0.9rem] text-bronze underline underline-offset-4">
                      Change time
                    </Link>
                  </div>
                </div>
                <div className="self-stretch border-l border-hairline pl-8 pr-2 lg:pl-14 lg:pr-6">
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
              <PhotoStrip />
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
                  className="h-24 w-56 shrink-0 rounded-sm border-0 bg-muted grayscale lg:w-80"
                />
              </div>
            </Card>

            {pledge}
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
        <DesktopCTA onClick={confirm} disabled={saving} className="justify-between md:min-w-[16rem] lg:min-w-[30rem]">
          {saving ? "Confirming…" : "Confirm appointment"}
        </DesktopCTA>
      </DesktopBar>
    </DesktopPage>
  );
}

/** The salon's published booking policies; "Manage booking" becomes a link. */
/**
 * The salon's request, asked before confirming: come on time, or tell us in
 * advance so the chair can go to someone else. Confirming needs the tick.
 */
function AttendancePledge({
  checked,
  onChange,
  nudge,
  fromPricing,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  nudge: number;
  /** Some prices are "from" prices (marked +). */
  fromPricing?: boolean;
}) {
  const { payment, lateness } = CONTENT.policies;
  const deadline = useChangeDeadline();
  return (
    <section
      data-attendance
      key={nudge}
      className={cn(
        "scroll-mt-24 rounded-md border px-5 py-5 transition-colors lg:px-7 lg:py-6",
        nudge && !checked ? "shake border-bronze/70 bg-champagne/20" : "border-hairline bg-card",
      )}
    >
      <div className="text-[0.62rem] uppercase tracking-[0.28em] text-bronze lg:text-[0.68rem]">Before you confirm</div>
      <h2 className="mt-2 font-display text-[1.35rem] leading-snug lg:text-[1.6rem]">Please keep your appointment.</h2>
      <p className="mt-2 text-[0.88rem] leading-relaxed text-muted-foreground lg:text-[0.95rem]">
        Every booking holds a chair another guest could have had. If you can't make it, let us know in advance, so we can
        give your time to someone who genuinely wants to come.
      </p>
      <p className="mt-3 text-[0.88rem] leading-relaxed lg:text-[0.95rem]">
        You can change or cancel your booking yourself in{" "}
        <Link to="/manage" className="underline underline-offset-4">
          Manage booking
        </Link>{" "}
        up to <strong className="font-medium">{deadline} before</strong> your appointment.{" "}
        {payment.replace(/\.$/, "")}
        {fromPricing ? "; prices marked + are confirmed in the chair" : ""}.{lateness ? ` ${lateness}` : ""}
      </p>
      <label className="mt-4 flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--ink,#1a1410)]"
        />
        <span className="text-[0.92rem] leading-snug lg:text-[1rem]">
          I'll be there on time, or I'll change or cancel at least {deadline} before.
        </span>
      </label>
      <p className="mt-4 text-[0.8rem] italic text-muted-foreground">
        Thank you for respecting each other's time. <span className="not-italic text-bronze">Hair by Bhargav</span>
      </p>
    </section>
  );
}
