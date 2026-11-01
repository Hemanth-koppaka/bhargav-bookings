// Meta WhatsApp Cloud API adapter: sends WhatsApp template messages straight
// from the salon's own WhatsApp Business number, with no middleman.
//
// Secrets (server environment only, never in the browser or the database):
//   WHATSAPP_TOKEN            permanent access token (System User) from Meta Business
//   WHATSAPP_PHONE_NUMBER_ID  the "Phone number ID" shown in WhatsApp → API Setup
//   WHATSAPP_APP_SECRET       app secret, used to verify delivery webhooks
//   WHATSAPP_VERIFY_TOKEN     any random string; typed into Meta's webhook setup
//
// Template names (approved in WhatsApp Manager) are set in Admin → Notifications.
// SMS isn't part of this API, so SMS slots are reported as not configured.
import type { Channel } from "./messages";
import type {
  DeliveryUpdate,
  NotificationProvider,
  ProviderConfig,
  SendRequest,
  SendResult,
} from "./provider.server";

const GRAPH = "https://graph.facebook.com/v21.0";
const token = () => process.env["WHATSAPP_TOKEN"] ?? "";
const phoneId = () => process.env["WHATSAPP_PHONE_NUMBER_ID"] ?? "";
const digits = (e164: string) => e164.replace(/\D/g, "");
const str = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v) : "");

// Meta error codes worth retrying (rate limits, temporary/service errors)
const RETRYABLE = new Set(["1", "2", "4", "80007", "130429", "131000", "131016", "131048", "131056", "133004"]);

export const meta: NotificationProvider = {
  name: "meta",

  status(cfg) {
    const connected = Boolean(token() && phoneId());
    const t = Object.values(cfg.templates ?? {});
    const waMissing = [
      ...(token() ? [] : ["WHATSAPP_TOKEN secret"]),
      ...(phoneId() ? [] : ["WHATSAPP_PHONE_NUMBER_ID secret"]),
      ...(t.some((x) => x.whatsapp) ? [] : ["approved WhatsApp templates"]),
    ];
    return {
      provider: "Meta WhatsApp Cloud API",
      connected,
      whatsapp: { configured: waMissing.length === 0, missing: waMissing },
      sms: { configured: false, missing: ["SMS isn't available through Meta (use MSG91 for SMS)"] },
    };
  },

  canSend(channel: Channel, slot: string, cfg: ProviderConfig) {
    if (channel !== "whatsapp") return { ok: false, reason: "SMS isn't available through Meta's WhatsApp API" };
    if (!token() || !phoneId())
      return { ok: false, reason: "Provider not configured (WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID missing)" };
    if (!cfg.templates?.[slot]?.whatsapp) return { ok: false, reason: `No approved WhatsApp template for ${slot}` };
    return { ok: true };
  },

  async send(req: SendRequest, cfg: ProviderConfig): Promise<SendResult> {
    const name = cfg.templates?.[req.slot]?.whatsapp ?? "";
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10_000);
    try {
      const res = await fetch(cfg.endpoints?.whatsapp || `${GRAPH}/${phoneId()}/messages`, {
        method: "POST",
        headers: { authorization: `Bearer ${token()}`, "content-type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: digits(req.to),
          type: "template",
          template: {
            name,
            language: { code: cfg.whatsappLanguage || "en" },
            ...(req.vars.length
              ? {
                  components: [
                    {
                      type: "body",
                      // WhatsApp rejects empty, multi-line or very long parameters
                      parameters: req.vars.map((v) => ({
                        type: "text",
                        text: (v || "-").replace(/\s*\n+\s*/g, " · ").slice(0, 1000),
                      })),
                    },
                  ],
                }
              : {}),
          },
        }),
        signal: ctrl.signal,
      });
      const j = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      const id = str((j?.["messages"] as Array<Record<string, unknown>> | undefined)?.[0]?.["id"]);
      if (res.ok && id) return { ok: true, messageId: id };
      const err = (j?.["error"] ?? {}) as Record<string, unknown>;
      const code = str(err["code"]) || `HTTP_${res.status}`;
      const data = (err["error_data"] ?? {}) as Record<string, unknown>;
      return {
        ok: false,
        code,
        message: str(data["details"]) || str(err["message"]) || `Meta answered ${res.status}`,
        retryable: res.status === 429 || res.status >= 500 || RETRYABLE.has(code),
      };
    } catch (e) {
      const aborted = e instanceof Error && e.name === "AbortError";
      return {
        ok: false,
        code: aborted ? "TIMEOUT" : "NETWORK",
        message: aborted ? "Meta did not answer in 10 s" : "Couldn't reach Meta",
        retryable: true,
      };
    } finally {
      clearTimeout(timer);
    }
  },

  /** entry[].changes[].value.statuses[] → sent / delivered (read counts as delivered) / failed. */
  parseWebhook(body: unknown): DeliveryUpdate[] {
    const out: DeliveryUpdate[] = [];
    const entries = ((body as Record<string, unknown> | null)?.["entry"] ?? []) as Array<Record<string, unknown>>;
    for (const e of Array.isArray(entries) ? entries : []) {
      for (const c of (e["changes"] ?? []) as Array<Record<string, unknown>>) {
        const value = (c["value"] ?? {}) as Record<string, unknown>;
        for (const s of (value["statuses"] ?? []) as Array<Record<string, unknown>>) {
          const id = str(s["id"]);
          const raw = str(s["status"]).toLowerCase();
          const status = raw === "delivered" || raw === "read" ? "delivered" : raw === "failed" ? "failed" : raw === "sent" ? "sent" : null;
          if (!id || !status) continue;
          const er = ((s["errors"] ?? []) as Array<Record<string, unknown>>)[0] ?? {};
          out.push({
            messageId: id,
            status,
            ...(status === "failed"
              ? {
                  errorCode: str(er["code"]) || "FAILED",
                  errorMessage:
                    str((er["error_data"] as Record<string, unknown> | undefined)?.["details"]) ||
                    str(er["message"]) ||
                    str(er["title"]) ||
                    "WhatsApp couldn't deliver the message",
                }
              : {}),
          });
        }
      }
    }
    return out;
  },
};
