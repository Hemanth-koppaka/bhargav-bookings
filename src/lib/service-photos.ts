// Built-in photos for services and categories (from the salon's own work).
// Matched by audience + service name so they work with any database ids.
// A photo uploaded in Admin → Menu always takes priority.

const key = (audience: string, name: string) =>
  `${audience}:${name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()}`;

const SERVICES: Record<string, string> = {
  [key("men", "Basic Haircut")]: "/services/men-haircut.webp",
  [key("men", "Beard Trim")]: "/services/men-beard.webp",
  [key("men", "Bhargav's Signature")]: "/team/bhargav-portrait.webp",
  [key("women", "Bhargav's Signature")]: "/team/bhargav-portrait.webp",
  [key("men", "Wash and Blast Dry")]: "/services/men-wash-blowdry.webp",
  [key("men", "Highlights")]: "/services/men-highlights.webp",
  [key("men", "Global Colour")]: "/services/men-global-colour.webp",
  [key("women", "Highlights")]: "/services/women-highlights.webp",
};

const CATEGORIES: Record<string, string> = {
  [key("men", "Hairstyles")]: "/services/men-hairstyles.webp",
  [key("men", "Colours")]: "/services/men-highlights.webp",
  [key("women", "Colours")]: "/services/women-highlights.webp",
};

export const builtInServicePhoto = (audience: string, name: string) =>
  SERVICES[key(audience, name)];
export const builtInCategoryPhoto = (audience: string, title: string) =>
  CATEGORIES[key(audience, title)];

/** Bhargav's portrait (also used wherever the founder is shown on a booking). */
export const BHARGAV_PORTRAIT = "/team/bhargav-portrait.webp";

/** Full-length portrait shown in the large panel while his Signature is chosen. */
export const BHARGAV_FULL = "/team/bhargav.webp";

export const isSignature = (s: { name: string }) => /bhargav.?s signature/i.test(s.name);
