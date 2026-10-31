import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Admin operations that shape availability: blocked times / one-day breaks,
// booking rules, and the activity log. Every call needs an admin session
// (`pin` carries the session token).

const pin = z.string().max(512);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const minute = z.number().int().min(0).max(1440);

async function admin(token: string) {
  const { assertAdmin } = await import("./admin-auth.server");
  return assertAdmin(token);
}

const label = (m: number) => {
  const h = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, "0");
  return `${h % 12 === 0 ? 12 : h % 12}:${mm} ${h >= 12 ? "PM" : "AM"}`;
};

export type TimeBlock = {
  id: string;
  date: string;
  start: number;
  end: number;
  kind: "block" | "break";
  reason: string;
  archived: boolean;
};

export const adminListBlocks = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ pin, from: isoDate, to: isoDate, includeArchived: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const sb = await admin(data.pin);
    let q = sb
      .from("time_blocks" as never)
      .select("*")
      .gte("date", data.from)
      .lte("date", data.to)
      .order("date")
      .order("start_minute");
    if (!data.includeArchived) q = q.is("archived_at", null);
    const { data: rows, error } = await q;
    if (error) return { blocks: [] as TimeBlock[], unavailable: true };
    return {
      unavailable: false,
      blocks: (rows as Record<string, unknown>[]).map((r): TimeBlock => ({
        id: r["id"] as string,
        date: r["date"] as string,
        start: r["start_minute"] as number,
        end: r["end_minute"] as number,
        kind: r["kind"] as "block" | "break",
        reason: r["reason"] as string,
        archived: Boolean(r["archived_at"]),
      })),
    };
  });

/**
 * Blocks a period (or adds a one-day break). If active bookings already sit in
 * that period, nothing is saved and they're returned so the admin can decide;
 * resend with `confirm: true` to block around them anyway.
 */
export const adminSaveBlock = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        pin,
        id: z.string().uuid().optional(),
        date: isoDate,
        start: minute,
        end: minute,
        kind: z.enum(["block", "break"]),
        reason: z.string().trim().max(120),
        confirm: z.boolean().optional(),
      })
      .refine((v) => v.end > v.start, "End must be after start")
      .parse(d),
  )
  .handler(async ({ data }) => {
    const sb = await admin(data.pin);
    const E = await import("./engine.server");
    const { data: rows } = await sb
      .from("bookings")
      .select("*")
      .eq("date", data.date)
      .neq("status", "cancelled");
    const clashes = (rows ?? [])
      .filter(
        (r) => !["cancelled", "no-show"].includes((r.meta as { status?: string })?.status ?? ""),
      )
      .filter((r) => {
        const end =
          ((r as Record<string, unknown>)["ends_at_minute"] as number | null) ??
          r.time + r.slots * 30;
        return r.time < data.end && data.start < end;
      })
      .map((r) => ({
        reference: r.reference,
        time: r.time,
        name: (r.customer as { name?: string })?.name ?? "",
      }));
    if (clashes.length && !data.confirm) return { ok: false as const, clashes };

    const row = {
      date: data.date,
      start_minute: data.start,
      end_minute: data.end,
      kind: data.kind,
      reason: data.reason,
    };
    const { error } = data.id
      ? await sb
          .from("time_blocks" as never)
          .update(row as never)
          .eq("id", data.id)
      : await sb.from("time_blocks" as never).insert(row as never);
    if (error) return { ok: false as const, error: "Couldn't save. Please try again." };
    await E.audit({
      action: data.kind === "break" ? "break.save" : "block.save",
      entity: "time_block",
      entityId: data.id ?? "",
      summary: `${data.kind === "break" ? "Break" : "Blocked"} ${data.date} ${label(data.start)}–${label(data.end)}${data.reason ? ` (${data.reason})` : ""}`,
      after: row,
      reason: data.reason,
    });
    return { ok: true as const, clashes };
  });

/** Archives (removes from availability) or restores a block. Nothing is hard-deleted. */
export const adminArchiveBlock = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ pin, id: z.string().uuid(), restore: z.boolean().optional() }).parse(d),
  )
  .handler(async ({ data }) => {
    const sb = await admin(data.pin);
    const { data: before } = await sb
      .from("time_blocks" as never)
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await sb
      .from("time_blocks" as never)
      .update({ archived_at: data.restore ? null : new Date().toISOString() } as never)
      .eq("id", data.id);
    if (error) return { ok: false };
    const E = await import("./engine.server");
    const b = before as Record<string, unknown> | null;
    await E.audit({
      action: data.restore ? "block.restore" : "block.remove",
      entity: "time_block",
      entityId: data.id,
      summary: `${data.restore ? "Restored" : "Removed"} ${b?.["kind"] === "break" ? "break" : "block"} on ${b?.["date"] ?? ""} ${b ? `${label(b["start_minute"] as number)}–${label(b["end_minute"] as number)}` : ""}`,
      before: b,
    });
    return { ok: true };
  });

