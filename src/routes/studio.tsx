import { createFileRoute } from "@tanstack/react-router";
import {
  ArrowUpRight,
  Armchair,
  Car,
  DoorClosed,
  Droplets,
  Palette,
  Scissors,
  Snowflake,
  Sofa,
} from "lucide-react";
import { BookCTA, InfoPage, InfoTitle, SectionLabel } from "@/components/info-page";
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

const FACILITY_ICONS: [RegExp, typeof Scissors][] = [
  [/chair/i, Armchair],
  [/wash/i, Droplets],
  [/air|condition/i, Snowflake],
  [/waiting/i, Sofa],
  [/makeup/i, Palette],
  [/beard|groom/i, Scissors],
  [/private/i, DoorClosed],
  [/park/i, Car],
];

const iconFor = (f: string) => FACILITY_ICONS.find(([re]) => re.test(f))?.[1] ?? Scissors;

function StudioScreen() {
  const maps = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(BUSINESS.mapsQuery)}`;
  const embed = `https://maps.google.com/maps?q=${encodeURIComponent(BUSINESS.mapsQuery)}&z=15&output=embed`;
  return (
    <InfoPage
      label="Studio"
      image="/studio/chairs-1600.webp"
      imagePos="45% 50%"
      panelEyebrow="KPHB Phase 9"
      panelTitle={
        <>
          Calm,
          <br />
          <span className="italic text-champagne">unhurried.</span>
        </>
      }
      panelSub="Four chairs. Never overbooked."
    >
      <InfoTitle
        eyebrow="The studio"
        sub="A calm, unhurried unisex salon in KPHB. Everything you need for a full makeover under one roof, with a private room when you'd rather not be seen mid-transformation."
      >
        The <span className="italic text-bronze">studio.</span>
      </InfoTitle>

      {/* the real studio: styling floor and wash lounge */}
      <div className="stagger mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
        <figure className="lg:hidden">
          <img
            src="/studio/chairs-800.webp"
            srcSet="/studio/chairs-800.webp 800w, /studio/chairs-1600.webp 1600w"
            sizes="(min-width: 640px) 50vw, 100vw"
            width={800}
            height={450}
            alt="The styling floor: four chairs facing lit arched mirrors"
            loading="lazy"
            decoding="async"
            className="aspect-[16/10] w-full rounded-md bg-muted object-cover"
          />
          <figcaption className="mt-2 text-[0.72rem] uppercase tracking-[0.22em] text-muted-foreground">
            Styling floor · four chairs
          </figcaption>
        </figure>
        <figure>
          <img
            src="/studio/wash-800.webp"
            srcSet="/studio/wash-800.webp 800w, /studio/wash-1600.webp 1600w"
            sizes="(min-width: 1024px) 40vw, (min-width: 640px) 50vw, 100vw"
            width={800}
            height={533}
            alt="The wash lounge: two leather shampoo chairs"
            loading="lazy"
            decoding="async"
            className="aspect-[16/10] w-full rounded-md bg-muted object-cover lg:aspect-[16/8]"
          />
          <figcaption className="mt-2 text-[0.72rem] uppercase tracking-[0.22em] text-muted-foreground">
            Wash lounge
          </figcaption>
        </figure>
      </div>

      <div className="mt-10">
        <SectionLabel>Inside</SectionLabel>
        <ul className="stagger mt-5 grid grid-cols-2 gap-2.5">
          {BUSINESS.facilities.map((f) => {
            const Icon = iconFor(f);
            return (
              <li
                key={f}
                className="flex items-center gap-3 rounded-md border border-hairline bg-card px-4 py-4 text-[0.9rem] lg:text-[0.95rem]"
              >
                <Icon
                  className="h-[18px] w-[18px] shrink-0 text-bronze"
                  strokeWidth={1.25}
                  aria-hidden
                />
                {f}
              </li>
            );
          })}
        </ul>
      </div>

      <div className="mt-10">
        <SectionLabel>Find us</SectionLabel>
        <div className="mt-5 overflow-hidden rounded-md border border-hairline bg-card">
          <iframe
            title="Map to the studio"
            src={embed}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            className="h-48 w-full border-0 bg-muted grayscale lg:h-56"
          />
          <div className="flex items-start justify-between gap-4 p-4 lg:p-5">
            <address className="text-[0.92rem] not-italic leading-relaxed">
              {BUSINESS.address}
            </address>
            <a
              href={maps}
              target="_blank"
              rel="noreferrer"
              className="press inline-flex shrink-0 items-center gap-1.5 text-[0.85rem] text-bronze"
            >
              <span className="underline underline-offset-4">Directions</span>
              <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={1.25} />
            </a>
          </div>
        </div>
      </div>

      <BookCTA className="mt-10" />
    </InfoPage>
  );
}
