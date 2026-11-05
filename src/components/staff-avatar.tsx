import { useRef, useState } from "react";
import { Camera, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { adminSaveMedia } from "@/lib/photos.functions";
import { useAdmin } from "@/lib/admin-store";
import { loadImageFile, shrinkImage } from "@/lib/image";
import { cn } from "@/lib/utils";

/** A stylist's face (or their initial on their colour), for quick recognition. */
export function StaffAvatar({
  name,
  photo,
  colour,
  className,
}: {
  name: string;
  photo?: string | null | undefined;
  colour?: string | undefined;
  className?: string | undefined;
}) {
  const [broken, setBroken] = useState(false);
  return (
    <span
      className={cn(
        "relative inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full text-[0.75rem] font-medium text-white",
        className,
      )}
      style={{ background: colour ?? "var(--bronze)" }}
      title={name}
    >
      {photo && !broken ? (
        <img
          src={photo}
          alt={name}
          className="h-full w-full object-cover"
          onError={() => setBroken(true)}
        />
      ) : (
        (name || "?").slice(0, 1).toUpperCase()
      )}
      {colour && photo && !broken ? (
        <span
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{ boxShadow: `inset 0 0 0 2px ${colour}` }}
        />
      ) : null}
    </span>
  );
}

/** Admin → Staff: tap the photo to change it (or go back to the built-in one). */
export function StaffPhotoEditor({
  staffId,
  name,
  photo,
  uploaded,
  onChange,
}: {
  staffId: string;
  name: string;
  photo: string | null;
  uploaded: boolean;
  onChange: (url: string | null) => void;
}) {
  const { pin } = useAdmin();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const save = async (file?: File) => {
    setBusy(true);
    try {
      const dataUrl = file ? shrinkImage(await loadImageFile(file), 640, 0.86) : undefined;
      const r = await adminSaveMedia({
        data: { pin, key: `staff:${staffId}`, ...(dataUrl ? { dataUrl } : {}) },
      });
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(file ? `Photo saved for ${name || "this stylist"}.` : "Photo removed.");
        onChange(r.url);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Couldn't save the photo.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };
  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={busy}
        aria-label={`Change ${name || "stylist"}'s photo`}
        className="press group relative h-20 w-20 shrink-0 overflow-hidden rounded-full border border-hairline bg-muted"
      >
        {photo ? (
          <img src={photo} alt={name} className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center font-display text-[1.8rem] text-foreground/40">
            {(name || "?").slice(0, 1).toUpperCase()}
          </span>
        )}
        <span className="absolute inset-x-0 bottom-0 flex items-center justify-center bg-black/45 py-1 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
          <Camera className="h-3.5 w-3.5" strokeWidth={1.5} />
        </span>
        {busy ? (
          <span className="absolute inset-0 flex items-center justify-center bg-background/70">
            <Loader2 className="h-5 w-5 animate-spin" strokeWidth={1.5} />
          </span>
        ) : null}
      </button>
      <div className="text-[0.8rem] text-muted-foreground">
        <div className="text-foreground">Photo</div>
        <p>Shown next to their name in the calendar and bookings, so you can tell at a glance.</p>
        <div className="mt-1 flex gap-3">
          <button
            type="button"
            onClick={() => input.current?.click()}
            className="text-bronze underline underline-offset-4"
          >
            {photo ? "Change" : "Add a photo"}
          </button>
          {uploaded ? (
            <button
              type="button"
              onClick={() => void save()}
              className="underline underline-offset-4 hover:text-destructive"
            >
              Remove
            </button>
          ) : null}
        </div>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && void save(e.target.files[0])}
      />
    </div>
  );
}
