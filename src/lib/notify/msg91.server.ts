// MSG91 adapter: WhatsApp template messages and DLT SMS (Flow) for India.
//
// Secret (server environment only, never in the browser or the database):
//   MSG91_AUTH_KEY        API auth key from the MSG91 panel
//   MSG91_WEBHOOK_SECRET  random string; append ?key=<secret> to the webhook URL
//
// Everything else is set in Admin → Notifications: the WhatsApp sender number
// connected in MSG91, approved template names, and SMS (DLT) template ids.
// If anything required is missing the message is recorded as "skipped" with
// the reason; nothing is ever reported as sent unless MSG91 accepted it.
import type { Channel } from "./messages";
import type {
  DeliveryUpdate,
  NotificationProvider,
  ProviderConfig,
  SendRequest,
  SendResult,
} from "./provider.server";

const WHATSAPP_URL = "https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/";
const SMS_URL = "https://control.msg91.com/api/v5/flow";

const authKey = () => process.env["MSG91_AUTH_KEY"] ?? "";
const digits = (e164: string) => e164.replace(/\D/g, "");

async function post(
  url: string,
  body: unknown,
): Promise<{ status: number; json: Record<string, unknown> | null; text: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        authkey: authKey(),
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json: Record<string, unknown> | null = null;
    try {
      json = JSON.parse(text) as Record<string, unknown>;
    } catch {
      /* not JSON */
    }
    return { status: res.status, json, text };
  } finally {
    clearTimeout(timer);
  }
}

const str = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v) : "");

/** Pulls a request/message id out of an MSG91 response, wherever it sits. */
function findId(j: Record<string, unknown> | null): string | null {
  if (!j) return null;
  const data = (j["data"] ?? {}) as Record<string, unknown>;
  return (
    str(j["request_id"]) ||
    str(data["request_id"]) ||
    str(data["requestId"]) ||
    str(data["uuid"]) ||
    str(data["message_uuid"]) ||
    (j["type"] === "success" ? str(j["message"]) : "") ||
    null
  );
}

function failure(r: {
  status: number;
  json: Record<string, unknown> | null;
  text: string;
}): SendResult {
  const j = r.json ?? {};
  const message =
    str(j["message"]) ||
    str(j["errors"]) ||
    str((j["data"] as Record<string, unknown> | undefined)?.["message"]) ||
    r.text.slice(0, 200) ||
    `HTTP ${r.status}`;
  return {
    ok: false,
    code: str(j["code"]) || `HTTP_${r.status}`,
    message,
    // rate limits and server errors can be retried; bad templates/numbers can't
    retryable: r.status === 429 || r.status >= 500,
  };
}

