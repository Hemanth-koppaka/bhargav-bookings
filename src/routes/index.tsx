import { createFileRoute, Link } from "@tanstack/react-router";
import { CONTENT } from "@/lib/site-content";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowRight, Phone } from "lucide-react";
import { BUSINESS, hoursFor, isClosed, minuteLabel, toISO } from "@/lib/salon";
import { LogoReveal } from "@/components/motion";
import { CallButton, InfoStrip } from "@/components/desktop";
import { SoundToggle } from "@/components/sound-toggle";
import { useBooking } from "@/lib/booking-store";
import { shouldAskRating } from "@/components/rate-visit";
import founder from "@/assets/founder.jpg.asset.json";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Hair by Bhargav — Reserve your chair" },
      {
        name: "description",
        content:
          "Hair, beauty and makeover by B. Bhargav. Choose a service, pick a time that is genuinely free, and you're booked. KPHB Phase 9, Kukatpally, Hyderabad.",
      },
      { property: "og:title", content: "Hair by Bhargav — Reserve your chair" },
      {
        property: "og:description",
        content:
          "Hair, beauty and makeover by B. Bhargav. A calm, private booking experience.",
      },
    ],
  }),
  component: Home,
});

const quickLinks = [
  { to: "/hours", label: "Hours" },
  { to: "/studio", label: "Studio" },
  { to: "/artist", label: "Artist" },
  { to: "/contact", label: "Contact" },
] as const;

const steps = ["Choose your services", "Pick a free time", "Confirm in seconds"];

/** "Open today · 10:00 AM – 8:00 PM" — computed on the client so it uses the visitor's clock. */
function useTodayStatus() {
  const [status, setStatus] = useState<{ open: boolean; text: string } | null>(null);
  useEffect(() => {
    const now = new Date();
    const iso = toISO(now);
    if (isClosed(iso)) {
      setStatus({ open: false, text: "Closed today" });
      return;
    }
    const h = hoursFor(iso);
    const mins = now.getHours() * 60 + now.getMinutes();
    if (mins >= h.close) setStatus({ open: false, text: "Closed for today" });
    else if (mins < h.open) setStatus({ open: true, text: `Opens today at ${minuteLabel(h.open)}` });
    else setStatus({ open: true, text: `Open now · until ${minuteLabel(h.close)}` });
  }, []);
  return status;
}

function StatusPill({ className }: { className?: string }) {
  const status = useTodayStatus();
  if (!status) return null;
  return (
    <span
      className={
        "soft-fade inline-flex items-center gap-2 rounded-full bg-ivory/90 px-3.5 py-1.5 text-[0.75rem] text-ink backdrop-blur-sm " +
        (className ?? "")
      }
    >
      <span className="relative flex h-2 w-2">
        {status.open ? (
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500/60" />
        ) : null}
        <span
          className={"relative inline-flex h-2 w-2 rounded-full " + (status.open ? "bg-emerald-600" : "bg-foreground/35")}
        />
      </span>
      {status.text}
    </span>
  );
}

/** Optional line the salon can publish from the console (holiday hours, offers…). */
function Announcement({ className }: { className?: string }) {
  if (!CONTENT.announcement.enabled || !CONTENT.announcement.text) return null;
  return (
    <p className={"border-l-2 border-bronze/60 pl-3 text-[0.85rem] leading-relaxed text-foreground/80 " + (className ?? "")}>
      {CONTENT.announcement.text}
    </p>
  );
}

/** Mobile: today's status as a quiet editorial line under the portrait (no badge over the photo). */
function StatusLine() {
  const status = useTodayStatus();
  // reserve the line's height so nothing shifts when it appears after hydration
  if (!status) return <div className="-mt-1.5 h-4 md:hidden" aria-hidden />;
  const [lead, ...rest] = status.text.split(" · ");
  return (
    <div className="-mt-1.5 flex h-4 items-center md:hidden gap-2 text-[0.64rem] font-medium uppercase tracking-[0.2em] text-foreground/80">
      <span className={"h-1.5 w-1.5 shrink-0 rounded-full " + (status.open ? "bg-emerald-600" : "bg-foreground/35")} aria-hidden />
      <span>{lead}</span>
      {rest.length ? (
        <>
          <span className="text-foreground/30" aria-hidden>·</span>
          <span className="text-foreground/60">{rest.join(" · ")}</span>
        </>
      ) : null}
    </div>
  );
}

