import { applyContent } from "./site-content";
import { builtInCategoryPhoto, builtInServicePhoto } from "./service-photos";

// Business, menu and availability data for The Hair By Bhargav Unisex Salon.
// Service names and prices are taken verbatim from the official Service Menu.
// `slots` = number of consecutive 30-minute booking slots the service occupies.

export type Audience = "men" | "women";

export type Service = {
  id: string;
  name: string;
  note?: string;
  price: number;
  from?: boolean; // "onwards" pricing
  /** Legacy 30-minute block count (kept for older bookings). */
  slots: number;
  /** Service time in minutes. */
  minutes: number;
  /** Minutes held after the service before the next booking (cleanup). */
  buffer?: number;
  /** Shown first under "Popular". */
  featured?: boolean;
  /** Photo uploaded by the salon in the admin Menu (falls back to an icon). */
  photo?: string;
};

export type Category = {
  id: string;
  title: string;
  blurb?: string;
  services: Service[];
  photo?: string;
};

export const SLOT_MINUTES = 30;

export const BUSINESS = {
  name: "The Hair By Bhargav Unisex Salon",
  brand: "Hair by Bhargav",
  tagline: "Hair · Beauty · Makeover",
  founder: "D. Bhargav",
  locationShort: "KPHB Phase 9 · Kukatpally · Hyderabad",
  address:
    "Plot No. 1143, Raghava Avasa, Gokul Plots, Venkataramana Colony, KPHB Phase 9, Kukatpally, Hyderabad – 500072",
  mapsQuery:
    "The Hair By Bhargav Unisex Salon, Plot No. 1143, Raghava Avasa, Gokul Plots, Venkataramana Colony, KPHB Phase 9, Kukatpally, Hyderabad 500072",
  phones: ["+917981648951", "+918125391998"],
  hoursOpenDays: "Wednesday to Monday",
  closedDay: "Tuesday",
  firstSlot: "10:00 AM",
  lastSlot: "7:30 PM – 8:00 PM",
  facilities: [
    "4 salon chairs",
    "2 hair wash stations",
    "Full air conditioning",
    "Waiting area",
    "Makeup area",
    "Beard & grooming area",
    "Private room",
    "Parking available",
  ],
};

export type TimeRange = { start: number; end: number };
export type WeekDay = {
  day: string;
  closed: boolean;
  open?: number;
  close?: number;
  breaks?: TimeRange[];
};
export type DateException = {
  closed: boolean;
  open?: number;
  close?: number;
  breaks?: TimeRange[];
  note?: string;
};
/** Specific dates that override the weekly pattern (holidays, special hours). */
export const EXCEPTIONS: Record<string, DateException> = {};

/** Lunch, every open day, unless the salon sets its own breaks in the admin console. */
export const DEFAULT_LUNCH: TimeRange = { start: 13 * 60, end: 14 * 60 };

export const WEEK: WeekDay[] = [
  { day: "Monday", closed: false, breaks: [DEFAULT_LUNCH] },
  { day: "Tuesday", closed: true },
  { day: "Wednesday", closed: false, breaks: [DEFAULT_LUNCH] },
  { day: "Thursday", closed: false, breaks: [DEFAULT_LUNCH] },
  { day: "Friday", closed: false, breaks: [DEFAULT_LUNCH] },
  { day: "Saturday", closed: false, breaks: [DEFAULT_LUNCH] },
  { day: "Sunday", closed: false, breaks: [DEFAULT_LUNCH] },
];

const s = (id: string, name: string, price: number, slots: number, extra?: Partial<Service>): Service => ({
  id,
  name,
  price,
  slots,
  minutes: slots * 30,
  ...extra,
});

/* ── Shared (unisex) categories ─────────────────────────────── */

const glow = (p: string): Category => ({
  id: "glow",
  title: "Glow & Radiance",
  blurb: "Invest in your skin. It's going to represent you for a very long time.",
  services: [
    s(p + "dtan-face", "D-Tan Face / Neck", 700, 1),
    s(p + "dtan-hands", "Hands D-Tan", 1000, 1),
    s(p + "bright-pack", "Brightening Pack", 1000, 1),
    s(p + "cu-wine", "Wine Clean Up", 800, 1),
    s(p + "cu-lotus", "Lotus Clean Up", 1000, 1),
    s(p + "cu-o3", "o3 Clean Up", 1500, 2),
    s(p + "cu-fruit", "Fruit Clean Up", 900, 1),
    s(p + "fa-bright", "Brightening Facial", 1800, 2),
    s(p + "fa-tan", "Tan Facial", 2000, 2),
    s(p + "fa-korean", "Korean Facial", 3500, 3),
    s(p + "fa-o3", "o3 Advance Facial", 3200, 3),
    s(p + "fa-antiage", "Anti Ageing Facial", 2500, 2),
    s(p + "fa-fourlayer", "Four Layer Facial", 3000, 3),
    s(p + "fa-hb", "HB Signature Facial", 4000, 3),
  ],
});

