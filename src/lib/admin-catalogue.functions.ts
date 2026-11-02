import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { DEFAULT_CONTENT, resolveContent, type SiteContent } from "./site-content";

// Phase 3: the catalogue (services and categories, including archived ones,
// ordering, duplicating) and the site wording (draft → preview → publish).
// Every call re-checks the admin session; every change is written to the
// activity log. Archiving never deletes: bookings keep their snapshots and
// anything archived can be restored.

const pin = z.string().max(512);

async function admin(token: string) {
  const { assertAdmin } = await import("./admin-auth.server");
  return assertAdmin(token);
}
const audit = async (e: Parameters<typeof import("./engine.server").audit>[0]) =>
  (await import("./engine.server")).audit(e);

type Row = Record<string, unknown>;

export type CatalogueCategory = {
  id: string;
  gender: "men" | "women";
  name: string;
  description: string;
  order: number;
  active: boolean;
  archived: boolean;
  photo: string | null;
  /** This record's own icon ("" = not set). */
  icon: string;
};
export type CatalogueService = {
  id: string;
  gender: "men" | "women";
  categoryId: string;
  name: string;
  description: string;
  minutes: number;
  buffer: number;
  price: number;
  from: boolean;
  featured: boolean;
  order: number;
  active: boolean;
  archived: boolean;
  photo: string | null;
  /** This record's own icon ("" = not set). Men and women never share one. */
  icon: string;
  /** Active bookings from today onwards that include this service. */
  upcoming: number;
};

export const adminCatalogue = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ pin }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin(data.pin);
    const E = await import("./engine.server");
    const today = E.salonNow().iso;
    const [c, s, st, bk] = await Promise.all([
      sb.from("service_categories").select("*").order("display_order"),
      sb.from("services").select("*").order("display_order"),
      sb.from("site_settings").select("key, value").in("key", ["media", "service_icons"]),
      sb
        .from("bookings")
        .select("service_ids, status, meta")
        .gte("date", today)
        .neq("status", "cancelled"),
    ]);
    if (c.error || s.error) throw new Error("Couldn't load the menu");
    const media = ((st.data ?? []).find((x) => x.key === "media")?.value ?? {}) as Record<
      string,
      string
    >;
    const { recordIcons } = await import("./service-icons.server");
    const icons = await recordIcons(
      sb as never,
      (st.data ?? []).find((x) => x.key === "service_icons")?.value,
      ((c.data ?? []) as Row[]).map((r) => ({
        id: r["id"] as string,
        name: r["name"] as string,
        gender: r["gender"] as string,
      })),
      ((s.data ?? []) as Row[]).map((r) => ({
        id: r["id"] as string,
        name: r["name"] as string,
        gender: r["gender"] as string,
      })),
    );
    const upcoming: Record<string, number> = {};
    for (const b of (bk.data ?? []) as Row[]) {
      const status = (b["meta"] as { status?: string } | null)?.status;
      if (status === "cancelled" || status === "no-show" || status === "completed") continue;
      for (const id of (b["service_ids"] as string[] | null) ?? [])
        upcoming[id] = (upcoming[id] ?? 0) + 1;
    }
    return {
      categories: ((c.data ?? []) as Row[]).map((r): CatalogueCategory => ({
        id: r["id"] as string,
        gender: r["gender"] as "men",
        name: r["name"] as string,
        description: (r["description"] as string) ?? "",
        order: r["display_order"] as number,
        active: r["active"] as boolean,
        archived: Boolean(r["archived_at"]),
        photo: (r["image_url"] as string) || media[`cat:${r["id"]}`] || null,
        icon: icons[`cat:${r["id"]}`] ?? "",
      })),
      services: ((s.data ?? []) as Row[]).map((r): CatalogueService => ({
        id: r["id"] as string,
        gender: r["gender"] as "men",
        categoryId: r["category_id"] as string,
        name: r["name"] as string,
        description: (r["description"] as string) ?? "",
        minutes: r["duration_minutes"] as number,
        buffer: (r["buffer_minutes"] as number) ?? 0,
        price: r["price"] as number,
        from: Boolean(r["price_from"]),
        featured: Boolean(r["featured"]),
        order: r["display_order"] as number,
        active: r["active"] as boolean,
        archived: Boolean(r["archived_at"]),
        photo: (r["image_url"] as string) || media[`svc:${r["id"]}`] || null,
        icon: icons[`svc:${r["id"]}`] ?? "",
        upcoming: upcoming[r["id"] as string] ?? 0,
      })),
    };
  });

/** Archive (hide everywhere, keep history) or restore a service or category. */
export const adminArchiveItem = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        pin,
        kind: z.enum(["service", "category"]),
        id: z.string().max(80),
        restore: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const sb = await admin(data.pin);
    const table = data.kind === "service" ? "services" : "service_categories";
    const { data: row } = await sb.from(table).select("name").eq("id", data.id).maybeSingle();
    if (!row) return { ok: false as const, error: "Not found." };
    const { error } = await sb
      .from(table)
      .update({ archived_at: data.restore ? null : new Date().toISOString() } as never)
      .eq("id", data.id);
    if (error)
      return {
        ok: false as const,
        error: "Couldn't update. Has the latest database update been applied?",
      };
    await audit({
      action: `${data.kind}.${data.restore ? "restore" : "archive"}`,
      entity: data.kind,
      entityId: data.id,
      summary: `${data.restore ? "Restored" : "Archived"} ${data.kind} ${(row as Row)["name"]}`,
    });
    return { ok: true as const };
  });

