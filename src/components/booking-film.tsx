// The confirmation film: Bhargav getting ready (his tools sliding into the
// pocket) cut into the reserved chair lighting up. Both shots and their own
// sound are joined offline into one file, with the transition (zoom push,
// warm light flash, whoosh) baked in so picture and sound never drift apart.
//
// The film and the logo's sound always play with sound (they're the salon's
// soundtrack, not interface sounds), even with the iPhone silent switch on.
// Phones only let a page start a video (and its sound) from a tap, and some
// (iPhone Low Power Mode, Android Data Saver) refuse even a silent one. So the
// guest's own tap on "Confirm booking" readies the film and the logo's sound
// (primeBookingFilm), and the confirmation page plays those same, already
// allowed elements by themselves. Tap anywhere to skip; never blocks the booking.
import { useEffect, useRef, useState } from "react";

export type FilmAudience = "men" | "women";
// Men: the tools sliding into the jeans pocket. Women: the brush, straightener,
// curler, scissors and dryer tucked into the apron. Both cut into the same chair.
const FILMS: Record<
  FilmAudience,
  { mp4: string; webm: string; poster: string; chairAt: number; length: number }
> = {
  men: {
    mp4: "/media/booking-film.mp4",
    webm: "/media/booking-film.webm",
    poster: "/media/booking-film-poster.webp",
    chairAt: 9.75, // s: the cut into the chair
    length: 15.4,
  },
  women: {
    mp4: "/media/booking-film-women.mp4",
    webm: "/media/booking-film-women.webm",
    poster: "/media/booking-film-women-poster.webp",
    chairAt: 7.63,
    length: 13.25,
  },
};
let filmAudience: FilmAudience | null = null; // the film the Confirm tap readied
const filmFor = (a: FilmAudience | null | undefined) => FILMS[a === "women" ? "women" : "men"];
/** The film's first frame (the blurred backdrop on wide screens). */
export const filmPoster = (a: FilmAudience | null | undefined) => filmFor(a ?? filmAudience).poster;
const STING_SRC = "/media/logo-sting.mp3";

// the line along the bottom: while Bhargav gets ready, then over the chair
const READY_IN = 0.7; // s
const READY_OUT_BEFORE_CHAIR = 0.55;
const CHAIR_TEXT_AFTER_CUT = 1.25;
const CHAIR_TEXT_OUT_BEFORE_END = 1.2;
const EXIT_BEFORE_END = 0.5; // s: start the push into the confirmation
const EXIT_MS = 480;

// one film and one logo sound per visit, shared from the review page to the
// confirmation page so the permission from the guest's tap carries over
let film: HTMLVideoElement | null = null;
let sting: HTMLAudioElement | null = null;

function filmElement(audience?: FilmAudience | null) {
  const want = filmFor(audience ?? filmAudience);
  if (!film) {
    const v = (film = document.createElement("video"));
    v.preload = "auto";
    v.muted = true;
    v.playsInline = true;
    v.setAttribute("playsinline", "");
    v.setAttribute("webkit-playsinline", "");
    v.disablePictureInPicture = true;
  }
  const v = film;
  const src = v.canPlayType("video/mp4") ? want.mp4 : want.webm;
  if (!v.src.endsWith(src)) {
    v.poster = want.poster;
    v.src = src;
    v.load();
  }
  if (audience) filmAudience = audience;
  return v;
}
function stingElement() {
  if (!sting) {
    sting = new Audio(STING_SRC);
    sting.preload = "auto";
    sting.load();
  }
  return sting;
}

/** Starts downloading the film and the logo sound ahead of time (the review page). */
export function warmBookingFilm(audience: FilmAudience | null) {
  filmElement(audience);
  stingElement();
}

// The site's small interface sounds use the iPhone "ambient" audio mode (they
// follow the silent switch). The film and the logo's sound are the salon's own
// soundtrack: while they play, use normal media playback so they're heard.
type Session = { type: string };
function audioSession(type: "playback" | "ambient") {
  try {
    const s = (navigator as unknown as { audioSession?: Session }).audioSession;
    if (s) s.type = type;
  } catch {
    /* not supported */
  }
}
let soundtrackDone = 0;
/** Back to the interface sounds' mode once the film and logo sound have finished. */
function endSoundtrack(afterMs: number) {
  window.clearTimeout(soundtrackDone);
  soundtrackDone = window.setTimeout(() => audioSession("ambient"), afterMs);
}

/** Start-and-stop inside the guest's tap: the phone then lets them play later by themselves. */
function prime(el: HTMLMediaElement, withSound: boolean) {
  el.muted = !withSound;
  try {
    const p = el.play();
    el.pause();
    p?.catch(() => {});
    el.currentTime = 0;
  } catch {
    /* nothing to ready; the film still tries to play */
  }
}

/** Call synchronously from the "Confirm booking" tap, before anything is awaited. */
export function primeBookingFilm(audience: FilmAudience | null) {
  if (typeof document === "undefined") return;
  audioSession("playback");
  prime(filmElement(audience), true);
  prime(stingElement(), true);
}

