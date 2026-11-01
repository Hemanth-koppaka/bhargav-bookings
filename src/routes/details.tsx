import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, CalendarDays, Lock, MessageCircle, ShieldCheck } from "lucide-react";
import { Page, PrimaryAction, Screen, StepHeader, StepIntro, StickyBar } from "@/components/screen";
import { haptic } from "@/lib/utils";
import { sfx } from "@/lib/sfx";
import { ReferencePhotos } from "@/components/reference-photos";
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
import { useBooking, type Customer } from "@/lib/booking-store";
import { formatDuration, fromISO, inr, isValidMobile, minuteLabel } from "@/lib/salon";

export const Route = createFileRoute("/details")({
  head: () => ({
    meta: [
      { title: "Your details — Hair by Bhargav" },
      {
        name: "description",
        content: "Tell us who the appointment is for so we can hold your chair at Hair by Bhargav.",
      },
      { property: "og:title", content: "Your details — Hair by Bhargav" },
      { property: "og:description", content: "Name, phone and any notes for your stylist." },
    ],
  }),
  component: DetailsScreen,
});

function DetailsScreen() {
  const { draft, hydrated, update } = useBooking();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  // booking messages on WhatsApp/SMS: on unless the guest unticks it
  const [consent, setConsent] = useState(true);
  const [touched, setTouched] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!hydrated) return;
    if (draft.time == null || !draft.date) {
      navigate({ to: "/book" });
      return;
    }
    if (draft.customer) {
      setName(draft.customer.name);
      setPhone(draft.customer.phone);
      setEmail(draft.customer.email);
      setNotes(draft.customer.notes ?? "");
      setConsent(draft.customer.consent !== false);
    }
  }, [hydrated]);

  const digits = phone.replace(/\D/g, "");
  const validName = name.trim().length >= 2;
  const validPhone = isValidMobile(phone);
  const validEmail = email.trim() === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const valid = validName && validPhone && validEmail;

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    setTouched(true);
    setAttempt((n) => n + 1);
    if (!valid) {
      haptic(20);
      sfx.error();
      return;
    }
    const customer: Customer = {
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      consent,
    };
    update({ customer });
    navigate({ to: "/review" });
  };

  const fields = {
    name: { value: name, set: setName, error: touched && !validName ? "Please enter your name." : "" },
    phone: { value: phone, set: setPhone, error: touched && !validPhone ? digits.length < 10 ? "Enter a valid 10-digit number." : "Enter a valid mobile number (starts with 6, 7, 8 or 9)." : "" },
    email: { value: email, set: setEmail, error: touched && !validEmail ? "That email doesn't look right." : "" },
    notes: { value: notes, set: setNotes, error: "" },
    consent: { value: consent, set: setConsent },
  };

  return (
    <>
    <DesktopDetails fields={fields} submit={submit} attempt={attempt} />
    <div className="md:hidden">
      <Page>
        <StepHeader back="/time" step={4} />
        <Screen className="px-5">
          <StepIntro eyebrow="Step four" sub="Almost there. Share your details to confirm your booking.">
            Your <span className="italic text-bronze">details.</span>
          </StepIntro>

          <MobileSummary />

          <form noValidate className="mt-6" onSubmit={submit}>
            <DetailsFields fields={fields} idPrefix="m-" attempt={attempt} />
            <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
          </form>

          <p className="mt-4 flex items-center gap-2.5 text-[0.8rem] text-muted-foreground">
            <Lock className="h-3.5 w-3.5 shrink-0" strokeWidth={1.25} />
            Your details are only used to manage your appointment.
          </p>
        </Screen>

        <StickyBar>
          <PrimaryAction onClick={() => submit()}>Review appointment</PrimaryAction>
        </StickyBar>
      </Page>
    </div>
    </>
  );
}

function MobileSummary() {
  const { draft, selected, totalMinutes, totalPrice, hasFromPricing } = useBooking();
  const img = selectionImage(selected, draft.audience);
  return (
    <div className="mt-5 flex items-center gap-4 rounded-md border border-hairline bg-card p-3.5">
      <Thumb src={img.src} pos={img.pos} fit={img.fit} className="h-16 w-16" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-display text-[1.25rem] leading-tight">
          {selected.length > 1 ? `${selected[0]?.name} + ${selected.length - 1} more` : selected[0]?.name}
        </div>
        <div className="mt-0.5 text-[0.8rem] text-muted-foreground">
          {draft.date
            ? fromISO(draft.date).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })
            : ""}
          {draft.time != null ? ` · ${minuteLabel(draft.time)}` : ""} · {formatDuration(totalMinutes)}
        </div>
      </div>
      <div className="text-right">
        <div className="font-display text-[1.3rem] leading-none">
          {inr(totalPrice)}
          {hasFromPricing ? "+" : ""}
        </div>
        <Link to="/time" className="mt-1.5 inline-block text-[0.75rem] text-bronze underline underline-offset-4">
          Change
        </Link>
      </div>
    </div>
  );
}

