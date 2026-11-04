// The real sky, revealed from the chosen time. Before a time is picked the
// time step stays in the salon's ivory. Picking a time spreads the real sky
// colour for that moment (the sun's actual position over the salon, see
// lib/sun.ts) quickly outwards from behind the tapped slot until it fills the
// page; picking another time spreads its sky over the last one. Dark skies
// switch the page to light text once the colour has arrived.
import { useEffect, useRef, useState } from "react";
import { skyFor, sunAltitude } from "@/lib/sun";

export type Sky = { top: string; bottom: string; dark: boolean; key: string };

/** The real sky for the chosen time; nothing until a time is chosen. */
export function useDaySky(
  day: { date: string; closed?: boolean } | null | undefined,
  selected: number | null | undefined,
): Sky | undefined {
  if (!day || day.closed || selected == null) return undefined;
  const s = skyFor(sunAltitude(day.date, selected));
  return { top: s.top, bottom: s.bottom, dark: s.dark, key: `${day.date}-${selected}` };
}

// where the last tap happened (the centre of the tapped slot), in the viewport
let origin: { x: number; y: number } | null = null;
/** Call from the slot's click: the sky spreads from behind this element. */
export function skyFrom(el: Element) {
  const r = el.getBoundingClientRect();
  origin = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}

type Layer = { id: number; sky: Sky; x: number; y: number; r: number; leaving?: boolean };

/** Dark text → light text, a moment after a dark sky starts spreading. */
export function useNight(sky: Sky | undefined) {
  const [night, setNight] = useState(false);
  useEffect(() => {
    const t = window.setTimeout(() => setNight(Boolean(sky?.dark)), sky?.dark ? 220 : 0);
    return () => window.clearTimeout(t);
  }, [sky?.dark, sky?.key]);
  return night;
}

/** The sky layers behind the page (place as the first child of the page). */
export function SkyReveal({ sky }: { sky: Sky | undefined }) {
  const [layers, setLayers] = useState<Layer[]>([]);
  const n = useRef(0);
  const last = useRef<string | null>(null);

  useEffect(() => {
    const key = sky?.key ?? null;
    if (key === last.current) return undefined;
    last.current = key;
    if (!sky) {
      // time cleared: the sky fades back to the salon's ivory
      setLayers((ls) => ls.map((l) => ({ ...l, leaving: true })));
      const t = window.setTimeout(() => setLayers([]), 420);
      return () => window.clearTimeout(t);
    }
    const w = window.innerWidth;
    const h = window.innerHeight;
    const o = origin ?? { x: w / 2, y: h / 2 };
    origin = null;
    // far enough to cover the furthest corner
    const r = Math.hypot(Math.max(o.x, w - o.x), Math.max(o.y, h - o.y)) + 40;
    const id = ++n.current;
    setLayers((ls) => [...ls.filter((l) => !l.leaving).slice(-1), { id, sky, x: o.x, y: o.y, r }]);
    return undefined;
  }, [sky]);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
      {layers.map((l) => (
        <div
          key={l.id}
          className={"sky-layer" + (l.leaving ? " sky-leaving" : "")}
          style={
            {
              "--t": l.sky.top,
              "--b": l.sky.bottom,
              "--x": `${l.x}px`,
              "--y": `${l.y}px`,
              "--r": `${l.r}px`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
