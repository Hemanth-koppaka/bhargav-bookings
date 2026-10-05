import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Page, Screen, ScreenHeader } from "@/components/screen";
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
      {/* Mobile: one-screen app layout */}
      <div className="flex h-[100svh] flex-col overflow-hidden bg-background sm:hidden">
        <ScreenHeader
          back="/"
          right={<span className="label-caps whitespace-nowrap text-[0.6rem] text-foreground/60">01 / 05</span>}
        />
        <div className="h-px w-full bg-hairline">
          <div className="h-px w-1/5 bg-accent" />
        </div>
        <main className="page-in flex min-h-0 flex-1 flex-col px-5 pt-[clamp(1rem,3.5svh,2rem)] safe-b">
          <div className="eyebrow">Step one</div>
          <h1 className="mt-2 font-display text-[clamp(2.4rem,11vw,3rem)] leading-[0.95]">
            Who are
            <br />
            <span className="italic">we styling?</span>
          </h1>
          <div className="mt-[clamp(1rem,3.5svh,2rem)] flex min-h-0 flex-col gap-3.5">
            {options.map((o) => (
              <button
                key={o.key}
                onClick={() => choose(o.key)}
                className="group relative flex h-[clamp(130px,23svh,175px)] w-full overflow-hidden rounded-2xl border border-foreground/8 bg-card text-left shadow-[0_8px_24px_-14px_color-mix(in_oklab,var(--ink)_30%,transparent)] transition-all duration-200 ease-out active:scale-[0.98] active:border-accent"
              >
                <img
                  src={o.img}
                  alt=""
                  className="absolute inset-y-0 right-0 h-full w-[62%] bg-muted object-cover"
                  decoding="async"
                  fetchPriority="high"
                  style={{ objectPosition: o.pos }}
                />
                <span className="absolute inset-y-0 right-0 w-[62%] bg-gradient-to-r from-card via-card/10 to-transparent" />
                <span className="relative z-10 flex h-full w-[52%] flex-col justify-center pl-5">
                  <span className="font-display text-[2.1rem] leading-none">{o.title}</span>
                  <span className="mt-2 h-px w-10 bg-accent" />
                  <span className="mt-2 text-[0.58rem] uppercase leading-relaxed tracking-[0.2em] text-muted-foreground">
                    {o.sub}
                  </span>
                </span>
                <span className="absolute right-3 bottom-3 z-10 flex h-7 w-7 items-center justify-center rounded-full bg-card/85 text-sm text-accent backdrop-blur-sm transition-transform duration-200 group-active:translate-x-0.5">
                  →
                </span>
              </button>
            ))}
          </div>
        </main>
      </div>

      {/* Desktop / tablet: unchanged */}
      <div className="hidden sm:block">
        <Page>
          <ScreenHeader back="/" title="Step 1 of 5" />
          <Screen center>
            <h1 className="font-display text-5xl leading-[0.95] sm:text-6xl">
              Who are we
              <br />
              <span className="italic">styling?</span>
            </h1>
            <p className="mt-4 text-sm text-muted-foreground">
              This defines the entire menu that follows.
            </p>
            <div className="mt-10 grid gap-4 sm:grid-cols-2">
              {options.map((o) => (
                <button
                  key={o.key}
                  onClick={() => choose(o.key)}
                  className="group relative overflow-hidden border border-foreground/15 bg-card px-7 py-9 text-left transition-all duration-300 hover:border-foreground/45"
                >
                  <span className="absolute inset-x-0 bottom-0 h-px origin-left scale-x-0 bg-accent transition-transform duration-500 group-hover:scale-x-100" />
                  <div className="font-display text-4xl leading-none">{o.title}</div>
                  <div className="mt-3 text-xs tracking-[0.16em] uppercase text-muted-foreground">{o.sub}</div>
                  <div className="mt-8 label-caps flex items-center justify-between text-foreground/60">
                    <span>View menu</span>
                    <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
                  </div>
                </button>
              ))}
            </div>
          </Screen>
        </Page>
      </div>
    </>
  );
}
