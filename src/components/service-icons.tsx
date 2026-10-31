// Line icons for every service, each with its own small "selected" motion:
// scissors snip, razor glides, drops fall, steam rises, sparkles twinkle…
// The motion plays whenever `active` flips on (CSS in styles.css, `.svc-*`).
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Service } from "@/lib/salon";

export type IconKind =
  | "scissors"
  | "beard"
  | "razor"
  | "drop"
  | "brush"
  | "dryer"
  | "straightener"
  | "spa"
  | "bottle"
  | "hand"
  | "foot"
  | "leaf"
  | "sparkle"
  | "thread"
  | "wax"
  | "makeup"
  | "drape"
  | "crown"
  | "comb"
  | "pin";

const RULES: [RegExp, IconKind][] = [
  [/signature|essentials|premium|ethereal|bridal makeup/i, "crown"],
  [/beard|moustache/i, "beard"],
  [/shave/i, "razor"],
  [/hair spa/i, "spa"],
  [/blow dry|blast dry/i, "dryer"],
  [/wash|condition/i, "drop"],
  [/ironing|tonging|straighten|smoothen|keratin|botox/i, "straightener"],
  [/treatment/i, "bottle"],
  [/root|global|highlight|colour|color/i, "brush"],
  [/thread/i, "thread"],
  [/wax/i, "wax"],
  [/foot/i, "foot"],
  [/hand/i, "hand"],
  [/head|back massage|body polish/i, "leaf"],
  [/facial|clean up|d-tan|bright|pack/i, "sparkle"],
  [/saree|drap/i, "drape"],
  [/updo|styling/i, "comb"],
  [/makeup/i, "makeup"],
  [/outdoor/i, "pin"],
  [/cut|fringe|bangs|kids/i, "scissors"],
];

const CATEGORY: Record<string, IconKind> = {
  hair: "scissors",
  colour: "brush",
  haircare: "spa",
  treatments: "bottle",
  reflexology: "leaf",
  makeup: "makeup",
  glow: "sparkle",
  beauty: "thread",
  packages: "crown",
};

export function serviceKind(s: Pick<Service, "name">): IconKind {
  return RULES.find(([re]) => re.test(s.name))?.[1] ?? "scissors";
}

export function categoryKind(id: string): IconKind {
  return CATEGORY[id] ?? "scissors";
}

