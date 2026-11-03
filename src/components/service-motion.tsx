// Service-specific micro-animations. The service icons are illustrations
// (raster), so each one gets a fine, transparent SVG "motion layer" that
// performs a quiet version of that service's real action over the artwork:
// a cut line for a haircut, strands drawing straight for straightening,
// airflow for a blow-dry, an oil drop then massage strokes, a wax strip lifted…
// Where the tool itself would move (straightener, razor, dryer, a pressing
// hand), the artwork moves a pixel or two with it.
//
// Plays once on hover (pointer devices) and when the service is selected,
// then settles back to the still icon. Nothing loops. CSS lives in styles.css
// (`.sm-*`), and reduced-motion users get a soft fade instead.
import type { CSSProperties, ReactNode } from "react";

export type MotionKind =
  | "cut"
  | "fringe"
  | "cut-style"
  | "beard"
  | "shave"
  | "straighten"
  | "keratin"
  | "blow-dry"
  | "wash-dry"
  | "blow-straight"
  | "blow-curls"
  | "updo"
  | "iron"
  | "moisture"
  | "condition"
  | "protect"
  | "repair"
  | "hairfall"
  | "dandruff"
  | "colour"
  | "facial"
  | "cleanup"
  | "pack"
  | "detan"
  | "brow"
  | "upper-lip"
  | "chin"
  | "forehead"
  | "side-lock"
  | "full-face"
  | "wax"
  | "oil-massage"
  | "head-massage"
  | "hand-massage"
  | "foot-massage"
  | "back-massage"
  | "scrub"
  | "polish"
  | "body-polish"
  | "eye-makeup"
  | "light-makeup"
  | "party-makeup"
  | "bridal-makeup"
  | "drape"
  | "signature";

/**
 * Each service's motion, keyed by its own icon artwork (the record's icon file),
 * so two services that look alike can still move differently.
 */
const BY_ICON: Record<string, MotionKind> = {
  "basic-haircut": "cut",
  "kids-u-14": "cut",
  "fringe-cut-bangs": "fringe",
  "cut-and-styling": "cut-style",
  "beard-trim": "beard",
  "beard-moustache-colour": "colour",
  shave: "shave",
  "straightening-smoothening": "straighten",
  "keratin-botox": "keratin",
  "wash-and-blast-dry": "wash-dry",
  "wash-conditioning-and-blow-dry": "wash-dry",
  "blow-dry-straight": "blow-straight",
  "blow-dry-curls": "blow-curls",
  "hair-styling-updo": "updo",
  "ironing-tonging": "iron",
  "hair-spa-moisturizing": "moisture",
  "hair-spa-deep-conditioning": "condition",
  "hair-spa-colour-protect": "protect",
  "hair-spa-repair-and-rejuvenate": "repair",
  "treatment-anti-hairfall": "hairfall",
  "treatment-anti-dandruff": "dandruff",
  "global-colour": "colour",
  "global-ammonia": "colour",
  "global-ammonia-free": "colour",
  "advance-colour": "colour",
  highlights: "colour",
  "root-touchup-ammonia": "colour",
  "root-touchup-ammonia-free": "colour",
  "anti-ageing-facial": "facial",
  "brightening-facial": "facial",
  "four-layer-facial": "facial",
  "hb-signature-facial": "facial",
  "korean-facial": "facial",
  "o3-advance-facial": "facial",
  "tan-facial": "facial",
  "fruit-clean-up": "cleanup",
  "lotus-clean-up": "cleanup",
  "o3-clean-up": "cleanup",
  "wine-clean-up": "cleanup",
  "brightening-pack": "pack",
  "d-tan-face-neck": "detan",
  "hands-d-tan": "detan",
  "threading-eyebrow": "brow",
  "threading-upper-lip": "upper-lip",
  "threading-chin": "chin",
  "threading-forehead": "forehead",
  "threading-side-lock": "side-lock",
  "threading-full-face": "full-face",
  "head-oil-massage": "oil-massage",
  "hand-massage": "hand-massage",
  "foot-massage": "foot-massage",
  "back-massage": "back-massage",
  "foot-scrub": "scrub",
  "foot-polish": "polish",
  "hand-polish": "polish",
  "body-polish": "body-polish",
  "eye-makeup": "eye-makeup",
  "light-makeup": "light-makeup",
  "party-makeup": "party-makeup",
  "bridal-makeup": "bridal-makeup",
  "saree-draping-in-salon": "drape",
  "saree-draping-at-venue": "drape",
  "bhargavs-signature": "signature",
  essentials: "signature",
  premium: "signature",
  ethereal: "signature",
};

