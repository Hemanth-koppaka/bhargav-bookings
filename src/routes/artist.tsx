import { createFileRoute } from "@tanstack/react-router";
import { BookCTA, InfoPage } from "@/components/info-page";
import { BUSINESS } from "@/lib/salon";
import founder from "@/assets/founder.jpg.asset.json";

export const Route = createFileRoute("/artist")({
  head: () => ({
    meta: [
      { title: "The artist, D. Bhargav — Hair by Bhargav" },
      {
        name: "description",
        content:
          "Meet D. Bhargav, founder and chief stylist of The Hair By Bhargav Unisex Salon in KPHB Phase 9, Kukatpally.",
      },
      { property: "og:title", content: "The artist, D. Bhargav — Hair by Bhargav" },
      { property: "og:description", content: "Founder and chief stylist." },
      { property: "og:image", content: founder.url },
      { name: "twitter:image", content: founder.url },
    ],
  }),
  component: ArtistScreen,
});

const highlights = [
  ["Precision cuts", "Shaped to how your hair actually grows"],
  ["Personalised colour", "Colorimetry for any mood"],
  ["Bridal & groom", "Complete transformations"],
];

function ArtistScreen() {
  return (
    <InfoPage
      label="The artist"
      image={founder.url}
      imagePos="50% 20%"
      panelEyebrow="Founder · Chief Stylist"
      panelTitle={
        <>
          D. <span className="italic text-champagne">Bhargav</span>
        </>
      }
      panelSub="A haircut is a conversation first."
    >
      <div className="relative overflow-hidden rounded-xl bg-ink lg:hidden">
        <img
          src={founder.url}
          alt="D. Bhargav, founder and chief stylist"
          className="aspect-4/5 w-full object-cover grayscale"
          decoding="async"
        />
        <span className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
      </div>

      <div className="stagger mt-8 lg:mt-0">
        <div className="text-[0.62rem] uppercase tracking-[0.3em] text-bronze lg:text-[0.72rem]">Founder · Chief Stylist</div>
        <h1 className="mt-3 font-display text-[clamp(3rem,13vw,3.6rem)] leading-[0.95] lg:text-[4.5rem]">
          D. <span className="italic text-bronze">Bhargav</span>
        </h1>
        <blockquote className="mt-7 border-l-2 border-bronze/50 pl-5 font-display text-[1.45rem] italic leading-snug text-foreground/85 lg:text-[1.75rem]">
          “A haircut is a conversation before it is a service.”
        </blockquote>
      </div>

      <div className="mt-8 space-y-5 text-[0.98rem] leading-relaxed text-muted-foreground lg:text-[1.05rem]">
        <p>
          Every appointment begins with a proper walkthrough — your hair, your routine, and what you actually want to
          live with for the next six weeks.
        </p>
        <p>
          Trained across cutting, colorimetry and makeover work, he leads a small team at {BUSINESS.locationShort}. The
          room is deliberately unhurried: four chairs, never overbooked, so nobody is rushed out of the seat.
        </p>
      </div>

      <ul className="stagger mt-9 grid gap-2.5 sm:grid-cols-3">
        {highlights.map(([t, d]) => (
          <li key={t} className="rounded-md border border-hairline bg-card p-4">
            <div className="font-display text-[1.25rem] leading-tight">{t}</div>
            <div className="mt-1 text-[0.82rem] text-muted-foreground">{d}</div>
          </li>
        ))}
      </ul>

      <BookCTA className="mt-10">Book with Bhargav</BookCTA>
    </InfoPage>
  );
}