const beauty = (p: string): Category => ({
  id: "beauty",
  title: "Beauty Services",
  blurb: "Utmost care, for a comfortable and relatively painless experience.",
  services: [
    s(p + "th-eyebrow", "Threading — Eyebrow", 80, 1),
    s(p + "th-upperlip", "Threading — Upper Lip", 80, 1),
    s(p + "th-chin", "Threading — Chin", 80, 1),
    s(p + "th-forehead", "Threading — Forehead", 80, 1),
    s(p + "th-sidelock", "Threading — Side Lock", 80, 1),
    s(p + "th-fullface", "Threading — Full Face", 450, 1),
    s(p + "wx-fullarms", "Waxing — Full Arms", 500, 1),
    s(p + "wx-halfarms", "Waxing — Half Arms", 300, 1),
    s(p + "wx-fulllegs", "Waxing — Full Legs", 1000, 2),
    s(p + "wx-halflegs", "Waxing — Half Legs", 500, 1),
    s(p + "wx-underarms", "Waxing — Under Arms", 200, 1, { note: "₹200 / ₹250" }),
    s(p + "wx-halfback", "Waxing — Half Back", 500, 1),
    s(p + "wx-fullback", "Waxing — Full Back", 1000, 2),
    s(p + "wx-stomach", "Waxing — Stomach", 800, 1),
    s(p + "wx-fullface", "Waxing — Full Face", 500, 1),
    s(p + "wx-eyebrow", "Waxing — Eyebrow", 150, 1),
    s(p + "wx-upperlip", "Waxing — Upper Lip", 100, 1),
    s(p + "wx-chin", "Waxing — Chin", 100, 1),
    s(p + "wx-sidelock", "Waxing — Side Lock", 100, 1),
    s(p + "wx-forehead", "Waxing — Forehead", 100, 1),
    s(p + "wx-fullbody", "Waxing — Full Body", 3000, 4),
  ],
});

const polish = (p: string): Service[] => [
  s(p + "rf-footscrub", "Foot Scrub", 500, 1),
  s(p + "rf-footpolish", "Foot Polish", 1500, 2),
  s(p + "rf-handpolish", "Hand Polish", 2000, 2),
  s(p + "rf-bodypolish", "Body Polish", 5000, 4),
];

const packages = (p: string): Category => ({
  id: "packages",
  title: "Pre Bridal / Groom Packages",
  blurb: "Complete multi-service packages. Duration is confirmed at consultation.",
  services: [
    s(p + "pk-essentials", "Essentials", 10000, 6, {
      note: "Enduring Facial · Flavoured Wax (Full Legs & Arms, Under Arms) · Threading · DeTan Face, Neck & Back · DeTan Full Legs & Arms · Classic Pedicure & Manicure · Hair Spa & Blowdry Curls",
    }),
    s(p + "pk-premium", "Premium", 20000, 8, {
      note: "Signature Gold Facial · Flavoured Wax Full Body · Brazilian Wax · Threading · 1 Hair Spa / Root Touchup · DeTan Face & Neck · DeTan Full Body · Bomb Pedicure & Manicure · Haircut & Styling",
    }),
    s(p + "pk-ethereal", "Ethereal", 25000, 10, {
      note: "Bridal Glow Facial · Full Body Wax · Brazilian Wax · Threading · Spa Pedicure · Spa Manicure · DeTan Face, Neck & Back · DeTan Full Body · Hair Spa / Treatment · Haircut & Global Colour",
    }),
  ],
});

/* ── Men ─────────────────────────────────────────────────────── */

