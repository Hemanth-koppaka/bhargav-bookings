import { createFileRoute, Link } from "@tanstack/react-router";
import { CinematicKit } from "@/components/cinematic-kit";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Copy, Download, MapPin, MessageCircle } from "lucide-react";
import { guestToSalonText, waLink } from "@/lib/whatsapp-link";
import { AddToCalendar } from "@/components/add-to-calendar";
import { sfx } from "@/lib/sfx";
import { prettyPhone } from "@/components/desktop";
import { LogoReveal } from "@/components/motion";
import { useBooking, servicesOf, type Booking } from "@/lib/booking-store";
import { BUSINESS, formatDuration, formatLongDate, fromISO, minuteLabel } from "@/lib/salon";
import portrait from "@/assets/portrait.jpg.asset.json";
import logo from "@/assets/logo.png.asset.json";

export const Route = createFileRoute("/confirmed")({
  validateSearch: (search: Record<string, unknown>): { ref: string; seq?: 1 } => ({
    ref: typeof search["ref"] === "string" ? search["ref"] : "",
    ...(search["seq"] === 1 || search["seq"] === "1" ? { seq: 1 as const } : {}),
  }),
  head: () => ({
    meta: [
      { title: "Booking confirmed — Hair by Bhargav" },
      {
        name: "description",
        content: "Your chair is reserved at Hair by Bhargav, KPHB Phase 9, Kukatpally, Hyderabad.",
      },
      { property: "og:title", content: "Booking confirmed — Hair by Bhargav" },
      { property: "og:description", content: "Your chair is reserved." },
    ],
  }),
  component: ConfirmedScreen,
});

/* ── helpers ─────────────────────────────────────────────── */

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

/** Draws the confirmation card and returns it as a PNG (null if the browser can't). */
async function renderConfirmationImage(booking: Booking, serviceLine: string): Promise<Blob | null> {
  // the card's typefaces must be ready, or the canvas falls back to defaults
  await document.fonts?.ready.catch(() => {});
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.fillStyle = "#0B0B0B";
  ctx.fillRect(0, 0, W, H);

  try {
    const img = await loadImage(portrait.url);
    const scale = Math.max(W / img.width, H / img.height);
    const w = img.width * scale;
    const h = img.height * scale;
    ctx.globalAlpha = 0.4;
    ctx.filter = "grayscale(1)";
    ctx.drawImage(img, (W - w) / 2, (H - h) / 2 - 60, w, h);
    ctx.filter = "none";
    ctx.globalAlpha = 1;
  } catch {
    /* portrait optional */
  }

  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, "rgba(11,11,11,0.72)");
  grad.addColorStop(0.45, "rgba(11,11,11,0.86)");
  grad.addColorStop(1, "#0B0B0B");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  const gold = "#C9A96A";
  const ivory = "#E8E1D8";

  ctx.strokeStyle = "rgba(201,169,106,0.35)";
  ctx.lineWidth = 2;
  ctx.strokeRect(56, 56, W - 112, H - 112);

  ctx.textAlign = "center";
  // text never runs past the frame: long names shrink to fit
  const fit = (text: string, max: number, size: number, face: string, min = 24) => {
    let s = size;
    ctx.font = face.replace("{s}", String(s));
    while (ctx.measureText(text).width > max && s > min) {
      s -= 2;
      ctx.font = face.replace("{s}", String(s));
    }
    return s;
  };
  const SERIF = "300 {s}px 'Cormorant Garamond', Georgia, serif";
  const SANS = "400 {s}px Jost, sans-serif";
  const MAXW = W - 220;

  ctx.fillStyle = gold;
  ctx.font = "500 26px Jost, sans-serif";
  ctx.fillText("H A I R   B Y   B H A R G A V", W / 2, 170);

  ctx.fillStyle = ivory;
  ctx.font = "300 74px 'Cormorant Garamond', Georgia, serif";
  ctx.fillText("Booking Confirmed", W / 2, 268);
  ctx.fillStyle = "rgba(201,169,106,0.5)";
  ctx.fillRect(W / 2 - 60, 306, 120, 1);

  const longDate = fromISO(booking.date).toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const rows: Array<[string, string]> = [
    ["GUEST", booking.customer.name],
    ["SERVICE", serviceLine],
    ["DATE", longDate],
    ["TIME", minuteLabel(booking.time)],
    ["BOOKING ID", booking.reference],
  ];
  let y = 400;
  for (const [label, value] of rows) {
    ctx.fillStyle = "rgba(232,225,216,0.5)";
    ctx.font = "400 21px Jost, sans-serif";
    ctx.fillText(label.split("").join(" "), W / 2, y);
    ctx.fillStyle = ivory;
    fit(value, MAXW, 46, SERIF);
    ctx.fillText(value, W / 2, y + 52);
    y += 112;
  }

  // studio
  ctx.fillStyle = "rgba(232,225,216,0.5)";
  ctx.font = "400 21px Jost, sans-serif";
  ctx.fillText("S T U D I O", W / 2, 972);
  ctx.fillStyle = ivory;
  ctx.font = "300 38px 'Cormorant Garamond', Georgia, serif";
  ctx.fillText("Hair by Bhargav", W / 2, 1018);
  ctx.fillStyle = "rgba(232,225,216,0.72)";
  const where = BUSINESS.locationShort || "KPHB Phase 9, Kukatpally, Hyderabad";
  fit(where, MAXW, 26, SANS, 18);
  ctx.fillText(where, W / 2, 1058);

  ctx.fillStyle = "rgba(201,169,106,0.35)";
  ctx.fillRect(W / 2 - 160, 1104, 320, 1);

  ctx.fillStyle = ivory;
  ctx.font = "italic 300 50px 'Cormorant Garamond', Georgia, serif";
  ctx.fillText("Your chair is waiting.", W / 2, 1182);
  ctx.fillStyle = gold;
  ctx.font = "300 32px 'Cormorant Garamond', Georgia, serif";
  ctx.fillText("— Bhargav", W / 2, 1234);

  try {
    return await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
  } catch {
    return null; // e.g. a tainted canvas
  }
}

