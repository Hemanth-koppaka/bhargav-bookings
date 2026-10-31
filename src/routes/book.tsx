import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Clock, MapPin, Phone } from "lucide-react";
import { Page, Screen, ScreenHeader, Wordmark } from "@/components/screen";
import { CallButton, ProgressLine, prettyPhone } from "@/components/desktop";
import { useBooking } from "@/lib/booking-store";
import { BUSINESS, CLOSE_MINUTE, OPEN_MINUTE, WEEK, minuteLabel, type Audience } from "@/lib/salon";
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

      {/* Tablet: unchanged */}
      <div className="hidden sm:block lg:hidden">
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

      <DesktopBookEntry choose={choose} />
    </>
  );
}

/** "Wed – Mon" from the weekly pattern (first open day after a closed day). */
function openDaysLabel() {
  const short = (d: string) => d.slice(0, 3);
  const closedAt = WEEK.findIndex((w) => w.closed);
  if (closedAt === -1) return "Mon – Sun";
  const open = WEEK.map((_, i) => WEEK[(closedAt + 1 + i) % WEEK.length]!).filter((w) => !w.closed);
  if (open.length === 0) return "Closed";
  return `${short(open[0]!.day)} – ${short(open[open.length - 1]!.day)}`;
}

function DesktopBookEntry({ choose }: { choose: (a: Audience) => void }) {
  const phone = BUSINESS.phones[0] ?? "";
  const [area, ...rest] = BUSINESS.locationShort.split(" · ");
  const info = [
    { icon: Clock, label: "Hours", lines: [openDaysLabel(), `${minuteLabel(OPEN_MINUTE)} – ${minuteLabel(CLOSE_MINUTE)}`], href: "/hours" },
    { icon: MapPin, label: "Studio", lines: [`${area},`, rest.join(", ")], href: "/studio" },
    { icon: Phone, label: "Contact", lines: [prettyPhone(phone)], href: `tel:${phone}` },
  ];

  return (
    <div className="hidden h-[100svh] min-h-[640px] flex-col overflow-hidden bg-background lg:flex">
      <header className="mx-8 flex shrink-0 items-center justify-between hairline-b px-6 py-6 xl:mx-10 xl:px-16">
        <Link to="/" aria-label="Hair by Bhargav" className="inline-flex">
          <Wordmark className="h-16" />
        </Link>
        <div className="flex items-center gap-8">
          <CallButton withNumber={false} />
          <div className="text-[0.68rem] uppercase leading-relaxed tracking-[0.3em] text-foreground/80">
            {BUSINESS.locationShort.split(" · ").slice(0, 1)}
            <br />
            {BUSINESS.locationShort.split(" · ").slice(1).join(" · ")}
          </div>
        </div>
      </header>

      <main className="page-in grid min-h-0 flex-1 grid-cols-[minmax(21rem,0.8fr)_minmax(0,2fr)] items-center gap-10 px-14 py-8 xl:px-24">
        <div>
          <div className="text-[0.72rem] uppercase tracking-[0.32em]">
            <span className="text-bronze">Step one</span>
            <span className="mx-4 text-foreground/40">/</span>
            <span className="text-foreground/70">01 of 05</span>
          </div>
          <ProgressLine step={1} className="mt-4 w-56 rounded-full" />
          <h1 className="mt-14 font-display text-[clamp(3.25rem,5vw,4.75rem)] leading-[1] tracking-[-0.015em]">
            <span className="whitespace-nowrap">Who are we</span>
            <br />
            <span className="italic">styling?</span>
          </h1>
          <p className="mt-8 max-w-xs text-[1.05rem] leading-relaxed text-muted-foreground">
            This helps us show you the right services and availability.
          </p>
        </div>

        <div className="grid h-full max-h-[600px] grid-cols-2 gap-5">
          {options.map((o) => (
            <button
              key={o.key}
              onClick={() => choose(o.key)}
              className="group relative overflow-hidden rounded-md bg-ink text-left text-ivory shadow-[0_24px_48px_-28px_color-mix(in_oklab,var(--ink)_70%,transparent)]"
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

      <footer className="grid shrink-0 grid-cols-3 hairline-t px-14 py-8 xl:px-24">
        {info.map(({ icon: Icon, label, lines, href }, i) => (
          <a
            key={label}
            href={href}
            className={
              "group flex items-start gap-6 px-8 first:pl-0 " + (i < 2 ? "border-r border-hairline" : "")
            }
          >
            <Icon className="mt-1 h-7 w-7 shrink-0 text-bronze" strokeWidth={1.1} />
            <span>
              <span className="label-caps block text-foreground/85">{label}</span>
              {lines.map((l) => (
                <span key={l} className="mt-1 block text-[0.95rem] text-muted-foreground transition-colors group-hover:text-foreground">
                  {l}
                </span>
              ))}
            </span>
          </a>
        ))}
      </footer>
    </div>
  );
}