/** The logo's sound as it appears after the film. False if it couldn't play. */
export function playLogoSting(): boolean {
  if (!sting) return false;
  const a = sting;
  audioSession("playback");
  endSoundtrack(4500);
  a.muted = false;
  a.volume = 1;
  a.currentTime = 0;
  const p = a.play();
  p?.catch(() => {});
  return true;
}

export function BookingFilm({
  audience,
  stopping = false,
  onChair,
  onDone,
  className,
}: {
  /** Men's or women's booking: which "getting ready" shot opens the film. */
  audience?: FilmAudience | null;
  /** The guest skipped: fade the sound out. */
  stopping?: boolean;
  /** The cut into the chair scene. */
  onChair?: () => void;
  /** The push into the confirmation has finished (or the film couldn't play). */
  onDone: () => void;
  className?: string;
}) {
  const host = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement | null>(null);
  const [phase, setPhase] = useState<"enter" | "play" | "exit">("enter");
  const [caption, setCaption] = useState<{
    line: "ready" | "chair";
    state: "hidden" | "in" | "out";
  }>({ line: "ready", state: "hidden" });
  const text = caption.state;
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
    const box = host.current;
    if (!box) return finish();
    // the booking may still be loading: fall back to the film the Confirm tap readied
    const spec = filmFor(audience ?? filmAudience);
    const v = filmElement(audience);
    video.current = v;
    v.setAttribute(
      "aria-label",
      "Bhargav getting ready, then the reserved chair at Hair by Bhargav",
    );
    v.className = "absolute inset-0 h-full w-full object-cover will-change-transform";
    box.prepend(v);
    let begun = false;
    let atChair = false;
    let exiting = false;
    let raf = 0;
    let exitTimer = 0;

    // follow the film's own clock so the title and the exit stay in sync
    const tick = () => {
      const t = v.currentTime;
      if (!atChair && t >= spec.chairAt) {
        atChair = true;
        chair.current?.();
      }
      const end = Number.isFinite(v.duration) ? v.duration : spec.length;
      const next =
        t < spec.chairAt
          ? ({
              line: "ready",
              state:
                t >= spec.chairAt - READY_OUT_BEFORE_CHAIR
                  ? "out"
                  : t >= READY_IN
                    ? "in"
                    : "hidden",
            } as const)
          : ({
              line: "chair",
              state:
                t >= end - CHAIR_TEXT_OUT_BEFORE_END
                  ? "out"
                  : t >= spec.chairAt + CHAIR_TEXT_AFTER_CUT
                    ? "in"
                    : "hidden",
            } as const);
      setCaption((c) => (c.line === next.line && c.state === next.state ? c : next));
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
    v.addEventListener("playing", begin);
    v.addEventListener("ended", ended);
    // if the film can't start at all (very slow connection), go straight to
    // the confirmation; the guest can also tap to skip while it loads
    const giveUp = window.setTimeout(() => !begun && finish(), 7000);

    v.currentTime = 0;
    // the film always carries its own sound (the interface-sound switch is
    // only for the site's small clicks and chimes)
    audioSession("playback");
    window.clearTimeout(soundtrackDone);
    v.muted = false;
    v.volume = 1;
    v.play().catch(() => {
      // sound not allowed: play the picture silently
      v.muted = true;
      v.play().catch(() => finish());
    });
    return () => {
      window.clearTimeout(giveUp);
      window.clearTimeout(exitTimer);
      cancelAnimationFrame(raf);
      v.removeEventListener("playing", begin);
      v.removeEventListener("ended", ended);
      v.pause();
      v.remove();
    };
  }, []);

  const filmStyle =
    phase === "enter"
      ? { transform: "scale(1.04)", filter: "brightness(0.8)", opacity: "0" }
      : phase === "play"
        ? { transform: "none", filter: "brightness(1)", opacity: "1" }
        : // leaving: a gentle forward push, softening into the confirmation
          { transform: "scale(1.07)", filter: "blur(7px) brightness(0.55)", opacity: "0" };
  const transition =
    phase === "exit"
      ? `transform ${EXIT_MS}ms cubic-bezier(0.4,0,0.7,0.2), filter ${EXIT_MS}ms ease-in, opacity ${EXIT_MS}ms ease-in`
      : "transform 420ms cubic-bezier(0.16,1,0.3,1), filter 420ms ease-out, opacity 300ms ease-out";
  useEffect(() => {
    const v = video.current;
    if (v) Object.assign(v.style, filmStyle, { transition });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

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

  return (
    <div ref={host} className={"overflow-hidden bg-[#0B0B0B] " + (className ?? "relative")}>
      {/* a quiet line, like a film card: never over the chair */}
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
          {caption.line === "ready"
            ? "Bhargav is getting ready for you"
            : "Your chair is being reserved"}
        </p>
      </div>
      {/* soft letterbox edge so the title always reads */}
      <span className="pointer-events-none absolute inset-x-0 bottom-0 h-[18%] bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
    </div>
  );
}
