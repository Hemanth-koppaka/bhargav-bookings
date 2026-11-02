// Server-only: builds the live salon configuration (menu, hours, breaks,
// closures, media) from the database for every screen and the booking engine.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadStore, stable, storeFromValue } from "./staff-store.server";

async function db() {
  return supabaseAdmin;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const toMin = (t: string | null | undefined) => {
  if (!t) return undefined;
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

type PersistedBreaks = Record<string, { start: string; end: string }[]>;

/** Builds the full salon configuration from the online tables. */
export async function loadConfig() {
  const sb = await db();
  const today = new Date().toISOString().slice(0, 10);
  const [cats, svcs, hours, exc, settings, legacy] = await Promise.all([
    sb.from("service_categories").select("*").eq("active", true).order("display_order"),
    sb.from("services").select("*").eq("active", true).order("display_order"),
    sb.from("opening_hours").select("*"),
    sb.from("opening_exceptions").select("*").gte("date", today),
    sb.from("site_settings").select("key, value"),
    sb.from("salon_config").select("data").eq("id", 1).maybeSingle(),
  ]);
  const err = cats.error || svcs.error || hours.error || exc.error || settings.error;
  if (err) throw new Error("Salon data unavailable");
  const set = Object.fromEntries((settings.data ?? []).map((r) => [r.key, r.value])) as Record<
    string,
    Record<string, unknown>
  >;
  const hoursSetting = (set["business_hours"] ?? {}) as { breaksByDay?: PersistedBreaks };
  // Until the salon saves its own break periods, every open day has lunch 1–2 PM.
  const breaksByDay: PersistedBreaks =
    hoursSetting.breaksByDay ??
    Object.fromEntries(
      [0, 1, 2, 3, 4, 5, 6].map((d) => [String(d), [{ start: "13:00", end: "14:00" }]]),
    );
  const media = (set["media"] ?? {}) as Record<string, string>;
  // every record's own icon (men and women are separate records with separate icons)
  const { recordIcons } = await import("./service-icons.server");
  const icons = await recordIcons(
    sb as never,
    set["service_icons"],
    (cats.data ?? []).map((c) => ({ id: c.id, name: c.name, gender: c.gender })),
    (svcs.data ?? []).map((s) => ({ id: s.id, name: s.name, gender: s.gender })),
  );
  const menu = (g: string) =>
    (cats.data ?? [])
      .filter((c) => c.gender === g && !(c as Record<string, unknown>)["archived_at"])
      .map((c) => ({
        id: c.slug,
        title: c.name,
        blurb: c.description || undefined,
        icon: icons[`cat:${c.id}`] || undefined,
        photo:
          ((c as Record<string, unknown>)["image_url"] as string) ||
          media[`cat:${c.id}`] ||
          undefined,
        services: (svcs.data ?? [])
          // a category only ever holds its own gender's services
          .filter(
            (s) =>
              s.category_id === c.id &&
              s.gender === g &&
              !(s as Record<string, unknown>)["archived_at"],
          )
          .map((s) => ({
            id: s.id,
            name: s.name,
            note: s.description || undefined,
            price: s.price,
            from: s.price_from || undefined,
            slots: Math.max(1, Math.ceil(s.duration_minutes / 30)),
            minutes: s.duration_minutes,
            buffer: ((s as Record<string, unknown>)["buffer_minutes"] as number) ?? 0,
            featured: Boolean((s as Record<string, unknown>)["featured"]) || undefined,
            icon: icons[`svc:${s.id}`] || undefined,
            photo:
              ((s as Record<string, unknown>)["image_url"] as string) ||
              media[`svc:${s.id}`] ||
              undefined,
          })),
      }))
      .filter((c) => c.services.length > 0);
  // Staff lives alongside the config but is for the console only.
  const { staff: _staff, ...legacyData } = (legacy.data?.data ?? {}) as Record<string, unknown>;
  const booking = set["booking"] ?? {};
  const config: Record<string, unknown> = {
    ...legacyData,
    business: set["business"] ?? legacyData["business"],
    accepting: booking["accepting"] ?? legacyData["accepting"] ?? true,
    maxAdvanceDays: booking["maxAdvanceDays"] ?? legacyData["maxAdvanceDays"] ?? 56,
    // published wording only; drafts stay in the console
    content: set["content"] ?? null,
    sound: set["sound"] ?? null,
    exceptions: Object.fromEntries(
      (exc.data ?? []).map((e) => [
        e.date,
        {
          closed: !e.is_open,
          open: toMin(e.opening_time),
          close: toMin(e.closing_time),
          note: e.note,
        },
      ]),
    ),
  };
  if ((hours.data ?? []).length === 7) {
    const order = [1, 2, 3, 4, 5, 6, 0];
    config["week"] = order.map((d) => {
      const h = hours.data!.find((x) => x.day_of_week === d)!;
      const breaks = (breaksByDay[String(d)] ?? [])
        .map((b) => ({ start: toMin(b.start), end: toMin(b.end) }))
        .filter(
          (b): b is { start: number; end: number } =>
            b.start != null && b.end != null && b.end > b.start,
        );
      return {
        day: DAYS[d],
        closed: !h.is_open,
        open: toMin(h.opening_time),
        close: toMin(h.closing_time),
        breaks,
      };
    });
  }
  // stylists guests can choose (multi-stylist) and whole-day salon closures
  // (the store came with the settings read above; only a first visit seeds it)
  const store = storeFromValue(set["staff_store"]) ?? (await loadStore());
  const [st, ss, cl] = await Promise.all([
    stable("staff", store)
      .select("id, name, gender, specialties, bookable, active, archived_at, display_order")
      .order("display_order"),
    stable("staff_services", store).select("staff_id, service_id"),
    stable("salon_closures", store).select(
      "start_date, end_date, start_minute, reason, reopened_at",
    ),
  ]);
  if (!st.error) {
    const can = new Map<string, string[]>();
    for (const r of (ss.data ?? []) as { staff_id: string; service_id: string }[])
      can.set(r.staff_id, [...(can.get(r.staff_id) ?? []), r.service_id]);
    config["stylists"] = ((st.data ?? []) as Record<string, unknown>[])
      .filter((r) => r["active"] && r["bookable"] && !r["archived_at"])
      .map((r) => ({
        id: r["id"],
        name: r["name"],
        gender: r["gender"] ?? "",
        specialties: r["specialties"] ?? "",
        services: can.get(r["id"] as string) ?? [],
      }));
  }
  if (!cl.error) {
    config["closures"] = ((cl.data ?? []) as Record<string, unknown>[])
      .filter(
        (r) =>
          !r["reopened_at"] &&
          r["start_minute"] == null &&
          (!r["end_date"] || (r["end_date"] as string) >= today),
      )
      .map((r) => ({
        start: r["start_date"],
        end: r["end_date"] ?? null,
        reason: r["reason"] ?? "",
      }));
  }
  const men = menu("men");
  const women = menu("women");
  if (men.length) config["menMenu"] = men;
  if (women.length) config["womenMenu"] = women;
  return config;
}
