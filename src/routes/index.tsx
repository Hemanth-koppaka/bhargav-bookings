import { createFileRoute, Link } from "@tanstack/react-router";
import { Phone } from "lucide-react";
import { BUSINESS } from "@/lib/salon";
import { Wordmark } from "@/components/screen";
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
  { to: "/contact", label: "Contact" },
] as const;

function Home() {
  return (
    <div className="h-[100svh] overflow-hidden bg-background lg:h-auto lg:overflow-visible lg:min-h-screen lg:grid lg:min-h-screen lg:grid-cols-[1fr_0.85fr]">
      {/* Left / mobile column */}
      <div className="flex h-[100svh] flex-col lg:h-auto lg:min-h-screen">
        <div className="safe-t"><header className="flex items-center justify-between px-6 pt-5 lg:px-14 lg:pt-10">
          <Wordmark className="h-10 lg:h-12" />
          <a
            href={`tel:${BUSINESS.phones[0]}`}
            aria-label="Call the studio"
            className="inline-flex h-11 w-11 items-center justify-center border border-foreground/15 transition-colors hover:border-foreground/40"
          >
            <Phone className="h-4 w-4" strokeWidth={1.25} />
          </a>
        </header></div>

        <main className="flex min-h-0 flex-1 flex-col justify-center px-6 py-4 lg:py-12 lg:px-14">
          <div className="fade-rise">
            <div className="eyebrow">{BUSINESS.locationShort}</div>

            <h1 className="mt-[clamp(1rem,3svh,1.75rem)] font-display text-[clamp(3rem,14vw,3.6rem)] leading-[0.92] tracking-[-0.015em] sm:text-7xl lg:text-8xl">
              Reserve
              <br />
              <span className="italic text-foreground/85">your chair.</span>
            </h1>

            <p className="mt-[clamp(1rem,3svh,1.75rem)] max-w-sm text-[0.9rem] lg:text-[0.95rem] leading-relaxed text-muted-foreground">
              Hair, beauty and makeover by B. Bhargav. Choose a service, pick a time that is
              genuinely free, and you're booked.
            </p>

            <div className="mt-[clamp(1.5rem,5svh,2.75rem)] max-w-sm space-y-3">
              <Link
                to="/book"
                className="label-caps group flex w-full items-center justify-between gap-4 bg-foreground px-6 py-4.5 text-background transition-colors duration-300 hover:bg-foreground/88"
              >
                <span>Book an appointment</span>
                <span className="transition-transform duration-300 group-hover:translate-x-1">→</span>
              </Link>
              <Link
                to="/manage"
                className="label-caps flex w-full items-center justify-center border border-foreground/18 px-6 py-4 text-foreground/75 transition-colors duration-300 hover:border-foreground/45 hover:text-foreground"
              >
                Manage an existing booking
              </Link>
            </div>
          </div>
        </main>

        <nav className="grid grid-cols-3 hairline-t safe-b lg:pb-0">
          {quickLinks.map((l, i) => (
            <Link
              key={l.to}
              to={l.to}
              className={
                "label-caps py-4 lg:py-5 text-center text-foreground/70 transition-colors hover:text-foreground" +
                (i < 2 ? " border-r border-hairline" : "")
              }
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <div className="hidden">
          <Link to="/artist" className="eyebrow block py-4 text-center">
            The Artist · D. Bhargav
          </Link>
        </div>
      </div>

      {/* Editorial image column — desktop / tablet only */}
      <aside className="relative hidden lg:block">
        <img
          src={founder.url}
          alt="B. Bhargav, founder and chief stylist"
          className="h-full w-full object-cover grayscale"
        />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-10">
          <div className="eyebrow text-white/60">Founder · Chief Stylist</div>
          <div className="mt-2 font-display text-3xl text-white">D. Bhargav</div>
          <Link
            to="/artist"
            className="label-caps mt-4 inline-block border-b border-white/40 pb-1 text-white/85"
          >
            Read the story
          </Link>
        </div>
      </aside>
    </div>
  );
}
