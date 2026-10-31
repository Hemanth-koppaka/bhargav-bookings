// Server-only image storage helpers.
//
// reference-photos (private): up to 3 inspiration photos a guest may attach.
//   pending/<draftId>/<file>    uploaded while booking, before a reference exists
//   bookings/<reference>/<file> attached to a booking
// They are deleted as soon as the appointment is completed (or cancelled /
// no-show), and a throttled sweep removes anything left after the visit day
// plus abandoned uploads older than a day.
//
// salon-media (public): photos the salon uploads for services and categories.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const REF_BUCKET = "reference-photos";
export const MEDIA_BUCKET = "salon-media";
export const MAX_REFERENCE_PHOTOS = 3;
const MAX_BYTES = 2_500_000;
const SWEEP_EVERY_MS = 60 * 60_000;
const PENDING_TTL_MS = 24 * 60 * 60_000;

const ready = new Set<string>();

/** Creates the bucket on first use so no manual storage setup is needed. */
export async function ensureBucket(id: string, isPublic: boolean) {
  if (ready.has(id)) return;
  const storage = supabaseAdmin.storage;
  const { data } = await storage.getBucket(id);
  if (!data) {
    const { error } = await storage.createBucket(id, {
      public: isPublic,
      fileSizeLimit: MAX_BYTES,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    });
    if (error && !/exist/i.test(error.message)) throw new Error("Photo storage unavailable");
  }
  ready.add(id);
}

const TYPES = {
  jpeg: { ext: "jpg", mime: "image/jpeg", magic: [0xff, 0xd8, 0xff] },
  png: { ext: "png", mime: "image/png", magic: [0x89, 0x50, 0x4e, 0x47] },
  webp: { ext: "webp", mime: "image/webp", magic: [0x52, 0x49, 0x46, 0x46] },
} as const;

/** Parses a data URL and checks the bytes really are a JPEG/PNG/WebP image. */
export function decodeImage(dataUrl: string) {
  const m = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw new Error("Please choose a JPG, PNG or WebP photo.");
  const kind = TYPES[m[1] as keyof typeof TYPES];
  const bin = atob(m[2]!);
  if (bin.length > MAX_BYTES) throw new Error("That photo is too large.");
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  if (!kind.magic.every((b, i) => bytes[i] === b))
    throw new Error("That file isn't a valid image.");
  return { bytes, ext: kind.ext, mime: kind.mime };
}

export const randomName = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(9)), (b) =>
    b.toString(36).padStart(2, "0"),
  ).join("");

async function removeFolder(prefix: string) {
  const bucket = supabaseAdmin.storage.from(REF_BUCKET);
  const { data } = await bucket.list(prefix, { limit: 100 });
  const paths = (data ?? []).filter((f) => f.id).map((f) => `${prefix}/${f.name}`);
  if (paths.length) await bucket.remove(paths);
}

/** Deletes every reference photo attached to a booking. */
export async function deleteBookingPhotos(reference: string) {
  await ensureBucket(REF_BUCKET, false);
  await removeFolder(`bookings/${reference}`);
}

/** Moves freshly uploaded photos onto a booking; returns the new paths. */
export async function attachPhotos(reference: string, pending: string[]) {
  if (!pending.length) return [];
  await ensureBucket(REF_BUCKET, false);
  const bucket = supabaseAdmin.storage.from(REF_BUCKET);
  const moved: string[] = [];
  for (const from of pending.slice(0, MAX_REFERENCE_PHOTOS)) {
    const to = `bookings/${reference}/${from.split("/").pop()}`;
    const { error } = await bucket.move(from, to);
    if (!error) moved.push(to);
  }
  return moved;
}

const DONE = new Set(["completed", "no-show", "cancelled"]);
const salonToday = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);

/**
 * Removes photos whose visit is over (completed, cancelled, no-show or past
 * the appointment day) and uploads abandoned for over a day. Runs at most
 * hourly unless forced.
 */
export async function sweepPhotos(force = false) {
  const now = Date.now();
  if (!force) {
    const { data } = await supabaseAdmin
      .from("site_settings")
      .select("value")
      .eq("key", "photo_sweep")
      .maybeSingle();
    const at = ((data?.value ?? {}) as { at?: number }).at ?? 0;
    if (now - at < SWEEP_EVERY_MS) return { skipped: true };
  }
  await supabaseAdmin
    .from("site_settings")
    .upsert({ key: "photo_sweep", value: { at: now } as never });
  await ensureBucket(REF_BUCKET, false);
  const bucket = supabaseAdmin.storage.from(REF_BUCKET);
  let removed = 0;

  const { data: folders } = await bucket.list("bookings", { limit: 1000 });
  const refs = (folders ?? []).filter((f) => !f.id).map((f) => f.name);
  if (refs.length) {
    const { data: rows } = await supabaseAdmin
      .from("bookings")
      .select("reference, date, status, meta")
      .in("reference", refs);
    const byRef = new Map((rows ?? []).map((r) => [r.reference, r]));
    const today = salonToday();
    for (const ref of refs) {
      const r = byRef.get(ref);
      const status = (r?.meta as { status?: string } | undefined)?.status;
      if (!r || r.status === "cancelled" || (status && DONE.has(status)) || r.date < today) {
        await removeFolder(`bookings/${ref}`);
        removed++;
      }
    }
  }

  const { data: pending } = await bucket.list("pending", { limit: 1000 });
  for (const f of (pending ?? []).filter((x) => !x.id)) {
    const { data: files } = await bucket.list(`pending/${f.name}`, { limit: 10 });
    const newest = Math.max(0, ...(files ?? []).map((x) => Date.parse(x.created_at ?? "") || 0));
    if (now - newest > PENDING_TTL_MS) {
      await removeFolder(`pending/${f.name}`);
      removed++;
    }
  }
  return { skipped: false, removed };
}
