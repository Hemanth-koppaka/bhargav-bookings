import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Admin-only editing of salon content. Every call re-checks the admin session.

const audit = async (e: Parameters<typeof import("./engine.server").audit>[0]) => {
  const E = await import("./engine.server");
  await E.audit(e);
};

// `pin` carries the admin session token issued by adminSignIn.
async function assertPin(token: string) {
  const { assertAdmin } = await import("./admin-auth.server");
  return assertAdmin(token);
}

const pin = z.string().max(512);
const gender = z.enum(["men", "women"]);
const time = z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/);
const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "item";
const rid = () => Math.random().toString(36).slice(2, 7);

export type AdminCategory = {
  id: string; gender: "men" | "women"; name: string; description: string; order: number; active: boolean;
};
export type AdminService = {
  id: string; gender: "men" | "women"; categoryId: string; name: string; description: string;
  minutes: number; price: number; from: boolean; order: number; active: boolean;
};
export type AdminHours = { day: number; open: boolean; from: string; to: string };
export type AdminException = { date: string; open: boolean; from: string | null; to: string | null; note: string };

export const adminGetContent = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ pin }).parse(d))
  .handler(async ({ data }) => {
    const sb = await assertPin(data.pin);
    const [c, s, h, e, st] = await Promise.all([
      sb.from("service_categories").select("*").order("display_order"),
      sb.from("services").select("*").order("display_order"),
      sb.from("opening_hours").select("*").order("day_of_week"),
      sb.from("opening_exceptions").select("*").gte("date", new Date().toISOString().slice(0, 10)).order("date"),
      sb.from("site_settings").select("key, value"),
    ]);
    return {
      categories: (c.data ?? []).map((r): AdminCategory => ({
        id: r.id, gender: r.gender as "men", name: r.name, description: r.description,
        order: r.display_order, active: r.active,
      })),
      services: (s.data ?? []).map((r): AdminService => ({
        id: r.id, gender: r.gender as "men", categoryId: r.category_id, name: r.name,
        description: r.description, minutes: r.duration_minutes, price: r.price,
        from: r.price_from, order: r.display_order, active: r.active,
      })),
      hours: (h.data ?? []).map((r): AdminHours => ({
        day: r.day_of_week, open: r.is_open, from: r.opening_time.slice(0, 5), to: r.closing_time.slice(0, 5),
      })),
      exceptions: (e.data ?? []).map((r): AdminException => ({
        date: r.date, open: r.is_open, from: r.opening_time?.slice(0, 5) ?? null,
        to: r.closing_time?.slice(0, 5) ?? null, note: r.note,
      })),
      businessJson: JSON.stringify(
        (st.data ?? []).find((x) => x.key === "business")?.value ?? {},
      ),
      mediaJson: JSON.stringify((st.data ?? []).find((x) => x.key === "media")?.value ?? {}),
    };
  });

