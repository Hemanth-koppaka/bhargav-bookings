// The notification service. Bookings call notifyBookingEvent() only AFTER the
// booking is committed; nothing here can create, change or fail a booking.
//
// Reliability rules
//  • Idempotent: every message has a unique key (booking + event [+ occurrence]
//    + recipient + phone + channel). A second trigger finds the row and stops.
//  • Claimed before sending: a row moves queued → sending with a conditional
//    update, so two parallel triggers can't both send.
//  • Honest: "sent" only when the provider accepted the message; "delivered"
//    only from the provider's delivery webhook. Missing setup → "skipped".
//  • WhatsApp first; SMS fallback when WhatsApp fails or can't be used (if on).
//  • Failed sends retry with back-off (max 3 tries) from the dispatcher; an
//    attempt whose outcome is unknown is never retried automatically.
import { supabaseAdmin as sb } from "@/integrations/supabase/client.server";
import {
  idempotencyKey,
  messageText,
  reminderAt,
  slotStamp,
  templateKey,
  templateVars,
  toE164,
  type BookingFacts,
  type Channel,
  type NotifyEvent,
  type Recipient,
} from "./messages";
import { getProvider, type DeliveryUpdate, type ProviderConfig } from "./provider.server";

export const MAX_ATTEMPTS = 3;

export type NotifySettings = {
  provider: string;
  customerWhatsapp: boolean;
  customerSms: boolean;
  adminWhatsapp: boolean;
  adminSms: boolean;
  fallback: boolean;
  customerConfirmation: boolean;
  customerUpdates: boolean;
  adminNewBooking: boolean;
  adminUpdates: boolean;
  reminder24h: boolean;
  reminder2h: boolean;
  adminPhone: string;
  testPhone: string;
  publicSiteUrl: string;
  providerConfig: ProviderConfig;
};

type Row = Record<string, unknown>;
type LogRow = {
  id: number;
  idempotency_key: string;
  booking_id: string;
  event_type: NotifyEvent;
  recipient_type: Recipient | "test";
  recipient_phone: string;
  channel: Channel;
  status: string;
  attempt_count: number;
  payload: { vars?: string[]; text?: string; slot?: string; occurrence?: string };
  scheduled_for: string | null;
  next_attempt_at: string | null;
  created_at: string;
  updated_at: string;
};

/* ── settings ────────────────────────────────────────────────── */

export function settingsFromRow(r: Row): NotifySettings {
  return {
    provider: (r["provider"] as string) || "msg91",
    customerWhatsapp: Boolean(r["customer_whatsapp_enabled"]),
    customerSms: Boolean(r["customer_sms_enabled"]),
    adminWhatsapp: Boolean(r["admin_whatsapp_enabled"]),
    adminSms: Boolean(r["admin_sms_enabled"]),
    fallback: Boolean(r["fallback_enabled"]),
    customerConfirmation: Boolean(r["customer_confirmation_enabled"]),
    customerUpdates: Boolean(r["customer_updates_enabled"]),
    adminNewBooking: Boolean(r["admin_new_booking_enabled"]),
    adminUpdates: Boolean(r["admin_updates_enabled"]),
    reminder24h: Boolean(r["customer_reminder_24h"]),
    reminder2h: Boolean(r["customer_reminder_2h"]),
    adminPhone: (r["admin_notification_phone"] as string) || "",
    testPhone: (r["test_phone"] as string) || "",
    publicSiteUrl: (r["public_site_url"] as string) || "",
    providerConfig: ((r["provider_config"] as ProviderConfig | null) ?? {}) as ProviderConfig,
  };
}

/** null when the notifications migration hasn't been applied yet. */
export async function loadSettings(): Promise<NotifySettings | null> {
  const { data, error } = await sb
    .from("notification_settings" as never)
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error || !data) return null;
  return settingsFromRow(data as Row);
}

/* ── booking facts (from the stored snapshot) ────────────────── */

