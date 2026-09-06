import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useBooking, servicesOf, type Booking } from "@/lib/booking-store";
import { BUSINESS, formatLongDate, minuteLabel, SLOT_MINUTES } from "@/lib/salon";
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
  const [stage, setStage] = useState(cinematic ? 0 : 4);

  useEffect(() => {
    if (hydrated && booking) resetDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, Boolean(booking)]);

  useEffect(() => {
    if (!cinematic) return;
    const marks = [400, 1900, 3200, 4600];
    const timers = marks.map((ms, i) => window.setTimeout(() => setStage((s) => Math.max(s, i + 1)), ms));
    return () => timers.forEach(window.clearTimeout);
  }, [cinematic]);

  const services = booking ? servicesOf(booking) : [];
  const serviceLine = services.map((s) => s.name).join(" · ") || "Appointment";
  const totalSlots = services.reduce((n, s) => n + s.slots, 0);

  const onSave = useCallback(() => {
    if (booking) void saveConfirmationImage(booking, serviceLine);
  }, [booking, serviceLine]);

  if (!hydrated) {
    return (
      <div className="flex min-h-[100svh] items-center justify-center bg-background text-foreground">
        <p className="eyebrow animate-pulse">Preparing your confirmation</p>
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

  return (
    <div
      onClick={() => setStage(4)}
      className="relative min-h-[100svh] overflow-hidden bg-[#0B0B0B] text-[#E8E1D8]"
    >
      {/* Phase 3 — Bhargav, cinematic black & white */}
      <div
        className="pointer-events-none absolute inset-0 transition-opacity duration-[2200ms] ease-out"
        style={{ opacity: stage >= 2 ? 0.42 : 0 }}
      >
        <img
          src={portrait.url}
          alt=""
          aria-hidden="true"
          className="cine-drift h-full w-full object-cover grayscale contrast-[1.08]"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-[#0B0B0B]/75 via-[#0B0B0B]/85 to-[#0B0B0B]" />
      </div>
      {/* ambient grain */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.05] mix-blend-screen"
        style={{
          backgroundImage:
            "radial-gradient(circle at 20% 30%, #fff 0.5px, transparent 0.6px), radial-gradient(circle at 70% 60%, #fff 0.5px, transparent 0.6px)",
          backgroundSize: "7px 7px, 11px 11px",
        }}
      />

      <div className="relative mx-auto flex min-h-[100svh] max-w-md flex-col justify-center px-6 py-12 sm:max-w-lg">
        {/* Phase 2 — HB logo */}
        <div
          className="flex justify-center transition-all duration-[1600ms] ease-out"
          style={{
            opacity: stage >= 1 ? 1 : 0,
            transform: stage >= 1 ? "translateY(0)" : "translateY(14px)",
          }}
        >
          <img
            src={logo.url}
            alt="Hair by Bhargav"
            className="h-14 w-auto object-contain brightness-0 invert"
          />
        </div>

        {/* Phase 4 — message */}
        <div
          className="mt-10 text-center transition-all duration-[1400ms] ease-out"
          style={{
            opacity: stage >= 3 ? 1 : 0,
            transform: stage >= 3 ? "translateY(0)" : "translateY(12px)",
          }}
        >
          <h1 className="font-display text-5xl leading-none tracking-wide sm:text-6xl">
            You're booked.
          </h1>
          <p className="mt-4 font-display text-2xl italic text-[#E8E1D8]/80">
            Your chair is reserved.
          </p>
          <p className="mt-2 text-[0.7rem] uppercase tracking-[0.28em] text-[#C9A96A]">
            Bhargav is waiting for you
          </p>
        </div>

        {/* Phase 5 — emblem + details */}
        <div
          className="transition-all duration-[1200ms] ease-out"
          style={{
            opacity: stage >= 4 ? 1 : 0,
            transform: stage >= 4 ? "translateY(0)" : "translateY(18px)",
            pointerEvents: stage >= 4 ? "auto" : "none",
          }}
        >
          <div className="mt-10 flex justify-center [perspective:600px]">
            {stage >= 4 ? (
              <span className="emblem-in flex h-16 w-16 items-center justify-center rounded-full border border-[#C9A96A]/70 bg-gradient-to-br from-[#C9A96A]/35 to-transparent">
                <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="#E8D9B6" strokeWidth="1.2">
                  <path d="M4 12.5l5 5L20 6.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            ) : null}
          </div>

          <div className="mt-9 border border-[#C9A96A]/28 bg-[#141312]/70 px-6 py-7 backdrop-blur-sm sm:px-8">
            <div className="text-center text-[0.62rem] uppercase tracking-[0.3em] text-[#C9A96A]">
              Reservation · {booking.reference}
            </div>
            <dl className="mt-6 space-y-5">
              <Row label="Date" value={formatLongDate(booking.date)} />
              <div className="grid grid-cols-2 gap-5">
                <Row label="Time" value={minuteLabel(booking.time)} />
                <Row
                  label="Duration"
                  value={`${totalSlots * SLOT_MINUTES} min`}
                />
              </div>
              <Row label="Service" value={serviceLine} />
              <Row label="Studio" value="Hair by Bhargav" sub={BUSINESS.address} />
            </dl>
          </div>

          <div className="mt-7 space-y-3">
            <button
              onClick={() => downloadIcs(booking, serviceLine)}
              className="w-full bg-[#C9A96A] px-6 py-4 text-[0.7rem] uppercase tracking-[0.22em] text-[#0B0B0B] transition-opacity hover:opacity-90"
            >
              Add to calendar
            </button>
            <button
              onClick={onSave}
              className="w-full border border-[#E8E1D8]/28 px-6 py-4 text-[0.7rem] uppercase tracking-[0.22em] text-[#E8E1D8] transition-colors hover:border-[#E8E1D8]/70"
            >
              Save confirmation
            </button>
            <div className="flex items-center justify-center gap-6 pt-2">
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
    </div>
  );
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
