// Booking emails: subject, plain text and a simple branded HTML version of the
// same message the WhatsApp/SMS channels send (from the booking snapshot).
import {
  EVENT_LABEL,
  fmtDate,
  fmtDuration,
  fmtPrice,
  fmtTime,
  messageText,
  type BookingFacts,
  type NotifyEvent,
  type Recipient,
} from "./messages";

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function emailSubject(
  recipient: Recipient | "test",
  event: NotifyEvent,
  f: BookingFacts,
): string {
  const when = `${fmtDate(f.date)}, ${fmtTime(f.time)}`;
  if (recipient === "admin") {
    if (event === "BOOKING_RESCHEDULED")
      return `Moved: ${f.customerName} → ${when} (${f.reference})`;
    if (event === "BOOKING_CANCELLED")
      return `Cancelled: ${f.customerName}, ${when} (${f.reference})`;
    return `New appointment: ${f.customerName}, ${when} (${f.reference})`;
  }
  switch (event) {
    case "BOOKING_RESCHEDULED":
      return `Your appointment has moved to ${when}`;
    case "BOOKING_CANCELLED":
      return `Your appointment on ${fmtDate(f.date)} is cancelled`;
    case "BOOKING_REMINDER_24H":
      return `See you tomorrow at ${fmtTime(f.time)} — Hair by Bhargav`;
    case "BOOKING_REMINDER_2H":
      return `See you at ${fmtTime(f.time)} today — Hair by Bhargav`;
    default:
      return `Booking confirmed: ${when} — Hair by Bhargav`;
  }
}

function heading(recipient: Recipient | "test", event: NotifyEvent): [string, string] {
  if (recipient === "admin") return ["Salon alert", EVENT_LABEL[event]];
  switch (event) {
    case "BOOKING_RESCHEDULED":
      return ["Rescheduled", "Your new time."];
    case "BOOKING_CANCELLED":
      return ["Cancelled", "Your appointment is cancelled."];
    case "BOOKING_REMINDER_24H":
    case "BOOKING_REMINDER_2H":
      return ["Reminder", "We'll see you soon."];
    default:
      return ["Confirmed", "Your chair is reserved."];
  }
}

export function emailContent(recipient: Recipient | "test", event: NotifyEvent, f: BookingFacts) {
  const text = messageText(recipient, event, f);
  const [eyebrow, title] = heading(recipient, event);
  const rows: [string, string][] = [
    ["Booking ID", f.reference],
    ...(recipient === "admin"
      ? ([["Customer", `${f.customerName} · ${f.customerPhone}`]] as [string, string][])
      : []),
    ["Date", fmtDate(f.date)],
    ["Time", fmtTime(f.time)],
    ["Service", f.services.join(", ") || "Appointment"],
    ...(event === "BOOKING_CANCELLED"
      ? []
      : ([
          ["Duration", fmtDuration(f.minutes)],
          ["Total", fmtPrice(f.price, f.priceFrom)],
        ] as [string, string][])),
    ...(recipient !== "admin" && event !== "BOOKING_CANCELLED"
      ? ([["Location", f.location]] as [string, string][])
      : []),
  ];
  const greet =
    recipient === "admin"
      ? ""
      : event === "BOOKING_CANCELLED"
        ? `Hi ${esc(f.customerName)}, your appointment has been cancelled. We hope to see you soon.`
        : event === "BOOKING_RESCHEDULED"
          ? `Hi ${esc(f.customerName)}, your appointment has been rescheduled.`
          : event.startsWith("BOOKING_REMINDER")
            ? `Hi ${esc(f.customerName)}, a reminder of your appointment ${event === "BOOKING_REMINDER_2H" ? "today" : "tomorrow"}.`
            : `Hi ${esc(f.customerName)}, your appointment is confirmed. We look forward to seeing you.`;
  const button =
    recipient !== "admin" && f.manageUrl && event !== "BOOKING_CANCELLED"
      ? `<tr><td style="padding:28px 0 0"><a href="${esc(f.manageUrl)}" style="display:inline-block;background:#1a1612;color:#f7f3ec;text-decoration:none;font-size:12px;letter-spacing:2px;text-transform:uppercase;padding:14px 24px;border-radius:2px">Manage your booking</a></td></tr>`
      : "";
  const html = `<!doctype html><html><body style="margin:0;background:#f7f3ec;font-family:Georgia,'Times New Roman',serif;color:#1a1612">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f7f3ec;padding:32px 16px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#fffdf9;border:1px solid #e8e0d4;padding:36px 32px">
<tr><td style="font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#8a6a4a;font-family:Arial,sans-serif">Hair by Bhargav · ${esc(eyebrow)}</td></tr>
<tr><td style="padding:10px 0 0;font-size:30px;line-height:1.15">${esc(title)}</td></tr>
${greet ? `<tr><td style="padding:14px 0 0;font-size:15px;line-height:1.6;color:#5b5047;font-family:Arial,sans-serif">${greet}</td></tr>` : ""}
<tr><td style="padding:24px 0 0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e8e0d4">
${rows.map(([k, v]) => `<tr><td style="padding:11px 0;border-bottom:1px solid #e8e0d4;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#8a7f74;font-family:Arial,sans-serif;width:38%">${esc(k)}</td><td style="padding:11px 0;border-bottom:1px solid #e8e0d4;font-size:15px;font-family:Arial,sans-serif">${esc(v)}</td></tr>`).join("")}
</table></td></tr>
${button}
<tr><td style="padding:28px 0 0;font-size:12px;line-height:1.6;color:#8a7f74;font-family:Arial,sans-serif">Booking message from Hair by Bhargav, ${esc(f.location)}. Not a promotion.</td></tr>
</table></td></tr></table></body></html>`;
  return { subject: emailSubject(recipient, event, f), text, html };
}

export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());