async function locationText() {
  const { data } = await sb
    .from("site_settings")
    .select("value")
    .eq("key", "business")
    .maybeSingle();
  const b = (data?.value ?? {}) as { locationShort?: string; address?: string };
  if (b.locationShort) return b.locationShort;
  const { BUSINESS } = await import("../salon");
  return BUSINESS.locationShort || BUSINESS.address;
}

export function factsFromBooking(
  r: Row,
  ctx: { location: string; siteUrl: string; previous?: { date: string; time: number } | undefined },
): BookingFacts {
  const snap =
    (r["services_snapshot"] as
      { name: string; price: number; minutes: number; from?: boolean }[] | null) ?? [];
  const customer = (r["customer"] ?? {}) as { name?: string; phone?: string };
  const origin = ((r["site_origin"] as string) || ctx.siteUrl || "").replace(/\/+$/, "");
  return {
    reference: r["reference"] as string,
    customerName: customer.name?.trim() || "Guest",
    customerPhone: toE164(customer.phone ?? ""),
    date: r["date"] as string,
    time: r["time"] as number,
    services: snap.map((s) => s.name),
    minutes:
      (r["duration_minutes"] as number | null) ??
      (snap.reduce((n, s) => n + (s.minutes || 0), 0) || (r["slots"] as number) * 30),
    price: (r["price_total"] as number | null) ?? snap.reduce((n, s) => n + (s.price || 0), 0),
    priceFrom: snap.some((s) => s.from),
    location: ctx.location,
    manageUrl: origin ? `${origin}/manage?ref=${encodeURIComponent(r["reference"] as string)}` : "",
    previous: ctx.previous,
  };
}

const isActive = (r: Row) => {
  const st = (r["meta"] as { status?: string } | null)?.status;
  return r["status"] !== "cancelled" && !["cancelled", "completed", "no-show"].includes(st ?? "");
};

/* ── log rows ────────────────────────────────────────────────── */

const isDuplicate = (e: { message?: string; code?: string } | null) =>
  Boolean(e && (e.code === "23505" || /duplicate key/i.test(e.message ?? "")));

/** Creates the row for a message, or returns the existing one for the same key. */
async function ensureRow(row: Row): Promise<{ row: LogRow; created: boolean } | null> {
  const { data, error } = await sb
    .from("notification_logs" as never)
    .insert(row as never)
    .select();
  if (!error && Array.isArray(data) && data[0]) return { row: data[0] as LogRow, created: true };
  if (error && !isDuplicate(error)) {
    console.error("notification log insert failed", error.message);
    return null;
  }
  const { data: existing } = await sb
    .from("notification_logs" as never)
    .select("*")
    .eq("idempotency_key", row["idempotency_key"] as string)
    .maybeSingle();
  return existing ? { row: existing as LogRow, created: false } : null;
}

/** Atomically moves a row from one status to "sending"; false if someone else got it. */
async function claim(id: number, from: string): Promise<boolean> {
  const { data } = await sb
    .from("notification_logs" as never)
    .update({ status: "sending" } as never)
    .eq("id", id)
    .eq("status", from)
    .select();
  return Array.isArray(data) && data.length === 1;
}

const patchRow = (id: number, p: Row) =>
  sb
    .from("notification_logs" as never)
    .update(p as never)
    .eq("id", id);

/* ── sending ─────────────────────────────────────────────────── */

type Outcome = "sent" | "failed" | "skipped" | "duplicate";

/**
 * Sends one message on one channel (row must already be claimed as "sending").
 * Returns how it went; the row is updated either way.
 */