/** The motion for a service, from its own icon file (none for an unknown icon). */
export function motionFor(icon: string | undefined): MotionKind | null {
  if (!icon) return null;
  const slug = icon.split("/").pop()?.replace(/\.[a-z0-9]+(\?.*)?$/i, "") ?? "";
  if (BY_ICON[slug]) return BY_ICON[slug]!;
  if (slug.startsWith("waxing-")) return "wax";
  return null;
}

/** How the artwork itself moves (the tool's own movement), if at all. */
export const IMAGE_MOTION: Partial<Record<MotionKind, string>> = {
  shave: "smi-glide",
  straighten: "smi-press",
  iron: "smi-press",
  "blow-dry": "smi-recoil",
  "wash-dry": "smi-recoil-late",
  "blow-straight": "smi-recoil",
  "blow-curls": "smi-recoil",
  "hand-massage": "smi-press-soft",
  detan: "smi-brighten",
  pack: "smi-brighten",
  keratin: "smi-gloss",
};

type El = { d?: string; t?: number | undefined; delay?: number | undefined };
const v = ({ t = 520, delay = 0 }: El): CSSProperties =>
  ({ "--t": `${t}ms`, "--d": `${delay}ms` }) as CSSProperties;

// small drawing helpers (viewBox 0 0 100 100; strokes scale with the tile)
const Line = ({ d, t, delay, w = 2.2, cls = "sm-draw" }: El & { w?: number; cls?: string }) => (
  <path d={d} pathLength={1} className={`sm-el ${cls}`} style={v({ t, delay })} fill="none" stroke="currentColor" strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" />
);
const Dot = ({ cx, cy, r = 1.4, t, delay, cls = "sm-fall" }: { cx: number; cy: number; r?: number; t?: number; delay?: number; cls?: string }) => (
  <circle cx={cx} cy={cy} r={r} className={`sm-el ${cls}`} style={v({ t, delay })} fill="currentColor" />
);
const Drop = ({ x, y, s = 1, t, delay, cls = "sm-drop" }: { x: number; y: number; s?: number; t?: number; delay?: number; cls?: string }) => (
  <path
    d={`M${x} ${y - 5 * s} C${x + 3.2 * s} ${y - 1 * s} ${x + 3.2 * s} ${y + 3 * s} ${x} ${y + 3 * s} C${x - 3.2 * s} ${y + 3 * s} ${x - 3.2 * s} ${y - 1 * s} ${x} ${y - 5 * s} Z`}
    className={`sm-el ${cls}`}
    style={v({ t, delay })}
    fill="currentColor"
    fillOpacity={0.85}
  />
);
const Band = ({ t, delay, angle = -20, cls = "sm-sweep", tone = "light" }: El & { angle?: number; cls?: string; tone?: "light" | "warm" }) => (
  <g transform={`rotate(${angle} 50 50)`}>
    <rect x="-20" y="-20" width="26" height="140" className={`sm-el ${cls}`} style={v({ t, delay })} fill={tone === "light" ? "url(#sm-sheen)" : "url(#sm-warm)"} />
  </g>
);

