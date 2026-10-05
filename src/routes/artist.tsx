import { createFileRoute, Link } from "@tanstack/react-router";
import { Page, Screen, ScreenHeader } from "@/components/screen";
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

function ArtistScreen() {
  return (
    <Page>
      <ScreenHeader back="/" title="The Artist" />
      <Screen>
        <img
          src={founder.url}
          alt="D. Bhargav, founder and chief stylist"
          className="mt-2 aspect-4/5 w-full bg-muted object-cover grayscale"
          decoding="async"
          loading="lazy"
        />
        <div className="eyebrow mt-8">Founder · Chief Stylist</div>
        <h1 className="mt-3 font-display text-5xl leading-[0.95]">
          D. <span className="italic">Bhargav</span>
        </h1>
        <div className="mt-8 space-y-5 text-[0.98rem] leading-relaxed text-muted-foreground">
          <p>
            Bhargav built this salon around a simple belief: a haircut is a conversation before it
            is a service. Every appointment begins with a proper walkthrough — your hair, your
            routine, and what you actually want to live with for the next six weeks.
          </p>
          <p>
            Trained across cutting, colorimetry and makeover work, he leads a small team at{" "}
            {BUSINESS.locationShort}. The room is deliberately unhurried: four chairs, never
            overbooked, so nobody is rushed out of the seat.
          </p>
          <p>
            Signature work spans precision cuts, personalised colour, and full bridal and groom
            transformations.
          </p>
        </div>

        <Link
          to="/book"
          className="label-caps mt-12 flex w-full items-center justify-between gap-4 bg-foreground px-6 py-4.5 text-background"
        >
          <span>Book with Bhargav</span>
          <span>→</span>
        </Link>
      </Screen>
    </Page>
  );
}
