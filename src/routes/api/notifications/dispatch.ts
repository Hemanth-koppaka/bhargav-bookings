import { createFileRoute } from "@tanstack/react-router";

// Scheduled every 10 minutes (Lovable cron, Bearer LOVABLE_CRON_SECRET):
// sends due 24 h / 2 h reminders, retries failed messages after back-off and
// resolves messages interrupted mid-request. POST /api/notifications/dispatch
export const Route = createFileRoute("/api/notifications/dispatch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authenticateCronRequest } = await import("@/integrations/supabase/cron-auth");
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;
        const { dispatchDue } = await import("@/lib/notify/service.server");
        return Response.json(await dispatchDue());
      },
    },
  },
});
