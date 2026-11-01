import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Admin → Staff and Admin → Closures. Stylists, what each can do, their hours,
// breaks, leave and temporary blocks; and whole-salon closures. Everything is
// configuration: the booking engine reads it live, so adding a stylist needs
// no code change. Admin session required; every change is logged.

const pin = z.string().max(512);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const minute = z.number().int().min(0).max(1440);

async function admin(token: string) {
  const { assertAdmin } = await import("./admin-auth.server");
  return assertAdmin(token);
}
const audit = async (e: Parameters<typeof import("./engine.server").audit>[0]) =>
  (await import("./engine.server")).audit(e);
const salonToday = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
const label = (m: number) =>
  `${Math.floor(m / 60) % 12 || 12}:${String(m % 60).padStart(2, "0")} ${m >= 720 ? "PM" : "AM"}`;

type Row = Record<string, unknown>;

export type StaffHours = { day: number; working: boolean; start: number; end: number };
export type StaffBreak = {
  id?: string | undefined;
  day: number | null;
  start: number;
  end: number;
  label: string;
};
export type StaffMember = {
  id: string;
  name: string;
  gender: string;
  specialties: string;
  active: boolean;
  bookable: boolean;
  order: number;
  services: string[];
  hours: StaffHours[];
  breaks: StaffBreak[];
  leave: { id: string; start: string; end: string; reason: string }[];
  blocks: { id: string; date: string; start: number; end: number; reason: string }[];
  upcoming: number;
};

/* ── staff ──────────────────────────────────────────────────── */

export const adminStaffList = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ pin }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin(data.pin);
    const today = salonToday();
    const [st, svc, hrs, brk, lv, un, bk, menu] = await Promise.all([
      sb
        .from("staff" as never)
        .select("*")
        .is("archived_at", null)
        .order("display_order"),
      sb.from("staff_services" as never).select("*"),
      sb.from("staff_working_hours" as never).select("*"),
      sb.from("staff_breaks" as never).select("*"),
      sb
        .from("staff_leave" as never)
        .select("*")
        .gte("end_date", today)
        .is("archived_at", null)
        .order("start_date"),
      sb
        .from("staff_unavailability" as never)
        .select("*")
        .gte("date", today)
        .is("archived_at", null)
        .order("date"),
      sb.from("bookings").select("*").gte("date", today).neq("status", "cancelled"),
      sb
        .from("services")
        .select("id, name, gender, category_id, display_order, archived_at, active")
        .order("display_order"),
    ]);
    if (st.error) return { available: false as const };
    const cats = await sb
      .from("service_categories")
      .select("id, name, gender, display_order")
      .order("display_order");
    const by = <T extends Row>(rows: T[] | null, id: string) =>
      (rows ?? []).filter((r) => r["staff_id"] === id);
    const staff = ((st.data ?? []) as Row[]).map((r): StaffMember => {
      const id = r["id"] as string;
      const hours = [0, 1, 2, 3, 4, 5, 6].map((d) => {
        const h = by(hrs.data as Row[], id).find((x) => x["day_of_week"] === d);
        return {
          day: d,
          working: Boolean(h?.["is_working"]),
          start: (h?.["start_minute"] as number) ?? 600,
          end: (h?.["end_minute"] as number) ?? 1200,
        };
      });
      return {
        id,
        name: r["name"] as string,
        gender: (r["gender"] as string) || "",
        specialties: (r["specialties"] as string) || "",
        active: Boolean(r["active"]),
        bookable: Boolean(r["bookable"]),
        order: (r["display_order"] as number) ?? 0,
        services: by(svc.data as Row[], id).map((x) => x["service_id"] as string),
        hours,
        breaks: by(brk.data as Row[], id).map((x) => ({
          id: x["id"] as string,
          day: (x["day_of_week"] as number | null) ?? null,
          start: x["start_minute"] as number,
          end: x["end_minute"] as number,
          label: (x["label"] as string) || "Break",
        })),
        leave: by(lv.data as Row[], id).map((x) => ({
          id: x["id"] as string,
          start: x["start_date"] as string,
          end: x["end_date"] as string,
          reason: (x["reason"] as string) || "",
        })),
        blocks: by(un.data as Row[], id).map((x) => ({
          id: x["id"] as string,
          date: x["date"] as string,
          start: x["start_minute"] as number,
          end: x["end_minute"] as number,
          reason: (x["reason"] as string) || "",
        })),
        upcoming: ((bk.data ?? []) as Row[]).filter(
          (b) =>
            b["staff_id"] === id &&
            !["cancelled", "no-show", "completed"].includes(
              (b["meta"] as { status?: string } | null)?.status ?? "",
            ),
        ).length,
      };
    });
    return {
      available: true as const,
      staff,
      services: ((menu.data ?? []) as Row[])
        .filter((s) => !s["archived_at"])
        .map((s) => ({
          id: s["id"] as string,
          name: s["name"] as string,
          audience: s["gender"] as string,
          categoryId: s["category_id"] as string,
        })),
      categories: ((cats.data ?? []) as Row[]).map((c) => ({
        id: c["id"] as string,
        name: c["name"] as string,
        audience: c["gender"] as string,
      })),
    };
  });

