import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

// Reference photos a guest may attach while booking (optional, up to 3), and
// the salon's own service/category photos. Storage work happens server-side.

const draftId = z.string().regex(/^[0-9a-f-]{36}$/);
const dataUrl = z.string().max(3_500_000);
// `pin` carries the admin session token.
const pin = z.string().max(512);

export const uploadReferencePhoto = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ draftId, dataUrl }).parse(d))
  .handler(async ({ data }) => {
    const { REF_BUCKET, MAX_REFERENCE_PHOTOS, ensureBucket, decodeImage, randomName } =
      await import("./photos.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let img;
    try {
      img = decodeImage(data.dataUrl);
    } catch (e) {
      // decodeImage only throws guest-friendly messages
      return {
        ok: false as const,
        error: e instanceof Error ? e.message : "That file isn't a valid image.",
      };
    }
    try {
      await ensureBucket(REF_BUCKET, false);
      const bucket = supabaseAdmin.storage.from(REF_BUCKET);
      const folder = `pending/${data.draftId}`;
      const { data: existing } = await bucket.list(folder, { limit: 10 });
      if ((existing ?? []).filter((f) => f.id).length >= MAX_REFERENCE_PHOTOS) {
        return { ok: false as const, error: `You can add up to ${MAX_REFERENCE_PHOTOS} photos.` };
      }
      const path = `${folder}/${randomName()}.${img.ext}`;
      const { error } = await bucket.upload(path, img.bytes, {
        contentType: img.mime,
        upsert: false,
      });
      if (error)
        return { ok: false as const, error: "Couldn't upload that photo. Please try again." };
      return { ok: true as const, path };
    } catch (e) {
      console.error("reference photo upload failed", e);
      return {
        ok: false as const,
        error: "Couldn't upload that photo right now. You can still book without it.",
      };
    }
  });

export const removeReferencePhoto = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ draftId, path: z.string().max(200) }).parse(d))
  .handler(async ({ data }) => {
    if (!data.path.startsWith(`pending/${data.draftId}/`) || data.path.includes(".."))
      return { ok: false };
    const { REF_BUCKET } = await import("./photos.server");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.storage.from(REF_BUCKET).remove([data.path]);
    return { ok: true };
  });

/** Short-lived links to a booking's reference photos, for the salon only. */
export const adminReferencePhotos = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ pin, reference: z.string().max(20) }).parse(d))
  .handler(async ({ data }) => {
    const { assertAdmin } = await import("./admin-auth.server");
    const sb = await assertAdmin(data.pin);
    const { REF_BUCKET, ensureBucket } = await import("./photos.server");
    await ensureBucket(REF_BUCKET, false);
    const bucket = sb.storage.from(REF_BUCKET);
    const folder = `bookings/${data.reference}`;
    const { data: files } = await bucket.list(folder, { limit: 10 });
    const paths = (files ?? []).filter((f) => f.id).map((f) => `${folder}/${f.name}`);
    if (!paths.length) return { urls: [] as string[] };
    const { data: signed } = await bucket.createSignedUrls(paths, 60 * 60);
    return { urls: (signed ?? []).map((s) => s.signedUrl).filter((u): u is string => Boolean(u)) };
  });

/* ── salon media: service & category photos ──────────────────── */

const mediaKey = z.string().regex(/^(svc|cat):[A-Za-z0-9_-]{1,80}$/);

/** Uploads (or with no dataUrl, removes) the photo shown for a service or category. */
export const adminSaveMedia = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ pin, key: mediaKey, dataUrl: dataUrl.optional() }).parse(d))
  .handler(async ({ data }) => {
    const { assertAdmin } = await import("./admin-auth.server");
    const sb = await assertAdmin(data.pin);
    const { MEDIA_BUCKET, ensureBucket, decodeImage, randomName } = await import("./photos.server");
    await ensureBucket(MEDIA_BUCKET, true);
    const bucket = sb.storage.from(MEDIA_BUCKET);

    const { data: cur } = await sb
      .from("site_settings")
      .select("value")
      .eq("key", "media")
      .maybeSingle();
    const media = { ...((cur?.value as Record<string, string>) ?? {}) };
    const previous = media[data.key];

    if (data.dataUrl) {
      let img;
      try {
        img = decodeImage(data.dataUrl);
      } catch (e) {
        return { ok: false as const, error: e instanceof Error ? e.message : "Invalid image." };
      }
      const path = `${data.key.replace(":", "/")}/${randomName()}.${img.ext}`;
      const { error } = await bucket.upload(path, img.bytes, {
        contentType: img.mime,
        upsert: false,
        cacheControl: "31536000",
      });
      if (error) return { ok: false as const, error: "Couldn't upload that photo." };
      media[data.key] = bucket.getPublicUrl(path).data.publicUrl;
    } else {
      delete media[data.key];
    }

    const { error } = await sb
      .from("site_settings")
      .upsert({ key: "media", value: media as never });
    if (error) return { ok: false as const, error: "Couldn't save the photo." };
    if (previous) {
      const old = previous.split(`/${MEDIA_BUCKET}/`)[1];
      if (old) await bucket.remove([old]);
    }
    return { ok: true as const, url: media[data.key] ?? null };
  });
