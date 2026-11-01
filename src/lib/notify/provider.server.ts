// Messaging providers sit behind one small interface, so MSG91 can be swapped
// for another provider (Gupshup, Twilio, Meta Cloud API…) by adding one file,
// without touching bookings. Secrets come only from server environment
// variables; everything else (sender number, template names) is admin config.
import type { Channel } from "./messages";

export type ProviderConfig = {
  /** WhatsApp sender ("integrated") number in E.164, e.g. +919876543210. */
  whatsappNumber?: string;
  whatsappLanguage?: string; // template language code, default "en"
  whatsappNamespace?: string; // only if the provider asks for it
  /** Template per slot ("customer.BOOKING_CONFIRMED" …): WhatsApp name and SMS (DLT/flow) id. */
  templates?: Record<string, { whatsapp?: string; sms?: string }>;
  /** Name stem of SMS template variables (var → var1, var2…). */
  smsVarPrefix?: string;
  /** Override API endpoints if the provider changes them. */
  endpoints?: { whatsapp?: string; sms?: string };
};

export type SendRequest = {
  channel: Channel;
  to: string; // E.164
  slot: string; // template slot, e.g. "customer.BOOKING_CONFIRMED"
  vars: string[];
  text: string; // full text (for providers that accept free text, and for logs)
};

export type SendResult =
  | { ok: true; messageId: string | null }
  | { ok: false; code: string; message: string; retryable: boolean };

export type DeliveryUpdate = {
  messageId: string;
  status: "sent" | "delivered" | "failed";
  errorCode?: string;
  errorMessage?: string;
};

export type ProviderStatus = {
  provider: string;
  /** Credentials present on the server. */
  connected: boolean;
  whatsapp: { configured: boolean; missing: string[] };
  sms: { configured: boolean; missing: string[] };
};

export interface NotificationProvider {
  name: string;
  status(cfg: ProviderConfig): ProviderStatus;
  /** True when this channel can send this template slot right now. */
  canSend(
    channel: Channel,
    slot: string,
    cfg: ProviderConfig,
  ): { ok: true } | { ok: false; reason: string };
  send(req: SendRequest, cfg: ProviderConfig): Promise<SendResult>;
  /** Turns a delivery-report webhook body into status updates (unknown shapes → []). */
  parseWebhook(body: unknown): DeliveryUpdate[];
}

export async function getProvider(name: string): Promise<NotificationProvider> {
  switch (name) {
    case "msg91":
    default:
      return (await import("./msg91.server")).msg91;
  }
}
