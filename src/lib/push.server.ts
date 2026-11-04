// Free phone notifications for the salon (Web Push): new online bookings,
// reschedules and cancellations pop up on the phones where the admin console
// turned alerts on. No paid service: the browser's own push service delivers
// them (Google for Android/Chrome, Apple for iPhone home-screen apps).
//
// Standards: VAPID (RFC 8292) to identify the site, and aes128gcm payload
// encryption (RFC 8291) so only the subscribed phone can read the message.
// The site's VAPID key pair is created once and kept server-side in
// site_settings (never sent to browsers except the public half).
import { supabaseAdmin as sb } from "@/integrations/supabase/client.server";

const VAPID_KEY = "push_vapid";
const SUBS_KEY = "push_subscriptions";

export type PushSub = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  /** e.g. "iPhone", "Android" — shown in the console */
  device: string;
  /** the site the phone subscribed from (VAPID contact) */
  origin: string;
  at: number;
};

export type PushMessage = { title: string; body: string; url?: string; tag?: string };

/* ── base64url ─────────────────────────────────────────────── */

const b64u = (bytes: Uint8Array) => {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const unb64u = (s: string) => {
  const t = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(t + "===".slice((t.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};
const enc = new TextEncoder();
/** WebCrypto takes plain byte arrays (TypeScript's lib types are stricter than needed). */
const buf = (u: Uint8Array) => u as unknown as BufferSource;
const concat = (...parts: Uint8Array[]) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
};

/* ── the site's VAPID keys ─────────────────────────────────── */

type Vapid = { publicKey: string; privateJwk: JsonWebKey };
let vapidCache: Vapid | null = null;

export async function getVapid(): Promise<Vapid> {
  if (vapidCache) return vapidCache;
  const { data } = await sb.from("site_settings").select("value").eq("key", VAPID_KEY).maybeSingle();
  const saved = data?.value as unknown as Vapid | null;
  if (saved?.publicKey && saved.privateJwk) return (vapidCache = saved);
  const pair = (await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", pair.publicKey));
  const fresh: Vapid = {
    publicKey: b64u(raw),
    privateJwk: await crypto.subtle.exportKey("jwk", pair.privateKey),
  };
  // keep the first one saved if two requests race
  const { error } = await sb.from("site_settings").insert({ key: VAPID_KEY, value: fresh as never });
  if (error) {
    const { data: again } = await sb.from("site_settings").select("value").eq("key", VAPID_KEY).maybeSingle();
    if ((again?.value as unknown as Vapid | null)?.publicKey) return (vapidCache = again!.value as unknown as Vapid);
  }
  return (vapidCache = fresh);
}

async function vapidHeader(endpoint: string, origin: string, v: Vapid) {
  const aud = new URL(endpoint).origin;
  const head = b64u(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const claims = b64u(
    enc.encode(
      JSON.stringify({
        aud,
        exp: Math.floor(Date.now() / 1000) + 12 * 3600,
        sub: /^https:\/\//.test(origin) ? origin : "mailto:salon@hairbybhargav.app",
      }),
    ),
  );
  const key = await crypto.subtle.importKey("jwk", v.privateJwk, { name: "ECDSA", namedCurve: "P-256" }, false, [
    "sign",
  ]);
  // WebCrypto gives the raw r‖s signature JWS expects
  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, buf(enc.encode(`${head}.${claims}`))),
  );
  return `vapid t=${head}.${claims}.${b64u(sig)}, k=${v.publicKey}`;
}

/* ── payload encryption (RFC 8291, aes128gcm) ──────────────── */

async function hkdf(salt: Uint8Array, ikm: Uint8Array, info: Uint8Array, bytes: number) {
  const key = await crypto.subtle.importKey("raw", buf(ikm), "HKDF", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt: buf(salt), info: buf(info) }, key, bytes * 8));
}

/** Encrypts a message for one subscription. `test` fixes the random parts (tests only). */
export async function encryptPayload(
  sub: Pick<PushSub, "keys">,
  plaintext: Uint8Array,
  test?: { salt: Uint8Array; serverKeys: CryptoKeyPair },
) {
  const uaPublic = unb64u(sub.keys.p256dh);
  const authSecret = unb64u(sub.keys.auth);
  const server =
    test?.serverKeys ??
    ((await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])) as CryptoKeyPair);
  const asPublic = new Uint8Array(await crypto.subtle.exportKey("raw", server.publicKey));
  const uaKey = await crypto.subtle.importKey("raw", buf(uaPublic), { name: "ECDH", namedCurve: "P-256" }, false, []);
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, server.privateKey, 256),
  );
  const keyInfo = concat(enc.encode("WebPush: info\0"), uaPublic, asPublic);
  const ikm = await hkdf(authSecret, shared, keyInfo, 32);
  const salt = test?.salt ?? crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, ikm, enc.encode("Content-Encoding: nonce\0"), 12);
  const aes = await crypto.subtle.importKey("raw", buf(cek), "AES-GCM", false, ["encrypt"]);
  // one record: the message, then the 0x02 "last record" delimiter
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: buf(nonce) }, aes, buf(concat(plaintext, new Uint8Array([2])))),
  );
  const rs = new Uint8Array([0, 0, 16, 0]); // record size 4096
  return concat(salt, rs, new Uint8Array([asPublic.length]), asPublic, cipher);
}

