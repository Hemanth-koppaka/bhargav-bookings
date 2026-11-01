import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { StepHeader, StepIntro } from "@/components/screen";
import { haptic } from "@/lib/utils";
import { DesktopStepperHeader, InfoStrip } from "@/components/desktop";
import { useBooking } from "@/lib/booking-store";
import type { Audience } from "@/lib/salon";
import menImg from "@/assets/men.jpg.asset.json";
import womenImg from "@/assets/women.jpg.asset.json";

export const Route = createFileRoute("/book")({
  head: () => ({
    meta: [
      { title: "Book an appointment — Hair by Bhargav" },
      {
        name: "description",
        content: "Start your reservation at Hair by Bhargav. Choose men's or women's services.",
      },
      { property: "og:title", content: "Book an appointment — Hair by Bhargav" },
      { property: "og:description", content: "Start your reservation at Hair by Bhargav." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: BookEntry,
});

const options: { key: Audience; title: string; sub: string; img: string; pos: string }[] = [
  { key: "men", title: "Men", sub: "Hair · Beard · Grooming", img: menImg.url, pos: "60% 30%" },
  { key: "women", title: "Women", sub: "Hair · Colour · Makeover", img: womenImg.url, pos: "45% 25%" },
];

function BookEntry() {
  const { setAudience } = useBooking();
  const navigate = useNavigate();

  const choose = (a: Audience) => {
    setAudience(a);
    navigate({ to: "/services" });
  };

  return (
    <>
      {/* Phone / tablet: one-screen app layout */}
      <div className="flex h-[100svh] min-h-[560px] flex-col overflow-hidden bg-background md:hidden">
        <StepHeader back="/" step={1} />
        <main className="mx-auto flex min-h-0 w-full max-w-xl flex-1 flex-col px-5 safe-b">
          <StepIntro eyebrow="Step one">
            Who are we <span className="italic text-bronze">styling?</span>
          </StepIntro>
          <div className="stagger mt-[clamp(1rem,3svh,1.5rem)] flex min-h-0 flex-1 flex-col gap-3 pb-4">
            {options.map((o) => (
              <button
                key={o.key}
                onClick={() => {
                  haptic();
                  choose(o.key);
                }}
                data-sfx="primary"
                className="press group relative min-h-[120px] w-full flex-1 overflow-hidden rounded-xl bg-ink text-left text-ivory shadow-[0_18px_36px_-24px_color-mix(in_oklab,var(--ink)_80%,transparent)]"
              >
                <img
                  src={o.img}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                  decoding="async"
                  fetchPriority="high"
                  style={{ objectPosition: o.pos }}
                />
                <span className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-5">
                  <span>
                    <span className="block font-display text-[2.4rem] leading-none">{o.title}</span>
                    <span className="mt-3 block h-px w-10 bg-champagne" />
                    <span className="mt-3 block text-[0.62rem] uppercase tracking-[0.24em] text-ivory/90">{o.sub}</span>
                  </span>
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ivory text-ink transition-transform duration-300 group-hover:translate-x-1">
                    <ArrowRight className="h-5 w-5" strokeWidth={1.25} />
                  </span>
                </span>
              </button>
            ))}
          </div>
        </main>
      </div>

      <DesktopBookEntry choose={choose} />
    </>
  );
}

function DesktopBookEntry({ choose }: { choose: (a: Audience) => void }) {
  return (
    <div className="hidden min-h-[100svh] flex-col bg-background md:flex lg:h-[100svh] lg:min-h-[640px] lg:overflow-hidden">
      <DesktopStepperHeader step={1} />

      <main className="page-in grid flex-1 grid-cols-1 content-center gap-8 px-8 py-8 lg:min-h-0 lg:grid-cols-[minmax(19rem,0.8fr)_minmax(0,2fr)] lg:items-center lg:gap-10 lg:px-14 xl:px-24">
        <div>
          <div className="text-[0.72rem] uppercase tracking-[0.32em] text-bronze">Step one</div>
          <span className="mt-4 block h-px w-12 bg-bronze/60" />
          <h1 className="mt-6 font-display text-[clamp(3rem,5vw,4.75rem)] leading-[1] tracking-[-0.015em] lg:mt-10">
            <span className="whitespace-nowrap">Who are we</span>
            <br className="hidden lg:block" /> <span className="italic text-bronze">styling?</span>
          </h1>
          <p className="mt-4 max-w-sm text-[1.05rem] leading-relaxed text-muted-foreground lg:mt-8 lg:max-w-xs">
            This helps us show you the right services and availability.
          </p>
        </div>

        <div className="stagger grid h-[min(56svh,560px)] grid-cols-2 gap-4 lg:h-full lg:max-h-[600px] lg:gap-5">
          {options.map((o) => (
            <button
              key={o.key}
              onClick={() => choose(o.key)}
              data-sfx="primary"
              data-sfx-hover=""
              className="press group relative overflow-hidden rounded-xl bg-ink text-left text-ivory transition-shadow duration-500 hover:shadow-[0_40px_80px_-40px_color-mix(in_oklab,var(--ink)_85%,transparent)] shadow-[0_24px_48px_-28px_color-mix(in_oklab,var(--ink)_70%,transparent)]"
            >
              <img
                src={o.img}
                alt=""
                className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
                style={{ objectPosition: o.pos }}
                decoding="async"
                fetchPriority="high"
              />
              <span className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/15 to-transparent" />
              <span className="absolute inset-0 flex items-end justify-between gap-4 p-8 xl:p-10">
                <span>
                  <span className="block font-display text-5xl leading-none xl:text-6xl">{o.title}</span>
                  <span className="mt-5 block h-px w-14 bg-champagne" />
                  <span className="mt-5 block whitespace-nowrap text-[0.7rem] uppercase tracking-[0.22em] text-ivory/90 xl:tracking-[0.3em]">{o.sub}</span>
                </span>
                <span className="absolute top-6 right-6 flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-ivory text-ink transition-transform duration-300 group-hover:translate-x-1 2xl:static 2xl:h-[4.5rem] 2xl:w-[4.5rem]">
                  <ArrowRight className="h-6 w-6" strokeWidth={1.25} />
                </span>
              </span>
            </button>
          ))}
        </div>
      </main>

      <InfoStrip className="mx-8 lg:mx-14 xl:mx-24" />
    </div>
  );
}