type Field = { value: string; set: (v: string) => void; error: string };
type Fields = Record<"name" | "phone" | "email" | "notes", Field> & {
  consent: { value: boolean; set: (v: boolean) => void };
};

const box =
  "w-full rounded-sm border border-foreground/18 bg-card px-5 py-4 text-[1.05rem] outline-none transition-colors placeholder:text-foreground/35 focus:border-foreground/60 aria-[invalid=true]:border-destructive";

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-3 block text-[0.72rem] uppercase tracking-[0.3em] text-foreground/75">
      {children}
    </label>
  );
}

function FieldError({ children, attempt }: { children: string; attempt: number }) {
  return (
    <p key={children ? attempt : "ok"} role="alert" className={"mt-2 min-h-4 text-sm text-destructive " + (children ? "shake" : "")}>
      {children}
    </p>
  );
}

function DetailsFields({
  fields,
  idPrefix,
  attempt,
}: {
  fields: Fields;
  idPrefix: string;
  attempt: number;
}) {
  const { name, phone, email, notes, consent } = fields;
  return (
    <>
    <div>
      <FieldLabel htmlFor={`${idPrefix}name`}>Full name *</FieldLabel>
      <input
        id={`${idPrefix}name`}
        className={box}
        value={name.value}
        onChange={(e) => name.set(e.target.value)}
        placeholder="Your name"
        autoComplete="name"
        aria-invalid={Boolean(name.error)}
      />
      <FieldError attempt={attempt}>{name.error}</FieldError>
    </div>

    <div className="mt-3">
      <FieldLabel htmlFor={`${idPrefix}phone`}>Mobile number *</FieldLabel>
      <div
        className={
          "flex items-stretch rounded-sm border bg-card transition-colors focus-within:border-foreground/60 " +
          (phone.error ? "border-destructive" : "border-foreground/18")
        }
      >
        <span className="flex items-center border-r border-foreground/12 px-5 text-[1.05rem] text-foreground/80">+91</span>
        <input
          id={`${idPrefix}phone`}
          className="min-w-0 flex-1 bg-transparent px-5 py-4 text-[1.05rem] outline-none placeholder:text-foreground/35"
          value={phone.value}
          onChange={(e) => phone.set(e.target.value)}
          placeholder="Enter mobile number"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          aria-invalid={Boolean(phone.error)}
        />
      </div>
      <FieldError attempt={attempt}>{phone.error}</FieldError>
    </div>

    <div className="mt-3">
      <FieldLabel htmlFor={`${idPrefix}email`}>Email (optional)</FieldLabel>
      <input
        id={`${idPrefix}email`}
        className={box}
        value={email.value}
        onChange={(e) => email.set(e.target.value)}
        placeholder="Enter your email"
        type="email"
        autoComplete="email"
        autoCapitalize="off"
        aria-invalid={Boolean(email.error)}
      />
      <FieldError attempt={attempt}>{email.error}</FieldError>
    </div>

    <div className="mt-3">
      <FieldLabel htmlFor={`${idPrefix}notes`}>Note (optional)</FieldLabel>
      <textarea
        id={`${idPrefix}notes`}
        className={box + " resize-none"}
        rows={3}
        value={notes.value}
        onChange={(e) => notes.set(e.target.value)}
        placeholder="Anything you'd like us to know?"
      />
    </div>

    <div className="mt-6">
      <ReferencePhotos />
    </div>

    <label htmlFor={`${idPrefix}consent`} className="mt-6 flex cursor-pointer items-start gap-3 rounded-md border border-hairline bg-card px-4 py-3.5">
      <input
        id={`${idPrefix}consent`}
        type="checkbox"
        checked={consent.value}
        onChange={(e) => consent.set(e.target.checked)}
        className="mt-0.5 h-[1.125rem] w-[1.125rem] shrink-0 accent-[var(--bronze)]"
      />
      <span className="text-[0.88rem] leading-relaxed">
        Send my booking confirmation, changes and reminders on WhatsApp/SMS.
        <span className="mt-0.5 block text-[0.76rem] text-muted-foreground">Booking messages only — never promotions. You can still book if you untick this.</span>
      </span>
    </label>
    </>
  );
}

