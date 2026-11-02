// Laptop / desktop (lg+) building blocks for the booking flow.
// Mobile keeps using the components in ./screen.tsx.
import { Link } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, Clock, MapPin, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { BUSINESS, CLOSE_MINUTE, OPEN_MINUTE, WEEK, minuteLabel, type Audience } from "@/lib/salon";
import { Wordmark } from "@/components/screen";
import { ScissorsLine, useRewindBack } from "@/components/scissors-line";
import { BHARGAV_FULL, SIGNATURE_EMBLEM_HD, SIGNATURE_MARK, isSignature } from "@/lib/service-photos";

export const STEPS = ["Who", "Services", "Time", "Details", "Confirm"] as const;

export const AUDIENCE_IMAGE: Record<Audience, { src: string; pos: string }> = {
  // top-aligned so the head is never cropped, whatever the panel's shape
  men: { src: "/team/bhargav.webp", pos: "50% 0%" },
  women: { src: "/services/women-panel.webp", pos: "50% 20%" },
};

/** Picture for a booking summary: the first chosen service's photo, else the men/women image. */
export function selectionImage(
  selected: { name: string; photo?: string | undefined }[],
  audience: Audience | null,
): { src: string; pos: string; fit?: "contain" } {
  // Bhargav's Signature always shows his HB crown mark, never a stock portrait
  if (selected.some(isSignature)) return { src: SIGNATURE_MARK, pos: "50% 50%", fit: "contain" };
  const photo = selected.find((x) => x.photo)?.photo;
  return photo ? { src: photo, pos: "50% 30%" } : AUDIENCE_IMAGE[audience ?? "men"];
}

const pad = (n: number) => String(n).padStart(2, "0");

export const prettyPhone = (p: string) => {
  if (p.includes("•")) return p; // masked (from a Manage booking lookup)
  const d = p.replace(/\D/g, "");
  if (d.length === 12 && d.startsWith("91")) return `+91 ${d.slice(2, 7)} ${d.slice(7)}`;
  if (d.length === 10) return `+91 ${d.slice(0, 5)} ${d.slice(5)}`;
  return p;
};

/** Full-height desktop shell: header, scrolling body, sticky footer bar. */
export function DesktopPage({ children }: { children: ReactNode }) {
  return (
    <div className="hidden h-[100svh] min-h-[600px] flex-col overflow-hidden bg-background md:flex">
      {children}
    </div>
  );
}

/** Back · centred wordmark · step counter, with a progress line underneath. */
export function DesktopStepHeader({ back, step }: { back: string; step: number }) {
  const goBack = useRewindBack(back);
  return (
    <header className="shrink-0">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center px-6 py-4 lg:px-10 xl:px-16">
        <Link
          to={back as never}
          onClick={(e) => void goBack(e)}
          className="label-caps press inline-flex items-center gap-3 justify-self-start text-foreground/80 transition-opacity hover:opacity-60"
        >
          <ArrowLeft className="h-[18px] w-[18px]" strokeWidth={1.25} />
          Back
        </Link>
        <Link to="/" aria-label="Hair by Bhargav" className="inline-flex">
          <Wordmark className="h-12" />
        </Link>
        <span className="label-caps justify-self-end tabular-nums text-foreground/80">
          <span key={step} className="tick-in">{pad(step)}</span> / {pad(STEPS.length)}
        </span>
      </div>
      <ScissorsLine kind="header" step={step} total={STEPS.length} />
    </header>
  );
}

