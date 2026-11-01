// Email sending through a free-tier provider. Secrets are server environment
// variables only:
//   BREVO_API_KEY   (Brevo: 300 emails/day free; a verified sender email is enough)
//   RESEND_API_KEY  (Resend: 3,000/month free; needs your own domain verified)
// Like the WhatsApp adapter, it only reports "sent" when the provider accepted
// the email; anything missing makes the message "skipped" with the reason.

export type EmailProvider = "brevo" | "resend";
export type EmailConfig = { provider: EmailProvider; from: string; fromName: string };
export type EmailMessage = {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  text: string;
};
export type EmailResult =
  | { ok: true; messageId: string | null }
  | { ok: false; code: string; message: string; retryable: boolean };

const keyFor = (p: EmailProvider) =>
  process.env[p === "resend" ? "RESEND_API_KEY" : "BREVO_API_KEY"] ?? "";

export function emailStatus(cfg: EmailConfig) {
  const missing = [
    ...(keyFor(cfg.provider)
      ? []
      : [`${cfg.provider === "resend" ? "RESEND_API_KEY" : "BREVO_API_KEY"} secret`]),
    ...(cfg.from ? [] : ["sender email address"]),
  ];
  return {
    provider: cfg.provider === "resend" ? "Resend" : "Brevo",
    configured: missing.length === 0,
    missing,
  };
}

export function canSendEmail(cfg: EmailConfig): { ok: true } | { ok: false; reason: string } {
  const st = emailStatus(cfg);
  return st.configured
    ? { ok: true }
    : { ok: false, reason: `Email not configured (${st.missing.join(", ")})` };
}

async function post(url: string, headers: Record<string, string>, body: unknown) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json", ...headers },
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

export async function sendEmail(cfg: EmailConfig, m: EmailMessage): Promise<EmailResult> {
  try {
    const r =
      cfg.provider === "resend"
        ? await post(
            "https://api.resend.com/emails",
            { authorization: `Bearer ${keyFor("resend")}` },
            {
              from: `${cfg.fromName} <${cfg.from}>`,
              to: [m.to],
              subject: m.subject,
              html: m.html,
              text: m.text,
            },
          )
        : await post(
            "https://api.brevo.com/v3/smtp/email",
            { "api-key": keyFor("brevo") },
            {
              sender: { name: cfg.fromName, email: cfg.from },
              to: [{ email: m.to, ...(m.toName ? { name: m.toName } : {}) }],
              subject: m.subject,
              htmlContent: m.html,
              textContent: m.text,
            },
          );
    if (r.status >= 200 && r.status < 300) {
      const id = (r.json?.["id"] ?? r.json?.["messageId"] ?? null) as string | null;
      return { ok: true, messageId: id };
    }
    const msg = String(
      r.json?.["message"] ?? r.json?.["name"] ?? r.text.slice(0, 200) ?? `HTTP ${r.status}`,
    );
    return {
      ok: false,
      code: String(r.json?.["code"] ?? `HTTP_${r.status}`),
      message: msg,
      retryable: r.status === 429 || r.status >= 500,
    };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    return {
      ok: false,
      code: aborted ? "TIMEOUT" : "NETWORK",
      message: aborted
        ? "Email provider did not answer in 10 s"
        : "Couldn't reach the email provider",
      retryable: true,
    };
  }
}
