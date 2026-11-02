// Brand marks and Bhargav's portraits. Service and category icons are owned by
// each record (see service-icons.ts): they are never looked up by name here.

const I = (n: string) => `/icons/${n}.webp`;

/** Bhargav's Signature mark (HB crown), used for the Signature panel. */
export const SIGNATURE_MARK = I("svc-signature");

/** High-resolution HB crown emblem (uploaded original), used in the Signature panel. */
export const SIGNATURE_EMBLEM_HD = "/brand/hb-emblem.webp";

/** Bhargav's portrait (also used wherever the founder is shown on a booking). */
export const BHARGAV_PORTRAIT = "/team/bhargav-portrait.webp";

/** Full-length portrait shown in the large panel while his Signature is chosen. */
export const BHARGAV_FULL = "/team/bhargav.webp";

export const isSignature = (s: { name: string }) => /bhargav.?s signature/i.test(s.name);
