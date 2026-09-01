import { createFileRoute, Link } from "@tanstack/react-router";
import { Page, Screen, ScreenHeader } from "@/components/screen";
import { BUSINESS } from "@/lib/salon";

export const Route = createFileRoute("/studio")({
  head: () => ({
    meta: [
      { title: "The studio — Hair by Bhargav" },
      {
        name: "description",
        content:
          "Four chairs, two wash stations, a private room and full air conditioning at KPHB Phase 9, Kukatpally, Hyderabad.",
      },
      { property: "og:title", content: "The studio — Hair by Bhargav" },
      { property: "og:description", content: "Inside the salon at KPHB Phase 9, Kukatpally." },
    ],
  }),
  component: StudioScreen,
});

function StudioScreen() {
  return (
    <Page>
      <ScreenHeader back="/" title="Studio" />
      <Screen>
        <h1 className="mt-2 font-display text-4xl leading-tight sm:text-5xl">
          The <span className="italic">studio.</span>
        </h1>
        <p className="mt-4 max-w-sm text-[0.95rem] leading-relaxed text-muted-foreground">
          A calm, unhurried unisex salon in KPHB. Everything you need for a full makeover under one
          roof, with a private room when you'd rather not be seen mid-transformation.
        </p>

        <ul className="mt-10 grid gap-px bg-hairline sm:grid-cols-2">
          {BUSINESS.facilities.map((f) => (
            <li key={f} className="bg-background px-5 py-6 text-[0.95rem]">
              {f}
            </li>
          ))}
        </ul>

        <div className="mt-12">
          <div className="eyebrow">Address</div>
          <p className="mt-3 text-[0.95rem] leading-relaxed">{BUSINESS.address}</p>
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(BUSINESS.mapsQuery)}`}
            target="_blank"
            rel="noreferrer"
            className="label-caps mt-5 inline-flex border-b border-foreground/30 pb-1"
          >
            Open in Maps
          </a>
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
