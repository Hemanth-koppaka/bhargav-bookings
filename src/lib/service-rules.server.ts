// Resolves each service's stylist rule from the salon's settings
// ("service_rules": { [serviceId]: { mode, stylist } }) and the staff store.
// Defaults: Bhargav's Signature prefers Bhargav; everything else is "any".
// The fallback pool = other active stylists who already offer a service in the
// same category of the same gender's menu (the hairstylists for that menu).
import { supabaseAdmin as sb } from "@/integrations/supabase/client.server";
import { MEN_MENU, WOMEN_MENU } from "./salon";
import { SIGNATURE_RE, type ServiceRule, type ServiceRuleSetting } from "./service-rules";
import type { loadStore } from "./staff-store.server";

type Store = Awaited<ReturnType<typeof loadStore>>;
type Row = Record<string, unknown>;

export async function loadRuleSettings(): Promise<Record<string, ServiceRuleSetting>> {
  const { data } = await sb.from("site_settings").select("value").eq("key", "service_rules").maybeSingle();
  return ((data?.value ?? {}) as Record<string, ServiceRuleSetting>) || {};
}

type Menu = { services: { id: string; name: string }[] }[];

/** `menus` defaults to the salon's live menus (already applied on the server). */
export function resolveRules(
  store: Store,
  settings: Record<string, ServiceRuleSetting>,
  menus: Menu[] = [MEN_MENU, WOMEN_MENU],
): Record<string, ServiceRule> {
  const staff = (store.staff as Row[])
    .filter((r) => r["active"] !== false && !r["archived_at"])
    .sort((a, b) => ((a["display_order"] as number) ?? 0) - ((b["display_order"] as number) ?? 0));
  const byId = new Map(staff.map((r) => [r["id"] as string, r]));
  const bhargav = staff.find((r) => /^bhargav\b/i.test(String(r["name"] ?? "")));
  const offers = new Map<string, Set<string>>();
  for (const r of store.staff_services as Row[]) {
    const k = r["staff_id"] as string;
    if (!offers.has(k)) offers.set(k, new Set());
    offers.get(k)!.add(r["service_id"] as string);
  }
  const out: Record<string, ServiceRule> = {};
  for (const menu of menus)
    for (const cat of menu)
      for (const svc of cat.services) {
        const set = settings[svc.id];
        const preferredId =
          set?.mode === "preferred" ? set.stylist : set?.mode === "any" ? null : SIGNATURE_RE.test(svc.name) ? ((bhargav?.["id"] as string) ?? null) : null;
        const preferred = preferredId ? byId.get(preferredId) : undefined;
        if (!preferred) continue; // no (valid) preferred stylist: normal multi-stylist rules
        const siblings = cat.services.filter((x) => x.id !== svc.id).map((x) => x.id);
        const fallback = staff
          .filter((r) => r["id"] !== preferredId && r["bookable"] !== false)
          .filter((r) => siblings.some((id) => offers.get(r["id"] as string)?.has(id)))
          .map((r) => r["id"] as string);
        out[svc.id] = { preferred: preferredId!, preferredName: String(preferred["name"] ?? ""), fallback };
      }
  return out;
}
