import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// System health and security for the console. Reports what is set up and
// what isn't (never the values of secrets), and offers "sign out on all
// devices". Admin session required.

const pin = z.string().max(512);
async function admin(token: string) {
  const { assertAdmin } = await import("./admin-auth.server");
  return assertAdmin(token);
}

export type HealthCheck = {
  group: "Database" | "Scheduled jobs" | "Messaging" | "Storage" | "Secrets";
  label: string;
  status: "ok" | "warn" | "fail";
  detail: string;
};

const ago = (ms: number) => {
  const m = Math.round((Date.now() - ms) / 60_000);
  return m < 1
    ? "just now"
    : m < 60
      ? `${m} min ago`
      : m < 48 * 60
        ? `${Math.round(m / 60)} h ago`
        : `${Math.round(m / 1440)} days ago`;
};

export const adminSystemHealth = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ pin }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin(data.pin);
    const checks: HealthCheck[] = [];
    const add = (c: HealthCheck) => checks.push(c);

    // database
    const t0 = Date.now();
    const ping = await sb.from("site_settings").select("key").limit(1);
    const ms = Date.now() - t0;
    add({
      group: "Database",
      label: "Connection",
      status: ping.error ? "fail" : ms > 1500 ? "warn" : "ok",
      detail: ping.error ? "Can't reach the database." : `Answered in ${ms} ms.`,
    });
    const table = async (name: string) =>
      !(
        await sb
          .from(name as never)
          .select("*")
          .limit(1)
      ).error;
    const [customers, blocks, audit, notify] = await Promise.all([
      table("customers"),
      table("time_blocks"),
      table("audit_log"),
      table("notification_settings"),
    ]);
    add({
      group: "Database",
      label: "Admin OS update (0002)",
      status: customers && blocks && audit ? "ok" : "fail",
      detail:
        customers && blocks && audit
          ? "Applied: customers, blocked time, activity log."
          : "Not applied — customers, blocked time and the activity log are unavailable.",
    });
    add({
      group: "Database",
      label: "Notifications update (0004)",
      status: notify ? "ok" : "warn",
      detail: notify ? "Applied." : "Not applied — booking messages are off until it is.",
    });
    const { count: total } = await sb.from("bookings").select("*", { count: "exact", head: true });
    add({
      group: "Database",
      label: "Bookings stored",
      status: "ok",
      detail: `${total ?? 0} in total.`,
    });

    // jobs
    const { data: settings } = await sb
      .from("site_settings")
      .select("key, value")
      .in("key", ["photo_sweep", "job_notify_dispatch"]);
    const job = (k: string) =>
      ((settings ?? []).find((r) => r.key === k)?.value ?? null) as { at?: number } | null;
    const sweep = job("photo_sweep");
    add({
      group: "Scheduled jobs",
      label: "Reference-photo clean-up",
      status: sweep?.at && Date.now() - sweep.at < 3 * 86_400_000 ? "ok" : "warn",
      detail: sweep?.at
        ? `Last ran ${ago(sweep.at)}.`
        : "Hasn't run yet (it also runs when bookings are made or the console is open).",
    });
    const disp = job("job_notify_dispatch");
    const overdue = notify
      ? (
          (
            await sb
              .from("notification_logs" as never)
              .select("id")
              .eq("status", "scheduled")
              .lte("scheduled_for", new Date(Date.now() - 20 * 60_000).toISOString())
          ).data ?? []
        ).length
      : 0;
    add({
      group: "Scheduled jobs",
      label: "Reminders & retries (every 10 min)",
      status: overdue ? "fail" : disp?.at && Date.now() - disp.at < 30 * 60_000 ? "ok" : "warn",
      detail: overdue
        ? `${overdue} reminder${overdue > 1 ? "s are" : " is"} overdue — the schedule isn't running.`
        : disp?.at
          ? `Last ran ${ago(disp.at)}.`
          : "Not run yet. Schedule POST /api/notifications/dispatch every 10 minutes.",
    });

    // messaging
    if (notify) {
      const N = await import("./notify/service.server");
      const { getProvider } = await import("./notify/provider.server");
      const ns = await N.loadSettings();
      if (ns) {
        const st = (await getProvider(ns.provider)).status(ns.providerConfig);
        add({
          group: "Messaging",
          label: `${st.provider} connection`,
          status: st.connected ? "ok" : "warn",
          detail: st.connected
            ? "API key present."
            : "Not configured — messages are recorded as skipped.",
        });
        add({
          group: "Messaging",
          label: "WhatsApp",
          status: st.whatsapp.configured ? "ok" : "warn",
          detail: st.whatsapp.configured
            ? "Configured."
            : `Missing: ${st.whatsapp.missing.join(", ")}.`,
        });
        const since = new Date(Date.now() - 86_400_000).toISOString();
        const failed = (
          (
            await sb
              .from("notification_logs" as never)
              .select("id")
              .eq("status", "failed")
              .gte("created_at", since)
              .neq("recipient_type", "test")
          ).data ?? []
        ).length;
        add({
          group: "Messaging",
          label: "Failed in last 24 h",
          status: failed ? "warn" : "ok",
          detail: failed
            ? `${failed} message${failed > 1 ? "s" : ""} failed — see Notifications.`
            : "None.",
        });
      }
    }

    // storage
    for (const [bucket, label] of [
      ["reference-photos", "Guest reference photos (private)"],
      ["salon-media", "Service & category photos (public)"],
    ] as const) {
      const { data: b, error } = await sb.storage.getBucket(bucket);
      add({
        group: "Storage",
        label,
        status: b && !error ? "ok" : "warn",
        detail: b && !error ? "Ready." : "Created automatically on first upload.",
      });
    }

    // secrets (presence only)
    const has = (k: string) => Boolean(process.env[k]);
    add({
      group: "Secrets",
      label: "ADMIN_SESSION_SECRET",
      status: has("ADMIN_SESSION_SECRET") ? "ok" : "warn",
      detail: has("ADMIN_SESSION_SECRET")
        ? "Set."
        : "Not set — sessions are signed with the service key. Set a dedicated random secret.",
    });
    add({
      group: "Secrets",
      label: "LOVABLE_CRON_SECRET",
      status: has("LOVABLE_CRON_SECRET") ? "ok" : "warn",
      detail: has("LOVABLE_CRON_SECRET")
        ? "Set (scheduled jobs can authenticate)."
        : "Not set — scheduled jobs can't run.",
    });
    add({
      group: "Secrets",
      label: "MSG91_AUTH_KEY",
      status: has("MSG91_AUTH_KEY") ? "ok" : "warn",
      detail: has("MSG91_AUTH_KEY") ? "Set." : "Not set.",
    });
    add({
      group: "Secrets",
      label: "MSG91_WEBHOOK_SECRET",
      status: has("MSG91_WEBHOOK_SECRET") ? "ok" : "warn",
      detail: has("MSG91_WEBHOOK_SECRET") ? "Set." : "Not set — delivery reports are refused.",
    });

    const { securityStatus } = await import("./admin-auth.server");
    return { checks, security: await securityStatus(), checkedAt: Date.now() };
  });

export const adminSignOutEverywhere = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ pin }).parse(d))
  .handler(async ({ data }) => {
    const { signOutEverywhere } = await import("./admin-auth.server");
    const r = await signOutEverywhere(data.pin);
    if (r.ok) {
      const E = await import("./engine.server");
      await E.audit({
        action: "security.signout_all",
        entity: "security",
        summary: "Signed out all admin sessions on every device",
      });
    }
    return r;
  });
