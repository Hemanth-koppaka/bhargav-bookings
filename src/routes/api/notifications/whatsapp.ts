import { createFileRoute } from "@tanstack/react-router";

// Meta WhatsApp Cloud API webhook (delivery reports for messages we sent).
//   Callback URL: https://<site>/api/notifications/whatsapp
//   Verify token: the WHATSAPP_VERIFY_TOKEN secret
// GET answers Meta's one-time verification; POST is checked against
// WHATSAPP_APP_SECRET (X-Hub-Signature-256) and only ever marks messages
// sent / delivered / failed. It can never create or send one.
export const Route = createFileRoute("/api/notifications/whatsapp")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const q = new URL(request.url).searchParams;
        const expected = process.env["WHATSAPP_VERIFY_TOKEN"];
        if (!expected) return new Response("Webhook not configured", { status: 503 });
        if (q.get("hub.mode") === "subscribe" && q.get("hub.verify_token") === expected)
          return new Response(q.get("hub.challenge") ?? "", { status: 200 });
        return new Response("Forbidden", { status: 403 });
      },
      POST: async ({ request }) => {
        const secret = process.env["WHATSAPP_APP_SECRET"];
        if (!secret) return new Response("Webhook not configured", { status: 503 });
        const raw = await request.text();
        if (raw.length > 512_000) return new Response("Too large", { status: 413 });
        const { createHmac, timingSafeEqual } = await import("node:crypto");
        const given = (request.headers.get("x-hub-signature-256") ?? "").replace(/^sha256=/, "");
        const want = createHmac("sha256", secret).update(raw, "utf8").digest("hex");
        const a = Buffer.from(given, "utf8");
        const b = Buffer.from(want, "utf8");
        if (a.length !== b.length || !timingSafeEqual(a, b))
          return new Response("Unauthorized", { status: 401 });
        let body: unknown = null;
        try {
          body = JSON.parse(raw);
        } catch {
          return new Response("Bad JSON", { status: 400 });
        }
        const { meta } = await import("@/lib/notify/meta.server");
        const { applyDeliveryUpdates } = await import("@/lib/notify/service.server");
        const updates = meta.parseWebhook(body);
        const applied = updates.length ? await applyDeliveryUpdates(updates) : 0;
        // Meta only needs a quick 200
        return Response.json({ ok: true, received: updates.length, applied });
      },
    },
  },
});
