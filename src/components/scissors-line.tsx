// The booking progress line: a fine bronze strand with a pair of scissors at
// its leading edge. Moving forward, the scissors cut their way to the next
// step; pressing Back makes them physically travel back along the same path
// while the strand unwinds behind them, and only then is the previous page
// shown. One coordinate system (a fraction of the track) serves both
// directions, and the last position is remembered across pages so each page
// picks up exactly where the scissors stopped.
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
} from "react";
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

/* ── shared state across pages ──────────────────────────────── */

const lastValue = new Map<TrackKind, number>();
type Rewind = (toStep: number) => Promise<void>;
const tracks = new Set<Rewind>();
const stepListeners = new Set<(step: number) => void>();
let rewinding = false;

const reducedMotion = () =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";
const PULLBACK_MS = 120;
const TRAVEL_MS = 760;
const SETTLE_MS = 200;
const FORWARD_MS = 900;

/**
 * Back-navigation for booking steps: plays the reverse scissors travel on
 * every progress line on screen, marks the previous step active, then
 * navigates. Extra clicks during the transition are ignored.
 */
export function useRewindBack(to: string, toStep: number) {
  const navigate = useNavigate();
  return useCallback(
    async (e?: {
      preventDefault?: () => void;
      metaKey?: boolean;
      ctrlKey?: boolean;
      shiftKey?: boolean;
    }) => {
      if (e?.metaKey || e?.ctrlKey || e?.shiftKey) return; // let "open in new tab" work normally
      e?.preventDefault?.();
      if (rewinding) return;
      rewinding = true;
      try {
        if (tracks.size && !reducedMotion()) await Promise.all([...tracks].map((t) => t(toStep)));
        stepListeners.forEach((l) => l(toStep));
        await navigate({ to: to as never });
      } finally {
        rewinding = false;
      }
    },
    [navigate, to, toStep],
  );
}

/** The step a header should show; switches to the previous step as soon as the scissors arrive. */
export function useDisplayedStep(step: number) {
  const [shown, setShown] = useState(step);
  useEffect(() => setShown(step), [step]);
  useEffect(() => {
    const l = (s: number) => setShown(s);
    stepListeners.add(l);
    return () => {
      stepListeners.delete(l);
    };
  }, []);
  return shown;
}

/* ── the line ───────────────────────────────────────────────── */

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
  const fill = useRef<HTMLSpanElement>(null);
  const blades = useRef<HTMLSpanElement>(null);
  const current = useRef(lastValue.get(kind) ?? fractionFor(kind, step - 1, total));
  const [cutting, setCutting] = useState(false);
  const [tight, setTight] = useState(false);

  const setWidth = (v: number) => {
    current.current = v;
    if (fill.current) fill.current.style.width = `${v * 100}%`;
  };

  // Arriving on a page: continue from wherever the scissors were last seen.
  useLayoutEffect(() => {
    const from = current.current;
    setWidth(from);
    if (Math.abs(from - target) < 0.0005 || reducedMotion() || !fill.current) {
      setWidth(target);
      lastValue.set(kind, target);
      return;
    }
    setCutting(true);
    const anim = fill.current.animate(
      [{ width: `${from * 100}%` }, { width: `${target * 100}%` }],
      {
        duration: FORWARD_MS,
        easing: EASE,
      },
    );
    anim.onfinish = () => {
      setWidth(target);
      setCutting(false);
    };
    lastValue.set(kind, target);
    return () => anim.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  // Back: pull back a hair, travel home facing backwards, settle facing forward.
  useEffect(() => {
    const rewind: Rewind = (toStep) =>
      new Promise<void>((resolve) => {
        const el = fill.current;
        const to = fractionFor(kind, toStep, total);
        const from = current.current;
        if (!el || !el.getClientRects().length || Math.abs(from - to) < 0.0005) {
          setWidth(to);
          lastValue.set(kind, to);
          return resolve();
        }
        const total_ = PULLBACK_MS + TRAVEL_MS + SETTLE_MS;
        const o1 = PULLBACK_MS / total_;
        const o2 = (PULLBACK_MS + TRAVEL_MS) / total_;
        setCutting(true);
        setTight(true);
        const line = el.animate(
          [
            { width: `${from * 100}%`, offset: 0, easing: "ease-out" },
            { width: `calc(${from * 100}% + 5px)`, offset: o1, easing: EASE },
            { width: `calc(${to * 100}% + 1px)`, offset: o2, easing: "ease-out" },
            { width: `${to * 100}%`, offset: 1 },
          ],
          { duration: total_, fill: "forwards" },
        );
        blades.current?.animate(
          [
            { transform: "rotate(90deg)", offset: 0 },
            { transform: "rotate(90deg)", offset: o1, easing: EASE },
            { transform: "rotate(-90deg)", offset: o1 + (o2 - o1) * 0.35 },
            { transform: "rotate(-90deg)", offset: o2, easing: "ease-out" },
            { transform: "rotate(90deg)", offset: 1 },
          ],
          { duration: total_ },
        );
        line.onfinish = () => {
          setWidth(to);
          line.cancel();
          lastValue.set(kind, to);
          setCutting(false);
          setTight(false);
          resolve();
        };
      });
    tracks.add(rewind);
    return () => {
      tracks.delete(rewind);
    };
  }, [kind, total]);

  return (
    <div className={cn("relative h-px w-full", className)} style={style} aria-hidden>
      {/* the uncut remainder */}
      <span className="absolute inset-0 [background-image:linear-gradient(90deg,var(--hairline)_55%,transparent_55%)] [background-size:7px_1px]" />
      {/* the strand: one main hair and two finer ones that draw in while it unwinds */}
      <span
        ref={fill}
        className="absolute inset-y-0 left-0"
        style={{ width: `${current.current * 100}%` }}
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
