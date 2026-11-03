// "Your look": up to 3 inspiration photos kept privately on this phone (never
// uploaded unless the guest attaches them to a booking). One tap from the home
// page opens them full screen to hand to the stylist, with no gallery to scroll
// through and nothing else of the guest's on show.
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, ImagePlus, Loader2, Maximize2, Sparkles, Trash2, X } from "lucide-react";
import { loadImageFile, shrinkImage } from "@/lib/image";
import { haptic, cn } from "@/lib/utils";

export type LookPhoto = { id: string; full: string; thumb: string; at: number };

const KEY = "hb.look.v1";
export const MAX_LOOK = 3;
const EVENT = "hb-look-change";

function read(): LookPhoto[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]") as LookPhoto[];
    return Array.isArray(v) ? v.filter((x) => x && x.full && x.thumb).slice(0, MAX_LOOK) : [];
  } catch {
    return [];
  }
}

function write(list: LookPhoto[]) {
  localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX_LOOK)));
  window.dispatchEvent(new Event(EVENT));
}

/** The saved look on this device (empty until the page has loaded in the browser). */
export function useMyLook() {
  const [photos, setPhotos] = useState<LookPhoto[]>([]);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const sync = () => setPhotos(read());
    sync();
    setReady(true);
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const add = useCallback(async (files: FileList | File[]) => {
    const room = MAX_LOOK - read().length;
    const picked = Array.from(files).slice(0, Math.max(0, room));
    const added: LookPhoto[] = [];
    for (const f of picked) {
      const img = await loadImageFile(f);
      added.push({
        id: crypto.randomUUID(),
        full: shrinkImage(img, 1280, 0.8),
        thumb: shrinkImage(img, 240, 0.7),
        at: Date.now(),
      });
    }
    try {
      write([...read(), ...added]);
    } catch {
      throw new Error("Your phone is short of space for another photo. Remove one and try again.");
    }
    return { added: added.length, skipped: files.length - picked.length };
  }, []);

  const remove = useCallback((id: string) => {
    try {
      write(read().filter((x) => x.id !== id));
    } catch {
      /* ignore */
    }
  }, []);

  return { photos, ready, add, remove };
}

