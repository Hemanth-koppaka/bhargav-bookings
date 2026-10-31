import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { ArrowRight, CalendarDays, Lock, MessageCircle, ShieldCheck } from "lucide-react";
import { Page, Screen, ScreenHeader, StickyBar, PrimaryAction } from "@/components/screen";
import {
  AUDIENCE_IMAGE,
  Accent,
  DesktopBar,
  DesktopCTA,
  DesktopPage,
  DesktopStepHeader,
  StepTitle,
  Thumb,
} from "@/components/desktop";
import { useBooking, type Customer } from "@/lib/booking-store";
import { formatDuration, fromISO, inr, minuteLabel } from "@/lib/salon";

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

const field =
  "w-full border-0 border-b border-foreground/20 bg-transparent px-0 py-3 text-[1.05rem] outline-none scroll-mb-40 aria-[invalid=true]:border-destructive transition-colors placeholder:text-foreground/30 focus:border-foreground";

function DetailsScreen() {
  const { draft, hydrated, update } = useBooking();
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [touched, setTouched] = useState(false);

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
    }
  }, [hydrated]);

  const digits = phone.replace(/\D/g, "");
  const validName = name.trim().length >= 2;
  const validPhone = digits.length >= 10;
  const validEmail = email.trim() === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const valid = validName && validPhone && validEmail;

  const submit = (e?: FormEvent) => {
    e?.preventDefault();
    setTouched(true);
    if (!valid) return;
    const customer: Customer = {
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim(),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };
    update({ customer });
    navigate({ to: "/review" });
  };

  const fields = {
    name: { value: name, set: setName, error: touched && !validName ? "Please enter your name." : "" },
    phone: { value: phone, set: setPhone, error: touched && !validPhone ? "Enter a valid 10-digit number." : "" },
    email: { value: email, set: setEmail, error: touched && !validEmail ? "That email doesn't look right." : "" },
    notes: { value: notes, set: setNotes, error: "" },
  };

  return (
    <>
    <DesktopDetails fields={fields} submit={submit} />
    <div className="lg:hidden">
    <Page>
      <ScreenHeader back="/time" title="Step 4 of 5" />
      <Screen>
        <h1 className="mt-2 font-display text-4xl leading-tight sm:text-5xl">
          Who should we <span className="italic">expect?</span>
        </h1>

        <form noValidate className="mt-8 space-y-6 sm:mt-10" onSubmit={submit}>
          <div>
            <label className="eyebrow" htmlFor="name">
              Full name
            </label>
            <input
              id="name"
              className={field}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              autoComplete="name"
              enterKeyHint="next"
              aria-invalid={touched && !validName}
            />
            <p role="alert" className="mt-2 min-h-4 text-xs text-destructive">{touched && !validName ? "Please enter your name." : ""}</p>
          </div>

          <div>
            <label className="eyebrow" htmlFor="phone">
              Mobile number
            </label>
            <input
              id="phone"
              className={field}
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="10-digit mobile"
              type="tel"
              inputMode="tel"
              enterKeyHint="next"
              aria-invalid={touched && !validPhone}
              autoComplete="tel"
            />
            <p role="alert" className="mt-2 min-h-4 text-xs text-destructive">{touched && !validPhone ? "Enter a valid 10-digit number." : ""}</p>
          </div>

          <div>
            <label className="eyebrow" htmlFor="email">
              Email <span className="normal-case tracking-normal">(optional)</span>
            </label>
            <input
              id="email"
              className={field}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@email.com"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="off"
              enterKeyHint="next"
              aria-invalid={touched && !validEmail}
            />
            <p role="alert" className="mt-2 min-h-4 text-xs text-destructive">{touched && !validEmail ? "That email doesn't look right." : ""}</p>
          </div>

          <div>
            <label className="eyebrow" htmlFor="notes">
              Notes for the stylist <span className="normal-case tracking-normal">(optional)</span>
            </label>
            <textarea
              id="notes"
              className={field + " resize-none"}
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Anything we should know"
            />
          </div>
        </form>
      </Screen>

      <StickyBar>
        <PrimaryAction onClick={() => submit()}>Review booking</PrimaryAction>
      </StickyBar>
    </Page>
    </div>
    </>
  );
}

type Field = { value: string; set: (v: string) => void; error: string };

const box =
  "w-full rounded-sm border border-foreground/18 bg-card px-5 py-4 text-[1.05rem] outline-none transition-colors placeholder:text-foreground/35 focus:border-foreground/60 aria-[invalid=true]:border-destructive";

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-3 block text-[0.72rem] uppercase tracking-[0.3em] text-foreground/75">
      {children}
    </label>
  );
}

