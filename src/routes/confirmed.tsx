import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { CalendarPlus, Check, Copy, Download, MapPin } from "lucide-react";
import { LogoReveal } from "@/components/motion";
import { useBooking, servicesOf, type Booking } from "@/lib/booking-store";
import { BUSINESS, formatDuration, formatLongDate, fromISO, minuteLabel, SLOT_MINUTES } from "@/lib/salon";
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

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function icsStamp(date: string, minutes: number) {
  const parts = date.split("-").map(Number);
  const d = new Date(
    parts[0] ?? 1970,
    (parts[1] ?? 1) - 1,
    parts[2] ?? 1,
    Math.floor(minutes / 60),
    minutes % 60,
  );
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `T${pad(d.getHours())}${pad(d.getMinutes())}00`
  );
}

function downloadIcs(booking: Booking, title: string) {
  const slots = servicesOf(booking).reduce((n, s) => n + s.slots, 0) || 1;
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Hair by Bhargav//Booking//EN",
    "BEGIN:VEVENT",
    `UID:${booking.reference}@hairbybhargav`,
    `DTSTART:${icsStamp(booking.date, booking.time)}`,
    `DTEND:${icsStamp(booking.date, booking.time + slots * SLOT_MINUTES)}`,
    `SUMMARY:${title} — Hair by Bhargav`,
    `LOCATION:${BUSINESS.address.replace(/,/g, "\\,")}`,
    `DESCRIPTION:Reference ${booking.reference}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `hair-by-bhargav-${booking.reference}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

async function saveConfirmationImage(booking: Booking, serviceLine: string) {
  const W = 1080;
  const H = 1350;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

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
  ctx.fillStyle = gold;
  ctx.font = "500 26px Jost, sans-serif";
  ctx.fillText("H A I R   B Y   B H A R G A V", W / 2, 190);

  ctx.fillStyle = ivory;
  ctx.font = "300 74px 'Cormorant Garamond', Georgia, serif";
  ctx.fillText("Booking Confirmed", W / 2, 300);

  ctx.fillStyle = "rgba(201,169,106,0.5)";
  ctx.fillRect(W / 2 - 60, 340, 120, 1);

  const rows: Array<[string, string]> = [
    ["GUEST", booking.customer.name],
    ["SERVICE", serviceLine],
    ["DATE", formatLongDate(booking.date)],
    ["TIME", minuteLabel(booking.time)],
    ["REFERENCE", booking.reference],
  ];

  let y = 470;
  for (const [label, value] of rows) {
    ctx.fillStyle = "rgba(232,225,216,0.5)";
    ctx.font = "400 22px Jost, sans-serif";
    ctx.fillText(label, W / 2, y);
    ctx.fillStyle = ivory;
    ctx.font = "300 46px 'Cormorant Garamond', Georgia, serif";
    ctx.fillText(value, W / 2, y + 56);
    y += 130;
  }

  ctx.fillStyle = "rgba(232,225,216,0.5)";
  ctx.font = "400 22px Jost, sans-serif";
  ctx.fillText("LOCATION", W / 2, y);
  ctx.fillStyle = ivory;
  ctx.font = "300 38px 'Cormorant Garamond', Georgia, serif";
  ctx.fillText("Hair by Bhargav", W / 2, y + 48);
  ctx.font = "300 28px Jost, sans-serif";
  ctx.fillStyle = "rgba(232,225,216,0.72)";
  ctx.fillText("KPHB Phase 9, Kukatpally, Hyderabad", W / 2, y + 92);

  ctx.fillStyle = ivory;
  ctx.font = "italic 300 52px 'Cormorant Garamond', Georgia, serif";
  ctx.fillText("Your chair is waiting.", W / 2, H - 190);
  ctx.fillStyle = gold;
  ctx.font = "300 34px 'Cormorant Garamond', Georgia, serif";
  ctx.fillText("— Bhargav", W / 2, H - 130);

  const blob: Blob | null = await new Promise((r) => canvas.toBlob(r, "image/png"));
  if (!blob) return;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `hair-by-bhargav-${booking.reference}.png`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ── screen ──────────────────────────────────────────────── */

function ConfirmedScreen() {
  const { ref, seq } = Route.useSearch();
  const { bookings, hydrated, resetDraft } = useBooking();
  const booking = bookings.find((b) => b.reference === ref);
  const cinematic = seq === 1;
  const [stage, setStage] = useState(cinematic ? 0 : FINAL);

  useEffect(() => {
    if (hydrated && booking) resetDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, Boolean(booking)]);

  useEffect(() => {
    if (!cinematic) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setStage(FINAL);
      return;
    }
    // 1 logo · 2 card turns in · 3 seal stamps · 4 portrait + message · 5 actions
    const marks = [250, 1900, 3000, 3900, 5100];
    const timers = marks.map((ms, i) => window.setTimeout(() => setStage((s) => Math.max(s, i + 1)), ms));
    return () => timers.forEach(window.clearTimeout);
  }, [cinematic]);

  const services = booking ? servicesOf(booking) : [];
  const serviceLine = services.map((s) => s.name).join(" · ") || "Appointment";
  const totalSlots = services.reduce((n, s) => n + s.slots, 0);

  const [copied, setCopied] = useState(false);

  const onSave = useCallback(() => {
    if (booking) void saveConfirmationImage(booking, serviceLine);
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
                    {minuteLabel(booking.time)} · {formatDuration(totalSlots || 1)}
                  </div>
                  <div className="my-6 h-px bg-gradient-to-r from-[#C9A96A]/40 via-[#C9A96A]/15 to-transparent" />
                  <dl className="space-y-4">
                    <Row label="Service" value={serviceLine} />
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
          <div className="mt-8 space-y-3" style={{ ...reveal(stage >= FINAL, 16, 900), pointerEvents: stage >= FINAL ? "auto" : "none" }}>
            <button
              onClick={() => downloadIcs(booking, serviceLine)}
              className="press sheen flex min-h-14 w-full items-center justify-center gap-3 rounded-sm bg-[#C9A96A] px-6 text-[0.7rem] uppercase tracking-[0.22em] text-[#0B0B0B] hover:opacity-90"
            >
              <CalendarPlus className="h-4 w-4" strokeWidth={1.25} />
              Add to calendar
            </button>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={onSave}
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
