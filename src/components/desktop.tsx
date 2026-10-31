// Laptop / desktop (lg+) building blocks for the booking flow.
// Mobile keeps using the components in ./screen.tsx.
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight, Clock, MapPin, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { BUSINESS, CLOSE_MINUTE, OPEN_MINUTE, WEEK, minuteLabel, type Audience } from "@/lib/salon";
import { Wordmark } from "@/components/screen";
import menImg from "@/assets/men.jpg.asset.json";
import womenImg from "@/assets/women.jpg.asset.json";

export const STEPS = ["Who", "Services", "Time", "Details", "Confirm"] as const;

export const AUDIENCE_IMAGE: Record<Audience, { src: string; pos: string }> = {
  men: { src: menImg.url, pos: "60% 30%" },
  women: { src: womenImg.url, pos: "45% 25%" },
};

const pad = (n: number) => String(n).padStart(2, "0");

export const prettyPhone = (p: string) => {
  const d = p.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) return `+91 ${d.slice(2, 7)} ${d.slice(7)}`;
  if (d.length === 10) return `+91 ${d.slice(0, 5)} ${d.slice(5)}`;
  return p;
};

/** Full-height desktop shell: header, scrolling body, sticky footer bar. */
export function DesktopPage({ children }: { children: ReactNode }) {
  return (
    <div className="hidden h-[100svh] flex-col overflow-hidden bg-background lg:flex">
      {children}
    </div>
  );
}

/** Back · centred wordmark · step counter, with a progress line underneath. */
export function DesktopStepHeader({ back, step }: { back: string; step: number }) {
  return (
    <header className="shrink-0">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center px-10 py-4 xl:px-16">
        <Link
          to={back as never}
          className="label-caps inline-flex items-center gap-3 justify-self-start text-foreground/80 transition-opacity hover:opacity-60"
        >
          <ArrowLeft className="h-[18px] w-[18px]" strokeWidth={1.25} />
          Back
        </Link>
        <Link to="/" aria-label="Hair by Bhargav" className="inline-flex">
          <Wordmark className="h-12" />
        </Link>
        <span className="label-caps justify-self-end tabular-nums text-foreground/80">
          {pad(step)} / {pad(STEPS.length)}
        </span>
      </div>
      <ProgressLine step={step} />
    </header>
  );
}

export function ProgressLine({ step, className }: { step: number; className?: string }) {
  return (
    <div
      className={cn("h-0.5 w-full bg-hairline", className)}
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={STEPS.length}
      aria-valuenow={step}
      aria-label={`Step ${step} of ${STEPS.length}`}
    >
      <div
        className="h-full bg-bronze/70 transition-[width] duration-700"
        style={{ width: `${(step / STEPS.length) * 100}%` }}
      />
    </div>
  );
}

/** Wordmark · numbered stepper · call button (services screen). */
export function DesktopStepperHeader({ step }: { step: number }) {
  return (
    <header className="flex shrink-0 items-center justify-between gap-8 hairline-b px-10 py-4 xl:px-16">
      <Link to="/" aria-label="Hair by Bhargav" className="inline-flex shrink-0">
        <Wordmark className="h-14" />
      </Link>
      <ol className="flex flex-1 items-start justify-center" aria-label="Booking progress">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const done = n < step;
          const on = n === step;
          return (
            <li
              key={label}
              className="relative flex w-28 flex-col items-center xl:w-36"
              aria-current={on ? "step" : undefined}
            >
              {i > 0 ? (
                <span
                  className={cn(
                    "absolute top-[1.4rem] right-1/2 h-px w-full",
                    n <= step ? "bg-bronze/60" : "bg-foreground/15",
                  )}
                />
              ) : null}
              <span
                className={cn(
                  "text-[0.65rem] tabular-nums tracking-[0.12em]",
                  on ? "text-bronze" : "text-foreground/45",
                )}
              >
                {pad(n)}
              </span>
              <span
                className={cn(
                  "relative z-10 mt-1.5 h-2.5 w-2.5 rounded-full border bg-background",
                  on ? "border-bronze bg-bronze" : done ? "border-bronze" : "border-foreground/30",
                )}
              />
              <span className={cn("label-caps mt-2.5", on ? "text-bronze" : "text-foreground/50")}>
                {label}
              </span>
            </li>
          );
        })}
      </ol>
      <CallButton />
    </header>
  );
}

export function CallButton({ withNumber = true }: { withNumber?: boolean }) {
  const phone = BUSINESS.phones[0] ?? "";
  return (
    <a
      href={`tel:${phone}`}
      className="group flex shrink-0 items-center gap-4"
      aria-label="Call the studio"
    >
      <span className="flex h-14 w-14 items-center justify-center border border-foreground/15 transition-colors group-hover:border-foreground/40">
        <Phone className="h-5 w-5" strokeWidth={1.25} />
      </span>
      {withNumber ? (
        <span className="hidden xl:block">
          <span className="block text-[0.95rem] tracking-[0.06em]">{prettyPhone(phone)}</span>
          <span className="eyebrow mt-0.5 block">Call us</span>
        </span>
      ) : null}
    </a>
  );
}

