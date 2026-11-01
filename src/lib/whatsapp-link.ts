// Free WhatsApp messaging: links that open WhatsApp with the message already
// written (wa.me "click to chat"). Nothing is sent automatically and nothing
// costs anything; the person taps Send in their own WhatsApp.
import { fmtDate, fmtDuration, fmtPrice, fmtTime } from "./notify/messages";

/** wa.me link for a number (any format; Indian 10-digit numbers get +91). */
export function waLink(phone: string, text?: string) {
  let digits = phone.replace(/\D/g, "");
  if (digits.length === 10) digits = `91${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) digits = `91${digits.slice(1)}`;
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

export type WaBooking = {
  reference: string;
  name: string;
  date: string;
  time: number;
  services: string[];
  minutes: number;
  price: number;
  priceFrom?: boolean;
  manageUrl?: string;
};

/** What the guest sends to the salon after booking (their copy stays in the chat). */
export function guestToSalonText(b: WaBooking) {
  return [
    "Hi Hair by Bhargav! I've just booked an appointment:",
    "",
    `Booking ID: ${b.reference}`,
    `Name: ${b.name}`,
    `Date: ${fmtDate(b.date)}`,
    `Time: ${fmtTime(b.time)}`,
    `Service: ${b.services.join(", ") || "Appointment"}`,
    `Duration: ${fmtDuration(b.minutes)}`,
    `Total: ${fmtPrice(b.price, b.priceFrom)}`,
    ...(b.manageUrl ? ["", `Manage: ${b.manageUrl}`] : []),
  ].join("\n");
}
