// Optional "show us the look" photos on the details step (up to 3).
// Photos are shrunk in the browser before upload and removed from storage
// once the visit is over.
import { useRef, useState } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";
import { useBooking, type RefPhoto } from "@/lib/booking-store";
import { removeReferencePhoto, uploadReferencePhoto } from "@/lib/photos.functions";
import { haptic } from "@/lib/utils";
import { loadImageFile, shrinkImage } from "@/lib/image";

const MAX = 3;

export function ReferencePhotos({ compact }: { compact?: boolean }) {
  const { draft, update } = useBooking();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(0);
  const [error, setError] = useState("");
  const photos = draft.photos ?? [];
  const room = MAX - photos.length - busy;

  const draftId = () => {
    if (draft.draftId) return draft.draftId;
    const id = crypto.randomUUID();
    update({ draftId: id });
    return id;
  };

  const add = async (files: FileList | null) => {
    if (!files?.length) return;
    setError("");
    const picked = Array.from(files).slice(0, Math.max(0, room));
    if (files.length > picked.length) setError(`You can add up to ${MAX} photos.`);
    const id = draftId();
    const added: RefPhoto[] = [];
    setBusy((n) => n + picked.length);
    for (const file of picked) {
      try {
        const img = await loadImageFile(file);
        const r = await uploadReferencePhoto({
          data: { draftId: id, dataUrl: shrinkImage(img, 1600, 0.82) },
        });
        if (!r.ok) throw new Error(r.error);
        added.push({ path: r.path, thumb: shrinkImage(img, 320, 0.72) });
        haptic();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't add that photo.");
      } finally {
        setBusy((n) => n - 1);
      }
    }
    if (added.length)
      update((d) => ({ photos: [...(d.photos ?? []), ...added].slice(0, MAX), draftId: id }));
    if (input.current) input.current.value = "";
  };

  const remove = (p: RefPhoto) => {
    update((d) => ({ photos: (d.photos ?? []).filter((x) => x.path !== p.path) }));
    if (draft.draftId)
      void removeReferencePhoto({ data: { draftId: draft.draftId, path: p.path } }).catch(() => {});
  };

  const tile = compact ? "h-20 w-20" : "h-24 w-24";

  return (
    <div>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <span className="text-[0.72rem] uppercase tracking-[0.3em] text-foreground/75">
          Reference photos (optional)
        </span>
        <span className="text-[0.75rem] tabular-nums text-muted-foreground">
          {photos.length}/{MAX}
        </span>
      </div>
      <p className="mb-4 text-[0.85rem] leading-relaxed text-muted-foreground">
        Show us a look you love. They're only shared with your stylist and deleted after your visit.
      </p>
      <div className="flex flex-wrap gap-3">
        {photos.map((p) => (
          <div
            key={p.path}
            className={`pop-in group relative overflow-hidden rounded-md border border-hairline bg-muted ${tile}`}
          >
            <img src={p.thumb} alt="Your reference photo" className="h-full w-full object-cover" />
            <button
              type="button"
              onClick={() => remove(p)}
              aria-label="Remove photo"
              className="press absolute top-1 right-1 flex h-7 w-7 items-center justify-center rounded-full bg-ink/75 text-ivory backdrop-blur-sm hover:bg-ink"
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
          </div>
        ))}
        {Array.from({ length: busy }, (_, i) => (
          <div
            key={`busy-${i}`}
            className={`flex items-center justify-center rounded-md border border-hairline bg-card ${tile}`}
          >
            <Loader2
              className="h-5 w-5 animate-spin text-bronze"
              strokeWidth={1.5}
              aria-label="Uploading"
            />
          </div>
        ))}
        {room > 0 ? (
          <button
            type="button"
            onClick={() => input.current?.click()}
            className={`press flex flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-foreground/25 bg-card text-foreground/70 hover:border-bronze hover:text-bronze ${tile}`}
          >
            <ImagePlus className="h-5 w-5" strokeWidth={1.25} />
            <span className="text-[0.68rem] uppercase tracking-[0.16em]">Add</span>
          </button>
        ) : null}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => void add(e.target.files)}
      />
      {error ? (
        <p key={error} role="alert" className="shake mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
