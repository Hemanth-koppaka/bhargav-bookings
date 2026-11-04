import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// "My day" for stylists: each stylist signs in with their own code (set by the
// salon in Admin → Staff), sees only their own appointments, moves them along
// (arrived → in the chair → done, or no-show) and can get phone alerts for
// their own bookings only. The salon's console is unaffected.

const token = z.string().max(1024);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const pin = z.string().max(512);

async function stylist(t: string) {
  const { assertStylist } = await import("./admin-auth.server");
  return assertStylist(t);
}

async function staffName(id: string) {
  const { stable } = await import("./staff-store.server");
  const { data } = await stable("staff").select("name").eq("id", id).maybeSingle();
  return ((data as { name?: string } | null)?.name as string) ?? "Stylist";
}

export const stylistSignIn = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ code: z.string().min(1).max(64) }).parse(d))
  .handler(async ({ data }) => {
    const { stylistSignIn: signIn } = await import("./admin-auth.server");
    const r = await signIn(data.code.trim());
    if (!r.ok) return r;
    return { ...r, name: await staffName(r.staffId) };
  });

export type StylistAppt = {
  reference: string;
  time: number;
  end: number;
  name: string;
  phone: string;
  services: string[];
  status: string;
  note: string;
  photos: number;
};

/** The stylist's own appointments on a day (cancelled ones left out). */
export const stylistDay = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token, date: isoDate }).parse(d))
  .handler(async ({ data }) => {
    const sid = await stylist(data.token);
    const { supabaseAdmin: sb } = await import("@/integrations/supabase/client.server");
    const { staffIdOf } = await import("./booking-staff");
    const { data: rows } = await sb.from("bookings").select("*").eq("date", data.date).neq("status", "cancelled").order("time");
    const appts: StylistAppt[] = ((rows ?? []) as Record<string, unknown>[])
      .filter((r) => staffIdOf(r) === sid)
      .filter((r) => !["cancelled"].includes(((r["meta"] as Record<string, unknown> | null)?.["status"] as string) ?? ""))
      .map((r) => {
        const c = (r["customer"] ?? {}) as { name?: string; phone?: string; photos?: string[] };
        const meta = (r["meta"] ?? {}) as Record<string, unknown>;
        const minutes = (r["duration_minutes"] as number | null) ?? ((r["slots"] as number) ?? 1) * 30;
        return {
          reference: r["reference"] as string,
          time: r["time"] as number,
          end: (r["time"] as number) + minutes,
          name: c.name ?? "",
          phone: c.phone ?? "",
          services: ((r["services_snapshot"] as { name: string }[] | null) ?? []).map((x) => x.name),
          status: (meta["status"] as string) ?? "upcoming",
          note: (meta["note"] as string) ?? "",
          photos: (c.photos ?? []).length,
        };
      });
    const now = new Date(Date.now() + 330 * 60_000);
    return {
      name: await staffName(sid),
      appts,
      today: now.toISOString().slice(0, 10),
      nowMinute: now.getUTCHours() * 60 + now.getUTCMinutes(),
    };
  });

/** Moves one of the stylist's own appointments along. */
export const stylistSetStatus = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({ token, reference: z.string().max(20), status: z.enum(["arrived", "in-chair", "completed", "no-show"]) }).parse(d),
  )
  .handler(async ({ data }) => {
    const sid = await stylist(data.token);
    const { supabaseAdmin: sb } = await import("@/integrations/supabase/client.server");
    const { staffIdOf } = await import("./booking-staff");
    const { data: r } = await sb.from("bookings").select("*").eq("reference", data.reference).maybeSingle();
    if (!r || staffIdOf(r as Record<string, unknown>) !== sid || (r as Record<string, unknown>)["status"] === "cancelled")
      return { ok: false as const, error: "That appointment isn't yours." };
    const row = r as Record<string, unknown>;
    const meta = { ...((row["meta"] as Record<string, unknown> | null) ?? {}), status: data.status };
    const { patchBooking } = await import("./bookings.server");
    const error = await patchBooking(data.reference, { meta }, {});
    if (error) return { ok: false as const, error: "Couldn't update. Please try again." };
    // reference photos are kept only until the visit is over
    if (data.status === "completed" || data.status === "no-show") {
      const { deleteBookingPhotos } = await import("./photos.server");
      await deleteBookingPhotos(data.reference).catch(() => {});
    }
    const E = await import("./engine.server");
    const name = await staffName(sid);
    await E.audit({
      actor: `stylist:${name}`,
      action: `booking.${data.status}`,
      entity: "booking",
      entityId: data.reference,
      summary: `${name} marked ${data.reference} ${data.status === "in-chair" ? "in the chair" : data.status}`,
    });
    return { ok: true as const };
  });

/** Alerts on this phone for the stylist's own bookings only. */
export const stylistPushSubscribe = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        token,
        endpoint: z.string().url().max(1000),
        p256dh: z.string().min(40).max(200),
        auth: z.string().min(10).max(60),
        device: z.string().max(60),
        origin: z.string().max(200),
        off: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const sid = await stylist(data.token);
    const P = await import("./push.server");
    if (data.off) await P.removeSub(data.endpoint);
    else
      await P.addSub({
        endpoint: data.endpoint,
        keys: { p256dh: data.p256dh, auth: data.auth },
        device: `${await staffName(sid)} · ${data.device || "Phone"}`,
        origin: data.origin,
        at: Date.now(),
        staffId: sid,
      });
    return { ok: true as const };
  });

/* ── for the salon: each stylist's code ───────────────────────── */

export const adminStylistCodes = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ pin }).parse(d))
  .handler(async ({ data }) => {
    const { assertAdmin, stylistsWithCodes } = await import("./admin-auth.server");
    await assertAdmin(data.pin);
    return { withCode: await stylistsWithCodes() };
  });

export const adminSetStylistCode = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ pin, staffId: z.string().max(80), code: z.string().max(64) }).parse(d))
  .handler(async ({ data }) => {
    const { assertAdmin, setStylistCode, isWeakCode } = await import("./admin-auth.server");
    await assertAdmin(data.pin);
    const code = data.code.trim();
    if (code && isWeakCode(code)) return { ok: false as const, error: "Use at least 6 characters (not all the same)." };
    const ok = await setStylistCode(data.staffId, code);
    if (!ok) return { ok: false as const, error: "Couldn't save. Please try again." };
    const E = await import("./engine.server");
    await E.audit({ action: "staff.code", entity: "staff", entityId: data.staffId, summary: code ? "Set a stylist's phone code" : "Removed a stylist's phone code" });
    return { ok: true as const };
  });