export const msg91: NotificationProvider = {
  name: "msg91",

  status(cfg) {
    const connected = Boolean(authKey());
    const t = Object.values(cfg.templates ?? {});
    const waMissing = [
      ...(connected ? [] : ["MSG91_AUTH_KEY secret"]),
      ...(cfg.whatsappNumber ? [] : ["WhatsApp sender number"]),
      ...(t.some((x) => x.whatsapp) ? [] : ["approved WhatsApp templates"]),
    ];
    const smsMissing = [
      ...(connected ? [] : ["MSG91_AUTH_KEY secret"]),
      ...(t.some((x) => x.sms) ? [] : ["SMS (DLT) template ids"]),
    ];
    return {
      provider: "MSG91",
      connected,
      whatsapp: { configured: waMissing.length === 0, missing: waMissing },
      sms: { configured: smsMissing.length === 0, missing: smsMissing },
    };
  },

  canSend(channel: Channel, slot: string, cfg: ProviderConfig) {
    if (!authKey())
      return { ok: false, reason: "Provider not configured (MSG91_AUTH_KEY missing)" };
    const t = cfg.templates?.[slot];
    if (channel === "whatsapp") {
      if (!cfg.whatsappNumber) return { ok: false, reason: "WhatsApp sender number not set" };
      if (!t?.whatsapp) return { ok: false, reason: `No approved WhatsApp template for ${slot}` };
    } else if (!t?.sms) return { ok: false, reason: `No SMS template for ${slot}` };
    return { ok: true };
  },

  async send(req: SendRequest, cfg: ProviderConfig): Promise<SendResult> {
    const t = cfg.templates?.[req.slot] ?? {};
    try {
      if (req.channel === "whatsapp") {
        const components = Object.fromEntries(
          req.vars.map((v, i) => [`body_${i + 1}`, { type: "text", value: v || "-" }]),
        );
        const r = await post(cfg.endpoints?.whatsapp || WHATSAPP_URL, {
          integrated_number: digits(cfg.whatsappNumber ?? ""),
          content_type: "template",
          payload: {
            messaging_product: "whatsapp",
            type: "template",
            template: {
              name: t.whatsapp,
              language: { code: cfg.whatsappLanguage || "en", policy: "deterministic" },
              ...(cfg.whatsappNamespace ? { namespace: cfg.whatsappNamespace } : {}),
              to_and_components: [{ to: [digits(req.to)], components }],
            },
          },
        });
        const j = r.json;
        const ok =
          r.status < 300 &&
          j !== null &&
          (j["status"] === "success" || j["hasError"] === false || j["type"] === "success");
        return ok ? { ok: true, messageId: findId(j) } : failure(r);
      }
      const prefix = cfg.smsVarPrefix || "var";
      const recipient: Record<string, string> = { mobiles: digits(req.to) };
      req.vars.forEach((v, i) => (recipient[`${prefix}${i + 1}`] = v));
      const r = await post(cfg.endpoints?.sms || SMS_URL, {
        template_id: t.sms,
        short_url: "0",
        recipients: [recipient],
      });
      const ok = r.status < 300 && r.json?.["type"] === "success";
      return ok ? { ok: true, messageId: findId(r.json) } : failure(r);
    } catch (e) {
      const aborted = e instanceof Error && e.name === "AbortError";
      return {
        ok: false,
        code: aborted ? "TIMEOUT" : "NETWORK",
        message: aborted ? "Provider did not answer in 10 s" : "Couldn't reach the provider",
        retryable: true,
      };
    }
  },

  /**
   * MSG91 delivery reports arrive in a few shapes (SMS DLR lists, WhatsApp
   * status events). Walk the body and collect every object that pairs an id
   * with a status we understand.
   */
  parseWebhook(body: unknown): DeliveryUpdate[] {
    const out: DeliveryUpdate[] = [];
    const ID_KEYS = [
      "requestId",
      "request_id",
      "uuid",
      "messageId",
      "message_id",
      "message_uuid",
      "requestID",
    ];
    const visit = (node: unknown, inheritedId?: string) => {
      if (Array.isArray(node)) return node.forEach((n) => visit(n, inheritedId));
      if (!node || typeof node !== "object") return;
      const o = node as Record<string, unknown>;
      const id = ID_KEYS.map((k) => str(o[k])).find(Boolean) || inheritedId;
      const raw = (
        str(o["status"]) ||
        str(o["desc"]) ||
        str(o["eventName"]) ||
        str(o["event"])
      ).toLowerCase();
      const status = /deliver|read|^1$/.test(raw)
        ? "delivered"
        : /fail|reject|undeliver|expired|^2$|^16$/.test(raw)
          ? "failed"
          : /sent|submit|accepted|^8$/.test(raw)
            ? "sent"
            : null;
      if (id && status) {
        out.push({
          messageId: id,
          status,
          ...(status === "failed"
            ? {
                errorCode: str(o["code"]) || str(o["errorCode"]) || raw,
                errorMessage: str(o["reason"]) || str(o["failureReason"]) || str(o["desc"]) || raw,
              }
            : {}),
        });
      }
      for (const v of Object.values(o)) if (v && typeof v === "object") visit(v, id);
    };
    visit(body);
    // the same report can appear at several levels of the body
    return [...new Map(out.map((u) => [`${u.messageId}|${u.status}`, u])).values()];
  },
};
