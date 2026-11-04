// The real sky behind the time step, after a solar dial: the page takes the
// colour of the actual sky over the salon at the chosen date and time (clear
// blue by day, golden hour, sunset, twilight, night), from the sun's real
// position (see lib/sun.ts). Before a time is chosen: the sky now (today) or
// at opening. Dark skies switch the page to light text.
import { useEffect, useState } from "react";
import { skyFor, sunAltitude } from "@/lib/sun";

export type Sky = { top: string; bottom: string; dark: boolean };

export function useDaySky(
  day: { date: string; open: number; close: number; closed?: boolean } | null | undefined,
  selected: number | null | undefined,
): Sky | undefined {
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
  const at =
    selected ??
    (now && now.iso === day.date && now.minute >= day.open && now.minute <= day.close ? now.minute : day.open);
  const s = skyFor(sunAltitude(day.date, at));
  return { top: s.top, bottom: s.bottom, dark: s.dark };
}
