// Words the salon can change without a developer: the homepage headline and
// introduction, an optional announcement line, and the booking policies shown
// to guests. The admin edits a draft, previews it, then publishes; guests only
// ever see the published copy. Anything left empty falls back to these defaults.

export type SiteContent = {
  announcement: { enabled: boolean; text: string };
  home: {
    /** First part of the headline, e.g. "Reserve". */
    headline: string;
    /** Second part, set in bronze italics, e.g. "your chair." */
    headlineAccent: string;
    /** Short line under the headline on phones. */
    intro: string;
    /** Longer line under the headline on laptops. */
    introLong: string;
    ctaLabel: string;
  };
  policies: {
    /** Shown on the review step and in Manage booking. */
    changes: string;
    payment: string;
    lateness: string;
  };
};

export const DEFAULT_CONTENT: SiteContent = {
  announcement: { enabled: false, text: "" },
  home: {
    headline: "Reserve",
    headlineAccent: "your chair.",
    intro:
      "Hair, beauty and makeover. Pick a time that's genuinely free — booked in under a minute.",
    introLong:
      "Hair, beauty and makeover by D. Bhargav. Choose a service, pick a time that is genuinely free, and you're booked.",
    ctaLabel: "Book an appointment",
  },
  policies: {
    changes: "Reschedule or cancel from Manage booking up to 2 hours before your appointment.",
    payment: "No payment is taken online.",
    lateness: "",
  },
};

/** Merges saved content over the defaults; blank fields keep the default wording. */
export function resolveContent(saved: unknown): SiteContent {
  const s = (saved ?? {}) as Partial<{ [K in keyof SiteContent]: Partial<SiteContent[K]> }>;
  const pick = <T extends Record<string, unknown>>(base: T, over: Partial<T> | undefined): T => {
    const out = { ...base };
    for (const k of Object.keys(base) as (keyof T)[]) {
      const v = over?.[k];
      if (typeof v === "boolean") out[k] = v as T[keyof T];
      else if (typeof v === "string" && (v.trim() || k === "lateness" || k === "text"))
        out[k] = v.trim() as T[keyof T];
    }
    return out;
  };
  return {
    announcement: pick(DEFAULT_CONTENT.announcement, s.announcement),
    home: pick(DEFAULT_CONTENT.home, s.home),
    policies: pick(DEFAULT_CONTENT.policies, s.policies),
  };
}

/** Live copy used by the guest pages (filled by applyConfig). */
export const CONTENT: SiteContent = structuredClone(DEFAULT_CONTENT);

export function applyContent(saved: unknown) {
  const next = resolveContent(saved);
  Object.assign(CONTENT.announcement, next.announcement);
  Object.assign(CONTENT.home, next.home);
  Object.assign(CONTENT.policies, next.policies);
}