/** Saves a new order for services within a category, or for categories. */
export const adminReorder = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        pin,
        kind: z.enum(["service", "category"]),
        ids: z.array(z.string().max(80)).min(1).max(200),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const sb = await admin(data.pin);
    const table = data.kind === "service" ? "services" : "service_categories";
    const results = await Promise.all(
      data.ids.map((id, i) =>
        sb
          .from(table)
          .update({ display_order: i } as never)
          .eq("id", id),
      ),
    );
    if (results.some((r) => r.error))
      return { ok: false as const, error: "Couldn't save the new order." };
    await audit({
      action: `${data.kind}.reorder`,
      entity: data.kind,
      summary: `Reordered ${data.ids.length} ${data.kind === "service" ? "services" : "categories"}`,
    });
    return { ok: true as const };
  });

/** Copies a service (hidden from guests until it's edited and shown). */
export const adminDuplicateService = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ pin, id: z.string().max(80) }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin(data.pin);
    const { data: src } = await sb.from("services").select("*").eq("id", data.id).maybeSingle();
    if (!src) return { ok: false as const, error: "Service not found." };
    const r = src as Row;
    const id = `${String(r["gender"])[0]}-copy-${Math.random().toString(36).slice(2, 8)}`;
    const { created_at: _c, updated_at: _u, archived_at: _a, ...rest } = r;
    const { error } = await sb.from("services").insert({
      ...rest,
      id,
      name: `${r["name"]} (copy)`,
      active: false,
      featured: false,
      display_order: (r["display_order"] as number) + 1,
    } as never);
    if (error) return { ok: false as const, error: "Couldn't duplicate." };
    await audit({
      action: "service.duplicate",
      entity: "service",
      entityId: id,
      summary: `Duplicated ${r["name"]}`,
    });
    return { ok: true as const, id };
  });

/* ── site wording: draft → preview → publish ─────────────────── */

const text = (max: number) => z.string().max(max);
const contentInput = z.object({
  announcement: z.object({ enabled: z.boolean(), text: text(200) }),
  home: z.object({
    headline: text(40),
    headlineAccent: text(40),
    intro: text(200),
    introLong: text(320),
    ctaLabel: text(32),
  }),
  policies: z.object({ changes: text(240), payment: text(160), lateness: text(240) }),
});

export const adminGetSite = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ pin }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin(data.pin);
    const { data: rows } = await sb
      .from("site_settings")
      .select("key, value, updated_at")
      .in("key", ["content", "content_draft"]);
    const get = (k: string) =>
      (rows ?? []).find((r) => r.key === k) as { value: unknown; updated_at?: string } | undefined;
    const live = resolveContent(get("content")?.value);
    const draftRow = get("content_draft");
    return {
      live,
      draft: draftRow ? resolveContent(draftRow.value) : live,
      hasDraft:
        Boolean(draftRow) &&
        JSON.stringify(resolveContent(draftRow!.value)) !== JSON.stringify(live),
      defaults: DEFAULT_CONTENT,
      publishedAt: get("content")?.updated_at ?? null,
    };
  });

export const adminSaveSiteDraft = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ pin, content: contentInput }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin(data.pin);
    const { error } = await sb
      .from("site_settings")
      .upsert({ key: "content_draft", value: data.content as never });
    if (error) return { ok: false as const, error: "Couldn't save the draft." };
    return { ok: true as const };
  });

const flat = (c: SiteContent) => ({
  announcement: c.announcement.enabled ? c.announcement.text : "(off)",
  headline: `${c.home.headline} ${c.home.headlineAccent}`,
  intro: c.home.intro,
  "intro (laptop)": c.home.introLong,
  button: c.home.ctaLabel,
  "change policy": c.policies.changes,
  "payment policy": c.policies.payment,
  "lateness policy": c.policies.lateness,
});

export const adminPublishSite = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ pin, content: contentInput }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin(data.pin);
    const { data: cur } = await sb
      .from("site_settings")
      .select("value")
      .eq("key", "content")
      .maybeSingle();
    const before = resolveContent(cur?.value);
    const after = resolveContent(data.content);
    const { error } = await sb.from("site_settings").upsert({
      key: "content",
      value: data.content as never,
      updated_at: new Date().toISOString(),
    });
    if (error) return { ok: false as const, error: "Couldn't publish." };
    await sb.from("site_settings").delete().eq("key", "content_draft");
    const b = flat(before);
    const a = flat(after);
    const changed = (Object.keys(a) as (keyof typeof a)[]).filter((k) => a[k] !== b[k]);
    await audit({
      action: "content.publish",
      entity: "content",
      summary: changed.length
        ? `Published site wording: ${changed.join(", ")}`
        : "Published site wording (no changes)",
      before: Object.fromEntries(changed.map((k) => [k, b[k]])),
      after: Object.fromEntries(changed.map((k) => [k, a[k]])),
    });
    return { ok: true as const };
  });

export const adminDiscardSiteDraft = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ pin }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin(data.pin);
    await sb.from("site_settings").delete().eq("key", "content_draft");
    return { ok: true as const };
  });