const rulesInput = z.object({
  slotInterval: z.union([z.literal(15), z.literal(30), z.literal(45), z.literal(60)]),
  minNoticeMinutes: z
    .number()
    .int()
    .min(0)
    .max(7 * 1440),
  maxAdvanceDays: z.number().int().min(1).max(365),
  allowSameDay: z.boolean(),
  allowMultiple: z.boolean(),
  maxServices: z.number().int().min(1).max(20),
  customerCancel: z.boolean(),
  cancelDeadlineMinutes: z
    .number()
    .int()
    .min(0)
    .max(7 * 1440),
  customerReschedule: z.boolean(),
  rescheduleDeadlineMinutes: z
    .number()
    .int()
    .min(0)
    .max(7 * 1440),
  maxReschedules: z.number().int().min(0).max(10),
  accepting: z.boolean(),
  pauseMessage: z.string().trim().min(1).max(240),
});

export const adminGetRules = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ pin }).parse(d))
  .handler(async ({ data }) => {
    await admin(data.pin);
    const E = await import("./engine.server");
    return { rules: await E.loadRules(), defaults: E.DEFAULT_RULES };
  });

export const adminSaveRules = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ pin, rules: rulesInput }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin(data.pin);
    const E = await import("./engine.server");
    const before = await E.loadRules();
    const { error } = await sb
      .from("site_settings")
      .upsert({ key: "booking_rules", value: data.rules as never });
    if (error) return { ok: false as const, error: "Couldn't save booking rules." };
    // keep the legacy flag in step for older readers
    const { data: cur } = await sb
      .from("site_settings")
      .select("value")
      .eq("key", "booking")
      .maybeSingle();
    await sb.from("site_settings").upsert({
      key: "booking",
      value: {
        ...((cur?.value as object) ?? {}),
        accepting: data.rules.accepting,
        maxAdvanceDays: data.rules.maxAdvanceDays,
      } as never,
    });
    const changed = (Object.keys(data.rules) as (keyof typeof data.rules)[]).filter(
      (k) => JSON.stringify(before[k]) !== JSON.stringify(data.rules[k]),
    );
    if (changed.length) {
      await E.audit({
        action:
          before.accepting !== data.rules.accepting
            ? data.rules.accepting
              ? "bookings.resume"
              : "bookings.pause"
            : "rules.update",
        entity: "settings",
        entityId: "booking_rules",
        summary: `Booking rules: ${changed.map((k) => `${k} ${JSON.stringify(before[k])} → ${JSON.stringify(data.rules[k])}`).join(", ")}`,
        before: Object.fromEntries(changed.map((k) => [k, before[k]])),
        after: Object.fromEntries(changed.map((k) => [k, data.rules[k]])),
      });
    }
    return { ok: true as const };
  });

export type ActivityEntry = {
  id: number;
  at: string;
  actor: string;
  action: string;
  entity: string;
  entityId: string;
  summary: string;
  reason: string;
};

/** Newest first, 50 per page; optional filter by entity or text. */
export const adminActivity = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        pin,
        before: z.number().int().optional(),
        entity: z.string().max(40).optional(),
        q: z.string().max(80).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const sb = await admin(data.pin);
    let q = sb
      .from("audit_log" as never)
      .select("*")
      .order("id", { ascending: false })
      .limit(50);
    if (data.before) q = q.lt("id", data.before);
    if (data.entity) q = q.eq("entity", data.entity);
    if (data.q) q = q.ilike("summary", `%${data.q.replace(/[%_]/g, "")}%`);
    const { data: rows, error } = await q;
    if (error) return { entries: [] as ActivityEntry[], unavailable: true };
    return {
      unavailable: false,
      entries: (rows as Record<string, unknown>[]).map((r): ActivityEntry => ({
        id: r["id"] as number,
        at: r["at"] as string,
        actor: r["actor"] as string,
        action: r["action"] as string,
        entity: r["entity"] as string,
        entityId: r["entity_id"] as string,
        summary: r["summary"] as string,
        reason: r["reason"] as string,
      })),
    };
  });