const staffInput = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(80),
  gender: z.enum(["", "male", "female", "other"]),
  specialties: z.string().trim().max(160),
  active: z.boolean(),
  bookable: z.boolean(),
  order: z.number().int().min(0).max(999),
  services: z.array(z.string().max(80)).max(400),
  hours: z
    .array(
      z.object({
        day: z.number().int().min(0).max(6),
        working: z.boolean(),
        start: minute,
        end: minute,
      }),
    )
    .length(7)
    .refine(
      (h) => h.every((x) => !x.working || x.end > x.start),
      "Each working day must end after it starts",
    ),
  breaks: z
    .array(
      z.object({
        day: z.number().int().min(0).max(6).nullable(),
        start: minute,
        end: minute,
        label: z.string().trim().max(40),
      }),
    )
    .max(20)
    .refine((b) => b.every((x) => x.end > x.start), "Each break must end after it starts"),
});

/** Adds or updates a stylist (with services, weekly hours and breaks). */
export const adminSaveStaff = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ pin, staff: staffInput }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin(data.pin);
    const x = data.staff;
    const row = {
      name: x.name,
      gender: x.gender,
      specialties: x.specialties,
      active: x.active,
      bookable: x.bookable,
      display_order: x.order,
    };
    let id = x.id;
    if (id) {
      const { error } = await sb
        .from("staff" as never)
        .update(row as never)
        .eq("id", id);
      if (error) return { ok: false as const, error: "Couldn't save this stylist." };
    } else {
      const { data: made, error } = await sb
        .from("staff" as never)
        .insert(row as never)
        .select();
      if (error || !Array.isArray(made) || !made[0])
        return { ok: false as const, error: "Couldn't add this stylist." };
      id = (made[0] as Row)["id"] as string;
    }
    // replace services, hours and breaks with the edited set
    await sb
      .from("staff_services" as never)
      .delete()
      .eq("staff_id", id);
    if (x.services.length)
      await sb
        .from("staff_services" as never)
        .insert(x.services.map((s) => ({ staff_id: id, service_id: s })) as never);
    await sb
      .from("staff_working_hours" as never)
      .delete()
      .eq("staff_id", id);
    await sb
      .from("staff_working_hours" as never)
      .insert(
        x.hours.map((h) => ({
          staff_id: id,
          day_of_week: h.day,
          is_working: h.working,
          start_minute: h.start,
          end_minute: Math.max(h.end, h.start + 5),
        })) as never,
      );
    await sb
      .from("staff_breaks" as never)
      .delete()
      .eq("staff_id", id);
    if (x.breaks.length)
      await sb
        .from("staff_breaks" as never)
        .insert(
          x.breaks.map((b) => ({
            staff_id: id,
            day_of_week: b.day,
            start_minute: b.start,
            end_minute: b.end,
            label: b.label || "Break",
          })) as never,
        );
    await audit({
      action: x.id ? "staff.update" : "staff.create",
      entity: "staff",
      entityId: id,
      summary: `${x.id ? "Updated" : "Added"} stylist ${x.name}${x.active ? "" : " (inactive)"}${x.bookable ? "" : " (not bookable online)"} · ${x.services.length} services`,
      after: { ...row, services: x.services.length },
    });
    return { ok: true as const, id };
  });

/** Bookings of a stylist inside a date range / hours, for clash warnings. */
async function clashes(staffId: string, from: string, to: string, start?: number, end?: number) {
  const { supabaseAdmin: sb } = await import("@/integrations/supabase/client.server");
  const { data } = await sb
    .from("bookings")
    .select("*")
    .gte("date", from)
    .lte("date", to)
    .neq("status", "cancelled")
    .eq("staff_id" as never, staffId as never);
  return ((data ?? []) as Row[])
    .filter(
      (b) =>
        !["cancelled", "no-show", "completed"].includes(
          (b["meta"] as { status?: string } | null)?.status ?? "",
        ),
    )
    .filter(
      (b) =>
        start == null ||
        end == null ||
        ((b["time"] as number) < end &&
          start < ((b["ends_at_minute"] as number | null) ?? (b["time"] as number) + 30)),
    )
    .map((b) => ({
      reference: b["reference"] as string,
      date: b["date"] as string,
      time: b["time"] as number,
      name: ((b["customer"] as { name?: string })?.name ?? "") as string,
    }));
}

