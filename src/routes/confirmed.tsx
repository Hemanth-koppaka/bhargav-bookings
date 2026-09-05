import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect } from "react";
import { useBooking, servicesOf, type Booking } from "@/lib/booking-store";
import { BUSINESS, formatLongDate, minuteLabel, SLOT_MINUTES } from "@/lib/salon";
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
  const { ref } = Route.useSearch();
  const { bookings, hydrated, resetDraft } = useBooking();
  const booking = bookings.find((b) => b.reference === ref);

  useEffect(() => {
    if (hydrated && booking) resetDraft();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated, Boolean(booking)]);

  const services = booking ? servicesOf(booking) : [];
  const serviceLine = services.map((s) => s.name).join(" · ") || "Appointment";

  const onSave = useCallback(() => {
    if (booking) void saveConfirmationImage(booking, serviceLine);
  }, [booking, serviceLine]);

  if (!hydrated) {
    return (
      <div className="flex min-h-[100svh] items-center justify-center bg-background text-foreground">
        <p className="eyebrow animate-pulse">
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

  return (
    <div className="relative min-h-[100svh] overflow-hidden bg-background text-foreground">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-accent" />
      <div className="relative mx-auto flex min-h-[100svh] max-w-md flex-col justify-center px-6 py-10 sm:max-w-lg">
          <div className="fade-rise border border-accent/40 bg-card px-6 py-8 shadow-[0_24px_80px_-48px_var(--color-foreground)] sm:px-9 sm:py-10">
            <div className="text-center">
              <div className="eyebrow text-accent-foreground">
                Hair by Bhargav
              </div>
              <div className="mx-auto mt-5 flex h-14 w-14 items-center justify-center rounded-full border border-accent text-2xl text-accent-foreground" aria-hidden="true">
                ✓
              </div>
              <h1 className="mt-5 font-display text-3xl sm:text-4xl">
                Booking Confirmed
              </h1>
              <div className="mx-auto mt-4 h-px w-16 bg-accent" />
              <p className="mt-5 font-display text-2xl">{booking.customer.name}</p>
              <p className="eyebrow mt-1">
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

            <div className="mt-8 border-t border-hairline pt-6 text-center">
              <p className="font-display text-2xl italic">Your chair is waiting.</p>
              <p className="mt-1 font-display text-xl text-muted-foreground">See you soon.</p>
              <p className="eyebrow mt-3 text-accent-foreground">
                — Bhargav
              </p>
            </div>
          </div>

          <div className="mt-6 space-y-3">
            <button
              onClick={() => downloadIcs(booking, serviceLine)}
              className="label-caps w-full bg-foreground px-6 py-4 text-background transition-opacity hover:opacity-88"
            >
              Add to calendar
            </button>
            <button
              onClick={onSave}
              className="label-caps w-full border border-foreground/25 px-6 py-4 transition-colors hover:border-foreground"
            >
              Save confirmation
            </button>
            <Link
              to="/"
              className="label-caps block py-2 text-center text-muted-foreground transition-colors hover:text-foreground"
            >
              Back to home
            </Link>
          </div>
      </div>
    </div>
  );
}

function Row({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <dt className="eyebrow">{label}</dt>
      <dd className="mt-1.5 font-display text-xl leading-snug">{value}</dd>
      {sub ? <dd className="mt-1 text-[0.8rem] text-muted-foreground">{sub}</dd> : null}
    </div>
  );
}