function Home() {
  return (
    <>
      <Intro />
      <MobileHome />
      <DesktopHome />
    </>
  );
}

/**
 * First-visit opening (once per browser session). The header wordmark itself
 * is the star: it starts large in the middle of a blurred page, turns in with
 * a slow 3D camera move while scissors cut the ribbon beneath it, then glides
 * up into its place in the header as the page comes into focus. Nothing is
 * swapped at the end, because the logo never left the header.
 */
function Intro() {
  const [gone, setGone] = useState(false);
  const overlay = useRef<HTMLDivElement>(null);
  const [lineTop, setLineTop] = useState<number | null>(null);

  useLayoutEffect(() => {
    const root = document.documentElement;
    if (root.classList.contains("intro-seen")) {
      setGone(true);
      return;
    }
    const logo = [...document.querySelectorAll<HTMLElement>("[data-hero-logo]")].find(
      (el) => el.getClientRects().length > 0,
    );
    const finish = () => {
      // the logo has landed: it stays still from here (no second reveal or sheen)
      root.classList.add("intro-seen", "intro-done");
      root.classList.remove("intro-run");
      setGone(true);
    };
    if (!logo || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      finish();
      return;
    }

    let cancelled = false;
    let stop = () => {};
    // The flight is measured from the real header logo, so wait for its image (max 1.5 s).
    const img = logo.querySelector("img");
    const ready = new Promise<void>((resolve) => {
      if (!img || (img.complete && img.naturalWidth > 0)) return resolve();
      img.addEventListener("load", () => resolve(), { once: true });
      img.addEventListener("error", () => resolve(), { once: true });
      window.setTimeout(resolve, 1500);
    });
    void ready.then(() => {
      if (!cancelled) stop = run(logo, finish);
    });
    return () => {
      cancelled = true;
      stop();
    };
  }, []);

  /** Starts the camera move; returns a cleanup. */
  const run = (logo: HTMLElement, finish: () => void) => {
    const r = logo.getBoundingClientRect();
    if (!r.width || !r.height) {
      finish();
      return () => {};
    }
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const target = Math.min(vw < 640 ? 104 : 168, vh * 0.22);
    const scale = target / r.height;
    const dx = vw / 2 - (r.left + r.width / 2);
    const dy = vh / 2 - (r.top + r.height / 2) - target * 0.15;
    setLineTop(vh / 2 + target * 0.35 + 18);

    const at = (extra: string) => `translate(${dx}px, ${dy}px) ${extra}`;
    logo.style.transformOrigin = "50% 50%";
    logo.style.position = "relative";
    logo.style.zIndex = "101";
    document.documentElement.classList.add("intro-run");

    const fly = logo.animate(
      [
        { transform: at(`perspective(900px) scale(${scale * 1.35}) rotateX(22deg) rotateY(-80deg)`), opacity: 0, filter: "blur(14px)", offset: 0, easing: "cubic-bezier(0.2, 0.7, 0.2, 1)" },
        { transform: at(`perspective(900px) scale(${scale * 1.04}) rotateX(-4deg) rotateY(10deg)`), opacity: 1, filter: "blur(0px)", offset: 0.34, easing: "cubic-bezier(0.3, 0, 0.2, 1)" },
        { transform: at(`perspective(900px) scale(${scale}) rotateX(0deg) rotateY(0deg)`), opacity: 1, filter: "blur(0px)", offset: 0.5 },
        { transform: at(`perspective(900px) scale(${scale}) rotateX(0deg) rotateY(0deg)`), opacity: 1, filter: "blur(0px)", offset: 0.66, easing: "cubic-bezier(0.65, 0, 0.25, 1)" },
        // same function list as the other frames, so the browser interpolates each part smoothly
        { transform: "translate(0px, 0px) perspective(900px) scale(1) rotateX(0deg) rotateY(0deg)", opacity: 1, filter: "blur(0px)", offset: 1 },
      ],
      // timing is shaped per segment above: turn in (1 s), settle, hold (sheen), glide home (1 s)
      { duration: 3000, easing: "linear", fill: "both" },
    );
    const veil = overlay.current?.animate(
      [
        { opacity: 1, offset: 0 },
        { opacity: 1, offset: 0.64 },
        { opacity: 0, offset: 1 },
      ],
      { duration: 3000, easing: "ease-in-out", fill: "both" },
    );
    let done = false;
    fly.onfinish = () => {
      if (done) return;
      done = true;
      fly.cancel();
      logo.style.removeProperty("transform-origin");
      logo.style.removeProperty("position");
      logo.style.removeProperty("z-index");
      finish();
    };
    const skip = () => {
      fly.finish();
      veil?.finish();
    };
    const el = overlay.current;
    el?.addEventListener("click", skip);
    return () => {
      el?.removeEventListener("click", skip);
      if (!done) fly.cancel();
      veil?.cancel();
    };
  };

  if (gone) return null;
  return (
    <div
      ref={overlay}
      aria-hidden
      className="intro fixed inset-0 z-[100] bg-background/55 backdrop-blur-xl"
    >
      {lineTop != null ? (
        <div className="absolute left-1/2 flex -translate-x-1/2 flex-col items-center" style={{ top: lineTop }}>
          <div className="fade-rise whitespace-nowrap text-center text-[0.66rem] uppercase tracking-[0.36em] text-foreground/70 [animation-delay:1s]">
            {BUSINESS.tagline}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MobileHome() {
  return (
    <div className="flex h-[100svh] min-h-[600px] flex-col overflow-hidden bg-background lg:hidden">
      <div className="safe-t">
        <header className="flex items-center justify-between px-5 pt-4 pb-3">
          <span data-hero-logo className="after-intro-logo inline-flex">
            <LogoReveal className="h-10" />
          </span>
          <div className="flex items-center gap-2">
            <SoundToggle />
            <a
              href={`tel:${BUSINESS.phones[0]}`}
              aria-label="Call the studio"
              data-sfx="contact"
              className="press inline-flex h-11 w-11 items-center justify-center rounded-full border border-foreground/15 hover:border-foreground/40"
            >
              <Phone className="h-4 w-4" strokeWidth={1.25} />
            </a>
          </div>
        </header>
      </div>

      <main className="flex min-h-0 flex-1 flex-col px-5">
        <Link
          to="/artist"
          className="press group relative min-h-[120px] flex-1 overflow-hidden rounded-xl bg-ink"
          aria-label="Meet D. Bhargav"
        >
          <img
            src={founder.url}
            alt=""
            className="cine-drift absolute inset-0 h-full w-full object-cover object-[50%_25%] opacity-90"
            decoding="async"
            fetchPriority="high"
          />
          <span className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
          {/* tablet keeps the status on the photo; phones show it as a line below (StatusLine) */}
          <StatusPill className="absolute top-3.5 left-3.5 max-md:hidden" />
          <span className="absolute inset-x-0 bottom-0 flex items-end justify-between p-4 text-ivory">
            <span>
              <span className="block text-[0.6rem] uppercase tracking-[0.28em] text-ivory/75">Founder · Chief Stylist</span>
              <span className="mt-1 block font-display text-[1.6rem] leading-none">{BUSINESS.founder}</span>
            </span>
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-ivory/90 text-ink transition-transform group-hover:translate-x-0.5">
              <ArrowRight className="h-4 w-4" strokeWidth={1.25} />
            </span>
          </span>
        </Link>

        <div className="stagger after-intro shrink-0 pt-[clamp(1rem,3svh,1.75rem)] pb-[clamp(0.75rem,2svh,1.25rem)]">
          <StatusLine />
          <div className="mt-4 text-[0.6rem] uppercase tracking-[0.28em] text-muted-foreground md:mt-0">{BUSINESS.locationShort}</div>
          <h1 className="mt-2 font-display text-[clamp(2.6rem,12vw,3.4rem)] leading-[0.95] tracking-[-0.015em]">
            {CONTENT.home.headline} <span className="italic text-bronze">{CONTENT.home.headlineAccent}</span>
          </h1>
          <p className="mt-3 text-[0.9rem] leading-relaxed text-muted-foreground">{CONTENT.home.intro}</p>
          <Announcement className="mt-3" />
          <RatePrompt className="mt-3" />
          <div className="mt-[clamp(1rem,2.5svh,1.5rem)] space-y-2.5">
            <Link
              to="/book"
              data-sfx="primary"
              data-sfx-hover=""
              className="label-caps press sheen group flex min-h-14 w-full items-center justify-between gap-4 rounded-sm bg-foreground px-6 text-background hover:bg-foreground/88"
            >
              <span>{CONTENT.home.ctaLabel}</span>
              <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" strokeWidth={1.25} />
            </Link>
            <Link
              to="/manage"
              className="label-caps press flex min-h-12 w-full items-center justify-center rounded-sm border border-foreground/18 px-6 text-foreground/75 hover:border-foreground/45 hover:text-foreground"
            >
              Manage a booking
            </Link>
          </div>
        </div>
      </main>

      <nav className="grid shrink-0 grid-cols-4 hairline-t safe-b pb-0">
        {quickLinks.map((l, i) => (
          <Link
            key={l.to}
            to={l.to}
            className={
              "label-caps press py-4 text-center text-[0.62rem] text-foreground/70 hover:text-foreground " +
              (i < quickLinks.length - 1 ? "border-r border-hairline" : "")
            }
          >
            {l.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

function DesktopHome() {
  return (
    <div className="hidden min-h-[100svh] flex-col bg-background lg:flex">
      <header className="mx-8 flex shrink-0 items-center justify-between gap-8 hairline-b px-6 py-5 xl:mx-10 xl:px-16">
        <Link to="/" aria-label="Hair by Bhargav" className="inline-flex">
          <span data-hero-logo className="after-intro-logo inline-flex">
            <LogoReveal className="h-14" />
          </span>
        </Link>
        <nav className="flex items-center gap-10" aria-label="Main">
          {quickLinks.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className="label-caps relative py-2 text-foreground/70 transition-colors hover:text-foreground after:absolute after:inset-x-0 after:bottom-0 after:h-px after:origin-left after:scale-x-0 after:bg-bronze after:transition-transform after:duration-300 hover:after:scale-x-100"
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-4">
          <SoundToggle className="lg:h-14 lg:w-14" />
          <CallButton />
        </div>
      </header>

      <main className="grid flex-1 grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] items-center gap-12 px-12 py-8 xl:gap-20 xl:px-24">
        <div className="stagger after-intro">
          <div className="flex items-center gap-4 text-[0.72rem] uppercase tracking-[0.32em] text-bronze">
            <span className="h-px w-10 bg-bronze/60" />
            {BUSINESS.tagline}
          </div>
          <h1 className="mt-8 font-display text-[clamp(4.25rem,7vw,7rem)] leading-[0.92] tracking-[-0.02em]">
            {CONTENT.home.headline}
            <br />
            <span className="italic text-bronze">{CONTENT.home.headlineAccent}</span>
          </h1>
          <p className="mt-8 max-w-md text-[1.1rem] leading-relaxed text-muted-foreground">{CONTENT.home.introLong}</p>
          <Announcement className="mt-5 max-w-md" />
          <RatePrompt className="mt-4 max-w-md" />
          <div className="mt-10 flex items-center gap-4">
            <Link
              to="/book"
              data-sfx="primary"
              data-sfx-hover=""
              className="press sheen group flex h-[4.25rem] items-center gap-5 whitespace-nowrap rounded-sm bg-foreground px-8 text-[1.05rem] text-background hover:bg-foreground/88 xl:px-10"
            >
              {CONTENT.home.ctaLabel}
              <ArrowRight className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" strokeWidth={1.25} />
            </Link>
            <Link
              to="/manage"
              className="press flex h-[4.25rem] items-center whitespace-nowrap rounded-sm border border-foreground/18 px-7 text-[1.05rem] text-foreground/80 hover:border-foreground/50 hover:text-foreground xl:px-8"
            >
              Manage a booking
            </Link>
          </div>
          <ol className="mt-12 hidden items-center gap-6 text-[0.9rem] text-muted-foreground xl:flex">
            {steps.map((t, i) => (
              <li key={t} className="flex items-center gap-3">
                <span className="flex h-8 w-8 items-center justify-center rounded-full border border-bronze/30 font-display text-[1rem] text-bronze">
                  {i + 1}
                </span>
                {t}
                {i < steps.length - 1 ? <span className="ml-3 h-px w-6 bg-foreground/15" /> : null}
              </li>
            ))}
          </ol>
        </div>

        <Link
          to="/artist"
          className="group relative h-[clamp(420px,64svh,640px)] overflow-hidden rounded-xl bg-ink shadow-[0_40px_80px_-48px_color-mix(in_oklab,var(--ink)_80%,transparent)]"
          aria-label="Meet D. Bhargav — read the story"
        >
          <img
            src={founder.url}
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-[50%_20%] grayscale transition-[filter,transform] duration-1000 ease-out group-hover:scale-[1.03] group-hover:grayscale-0"
            decoding="async"
            fetchPriority="high"
          />
          <span className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/5 to-transparent" />
          <StatusPill className="absolute top-6 left-6" />
          <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-6 p-10 text-ivory">
            <span>
              <span className="block text-[0.7rem] uppercase tracking-[0.32em] text-ivory/75">Founder · Chief Stylist</span>
              <span className="mt-3 block font-display text-[2.6rem] leading-none">{BUSINESS.founder}</span>
              <span className="mt-4 inline-block border-b border-ivory/40 pb-1 text-[0.72rem] uppercase tracking-[0.28em] text-ivory/85">
                Read the story
              </span>
            </span>
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-ivory text-ink transition-transform duration-300 group-hover:translate-x-1">
              <ArrowRight className="h-5 w-5" strokeWidth={1.25} />
            </span>
          </span>
        </Link>
      </main>

      <InfoStrip className="mx-8 px-6 xl:mx-10 xl:px-16" />
    </div>
  );
}

/** Returning guests: a quiet invitation to rate their latest visit (last 30 days, once). */
function RatePrompt({ className }: { className?: string }) {
  const { bookings, hydrated } = useBooking();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || !hydrated) return null;
  const monthAgo = toISO(new Date(Date.now() - 30 * 86_400_000));
  const b = bookings
    .filter((x) => x.date >= monthAgo && shouldAskRating(x))
    .sort((a, z) => z.date.localeCompare(a.date) || z.time - a.time)[0];
  if (!b) return null;
  const day = new Date(`${b.date}T00:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  return (
    <Link
      to="/manage"
      search={{ ref: b.reference }}
      className={"press flex items-center justify-between gap-3 rounded-md border border-bronze/30 bg-champagne/15 px-4 py-3 text-[0.9rem] " + (className ?? "")}
    >
      <span>
        How was your visit on {day}? <span className="text-bronze underline underline-offset-4">Rate it</span>
      </span>
      <span className="text-bronze" aria-hidden>
        ★
      </span>
    </Link>
  );
}
