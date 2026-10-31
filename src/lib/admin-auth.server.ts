// Server-only admin authentication.
//
// - The access code is stored as a PBKDF2 hash (legacy plain-text codes are
//   accepted once and upgraded in place).
// - Wrong codes are throttled: after 5 misses the console locks, and each
//   further run of misses doubles the lock (up to an hour).
// - A correct code is exchanged for a short-lived signed session token; the
//   code itself is never kept in the browser. Changing the code invalidates
//   every existing session.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ITERATIONS = 100_000; // Cloudflare Workers cap PBKDF2 at 100k
const SESSION_HOURS = 12;
const FREE_ATTEMPTS = 5;
const BASE_LOCK_MS = 5 * 60_000;
const MAX_LOCK_MS = 60 * 60_000;
const GUARD_KEY = "admin_guard";
/** Sessions issued before this moment are signed out ("sign out on all devices"). */
const EPOCH_KEY = "admin_session_epoch";

const enc = new TextEncoder();

const b64 = (buf: ArrayBuffer | Uint8Array) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const unb64 = (s: string) => {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

/** Constant-time string comparison. */
function same(a: string, b: string) {
  const x = enc.encode(a);
  const y = enc.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

async function pbkdf2(code: string, salt: Uint8Array<ArrayBuffer>, iterations: number) {
  const key = await crypto.subtle.importKey("raw", enc.encode(code), "PBKDF2", false, [
    "deriveBits",
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt, iterations },
    key,
    256,
  );
  return b64(bits);
}

export async function hashCode(code: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITERATIONS}$${b64(salt)}$${await pbkdf2(code, salt, ITERATIONS)}`;
}

async function matches(code: string, stored: string) {
  if (!stored.startsWith("pbkdf2$")) return same(code, stored); // legacy plain text
  const [, iter, salt, hash] = stored.split("$");
  if (!iter || !salt || !hash) return false;
  return same(await pbkdf2(code, unb64(salt) as Uint8Array<ArrayBuffer>, Number(iter)), hash);
}

/** A short code, or the original code that matches the public street number, is weak. */
export const isWeakCode = (code: string) =>
  code.length < 6 || code === "1143" || /^(\d)\1+$/.test(code);

/* ── session tokens ─────────────────────────────────────────── */

function secret() {
  const s = process.env["ADMIN_SESSION_SECRET"] ?? process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!s) throw new Error("Admin sessions are not configured");
  return s;
}

async function hmac(data: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return b64(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

/**
 * A guest's key to one booking (returned by Manage booking lookups), so changes
 * can be authorised without sending the phone number back to the browser.
 */
export async function manageToken(reference: string) {
  return (await hmac(`manage:${reference}`)).slice(0, 32);
}
export async function checkManageToken(reference: string, token: string) {
  return token.length === 32 && same(token, await manageToken(reference));
}

/** Fingerprint of the stored code, so a code change revokes old sessions. */
async function codeVersion(stored: string) {
  return b64(await crypto.subtle.digest("SHA-256", enc.encode(stored))).slice(0, 16);
}

async function issueToken(stored: string, weak: boolean) {
  const exp = Date.now() + SESSION_HOURS * 3600_000;
  const body = b64(
    enc.encode(JSON.stringify({ exp, iat: Date.now(), v: await codeVersion(stored), w: weak ? 1 : 0 })),
  );
  return { token: `${body}.${await hmac(body)}`, expiresAt: exp };
}

async function readSecret() {
  const { data } = await supabaseAdmin.from("admin_secret").select("pin").eq("id", 1).maybeSingle();
  if (!data?.pin) throw new Error("Admin access is not set up");
  return data.pin;
}

/** Verifies a session token and returns the service-role client. Throws when invalid. */
export async function assertAdmin(token: string) {
  const [body, sig] = token.split(".");
  if (!body || !sig || !same(sig, await hmac(body))) throw new Error("Session not valid");
  let claims: { exp?: number; v?: string; iat?: number };
  try {
    claims = JSON.parse(new TextDecoder().decode(unb64(body)));
  } catch {
    throw new Error("Session not valid");
  }
  if (!claims.exp || claims.exp < Date.now()) throw new Error("Session expired");
  const [secret, epoch] = await Promise.all([readSecret(), readEpoch()]);
  if (claims.v !== (await codeVersion(secret))) throw new Error("Session revoked");
  if (epoch && (claims.iat ?? 0) < epoch) throw new Error("Session revoked");
  return supabaseAdmin;
}

async function readEpoch(): Promise<number> {
  const { data } = await supabaseAdmin.from("site_settings").select("value").eq("key", EPOCH_KEY).maybeSingle();
  return Number((data?.value as { at?: number } | null)?.at ?? 0);
}

/** Signs out every admin session, on every device (including this one). */
export async function signOutEverywhere(token: string) {
  await assertAdmin(token);
  const { error } = await supabaseAdmin.from("site_settings").upsert({ key: EPOCH_KEY, value: { at: Date.now() } as never });
  return { ok: !error };
}

/** Lockout state and session policy, for the security panel. */
export async function securityStatus() {
  const g = await readGuard();
  const stored = await readSecret().catch(() => "");
  return {
    failedAttempts: g.fails,
    lockedUntil: g.lockedUntil > Date.now() ? g.lockedUntil : 0,
    hashed: stored.startsWith("pbkdf2$"),
    sessionHours: SESSION_HOURS,
    attemptsBeforeLock: FREE_ATTEMPTS,
    dedicatedSecret: Boolean(process.env["ADMIN_SESSION_SECRET"]),
  };
}

/* ── throttling ─────────────────────────────────────────────── */

type Guard = { fails: number; lockedUntil: number };

async function readGuard(): Promise<Guard> {
  const { data } = await supabaseAdmin
    .from("site_settings")
    .select("value")
    .eq("key", GUARD_KEY)
    .maybeSingle();
  const v = (data?.value ?? {}) as Partial<Guard>;
  return { fails: v.fails ?? 0, lockedUntil: v.lockedUntil ?? 0 };
}

const writeGuard = (g: Guard) =>
  supabaseAdmin.from("site_settings").upsert({ key: GUARD_KEY, value: g as never });

export type SignInResult =
  | { ok: true; token: string; expiresAt: number; weak: boolean }
  | { ok: false; lockedFor?: number; attemptsLeft?: number };

/** Exchanges the access code for a session token, with lockout after repeated misses. */
export async function signIn(code: string): Promise<SignInResult> {
  const guard = await readGuard();
  const now = Date.now();
  if (guard.lockedUntil > now)
    return { ok: false, lockedFor: Math.ceil((guard.lockedUntil - now) / 1000) };

  const stored = await readSecret();
  if (!(await matches(code, stored))) {
    const fails = guard.fails + 1;
    const rounds = Math.floor(fails / FREE_ATTEMPTS);
    const lockedUntil =
      fails % FREE_ATTEMPTS === 0
        ? now + Math.min(BASE_LOCK_MS * 2 ** (rounds - 1), MAX_LOCK_MS)
        : 0;
    await writeGuard({ fails, lockedUntil });
    return lockedUntil
      ? { ok: false, lockedFor: Math.ceil((lockedUntil - now) / 1000) }
      : { ok: false, attemptsLeft: FREE_ATTEMPTS - (fails % FREE_ATTEMPTS) };
  }

  let current = stored;
  if (!stored.startsWith("pbkdf2$")) {
    current = await hashCode(code);
    await supabaseAdmin.from("admin_secret").update({ pin: current }).eq("id", 1);
  }
  if (guard.fails || guard.lockedUntil) await writeGuard({ fails: 0, lockedUntil: 0 });
  return { ok: true, ...(await issueToken(current, isWeakCode(code))), weak: isWeakCode(code) };
}

/** Changes the access code. Requires the current code again, not just a session. */
export async function changeCode(token: string, current: string, next: string) {
  await assertAdmin(token);
  const stored = await readSecret();
  if (!(await matches(current, stored)))
    return { ok: false as const, error: "Current code doesn't match." };
  if (isWeakCode(next))
    return { ok: false as const, error: "Use at least 6 digits, not all the same." };
  const hashed = await hashCode(next);
  const { error } = await supabaseAdmin.from("admin_secret").update({ pin: hashed }).eq("id", 1);
  if (error) return { ok: false as const, error: "Couldn't save the new code." };
  return { ok: true as const, ...(await issueToken(hashed, false)) };
}
