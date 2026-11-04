// The day in the background, after a solar dial: on the time step the page
// itself takes the colour of the part of the day being chosen: a soft peach
// dawn for the first slots, clear ivory late morning, warm sand in the
// afternoon and a soft rosy dusk in the evening. Always light, so text stays
// easy to read. Calculated, not images, and it changes smoothly.
import { useEffect, useState } from "react";

type Stop = [number, [number, number, number]];

// page colour along the salon's day (0 = opening, 1 = closing)
const SKY: Stop[] = [
  [0, [245, 230, 214]], // dawn peach
  [0.3, [250, 246, 239]], // clear late-morning ivory
  [0.58, [247, 236, 220]], // warm afternoon sand
  [0.8, [242, 223, 203]], // golden hour
  [1, [235, 219, 212]], // soft rosy dusk
];

function lerp(t: number) {
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

/**
 * The page colour for the chosen time (or, today, the time now; otherwise
 * dawn) within the day's opening hours. Undefined until the day is known.
 */
export function useDaySky(
  day: { date: string; open: number; close: number; closed?: boolean } | null | undefined,
  selected: number | null | undefined,
) {
  const [now, setNow] = useState<{ iso: string; minute: number } | null>(null);
  useEffect(() => {
    const tick = () => {
      const d = new Date(Date.now() + 330 * 60_000);
      setNow({ iso: d.toISOString().slice(0, 10), minute: d.getUTCHours() * 60 + d.getUTCMinutes() });
    };
    tick();
    const t = window.setInterval(tick, 60_000);
    return () => window.clearInterval(t);
  }, []);
  if (!day || day.closed) return undefined;
  const span = Math.max(30, day.close - day.open);
  const at =
    selected ??
    (now && now.iso === day.date && now.minute >= day.open && now.minute <= day.close ? now.minute : day.open);
  const [r, g, b] = lerp((at - day.open) / span);
  return `rgb(${r} ${g} ${b})`;
}