function DesktopDetails({
  fields,
  submit,
  attempt,
}: {
  fields: Fields;
  submit: (e?: FormEvent) => void;
  attempt: number;
}) {
  const { draft, selected, totalMinutes, totalPrice, hasFromPricing } = useBooking();
  const img = selectionImage(selected, draft.audience);

  const assurances = [
    { icon: ShieldCheck, title: "Your information is safe", body: "Your details are only used to manage your appointment." },
    { icon: CalendarDays, title: "Need to reschedule?", body: "You can reschedule or cancel any time from Manage booking." },
    { icon: MessageCircle, title: "Questions?", body: "Feel free to add a note — we'll take care of the rest." },
  ];

  return (
    <DesktopPage>
      <DesktopStepHeader back="/time" step={4} />

      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
        <div className="page-in mx-auto grid max-w-[90rem] grid-cols-1 gap-10 px-8 py-8 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,26rem)] lg:px-10 lg:py-9 xl:grid-cols-[minmax(0,1fr)_minmax(22rem,34rem)] xl:gap-16 xl:px-24">
          <form noValidate onSubmit={submit} className="lg:border-r lg:border-hairline lg:pr-10 xl:pr-16">
            <StepTitle step="four">
              Your <Accent>details</Accent>
            </StepTitle>
            <p className="mt-2 text-[1.1rem] text-muted-foreground">
              Almost there. Please share your details to confirm your booking.
            </p>

            <div className="mt-8">
              <DetailsFields fields={fields} idPrefix="d-" attempt={attempt} />
            </div>
            {/* lets Enter submit the form */}
            <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
          </form>

          <aside className="lg:pt-4">
            <div className="rounded-sm border border-hairline bg-card p-8">
              <div className="flex items-baseline justify-between">
                <span className="text-[0.72rem] uppercase tracking-[0.3em] text-foreground/75">Your appointment</span>
                <Link to="/services" className="inline-flex items-center gap-1.5 text-[0.95rem] text-bronze underline underline-offset-4">
                  Change <ArrowRight className="h-4 w-4" strokeWidth={1.25} />
                </Link>
              </div>
              <div className="mt-6 flex gap-6">
                <Thumb src={img.src} pos={img.pos} fit={img.fit} className="h-28 w-28" />
                <div className="min-w-0">
                  {selected.map((x) => (
                    <div key={x.id} className="font-display text-[1.6rem] leading-tight">{x.name}</div>
                  ))}
                  {draft.date ? (
                    <div className="mt-2 font-display text-[1.25rem] text-foreground/80">
                      {fromISO(draft.date).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
                    </div>
                  ) : null}
                  <div className="mt-1 text-[1.05rem] text-muted-foreground">
                    {draft.time != null ? minuteLabel(draft.time) : ""} · {formatDuration(totalMinutes)}
                  </div>
                </div>
              </div>
              <div className="mt-6 flex items-baseline justify-between hairline-t pt-6">
                <span className="text-[0.72rem] uppercase tracking-[0.3em] text-foreground/75">Total</span>
                <span className="font-display text-[2rem] leading-none">
                  {inr(totalPrice)}
                  {hasFromPricing ? "+" : ""}
                </span>
              </div>
            </div>

            <ul className="mt-8 grid gap-6 px-1 md:grid-cols-3 lg:grid-cols-1 lg:gap-7">
              {assurances.map(({ icon: Icon, title, body }) => (
                <li key={title} className="flex gap-6">
                  <Icon className="mt-0.5 h-7 w-7 shrink-0" strokeWidth={1.1} />
                  <div>
                    <div className="font-display text-[1.3rem] leading-tight">{title}</div>
                    <div className="mt-1 text-[0.95rem] text-muted-foreground">{body}</div>
                  </div>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </div>

      <DesktopBar>
        <p className="flex flex-1 items-center gap-3 text-[0.95rem] text-muted-foreground">
          <Lock className="h-4 w-4" strokeWidth={1.25} />
          Your details are only used to manage your appointment.
        </p>
        <DesktopCTA onClick={() => submit()} className="justify-between md:min-w-[16rem] lg:min-w-[26rem]">
          Review appointment
        </DesktopCTA>
      </DesktopBar>
    </DesktopPage>
  );
}
