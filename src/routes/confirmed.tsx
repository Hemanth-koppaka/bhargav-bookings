import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useBooking, servicesOf, type Booking } from "@/lib/booking-store";
import { BUSINESS, formatLongDate, minuteLabel, SLOT_MINUTES } from "@/lib/salon";
import logo from "@/assets/logo.png.asset.json";
import portrait from "@/assets/portrait.jpg.asset.json";

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

function prefersReducedMotion() {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

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

type Scene = "logo" | "portrait" | "card";

function ConfirmedScreen() {
  const { ref, seq } = Route.useSearch();
  const { bookings, hydrated, resetDraft } = useBooking();
  const booking = bookings.find((b) => b.reference === ref);

  const [scene, setScene] = useState<Scene>("card");
  const [line1, setLine1] = useState(false);
  const [line2, setLine2] = useState(false);
  const [stamped, setStamped] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (hydrated && booking) resetDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, Boolean(booking)]);

  useEffect(() => {
    if (!hydrated || !booking || started.current) return;
    started.current = true;
    if (seq !== 1 || prefersReducedMotion()) {
      setScene("card");
      setStamped(true);
      return;
    }
    setScene("logo");
    const t: Array<ReturnType<typeof setTimeout>> = [];
    t.push(setTimeout(() => setScene("portrait"), 2600));
    t.push(setTimeout(() => setLine1(true), 3400));
    t.push(setTimeout(() => setLine2(true), 5200));
    t.push(setTimeout(() => setScene("card"), 7400));
    t.push(setTimeout(() => setStamped(true), 7900));
    // Safety: never trap the user on a dark scene if anything stalls.
    t.push(
      setTimeout(() => {
        setScene("card");
        setStamped(true);
      }, 9000),
    );
    // If the portrait fails to load, skip the portrait scene entirely.
    const probe = new Image();
    probe.onerror = () => {
      t.forEach(clearTimeout);
      setScene("card");
      setStamped(true);
    };
    probe.src = portrait.url;
    return () => t.forEach(clearTimeout);
  }, [hydrated, booking, seq]);

  const services = booking ? servicesOf(booking) : [];
  const serviceLine = services.map((s) => s.name).join(" · ") || "Appointment";

  const onSave = useCallback(() => {
    if (booking) void saveConfirmationImage(booking, serviceLine);
  }, [booking, serviceLine]);

  if (!hydrated) return null;

  if (!booking) {
    return (
      <div className="flex min-h-[100svh] items-center justify-center bg-[#0B0B0B] px-6 text-[#E8E1D8]">
        <div className="text-center">
          <h1 className="font-display text-4xl">Booking not found</h1>
          <p className="mt-3 text-sm text-[#E8E1D8]/60">
            We couldn't find that reference on this device.
          </p>
          <Link to="/" className="label-caps mt-8 inline-flex border-b border-[#C9A96A]/50 pb-1">
            Return home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-[100svh] overflow-hidden bg-[#0B0B0B] text-[#E8E1D8]">
      {/* Scene 1 — logo reveal */}
      <div
        className={
          "pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-[#0B0B0B] transition-opacity duration-[1200ms] ease-out " +
          (scene === "logo" ? "opacity-100" : "opacity-0")
        }
        aria-hidden={scene !== "logo"}
      >
        <div className="relative">
          <div
            className={
              "absolute -inset-x-24 inset-y-0 bg-[linear-gradient(100deg,transparent_35%,rgba(201,169,106,0.28)_50%,transparent_65%)] " +
              (scene === "logo" ? "animate-[hb-sheen_2.4s_ease-in-out_forwards]" : "opacity-0")
            }
          />
          <img
            src={logo.url}
            alt="Hair by Bhargav"
            className={
              "relative w-44 max-w-[52vw] object-contain transition-all duration-[1600ms] ease-out sm:w-56 " +
              (scene === "logo" ? "scale-100 opacity-100 blur-0" : "scale-[0.96] opacity-0 blur-md")
            }
          />
        </div>
      </div>

      {/* Scene 2 — portrait + personal message */}
      <div
        className={
          "pointer-events-none fixed inset-0 z-30 transition-opacity duration-[1400ms] ease-out " +
          (scene === "portrait" ? "opacity-100" : "opacity-0")
        }
        aria-hidden={scene !== "portrait"}
      >
        <img
          src={portrait.url}
          alt="Bhargav"
          className={
            "h-full w-full object-cover grayscale transition-transform duration-[7000ms] ease-out " +
            (scene === "portrait" ? "scale-105" : "scale-100")
          }
        />
        <div className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(11,11,11,0.55),rgba(11,11,11,0.35)_35%,rgba(11,11,11,0.95))]" />
        <div className="absolute inset-x-0 bottom-[16vh] px-8 text-center">
          <p
            className={
              "font-display text-3xl leading-snug transition-all duration-[1200ms] ease-out sm:text-5xl " +
              (line1 ? "translate-y-0 opacity-100 blur-0" : "translate-y-3 opacity-0 blur-[3px]")
            }
          >
            Bhargav is getting ready…
          </p>
          <p
            className={
              "mt-3 font-display text-3xl italic leading-snug text-[#C9A96A] transition-all duration-[1200ms] ease-out sm:text-5xl " +
              (line2 ? "translate-y-0 opacity-100 blur-0" : "translate-y-3 opacity-0 blur-[3px]")
            }
          >
            …for you.
          </p>
        </div>
      </div>

      {/* Scene 3 — confirmation card */}
      <div
        className={
          "relative z-10 transition-opacity duration-[1400ms] ease-out " +
          (scene === "card" ? "opacity-100" : "pointer-events-none opacity-0")
        }
      >
        <img
          src={portrait.url}
          alt=""
          aria-hidden
          className="pointer-events-none fixed inset-0 h-full w-full object-cover opacity-[0.13] grayscale"
        />
        <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(120%_80%_at_50%_0%,rgba(23,23,23,0.4),rgba(11,11,11,0.96))]" />

        <div className="relative mx-auto flex min-h-[100svh] max-w-md flex-col justify-center px-6 py-10 sm:max-w-lg">
          <div className="border border-[#C9A96A]/25 bg-[#0B0B0B]/60 px-6 py-8 backdrop-blur-[2px] sm:px-9 sm:py-10">
            <div className="text-center">
              <div className="text-[0.6rem] tracking-[0.42em] text-[#C9A96A] uppercase">
                Hair by Bhargav
              </div>
              <h1
                className={
                  "mt-5 font-display text-[1.7rem] tracking-[0.16em] uppercase transition-all duration-700 ease-out sm:text-3xl " +
                  (stamped ? "scale-100 opacity-100 blur-0" : "scale-[1.14] opacity-0 blur-[2px]")
                }
              >
                Booking Confirmed
              </h1>
              <div
                className={
                  "mx-auto mt-4 h-px bg-[#C9A96A]/50 transition-all delay-200 duration-700 ease-out " +
                  (stamped ? "w-16 opacity-100" : "w-0 opacity-0")
                }
              />
              <p className="mt-5 font-display text-2xl">{booking.customer.name}</p>
              <p className="mt-1 text-[0.72rem] tracking-[0.28em] text-[#E8E1D8]/45 uppercase">
                {booking.reference}
              </p>
            </div>

            <dl className="mt-8 space-y-5">
              <Row label="Service" value={serviceLine} />
              <div className="grid grid-cols-2 gap-5">
                <Row label="Date" value={formatLongDate(booking.date)} />
                <Row label="Time" value={minuteLabel(booking.time)} />
              </div>
              <Row
                label="Location"
                value="Hair by Bhargav"
                sub="KPHB Phase 9, Kukatpally, Hyderabad"
              />
            </dl>

            <div className="mt-8 border-t border-[#E8E1D8]/10 pt-6 text-center">
              <p className="font-display text-2xl italic">Your chair is waiting.</p>
              <p className="mt-1 font-display text-xl text-[#E8E1D8]/70">See you soon.</p>
              <p className="mt-3 text-[0.7rem] tracking-[0.3em] text-[#C9A96A] uppercase">
                — Bhargav
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            <button
              onClick={() => downloadIcs(booking, serviceLine)}
              className="w-full border border-[#C9A96A]/50 px-6 py-4 text-[0.7rem] tracking-[0.3em] text-[#E8E1D8] uppercase transition-colors duration-300 hover:border-[#C9A96A] hover:bg-[#C9A96A]/10"
            >
              Add to calendar
            </button>
            <button
              onClick={onSave}
              className="w-full border border-[#E8E1D8]/20 px-6 py-4 text-[0.7rem] tracking-[0.3em] text-[#E8E1D8]/85 uppercase transition-colors duration-300 hover:border-[#E8E1D8]/50"
            >
              Save confirmation
            </button>
            <Link
              to="/"
              className="block py-2 text-center text-[0.7rem] tracking-[0.3em] text-[#E8E1D8]/50 uppercase transition-opacity hover:opacity-70"
            >
              Back to home
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <dt className="text-[0.6rem] tracking-[0.34em] text-[#E8E1D8]/45 uppercase">{label}</dt>
      <dd className="mt-1.5 font-display text-xl leading-snug">{value}</dd>
      {sub ? <dd className="mt-1 text-[0.8rem] text-[#E8E1D8]/55">{sub}</dd> : null}
    </div>
  );
}
