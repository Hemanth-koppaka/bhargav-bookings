import { createFileRoute } from "@tanstack/react-router";

// Scheduled clean-up of guests' reference photos (finished visits and abandoned
// uploads). Call with the Lovable cron secret: POST /api/photo-sweep
// The same sweep also runs, at most hourly, whenever bookings are made or the
// admin console is open, so photos are removed even without a schedule.
export const Route = createFileRoute("/api/photo-sweep")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { authenticateCronRequest } = await import("@/integrations/supabase/cron-auth");
        const denied = await authenticateCronRequest(request);
        if (denied) return denied;
        const { sweepPhotos } = await import("@/lib/photos.server");
        const result = await sweepPhotos(true);
        return Response.json(result);
      },
    },
  },
});