/* ── subscriptions ─────────────────────────────────────────── */

export async function listSubs(): Promise<PushSub[]> {
  const { data } = await sb.from("site_settings").select("value").eq("key", SUBS_KEY).maybeSingle();
  const v = data?.value as unknown as PushSub[] | null;
  return Array.isArray(v) ? v : [];
}

async function saveSubs(list: PushSub[]) {
  await sb.from("site_settings").upsert({ key: SUBS_KEY, value: list.slice(-20) as never });
}

export async function addSub(sub: PushSub) {
  const list = (await listSubs()).filter((x) => x.endpoint !== sub.endpoint);
  await saveSubs([...list, sub]);
}

export async function removeSub(endpoint: string) {
  await saveSubs((await listSubs()).filter((x) => x.endpoint !== endpoint));
}

/* ── sending ───────────────────────────────────────────────── */

async function sendOne(sub: PushSub, msg: PushMessage, v: Vapid) {
  const body = await encryptPayload(sub, enc.encode(JSON.stringify(msg)));
  const res = await fetch(sub.endpoint, {
    method: "POST",
    headers: {
      authorization: await vapidHeader(sub.endpoint, sub.origin, v),
      "content-encoding": "aes128gcm",
      "content-type": "application/octet-stream",
      ttl: "86400",
      urgency: "high",
      ...(msg.tag ? { topic: msg.tag.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 32) } : {}),
    },
    body: buf(body),
  });
  return res.status;
}

/** Sends to every phone that turned alerts on; forgets phones that unsubscribed. */
export async function pushToSalon(msg: PushMessage) {
  const subs = await listSubs();
  if (!subs.length) return { sent: 0, failed: 0 };
  const v = await getVapid();
  let sent = 0;
  let failed = 0;
  const gone: string[] = [];
  await Promise.all(
    subs.map(async (s) => {
      try {
        const status = await sendOne(s, msg, v);
        if (status === 404 || status === 410) gone.push(s.endpoint);
        else if (status >= 200 && status < 300) sent++;
        else failed++;
      } catch {
        failed++;
      }
    }),
  );
  if (gone.length) await saveSubs(subs.filter((s) => !gone.includes(s.endpoint)));
  return { sent, failed };
}