async function attempt(
  row: LogRow,
  s: NotifySettings,
): Promise<{ outcome: Outcome; retryable?: boolean }> {
  const provider = await getProvider(s.provider);
  const slot = row.payload.slot ?? templateKey(row.recipient_type, row.event_type);
  const can = provider.canSend(row.channel, slot, s.providerConfig);
  if (!can.ok) {
    await patchRow(row.id, {
      status: "skipped",
      provider: provider.name,
      error_code: "NOT_CONFIGURED",
      error_message: can.reason,
    });
    return { outcome: "skipped" };
  }
  const tries = row.attempt_count + 1;
  const r = await provider.send(
    {
      channel: row.channel,
      to: row.recipient_phone,
      slot,
      vars: row.payload.vars ?? [],
      text: row.payload.text ?? "",
    },
    s.providerConfig,
  );
  if (r.ok) {
    await patchRow(row.id, {
      status: "sent",
      provider: provider.name,
      provider_message_id: r.messageId,
      attempt_count: tries,
      sent_at: new Date().toISOString(),
      error_code: null,
      error_message: null,
      next_attempt_at: null,
    });
    return { outcome: "sent" };
  }
  const retry = r.retryable && tries < MAX_ATTEMPTS;
  await patchRow(row.id, {
    status: "failed",
    provider: provider.name,
    attempt_count: tries,
    error_code: r.code,
    error_message: r.message,
    // back-off: 5, 10, 20 minutes
    next_attempt_at: retry
      ? new Date(Date.now() + 5 * 60_000 * 2 ** (tries - 1)).toISOString()
      : null,
  });
  return { outcome: "failed", retryable: retry };
}

type Target = {
  recipient: Recipient | "test";
  phone: string;
  channels: Channel[];
  fallback: boolean;
};

/** Which channels to use for a recipient, in order. */
function channelsFor(
  recipient: Recipient,
  s: NotifySettings,
  consent: boolean,
): Target["channels"] {
  const wa = recipient === "customer" ? s.customerWhatsapp && consent : s.adminWhatsapp;
  const sms = recipient === "customer" ? s.customerSms : s.adminSms;
  if (wa) return ["whatsapp"];
  return sms ? ["sms"] : [];
}

/**
 * Delivers one event to one recipient: WhatsApp first, then SMS if WhatsApp
 * failed or couldn't be used and fallback is on. Each channel is its own row.
 */
async function deliver(p: {
  s: NotifySettings;
  facts: BookingFacts;
  event: NotifyEvent;
  target: Target;
  occurrence?: string | undefined;
  status?: "queued" | "scheduled";
  scheduledFor?: Date | undefined;
}): Promise<void> {
  const { s, facts, event, target } = p;
  if (!target.phone) return;
  const slot = templateKey(target.recipient, event);
  const vars = templateVars(target.recipient, event, facts);
  const text = messageText(target.recipient, event, facts);
  const queue: Channel[] = [...target.channels];
  if (target.fallback && queue[0] === "whatsapp") queue.push("sms");
  if (!queue.length) {
    // nothing will go out: record why, so the admin can see it on the booking
    await ensureRow({
      idempotency_key: idempotencyKey({
        reference: facts.reference,
        event,
        recipient: target.recipient,
        phone: target.phone,
        channel: "whatsapp",
        occurrence: p.occurrence,
      }),
      booking_id: facts.reference,
      event_type: event,
      recipient_type: target.recipient,
      recipient_phone: target.phone,
      channel: "whatsapp",
      provider: s.provider,
      status: "skipped",
      error_code: "NO_CHANNEL",
      error_message:
        target.recipient === "customer"
          ? "Guest didn't agree to WhatsApp messages and SMS is off"
          : "Admin WhatsApp and SMS are both off",
      payload: { vars, text, slot, occurrence: p.occurrence ?? null },
    });
    return;
  }

  for (let i = 0; i < queue.length; i++) {
    const channel = queue[i]!;
    const isFallback = i > 0;
    const made = await ensureRow({
      idempotency_key: idempotencyKey({
        reference: facts.reference,
        event,
        recipient: target.recipient,
        phone: target.phone,
        channel,
        occurrence: p.occurrence,
      }),
      booking_id: facts.reference,
      event_type: event,
      recipient_type: target.recipient,
      recipient_phone: target.phone,
      channel,
      provider: s.provider,
      status: p.status ?? "queued",
      scheduled_for: p.scheduledFor?.toISOString() ?? null,
      payload: { vars, text, slot, occurrence: p.occurrence ?? null, fallback: isFallback },
    });
    if (!made) return;
    if (p.status === "scheduled") {
      // moved away and back again: re-arm the reminder that was cancelled
      if (!made.created && made.row.status === "cancelled") {
        await sb
          .from("notification_logs" as never)
          .update({
            status: "scheduled",
            scheduled_for: p.scheduledFor?.toISOString() ?? null,
            error_message: null,
          } as never)
          .eq("id", made.row.id)
          .eq("status", "cancelled");
      }
      return; // the dispatcher sends it when due (fallback decided then)
    }
    const row = made.row;
    if (!made.created) {
      // already handled: never send twice. A failed row is retried by the dispatcher.
      if (["sent", "delivered", "sending", "scheduled", "cancelled"].includes(row.status)) return;
      if (row.status === "skipped" && !isFallback) continue; // channel unavailable; try the next one
      if (row.status !== "queued") return;
    }
    if (!(await claim(row.id, "queued"))) return;
    const r = await attempt(row, s);
    if (r.outcome === "sent") return;
    // WhatsApp failed or isn't set up → next channel (SMS) if there is one
  }
}