export const adminSaveCategory = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({
      pin,
      id: z.string().max(60).optional(),
      gender,
      name: z.string().trim().min(1).max(80),
      description: z.string().max(400),
      order: z.number().int().min(0).max(999),
      active: z.boolean(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const sb = await assertPin(data.pin);
    const row = {
      gender: data.gender, name: data.name, description: data.description,
      display_order: data.order, active: data.active,
    };
    if (data.id) {
      const { error } = await sb.from("service_categories").update(row).eq("id", data.id);
      if (error) throw new Error("Couldn't save category");
    } else {
      const s = slug(data.name) + "-" + rid();
      const { error } = await sb.from("service_categories").insert({ ...row, id: `${data.gender}-${s}`, slug: s });
      if (error) throw new Error("Couldn't add category");
    }
    await audit({ action: data.id ? "category.update" : "category.create", entity: "category", entityId: data.id ?? "", summary: `${data.id ? "Updated" : "Added"} category ${data.name}`, after: row });
    return { ok: true };
  });

export const adminSaveService = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({
      pin,
      id: z.string().max(80).optional(),
      categoryId: z.string().max(60),
      name: z.string().trim().min(1).max(120),
      description: z.string().max(1000),
      minutes: z.number().int().min(5).max(600).multipleOf(5),
      price: z.number().int().min(0).max(1_000_000),
      from: z.boolean(),
      order: z.number().int().min(0).max(999),
      active: z.boolean(),
      buffer: z.number().int().min(0).max(120).optional(),
      featured: z.boolean().optional(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const sb = await assertPin(data.pin);
    const { data: before } = data.id ? await sb.from("services").select("*").eq("id", data.id).maybeSingle() : { data: null };
    const { data: cat } = await sb.from("service_categories").select("gender").eq("id", data.categoryId).maybeSingle();
    if (!cat) throw new Error("Category not found");
    const row = {
      gender: cat.gender, category_id: data.categoryId, name: data.name, description: data.description,
      duration_minutes: data.minutes, price: data.price, price_from: data.from,
      display_order: data.order, active: data.active,
    };
    const extra = {
      ...(data.buffer != null ? { buffer_minutes: data.buffer } : {}),
      ...(data.featured != null ? { featured: data.featured } : {}),
    };
    const id = data.id ?? `${cat.gender[0]}-${slug(data.name)}-${rid()}`;
    const write = (r: object) =>
      data.id ? sb.from("services").update(r as never).eq("id", id) : sb.from("services").insert({ ...r, id } as never);
    let { error } = await write({ ...row, ...extra });
    if (error && Object.keys(extra).length && /column/i.test(error.message)) ({ error } = await write(row));
    if (error) throw new Error("Couldn't save service");
    const changes: string[] = [];
    const b = before as Record<string, unknown> | null;
    if (b) {
      if (b["price"] !== data.price) changes.push(`price ₹${b["price"]} → ₹${data.price}`);
      if (b["duration_minutes"] !== data.minutes) changes.push(`duration ${b["duration_minutes"]} → ${data.minutes} min`);
      if (b["active"] !== data.active) changes.push(data.active ? "shown to guests" : "hidden from guests");
      if (data.buffer != null && (b["buffer_minutes"] ?? 0) !== data.buffer) changes.push(`buffer ${b["buffer_minutes"] ?? 0} → ${data.buffer} min`);
      if (b["name"] !== data.name) changes.push(`renamed from "${b["name"]}"`);
    }
    await audit({
      action: data.id ? "service.update" : "service.create",
      entity: "service",
      entityId: id,
      summary: `${data.name}${changes.length ? ": " + changes.join(", ") : data.id ? " updated" : " added"}`,
      before: b,
      after: { ...row, ...extra },
    });
    return { ok: true, id };
  });

export const adminSaveHours = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({
      pin,
      hours: z.array(z.object({ day: z.number().int().min(0).max(6), open: z.boolean(), from: time, to: time })).length(7),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const sb = await assertPin(data.pin);
    for (const h of data.hours) {
      if (h.open && h.to <= h.from) throw new Error("Closing time must be after opening time");
    }
    const { error } = await sb.from("opening_hours").upsert(
      data.hours.map((h) => ({ day_of_week: h.day, is_open: h.open, opening_time: h.from, closing_time: h.to })),
    );
    if (error) throw new Error("Couldn't save hours");
    await audit({ action: "hours.update", entity: "hours", summary: "Updated opening hours", after: data.hours });
    return { ok: true };
  });

export const adminSaveException = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({
      pin,
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      remove: z.boolean().optional(),
      open: z.boolean(),
      from: time.nullable(),
      to: time.nullable(),
      note: z.string().max(200),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const sb = await assertPin(data.pin);
    if (data.remove) {
      await sb.from("opening_exceptions").delete().eq("date", data.date);
      await audit({ action: "closure.remove", entity: "date", entityId: data.date, summary: `Removed special hours for ${data.date}` });
      return { ok: true };
    }
    const { error } = await sb.from("opening_exceptions").upsert({
      date: data.date, is_open: data.open,
      opening_time: data.open ? data.from : null, closing_time: data.open ? data.to : null, note: data.note,
    });
    if (error) throw new Error("Couldn't save date");
    await audit({
      action: data.open ? "date.special_hours" : "date.close",
      entity: "date",
      entityId: data.date,
      summary: data.open ? `Special hours on ${data.date}: ${data.from}–${data.to}` : `Closed ${data.date}${data.note ? ` (${data.note})` : ""}`,
      reason: data.note,
    });
    return { ok: true };
  });

export const adminSaveBusiness = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({
      pin,
      business: z.object({
        brand: z.string().trim().min(1).max(80),
        name: z.string().trim().min(1).max(120),
        tagline: z.string().max(120),
        locationShort: z.string().max(160),
        address: z.string().max(400),
        mapsQuery: z.string().max(400),
        phones: z.array(z.string().trim().max(20)).max(4),
        facilities: z.array(z.string().trim().max(80)).max(20),
        lastSlot: z.string().max(60),
      }).partial(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const sb = await assertPin(data.pin);
    const { data: cur } = await sb.from("site_settings").select("value").eq("key", "business").maybeSingle();
    const value = { ...((cur?.value as object) ?? {}), ...data.business };
    const { error } = await sb.from("site_settings").upsert({ key: "business", value });
    if (error) throw new Error("Couldn't save details");
    await audit({ action: "studio.update", entity: "studio", summary: "Updated studio details", before: cur?.value ?? null, after: value });
    return { ok: true };
  });