/** Full-screen, distraction-free viewer to hand the phone to the stylist. */
export function LookViewer({
  photos,
  start = 0,
  onClose,
}: {
  photos: LookPhoto[];
  start?: number;
  onClose: () => void;
}) {
  const [i, setI] = useState(start);
  const touch = useRef<number | null>(null);
  const n = photos.length;
  const go = (d: number) => n > 1 && setI((x) => (x + d + n) % n);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // keep the screen awake while the stylist looks
    let lock: { release: () => Promise<void> } | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
    nav.wakeLock
      ?.request("screen")
      .then((l) => (lock = l))
      .catch(() => {});
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      void lock?.release().catch(() => {});
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const p = photos[Math.min(i, n - 1)];
  if (!p) return null;
  return createPortal(
    <div
      role="dialog"
      aria-modal
      aria-label="Your look"
      className="fixed inset-0 z-[80] flex flex-col bg-black text-white"
      onTouchStart={(e) => (touch.current = e.touches[0]?.clientX ?? null)}
      onTouchEnd={(e) => {
        const x0 = touch.current;
        const x1 = e.changedTouches[0]?.clientX;
        touch.current = null;
        if (x0 == null || x1 == null || Math.abs(x1 - x0) < 40) return;
        go(x1 < x0 ? 1 : -1);
      }}
    >
      <div className="flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-3">
        <span className="text-[0.66rem] uppercase tracking-[0.3em] text-white/70">
          Your look{n > 1 ? ` · ${i + 1} / ${n}` : ""}
        </span>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="press flex h-11 w-11 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
        >
          <X className="h-5 w-5" strokeWidth={1.5} />
        </button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-2">
        <img key={p.id} src={p.full} alt={`Look ${i + 1}`} className="fade-rise max-h-full max-w-full object-contain" draggable={false} />
        {n > 1 ? (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Previous photo"
              className="press absolute left-3 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
            >
              <ChevronLeft className="h-5 w-5" strokeWidth={1.5} />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Next photo"
              className="press absolute right-3 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
            >
              <ChevronRight className="h-5 w-5" strokeWidth={1.5} />
            </button>
          </>
        ) : null}
      </div>
      {n > 1 ? (
        <div className="flex justify-center gap-2 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
          {photos.map((x, k) => (
            <button
              key={x.id}
              type="button"
              onClick={() => setI(k)}
              aria-label={`Photo ${k + 1}`}
              className={cn("h-12 w-12 overflow-hidden rounded-md border-2", k === i ? "border-white" : "border-transparent opacity-60")}
            >
              <img src={x.thumb} alt="" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      ) : (
        <div className="pb-[max(1.25rem,env(safe-area-inset-bottom))]" />
      )}
    </div>,
    document.body,
  );
}

/** Add / remove the saved photos (a bottom sheet). */
function LookManager({ onClose, onShow }: { onClose: () => void; onShow: (i: number) => void }) {
  const { photos, add, remove } = useMyLook();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const room = MAX_LOOK - photos.length;

  const pick = async (files: FileList | null) => {
    if (!files?.length) return;
    setError("");
    setBusy(true);
    try {
      const r = await add(files);
      if (r.added) haptic();
      if (r.skipped > 0) setError(`You can keep up to ${MAX_LOOK} photos.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't add that photo.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[75] flex items-end justify-center sm:items-center" role="dialog" aria-modal aria-label="Your look">
      <button type="button" aria-label="Close" className="absolute inset-0 bg-ink/45" onClick={onClose} />
      <div className="slide-in relative w-full max-w-md rounded-t-2xl bg-background p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-[0.62rem] uppercase tracking-[0.3em] text-bronze">Your look</div>
            <h2 className="mt-1.5 font-display text-[1.6rem] leading-tight">Save it, show it in the chair.</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="press -mr-1 flex h-10 w-10 items-center justify-center rounded-full hover:bg-foreground/5">
            <X className="h-4 w-4" strokeWidth={1.5} />
          </button>
        </div>
        <p className="mt-2 text-[0.85rem] leading-relaxed text-muted-foreground">
          Up to {MAX_LOOK} inspiration photos, kept only on this phone. At your appointment, open them here, with no
          scrolling through your gallery.
        </p>
        <div className="mt-4 grid grid-cols-3 gap-2.5">
          {photos.map((p, k) => (
            <div key={p.id} className="group relative aspect-square overflow-hidden rounded-md bg-muted">
              <button type="button" onClick={() => onShow(k)} aria-label={`Open look ${k + 1}`} className="h-full w-full">
                <img src={p.thumb} alt="" className="h-full w-full object-cover" />
              </button>
              <button
                type="button"
                onClick={() => remove(p.id)}
                aria-label={`Remove look ${k + 1}`}
                className="press absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white"
              >
                <Trash2 className="h-3.5 w-3.5" strokeWidth={1.5} />
              </button>
            </div>
          ))}
          {room > 0 ? (
            <button
              type="button"
              onClick={() => input.current?.click()}
              disabled={busy}
              className="press tap-icon flex aspect-square flex-col items-center justify-center gap-1.5 rounded-md border border-dashed border-foreground/25 text-[0.75rem] text-muted-foreground hover:border-foreground/50"
            >
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <ImagePlus className="h-5 w-5" strokeWidth={1.3} />}
              Add photo
            </button>
          ) : null}
        </div>
        <input ref={input} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void pick(e.target.files)} />
        {error ? <p className="mt-3 text-[0.82rem] text-destructive">{error}</p> : null}
        {photos.length ? (
          <button
            type="button"
            onClick={() => onShow(0)}
            className="press mt-5 flex min-h-12 w-full items-center justify-center gap-2.5 rounded-sm bg-foreground text-[0.72rem] uppercase tracking-[0.2em] text-background"
          >
            <Maximize2 className="h-4 w-4" strokeWidth={1.5} /> Show my stylist
          </button>
        ) : null}
      </div>
    </div>,
    document.body,
  );
}

/** The home-page entry: saved thumbnails (tap → full screen) or "Save your look". */
export function MyLookEntry({ className, size = "md" }: { className?: string; size?: "md" | "lg" }) {
  const { photos, ready } = useMyLook();
  const [manage, setManage] = useState(false);
  const [view, setView] = useState<number | null>(null);
  const has = photos.length > 0;
  return (
    <>
      <div
        className={cn(
          "flex items-center gap-3 rounded-sm border border-foreground/12 bg-card/70 pl-3 pr-2",
          size === "lg" ? "min-h-16" : "min-h-14",
          !ready && "invisible",
          className,
        )}
      >
        <button
          type="button"
          onClick={() => (has ? setView(0) : setManage(true))}
          className="press tap-icon flex min-w-0 flex-1 items-center gap-3 py-2 text-left"
        >
          {has ? (
            <span className="flex shrink-0 -space-x-3">
              {photos.map((p) => (
                <img key={p.id} src={p.thumb} alt="" className="h-10 w-10 rounded-md border-2 border-background object-cover" />
              ))}
            </span>
          ) : (
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-champagne/25 text-bronze">
              <Sparkles className="h-[18px] w-[18px]" strokeWidth={1.3} />
            </span>
          )}
          <span className="min-w-0">
            <span className="block text-[0.95rem] leading-tight">{has ? "Your look" : "Save your look"}</span>
            <span className="block truncate text-[0.75rem] text-muted-foreground">
              {has ? "Tap to show your stylist" : "Inspiration photos, ready for the chair"}
            </span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => setManage(true)}
          className="press shrink-0 rounded-sm px-3 py-2 text-[0.72rem] uppercase tracking-[0.18em] text-bronze hover:bg-foreground/[0.04]"
        >
          {has ? "Edit" : "Add"}
        </button>
      </div>
      {manage ? (
        <LookManager
          onClose={() => setManage(false)}
          onShow={(k) => {
            setManage(false);
            setView(k);
          }}
        />
      ) : null}
      {view != null && has ? <LookViewer photos={photos} start={view} onClose={() => setView(null)} /> : null}
    </>
  );
}