export const MEN_MENU: Category[] = [
  {
    id: "hair",
    title: "Hairstyles",
    blurb:
      "A thorough walkthrough and a hair do that accentuates your personality.",
    services: [
      s("m-cut", "Basic Haircut", 500, 1),
      s("m-beard", "Beard Trim", 250, 1),
      s("m-shave", "Shave", 300, 1),
      s("m-signature", "Bhargav's Signature", 1000, 1, {
        note: "Consultation, haircut, beard trim, wash & styling",
      }),
      s("m-kids", "Kids (U-14)", 300, 1),
      s("m-wash", "Wash and Blast Dry", 300, 1),
    ],
  },
  {
    id: "colour",
    title: "Colours",
    blurb: "Colorimetry advanced enough to propose a personalised solution for any mood.",
    services: [
      s("m-rt-af", "Root Touchup (Ammonia Free)", 1000, 2),
      s("m-rt-a", "Root Touchup (Ammonia)", 800, 2),
      s("m-col-beard", "Beard / Moustache Colour", 350, 1),
      s("m-highlights", "Highlights", 2000, 3, { from: true }),
      s("m-global", "Global Colour", 1400, 2),
    ],
  },
  {
    id: "haircare",
    title: "Hair Care",
    blurb: "An extra ounce of hydration and a little more protection.",
    services: [
      s("m-spa-moist", "Hair Spa — Moisturizing", 1200, 2),
      s("m-spa-deep", "Hair Spa — Deep Conditioning", 1200, 2),
      s("m-spa-colour", "Hair Spa — Colour Protect", 1200, 2),
      s("m-spa-repair", "Hair Spa — Repair & Rejuvenate", 1200, 2),
      s("m-tr-hairfall", "Treatment — Anti Hairfall", 1500, 2),
      s("m-tr-dandruff", "Treatment — Anti Dandruff", 1500, 2),
    ],
  },
  {
    id: "treatments",
    title: "Hair Treatments",
    blurb: "Pricing may vary depending on hair density and length.",
    services: [
      s("m-straight", "Straightening / Smoothening", 3500, 6),
      s("m-keratin", "Keratin / Botox", 5000, 6),
    ],
  },
  {
    id: "reflexology",
    title: "Reflexology",
    blurb: "A revitalising body experience. Massage duration is 25 minutes.",
    services: [
      s("m-rf-foot", "Foot Massage", 300, 1),
      s("m-rf-head", "Head Oil Massage", 500, 1),
      s("m-rf-hand", "Hand Massage", 300, 1),
      s("m-rf-back", "Back Massage", 600, 1),
      ...polish("m-"),
    ],
  },
  glow("m-"),
  beauty("m-"),
  packages("m-"),
];

/* ── Women ───────────────────────────────────────────────────── */

export const WOMEN_MENU: Category[] = [
  {
    id: "hair",
    title: "Hairstyles",
    blurb:
      "A thorough walkthrough and a hair do that accentuates your personality.",
    services: [
      s("w-fringe", "Fringe Cut / Bangs", 350, 1),
      s("w-cut", "Cut & Styling", 1200, 2),
      s("w-signature", "Bhargav's Signature", 1500, 1),
      s("w-blow-straight", "Blow Dry Straight", 600, 1),
      s("w-blow-curls", "Blow Dry Curls", 800, 2),
      s("w-ironing", "Ironing / Tonging", 800, 2),
      s("w-kids", "Kids (U-14)", 600, 1),
      s("w-wash", "Wash & Blast Dry", 400, 1),
      s("w-wash-cond", "Wash, Conditioning & Blow Dry", 600, 2),
    ],
  },
  {
    id: "colour",
    title: "Colours",
    blurb: "Colorimetry advanced enough to propose a personalised solution for any mood.",
    services: [
      s("w-rt-a", "Root Touchup (Ammonia)", 1200, 2),
      s("w-rt-af", "Root Touchup (Ammonia Free)", 1500, 2),
      s("w-global-a", "Global (Ammonia)", 4000, 4, { from: true }),
      s("w-global-af", "Global (Ammonia Free)", 5000, 4, { from: true }),
      s("w-highlights", "Highlights", 4000, 4, { from: true }),
      s("w-advance", "Advance Colour", 5000, 5, { from: true }),
    ],
  },
  {
    id: "haircare",
    title: "Hair Care",
    blurb: "An extra ounce of hydration and a little more protection.",
    services: [
      s("w-spa-moist", "Hair Spa — Moisturizing", 1800, 2),
      s("w-spa-deep", "Hair Spa — Deep Conditioning", 1800, 2),
      s("w-spa-colour", "Hair Spa — Colour Protect", 1800, 2),
      s("w-spa-repair", "Hair Spa — Repair & Rejuvenate", 1800, 2),
      s("w-tr-hairfall", "Treatment — Anti Hairfall", 1800, 2),
      s("w-tr-dandruff", "Treatment — Anti Dandruff", 1800, 2),
    ],
  },
  {
    id: "treatments",
    title: "Hair Treatments",
    blurb: "Pricing may vary depending on hair density and length.",
    services: [
      s("w-straight", "Straightening / Smoothening", 6000, 6),
      s("w-keratin", "Keratin / Botox", 7000, 6),
    ],
  },
  {
    id: "makeup",
    title: "Maquillage",
    blurb: "Makeup designed to compliment your lifestyle.",
    services: [
      s("w-mk-eye", "Eye Makeup", 1500, 1),
      s("w-mk-light", "Light Makeup", 3000, 2),
      s("w-mk-party", "Party Makeup", 7000, 3),
      s("w-mk-bridal", "Bridal Makeup", 20000, 6),
      s("w-mk-outdoor", "Outdoor Charges", 3500, 1),
      s("w-saree-salon", "Saree Draping — in Salon", 1000, 1),
      s("w-saree-venue", "Saree Draping — at Venue", 1800, 1),
      s("w-updo", "Hair Styling (Updo)", 2000, 2),
    ],
  },
  {
    id: "reflexology",
    title: "Reflexology",
    blurb: "A revitalising body experience. Massage duration is 25 minutes.",
    services: [
      s("w-rf-foot", "Foot Massage", 300, 1),
      s("w-rf-head", "Head Oil Massage", 700, 1),
      s("w-rf-hand", "Hand Massage", 300, 1),
      s("w-rf-back", "Back Massage", 800, 1),
      ...polish("w-"),
    ],
  },
  glow("w-"),
  beauty("w-"),
  packages("w-"),
];

