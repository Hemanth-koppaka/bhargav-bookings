// The barber-kit film: one still photograph, shot like a cinema camera would.
// Nothing in the photo moves. The motion is all camera: a dolly that travels
// through nine shots, a focus plane that racks from tool to tool, a soft
// background that sits slightly deeper than the subject (parallax), light
// responding to the angle, a few dust motes in the beam and fine film grain.
//
// The path is a Catmull-Rom spline through the shot keyframes, so the camera
// never stops between shots (no robotic start/stop); only the very start and
// the final hold ease in and out. Everything is driven by one rAF clock and
// written straight to styles, so React never re-renders during the film.
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** Camera keyframe in image coordinates (0–1). */
type Key = {
  t: number; // seconds
  cx: number; // where the camera looks
  cy: number;
  z: number; // magnification (1 = full photo)
  fx: number; // focus point
  fy: number;
  fr: number; // radius of the sharp area (fraction of the frame)
  bg: number; // background blur, px
};

// Positions are measured on the supplied 844×1500 photo.
const SHOT_PLAN: Key[] = [
  { t: 0.0, cx: 0.5, cy: 0.52, z: 1.0, fx: 0.5, fy: 0.5, fr: 1.2, bg: 0 }, // 01 establishing
  { t: 0.8, cx: 0.5, cy: 0.5, z: 1.1, fx: 0.48, fy: 0.46, fr: 0.85, bg: 1.5 }, // 02 push in
  { t: 1.6, cx: 0.47, cy: 0.42, z: 1.42, fx: 0.45, fy: 0.38, fr: 0.5, bg: 5 },
  { t: 2.4, cx: 0.43, cy: 0.25, z: 2.25, fx: 0.42, fy: 0.22, fr: 0.24, bg: 7 }, // 03 comb teeth
  { t: 3.2, cx: 0.31, cy: 0.47, z: 2.1, fx: 0.27, fy: 0.46, fr: 0.24, bg: 7 }, // 04 clipper rack focus
  { t: 4.0, cx: 0.57, cy: 0.42, z: 2.3, fx: 0.58, fy: 0.43, fr: 0.2, bg: 7 }, // 05 brush macro
  { t: 4.8, cx: 0.73, cy: 0.33, z: 2.1, fx: 0.76, fy: 0.31, fr: 0.25, bg: 7 }, // 06 scissors pan
  { t: 5.6, cx: 0.3, cy: 0.73, z: 2.15, fx: 0.18, fy: 0.69, fr: 0.3, bg: 6 }, // 07 denim, rivet
  { t: 6.8, cx: 0.5, cy: 0.52, z: 1.12, fx: 0.5, fy: 0.48, fr: 0.8, bg: 2 }, // 08 reveal
  { t: 8.0, cx: 0.5, cy: 0.5, z: 1.07, fx: 0.5, fy: 0.47, fr: 0.95, bg: 1 }, // 09 hero hold
];
const DURATION = SHOT_PLAN[SHOT_PLAN.length - 1]!.t;
const FIELDS = ["cx", "cy", "z", "fx", "fy", "fr", "bg"] as const;