/* ── events ──────────────────────────────────────────────────── */

export type EventContext = {
  /** Who caused it: admin changes don't alert the admin about their own action. */
  actor: "guest" | "admin";
  previous?: { date: string; time: number } | undefined;
};

async function loadBooking(reference: string): Promise<Row | null> {
  const { data } = await sb.from("bookings").select("*").eq("reference", reference).maybeSingle();
  return (data as Row | null) ?? null;
}

/**
 * Entry point for booking events. Safe to call more than once for the same
 * event; safe to call when nothing is configured (records "skipped").
 * Never throws.
 */
export async function notifyBookingEvent(
  reference: string,
  event: NotifyEvent,
  ctx: EventContext,
): Promise<void> {
  try {
    const s = await loadSettings();
    if (!s) return;
    const r = await loadBooking(reference);
    if (!r) return;
    const facts = factsFromBooking(r, {
      location: await locationText(),
      siteUrl: s.publicSiteUrl,
      previous: ctx.previous,
    });
    const consent = Boolean(r["notify_consent"]);
    const occurrence =
      event === "BOOKING_RESCHEDULED" ? slotStamp(facts.date, facts.time) : undefined;

    const customerOn =
      event === "BOOKING_CONFIRMED"
        ? s.customerConfirmation
        : event === "BOOKING_RESCHEDULED" || event === "BOOKING_CANCELLED"
          ? s.customerUpdates
          : false;
    const adminOn =
      ctx.actor === "guest" &&
      (event === "BOOKING_CONFIRMED"
        ? s.adminNewBooking
        : event === "BOOKING_RESCHEDULED" || event === "BOOKING_CANCELLED"
          ? s.adminUpdates
          : false);

    const jobs: Promise<void>[] = [];
    if (customerOn && facts.customerPhone) {
      jobs.push(
        deliver({
          s,
          facts,
          event,
          occurrence,
          target: {
            recipient: "customer",
            phone: facts.customerPhone,
            channels: channelsFor("customer", s, consent),
            fallback: s.fallback,
          },
        }),
      );
    }
    const adminPhone = toE164(s.adminPhone);
    if (adminOn && adminPhone) {
      jobs.push(
        deliver({
          s,
          facts,
          event,
          occurrence,
          target: {
            recipient: "admin",
            phone: adminPhone,
            channels: channelsFor("admin", s, true),
            fallback: s.fallback,
          },
        }),
      );
    }
    await Promise.all(jobs);

    if (event === "BOOKING_CONFIRMED" || event === "BOOKING_RESCHEDULED")
      await scheduleReminders(r, s, facts, consent);
    if (event === "BOOKING_CANCELLED" || event === "BOOKING_COMPLETED" || event === "NO_SHOW")
      await cancelReminders(reference, null);
  } catch (e) {
    console.error("notification error", reference, event, e instanceof Error ? e.message : e);
  }
}

