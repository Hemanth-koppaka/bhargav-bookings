// Console panel: interface sound for the whole site.
import { useState } from "react";
import { toast } from "sonner";
import { Panel, TinyButton } from "@/components/admin";
import { useAdmin } from "@/lib/admin-store";
import { adminSaveSound } from "@/lib/admin-content.functions";
import { sfx, type SoundPreset, type SoundSettings } from "@/lib/sfx";
import { cn } from "@/lib/utils";

const PRESETS: { key: SoundPreset; label: string; hint: string }[] = [
  {
    key: "luxury",
    label: "Luxury",
    hint: "Tactile clicks, warm tones, a soft shimmer and a small room.",
  },
  {
    key: "minimal",
    label: "Minimal",
    hint: "Mostly tactile clicks with a lighter tone. No shimmer.",
  },
  { key: "silent", label: "Silent", hint: "No interface sounds anywhere." },
];

export function SoundSettingsPanel() {
  const { pin } = useAdmin();
  const [s, setS] = useState<SoundSettings>(() => sfx.salonSettings);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<SoundSettings>) => setS((x) => ({ ...x, ...patch }));

  const save = async () => {
    setBusy(true);
    try {
      await adminSaveSound({ data: { pin, sound: s } });
      sfx.applySalon(s);
      toast.success("Interface sound saved. Guests hear it on their next visit.");
    } catch {
      toast.error("Couldn't save the sound settings.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel className="mt-5">
      <div className="eyebrow">Interface sound</div>
      <p className="mt-1 text-[0.8rem] text-muted-foreground">
        Subtle sounds as guests choose services, pick a time and confirm. Guests can also mute them
        on their own device. Nothing plays until a guest taps something.
      </p>

      <div className="mt-4 flex items-center justify-between gap-4 border-t border-hairline pt-4">
        <span className="text-sm">Enabled</span>
        <button
          type="button"
          role="switch"
          aria-checked={s.enabled}
          onClick={() => set({ enabled: !s.enabled })}
          className={cn(
            "relative h-7 w-12 rounded-full transition-colors",
            s.enabled ? "bg-foreground" : "bg-foreground/20",
          )}
        >
          <span
            className={cn(
              "absolute top-1 left-1 h-5 w-5 rounded-full bg-background transition-transform",
              s.enabled && "translate-x-5",
            )}
          />
          <span className="sr-only">Interface sound {s.enabled ? "on" : "off"}</span>
        </button>
      </div>

      <label className="mt-4 flex items-center gap-4 border-t border-hairline pt-4">
        <span className="w-28 shrink-0 text-sm">Master volume</span>
        <input
          type="range"
          min={0}
          max={100}
          step={5}
          value={Math.round(s.volume * 100)}
          disabled={!s.enabled}
          onChange={(e) => set({ volume: Number(e.target.value) / 100 })}
          className="min-w-0 flex-1 accent-[var(--bronze,#8a6a4a)] disabled:opacity-40"
          aria-label="Master volume"
        />
        <span className="w-10 text-right text-[0.8rem] tabular-nums text-muted-foreground">
          {Math.round(s.volume * 100)}%
        </span>
      </label>

      <fieldset className="mt-4 border-t border-hairline pt-4" disabled={!s.enabled}>
        <legend className="sr-only">Preset</legend>
        <div className="text-sm">Preset</div>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          {PRESETS.map((p) => (
            <label
              key={p.key}
              className={cn(
                "cursor-pointer rounded-md border px-3 py-2.5 transition-colors",
                s.preset === p.key
                  ? "border-foreground/70 bg-champagne/20"
                  : "border-foreground/12",
                !s.enabled && "opacity-50",
              )}
            >
              <span className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="sound-preset"
                  checked={s.preset === p.key}
                  onChange={() => set({ preset: p.key })}
                  className="accent-[var(--bronze,#8a6a4a)]"
                />
                {p.label}
              </span>
              <span className="mt-1 block text-[0.72rem] leading-snug text-muted-foreground">
                {p.hint}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="mt-4 flex flex-wrap gap-2 border-t border-hairline pt-4">
        <TinyButton disabled={!s.enabled || s.preset === "silent"} onClick={() => sfx.preview(s)}>
          Preview
        </TinyButton>
        <TinyButton tone="primary" disabled={busy} onClick={() => void save()}>
          {busy ? "Saving…" : "Save sound settings"}
        </TinyButton>
      </div>
    </Panel>
  );
}