/** Wordmark · numbered stepper (scissors travel dot to dot) · call button. */
export function DesktopStepperHeader({ step }: { step: number }) {
  const list = useRef<HTMLOListElement>(null);
  const [track, setTrack] = useState<{ left: number; width: number; top: number } | null>(null);

  // The strand runs between the real first and last dots, so it lines up at every size.
  useLayoutEffect(() => {
    const ol = list.current;
    if (!ol) return;
    const measure = () => {
      const dots = ol.querySelectorAll<HTMLElement>("[data-dot]");
      const first = dots[0]?.getBoundingClientRect();
      const last = dots[dots.length - 1]?.getBoundingClientRect();
      const box = ol.getBoundingClientRect();
      if (!first || !last || !first.width) return;
      setTrack({
        left: first.left + first.width / 2 - box.left,
        width: last.left - first.left,
        top: first.top + first.height / 2 - box.top,
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(ol);
    return () => ro.disconnect();
  }, []);

  return (
    <header className="flex shrink-0 items-center justify-between gap-6 hairline-b px-6 py-4 lg:gap-8 lg:px-10 xl:px-16">
      <Link to="/" aria-label="Hair by Bhargav" className="inline-flex shrink-0">
        <Wordmark className="h-11 lg:h-14" />
      </Link>
      <ol ref={list} className="relative flex flex-1 items-start justify-center" aria-label="Booking progress">
        {track ? (
          <ScissorsLine
            kind="stepper"
            step={step}
            total={STEPS.length}
            className="!absolute"
            style={{ left: track.left, width: track.width, top: track.top }}
          />
        ) : null}
        {STEPS.map((label, i) => {
          const n = i + 1;
          const done = n < step;
          const on = n === step;
          return (
            <li
              key={label}
              className="relative flex w-[4.5rem] flex-col items-center lg:w-28 xl:w-36"
              aria-current={on ? "step" : undefined}
            >
              <span
                className={cn(
                  "text-[0.65rem] tabular-nums tracking-[0.12em] transition-colors duration-300",
                  on ? "text-bronze" : "text-foreground/45",
                )}
              >
                {pad(n)}
              </span>
              <span
                data-dot
                className={cn(
                  "relative z-10 mt-1.5 h-2.5 w-2.5 rounded-full border bg-background transition-colors duration-300",
                  on ? "border-bronze bg-bronze" : done ? "border-bronze" : "border-foreground/30",
                )}
              />
              <span className={cn("label-caps mt-2.5 transition-colors duration-300", on ? "text-bronze" : "text-foreground/50")}>
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
      data-sfx="contact"
      className="group flex shrink-0 items-center gap-4"
      aria-label="Call the studio"
    >
      <span className="press flex h-12 w-12 items-center justify-center rounded-full border border-foreground/15 transition-colors lg:h-14 lg:w-14 group-hover:border-foreground/40">
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
      <div className="flex items-center gap-5 px-6 py-4 lg:gap-8 lg:px-10 xl:px-16">{children}</div>
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
      data-sfx="primary"
      data-sfx-hover=""
      className={cn(
        "press sheen group flex h-16 shrink-0 items-center justify-center gap-4 rounded-sm bg-foreground px-8 md:min-w-[13rem] lg:h-[4.25rem] lg:min-w-[19rem] lg:px-10 text-[1.05rem] tracking-[0.02em] text-background hover:bg-foreground/88 disabled:bg-foreground/30",
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

/** Shown while Bhargav's Signature is chosen: an editorial panel — crisp HB crown
 * emblem on warm ivory, a real studio portrait treated as a photograph, then the words. */
export function SignaturePanel({ className }: { className?: string }) {
  return (
    <aside
      className={cn(
        "relative flex flex-col overflow-hidden bg-[radial-gradient(120%_80%_at_50%_28%,#fbf7f0_0%,#f1e7d8_58%,#e6d8c4_100%)] text-ink",
        className,
      )}
    >
      {/* the mark, kept exactly as designed — now served from the high-resolution file */}
      <div className="soft-fade flex shrink-0 items-center justify-center px-10 pt-11 xl:pt-13">
        <img
          src={SIGNATURE_EMBLEM_HD}
          alt="Hair by Bhargav"
          className="w-36 object-contain xl:w-40"
          decoding="async"
        />
      </div>

      {/* the artist — a real photograph, cropped to its own aspect, graded warm */}
      <div className="hairline-t hairline-b relative mt-10 min-h-0 flex-1 overflow-hidden">
        <span className="soft-fade absolute inset-0" key="signature-photo">
          <img
            src={BHARGAV_FULL}
            alt="Bhargav at the studio"
            className="absolute inset-0 h-full w-full object-cover object-[50%_16%] cine-drift-top"
            decoding="async"
          />
        </span>
        <span className="pointer-events-none absolute inset-0 bg-[#e9dcc6]/18 mix-blend-multiply" />
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-[#f1e7d8]/70" />
      </div>

      <div className="stagger shrink-0 px-10 pt-8 pb-11 xl:px-12">
        <div className="text-[0.7rem] uppercase tracking-[0.32em] text-bronze">Bhargav's Signature</div>
        <span aria-hidden className="mt-5 block h-px w-10 bg-bronze/60" />
        <div className="mt-5 font-display text-[clamp(2.4rem,3.6vw,3.4rem)] leading-[1.04]">
          Styled by
          <br />
          <span className="italic text-bronze">Bhargav</span>.
        </div>
        <div className="mt-5 max-w-xs text-[0.72rem] uppercase leading-[1.9] tracking-[0.22em] text-ink/70">
          Consultation, cut, beard, wash and styling.
        </div>
      </div>
    </aside>
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
      {/* keyed by image: a new picture fades in over the previous one */}
      <span key={src} className="soft-fade absolute inset-0">
        <img
          src={src}
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-80 cine-drift-top"
          style={{ objectPosition: pos }}
          decoding="async"
        />
      </span>
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-black/10" />
      <div key={eyebrow} className="stagger absolute inset-x-0 bottom-0 p-10 xl:p-12">
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
export function Thumb({
  src,
  pos,
  fit,
  className,
}: {
  src: string;
  pos?: string;
  fit?: "contain" | undefined;
  className?: string;
}) {
  return (
    <img
      src={src}
      alt=""
      className={cn(
        "h-24 w-24 shrink-0 rounded-sm",
        fit === "contain" ? "bg-[#f3ece1] object-contain p-1.5" : "bg-muted object-cover",
        className,
      )}
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
          className={cn("group flex items-start gap-4 px-5 first:pl-0 lg:gap-5 lg:px-8", i < 2 && "border-r border-hairline")}
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-bronze/25 lg:h-12 lg:w-12 text-bronze transition-colors duration-300 group-hover:bg-bronze group-hover:text-ivory">
            <Icon className="h-5 w-5" strokeWidth={1.25} />
          </span>
          <span>
            <span className="label-caps block text-foreground/85">{label}</span>
            {lines.map((l) => (
              <span
                key={l}
                className="mt-1 block whitespace-nowrap text-[0.9rem] text-muted-foreground transition-colors group-hover:text-foreground lg:text-[0.95rem]"
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

/** Horizontal strip with edge fades and arrow buttons for mouse users. */
export function ScrollStrip({
  children,
  label,
  className,
  scrollRef,
}: {
  children: ReactNode;
  label: string;
  className?: string;
  scrollRef?: RefObject<HTMLDivElement | null>;
}) {
  const own = useRef<HTMLDivElement>(null);
  const ref = scrollRef ?? own;
  const [edge, setEdge] = useState({ start: true, end: false });
  const update = () => {
    const el = ref.current;
    if (!el) return;
    setEdge({ start: el.scrollLeft < 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 });
  };
  useEffect(() => {
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const by = (dir: number) => {
    const el = ref.current;
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.75, behavior: "smooth" });
  };
  const arrow =
    "press absolute top-1/2 z-10 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-foreground/12 bg-card text-foreground/75 shadow-[0_8px_20px_-12px_color-mix(in_oklab,var(--ink)_50%,transparent)] transition-opacity duration-300 hover:text-foreground";
  return (
    <div className={cn("relative", className)}>
      <div
        ref={ref}
        onScroll={update}
        aria-label={label}
        className="overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {children}
      </div>
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-background to-transparent transition-opacity",
          edge.start && "opacity-0",
        )}
      />
      <span
        aria-hidden
        className={cn(
          "pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-background to-transparent transition-opacity",
          edge.end && "opacity-0",
        )}
      />
      <button
        type="button"
        aria-label="Earlier dates"
        onClick={() => by(-1)}
        className={cn(arrow, "-left-3", edge.start && "pointer-events-none opacity-0")}
        tabIndex={edge.start ? -1 : 0}
      >
        <ChevronLeft className="h-4 w-4" strokeWidth={1.5} />
      </button>
      <button
        type="button"
        aria-label="Later dates"
        onClick={() => by(1)}
        className={cn(arrow, "-right-3", edge.end && "pointer-events-none opacity-0")}
        tabIndex={edge.end ? -1 : 0}
      >
        <ChevronRight className="h-4 w-4" strokeWidth={1.5} />
      </button>
    </div>
  );
}