/** Waits for notifications at most `ms`, so a slow provider never slows a booking. */
export async function notifySoon(
  reference: string,
  event: NotifyEvent,
  ctx: EventContext,
  ms = 6000,
) {
  await Promise.race([
    notifyBookingEvent(reference, event, ctx),
    new Promise((r) => setTimeout(r, ms)),
  ]);
}

/* ── reminders ───────────────────────────────────────────────── */

async function cancelReminders(reference: string, keepOccurrence: string | null) {
  const { data } = await sb
    .from("notification_logs" as never)
    .select("id, payload, event_type")
    .eq("booking_id", reference)
    .eq("status", "scheduled");
  for (const row of (data ?? []) as { id: number; payload: { occurrence?: string } }[]) {
    if (keepOccurrence && row.payload.occurrence === keepOccurrence) continue;
    await sb
      .from("notification_logs" as never)
      .update({ status: "cancelled", error_message: "Appointment changed or ended" } as never)
      .eq("id", row.id)
      .eq("status", "scheduled");
  }
}

async function scheduleReminders(r: Row, s: NotifySettings, facts: BookingFacts, consent: boolean) {
  const occurrence = slotStamp(facts.date, facts.time);
  await cancelReminders(facts.reference, occurrence);
  if (!isActive(r) || !facts.customerPhone) return;
  const channels = channelsFor("customer", s, consent);
  if (!channels.length) return;
  const now = Date.now();
  const plan: [boolean, NotifyEvent, number][] = [
    [s.reminder24h, "BOOKING_REMINDER_24H", 24],
    [s.reminder2h, "BOOKING_REMINDER_2H", 2],
  ];
  for (const [on, event, hours] of plan) {
    if (!on) continue;
    const at = reminderAt(facts.date, facts.time, hours);
    // a reminder that would arrive within 30 minutes of booking adds nothing
    if (at.getTime() < now + 30 * 60_000) continue;
    await deliver({
      s,
      facts,
      event,
      occurrence,
      status: "scheduled",
      scheduledFor: at,
      target: {
        recipient: "customer",
        phone: facts.customerPhone,
        channels: [channels[0]!],
        fallback: false,
      },
    });
  }
}

/* ── dispatcher (cron) ───────────────────────────────────────── */

/**
 * Runs every few minutes (cron): sends due reminders, retries failed messages
 * whose back-off has passed, and resolves rows left behind by interrupted
 * requests. Returns counts for the cron log.
 */
