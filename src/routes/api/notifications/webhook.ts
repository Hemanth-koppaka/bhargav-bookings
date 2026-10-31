import { createFileRoute } from "@tanstack/react-router";

// Delivery reports from the messaging provider (MSG91 → Webhooks / DLR URL):
//   https://<site>/api/notifications/webhook?key=<MSG91_WEBHOOK_SECRET>
// Only marks messages sent/delivered/failed; it can never create or send one.
export const Route = createFileRoute("/api/notifications/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env["MSG91_WEBHOOK_SECRET"];
        const key =
          new URL(request.url).searchParams.get("key") ??
          request.headers.get("x-webhook-key") ??
          "";
        if (!secret) return new Response("Webhook not configured", { status: 503 });
        const { createHash, timingSafeEqual } = await import("node:crypto");
        const digest = (v: string) => createHash("sha256").update(v, "utf8").digest();
        if (!timingSafeEqual(digest(key), digest(secret)))
          return new Response("Unauthorized", { status: 401 });

        // MSG91 posts JSON, or form data with a JSON "data" field (SMS reports)
        const raw = await request.text();
        if (raw.length > 512_000) return new Response("Too large", { status: 413 });
        let body: unknown = null;
        try {
          body = JSON.parse(raw);
        } catch {
          const form = new URLSearchParams(raw);
          const data = form.get("data");
          try {
            body = data ? JSON.parse(data) : Object.fromEntries(form);
          } catch {
            body = Object.fromEntries(form);
          }
        }
        const { getProvider } = await import("@/lib/notify/provider.server");
        const { applyDeliveryUpdates, loadSettings } = await import("@/lib/notify/service.server");
        const settings = await loadSettings();
        const provider = await getProvider(settings?.provider ?? "msg91");
        const updates = provider.parseWebhook(body);
        const applied = await applyDeliveryUpdates(updates);
        return Response.json({ ok: true, received: updates.length, applied });
      },
    },
  },
});
