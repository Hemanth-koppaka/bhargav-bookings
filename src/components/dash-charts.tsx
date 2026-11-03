// Small, dependency-free charts for the admin dashboard (plain SVG, so the
// console stays quick to load). Each chart has a hover/tap tooltip, a legend
// when it shows more than one series, and grows in on first paint.
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** The dashboard's colours: fixed order, one meaning each. */
export const DASH = {
  blue: "#2a78d6",
  orange: "#eb6834",
  aqua: "#1baf7a",
  yellow: "#eda100",
  magenta: "#e87ba4",
  violet: "#6250d6",
  red: "#e34948",
  grid: "#ebe6dd",
  axis: "#8d857a",
} as const;

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "UTC" });

function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

export function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[0.75rem] text-muted-foreground">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}

const H = 200;

/** The chart's real width, so labels stay at their true size on phones. */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = () => setW(Math.max(260, Math.round(el.clientWidth)));
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}
const PAD = { l: 44, r: 10, t: 12, b: 26 };

/** Revenue over time: one smooth area line. */
export function AreaTrend({
  points,
  color = DASH.blue,
  format,
  label,
}: {
  points: { date: string; value: number }[];
  color?: string;
  format: (n: number) => string;
  label: string;
}) {
  const id = useId().replace(/:/g, "");
  const [box, W] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(...points.map((p) => p.value), 0));
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const x = (i: number) => PAD.l + (points.length < 2 ? iw / 2 : (i / (points.length - 1)) * iw);
  const y = (v: number) => PAD.t + ih - (v / max) * ih;
  const path = useMemo(() => {
    if (!points.length) return "";
    // a gentle monotone curve (no overshoot below zero)
    let d = `M${x(0)},${y(points[0]!.value)}`;
    for (let i = 1; i < points.length; i++) {
      const x0 = x(i - 1);
      const x1 = x(i);
      const mx = (x0 + x1) / 2;
      d += ` C${mx},${y(points[i - 1]!.value)} ${mx},${y(points[i]!.value)} ${x1},${y(points[i]!.value)}`;
    }
    return d;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, max, W]);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const every = Math.max(1, Math.ceil(points.length / Math.max(3, Math.floor(W / 95))));

  const move = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - PAD.l) / iw) * (points.length - 1));
    setHover(Math.max(0, Math.min(points.length - 1, i)));
  };
  const hp = hover != null ? points[hover] : null;

  return (
    <div className="relative" ref={box}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-auto w-full touch-pan-y select-none"
        role="img"
        aria-label={label}
        onPointerMove={move}
        onPointerDown={move}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={`g${id}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.28" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
          <clipPath id={`c${id}`}>
            <rect x="0" y="0" height={H} className="dash-reveal" width={W} />
          </clipPath>
        </defs>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke={DASH.grid} strokeDasharray={t ? "3 4" : undefined} />
            <text x={PAD.l - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill={DASH.axis}>
              {format(t)}
            </text>
          </g>
        ))}
        {points.map((p, i) =>
          i % every === 0 || i === points.length - 1 ? (
            <text
              key={p.date}
              x={x(i)}
              y={H - 6}
              textAnchor={i === points.length - 1 ? "end" : i === 0 ? "start" : "middle"}
              fontSize="11"
              fill={DASH.axis}
            >
              {shortDate(p.date)}
            </text>
          ) : null,
        )}
        <g clipPath={`url(#c${id})`}>
          <path d={`${path} L${x(points.length - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill={`url(#g${id})`} />
          <path d={path} fill="none" stroke={color} strokeWidth="2.25" strokeLinejoin="round" strokeLinecap="round" />
        </g>
        {hp ? (
          <g>
            <line x1={x(hover!)} x2={x(hover!)} y1={PAD.t} y2={PAD.t + ih} stroke={DASH.axis} strokeDasharray="3 3" />
            <circle cx={x(hover!)} cy={y(hp.value)} r="5" fill={color} stroke="#fff" strokeWidth="2" />
          </g>
        ) : null}
      </svg>
      {hp ? (
        <div
          className="pointer-events-none absolute top-1 z-10 -translate-x-1/2 rounded-lg border border-hairline bg-white px-3 py-1.5 text-[0.75rem] shadow-[0_10px_30px_-12px_rgba(30,20,10,0.35)]"
          style={{ left: `${Math.min(Math.max((x(hover!) / W) * 100, 12), 88)}%` }}
        >
          <div className="text-muted-foreground">{shortDate(hp.date)}</div>
          <div className="font-medium tabular-nums">{format(hp.value)}</div>
        </div>
      ) : null}
    </div>
  );
}

/** Appointments per day, stacked by outcome. */
export function StackedBars({
  days,
  series,
  today,
  label,
}: {
  days: ({ date: string } & Record<string, number | string>)[];
  series: { key: string; label: string; color: string }[];
  today: string;
  label: string;
}) {
  const [box, W] = useWidth();
  const [hover, setHover] = useState<number | null>(null);
  const total = (d: (typeof days)[number]) => series.reduce((n, s) => n + Number(d[s.key] ?? 0), 0);
  const max = niceMax(Math.max(...days.map(total), 1));
  const iw = W - PAD.l - PAD.r;
  const ih = H - PAD.t - PAD.b;
  const slot = iw / Math.max(days.length, 1);
  const bw = Math.max(4, Math.min(22, slot * 0.68));
  const y = (v: number) => PAD.t + ih - (v / max) * ih;
  const ticks = [...new Set([0, 0.5, 1].map((f) => Math.round(f * max)))];
  const every = Math.max(1, Math.ceil(days.length / Math.max(3, Math.floor(W / 95))));
  const hd = hover != null ? days[hover] : null;

  return (
    <div className="relative" ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full select-none" role="img" aria-label={label} onPointerLeave={() => setHover(null)}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} stroke={DASH.grid} strokeDasharray={t ? "3 4" : undefined} />
            <text x={PAD.l - 8} y={y(t) + 4} textAnchor="end" fontSize="11" fill={DASH.axis}>
              {t}
            </text>
          </g>
        ))}
        {days.map((d, i) => {
          const cx = PAD.l + slot * i + slot / 2;
          let acc = 0;
          const segs = series
            .map((s) => ({ s, v: Number(d[s.key] ?? 0) }))
            .filter((x) => x.v > 0);
          return (
            <g
              key={d.date}
              onPointerEnter={() => setHover(i)}
              onPointerDown={() => setHover(i)}
              className="cursor-default"
            >
              {/* a wider invisible target than the bar */}
              <rect x={cx - slot / 2} y={PAD.t} width={slot} height={ih} fill="transparent" />
              {d.date === today ? (
                <rect x={cx - slot / 2 + 1} y={PAD.t} width={slot - 2} height={ih} rx="4" fill="#f4efe6" />
              ) : null}
              {segs.map(({ s, v }, k) => {
                const top = y(acc + v);
                const h = Math.max(0, y(acc) - top);
                acc += v;
                const last = k === segs.length - 1;
                return (
                  <rect
                    key={s.key}
                    className="dash-bar"
                    style={{ animationDelay: `${Math.min(i * 18, 500)}ms` }}
                    x={cx - bw / 2}
                    y={top}
                    width={bw}
                    height={Math.max(h - (k > 0 ? 2 : 0), 1)}
                    rx={last ? 3 : 0}
                    fill={s.color}
                    opacity={hover == null || hover === i ? 1 : 0.45}
                  />
                );
              })}
              {i % every === 0 ? (
                <text x={cx} y={H - 6} textAnchor="middle" fontSize="11" fill={d.date === today ? "#1c1611" : DASH.axis} fontWeight={d.date === today ? 600 : 400}>
                  {d.date === today ? "Today" : shortDate(d.date)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      {hd ? (
        <div
          className="pointer-events-none absolute top-1 z-10 min-w-[8.5rem] -translate-x-1/2 rounded-lg border border-hairline bg-white px-3 py-2 text-[0.75rem] shadow-[0_10px_30px_-12px_rgba(30,20,10,0.35)]"
          style={{ left: `${Math.min(Math.max(((PAD.l + slot * hover! + slot / 2) / W) * 100, 14), 86)}%` }}
        >
          <div className="mb-1 text-muted-foreground">{hd.date === today ? "Today" : shortDate(hd.date)}</div>
          {series.map((s) => (
            <div key={s.key} className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-[2px]" style={{ background: s.color }} />
                {s.label}
              </span>
              <span className="tabular-nums">{Number(hd[s.key] ?? 0)}</span>
            </div>
          ))}
        </div>
      ) : null}
      <Legend items={series.map((s) => ({ label: s.label, color: s.color }))} />
    </div>
  );
}

/** Share of a whole (top services). */
export function Donut({
  items,
  centre,
  centreHint,
}: {
  items: { label: string; value: number; color: string }[];
  centre: string;
  centreHint: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const total = items.reduce((n, i) => n + i.value, 0) || 1;
  const R = 70;
  const C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <div className="relative h-[180px] w-[180px] shrink-0">
        <svg viewBox="0 0 180 180" className="h-full w-full -rotate-90" role="img" aria-label="Top services">
          <circle cx="90" cy="90" r={R} fill="none" stroke={DASH.grid} strokeWidth="22" />
          {items.map((it, i) => {
            const len = (it.value / total) * C;
            const gap = items.length > 1 ? 2 : 0;
            const el = (
              <circle
                key={it.label}
                cx="90"
                cy="90"
                r={R}
                fill="none"
                stroke={it.color}
                strokeWidth={hover === i ? 26 : 22}
                strokeDasharray={`${Math.max(len - gap, 0.5)} ${C}`}
                strokeDashoffset={-acc}
                className="dash-arc cursor-default transition-[stroke-width]"
                style={{ animationDelay: `${i * 90}ms` }}
                onPointerEnter={() => setHover(i)}
                onPointerDown={() => setHover(i)}
                onPointerLeave={() => setHover(null)}
              />
            );
            acc += len;
            return el;
          })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          {hover != null && items[hover] ? (
            <>
              <span className="text-[1.6rem] font-semibold leading-none tabular-nums">{items[hover]!.value}</span>
              <span className="mt-1 max-w-[6.5rem] truncate text-[0.7rem] text-muted-foreground">{items[hover]!.label}</span>
            </>
          ) : (
            <>
              <span className="text-[1.6rem] font-semibold leading-none tabular-nums">{centre}</span>
              <span className="mt-1 text-[0.7rem] text-muted-foreground">{centreHint}</span>
            </>
          )}
        </div>
      </div>
      <ul className="w-full min-w-0 space-y-2">
        {items.map((it, i) => (
          <li
            key={it.label}
            onPointerEnter={() => setHover(i)}
            onPointerLeave={() => setHover(null)}
            className={cn("flex items-center gap-2.5 rounded-md px-2 py-1 text-[0.85rem] transition-colors", hover === i && "bg-foreground/[0.04]")}
          >
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: it.color }} />
            <span className="min-w-0 flex-1 truncate">{it.label}</span>
            <span className="tabular-nums text-muted-foreground">{Math.round((it.value / total) * 100)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