export async function dispatchDue(limit = 40) {
  const s = await loadSettings();
  if (!s) return { ok: false, reason: "notifications not set up" };
  const nowIso = new Date().toISOString();
  const counts = { reminders: 0, retries: 0, stale: 0, cancelled: 0 };
  const location = await locationText();

  // 1) due reminders
  const { data: due } = await sb
    .from("notification_logs" as never)
    .select("*")
    .eq("status", "scheduled")
    .lte("scheduled_for", nowIso)
    .order("scheduled_for")
    .limit(limit);
  for (const row of (due ?? []) as LogRow[]) {
    const r = await loadBooking(row.booking_id);
    const facts = r ? factsFromBooking(r, { location, siteUrl: s.publicSiteUrl }) : null;
    const stillValid =
      r &&
      facts &&
      isActive(r) &&
      row.payload.occurrence === slotStamp(facts.date, facts.time) &&
      reminderAt(facts.date, facts.time, 0).getTime() > Date.now();
    if (!stillValid) {
      await sb
        .from("notification_logs" as never)
        .update({
          status: "cancelled",
          error_message: "Appointment changed, ended or already started",
        } as never)
        .eq("id", row.id)
        .eq("status", "scheduled");
      counts.cancelled++;
      continue;
    }
    // refresh the words from the snapshot (manage link etc.), then send
    await patchRow(row.id, {
      payload: {
        ...row.payload,
        vars: templateVars("customer", row.event_type, facts),
        text: messageText("customer", row.event_type, facts),
      },
    });
    if (!(await claim(row.id, "scheduled"))) continue;
    const fresh = {
      ...row,
      payload: {
        ...row.payload,
        vars: templateVars("customer", row.event_type, facts),
        text: messageText("customer", row.event_type, facts),
      },
    };
    const res = await attempt(fresh, s);
    counts.reminders++;
    if (res.outcome !== "sent" && s.fallback && row.channel === "whatsapp") {
      await deliver({
        s,
        facts,
        event: row.event_type,
        occurrence: row.payload.occurrence,
        target: {
          recipient: "customer",
          phone: row.recipient_phone,
          channels: ["sms"],
          fallback: false,
        },
      });
    }
  }

  // 2) retries of failed sends (back-off passed, attempts left)
  const { data: failed } = await sb
    .from("notification_logs" as never)
    .select("*")
    .eq("status", "failed")
    .lte("next_attempt_at", nowIso)
    .limit(limit);
  for (const row of (failed ?? []) as LogRow[]) {
    if (row.attempt_count >= MAX_ATTEMPTS) continue;
    // if the fallback already reached them, don't send the same news twice
    const twin = row.idempotency_key.replace(
      /\|(whatsapp|sms)$/,
      row.channel === "whatsapp" ? "|sms" : "|whatsapp",
    );
    const { data: other } = await sb
      .from("notification_logs" as never)
      .select("status")
      .eq("idempotency_key", twin)
      .maybeSingle();
    if (other && ["sent", "delivered"].includes((other as { status: string }).status)) {
      await patchRow(row.id, { next_attempt_at: null });
      continue;
    }
    if (!(await claim(row.id, "failed"))) continue;
    await attempt(row, s);
    counts.retries++;
  }

  // 3) rows interrupted mid-request
  const stale = new Date(Date.now() - 3 * 60_000).toISOString();
  const { data: queued } = await sb
    .from("notification_logs" as never)
    .select("*")
    .eq("status", "queued")
    .lte("created_at", stale)
    .limit(limit);
  for (const row of (queued ?? []) as LogRow[]) {
    if (!(await claim(row.id, "queued"))) continue;
    await attempt(row, s);
    counts.stale++;
  }
  // "sending" for minutes: outcome unknown, so never auto-resend (could duplicate)
  const { data: stuck } = await sb
    .from("notification_logs" as never)
    .select("id")
    .eq("status", "sending")
    .lte("updated_at", stale)
    .limit(limit);
  for (const row of (stuck ?? []) as { id: number }[]) {
    await sb
      .from("notification_logs" as never)
      .update({
        status: "failed",
        error_code: "UNKNOWN_OUTCOME",
        error_message:
          "Interrupted while sending; not retried automatically to avoid a duplicate. Retry from Admin if needed.",
        next_attempt_at: null,
      } as never)
      .eq("id", row.id)
      .eq("status", "sending");
    counts.stale++;
  }
  // System health reads this to tell whether the schedule is running
  await sb
    .from("site_settings")
    .upsert({ key: "job_notify_dispatch", value: { at: Date.now(), ...counts } as never })
    .then(
      () => undefined,
      () => undefined,
    );
  return { ok: true, ...counts };
}

/* ── delivery reports ────────────────────────────────────────── */

const RANK: Record<string, number> = { sending: 1, sent: 2, failed: 3, delivered: 4 };