/** Catmull-Rom through the keys: continuous velocity, no stops between shots. */
function sample(t: number): Omit<Key, "t"> {
  let i = SHOTS.findIndex((k) => k.t > t) - 1;
  if (i < 0) i = t <= 0 ? 0 : SHOTS.length - 2;
  const k1 = SHOTS[i]!;
  const k2 = SHOTS[i + 1]!;
  const k0 = SHOTS[i - 1] ?? k1;
  const k3 = SHOTS[i + 2] ?? k2;
  const u = Math.max(0, Math.min(1, (t - k1.t) / (k2.t - k1.t)));
  const u2 = u * u;
  const u3 = u2 * u;
  const out = {} as Omit<Key, "t">;
  for (const f of FIELDS) {
    const p0 = k0[f];
    const p1 = k1[f];
    const p2 = k2[f];
    const p3 = k3[f];
    // tension 0.5 (a slightly heavier, damped camera)
    const v =
      0.5 *
      (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
    out[f] = v;
  }
  // magnification can't dip below the full frame (would show the photo's edge)
  out.z = Math.max(1, out.z);
  out.fr = Math.max(0.15, out.fr);
  out.bg = Math.max(0, out.bg);
  return out;
}

/**
 * Maps real time to camera time. The camera leaves rest gently over the first
 * 0.6 s (it can't jump to speed) and decelerates into the final hold; between
 * those it runs at constant pace so the spline gives continuous movement.
 */
function clock(s: number) {
  const T = DURATION;
  const a = 0.6; // ease-in window
  const d = 1.4; // ease-out window
  if (s <= 0) return 0;
  if (s >= T) return T;
  // piecewise: quadratic in, linear middle, quadratic out (same total length T)
  const v = T / (T - a / 2 - d / 2); // cruise speed so the curve still ends at T
  if (s < a) return (v * s * s) / (2 * a);
  if (s < T - d) return v * a / 2 + v * (s - a);
  const r = T - s;
  return T - (v * r * r) / (2 * d);
}

/**
 * The plan above is written in real seconds. The camera's clock eases in and
 * out, so each keyframe is placed where that clock will be at its real time:
 * every shot lands exactly on schedule.
 */
const SHOTS: Key[] = SHOT_PLAN.map((k) => ({ ...k, t: clock(k.t) }));

export function CinematicKit({
  src = "/media/barber-kit.webp",
  alt = "A barber's comb, clipper, round brush, scissors and razor in a denim pocket",
  className,
  loop = false,
  onDone,
}: {
  src?: string;
  alt?: string;
  className?: string | undefined;
  loop?: boolean;
  /** Called once the final hold has settled (or straight away if the film can't play). */
  onDone?: () => void;
}) {
  const done = useRef(onDone);
  done.current = onDone;
  const fired = useRef(false);
  const finish = () => {
    if (fired.current) return;
    fired.current = true;
    done.current?.();
  };
  const frame = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const deep = useRef<HTMLImageElement>(null);
  const sharp = useRef<HTMLImageElement>(null);
  const light = useRef<HTMLSpanElement>(null);
  const dust = useRef<HTMLSpanElement>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);

  // the photo may finish loading before React attaches its onLoad (server-rendered page)
  useEffect(() => {
    const img = deep.current;
    if (img?.complete) img.naturalWidth > 0 ? setReady(true) : setFailed(true);
  }, []);

  // never keep anyone waiting on a slow photo: give up after 2.5 s
  useEffect(() => {
    if (ready || !onDone) return;
    const t = window.setTimeout(finish, 2500);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);
  useEffect(() => {
    if (failed) finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [failed]);

  useEffect(() => {
    if (!ready) return;
    const el = frame.current;
    if (!el) return;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;
    let start: number | null = null;
    let visible = false;

    const draw = (s: number) => {
      // the film may be leaving the page between frames
      if (!stage.current || !deep.current || !sharp.current || !light.current || !dust.current) return;
      const W = el.clientWidth;
      const H = el.clientHeight;
      const k = sample(clock(s));
      // the hold breathes: a barely-there drift once the move is over
      const hold = s > DURATION ? (s - DURATION) : 0;
      const breathe = hold ? 1 + 0.004 * Math.sin(hold * 0.9) : 1;
      const z = k.z * breathe;
      const half = 0.5 / z;
      const cx = Math.min(1 - half, Math.max(half, k.cx + (hold ? 0.002 * Math.sin(hold * 0.6) : 0)));
      const cy = Math.min(1 - half, Math.max(half, k.cy + (hold ? 0.0015 * Math.cos(hold * 0.5) : 0)));
      const tx = W / 2 - cx * W * z;
      const ty = H / 2 - cy * H * z;
      stage.current!.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${z})`;

      // background plane sits deeper: it travels a little less than the subject (parallax)
      const depth = 0.965;
      const dz = 1 + (z - 1) * depth;
      const dx = (W / 2 - cx * W * dz - tx) / z;
      const dy = (H / 2 - cy * H * dz - ty) / z;
      deep.current!.style.transform = `translate3d(${dx}px, ${dy}px, 0) scale(${(dz / z) * 1.015})`;
      deep.current!.style.filter = `blur(${(k.bg / Math.sqrt(z)).toFixed(2)}px) brightness(0.92)`;

      // focus plane: a feathered window of sharpness that racks between tools
      const mask = `radial-gradient(ellipse ${(k.fr * 100).toFixed(1)}% ${(k.fr * 72).toFixed(1)}% at ${(k.fx * 100).toFixed(2)}% ${(k.fy * 100).toFixed(2)}%, #000 45%, transparent 100%)`;
      sharp.current!.style.maskImage = mask;
      sharp.current!.style.webkitMaskImage = mask;

      // the key light answers the camera angle: highlights drift a touch against the move
      const lx = 55 + (0.5 - cx) * 30;
      const ly = 30 + (0.5 - cy) * 22;
      light.current!.style.background = `radial-gradient(60% 45% at ${lx}% ${ly}%, rgb(255 214 160 / 0.16), transparent 70%)`;
      // dust is only seen in the brush macro, in the beam
      const motes = Math.max(0, 1 - Math.abs(s - 3.7) / 0.9);
      dust.current!.style.opacity = (motes * 0.9).toFixed(3);
    };

    if (still) {
      draw(DURATION + 0.01);
      const t = window.setTimeout(finish, 1200);
      return () => window.clearTimeout(t);
    }
    const tick = (now: number) => {
      if (start === null) start = now;
      let s = (now - start) / 1000;
      if (loop && s > DURATION + 4) {
        start = now;
        s = 0;
      }
      draw(s);
      if (s >= DURATION + 0.4) finish(); // a breath of the final hold, then hand over
      raf = requestAnimationFrame(tick);
    };
    // roll camera only while the film is on screen
    const io = new IntersectionObserver(
      ([e]) => {
        const v = Boolean(e?.isIntersecting);
        if (v && !visible) raf = requestAnimationFrame(tick);
        if (!v && visible) cancelAnimationFrame(raf);
        visible = v;
      },
      { threshold: 0.25 },
    );
    draw(0);
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [ready, loop]);

  if (failed) return null;

  return (
    <div
      ref={frame}
      className={cn("relative aspect-[9/16] w-full overflow-hidden bg-[#120d09]", className)}
      role="img"
      aria-label={alt}
    >
      <div ref={stage} className="absolute inset-0 origin-top-left will-change-transform">
        {/* deep plane: soft, slightly behind */}
        <img
          ref={deep}
          src={src}
          alt=""
          className="absolute inset-0 h-full w-full origin-top-left object-cover will-change-transform"
          onLoad={() => setReady(true)}
          onError={() => setFailed(true)}
          decoding="async"
        />
        {/* focus plane: the sharp photograph inside a moving window of focus */}
        <img ref={sharp} src={src} alt="" className="absolute inset-0 h-full w-full object-cover" decoding="async" />
      </div>
      {/* light, dust, vignette and grain sit on the lens, not in the scene */}
      <span ref={light} className="pointer-events-none absolute inset-0 mix-blend-soft-light" />
      <span ref={dust} className="kit-dust pointer-events-none absolute inset-0 opacity-0" aria-hidden>
        {Array.from({ length: 11 }, (_, i) => (
          <i key={i} style={{ left: `${44 + ((i * 37) % 30)}%`, top: `${22 + ((i * 53) % 40)}%`, animationDelay: `${-i * 0.7}s` }} />
        ))}
      </span>
      <span className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_85%_at_50%_45%,transparent_55%,rgb(10_6_3/0.55))]" />
      <span className="kit-grain pointer-events-none absolute inset-[-50%] opacity-[0.07] mix-blend-overlay" aria-hidden />
    </div>
  );
}