export const adminAddLeave = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        pin,
        staffId: z.string().uuid(),
        start: isoDate,
        end: isoDate,
        reason: z.string().trim().max(120),
        confirm: z.boolean().optional(),
      })
      .refine((v) => v.end >= v.start, "Leave must end on or after its start")
      .parse(d),
  )
  .handler(async ({ data }) => {
    const sb = await admin(data.pin);
    const hit = await clashes(data.staffId, data.start, data.end);
    if (hit.length && !data.confirm) return { ok: false as const, clashes: hit };
    const { error } = await sb
      .from("staff_leave" as never)
      .insert({
        staff_id: data.staffId,
        start_date: data.start,
        end_date: data.end,
        reason: data.reason,
      } as never);
    if (error) return { ok: false as const, error: "Couldn't save the leave." };
    const { data: s } = await sb
      .from("staff" as never)
      .select("name")
      .eq("id", data.staffId)
      .maybeSingle();
    await audit({
      action: "staff.leave",
      entity: "staff",
      entityId: data.staffId,
      summary: `${(s as Row | null)?.["name"] ?? "Stylist"} on leave ${data.start}${data.end !== data.start ? ` → ${data.end}` : ""}${data.reason ? ` (${data.reason})` : ""}`,
      reason: data.reason,
    });
    return { ok: true as const, clashes: hit };
  });

export const adminAddStaffBlock = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        pin,
        staffId: z.string().uuid(),
        date: isoDate,
        start: minute,
        end: minute,
        reason: z.string().trim().max(120),
        confirm: z.boolean().optional(),
      })
      .refine((v) => v.end > v.start, "End must be after start")
      .parse(d),
  )
  .handler(async ({ data }) => {
    const sb = await admin(data.pin);
    const hit = await clashes(data.staffId, data.date, data.date, data.start, data.end);
    if (hit.length && !data.confirm) return { ok: false as const, clashes: hit };
    const { error } = await sb
      .from("staff_unavailability" as never)
      .insert({
        staff_id: data.staffId,
        date: data.date,
        start_minute: data.start,
        end_minute: data.end,
        reason: data.reason,
      } as never);
    if (error) return { ok: false as const, error: "Couldn't save." };
    const { data: s } = await sb
      .from("staff" as never)
      .select("name")
      .eq("id", data.staffId)
      .maybeSingle();
    await audit({
      action: "staff.block",
      entity: "staff",
      entityId: data.staffId,
      summary: `${(s as Row | null)?.["name"] ?? "Stylist"} unavailable ${data.date} ${label(data.start)}–${label(data.end)}${data.reason ? ` (${data.reason})` : ""}`,
      reason: data.reason,
    });
    return { ok: true as const, clashes: hit };
  });

/** Removes a leave period or a temporary block (logged). */
export const adminRemoveStaffTime = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ pin, kind: z.enum(["leave", "block"]), id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    const sb = await admin(data.pin);
    const table = data.kind === "leave" ? "staff_leave" : "staff_unavailability";
    const { error } = await sb
      .from(table as never)
      .update({ archived_at: new Date().toISOString() } as never)
      .eq("id", data.id);
    if (error) return { ok: false as const };
    await audit({
      action: `staff.${data.kind}_remove`,
      entity: "staff",
      entityId: data.id,
      summary: `Removed ${data.kind === "leave" ? "leave" : "unavailable time"}`,
    });
    return { ok: true as const };
  });

/* ── salon closures ─────────────────────────────────────────── */

export type ClosureRow = {
  id: string;
  start: string;
  end: string | null;
  startMinute: number | null;
  endMinute: number | null;
  reason: string;
  status: "active" | "upcoming" | "past";
  bookings: number;
};