export const menuFor = (a: Audience) => (a === "men" ? MEN_MENU : WOMEN_MENU);

export const findService = (a: Audience, id: string): Service | undefined => {
  for (const c of menuFor(a)) {
    const f = c.services.find((x) => x.id === id);
    if (f) return f;
  }
  return undefined;
};

/* ── Formatting helpers ──────────────────────────────────────── */

export const inr = (n: number) => "₹" + n.toLocaleString("en-IN");

/** "1 hr 15 min" from a number of minutes. */
export const formatDuration = (mins: number) => {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h} hr ${m} min`;
  if (h) return `${h} hr`;
  return `${m} min`;
};

/* ── Availability ────────────────────────────────────────────── */

export let OPEN_MINUTE = 10 * 60; // 10:00 — admin-editable via applyConfig
export let CLOSE_MINUTE = 20 * 60; // 20:00
export let TOTAL_SLOTS = (CLOSE_MINUTE - OPEN_MINUTE) / SLOT_MINUTES;
export let ACCEPTING_BOOKINGS = true;
export let MAX_ADVANCE_DAYS = 56;

export const toISO = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export const fromISO = (iso: string) => {
  const parts = iso.split("-").map(Number);
  return new Date(parts[0] ?? 1970, (parts[1] ?? 1) - 1, parts[2] ?? 1);
};

const DAY_INDEX = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
export const isClosed = (iso: string) => {
  const ex = EXCEPTIONS[iso];
  if (ex) return ex.closed;
  const name = DAY_INDEX[fromISO(iso).getDay()];
  return WEEK.some((w) => w.day === name && w.closed);
};

/** Opening and closing minute for a date (exception → weekday → salon default). */
export const hoursFor = (iso: string) => {
  const ex = EXCEPTIONS[iso];
  const w = WEEK.find((x) => x.day === DAY_INDEX[fromISO(iso).getDay()]);
  const open = ex && !ex.closed && ex.open != null ? ex.open : (w?.open ?? OPEN_MINUTE);
  const close = ex && !ex.closed && ex.close != null ? ex.close : (w?.close ?? CLOSE_MINUTE);
  return { open, close: Math.max(close, open + SLOT_MINUTES) };
};

const normaliseBreaks = (ranges: TimeRange[] | undefined, dayOpen: number, dayClose: number) =>
  (ranges ?? [])
    .map((r) => ({
      start: Math.max(dayOpen, Math.min(r.start, dayClose)),
      end: Math.max(dayOpen, Math.min(r.end, dayClose)),
    }))
    .filter((r) => r.end > r.start)
    .sort((a, b) => a.start - b.start);

export const breaksFor = (iso: string) => {
  const ex = EXCEPTIONS[iso];
  const w = WEEK.find((x) => x.day === DAY_INDEX[fromISO(iso).getDay()]);
  const { open, close } = hoursFor(iso);
  const ranges = ex && !ex.closed && ex.breaks ? ex.breaks : w?.breaks;
  return normaliseBreaks(ranges, open, close);
};

export const intersectsBreak = (iso: string, start: number, end: number) =>
  breaksFor(iso).some((r) => start < r.end && r.start < end);

export const minuteLabel = (min: number) => {
  const h24 = Math.floor(min / 60);
  const m = min % 60;
  const ampm = h24 >= 12 ? "PM" : "AM";
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${String(m).padStart(2, "0")} ${ampm}`;
};

