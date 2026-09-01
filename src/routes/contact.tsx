import { createFileRoute, Link } from "@tanstack/react-router";
import { Page, Screen, ScreenHeader } from "@/components/screen";
import { BUSINESS } from "@/lib/salon";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact — Hair by Bhargav" },
      {
        name: "description",
        content:
          "Call or WhatsApp Hair by Bhargav at KPHB Phase 9, Kukatpally, Hyderabad, or book online in under a minute.",
      },
      { property: "og:title", content: "Contact — Hair by Bhargav" },
      { property: "og:description", content: "Call, WhatsApp or find us in KPHB Phase 9." },
    ],
  }),
  component: ContactScreen,
});

function ContactScreen() {
  return (
    <Page>
      <ScreenHeader back="/" title="Contact" />
      <Screen>
        <h1 className="mt-2 font-display text-4xl leading-tight sm:text-5xl">
          Say <span className="italic">hello.</span>
        </h1>

        <div className="mt-10">
          <div className="eyebrow">Call the studio</div>
          <ul className="mt-3 space-y-2">
            {BUSINESS.phones.map((p) => (
              <li key={p}>
                <a href={`tel:${p}`} className="font-display text-3xl">
                  {p}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <div className="mt-10">
          <div className="eyebrow">WhatsApp</div>
          <a
            href={`https://wa.me/${BUSINESS.phones[0].replace("+", "")}`}
            target="_blank"
            rel="noreferrer"
            className="label-caps mt-3 inline-flex border-b border-foreground/30 pb-1"
          >
            Message us
          </a>
        </div>

        <div className="mt-10">
          <div className="eyebrow">Visit</div>
          <p className="mt-3 text-[0.95rem] leading-relaxed">{BUSINESS.address}</p>
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(BUSINESS.mapsQuery)}`}
            target="_blank"
            rel="noreferrer"
            className="label-caps mt-5 inline-flex border-b border-foreground/30 pb-1"
          >
            Get directions
          </a>
        </div>

        <div className="mt-10">
          <div className="eyebrow">Hours</div>
          <p className="mt-3 text-[0.95rem]">
            {BUSINESS.hoursOpenDays}, 10:00 AM — 8:00 PM · Closed {BUSINESS.closedDay}
          </p>
        </div>

        <Link
          to="/book"
          className="label-caps mt-12 flex w-full items-center justify-between gap-4 bg-foreground px-6 py-4.5 text-background"
        >
          <span>Book an appointment</span>
          <span>→</span>
        </Link>
      </Screen>
    </Page>
  );
}