function FieldError({ children }: { children: string }) {
  return (
    <p role="alert" className="mt-2 min-h-4 text-sm text-destructive">
      {children}
    </p>
  );
}

function DesktopDetails({
  fields,
  submit,
}: {
  fields: Record<"name" | "phone" | "email" | "notes", Field>;
  submit: (e?: FormEvent) => void;
}) {
  const { draft, selected, totalSlots, totalPrice, hasFromPricing } = useBooking();
  const img = AUDIENCE_IMAGE[draft.audience ?? "men"];
  const { name, phone, email, notes } = fields;

  const assurances = [
    { icon: ShieldCheck, title: "Your information is safe", body: "Your details are only used to manage your appointment." },
    { icon: CalendarDays, title: "Need to reschedule?", body: "You can reschedule or cancel any time from Manage booking." },
    { icon: MessageCircle, title: "Questions?", body: "Feel free to add a note — we'll take care of the rest." },
  ];

  return (
    <DesktopPage>
      <DesktopStepHeader back="/time" step={4} />

      <div className="min-h-0 flex-1 overflow-y-auto [scrollbar-width:thin]">
        <div className="page-in mx-auto grid max-w-[90rem] grid-cols-[minmax(0,1fr)_minmax(22rem,34rem)] gap-12 px-14 py-9 xl:gap-16 xl:px-24">
          <form noValidate onSubmit={submit} className="border-r border-hairline pr-12 xl:pr-16">
            <StepTitle step="four">
              Your <Accent>details</Accent>
            </StepTitle>
            <p className="mt-2 text-[1.1rem] text-muted-foreground">
              Almost there. Please share your details to confirm your booking.
            </p>

            <div className="mt-8">
              <FieldLabel htmlFor="d-name">Full name *</FieldLabel>
              <input
                id="d-name"
                className={box}
                value={name.value}
                onChange={(e) => name.set(e.target.value)}
                placeholder="Your name"
                autoComplete="name"
                aria-invalid={Boolean(name.error)}
              />
              <FieldError>{name.error}</FieldError>
            </div>

            <div className="mt-3">
              <FieldLabel htmlFor="d-phone">Mobile number *</FieldLabel>
              <div
                className={
                  "flex items-stretch rounded-sm border bg-card transition-colors focus-within:border-foreground/60 " +
                  (phone.error ? "border-destructive" : "border-foreground/18")
                }
              >
                <span className="flex items-center border-r border-foreground/12 px-5 text-[1.05rem] text-foreground/80">+91</span>
                <input
                  id="d-phone"
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
              <FieldError>{phone.error}</FieldError>
            </div>

            <div className="mt-3">
              <FieldLabel htmlFor="d-email">Email (optional)</FieldLabel>
              <input
                id="d-email"
                className={box}
                value={email.value}
                onChange={(e) => email.set(e.target.value)}
                placeholder="Enter your email"
                type="email"
                autoComplete="email"
                autoCapitalize="off"
                aria-invalid={Boolean(email.error)}
              />
              <FieldError>{email.error}</FieldError>
            </div>

            <div className="mt-3">
              <FieldLabel htmlFor="d-notes">Note (optional)</FieldLabel>
              <textarea
                id="d-notes"
                className={box + " resize-none"}
                rows={3}
                value={notes.value}
                onChange={(e) => notes.set(e.target.value)}
                placeholder="Anything you'd like us to know?"
              />
            </div>
            {/* lets Enter submit the form */}
            <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
          </form>

          <aside className="pt-4">
            <div className="rounded-sm border border-hairline bg-card p-8">
              <div className="flex items-baseline justify-between">
                <span className="text-[0.72rem] uppercase tracking-[0.3em] text-foreground/75">Your appointment</span>
                <Link to="/services" className="inline-flex items-center gap-1.5 text-[0.95rem] text-bronze underline underline-offset-4">
                  Change <ArrowRight className="h-4 w-4" strokeWidth={1.25} />
                </Link>
              </div>
              <div className="mt-6 flex gap-6">
                <Thumb src={img.src} pos={img.pos} className="h-28 w-28" />
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
                    {draft.time != null ? minuteLabel(draft.time) : ""} · {formatDuration(totalSlots)}
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

            <ul className="mt-8 space-y-7 px-1">
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
        <DesktopCTA onClick={() => submit()} className="min-w-[26rem] justify-between">
          Review appointment
        </DesktopCTA>
      </DesktopBar>
    </DesktopPage>
  );
}
