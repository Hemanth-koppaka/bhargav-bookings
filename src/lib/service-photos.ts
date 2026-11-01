// Built-in icons for services and categories (the salon's own icon set) and
// Bhargav's portraits. Matched by audience + name so they work with any
// database ids. A photo uploaded in Admin → Services always takes priority.

const key = (audience: string, name: string) =>
  `${audience}:${name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()}`;

// The salon's own icon set (public/icons): one per service where the design has
// one, otherwise the category's icon. Shown icon-only on the existing tiles.
const I = (n: string) => `/icons/${n}.webp`;
const SERVICE_ICONS: Record<string, string> = {
  [key("men", "Basic Haircut")]: I("svc-basic-haircut"),
  [key("men", "Beard Trim")]: I("svc-beard-trim"),
  [key("men", "Shave")]: I("svc-shave"),
  [key("men", "Bhargav's Signature")]: I("svc-signature"),
  [key("men", "Kids (U-14)")]: I("svc-kids-boy"),
  [key("men", "Kids")]: I("svc-kids-boy"),
  [key("men", "Wash and Blast Dry")]: I("svc-wash-blast"),
  [key("men", "Wash & Blast Dry")]: I("svc-wash-blast"),
  [key("men", "Root Touchup (Ammonia)")]: I("svc-root-ammonia"),
  [key("men", "Root Touchup (Ammonia Free)")]: I("svc-root-ammonia-free"),
  [key("men", "Beard / Moustache Colour")]: I("svc-beard-colour"),
  [key("men", "Highlights")]: I("svc-highlights"),
  [key("men", "Global Colour")]: I("svc-global"),
  [key("women", "Fringe Cut / Bangs")]: I("svc-fringe"),
  [key("women", "Cut & Styling")]: I("svc-cut-styling"),
  [key("women", "Bhargav's Signature")]: I("svc-signature-w"),
  [key("women", "Blow Dry Straight")]: I("svc-blowdry-straight"),
  [key("women", "Blow Dry Curls")]: I("svc-blowdry-curls"),
  [key("women", "Ironing / Tonging")]: I("svc-ironing"),
  [key("women", "Kids (U-14)")]: I("svc-kids-girl"),
  [key("women", "Wash & Blast Dry")]: I("svc-wash-blast-w"),
  [key("women", "Wash, Conditioning & Blow Dry")]: I("svc-wash-condition"),
  [key("women", "Root Touchup (Ammonia)")]: I("svc-root-ammonia"),
  [key("women", "Root Touchup (Ammonia Free)")]: I("svc-root-ammonia-free"),
  [key("women", "Global (Ammonia)")]: I("svc-global"),
  [key("women", "Global (Ammonia Free)")]: I("svc-global"),
  [key("women", "Highlights")]: I("svc-highlights"),
  [key("women", "Advance Colour")]: I("svc-advance-colour"),
};

/** Category icons, matched by title (any audience). */
const CATEGORY_ICONS: Record<string, string> = {
  hairstyles: I("cat-hairstyles"),
  colours: I("cat-colours"),
  colors: I("cat-colours"),
  "hair care": I("cat-hair-care"),
  "hair treatments": I("cat-hair-treatments"),
  "glow and radiance": I("cat-glow"),
  "beauty services": I("cat-beauty"),
  reflexology: I("cat-reflexology"),
  maquillage: I("cat-makeup"),
  makeup: I("cat-makeup"),
  "pre bridal groom packages": I("cat-bridal"),
  "pre bridal and groom packages": I("cat-bridal"),
  kids: I("cat-kids"),
  other: I("cat-other"),
  "other services": I("cat-other"),
};
const catKey = (title: string) => key("", title).slice(1);

export const builtInCategoryIcon = (title: string) => CATEGORY_ICONS[catKey(title)] ?? I("cat-other");
/** Icons for families of services, matched by how the name starts. */
const PREFIX_ICONS: [RegExp, (audience: string) => string][] = [
  [/^threading\b/i, () => I("svc-facial-hair")],
  [/^waxing\b/i, () => I("svc-waxing")],
  [/^straightening|^smoothening/i, () => I("svc-straightening")],
  [/^keratin|^botox/i, () => I("svc-keratin")],
  [/^treatment\b/i, (a) => I(a === "women" ? "svc-treatment-women" : "svc-treatment-men")],
];

export const builtInServiceIcon = (audience: string, name: string, categoryTitle?: string) =>
  SERVICE_ICONS[key(audience, name)] ??
  PREFIX_ICONS.find(([re]) => re.test(name.trim()))?.[1](audience) ??
  (categoryTitle ? builtInCategoryIcon(categoryTitle) : undefined);

/** Bhargav's Signature mark (HB crown), used for the Signature panel. */
export const SIGNATURE_MARK = I("svc-signature");

/** Bhargav's portrait (also used wherever the founder is shown on a booking). */
export const BHARGAV_PORTRAIT = "/team/bhargav-portrait.webp";

/** Full-length portrait shown in the large panel while his Signature is chosen. */
export const BHARGAV_FULL = "/team/bhargav.webp";

export const isSignature = (s: { name: string }) => /bhargav.?s signature/i.test(s.name);