/* Each glyph: 24×24, 1.25 stroke. Moving parts carry data-p so CSS can animate them. */
const GLYPHS: Record<IconKind, ReactNode> = {
  scissors: (
    <>
      <g data-p="a">
        <circle cx="6.5" cy="18" r="2.6" />
        <path d="M8.3 16.1 17.5 4.5" />
      </g>
      <g data-p="b">
        <circle cx="17.5" cy="18" r="2.6" />
        <path d="M15.7 16.1 6.5 4.5" />
      </g>
      <circle cx="12" cy="10.6" r="0.55" fill="currentColor" />
    </>
  ),
  beard: (
    <>
      {/* full beard from the sideburns down to the chin, open at the mouth */}
      <path
        data-p="draw"
        pathLength={1}
        d="M4.5 6.5c0 8 3.2 14 7.5 14s7.5-6 7.5-14c-1.2 3-3.3 4.6-5.3 4.6H9.8c-2 0-4.1-1.6-5.3-4.6z"
      />
      {/* moustache */}
      <path
        data-p="stache"
        d="M12 11.3c-1.2-1.5-3.4-1.8-4.8-.4 1.2.6 2.6 1.7 4.8 1.5 2.2.2 3.6-.9 4.8-1.5-1.4-1.4-3.6-1.1-4.8.4z"
      />
      <path d="M10.4 14.7c1 .6 2.2.6 3.2 0" />
    </>
  ),
  razor: (
    <g data-p="glide">
      <rect x="5" y="3.5" width="14" height="4" rx="1" />
      <path d="M12 7.5v13M10.5 11h3M10.5 14h3M10.5 17h3" />
    </g>
  ),
  drop: (
    <>
      <path data-p="fall" d="M12 3.5c3 3.9 5.5 6.9 5.5 9.9a5.5 5.5 0 0 1-11 0c0-3 2.5-6 5.5-9.9z" />
      <path d="M9.6 14.4a2.6 2.6 0 0 0 2.2 2.4" />
    </>
  ),
  brush: (
    <>
      <g data-p="sweep">
        <path d="M14.5 3.5 20.5 9.5 12 18l-6-6z" />
        <path d="M6 12c-2 .5-2.8 2.4-2.5 4.5 2.1.3 4-.5 4.5-2.5" />
      </g>
      <circle data-p="drip" cx="5" cy="20.5" r="0.9" fill="currentColor" />
    </>
  ),
  dryer: (
    <>
      <circle cx="8.5" cy="9" r="5" />
      <circle cx="8.5" cy="9" r="1.6" />
      <path d="M13.5 7h4v4h-4M7.5 14l-1 6.5h3l1-6.5" />
      <path data-p="air" d="M19.5 6.5h2.5M20 9h2.5M19.5 11.5h2.5" />
    </>
  ),
  straightener: (
    <>
      <path data-p="arm-a" d="M9 3.5 7 20.5" />
      <path data-p="arm-b" d="M15 3.5 17 20.5" />
      <path d="M8.6 7h-.9M15.4 7h.9" />
      <circle cx="12" cy="20.5" r="1" />
    </>
  ),
  spa: (
    <>
      <path d="M4 12.5h16a8 8 0 0 1-16 0z" />
      <path data-p="steam" d="M9 9c-1-1 1-2 0-3.5M12 9c-1-1 1-2 0-3.5M15 9c-1-1 1-2 0-3.5" />
    </>
  ),
  bottle: (
    <g data-p="tilt">
      <path d="M10 3h4v3l2 3v11a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V9l2-3z" />
      <path d="M8 12h8v5H8" />
    </g>
  ),
  hand: (
    <g data-p="wave">
      <path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V12M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6a1.5 1.5 0 0 1 3 0v7" />
      <path d="M8 13l-1.6-1.7a1.6 1.6 0 0 0-2.4 2.1l3.4 4.5A6 6 0 0 0 12.2 20.5H13a4 4 0 0 0 4-4V13" />
    </g>
  ),
  foot: (
    <g data-p="step">
      <path d="M8.5 21c-2 0-3.5-1.6-3.5-4.2 0-3.4 1.4-6.3 3.2-6.3 1.6 0 2.3 1.8 2.3 4.5S10.7 21 8.5 21z" />
      <circle cx="9" cy="5.5" r="1.2" />
      <circle cx="12" cy="6.2" r="1" />
      <circle cx="14.4" cy="7.6" r="0.9" />
      <circle cx="16.2" cy="9.6" r="0.8" />
      <path d="M13.2 13.5c1.5.3 2.4 1.6 2.3 3.4" />
    </g>
  ),
  leaf: (
    <g data-p="sway">
      <path d="M5 19c0-8.5 5.5-14 14-14 0 8.5-5.5 14-14 14z" />
      <path d="M5 19 14 10" />
    </g>
  ),
  sparkle: (
    <>
      <path
        data-p="twinkle"
        d="M12 3.5c.6 4.3 2.2 5.9 6.5 6.5-4.3.6-5.9 2.2-6.5 6.5-.6-4.3-2.2-5.9-6.5-6.5 4.3-.6 5.9-2.2 6.5-6.5z"
      />
      <path
        data-p="twinkle-2"
        d="M18.5 15.5c.3 1.7.8 2.2 2.5 2.5-1.7.3-2.2.8-2.5 2.5-.3-1.7-.8-2.2-2.5-2.5 1.7-.3 2.2-.8 2.5-2.5z"
      />
    </>
  ),
  thread: (
    <>
      <path d="M4 18.5 18 4.5" />
      <ellipse cx="18.6" cy="3.9" rx="1.1" ry="0.6" transform="rotate(-45 18.6 3.9)" />
      <path data-p="draw" pathLength={1} d="M4 18.5c3 2 5-3 8-1s4 2 7.5-.5" />
    </>
  ),
  wax: (
    <>
      <path d="M5.5 4.5h13l-1.5 4h-10z" />
      <path data-p="fall" d="M12 10.5c1.8 2.3 3 3.9 3 5.6a3 3 0 0 1-6 0c0-1.7 1.2-3.3 3-5.6z" />
    </>
  ),
  makeup: (
    <g data-p="sweep">
      <path d="M14.5 3.5 20.5 9.5 17 13l-6-6z" />
      <path d="M11 7 4 14a2.1 2.1 0 0 0 0 3l3 3a2.1 2.1 0 0 0 3 0l7-7" />
    </g>
  ),
  drape: (
    <g data-p="sway">
      <path d="M6 3.5h12M7 3.5c0 7-2 11-3 17h6c.5-6 1.5-10 2-14 .5 4 1.5 8 2 14h6c-1-6-3-10-3-17" />
    </g>
  ),
  crown: (
    <g data-p="lift">
      <path d="M4 17.5 3 7.5l5 4 4-6.5 4 6.5 5-4-1 10z" />
      <path d="M4.5 20.5h15" />
    </g>
  ),
  comb: (
    <g data-p="glide">
      <rect x="3.5" y="8" width="17" height="3.5" rx="1" />
      <path d="M5.5 11.5V17M8 11.5V17M10.5 11.5V17M13 11.5V17M15.5 11.5V17M18 11.5V17" />
    </g>
  ),
  pin: (
    <g data-p="lift">
      <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z" />
      <circle cx="12" cy="10" r="2.2" />
    </g>
  ),
};

