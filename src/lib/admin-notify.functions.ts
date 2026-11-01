import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  EVENT_LABEL,
  SENDS,
  isE164,
  messageText,
  templateKey,
  templateVarNames,
  toE164,
  type BookingFacts,
  type NotifyEvent,
  type Recipient,
} from "./notify/messages";

// Admin → Notifications. Every call needs the admin session; provider secrets
// are never read back to the browser (only whether they are present).

const pin = z.string().max(512);
async function admin(token: string) {
  const { assertAdmin } = await import("./admin-auth.server");
  return assertAdmin(token);
}

export type NotifyLog = {
  id: number;
  bookingId: string;
  event: NotifyEvent;
  eventLabel: string;
  recipient: string;
  phone: string;
  channel: string;
  status: string;
  errorCode: string | null;
  errorMessage: string | null;
  attempts: number;
  scheduledFor: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  createdAt: string;
  fallback: boolean;
};

const toLog = (r: Record<string, unknown>): NotifyLog => ({
  id: r["id"] as number,
  bookingId: r["booking_id"] as string,
  event: r["event_type"] as NotifyEvent,
  eventLabel: EVENT_LABEL[r["event_type"] as NotifyEvent] ?? String(r["event_type"]),
  recipient: r["recipient_type"] as string,
  // email messages are addressed by email instead of phone
  phone: (r["recipient_email"] as string) || (r["recipient_phone"] as string) || "",
  channel: r["channel"] as string,
  status: r["status"] as string,
  errorCode: (r["error_code"] as string) ?? null,
  errorMessage: (r["error_message"] as string) ?? null,
  attempts: (r["attempt_count"] as number) ?? 0,
  scheduledFor: (r["scheduled_for"] as string) ?? null,
  sentAt: (r["sent_at"] as string) ?? null,
  deliveredAt: (r["delivered_at"] as string) ?? null,
  createdAt: r["created_at"] as string,
  fallback: Boolean((r["payload"] as { fallback?: boolean } | null)?.fallback),
});

const SAMPLE: BookingFacts = {
  reference: "HB-2026-01042",
  customerName: "Arjun",
  customerPhone: "+919876543210",
  date: "2026-11-12",
  time: 16 * 60 + 30,
  services: ["Bhargav's Signature"],
  minutes: 30,
  price: 1000,
  priceFrom: false,
  location: "KPHB Phase 9, Kukatpally, Hyderabad",
  manageUrl: "https://your-site/manage?ref=HB-2026-01042",
  previous: { date: "2026-11-11", time: 15 * 60 },
};

/** Every template the provider needs, with its variables in order and sample text. */
const SLOTS = (Object.entries(SENDS) as [Recipient, NotifyEvent[]][]).flatMap(
  ([recipient, events]) =>
    events.map((event) => ({
      slot: templateKey(recipient, event),
      recipient,
      event,
      label: `${recipient === "admin" ? "Salon" : "Guest"} · ${EVENT_LABEL[event]}`,
      vars: templateVarNames(recipient, event),
      sample: messageText(recipient, event, SAMPLE),
    })),
);

export const adminNotifySettings = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ pin }).parse(d))
  .handler(async ({ data }) => {
    await admin(data.pin);
    const S = await import("./notify/service.server");
    const { getProvider } = await import("./notify/provider.server");
    const s = await S.loadSettings();
    if (!s) return { available: false as const };
    const provider = await getProvider(s.provider);
    const st = provider.status(s.providerConfig);
    return {
      available: true as const,
      settingsJson: JSON.stringify(s),
      status: {
        provider: st.provider,
        connected: st.connected,
        whatsapp: st.whatsapp,
        sms: st.sms,
        webhookSecret: Boolean(process.env["MSG91_WEBHOOK_SECRET"]),
        cronSecret: Boolean(process.env["LOVABLE_CRON_SECRET"]),
        email: (await import("./notify/email.server")).emailStatus(s.email),
      },
      slots: SLOTS,
    };
  });

const phone = z
  .string()
  .trim()
  .max(20)
  .transform((p) => (p ? toE164(p) || "INVALID" : ""))
  .refine((p) => p === "" || isE164(p), "Enter a valid mobile number, e.g. +91 98765 43210");

const settingsInput = z.object({
  provider: z.enum(["msg91"]),
  customerWhatsapp: z.boolean(),
  customerSms: z.boolean(),
  adminWhatsapp: z.boolean(),
  adminSms: z.boolean(),
  fallback: z.boolean(),
  customerConfirmation: z.boolean(),
  customerUpdates: z.boolean(),
  adminNewBooking: z.boolean(),
  adminUpdates: z.boolean(),
  reminder24h: z.boolean(),
  reminder2h: z.boolean(),
  adminPhone: phone,
  testPhone: phone,
  publicSiteUrl: z
    .string()
    .trim()
    .max(200)
    .refine(
      (u) => u === "" || /^https:\/\/[a-z0-9.-]+(:\d+)?\/?$/i.test(u),
      "Use the full address, e.g. https://hairbybhargav.com",
    ),
  customerEmail: z.boolean(),
  adminEmail: z.boolean(),
  adminEmailAddress: z
    .string()
    .trim()
    .max(200)
    .refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Enter a valid salon email"),
  email: z.object({
    provider: z.enum(["brevo", "resend"]),
    from: z
      .string()
      .trim()
      .max(200)
      .refine((v) => v === "" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v), "Enter a valid sender email"),
    fromName: z.string().trim().max(80),
  }),
  providerConfig: z.object({
    whatsappNumber: phone.optional(),
    whatsappLanguage: z.string().trim().max(10).optional(),
    whatsappNamespace: z.string().trim().max(80).optional(),
    smsVarPrefix: z
      .string()
      .trim()
      .max(12)
      .regex(/^[A-Za-z_]*$/)
      .optional(),
    templates: z
      .record(
        z.string().max(60),
        z.object({
          whatsapp: z.string().trim().max(120).optional(),
          sms: z.string().trim().max(60).optional(),
        }),
      )
      .optional(),
  }),
});

