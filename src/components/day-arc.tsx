// The day at a glance, after a solar dial: the salon's day runs along an arc
// from opening to closing, the sky behind it moves from soft dawn through a
// bright midday to bronze dusk, and a small sun travels along the arc to the
// chosen time (or to "now" today). Free times sit on the arc as dots.
// Our palette, not a clock face: ivory, champagne, bronze and ink.
import { useEffect, useState } from "react";
import { minuteLabel } from "@/lib/salon";

type Stop = [number, [number, number, number]];

// sky colour along the day (0 = opening, 1 = closing)
const SKY: Stop[] = [
  [0, [239, 223, 203]], // dawn champagne
  [0.32, [250, 244, 234]], // bright morning ivory
  [0.6, [244, 228, 205]], // warm afternoon
  [0.82, [214, 170, 128]], // golden hour bronze
  [1, [74, 52, 36]], // dusk ink-brown
];

function skyAt(t: number) {
  const x = Math.min(1, Math.max(0, t));
  for (let i = 1; i < SKY.length; i++) {
    const [t1, c1] = SKY[i]!;
    const [t0, c0] = SKY[i - 1]!;
    if (x <= t1) {
      const k = (x - t0) / (t1 - t0 || 1);
      return c0.map((v, j) => Math.round(v + (c1[j]! - v) * k)) as [number, number, number];
    }
  }
  return SKY[SKY.length - 1]![1];
}

const part = (m: number) => (m < 12 * 60 ? "Morning" : m < 17 * 60 ? "Afternoon" : "Evening");

const W = 320;
const H = 150;
const CX = W / 2;
const CY = 128;
const R = 112;

export function DayArc({
  open,
  close,
  free,
  selected,
  today,
  className,
}: {
  /** opening and closing, minutes from midnight */
  open: number;
  close: number;
  /** minutes of the free times */
  free: number[];
  selected: number | null;
  /** the day shown is today (the sun shows the time now until one is picked) */
  today: boolean;
  className?: string;
}) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    if (!today) return setNow(null);
    const tick = () => {
      const d = new Date(Date.now() + 330 * 60_000);
      setNow(d.getUTCHours() * 60 + d.getUTCMinutes());
    };
    tick();
    const t = window.setInterval(tick, 60_000);
    return () => window.clearInterval(t);
  }, [today]);

  const span = Math.max(30, close - open);
  const at = selected ?? (now != null && now >= open && now <= close ? now : null);
  // nothing picked yet (another day): the sun rests at sunrise, the opening time
  const t = at == null ? 0 : (at - open) / span;
  const [r, g, b] = skyAt(t);
  const dark = 0.299 * r + 0.587 * g + 0.114 * b < 140;
  const angle = Math.min(180, Math.max(0, t * 180)); // 0° = opening (left), 180° = closing (right)
  const pos = (m: number) => {
    const a = Math.PI * (1 - (m - open) / span);
    return [CX + R * Math.cos(a), CY - R * Math.sin(a)] as const;
  };

  return (
    <div
      className={
        "day-arc relative overflow-hidden rounded-xl border border-foreground/10 " + (className ?? "")
      }
      style={{ backgroundColor: `rgb(${r} ${g} ${b})`, color: dark ? "#f6efe5" : "#1c1611" }}
      aria-hidden
    >
      {/* soft light from the sun's side */}
      <div
        className="pointer-events-none absolute inset-0 transition-[background] duration-700"
        style={{
          background: `radial-gradient(120% 90% at ${10 + t * 80}% 100%, rgb(255 250 240 / ${dark ? 0.12 : 0.55}), transparent 60%)`,
        }}
      />
      <svg viewBox={`0 0 ${W} ${H}`} className="relative block h-auto w-full">
        {/* the horizon and the day's arc */}
        <line x1="10" x2={W - 10} y1={CY} y2={CY} stroke="currentColor" strokeOpacity="0.18" />
        <path
          d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`}
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.28"
          strokeWidth="1.2"
          strokeDasharray="2 4"
        />
        {/* the part of the day already gone (today) */}
        {now != null && now > open ? (
          <path
            d={`M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${pos(Math.min(now, close))[0]} ${pos(Math.min(now, close))[1]}`}
            fill="none"
            stroke="currentColor"
            strokeOpacity="0.5"
            strokeWidth="1.4"
          />
        ) : null}
        {/* free times */}
        {free.map((m) => {
          const [x, y] = pos(m);
          return <circle key={m} cx={x} cy={y} r={m === selected ? 0 : 2.2} fill="currentColor" fillOpacity="0.55" />;
        })}
        {/* the sun travels along the arc */}
        <g className="day-arc-sun" style={{ transform: `rotate(${angle}deg)`, transformOrigin: `${CX}px ${CY}px` }}>
          <circle cx={CX - R} cy={CY} r="13" fill="#fff6e6" fillOpacity={dark ? 0.18 : 0.6} />
          <circle cx={CX - R} cy={CY} r="7.5" fill={dark ? "#f3d9b0" : "#b98a5e"} />
        </g>
        <text x="12" y={CY + 16} fontSize="9.5" fill="currentColor" fillOpacity="0.6">
          {minuteLabel(open)}
        </text>
        <text x={W - 12} y={CY + 16} fontSize="9.5" textAnchor="end" fill="currentColor" fillOpacity="0.6">
          {minuteLabel(close)}
        </text>
      </svg>
      <div className="pointer-events-none absolute inset-x-0 top-[38%] text-center">
        <div key={selected ?? "none"} className="tick-in font-display text-[1.9rem] leading-none tabular-nums">
          {selected != null ? minuteLabel(selected) : "Pick a time"}
        </div>
        <div className="mt-1 text-[0.68rem] uppercase tracking-[0.24em] opacity-70">
          {selected != null ? part(selected) : `${free.length} ${free.length === 1 ? "time" : "times"} free`}
        </div>
      </div>
    </div>
  );
}
