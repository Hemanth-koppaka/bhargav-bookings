// Each stylist's photo, for quick recognition in the console (and anywhere a
// stylist is shown). The salon can upload one per stylist in Admin → Staff
// (stored with the other salon media as "staff:<id>"); until then the known
// team photos are used, matched by name.
const DEFAULTS: [RegExp, string][] = [
  [/^bhargav\b/i, "/team/stylist-bhargav.webp"],
  [/\bneha\b/i, "/team/stylist-neha.webp"],
];

export const defaultStaffPhoto = (name: string) =>
  DEFAULTS.find(([re]) => re.test(name))?.[1] ?? null;

/** id → photo url (uploaded first, then the built-in one for that name). */
export async function staffPhotos(
  staff: { id: string; name: string }[],
): Promise<Record<string, string>> {
  const { supabaseAdmin: sb } = await import("@/integrations/supabase/client.server");
  const { data } = await sb.from("site_settings").select("value").eq("key", "media").maybeSingle();
  const media = ((data as { value?: Record<string, string> } | null)?.value ?? {}) as Record<
    string,
    string
  >;
  const out: Record<string, string> = {};
  for (const s of staff) {
    const url = media[`staff:${s.id}`] || defaultStaffPhoto(s.name);
    if (url) out[s.id] = url;
  }
  return out;
}
