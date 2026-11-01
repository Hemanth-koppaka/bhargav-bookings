// Which stylist a booking belongs to (safe to import anywhere).
type Row = Record<string, unknown>;

/* ── bookings: which stylist ──────────────────────────────────── */

// Bookings remember their stylist in `meta` (works on every database); the
// staff_id/staff_choice columns are used too where they exist.
export const staffIdOf = (r: Row): string | null =>
  (r["staff_id"] as string | null | undefined) ?? ((r["meta"] as Row | null)?.["staff_id"] as string | undefined) ?? null;
export const staffChoiceOf = (r: Row): "any" | "specific" =>
  ((r["staff_choice"] as string | undefined) ?? ((r["meta"] as Row | null)?.["staff_choice"] as string | undefined)) === "specific"
    ? "specific"
    : "any";
/** meta with the stylist written in. */
export const metaWithStaff = (meta: unknown, staffId: string | null, choice: "any" | "specific") => ({
  ...((meta as Row | null) ?? {}),
  staff_id: staffId,
  staff_choice: choice,
});

