// "Your chair is being reserved": the real chair footage (edited offline:
// stabilised, graded, speed-ramped, with the push-in and hero punch-in baked
// in), framed by a push-through from the tools film and a soft forward push
// into the confirmation. Sound and music are cued from the video's own first
// frame so they stay in sync. Always skippable; never blocks the booking.
import { useEffect, useRef, useState } from "react";
import { sfx } from "@/lib/sfx";

export const CHAIR_SRC = "/media/chair-reserved.mp4";
export const CHAIR_WEBM = "/media/chair-reserved.webm";
export const CHAIR_POSTER = "/media/chair-reserved-poster.webp";

const TEXT_IN = 1150; // ms after the footage starts
const TEXT_OUT = 2500;
const EXIT_AT = 2950; // start of the push into the confirmation
const EXIT_MS = 480;

export function ChairReserve({
  onStart,
  onDone,
  className,
}: {
  /** First frame of the footage (music moves into the chair scene here). */
  onStart?: () => void;
  /** The push into the confirmation has finished (or the footage couldn't play). */
  onDone: () => void;
  className?: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [phase, setPhase] = useState<"enter" | "play" | "exit">("enter");
  const [text, setText] = useState<"hidden" | "in" | "out">("hidden");
  const done = useRef(onDone);
  done.current = onDone;
  const start = useRef(onStart);
  start.current = onStart;
  const finished = useRef(false);
  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    done.current();
  };

  useEffect(() => {
    const v = video.current;
    if (!v) return finish();
    const timers: number[] = [];
    let begun = false;
    const begin = () => {
      if (begun) return;
      begun = true;
      setPhase("play");
      start.current?.();
      sfx.chairScene();
      timers.push(
        window.setTimeout(() => setText("in"), TEXT_IN),
        window.setTimeout(() => setText("out"), TEXT_OUT),
        window.setTimeout(() => setPhase("exit"), EXIT_AT),
        window.setTimeout(finish, EXIT_AT + EXIT_MS),
      );
    };
    v.addEventListener("playing", begin, { once: true });
    // if the footage can't start quickly, go straight to the confirmation
    const giveUp = window.setTimeout(() => !begun && finish(), 1800);
    v.play().catch(() => finish());
    return () => {
      window.clearTimeout(giveUp);
      timers.forEach(window.clearTimeout);
      v.removeEventListener("playing", begin);
    };
  }, []);

  const filmStyle =
    phase === "enter"
      ? // arriving: pushed through from the tools, a touch of directional blur
        {
          transform: "scale(1.1) translateY(1.5%)",
          filter: "blur(8px) brightness(0.85)",
          opacity: 0.4,
        }
      : phase === "play"
        ? { transform: "none", filter: "blur(0px) brightness(1)", opacity: 1 }
        : // leaving: a gentle forward push, softening into the confirmation
          { transform: "scale(1.07)", filter: "blur(7px) brightness(0.55)", opacity: 0 };

  return (
    <div className={"overflow-hidden bg-[#0B0B0B] " + (className ?? "relative")}>
      <video
        ref={video}
        poster={CHAIR_POSTER}
        muted
        playsInline
        preload="auto"
        disablePictureInPicture
        aria-label="The reserved chair at Hair by Bhargav"
        className="absolute inset-0 h-full w-full object-cover will-change-transform"
        style={{
          ...filmStyle,
          transition:
            phase === "exit"
              ? `transform ${EXIT_MS}ms cubic-bezier(0.4,0,0.7,0.2), filter ${EXIT_MS}ms ease-in, opacity ${EXIT_MS}ms ease-in`
              : "transform 380ms cubic-bezier(0.16,1,0.3,1), filter 380ms ease-out, opacity 260ms ease-out",
        }}
      >
        <source src={CHAIR_SRC} type="video/mp4" />
        <source src={CHAIR_WEBM} type="video/webm" />
      </video>
      {/* a quiet title, like a film card: never over the chair */}
      <div className="pointer-events-none absolute inset-x-0 bottom-[max(3.5%,env(safe-area-inset-bottom))] z-10 flex flex-col items-center px-6 pb-2 text-center">
        <p
          className="text-[0.68rem] font-normal uppercase text-[#F4EEE5] [text-shadow:0_1px_14px_rgb(0_0_0/0.6)] sm:text-[0.72rem]"
          style={{
            letterSpacing: text === "in" ? "0.34em" : "0.42em",
            opacity: text === "in" ? 1 : 0,
            transform:
              text === "hidden" ? "translateY(7px)" : text === "out" ? "translateY(-4px)" : "none",
            transition:
              text === "out"
                ? "opacity 420ms ease-in, transform 420ms ease-in, letter-spacing 420ms ease-in"
                : "opacity 320ms cubic-bezier(0.16,1,0.3,1), transform 320ms cubic-bezier(0.16,1,0.3,1), letter-spacing 600ms cubic-bezier(0.16,1,0.3,1)",
          }}
        >
          Your chair is being reserved
        </p>
      </div>
      {/* soft letterbox edge so the title always reads */}
      <span className="pointer-events-none absolute inset-x-0 bottom-0 h-[18%] bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
    </div>
  );
}
