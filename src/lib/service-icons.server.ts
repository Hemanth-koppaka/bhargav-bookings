// Each service/category record owns its icon reference, stored by record id in
// site_settings ("service_icons": { "svc:<id>": url, "cat:<id>": url }).
// Records without one are seeded once from their own gender's file; after that
// the icon is read only by id. A record with no icon keeps an empty value and
// shows the neutral placeholder: never the other gender's icon.
import type { SupabaseClient } from "@supabase/supabase-js";
import { SEED_CATEGORY_ICON, SEED_SERVICE_ICON, iconSlug, type Gender } from "./service-icons";

export const ICONS_KEY = "service_icons";
type Rec = { id: string; name: string; gender: string };

const seed = (table: Record<Gender, Record<string, string>>, gender: string, name: string) =>
  gender === "men" || gender === "women" ? (table[gender][iconSlug(name)] ?? "") : "";

/** The icon map for these records, giving any new record its own icon (saved once). */
export async function recordIcons(
  sb: SupabaseClient,
  stored: unknown,
  cats: Rec[],
  svcs: Rec[],
): Promise<Record<string, string>> {
  const map: Record<string, string> = { ...((stored as Record<string, string> | null) ?? {}) };
  let added = 0;
  for (const c of cats)
    if (!(`cat:${c.id}` in map)) {
      map[`cat:${c.id}`] = seed(SEED_CATEGORY_ICON, c.gender, c.name);
      added++;
    }
  for (const s of svcs)
    if (!(`svc:${s.id}` in map)) {
      map[`svc:${s.id}`] = seed(SEED_SERVICE_ICON, s.gender, s.name);
      added++;
    }
  if (added) {
    const { error } = await sb
      .from("site_settings")
      .upsert({ key: ICONS_KEY, value: map as never });
    if (error) console.error("service icons: couldn't save", error.message);
  }
  return map;
}