/** Sticky summary bar at the bottom of each desktop step. */
export function DesktopBar({ children }: { children: ReactNode }) {
  return (
    <div className="shrink-0 border-t border-hairline bg-card shadow-[0_-12px_32px_-24px_color-mix(in_oklab,var(--ink)_35%,transparent)]">
      <div className="flex items-center gap-8 px-10 py-4 xl:px-16">{children}</div>
    </div>
  );
}

export function DesktopCTA({
  children,
  onClick,
  disabled,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "press sheen group flex h-[4.25rem] min-w-[19rem] items-center justify-center gap-4 rounded-sm bg-foreground px-10 text-[1.05rem] tracking-[0.02em] text-background hover:bg-foreground/88 disabled:bg-foreground/30",
        className,
      )}
    >
      <span>{children}</span>
      <ArrowRight
        className="h-5 w-5 transition-transform duration-300 group-hover:translate-x-1 group-disabled:translate-x-0"
        strokeWidth={1.25}
      />
    </button>
  );
}

/** Dark editorial image panel used on the right of several steps. */
export function ImagePanel({
  src,
  pos = "50% 30%",
  eyebrow,
  title,
  sub,
  className,
}: {
  src: string;
  pos?: string | undefined;
  eyebrow?: string | undefined;
  title: ReactNode;
  sub?: string | undefined;
  className?: string;
}) {
  return (
    <aside className={cn("relative overflow-hidden bg-ink text-ivory", className)}>
      <img
        src={src}
        alt=""
        className="absolute inset-0 h-full w-full object-cover opacity-80 cine-drift"
        style={{ objectPosition: pos }}
        decoding="async"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/10" />
      <div className="stagger absolute inset-x-0 bottom-0 p-10 xl:p-12">
        {eyebrow ? (
          <div className="text-[0.7rem] uppercase tracking-[0.32em] text-ivory/80">{eyebrow}</div>
        ) : null}
        <div className="mt-4 font-display text-[clamp(2.6rem,4vw,3.75rem)] leading-[1.02]">
          {title}
        </div>
        {sub ? (
          <div className="mt-5 max-w-xs text-[0.7rem] uppercase leading-loose tracking-[0.3em] text-ivory/80">
            {sub}
          </div>
        ) : null}
      </div>
    </aside>
  );
}

/** Step eyebrow + display title with an italic bronze accent word. */
export function StepTitle({
  step,
  children,
  className,
}: {
  step: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="text-[0.72rem] uppercase tracking-[0.32em] text-muted-foreground">
        Step {step}
      </div>
      <h1 className="mt-3 font-display text-[clamp(3rem,4.4vw,4rem)] leading-[1.02] tracking-[-0.01em]">
        {children}
      </h1>
    </div>
  );
}

export function Accent({ children }: { children: ReactNode }) {
  return <span className="italic text-bronze">{children}</span>;
}

/** Square thumbnail used in summaries. */
export function Thumb({ src, pos, className }: { src: string; pos?: string; className?: string }) {
  return (
    <img
      src={src}
      alt=""
      className={cn("h-24 w-24 shrink-0 rounded-sm bg-muted object-cover", className)}
      style={{ objectPosition: pos }}
      decoding="async"
    />
  );
}

/** "Wed – Mon" from the weekly pattern (first open day after a closed day). */
export function openDaysLabel() {
  const short = (d: string) => d.slice(0, 3);
  const closedAt = WEEK.findIndex((w) => w.closed);
  if (closedAt === -1) return "Mon – Sun";
  const open = WEEK.map((_, i) => WEEK[(closedAt + 1 + i) % WEEK.length]!).filter((w) => !w.closed);
  if (open.length === 0) return "Closed";
  return `${short(open[0]!.day)} – ${short(open[open.length - 1]!.day)}`;
}

/** Hours · studio · contact row used at the foot of the entry screens. */
export function InfoStrip({ className }: { className?: string }) {
  const phone = BUSINESS.phones[0] ?? "";
  const [area, ...rest] = BUSINESS.locationShort.split(" · ");
  const info = [
    {
      icon: Clock,
      label: "Hours",
      lines: [openDaysLabel(), `${minuteLabel(OPEN_MINUTE)} – ${minuteLabel(CLOSE_MINUTE)}`],
      href: "/hours",
    },
    { icon: MapPin, label: "Studio", lines: [`${area},`, rest.join(", ")], href: "/studio" },
    { icon: Phone, label: "Contact", lines: [prettyPhone(phone)], href: `tel:${phone}` },
  ];
  return (
    <footer className={cn("grid shrink-0 grid-cols-3 hairline-t py-7", className)}>
      {info.map(({ icon: Icon, label, lines, href }, i) => (
        <a
          key={label}
          href={href}
          className={cn("group flex items-start gap-5 px-8 first:pl-0", i < 2 && "border-r border-hairline")}
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full border border-bronze/25 text-bronze transition-colors duration-300 group-hover:bg-bronze group-hover:text-ivory">
            <Icon className="h-5 w-5" strokeWidth={1.25} />
          </span>
          <span>
            <span className="label-caps block text-foreground/85">{label}</span>
            {lines.map((l) => (
              <span
                key={l}
                className="mt-1 block text-[0.95rem] text-muted-foreground transition-colors group-hover:text-foreground"
              >
                {l}
              </span>
            ))}
          </span>
        </a>
      ))}
    </footer>
  );
}