function shapes(kind: MotionKind): ReactNode {
  switch (kind) {
    /* ── hair ── */
    case "cut": // one precise cut through the hair line; a snippet falls away
      return (
        <>
          <Line d="M56 16 L82 31" t={480} />
          <Line d="M63 27 L68 30" w={2.4} t={520} delay={280} cls="sm-snippet" />
        </>
      );
    case "fringe": // a small snip straight across the fringe
      return (
        <>
          <Line d="M34 36 L62 36" t={320} />
          <Line d="M44 38 L47 39" w={1.8} t={420} delay={260} cls="sm-snippet" />
        </>
      );
    case "cut-style": // a short cut, then the strand settles into shape
      return (
        <>
          <Line d="M60 20 L78 28" t={260} />
          <Line d="M70 36 C76 44 74 54 66 60" t={420} delay={240} />
        </>
      );
    case "beard": // one controlled trimming pass down the beard line
      return (
        <>
          <Line d="M36 60 L42 84" t={420} w={2.5} />
          <Dot cx={40} cy={70} r={1} delay={220} t={360} />
          <Dot cx={42} cy={76} r={1} delay={300} t={360} />
        </>
      );
    case "shave": // the razor glides once; the lather clears behind it
      return <Band t={560} angle={0} tone="light" />;
    case "straighten": // curved strands → straight
      return (
        <>
          {[44, 52, 60].map((x, i) => (
            <g key={x}>
              <path d={`M${x} 48 C${x + 6} 58 ${x - 6} 68 ${x} 78 C${x + 5} 84 ${x - 2} 88 ${x} 92`} pathLength={1} className="sm-el sm-unwave" style={v({ t: 600, delay: i * 50 })} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
              <Line d={`M${x} 48 L${x} 92`} w={1.8} t={600} delay={160 + i * 50} cls="sm-draw-stay" />
            </g>
          ))}
        </>
      );
    case "keratin": // irregular → aligned, then one quiet gloss
      return (
        <>
          <Line d="M58 30 C66 40 56 52 64 64 C70 74 62 82 66 90" w={1.7} t={380} cls="sm-unwave" />
          <Band t={620} delay={200} angle={-28} />
        </>
      );
    case "blow-dry": // airflow leaves the nozzle; hair moves with it
      return <Air />;
    case "wash-dry": // water first, then gentle airflow
      return (
        <>
          <Drop x={30} y={24} s={0.8} t={320} />
          <Drop x={38} y={18} s={0.7} t={320} delay={60} />
          <Air delay={300} />
        </>
      );
    case "blow-straight": // airflow, strands finish straight
      return (
        <>
          <Air />
          <Line d="M24 70 L24 92" w={1.7} t={420} delay={260} cls="sm-draw-stay" />
          <Line d="M30 68 L30 90" w={1.7} t={420} delay={300} cls="sm-draw-stay" />
        </>
      );
    case "blow-curls": // airflow, one strand winds into a soft curl
      return (
        <>
          <Air />
          <Line d="M26 60 C34 64 34 74 26 74 C20 74 20 66 26 66 C30 66 30 70 27 71" w={1.8} t={520} delay={180} />
        </>
      );
    case "updo": // strands sweep up into a bun
      return (
        <>
          <Line d="M40 80 C34 60 40 40 54 30" t={460} />
          <circle cx={58} cy={24} r={7} pathLength={1} className="sm-el sm-draw" style={v({ t: 360, delay: 300 })} fill="none" stroke="currentColor" strokeWidth={2.0} />
        </>
      );
    case "iron": // the plates close and travel down; the strand smooths
      return (
        <>
          <Line d="M50 46 C56 56 46 66 52 78" w={1.7} t={360} cls="sm-unwave" />
          <Line d="M51 46 L51 86" w={1.7} t={520} delay={180} cls="sm-draw-stay" />
        </>
      );

    /* ── hair spa / treatments ── */
    case "moisture": // a droplet meets the strand; the strand smooths
      return (
        <>
          <Drop x={50} y={22} t={420} />
          <Line d="M58 50 C62 62 56 72 60 86" w={1.7} t={420} delay={320} cls="sm-draw" />
        </>
      );
    case "condition": // conditioning cream settles into the hair
      return (
        <>
          <Drop x={46} y={24} s={1.2} t={460} cls="sm-settle" />
          <ellipse cx={50} cy={62} rx={18} ry={6} className="sm-el sm-soft" style={v({ t: 560, delay: 260 })} fill="currentColor" fillOpacity={0.18} />
        </>
      );
    case "protect": // a fine protective layer wraps round
      return <circle cx={50} cy={50} r={40} pathLength={1} className="sm-el sm-draw" style={v({ t: 680 })} fill="none" stroke="currentColor" strokeWidth={1.7} />;
    case "repair": // a frayed strand becomes a healthy one
      return (
        <>
          <Line d="M50 24 L54 34 L47 42 L55 52 L48 62 L54 72 L50 80" w={1.7} t={380} cls="sm-unwave" />
          <Line d="M51 24 C55 44 47 60 51 80" w={2.0} t={520} delay={200} cls="sm-draw-stay" />
        </>
      );
    case "hairfall": // loose strands draw back together
      return (
        <>
          <Line d="M30 40 L36 70" w={1.7} t={520} cls="sm-converge-l" />
          <Line d="M70 40 L64 70" w={1.7} t={520} cls="sm-converge-r" />
        </>
      );
    case "dandruff": // a few flakes quietly vanish
      return (
        <>
          {[
            [40, 30],
            [52, 26],
            [60, 34],
            [46, 38],
          ].map(([x, y], i) => (
            <Dot key={i} cx={x!} cy={y!} r={1.2} delay={i * 70} t={420} cls="sm-vanish" />
          ))}
        </>
      );
    case "colour": // colour washes down through the hair
      return <Band t={640} angle={90} tone="warm" cls="sm-wash" />;

    /* ── face ── */
    case "facial": // a slow circular massage line
      return <circle cx={50} cy={48} r={18} pathLength={1} className="sm-el sm-draw" style={v({ t: 680 })} fill="none" stroke="currentColor" strokeWidth={1.8} transform="rotate(-90 50 48)" />;
    case "cleanup": // one cleansing wipe
      return <Band t={520} angle={-10} />;
    case "pack": // a thin layer smooths across the face
      return <ellipse cx={50} cy={50} rx={26} ry={30} className="sm-el sm-soft" style={v({ t: 640 })} fill="url(#sm-warm)" />;
    case "detan": // dull → bright
      return <Band t={600} angle={-24} />;
    case "brow":
      return <Line d="M36 38 C44 33 54 33 62 37" w={1.8} t={380} />;
    case "upper-lip":
      return <Line d="M40 66 C46 63 54 63 60 66" w={1.7} t={360} />;
    case "chin":
      return <Line d="M42 82 C47 86 53 86 58 82" w={1.7} t={360} />;
    case "forehead":
      return <Line d="M34 24 C44 20 56 20 66 24" w={1.7} t={380} />;
    case "side-lock":
      return <Line d="M28 40 L28 58" w={1.7} t={340} />;
    case "full-face":
      return (
        <>
          <Line d="M36 36 C44 32 54 32 62 36" w={1.7} t={300} />
          <Line d="M42 66 C47 63 53 63 58 66" w={1.7} t={300} delay={220} />
        </>
      );
    case "wax": // strip applied → lifted cleanly away
      return <rect x={36} y={44} width={28} height={10} rx={2} className="sm-el sm-strip" style={v({ t: 560 })} fill="currentColor" fillOpacity={0.3} />;

    /* ── massage ── */
    case "oil-massage": // an oil drop, then two calm strokes
      return (
        <>
          <Drop x={50} y={18} t={360} />
          <Strokes y={34} delay={300} />
        </>
      );
    case "head-massage":
      return <Strokes y={30} />;
    case "hand-massage": // a gentle press and release
      return <Strokes y={50} short />;
    case "foot-massage":
      return <Strokes y={46} />;
    case "back-massage": // two strokes down the back
      return (
        <>
          <Line d="M42 28 L42 68" w={1.8} t={460} />
          <Line d="M58 28 L58 68" w={1.8} t={460} delay={140} />
        </>
      );
    case "scrub": // a short scrubbing motion
      return <Line d="M30 60 L38 54 L46 60 L54 54 L62 60 L70 54" w={1.8} t={560} />;
    case "polish": // one polishing sweep
      return <Line d="M28 62 C40 50 60 50 72 62" w={2.0} t={520} />;
    case "body-polish": // a smooth circular polish
      return <circle cx={50} cy={52} r={16} pathLength={1} className="sm-el sm-draw" style={v({ t: 640 })} fill="none" stroke="currentColor" strokeWidth={1.8} transform="rotate(-90 50 52)" />;

    /* ── makeup / draping ── */
    case "eye-makeup": // brush in, one controlled stroke
      return <Line d="M34 44 C42 40 52 40 60 44" w={2.6} t={440} />;
    case "light-makeup": // one elegant sweep across the cheek
      return <Line d="M30 60 C40 52 54 50 66 56" w={3} t={480} />;
    case "party-makeup": // a few quick touches, one after another
      return (
        <>
          <Line d="M34 44 C40 41 46 41 52 44" w={2.4} t={280} />
          <Line d="M32 60 C40 54 50 54 58 58" w={2.8} t={300} delay={220} />
          <Dot cx={66} cy={40} r={1.3} delay={480} t={240} cls="sm-vanish" />
        </>
      );
    case "bridal-makeup": // one refined finishing stroke and a soft glint
      return (
        <>
          <Line d="M28 62 C42 50 58 48 72 54" w={2.4} t={560} />
          <Dot cx={72} cy={52} r={1.6} delay={460} t={260} cls="sm-vanish" />
        </>
      );
    case "drape": // the fabric folds once across the figure
      return <Line d="M30 30 C46 44 54 60 70 82" w={5} t={620} cls="sm-drape" />;

    case "signature": // a single quiet sheen
      return <Band t={700} angle={-24} />;
  }
}

