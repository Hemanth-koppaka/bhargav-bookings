// The confirmation film: Bhargav getting ready (his tools sliding into the
// pocket) cut into the reserved chair lighting up. Both shots and their own
// sound are joined offline into one file, with the transition (zoom push,
// warm light flash, whoosh) baked in so picture and sound never drift apart.
// Plays with sound when the guest and the salon have sound on; if the phone
// won't allow sound it plays silently. Always skippable; never blocks the booking.
import { useEffect, useRef, useState } from "react";
import { sfx } from "@/lib/sfx";

export const FILM_SRC = "/media/booking-film.mp4";
export const FILM_WEBM = "/media/booking-film.webm";
export const FILM_POSTER = "/media/booking-film-poster.webp";

const CHAIR_AT = 9.75; // s: the cut into the chair
const TEXT_IN = 11.0; // s: "Your chair is being reserved"
const TEXT_OUT = 14.2;
const EXIT_BEFORE_END = 0.5; // s: start the push into the confirmation
const EXIT_MS = 480;

let warm: HTMLVideoElement | null = null;
/** Starts downloading the film ahead of time (e.g. on the review page). */
export function warmBookingFilm() {
  if (warm) return;
  const v = (warm = document.createElement("video"));
  v.preload = "auto";
  v.muted = true;
  v.src = v.canPlayType("video/mp4") ? FILM_SRC : FILM_WEBM;
  v.load();
}

export function BookingFilm({
  stopping = false,
  onChair,
  onDone,
  className,
}: {
  /** The guest skipped: fade the sound out. */
  stopping?: boolean;
  /** The cut into the chair scene. */
  onChair?: () => void;
  /** The push into the confirmation has finished (or the film couldn't play). */
  onDone: () => void;
  className?: string;
}) {
  const video = useRef<HTMLVideoElement>(null);
  const [phase, setPhase] = useState<"enter" | "play" | "exit">("enter");
  const [text, setText] = useState<"hidden" | "in" | "out">("hidden");
  // the phone refused to start the film by itself (iPhone Low Power Mode,
  // Android Data Saver…): show a play button instead of skipping it
  const [blocked, setBlocked] = useState(false);
  const done = useRef(onDone);
  done.current = onDone;
  const chair = useRef(onChair);
  chair.current = onChair;
  const finished = useRef(false);
  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    done.current();
  };

  useEffect(() => {
    const v = video.current;
    if (!v) return finish();
    let begun = false;
    let atChair = false;
    let exiting = false;
    let raf = 0;
    let exitTimer = 0;

    // follow the film's own clock so the title and the exit stay in sync
    const tick = () => {
      const t = v.currentTime;
      if (!atChair && t >= CHAIR_AT) {
        atChair = true;
        chair.current?.();
      }
      setText(t >= TEXT_OUT ? "out" : t >= TEXT_IN ? "in" : "hidden");
      const end = Number.isFinite(v.duration) ? v.duration : 15.4;
      if (!exiting && t >= end - EXIT_BEFORE_END) {
        exiting = true;
        setPhase("exit");
        exitTimer = window.setTimeout(finish, EXIT_MS);
      }
      raf = requestAnimationFrame(tick);
    };
    const begin = () => {
      if (begun) return;
      begun = true;
      setPhase("play");
      raf = requestAnimationFrame(tick);
    };
    const ended = () => {
      if (!exiting) finish();
    };
    v.addEventListener("playing", begin, { once: true });
    v.addEventListener("ended", ended);
    // if the film can't start at all (very slow connection), go straight to
    // the confirmation; the guest can also tap to skip while it loads
    let refused = false;
    const giveUp = window.setTimeout(() => !begun && !refused && finish(), 7000);

    v.muted = !sfx.active;
    v.volume = 1;
    v.play().catch(() => {
      // the phone won't play sound without a tap: play the picture silently
      v.muted = true;
      v.play().catch(() => {
        // it won't play at all without a tap: wait for the guest to press play
        refused = true;
        setBlocked(true);
      });
    });
    return () => {
      window.clearTimeout(giveUp);
      window.clearTimeout(exitTimer);
      cancelAnimationFrame(raf);
      v.removeEventListener("playing", begin);
      v.removeEventListener("ended", ended);
      v.pause();
    };
  }, []);

  // skipping: fade the sound rather than cutting it
  useEffect(() => {
    const v = video.current;
    if (!stopping || !v) return;
    const from = v.volume;
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / 450);
      v.volume = from * (1 - k);
      if (k < 1) raf = requestAnimationFrame(step);
      else v.muted = true; // iOS ignores volume
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [stopping]);

  const filmStyle =
    phase === "enter"
      ? { transform: "scale(1.04)", filter: "brightness(0.8)", opacity: blocked ? 1 : 0 }
      : phase === "play"
        ? { transform: "none", filter: "brightness(1)", opacity: 1 }
        : // leaving: a gentle forward push, softening into the confirmation
          { transform: "scale(1.07)", filter: "blur(7px) brightness(0.55)", opacity: 0 };

  return (
    <div className={"overflow-hidden bg-[#0B0B0B] " + (className ?? "relative")}>
      <video
        ref={video}
        poster={FILM_POSTER}
        muted
        playsInline
        preload="auto"
        disablePictureInPicture
        aria-label="Bhargav getting ready, then the reserved chair at Hair by Bhargav"
        className="absolute inset-0 h-full w-full object-cover will-change-transform"
        style={{
          ...filmStyle,
          transition:
            phase === "exit"
              ? `transform ${EXIT_MS}ms cubic-bezier(0.4,0,0.7,0.2), filter ${EXIT_MS}ms ease-in, opacity ${EXIT_MS}ms ease-in`
              : "transform 420ms cubic-bezier(0.16,1,0.3,1), filter 420ms ease-out, opacity 300ms ease-out",
        }}
      >
        <source src={FILM_SRC} type="video/mp4" />
        <source src={FILM_WEBM} type="video/webm" />
      </video>
      {blocked && phase === "enter" ? (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-5 bg-[#0B0B0B]/40">
          <button
            type="button"
            aria-label="Play the film"
            onClick={(e) => {
              e.stopPropagation(); // a tap elsewhere skips the film
              const v = video.current;
              if (!v) return finish();
              setBlocked(false);
              v.muted = !sfx.active;
              v.play().catch(() => {
                v.muted = true;
                v.play().catch(() => finish());
              });
            }}
            className="press flex h-20 w-20 items-center justify-center rounded-full border border-[#C9A96A]/60 bg-black/45 backdrop-blur-sm"
          >
            <svg viewBox="0 0 24 24" className="ml-1 h-8 w-8 fill-[#F4EEE5]" aria-hidden>
              <path d="M8 5.5v13l10.5-6.5z" />
            </svg>
          </button>
          <span className="text-[0.62rem] uppercase tracking-[0.3em] text-[#E8E1D8]/70">
            Play · or tap anywhere to skip
          </span>
        </div>
      ) : null}
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