export const adminClosures = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ pin }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin(data.pin);
    const today = salonToday();
    const { data: rows, error } = await sb
      .from("salon_closures" as never)
      .select("*")
      .is("reopened_at", null)
      .order("start_date");
    if (error) return { available: false as const, closures: [] as ClosureRow[] };
    const list = ((rows ?? []) as Row[]).filter(
      (r) => !r["end_date"] || (r["end_date"] as string) >= today,
    );
    const { data: bk } = await sb
      .from("bookings")
      .select("*")
      .gte("date", today)
      .neq("status", "cancelled");
    const live = ((bk ?? []) as Row[]).filter(
      (b) =>
        !["cancelled", "no-show"].includes((b["meta"] as { status?: string } | null)?.status ?? ""),
    );
    return {
      available: true as const,
      closures: list.map((r): ClosureRow => {
        const start = r["start_date"] as string;
        const end = (r["end_date"] as string | null) ?? null;
        const sm = (r["start_minute"] as number | null) ?? null;
        const em = (r["end_minute"] as number | null) ?? null;
        return {
          id: r["id"] as string,
          start,
          end,
          startMinute: sm,
          endMinute: em,
          reason: (r["reason"] as string) || "",
          status: start <= today ? "active" : "upcoming",
          bookings: live.filter((b) => {
            const d = b["date"] as string;
            if (d < start || (end && d > end)) return false;
            if (sm == null || em == null) return true;
            return (
              (b["time"] as number) < em &&
              sm < ((b["ends_at_minute"] as number | null) ?? (b["time"] as number) + 30)
            );
          }).length,
        };
      }),
    };
  });

export const adminAddClosure = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        pin,
        kind: z.enum(["days", "open", "hours", "dates"]),
        start: isoDate.optional(),
        end: isoDate.optional(),
        dates: z.array(isoDate).max(60).optional(),
        startMinute: minute.optional(),
        endMinute: minute.optional(),
        reason: z.string().trim().max(120),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const sb = await admin(data.pin);
    const rows: Row[] = [];
    if (data.kind === "dates") {
      for (const d of [...new Set(data.dates ?? [])].sort())
        rows.push({ start_date: d, end_date: d, reason: data.reason });
    } else if (data.kind === "hours") {
      if (
        !data.start ||
        data.startMinute == null ||
        data.endMinute == null ||
        data.endMinute <= data.startMinute
      )
        return { ok: false as const, error: "Choose the date and the hours (end after start)." };
      rows.push({
        start_date: data.start,
        end_date: data.start,
        start_minute: data.startMinute,
        end_minute: data.endMinute,
        reason: data.reason,
      });
    } else if (data.kind === "open") {
      if (!data.start) return { ok: false as const, error: "Choose the first closed date." };
      rows.push({ start_date: data.start, end_date: null, reason: data.reason });
    } else {
      if (!data.start || !data.end || data.end < data.start)
        return { ok: false as const, error: "Choose the dates (end on or after start)." };
      rows.push({ start_date: data.start, end_date: data.end, reason: data.reason });
    }
    if (!rows.length) return { ok: false as const, error: "Choose at least one date." };
    const { error } = await sb.from("salon_closures" as never).insert(rows as never);
    if (error) return { ok: false as const, error: "Couldn't save the closure." };
    const what =
      data.kind === "dates"
        ? `${rows.length} date${rows.length > 1 ? "s" : ""}: ${rows.map((r) => r["start_date"]).join(", ")}`
        : data.kind === "hours"
          ? `${data.start} ${label(data.startMinute!)}–${label(data.endMinute!)}`
          : data.kind === "open"
            ? `from ${data.start} until further notice`
            : `${data.start} → ${data.end}`;
    await audit({
      action: "salon.close",
      entity: "date",
      entityId: (rows[0]?.["start_date"] as string) ?? "",
      summary: `Salon closed ${what}${data.reason ? ` (${data.reason})` : ""}`,
      reason: data.reason,
    });
    return { ok: true as const };
  });

/** Reopens: a closure that already began ends yesterday; a future one is withdrawn. */
export const adminReopen = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ pin, id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin(data.pin);
    const { data: r } = await sb
      .from("salon_closures" as never)
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!r) return { ok: false as const, error: "Closure not found." };
    const row = r as Row;
    const today = salonToday();
    const y = new Date(`${today}T00:00:00Z`);
    y.setUTCDate(y.getUTCDate() - 1);
    const yesterday = y.toISOString().slice(0, 10);
    const began = (row["start_date"] as string) <= yesterday && row["start_minute"] == null;
    const { error } = began
      ? await sb
          .from("salon_closures" as never)
          .update({ end_date: yesterday } as never)
          .eq("id", data.id)
      : await sb
          .from("salon_closures" as never)
          .update({ reopened_at: new Date().toISOString() } as never)
          .eq("id", data.id);
    if (error) return { ok: false as const, error: "Couldn't reopen." };
    await audit({
      action: "salon.reopen",
      entity: "date",
      entityId: row["start_date"] as string,
      summary: `Salon reopened (closure from ${row["start_date"]}${row["reason"] ? `, ${row["reason"]}` : ""})`,
    });
    return { ok: true as const };
  });
