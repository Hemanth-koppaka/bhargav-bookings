// "Tell me if a time opens up": guests looking at a full day can ask to be
// told (free phone notification) if a time that fits their services frees up
// on that day. When a booking on that day is cancelled or moved away, everyone
// waiting is checked against the real availability and told once, first come
// first served. Entries for past days are dropped.
import { supabaseAdmin as sb } from "@/integrations/supabase/client.server";

export type WaitEntry = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  origin: string;
  audience: "men" | "women";
  serviceIds: string[];
  staffId?: string;
  at: number;
};

const key = (date: string) => `waitlist:${date}`;
const MAX_PER_DAY = 100;

async function read(date: string): Promise<WaitEntry[]> {
  const { data } = await sb.from("site_settings").select("value").eq("key", key(date)).maybeSingle();
  const v = data?.value as unknown as WaitEntry[] | null;
  return Array.isArray(v) ? v : [];
}
async function write(date: string, list: WaitEntry[]) {
  if (!list.length) await sb.from("site_settings").delete().eq("key", key(date));
  else await sb.from("site_settings").upsert({ key: key(date), value: list as never });
}

export async function joinWaitlist(date: string, e: WaitEntry) {
  const list = (await read(date)).filter((x) => x.endpoint !== e.endpoint || x.serviceIds.join() !== e.serviceIds.join());
  if (list.length >= MAX_PER_DAY) return false;
  await write(date, [...list, e]);
  return true;
}

const clock = (m: number) => {
  const h = Math.floor(m / 60);
  return `${((h + 11) % 12) + 1}:${String(m % 60).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

/** A booking on `date` was cancelled or moved away: tell those waiting if their services now fit. */
export async function timeFreedOn(date: string) {
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
  if (date < today) return 0;
  const list = await read(date);
  if (!list.length) return 0;
  const { engine } = await import("./bookings.server");
  const E = await engine(true);
  const rules = await E.loadRules();
  const { pushToGuest } = await import("./push.server");
  const keep: WaitEntry[] = [];
  let told = 0;
  for (const w of list) {
    const q = E.quote(w.audience, w.serviceIds);
    if (!q) continue; // services no longer offered
    const day = await E.availability(date, q, rules, { serviceIds: w.serviceIds, ...(w.staffId ? { choice: w.staffId } : {}) });
    const slot = day.slots.find((s) => s.available && (!w.staffId || !s.staff || s.staff.includes(w.staffId)));
    if (!slot) {
      keep.push(w);
      continue;
    }
    const label = new Date(`${date}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
    const url = `/open-time?d=${date}&a=${w.audience}&s=${encodeURIComponent(w.serviceIds.join(","))}${w.staffId ? `&st=${w.staffId}` : ""}`;
    await pushToGuest(w, {
      title: `A time just opened: ${label}, ${clock(slot.minute)}`,
      body: "Tap to book it before someone else does · Hair by Bhargav",
      url,
      tag: `wait-${date}`,
    });
    told++; // told once; they book (or not) from the link
  }
  await write(date, keep);
  return told;
}