function Air({ delay = 0 }: { delay?: number }) {
  return (
    <>
      {[0, 1, 2].map((i) => (
        <path
          key={i}
          d={`M${24 - i * 2} ${36 + i * 7} C${16 - i * 2} ${34 + i * 7} ${10} ${40 + i * 7} ${4} ${38 + i * 7}`}
          pathLength={1}
          className="sm-el sm-air"
          style={v({ t: 460, delay: delay + i * 70 })}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.7}
          strokeLinecap="round"
        />
      ))}
    </>
  );
}

function Strokes({ y, delay = 0, short }: { y: number; delay?: number; short?: boolean }) {
  const w = short ? 10 : 14;
  return (
    <>
      <Line d={`M${50 - w} ${y} C${50 - w / 2} ${y - 5} ${50 + w / 2} ${y - 5} ${50 + w} ${y}`} w={1.8} t={360} delay={delay} />
      <Line d={`M${50 - w} ${y + 8} C${50 - w / 2} ${y + 3} ${50 + w / 2} ${y + 3} ${50 + w} ${y + 8}`} w={1.8} t={360} delay={delay + 200} />
    </>
  );
}

/** The motion layer that sits over a service icon. */
export function ServiceMotion({ kind }: { kind: MotionKind }) {
  return (
    <svg viewBox="0 0 100 100" aria-hidden className="pointer-events-none absolute inset-[9%] h-[82%] w-[82%] overflow-visible text-bronze">
      <defs>
        <linearGradient id="sm-sheen" x1="0" x2="1">
          <stop offset="0" stopColor="#fffaf2" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fffaf2" stopOpacity="0.75" />
          <stop offset="1" stopColor="#fffaf2" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="sm-warm" x1="0" x2="1">
          <stop offset="0" stopColor="#b07a4f" stopOpacity="0" />
          <stop offset="0.5" stopColor="#b07a4f" stopOpacity="0.28" />
          <stop offset="1" stopColor="#b07a4f" stopOpacity="0" />
        </linearGradient>
      </defs>
      {shapes(kind)}
    </svg>
  );
}
