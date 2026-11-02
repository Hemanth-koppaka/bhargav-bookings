// Who may perform a service. Most services use every qualified stylist
// ("any"); some prefer one stylist, e.g. Bhargav's Signature → Bhargav. A
// preferred service is booked with that stylist unless the guest explicitly
// chooses another stylist from its fallback pool (never substituted silently).

/** As configured by the salon (Admin → Services), per service record id. */
export type ServiceRuleSetting = { mode: "any" } | { mode: "preferred"; stylist: string };

/** As resolved for booking: the preferred stylist and who may stand in. */
export type ServiceRule = { preferred: string; preferredName: string; fallback: string[] };

export const SIGNATURE_RE = /bhargav.?s signature/i;

/** The preferred stylist across these services (first preferred rule wins). */
export function preferredFor(serviceIds: string[], rules: Record<string, ServiceRule>): ServiceRule | null {
  for (const id of serviceIds) if (rules[id]) return rules[id];
  return null;
}
