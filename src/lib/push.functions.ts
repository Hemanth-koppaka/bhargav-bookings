import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Phone notifications for the salon (admin only). See push.server.ts.

const pin = z.string().max(512);

async function admin(token: string) {
  const { assertAdmin } = await import("./admin-auth.server");
  return assertAdmin(token);
}

/** The site's public push key (to subscribe a phone) and the phones already on. */
export const adminPushInfo = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ pin }).parse(d))
  .handler(async ({ data }) => {
    await admin(data.pin);
    const P = await import("./push.server");
    const [v, subs] = await Promise.all([P.getVapid(), P.listSubs()]);
    return {
      publicKey: v.publicKey,
      devices: subs.map((s) => ({ endpoint: s.endpoint, device: s.device, at: s.at })),
    };
  });

export const adminPushSubscribe = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        pin,
        endpoint: z.string().url().max(1000),
        p256dh: z.string().min(40).max(200),
        auth: z.string().min(10).max(60),
        device: z.string().max(60),
        origin: z.string().max(200),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    await admin(data.pin);
    // only real browser push services
    if (!/^https:\/\//.test(data.endpoint)) return { ok: false as const };
    const P = await import("./push.server");
    await P.addSub({
      endpoint: data.endpoint,
      keys: { p256dh: data.p256dh, auth: data.auth },
      device: data.device || "Phone",
      origin: data.origin,
      at: Date.now(),
    });
    return { ok: true as const };
  });

export const adminPushUnsubscribe = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ pin, endpoint: z.string().max(1000) }).parse(d))
  .handler(async ({ data }) => {
    await admin(data.pin);
    const P = await import("./push.server");
    await P.removeSub(data.endpoint);
    return { ok: true as const };
  });

export const adminPushTest = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ pin }).parse(d))
  .handler(async ({ data }) => {
    await admin(data.pin);
    const P = await import("./push.server");
    return P.pushToSalon({
      title: "Booking alerts are on",
      body: "New bookings, moves and cancellations will appear here.",
      url: "/admin",
      tag: "test",
    });
  });
