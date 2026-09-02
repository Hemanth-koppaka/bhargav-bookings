import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { Page, Screen, ScreenHeader, StickyBar, PrimaryAction } from "@/components/screen";
import { useBooking } from "@/lib/booking-store";

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
  "w-full border-0 border-b border-foreground/20 bg-transparent px-0 py-3 text-[1.05rem] outline-none transition-colors placeholder:text-foreground/30 focus:border-foreground";

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

  return (
    <Page>
      <ScreenHeader back="/time" title="Step 4 of 5" />
      <Screen>
        <h1 className="mt-2 font-display text-4xl leading-tight sm:text-5xl">
          Who should we <span className="italic">expect?</span>
        </h1>

        <form className="mt-10 space-y-8" onSubmit={submit}>
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
            />
            {touched && !validName ? (
              <p className="mt-2 text-xs text-destructive">Please enter your name.</p>
            ) : null}
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
              inputMode="tel"
              autoComplete="tel"
            />
            {touched && !validPhone ? (
              <p className="mt-2 text-xs text-destructive">Enter a valid 10-digit number.</p>
            ) : null}
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
              autoComplete="email"
            />
            {touched && !validEmail ? (
              <p className="mt-2 text-xs text-destructive">That email doesn't look right.</p>
            ) : null}
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
  );
}