export const adminSaveNotifySettings = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ pin, settings: settingsInput }).parse(d))
  .handler(async ({ data }) => {
    const sb = await admin(data.pin);
    const x = data.settings;
    const row = {
      provider: x.provider,
      customer_whatsapp_enabled: x.customerWhatsapp,
      customer_sms_enabled: x.customerSms,
      admin_whatsapp_enabled: x.adminWhatsapp,
      admin_sms_enabled: x.adminSms,
      fallback_enabled: x.fallback,
      customer_confirmation_enabled: x.customerConfirmation,
      customer_updates_enabled: x.customerUpdates,
      admin_new_booking_enabled: x.adminNewBooking,
      admin_updates_enabled: x.adminUpdates,
      customer_reminder_24h: x.reminder24h,
      customer_reminder_2h: x.reminder2h,
      admin_notification_phone: x.adminPhone,
      test_phone: x.testPhone,
      public_site_url: x.publicSiteUrl.replace(/\/+$/, ""),
      provider_config: x.providerConfig,
      customer_email_enabled: x.customerEmail,
      admin_email_enabled: x.adminEmail,
      admin_notification_email: x.adminEmailAddress,
      email_provider: x.email.provider,
      email_from: x.email.from,
      email_from_name: x.email.fromName || "Hair by Bhargav",
    };
    const { data: before } = await sb
      .from("notification_settings" as never)
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    const { error } = await sb
      .from("notification_settings" as never)
      .update(row as never)
      .eq("id", 1);
    if (error) return { ok: false as const, error: "Couldn't save notification settings." };
    const b = (before ?? {}) as Record<string, unknown>;
    const changed = Object.keys(row).filter(
      (k) => JSON.stringify(b[k]) !== JSON.stringify((row as Record<string, unknown>)[k]),
    );
    if (changed.length) {
      const E = await import("./engine.server");
      await E.audit({
        action: "notifications.settings",
        entity: "settings",
        entityId: "notifications",
        summary: `Notification settings: ${changed.map((k) => k.replace(/_/g, " ")).join(", ")}`,
        before: Object.fromEntries(changed.map((k) => [k, b[k]])),
        after: Object.fromEntries(changed.map((k) => [k, (row as Record<string, unknown>)[k]])),
      });
    }
    return { ok: true as const };
  });

export const adminSendTestMessage = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({ pin, kind: z.enum(["customer", "admin"]), channel: z.enum(["whatsapp", "sms", "email"]) })
      .parse(d),
  )
  .handler(async ({ data }) => {
    await admin(data.pin);
    const S = await import("./notify/service.server");
    const r = await S.sendTest(data.kind, data.channel);
    const E = await import("./engine.server");
    await E.audit({
      action: "notifications.test",
      entity: "settings",
      entityId: "notifications",
      summary: `Test ${data.kind} ${data.channel} message: ${r.status}`,
    });
    return r;
  });

export const adminNotificationLogs = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        pin,
        bookingId: z.string().max(20).optional(),
        problems: z.boolean().optional(),
        page: z.number().int().min(0).max(500).default(0),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const sb = await admin(data.pin);
    let q = sb.from("notification_logs" as never).select("*");
    if (data.bookingId) q = q.eq("booking_id", data.bookingId);
    if (data.problems) q = q.in("status", ["failed", "skipped"]);
    const { data: rows, error } = await q
      .order("created_at", { ascending: !!data.bookingId })
      .range(data.page * 50, data.page * 50 + 49);
    if (error) return { logs: [] as NotifyLog[], more: false, available: false };
    return {
      logs: ((rows ?? []) as Record<string, unknown>[]).map(toLog),
      more: (rows ?? []).length === 50,
      available: true,
    };
  });

export const adminRetryNotification = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ pin, id: z.number().int().positive() }).parse(d))
  .handler(async ({ data }) => {
    await admin(data.pin);
    const S = await import("./notify/service.server");
    const r = await S.retryLog(data.id);
    const E = await import("./engine.server");
    await E.audit({
      action: "notifications.retry",
      entity: "notification",
      entityId: String(data.id),
      summary: `Retried message #${data.id}: ${r.detail}`,
    });
    return r;
  });

/** Runs the reminder/retry dispatcher now (normally the 10-minute schedule does). */
export const adminDispatchNow = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ pin }).parse(d))
  .handler(async ({ data }) => {
    await admin(data.pin);
    const S = await import("./notify/service.server");
    return S.dispatchDue();
  });