export function ServiceGlyph({
  kind,
  active,
  className,
}: {
  kind: IconKind;
  active?: boolean | undefined;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      data-kind={kind}
      className={cn("svc", active && "svc-on", className)}
    >
      {GLYPHS[kind]}
    </svg>
  );
}

/**
 * Visual for a service or category in lists: the salon's photo when one has
 * been uploaded (admin → Menu), otherwise the animated line icon.
 */
export function ServiceIconTile({
  kind,
  active,
  size = "md",
  photo,
  framed,
  className,
}: {
  kind: IconKind;
  active?: boolean | undefined;
  size?: "sm" | "md" | "lg" | "thumb";
  photo?: string | undefined;
  /** Give icons the same footprint as photos, so mixed lists stay aligned. */
  framed?: boolean | undefined;
  className?: string;
}) {
  const box =
    size === "sm" ? "h-14 w-14" : size === "lg" ? "h-24 w-32" : size === "thumb" ? "h-16 w-16" : "h-[4.5rem] w-24";
  if (!photo && framed) {
    return (
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-md transition-colors duration-300",
          active ? "bg-ink text-champagne" : "bg-champagne/16 text-bronze",
          box,
          className,
        )}
      >
        <ServiceGlyph kind={kind} active={active} className={size === "sm" ? "h-6 w-6" : "h-7 w-7"} />
      </span>
    );
  }
  if (photo) {
    return (
      <span
        className={cn(
          "relative shrink-0 overflow-hidden rounded-md bg-muted",
          box,
          active && "photo-pop",
          active && size !== "thumb" && "ring-2 ring-ink ring-offset-2 ring-offset-background",
          className,
        )}
      >
        <img src={photo} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
        {active && size !== "thumb" ? (
          <span className="pop-in absolute right-1 bottom-1 flex h-5 w-5 items-center justify-center rounded-full bg-ink text-champagne">
            <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        ) : null}
      </span>
    );
  }
  const dims = size === "sm" ? "h-9 w-9" : size === "lg" ? "h-14 w-14" : "h-12 w-12";
  const glyph = size === "sm" ? "h-[18px] w-[18px]" : size === "lg" ? "h-7 w-7" : "h-6 w-6";
  return (
    <span
      className={cn(
        "relative flex shrink-0 items-center justify-center rounded-full transition-colors duration-300",
        active ? "bg-ink text-champagne" : "bg-champagne/16 text-bronze",
        dims,
        className,
      )}
    >
      <ServiceGlyph kind={kind} active={active} className={glyph} />
    </span>
  );
}