/** Applies provider delivery reports. Never moves a message backwards (delivered stays delivered). */
export async function applyDeliveryUpdates(updates: DeliveryUpdate[]) {
  let applied = 0;
  for (const u of updates) {
    const { data } = await sb
      .from("notification_logs" as never)
      .select("id, status")
      .eq("provider_message_id", u.messageId);
    for (const row of (data ?? []) as { id: number; status: string }[]) {
      if ((RANK[u.status] ?? 0) <= (RANK[row.status] ?? 0)) continue;
      await patchRow(row.id, {
        status: u.status,
        ...(u.status === "delivered" ? { delivered_at: new Date().toISOString() } : {}),
        ...(u.status === "failed"
          ? {
              error_code: u.errorCode ?? "DELIVERY_FAILED",
              error_message: u.errorMessage ?? "Provider reported a delivery failure",
              next_attempt_at: null,
            }
          : {}),
      });
      applied++;
    }
  }
  return applied;
}

/* ── admin helpers ───────────────────────────────────────────── */

/** Sends a sample message to the configured test number (admins only; caller checks). */
export async function sendTest(
  kind: "customer" | "admin",
  channel: Channel,
): Promise<{ ok: boolean; status: string; detail: string }> {
  const s = await loadSettings();
  if (!s)
    return {
      ok: false,
      status: "unavailable",
      detail: "Notifications aren't set up in the database yet.",
    };
  const phone = toE164(s.testPhone);
  if (!phone) return { ok: false, status: "invalid", detail: "Set a test number first." };
  const facts: BookingFacts = {
    reference: "HB-TEST",
    customerName: "Test Guest",
    customerPhone: phone,
    date: new Date(Date.now() + 330 * 60_000 + 86_400_000).toISOString().slice(0, 10),
    time: 16 * 60 + 30,
    services: ["Bhargav's Signature"],
    minutes: 30,
    price: 1000,
    priceFrom: false,
    location: await locationText(),
    manageUrl: s.publicSiteUrl ? `${s.publicSiteUrl.replace(/\/+$/, "")}/manage` : "",
  };
  const slot = templateKey(kind, "BOOKING_CONFIRMED");
  const made = await ensureRow({
    idempotency_key: `TEST|${kind}|${channel}|${Date.now()}`,
    booking_id: "HB-TEST",
    event_type: "BOOKING_CONFIRMED",
    recipient_type: "test",
    recipient_phone: phone,
    channel,
    provider: s.provider,
    status: "queued",
    payload: {
      vars: templateVars(kind, "BOOKING_CONFIRMED", facts),
      text: messageText(kind, "BOOKING_CONFIRMED", facts),
      slot,
    },
  });
  if (!made || !(await claim(made.row.id, "queued")))
    return { ok: false, status: "error", detail: "Couldn't record the test." };
  const r = await attempt(made.row, s);
  const { data } = await sb
    .from("notification_logs" as never)
    .select("status, error_message")
    .eq("id", made.row.id)
    .maybeSingle();
  const row = (data ?? {}) as { status?: string; error_message?: string };
  return {
    ok: r.outcome === "sent",
    status: row.status ?? r.outcome,
    detail:
      r.outcome === "sent"
        ? "Accepted by the provider. Delivery is confirmed when the provider reports it."
        : (row.error_message ?? "Not sent."),
  };
}

/** Manual retry of one failed/skipped message from Admin (resets back-off). */
export async function retryLog(id: number): Promise<{ ok: boolean; detail: string }> {
  const s = await loadSettings();
  if (!s) return { ok: false, detail: "Notifications aren't set up." };
  const { data } = await sb
    .from("notification_logs" as never)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  const row = data as LogRow | null;
  if (!row) return { ok: false, detail: "Message not found." };
  if (!["failed", "skipped"].includes(row.status))
    return { ok: false, detail: `Can't retry a message that is ${row.status}.` };
  if (!(await claim(row.id, row.status))) return { ok: false, detail: "Already being sent." };
  const r = await attempt(row, s);
  return {
    ok: r.outcome === "sent",
    detail: r.outcome === "sent" ? "Sent." : "Still not sent; see the error on the message.",
  };
}
