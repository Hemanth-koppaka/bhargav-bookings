// Privacy-friendly visitor counts for the booking journey: no cookies and no
// personal data. A visitor is a scrambled code made from their connection,
// browser and the date (it changes every day, so nobody can be followed from
// one day to the next); only how many reached each step is kept, per day.
import { supabaseAdmin as sb } from "@/integrations/supabase/client.server";

export const STEPS = ["home", "book", "services", "time", "details", "review", "booked"] as const;
export type Step = (typeof STEPS)[number];
type Day = Partial<Record<Step, string[]>>;

const key = (iso: string) => `visits:${iso}`;
const BOT = /bot|crawl|spider|slurp|facebookexternalhit|preview|headless|lighthouse|pingdom|monitor/i;

async function visitorCode(ip: string, ua: string, iso: string) {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`hb-visit:${iso}:${ip}:${ua}`)));
  return Array.from(d.slice(0, 6), (x) => x.toString(16).padStart(2, "0")).join("");
}

export async function recordVisit(step: Step, ip: string, ua: string) {
  if (!ip || BOT.test(ua)) return;
  const iso = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  const code = await visitorCode(ip, ua, iso);
  const { data } = await sb.from("site_settings").select("value").eq("key", key(iso)).maybeSingle();
  const day = ((data?.value as unknown as Day | null) ?? {}) as Day;
  const seen = day[step] ?? [];
  if (seen.includes(code)) return;
  // capped so a flood can't grow the record without limit
  if (seen.length >= 5000) return;
  day[step] = [...seen, code];
  await sb.from("site_settings").upsert({ key: key(iso), value: day as never });
}

/** Visitors who reached each step over the last `days` days (salon time). */
export async function journey(days: number) {
  const out: Record<Step, number> = { home: 0, book: 0, services: 0, time: 0, details: 0, review: 0, booked: 0 };
  const now = Date.now() + 330 * 60_000;
  const keys = Array.from({ length: days }, (_, i) => key(new Date(now - i * 86_400_000).toISOString().slice(0, 10)));
  const { data } = await sb.from("site_settings").select("key, value").in("key", keys);
  for (const r of (data ?? []) as { value: unknown }[]) {
    const d = (r.value ?? {}) as Day;
    for (const s of STEPS) out[s] += d[s]?.length ?? 0;
  }
  return out;
}
