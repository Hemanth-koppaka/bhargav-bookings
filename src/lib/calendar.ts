// Add-to-calendar, free and without any login or API: Google and Outlook
// "compose event" links, and a standard .ics file (Apple Calendar and every
// other calendar app). All times are Asia/Kolkata, computed explicitly; the
// browser's own time zone never reinterprets an appointment.

export type CalendarBooking = {
  reference: string;
  serviceName: string; // e.g. "Bhargav's Signature" or "Basic Haircut + Beard Trim"
  minutes: number; // booked duration (from the booking snapshot)
  price?: number | undefined;
  date: string; // YYYY-MM-DD (salon date)
  startMin: number; // minutes from midnight, salon time
  customerName: string;
  location: string; // salon address from settings
  manageUrl: string;
};

const IST_OFFSET_MIN = 330; // Asia/Kolkata is UTC+5:30 all year (no daylight saving)
const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/** The appointment's start and end as absolute instants. */
export function instants(b: CalendarBooking) {
  const [y, m, d] = b.date.split("-").map(Number) as [number, number, number];
  const startUtc = Date.UTC(y, m - 1, d, 0, 0, 0) + (b.startMin - IST_OFFSET_MIN) * 60_000;
  const minutes = Math.max(5, Math.round(b.minutes || 30));
  return { start: new Date(startUtc), end: new Date(startUtc + minutes * 60_000), minutes };
}

/** Wall-clock parts in Asia/Kolkata for an instant (independent of the browser zone). */
function ist(at: Date) {
  const t = new Date(at.getTime() + IST_OFFSET_MIN * 60_000);
  return {
    y: t.getUTCFullYear(),
    mo: t.getUTCMonth() + 1,
    d: t.getUTCDate(),
    h: t.getUTCHours(),
    mi: t.getUTCMinutes(),
  };
}

const utcStamp = (at: Date) =>
  `${at.getUTCFullYear()}${pad(at.getUTCMonth() + 1)}${pad(at.getUTCDate())}T${pad(at.getUTCHours())}${pad(at.getUTCMinutes())}${pad(at.getUTCSeconds())}Z`;
const istStamp = (at: Date) => {
  const p = ist(at);
  return `${p.y}${pad(p.mo)}${pad(p.d)}T${pad(p.h)}${pad(p.mi)}00`;
};
const istIso = (at: Date) => {
  const p = ist(at);
  return `${p.y}-${pad(p.mo)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}:00+05:30`;
};

export const durationText = (min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h && m ? `${h} hr ${m} min` : h ? `${h} hour${h > 1 ? "s" : ""}` : `${m} min`;
};

export const eventTitle = (b: CalendarBooking) => `Hair by Bhargav — ${b.serviceName}`;

export function eventDescription(b: CalendarBooking) {
  return [
    "Hair by Bhargav",
    "",
    `Service: ${b.serviceName}`,
    `Duration: ${durationText(instants(b).minutes)}`,
    `Booking ID: ${b.reference}`,
    "",
    `Customer: ${b.customerName}`,
    "",
    "Please arrive a few minutes before your appointment.",
    ...(b.manageUrl ? ["", "Manage appointment:", b.manageUrl] : []),
  ].join("\n");
}

/* ── links ───────────────────────────────────────────────────── */

/** Google Calendar "create event" link (UTC instants + Asia/Kolkata display zone). */
export function googleUrl(b: CalendarBooking) {
  const { start, end } = instants(b);
  const q = new URLSearchParams({
    action: "TEMPLATE",
    text: eventTitle(b),
    dates: `${utcStamp(start)}/${utcStamp(end)}`,
    ctz: "Asia/Kolkata",
    details: eventDescription(b),
    location: b.location,
  });
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

/** Outlook (outlook.com / Microsoft 365) "compose event" link with an explicit +05:30 offset. */
export function outlookUrl(b: CalendarBooking, kind: "live" | "office" = "live") {
  const { start, end } = instants(b);
  const q = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: eventTitle(b),
    startdt: istIso(start),
    enddt: istIso(end),
    body: eventDescription(b),
    location: b.location,
  });
  return `https://outlook.${kind === "office" ? "office" : "live"}.com/calendar/0/deeplink/compose?${q.toString()}`;
}

/* ── .ics ────────────────────────────────────────────────────── */

/** RFC 5545 text escaping. */
const esc = (s: string) =>
  s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

/** RFC 5545 line folding: lines longer than 75 octets continue on a line starting with a space. */
function fold(line: string) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let cur = "";
  let curBytes = 0;
  for (const ch of line) {
    const n = new TextEncoder().encode(ch).length;
    if (curBytes + n > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = "";
      curBytes = 0;
    }
    cur += ch;
    curBytes += n;
  }
  out.push(cur);
  return out.join("\r\n ");
}

/**
 * A complete .ics for the appointment. Uses TZID=Asia/Kolkata with a matching
 * VTIMEZONE, a stable UID (booking reference) so adding it again updates the
 * same event where the calendar supports it, and a 1-hour reminder (VALARM;
 * the guest's calendar app decides whether to honour it).
 */
export function buildIcs(b: CalendarBooking, opts: { cancelled?: boolean; now?: Date } = {}) {
  const { start, end } = instants(b);
  const now = opts.now ?? new Date();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Hair by Bhargav//Bookings//EN",
    "CALSCALE:GREGORIAN",
    `METHOD:${opts.cancelled ? "CANCEL" : "PUBLISH"}`,
    "BEGIN:VTIMEZONE",
    "TZID:Asia/Kolkata",
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:+0530",
    "TZOFFSETTO:+0530",
    "TZNAME:IST",
    "END:STANDARD",
    "END:VTIMEZONE",
    "BEGIN:VEVENT",
    `UID:${b.reference}@hairbybhargav`,
    `DTSTAMP:${utcStamp(now)}`,
    // later downloads (e.g. after a reschedule) carry a higher sequence
    `SEQUENCE:${Math.floor(now.getTime() / 60_000) % 2_000_000_000}`,
    `DTSTART;TZID=Asia/Kolkata:${istStamp(start)}`,
    `DTEND;TZID=Asia/Kolkata:${istStamp(end)}`,
    `SUMMARY:${esc(opts.cancelled ? `Cancelled: ${eventTitle(b)}` : eventTitle(b))}`,
    `DESCRIPTION:${esc(eventDescription(b))}`,
    `LOCATION:${esc(b.location)}`,
    ...(b.manageUrl ? [`URL:${b.manageUrl}`] : []),
    `STATUS:${opts.cancelled ? "CANCELLED" : "CONFIRMED"}`,
    ...(opts.cancelled
      ? []
      : [
          "BEGIN:VALARM",
          "ACTION:DISPLAY",
          `DESCRIPTION:${esc(eventTitle(b))}`,
          "TRIGGER:-PT1H",
          "END:VALARM",
        ]),
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

export const icsFileName = (b: CalendarBooking) => `hair-by-bhargav-${b.reference}.ics`;

/** Best first choice for this device (Apple devices → Apple Calendar, Android → Google…). */
export function preferredCalendar(ua: string): "apple" | "google" | "outlook" {
  if (/iPhone|iPad|iPod|Macintosh/.test(ua)) return "apple";
  if (/Android/.test(ua)) return "google";
  if (/Windows/.test(ua)) return "outlook";
  return "google";
}