const framed = () => {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
};

/**
 * Phones: the share sheet ("Save Image" puts it in Photos).
 * Computers: a normal download. If neither is possible (or we're inside a
 * preview frame that blocks downloads), the card opens on screen to save by hand.
 */
async function deliverImage(blob: Blob, name: string): Promise<"shared" | "downloaded" | "manual" | "cancelled"> {
  const file = new File([blob], name, { type: "image/png" });
  const touch = window.matchMedia?.("(pointer: coarse)").matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: "Hair by Bhargav: booking confirmed" });
      return "shared";
    } catch (e) {
      if (e instanceof Error && e.name === "AbortError") return "cancelled";
      // otherwise fall through to download / manual
    }
  }
  if (framed()) return "manual";
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a); // Firefox and Safari need it in the page
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000); // Safari reads it after click
  return "downloaded";
}

/* ── screen ──────────────────────────────────────────────── */

function ConfirmedScreen() {
  const { ref, seq } = Route.useSearch();
  const { bookings, hydrated, resetDraft } = useBooking();
  const booking = bookings.find((b) => b.reference === ref);
  const cinematic = seq === 1;
  const [stage, setStage] = useState(cinematic ? 0 : FINAL);
  // the barber-kit film opens a fresh confirmation; the booking ID follows it
  // The film is framed for phones (9:16): it plays on phones and portrait
  // tablets; wide screens go straight to the confirmation.
  const [film, setFilm] = useState<"on" | "leaving" | "off">(() =>
    cinematic &&
    (typeof window === "undefined" ||
      window.matchMedia("(max-width: 767px), (orientation: portrait) and (max-width: 1100px)").matches)
      ? "on"
      : "off",
  );
  const stopScore = useRef<(() => void) | null>(null);
  const endFilm = useCallback(() => {
    setFilm((f) => (f === "on" ? "leaving" : f));
    window.setTimeout(() => setFilm("off"), 700);
  }, []);
  // skipping the film fades its music; letting it finish lets the last chord ring
  const skipFilm = useCallback(() => {
    stopScore.current?.();
    endFilm();
  }, [endFilm]);
  useEffect(() => () => stopScore.current?.(), []);

  useEffect(() => {
    if (hydrated && booking) resetDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, Boolean(booking)]);

  useEffect(() => {
    if (!cinematic || film === "on") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStage(FINAL);
      return;
    }
    // 1 logo · 2 card turns in · 3 seal stamps · 4 portrait + message · 5 actions
    const marks = [250, 1900, 3000, 3900, 5100];
    const timers = marks.map((ms, i) => window.setTimeout(() => setStage((s) => Math.max(s, i + 1)), ms));
    return () => timers.forEach(window.clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cinematic, film === "on"]);

  // sound follows the picture: soft impact + bloom as the logo appears,
  // a quiet press as the seal stamps the card
  const heard = useRef(0);
  useEffect(() => {
    if (!cinematic || film === "on") return;
    if (stage >= 1 && heard.current < 1) {
      heard.current = 1;
      sfx.bookingConfirm();
    }
    if (stage >= 3 && stage < FINAL && heard.current < 3) {
      heard.current = 3;
      sfx.seal();
    }
  }, [stage, cinematic, film]);

  const services = booking ? servicesOf(booking) : [];
  const serviceLine = services.map((s) => s.name).join(" · ") || "Appointment";
  const totalMinutes = services.reduce((n, s) => n + (s.minutes ?? s.slots * 30), 0);

  const [copied, setCopied] = useState(false);

  // The card is drawn ahead of time, so a tap shares/downloads instantly
  // (phones only allow the share sheet straight after the tap).
  const card = useRef<Blob | null>(null);
  const [preview, setPreview] = useState<{ url: string; note: string } | null>(null);
  const [saveNote, setSaveNote] = useState("");
  const [waNote, setWaNote] = useState("");

  // If the actions (calendar, WhatsApp, save) sit below the fold, point to them:
  // a small arrow that fades on scroll, when tapped, or after a few seconds.
  const actionsRef = useRef<HTMLDivElement>(null);
  const [scrollHint, setScrollHint] = useState(false);
  useEffect(() => {
    if (stage < FINAL || film !== "off") return;
    const el = actionsRef.current;
    if (!el) return;
    const below = () => el.getBoundingClientRect().top > window.innerHeight - 56;
    const show = window.setTimeout(() => setScrollHint(below()), 900);
    const hide = window.setTimeout(() => setScrollHint(false), 9000);
    const onScroll = () => {
      if (!below() || window.scrollY > 40) setScrollHint(false);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(hide);
      window.removeEventListener("scroll", onScroll);
    };
  }, [stage, film, hydrated, Boolean(booking)]);
  const toActions = () => {
    setScrollHint(false);
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    actionsRef.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "end" });
  };
  useEffect(() => {
    if (!booking || stage < FINAL) return;
    let live = true;
    void renderConfirmationImage(booking, serviceLine).then((b) => {
      if (live) card.current = b;
    });
    return () => {
      live = false;
    };
  }, [booking, serviceLine, stage]);
  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview.url);
  }, [preview]);

  const onSave = useCallback(async () => {
    if (!booking) return;
    setSaveNote("");
    const blob = card.current ?? (await renderConfirmationImage(booking, serviceLine));
    if (!blob) {
      sfx.error();
      setSaveNote("Couldn't create the image on this browser. A screenshot works too.");
      return;
    }
    card.current = blob;
    const name = `hair-by-bhargav-${booking.reference}.png`;
    const how = await deliverImage(blob, name);
    if (how === "shared" || how === "cancelled") return;
    if (how === "downloaded") {
      sfx.calendarDone();
      setSaveNote("Saved to your downloads.");
      return;
    }
    setPreview({
      url: URL.createObjectURL(blob),
      note: "Press and hold the image (or right-click it) and choose Save Image.",
    });
  }, [booking, serviceLine]);

  if (!hydrated) {
    return (
      <div className="flex min-h-[100svh] items-center justify-center bg-[#0B0B0B] text-[#E8E1D8]">
        <p className="animate-pulse text-[0.62rem] uppercase tracking-[0.3em] text-[#E8E1D8]/40">
          Preparing your confirmation
        </p>
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="flex min-h-[100svh] items-center justify-center bg-background px-6 text-foreground">
        <div className="text-center">
          <div className="eyebrow">Hair by Bhargav</div>
          <h1 className="font-display text-4xl">Booking not found</h1>
          <p className="mt-3 text-sm text-muted-foreground">
            We couldn't find that reference on this device.
          </p>
          <Link to="/" className="label-caps mt-8 inline-flex border-b border-accent pb-1">
            Return home
          </Link>
        </div>
      </div>
    );
  }

  const tilt = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || stage < FINAL) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    e.currentTarget.style.setProperty("--rx", `${(-y * 6).toFixed(2)}deg`);
    e.currentTarget.style.setProperty("--ry", `${(x * 8).toFixed(2)}deg`);
  };
  const untilt = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.style.setProperty("--rx", "0deg");
    e.currentTarget.style.setProperty("--ry", "0deg");
  };

  return (
    <div
      onClick={() => setStage(FINAL)}
      className="relative min-h-[100svh] overflow-hidden bg-[#0B0B0B] text-[#E8E1D8]"
    >
      {/* 4 — Bhargav, cinematic black & white */}
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-[2400ms] ease-out"
        style={{ opacity: stage >= 4 ? 1 : 0 }}
      >
        <img
          src={portrait.url}
          alt=""
          aria-hidden="true"
          className="cine-drift h-full w-full object-cover object-[50%_20%] opacity-45 grayscale contrast-[1.08] lg:w-[58%]"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0B0B0B]/70 via-[#0B0B0B]/80 to-[#0B0B0B] lg:bg-gradient-to-r lg:from-[#0B0B0B]/30 lg:via-[#0B0B0B]/75 lg:to-[#0B0B0B]" />
      </div>
      {/* film grain */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.05] mix-blend-screen"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 30%, #fff 0.5px, transparent 0.6px), radial-gradient(circle at 70% 60%, #fff 0.5px, transparent 0.6px)",
          backgroundSize: "7px 7px, 11px 11px",
        }}
      />

      {/* 1 — full-screen logo reveal */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-20 flex items-center justify-center"
        style={{
          opacity: stage === 1 ? 1 : 0,
          transform: stage >= 2 ? "scale(0.92)" : "none",
          transition: "opacity 550ms ease, transform 900ms cubic-bezier(0.22,0.61,0.36,1)",
        }}
      >
        {stage >= 1 && stage < FINAL ? <LogoReveal className="h-24 lg:h-36" imgClassName="brightness-0 invert" /> : null}
      </div>

      <div className="relative z-10 mx-auto grid min-h-[100svh] max-w-md content-center gap-y-12 px-6 py-12 sm:max-w-lg lg:max-w-6xl lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-x-20 lg:px-14">
        {/* 4 — message */}
        <div className="text-center lg:text-left">
          <div className="flex justify-center lg:justify-start" style={{ ...reveal(stage >= 2, 10, 1200), transitionDelay: "450ms" }}>
            <img src={logo.url} alt="Hair by Bhargav" className="h-12 w-auto object-contain brightness-0 invert lg:h-14" />
          </div>
          <div className="mt-9 lg:mt-14" style={reveal(stage >= 4, 14, 1500)}>
            <h1 className="font-display text-[3.2rem] leading-none tracking-wide sm:text-6xl lg:text-[4.75rem]">
              You're booked.
            </h1>
            <p className="mt-4 font-display text-2xl italic text-[#E8E1D8]/80 lg:text-[2rem]">Your chair is reserved.</p>
            <p className="mt-3 text-[0.7rem] uppercase tracking-[0.3em] text-[#C9A96A]">Bhargav is waiting for you</p>
          </div>
        </div>

        {/* 2 — the reservation card, 3 — the seal */}
        <div>
          <div className="[perspective:1400px]" onPointerMove={tilt} onPointerLeave={untilt}>
            <div
              className="relative [transform-style:preserve-3d]"
              style={{
                opacity: stage >= 2 ? 1 : 0,
                transform:
                  stage >= 2
                    ? "rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg)) translateY(0)"
                    : "rotateX(16deg) rotateY(-24deg) translateY(36px) scale(0.96)",
                transition:
                  stage >= FINAL
                    ? "transform 500ms cubic-bezier(0.22,0.61,0.36,1), opacity 600ms ease"
                    : "transform 1500ms cubic-bezier(0.22,0.61,0.36,1) 350ms, opacity 1100ms ease 350ms",
              }}
            >
              <div className="relative overflow-hidden rounded-md border border-[#C9A96A]/30 bg-gradient-to-br from-[#1b1916] via-[#141312] to-[#0f0e0d] p-1.5 shadow-[0_40px_80px_-30px_rgba(0,0,0,0.9)]">
                <div className="rounded-[3px] border border-[#C9A96A]/15 px-6 py-7 sm:px-8 lg:px-10 lg:py-9">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      void navigator.clipboard?.writeText(booking.reference).then(() => {
                        setCopied(true);
                        window.setTimeout(() => setCopied(false), 1600);
                      });
                    }}
                    className="press flex items-center gap-2 text-[0.62rem] uppercase tracking-[0.3em] text-[#C9A96A]"
                    aria-label="Copy booking reference"
                  >
                    Reservation · {booking.reference}
                    <span key={String(copied)} className="pop-in inline-flex">
                      {copied ? <Check className="h-3.5 w-3.5" strokeWidth={1.5} /> : <Copy className="h-3.5 w-3.5" strokeWidth={1.25} />}
                    </span>
                  </button>
                  <div className="mt-6 font-display text-[1.8rem] leading-tight sm:text-[2rem] lg:text-[2.4rem]">
                    {fromISO(booking.date).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
                  </div>
                  <div className="mt-1 font-display text-[1.5rem] italic text-[#E8D9B6] lg:text-[1.7rem]">
                    {minuteLabel(booking.time)} · {formatDuration(totalMinutes || 30)}
                  </div>
                  <div className="my-6 h-px bg-gradient-to-r from-[#C9A96A]/40 via-[#C9A96A]/15 to-transparent" />
                  <dl className="space-y-4">
                    <Row label="Service" value={serviceLine} />
                    {booking.stylist ? <Row label="Stylist" value={booking.stylist} /> : null}
                    <Row label="Guest" value={booking.customer.name} />
                    <Row label="Studio" value="Hair by Bhargav" sub={BUSINESS.address} />
                  </dl>
                </div>
                {/* light sweep once the card lands */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute inset-0 bg-[linear-gradient(105deg,transparent_40%,rgba(232,217,182,0.12)_50%,transparent_60%)] bg-[length:250%_100%] transition-[background-position] duration-[1600ms] ease-out"
                  style={{ backgroundPosition: stage >= 3 ? "-60% 0" : "160% 0" }}
                />
              </div>

              {stage >= 3 ? <Seal /> : null}
            </div>
          </div>

          {/* 5 — actions */}
          <div ref={actionsRef} className="mt-8 scroll-mb-6 space-y-3" style={{ ...reveal(stage >= FINAL, 16, 900), pointerEvents: stage >= FINAL ? "auto" : "none" }}>
            {/* free reminders: the guest's own calendar app reminds them */}
            <AddToCalendar booking={booking} tone="dark" />
            {/* free: opens WhatsApp with the booking written out, to the salon's number */}
            <a
              href={waLink(
                BUSINESS.phones[0] ?? "",
                guestToSalonText({
                  reference: booking.reference,
                  name: booking.customer.name,
                  date: booking.date,
                  time: booking.time,
                  services: booking.snapshot?.services.map((s) => s.name) ?? services.map((s) => s.name),
                  minutes: booking.snapshot?.minutes ?? (totalMinutes || 30),
                  price: booking.snapshot?.price ?? services.reduce((n, s) => n + s.price, 0),
                  priceFrom: services.some((s) => s.from),
                  manageUrl: typeof window !== "undefined" ? `${window.location.origin}/manage?ref=${booking.reference}` : "",
                }),
              )}
              target="_blank"
              rel="noopener noreferrer"
              data-sfx="contact"
              onClick={(e) => {
                setWaNote("");
                // Inside an embedding frame (e.g. the editor preview) the browser blocks
                // WhatsApp's page. Copy the message instead and say so; the live site opens WhatsApp.
                if (!framed()) return;
                e.preventDefault();
                const msg = new URL(e.currentTarget.href).searchParams.get("text") ?? "";
                setWaNote("WhatsApp can't open inside this preview window. On the live site this button opens WhatsApp directly.");
                // copy the message too, so it can be pasted in WhatsApp by hand
                void navigator.clipboard?.writeText(msg).then(
                  () =>
                    setWaNote(
                      `WhatsApp can't open inside this preview window (it works on the live site). Your booking message is copied. Paste it in WhatsApp to ${prettyPhone(BUSINESS.phones[0] ?? "")}.`,
                    ),
                  () => {},
                );
              }}
              className="press flex min-h-13 w-full items-center justify-center gap-3 rounded-sm border border-[#E8E1D8]/28 px-6 text-[0.66rem] uppercase tracking-[0.2em] text-[#E8E1D8] hover:border-[#E8E1D8]/70"
            >
              <MessageCircle className="h-4 w-4" strokeWidth={1.25} />
              Confirm on WhatsApp
            </a>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => void onSave()}
                data-sfx="secondary"
                className="press flex min-h-13 items-center justify-center gap-2.5 rounded-sm border border-[#E8E1D8]/28 px-4 text-[0.66rem] uppercase tracking-[0.2em] text-[#E8E1D8] hover:border-[#E8E1D8]/70"
              >
                <Download className="h-4 w-4" strokeWidth={1.25} />
                Save image
              </button>
              <a
                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(BUSINESS.mapsQuery)}`}
                target="_blank"
                rel="noreferrer"
                className="press flex min-h-13 items-center justify-center gap-2.5 rounded-sm border border-[#E8E1D8]/28 px-4 text-[0.66rem] uppercase tracking-[0.2em] text-[#E8E1D8] hover:border-[#E8E1D8]/70"
              >
                <MapPin className="h-4 w-4" strokeWidth={1.25} />
                Directions
              </a>
            </div>
            {saveNote || waNote ? (
              <p role="status" className="text-center text-[0.78rem] leading-relaxed text-[#E8E1D8]/70">
                {waNote || saveNote}
              </p>
            ) : null}
            <div className="flex items-center justify-center gap-6 pt-1">
              <Link
                to="/manage"
                className="py-2 text-[0.68rem] uppercase tracking-[0.22em] text-[#E8E1D8]/55 transition-colors hover:text-[#E8E1D8]"
              >
                Manage booking
              </Link>
              <Link
                to="/"
                className="py-2 text-[0.68rem] uppercase tracking-[0.22em] text-[#E8E1D8]/55 transition-colors hover:text-[#E8E1D8]"
              >
                Back to home
              </Link>
            </div>
          </div>
        </div>
      </div>

      <button
        type="button"
        aria-hidden={!scrollHint}
        tabIndex={scrollHint ? 0 : -1}
        onClick={(e) => {
          e.stopPropagation();
          toActions();
        }}
        className={
          "fixed inset-x-0 bottom-5 z-40 mx-auto flex w-max items-center gap-2 rounded-full border border-[#C9A96A]/40 bg-[#141210]/90 px-4 py-2.5 text-[0.62rem] uppercase tracking-[0.22em] text-[#E8E1D8] shadow-[0_12px_30px_-12px_rgba(0,0,0,0.8)] backdrop-blur transition-all duration-700 " +
          (scrollHint ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-3 opacity-0")
        }
      >
        Calendar · WhatsApp · Save
        <ChevronDown className="h-4 w-4 text-[#C9A96A] motion-safe:animate-bounce" strokeWidth={1.5} />
      </button>

      {preview ? (
        <div
          role="dialog"
          aria-label="Your confirmation image"
          className="fixed inset-0 z-[60] flex flex-col items-center justify-center gap-4 bg-black/85 p-5"
          onClick={() => setPreview(null)}
        >
          <img
            src={preview.url}
            alt="Hair by Bhargav booking confirmation"
            className="max-h-[78svh] w-auto max-w-full rounded-sm shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
          <p className="max-w-sm text-center text-[0.82rem] text-[#E8E1D8]/80">{preview.note}</p>
          <button
            type="button"
            onClick={() => setPreview(null)}
            className="press rounded-sm border border-[#E8E1D8]/30 px-5 py-2 text-[0.66rem] uppercase tracking-[0.2em] text-[#E8E1D8]"
          >
            Close
          </button>
        </div>
      ) : null}

      {film !== "off" ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#0B0B0B] transition-opacity duration-700 ease-out"
          style={{ opacity: film === "leaving" ? 0 : 1 }}
          onClick={(e) => {
            e.stopPropagation();
            skipFilm();
          }}
        >
          <CinematicKit
            className="h-auto w-[min(100vw,calc(100svh*9/16))]"
            alt="Bhargav's tools: comb, clipper, round brush, scissors and razor"
            onDone={endFilm}
            onStart={() => {
              stopScore.current = sfx.score();
            }}
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-6 text-center text-[0.6rem] uppercase tracking-[0.3em] text-[#E8E1D8]/40">
            Preparing your chair · tap to skip
          </div>
        </div>
      ) : null}

      {stage < FINAL ? (
        <div className="absolute inset-x-0 bottom-6 z-30 text-center text-[0.6rem] uppercase tracking-[0.3em] text-[#E8E1D8]/35">
          Tap to skip
        </div>
      ) : null}
    </div>
  );
}

const FINAL = 5;

/** Wax-seal style stamp: drops onto the card, then turns slowly. */
function Seal() {
  return (
    <div aria-hidden className="seal-stamp absolute -top-9 -right-4 h-24 w-24 sm:-right-7 lg:-top-11 lg:-right-10 lg:h-28 lg:w-28">
      <span className="seal-burst absolute inset-0 rounded-full border border-[#C9A96A]/70" />
      <svg viewBox="0 0 100 100" className="h-full w-full drop-shadow-[0_10px_18px_rgba(0,0,0,0.6)]">
        <defs>
          <radialGradient id="seal-fill" cx="35%" cy="30%" r="75%">
            <stop offset="0%" stopColor="#E3C88E" />
            <stop offset="55%" stopColor="#C9A96A" />
            <stop offset="100%" stopColor="#8E7243" />
          </radialGradient>
          <path id="seal-ring" d="M50 50 m-35 0 a35 35 0 1 1 70 0 a35 35 0 1 1 -70 0" />
        </defs>
        <circle cx="50" cy="50" r="47" fill="url(#seal-fill)" />
        <circle cx="50" cy="50" r="43" fill="none" stroke="#0B0B0B" strokeOpacity="0.35" strokeWidth="0.6" />
        <circle cx="50" cy="50" r="27" fill="none" stroke="#0B0B0B" strokeOpacity="0.35" strokeWidth="0.6" />
        <g className="seal-spin">
          <text fill="#0B0B0B" fillOpacity="0.78" fontSize="7.4" letterSpacing="2.6" fontFamily="Jost, sans-serif">
            <textPath href="#seal-ring">CONFIRMED · HAIR BY BHARGAV ·</textPath>
          </text>
        </g>
        <path
          d="M39 50.5l7.5 7.5L62 42.5"
          fill="none"
          stroke="#0B0B0B"
          strokeOpacity="0.85"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          className="seal-tick"
        />
      </svg>
    </div>
  );
}

/** Fade-and-rise style for each phase of the reveal. */
function reveal(on: boolean, y: number, ms: number) {
  return {
    opacity: on ? 1 : 0,
    transform: on ? "translateY(0)" : `translateY(${y}px)`,
    transition: `opacity ${ms}ms ease-out, transform ${ms}ms ease-out`,
  };
}

function Row({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <dt className="text-[0.6rem] uppercase tracking-[0.28em] text-[#E8E1D8]/45">{label}</dt>
      <dd className="mt-1.5 font-display text-xl leading-snug text-[#E8E1D8]">{value}</dd>
      {sub ? <dd className="mt-1 text-[0.75rem] text-[#E8E1D8]/55">{sub}</dd> : null}
    </div>
  );
}
