// The booking progress line: a fine bronze strand with a pair of scissors at
// its leading edge. Moving forward, the scissors cut their way to the next
// step. Pressing Back opens the previous step straight away and its line picks
// up exactly where the scissors were, then plays the reverse: a hair of
// pull-back, travel home facing backwards while the strand unwinds behind
// them, and a quiet settle. Nothing waits on the animation, so going back
// feels instant. One coordinate system (a fraction of the track) serves both
// directions; the live position is remembered across pages.
import { useCallback, useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { useNavigate } from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { ServiceGlyph } from "@/components/service-icons";

export type TrackKind = "header" | "stepper";

/** Where on its track a step sits (0–1). Header lines fill to the step; steppers run dot to dot. */
const fractionFor = (kind: TrackKind, step: number, total: number) =>
  kind === "header"
    ? Math.max(0, Math.min(1, step / total))
    : total > 1
      ? (step - 1) / (total - 1)
      : 0;

/** Last position shown per kind of track, so the next page continues from it. */
const lastValue = new Map<TrackKind, number>();
let navigating = false;

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const FORWARD_MS = 900;
const PULLBACK_MS = 110;
const TRAVEL_MS = 700;
const SETTLE_MS = 180;

/**
 * Back for booking steps: navigates immediately (the previous page plays the
 * rewind as it enters). Double-clicks during the hand-over are ignored so the
 * route and the line can never disagree.
 */
export function useRewindBack(to: string) {
  const navigate = useNavigate();
  return useCallback(
    (e?: {
      preventDefault?: () => void;
      metaKey?: boolean;
      ctrlKey?: boolean;
      shiftKey?: boolean;
    }) => {
      if (e?.metaKey || e?.ctrlKey || e?.shiftKey) return; // "open in new tab" works normally
      e?.preventDefault?.();
      if (navigating) return;
      navigating = true;
      void navigate({ to: to as never }).finally(() => {
        window.setTimeout(() => (navigating = false), 220);
      });
    },
    [navigate, to],
  );
}

export function ScissorsLine({
  kind,
  step,
  total,
  className,
  style,
}: {
  kind: TrackKind;
  step: number;
  total: number;
  className?: string | undefined;
  style?: CSSProperties;
}) {
  const target = fractionFor(kind, step, total);
  const track = useRef<HTMLDivElement>(null);
  const fill = useRef<HTMLSpanElement>(null);
  const blades = useRef<HTMLSpanElement>(null);
  const start = useRef(lastValue.get(kind) ?? fractionFor(kind, step - 1, total));
  const [cutting, setCutting] = useState(false);
  const [tight, setTight] = useState(false);

  /** Where the strand actually is right now (mid-animation included). */
  const measure = () => {
    const t = track.current?.getBoundingClientRect().width;
    const f = fill.current?.getBoundingClientRect().width;
    return t && f != null ? Math.max(0, Math.min(1, f / t)) : null;
  };

  /** Remember where the strand is right now, for whoever draws it next. */
  const handOff = () => {
    const now = measure();
    if (now == null) return; // hidden copy (other screen size): leave the visible one in charge
    start.current = now;
    lastValue.set(kind, now);
  };

  useLayoutEffect(() => {
    const el = fill.current;
    const from = start.current;
    lastValue.set(kind, target);
    if (!el || reducedMotion() || Math.abs(from - target) < 0.0005) {
      if (el) el.style.width = `${target * 100}%`;
      return;
    }
    el.style.width = `${target * 100}%`;
    setCutting(true);
    start.current = target;
    const done = () => {
      setCutting(false);
      setTight(false);
    };

    if (target > from) {
      // forward: cut through to the next step
      const anim = el.animate([{ width: `${from * 100}%` }, { width: `${target * 100}%` }], {
        duration: FORWARD_MS,
        easing: EASE,
      });
      anim.onfinish = done;
      return () => {
        handOff();
        anim.cancel();
      };
    }

    // back: pull back a hair, travel home facing backwards, settle facing forward
    setTight(true);
    const total_ = PULLBACK_MS + TRAVEL_MS + SETTLE_MS;
    const o1 = PULLBACK_MS / total_;
    const o2 = (PULLBACK_MS + TRAVEL_MS) / total_;
    const line = el.animate(
      [
        { width: `${from * 100}%`, offset: 0, easing: "ease-out" },
        { width: `calc(${from * 100}% + 4px)`, offset: o1, easing: EASE },
        { width: `calc(${target * 100}% + 1px)`, offset: o2, easing: "ease-out" },
        { width: `${target * 100}%`, offset: 1 },
      ],
      { duration: total_ },
    );
    const turn = blades.current?.animate(
      [
        { transform: "rotate(90deg)", offset: 0 },
        { transform: "rotate(90deg)", offset: o1, easing: EASE },
        { transform: "rotate(-90deg)", offset: o1 + (o2 - o1) * 0.3 },
        { transform: "rotate(-90deg)", offset: o2, easing: "ease-out" },
        { transform: "rotate(90deg)", offset: 1 },
      ],
      { duration: total_ },
    );
    line.onfinish = done;
    return () => {
      handOff();
      line.cancel();
      turn?.cancel();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target, kind]);

  return (
    <div ref={track} className={cn("relative h-px w-full", className)} style={style} aria-hidden>
      {/* the uncut remainder */}
      <span className="absolute inset-0 [background-image:linear-gradient(90deg,var(--hairline)_55%,transparent_55%)] [background-size:7px_1px]" />
      {/* the strand: one main hair and two finer ones that draw in while it unwinds */}
      <span
        ref={fill}
        className="absolute inset-y-0 left-0"
        style={{ width: `${start.current * 100}%` }}
      >
        <span className="absolute inset-0 bg-gradient-to-r from-bronze/45 via-bronze/75 to-bronze/85" />
        <span
          className={cn(
            "absolute right-3 left-0 h-px bg-bronze/25 transition-transform duration-500 ease-out",
            tight ? "translate-y-0" : "-translate-y-[1.5px]",
          )}
        />
        <span
          className={cn(
            "absolute right-5 left-[8%] h-px bg-bronze/20 transition-transform duration-500 ease-out",
            tight ? "translate-y-0" : "translate-y-[1.5px]",
          )}
        />
        {/* the scissors ride the end of the strand, so the two can never part */}
        <span className="absolute top-1/2 right-0 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-full bg-background text-bronze">
          <span ref={blades} className="flex" style={{ transform: "rotate(90deg)" }}>
            <ServiceGlyph kind="scissors" className={cn("h-3.5 w-3.5", cutting && "snip-run")} />
          </span>
        </span>
      </span>
    </div>
  );
}