export const formatLongDate = (iso: string) => {
  const d = fromISO(iso);
  return d
    .toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })
    .toUpperCase()
    .replace(",", " ·");
};

/** Slot start-times (in minutes from midnight) that can fit `slotsNeeded`. */
export function availableSlots(
  iso: string,
  slotsNeeded: number,
  now = new Date(),
  busy: { time: number; slots: number }[] = [],
) {
  if (isClosed(iso) || !ACCEPTING_BOOKINGS) return [];
  const isToday = toISO(now) === iso;
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const out: { minute: number; available: boolean }[] = [];
  const h = hoursFor(iso);
  const breaks = breaksFor(iso);
  const count = (h.close - h.open) / SLOT_MINUTES;
  for (let i = 0; i < count; i++) {
    const start = h.open + i * SLOT_MINUTES;
    const fits = start + Math.max(1, slotsNeeded) * SLOT_MINUTES <= h.close;
    const future = !isToday || start >= nowMin + 30;
    const end = start + Math.max(1, slotsNeeded) * SLOT_MINUTES;
    const clash = busy.some((b) => start < b.time + b.slots * SLOT_MINUTES && b.time < end);
    const inBreak = breaks.some((r) => start < r.end && r.start < end);
    out.push({ minute: start, available: fits && future && !clash && !inBreak });
  }
  return out;
}

/** Next 60 bookable calendar days (Tuesdays excluded from selection). */
export function calendarDays(count = MAX_ADVANCE_DAYS, now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days: { iso: string; date: Date; selectable: boolean }[] = [];
  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const iso = toISO(d);
    days.push({ iso, date: d, selectable: !isClosed(iso) });
  }
  return days;
}

/* ── Admin-editable configuration ────────────────────────────── */

export type SalonConfig = {
  business?: Partial<typeof BUSINESS>;
  week?: WeekDay[];
  exceptions?: Record<string, DateException>;
  openMinute?: number;
  closeMinute?: number;
  accepting?: boolean;
  maxAdvanceDays?: number;
  menMenu?: Category[];
  womenMenu?: Category[];
  /** Published site wording (see site-content.ts). */
  content?: unknown;
};

const DEFAULTS = {
  business: structuredClone(BUSINESS),
  week: structuredClone(WEEK),
  men: structuredClone(MEN_MENU),
  women: structuredClone(WOMEN_MENU),
};

export function defaultConfig(): Required<SalonConfig> {
  return {
    business: structuredClone(DEFAULTS.business),
    week: structuredClone(DEFAULTS.week),
    exceptions: {},
    openMinute: 10 * 60,
    closeMinute: 20 * 60,
    accepting: true,
    maxAdvanceDays: 56,
    menMenu: structuredClone(DEFAULTS.men),
    womenMenu: structuredClone(DEFAULTS.women),
    content: null,
  };
}

function replaceArray<T>(target: T[], next: T[]) {
  target.splice(0, target.length, ...next);
}

/** Fills in the salon's built-in photos where the admin hasn't uploaded one. */
function withPhotos(audience: Audience, menu: Category[]): Category[] {
  return menu.map((c) => {
    const catPhoto = c.photo ?? builtInCategoryPhoto(audience, c.title);
    return {
      ...c,
      ...(catPhoto ? { photo: catPhoto } : {}),
      services: c.services.map((x) => {
        const photo = x.photo ?? builtInServicePhoto(audience, x.name);
        return photo ? { ...x, photo } : x;
      }),
    };
  });
}

let appliedKey = "";
/** Mutates the shared menu/business data in place so every screen sees admin edits. */
export function applyConfig(cfg: SalonConfig | null | undefined) {
  const full = { ...defaultConfig(), ...(cfg ?? {}) };
  const key = JSON.stringify(full);
  if (key === appliedKey) return;
  appliedKey = key;
  Object.assign(BUSINESS, DEFAULTS.business, full.business);
  replaceArray(WEEK, full.week);
  for (const k of Object.keys(EXCEPTIONS)) delete EXCEPTIONS[k];
  Object.assign(EXCEPTIONS, full.exceptions);
  replaceArray(MEN_MENU, withPhotos("men", full.menMenu));
  replaceArray(WOMEN_MENU, withPhotos("women", full.womenMenu));
  OPEN_MINUTE = full.openMinute;
  CLOSE_MINUTE = Math.max(full.closeMinute, full.openMinute + SLOT_MINUTES);
  TOTAL_SLOTS = (CLOSE_MINUTE - OPEN_MINUTE) / SLOT_MINUTES;
  ACCEPTING_BOOKINGS = full.accepting;
  MAX_ADVANCE_DAYS = full.maxAdvanceDays;
  applyContent(full.content);
}
