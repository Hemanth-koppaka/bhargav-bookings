// The guest's own switch for interface sounds (remembered on this device).
// Hidden when the salon has turned sounds off in the console.
import { useEffect, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { sfx, useSoundPref } from "@/lib/sfx";
import { cn } from "@/lib/utils";

export function SoundToggle({ className }: { className?: string }) {
  const { on, available, setOn } = useSoundPref();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || !available) return null;
  const Icon = on ? Volume2 : VolumeX;
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? "Interface sounds on. Turn off" : "Interface sounds off. Turn on"}
      title={on ? "Sounds on" : "Sounds off"}
      onClick={() => {
        if (on) sfx.toggle(false); // the last thing heard before silence
        setOn(!on);
        if (!on) sfx.toggle(true);
      }}
      className={cn(
        "press inline-flex h-11 w-11 items-center justify-center rounded-full border border-foreground/15 text-foreground/70 hover:border-foreground/40 hover:text-foreground",
        className,
      )}
    >
      <Icon className="h-4 w-4" strokeWidth={1.25} />
    </button>
  );
}