const clock = (m: number) => {
  const h = Math.floor(m / 60);
  return `${((h + 11) % 12) + 1}:${String(m % 60).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

/** The alert for a guest's booking, move or cancellation. */
export async function pushBookingEvent(
  reference: string,
  event: "BOOKING_CONFIRMED" | "BOOKING_RESCHEDULED" | "BOOKING_CANCELLED" | string,
) {
  const { data: r } = await sb.from("bookings").select("*").eq("reference", reference).maybeSingle();
  if (!r) return { sent: 0, failed: 0 };
  const row = r as Record<string, unknown>;
  const c = (row["customer"] ?? {}) as { name?: string };
  const services = ((row["services_snapshot"] as { name: string }[] | null) ?? []).map((x) => x.name).join(", ");
  const staff = ((row["meta"] as Record<string, unknown> | null)?.["staff_name"] as string) || "";
  const day = new Date(`${row["date"] as string}T00:00:00Z`).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
  const when = `${day}, ${clock(row["time"] as number)}`;
  const title =
    event === "BOOKING_CANCELLED"
      ? `Cancelled: ${c.name ?? "a guest"}`
      : event === "BOOKING_RESCHEDULED"
        ? `Moved: ${c.name ?? "a guest"} → ${when}`
        : `New booking: ${c.name ?? "a guest"}`;
  const body = `${services || "Appointment"} · ${when}${staff ? ` · ${staff}` : ""}`;
  return pushToSalon({ title, body, url: `/admin/appointments?ref=${encodeURIComponent(reference)}`, tag: reference });
}

/* ── guests: free reminders before their appointment ──────────── */

type GuestSub = Pick<PushSub, "endpoint" | "keys" | "origin">;

/** Sends one message to one guest phone; false when the phone has unsubscribed. */
export async function pushToGuest(sub: GuestSub, msg: PushMessage) {
  const v = await getVapid();
  try {
    const status = await sendOne({ ...sub, device: "guest", at: 0 }, msg, v);
    return status !== 404 && status !== 410;
  } catch {
    return true;
  }
}

/**
 * Reminders for guests who asked for them on their phone: one about a day
 * before (from 24 hours ahead) and one 2 hours before. Each is sent once per
 * appointment time (a moved appointment gets fresh reminders). Run by the
 * same schedule as the other booking messages.
 */
export async function guestReminders() {
  const now = new Date(Date.now() + 330 * 60_000);
  const today = now.toISOString().slice(0, 10);
  const tomorrow = new Date(now.getTime() + 86_400_000).toISOString().slice(0, 10);
  const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  const { data: rows } = await sb.from("bookings").select("*").gte("date", today).lte("date", tomorrow);
  let sent = 0;
  for (const r of (rows ?? []) as Record<string, unknown>[]) {
    const meta = (r["meta"] ?? {}) as Record<string, unknown>;
    const subs = (meta["push"] as GuestSub[] | undefined) ?? [];
    if (!subs.length) continue;
    const st = (meta["status"] as string | undefined) ?? "";
    if (r["status"] === "cancelled" || ["cancelled", "no-show", "completed", "in-chair"].includes(st)) continue;
    const time = r["time"] as number;
    const until = (r["date"] === today ? 0 : 1440) + time - nowMin;
    const kind = until > 0 && until <= 120 ? "2h" : until > 180 && until <= 1440 ? "24h" : null;
    if (!kind) continue;
    const stamp = `${r["date"] as string}|${time}|${kind}`;
    const done = (meta["push_sent"] as string[] | undefined) ?? [];
    if (done.includes(stamp)) continue;
    const services = ((r["services_snapshot"] as { name: string }[] | null) ?? []).map((x) => x.name).join(", ");
    const staff = (meta["staff_name"] as string) || "";
    const when = `${r["date"] === today ? "today" : "tomorrow"} at ${clock(time)}`;
    const msg: PushMessage = {
      title: kind === "2h" ? `See you at ${clock(time)} today` : `Your appointment is ${when}`,
      body: `${services || "Your appointment"}${staff ? ` with ${staff}` : ""} · Hair by Bhargav. Tap to view or change.`,
      url: `/manage?ref=${encodeURIComponent(r["reference"] as string)}`,
      tag: `${r["reference"] as string}-${kind}`,
    };
    const alive: GuestSub[] = [];
    for (const s of subs) if (await pushToGuest(s, msg)) alive.push(s);
    sent++;
    // mark it sent (and forget phones that turned reminders off); same date and
    // time, so the booking guard lets the update through untouched
    await sb
      .from("bookings")
      .update({ meta: { ...meta, push: alive, push_sent: [...done, stamp].slice(-8) } as never })
      .eq("reference", r["reference"] as string);
  }
  return sent;
}
