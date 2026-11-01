// Interface sound: one central manager; components never touch Web Audio directly.
import { useSyncExternalStore } from "react";
import { sfx } from "./engine";

export { sfx } from "./engine";
export type { ScoreControl, SfxKind, SoundName } from "./engine";
export { DEFAULT_SOUND, SFX, type SoundPreset, type SoundSettings } from "./tokens";

/** The guest's on/off and whether the salon has sound on at all (re-renders on change). */
export function useSoundPref() {
  const guest = useSyncExternalStore(
    (fn) => sfx.subscribe(fn),
    () => sfx.guestEnabled,
    () => true,
  );
  const salon = useSyncExternalStore(
    (fn) => sfx.subscribe(fn),
    () => sfx.salonEnabled,
    () => true,
  );
  return { on: guest, available: salon, setOn: (v: boolean) => sfx.setEnabled(v) };
}
