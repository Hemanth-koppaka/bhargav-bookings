// Booking notifications: events, recipients and the words that go out.
// Pure (no I/O) so it can be tested and previewed in the console. Every value
// comes from the booking's stored snapshot (price, services, duration, date and
// time at the moment of the event), never from today's menu, so an old booking
// always shows the price it was booked at.

export const EVENTS = [
  "BOOKING_CREATED",
  "BOOKING_CONFIRMED",
  "BOOKING_RESCHEDULED",
  "BOOKING_CANCELLED",
  "BOOKING_REMINDER_24H",
  "BOOKING_REMINDER_2H",
  "BOOKING_COMPLETED",
  "NO_SHOW",
] as const;
export type NotifyEvent = (typeof EVENTS)[number];
export type Channel = "whatsapp" | "sms" | "email";
export type Recipient = "customer" | "admin";
export type LogStatus =
  "scheduled" | "queued" | "sending" | "sent" | "delivered" | "failed" | "cancelled" | "skipped";

/** Which (recipient, event) pairs this release actually sends. */
export const SENDS: Record<Recipient, NotifyEvent[]> = {
  customer: [
    "BOOKING_CONFIRMED",
    "BOOKING_RESCHEDULED",
    "BOOKING_CANCELLED",
    "BOOKING_REMINDER_24H",
    "BOOKING_REMINDER_2H",
  ],
  admin: ["BOOKING_CONFIRMED", "BOOKING_RESCHEDULED", "BOOKING_CANCELLED"],
};

/** Template slot in provider settings, e.g. "customer.BOOKING_CONFIRMED". */
export const templateKey = (r: Recipient | "test", e: NotifyEvent) =>
  `${r === "test" ? "customer" : r}.${e}`;

export const EVENT_LABEL: Record<NotifyEvent, string> = {
  BOOKING_CREATED: "Booking created",
  BOOKING_CONFIRMED: "Confirmation",
  BOOKING_RESCHEDULED: "Rescheduled",
  BOOKING_CANCELLED: "Cancelled",
  BOOKING_REMINDER_24H: "Reminder (24 h)",
  BOOKING_REMINDER_2H: "Reminder (2 h)",
  BOOKING_COMPLETED: "Completed",
  NO_SHOW: "No-show",
};

/** Everything a message may need, taken from the booking row at event time. */
export type BookingFacts = {
  reference: string;
  customerName: string;
  customerPhone: string; // E.164
  /** Optional; booking emails go here when given. */
  customerEmail?: string | undefined;
  date: string; // YYYY-MM-DD
  time: number; // minutes from midnight
  services: string[];
  minutes: number;
  price: number;
  priceFrom: boolean;
  location: string;
  manageUrl: string;
  previous?: { date: string; time: number } | undefined;
};

/* ── formatting ──────────────────────────────────────────────── */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const fmtDate = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[(m ?? 1) - 1]} ${y}`;
};
export const fmtTime = (min: number) => {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};
export const fmtDuration = (min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h && m ? `${h} hr ${m} min` : h ? `${h} hour${h > 1 ? "s" : ""}` : `${m} min`;
};
export const fmtPrice = (n: number, from = false) =>
  `₹${n.toLocaleString("en-IN")}${from ? "+" : ""}`;

/**
 * Indian numbers to E.164 (+91XXXXXXXXXX). Numbers that already carry a
 * country code (+…) are kept. Returns "" when it can't be a valid number.
 */
export function toE164(raw: string, defaultCountry = "91"): string {
  const s = raw.trim();
  const digits = s.replace(/\D/g, "");
  if (s.startsWith("+")) return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : "";
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `+${defaultCountry}${digits}`;
  if (digits.length === 12 && digits.startsWith(defaultCountry)) return `+${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `+${defaultCountry}${digits.slice(1)}`;
  return "";
}
export const isE164 = (p: string) => /^\+[1-9]\d{7,14}$/.test(p);

/* ── variables (provider templates fill these in order) ──────── */

/**
 * Ordered values for each template. WhatsApp templates use them as {{1}}, {{2}}…
 * and SMS (DLT) templates as ##var1##, ##var2##…, so templates registered with
 * the provider must use the same order.
 */
export function templateVars(
  recipient: Recipient | "test",
  event: NotifyEvent,
  f: BookingFacts,
): string[] {
  const svc = f.services.join(", ") || "Appointment";
  const when = [fmtDate(f.date), fmtTime(f.time)];
  if (recipient === "admin") {
    switch (event) {
      case "BOOKING_RESCHEDULED":
        return [
          f.customerName,
          f.customerPhone,
          f.previous ? `${fmtDate(f.previous.date)} ${fmtTime(f.previous.time)}` : "",
          ...when,
          svc,
          f.reference,
        ];
      case "BOOKING_CANCELLED":
        return [f.customerName, f.customerPhone, ...when, svc, f.reference];
      default:
        return [
          f.customerName,
          f.customerPhone,
          ...when,
          svc,
          fmtDuration(f.minutes),
          fmtPrice(f.price, f.priceFrom),
          f.reference,
        ];
    }
  }
  switch (event) {
    case "BOOKING_RESCHEDULED":
      return [f.customerName, ...when, svc, f.reference, f.manageUrl];
    case "BOOKING_CANCELLED":
      return [f.customerName, f.reference, ...when, svc];
    case "BOOKING_REMINDER_24H":
    case "BOOKING_REMINDER_2H":
      return [f.customerName, ...when, svc, f.location, f.reference, f.manageUrl];
    default:
      return [
        f.customerName,
        f.reference,
        ...when,
        svc,
        fmtDuration(f.minutes),
        fmtPrice(f.price, f.priceFrom),
        f.location,
        f.manageUrl,
      ];
  }
}

/** Names of the variables above, in order (shown in Admin to set up templates). */
export function templateVarNames(recipient: Recipient, event: NotifyEvent): string[] {
  if (recipient === "admin") {
    if (event === "BOOKING_RESCHEDULED")
      return [
        "customer_name",
        "customer_phone",
        "previous_slot",
        "date",
        "time",
        "services",
        "booking_id",
      ];
    if (event === "BOOKING_CANCELLED")
      return ["customer_name", "customer_phone", "date", "time", "services", "booking_id"];
    return [
      "customer_name",
      "customer_phone",
      "date",
      "time",
      "services",
      "duration",
      "total",
      "booking_id",
    ];
  }
  if (event === "BOOKING_RESCHEDULED")
    return ["customer_name", "date", "time", "services", "booking_id", "manage_url"];
  if (event === "BOOKING_CANCELLED")
    return ["customer_name", "booking_id", "date", "time", "services"];
  if (event === "BOOKING_REMINDER_24H" || event === "BOOKING_REMINDER_2H")
    return ["customer_name", "date", "time", "services", "location", "booking_id", "manage_url"];
  return [
    "customer_name",
    "booking_id",
    "date",
    "time",
    "services",
    "duration",
    "total",
    "location",
    "manage_url",
  ];
}

/* ── full text (previews, logs, and templates to register) ───── */

export function messageText(
  recipient: Recipient | "test",
  event: NotifyEvent,
  f: BookingFacts,
): string {
  const svc = f.services.join(", ") || "Appointment";
  if (recipient === "admin") {
    if (event === "BOOKING_RESCHEDULED")
      return [
        "APPOINTMENT MOVED",
        `Customer: ${f.customerName}`,
        `Phone: ${f.customerPhone}`,
        f.previous ? `Was: ${fmtDate(f.previous.date)}, ${fmtTime(f.previous.time)}` : "",
        `Now: ${fmtDate(f.date)}, ${fmtTime(f.time)}`,
        `Service: ${svc}`,
        `Booking ID: ${f.reference}`,
      ]
        .filter(Boolean)
        .join("\n");
    if (event === "BOOKING_CANCELLED")
      return [
        "APPOINTMENT CANCELLED",
        `Customer: ${f.customerName}`,
        `Phone: ${f.customerPhone}`,
        `Date: ${fmtDate(f.date)}`,
        `Time: ${fmtTime(f.time)}`,
        `Service: ${svc}`,
        `Booking ID: ${f.reference}`,
      ].join("\n");
    return [
      "NEW APPOINTMENT",
      `Customer: ${f.customerName}`,
      `Phone: ${f.customerPhone}`,
      `Date: ${fmtDate(f.date)}`,
      `Time: ${fmtTime(f.time)}`,
      `Service: ${svc}`,
      `Duration: ${fmtDuration(f.minutes)}`,
      `Total: ${fmtPrice(f.price, f.priceFrom)}`,
      `Booking ID: ${f.reference}`,
      "Status: CONFIRMED",
    ].join("\n");
  }
  switch (event) {
    case "BOOKING_RESCHEDULED":
      return [
        "HAIR BY BHARGAV",
        `Hi ${f.customerName}, your appointment has been rescheduled.`,
        `New date: ${fmtDate(f.date)}`,
        `New time: ${fmtTime(f.time)}`,
        `Service: ${svc}`,
        `Booking ID: ${f.reference}`,
        f.manageUrl ? `Manage your booking: ${f.manageUrl}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    case "BOOKING_CANCELLED":
      return [
        "HAIR BY BHARGAV",
        `Hi ${f.customerName}, your appointment ${f.reference} on ${fmtDate(f.date)} at ${fmtTime(f.time)} (${svc}) has been cancelled.`,
        "We hope to see you soon.",
      ].join("\n");
    case "BOOKING_REMINDER_24H":
    case "BOOKING_REMINDER_2H":
      return [
        "HAIR BY BHARGAV",
        `Hi ${f.customerName}, a reminder of your appointment ${event === "BOOKING_REMINDER_2H" ? "today" : "tomorrow"}.`,
        `Date: ${fmtDate(f.date)}`,
        `Time: ${fmtTime(f.time)}`,
        `Service: ${svc}`,
        `Location: ${f.location}`,
        `Booking ID: ${f.reference}`,
        f.manageUrl ? `Manage your booking: ${f.manageUrl}` : "",
      ]
        .filter(Boolean)
        .join("\n");
    default:
      return [
        "HAIR BY BHARGAV",
        "Your appointment is confirmed.",
        `Name: ${f.customerName}`,
        `Booking ID: ${f.reference}`,
        `Date: ${fmtDate(f.date)}`,
        `Time: ${fmtTime(f.time)}`,
        `Service: ${svc}`,
        `Duration: ${fmtDuration(f.minutes)}`,
        `Total: ${fmtPrice(f.price, f.priceFrom)}`,
        `Location: ${f.location}`,
        "We look forward to seeing you.",
        f.manageUrl ? `Manage your booking: ${f.manageUrl}` : "",
      ]
        .filter(Boolean)
        .join("\n");
  }
}

/* ── idempotency ─────────────────────────────────────────────── */

/**
 * One key per message that may ever be sent. Events that can happen more than
 * once for the same booking (a reschedule, a reminder for a moved appointment)
 * include the appointment time they are about, so each occurrence is unique
 * but a repeated trigger for the same occurrence is not.
 */
export function idempotencyKey(p: {
  reference: string;
  event: NotifyEvent;
  recipient: Recipient | "test";
  phone: string;
  channel: Channel;
  occurrence?: string | undefined;
}) {
  return [
    p.reference,
    p.occurrence ? `${p.event}@${p.occurrence}` : p.event,
    p.recipient,
    p.phone,
    p.channel,
  ].join("|");
}

export const slotStamp = (date: string, time: number) =>
  `${date}T${String(Math.floor(time / 60)).padStart(2, "0")}:${String(time % 60).padStart(2, "0")}`;

/** When a reminder is due, as an absolute instant (salon time is Asia/Kolkata, UTC+5:30). */
export function reminderAt(date: string, time: number, hoursBefore: number): Date {
  const startUtc = Date.parse(`${date}T00:00:00Z`) + (time - 330) * 60_000;
  return new Date(startUtc - hoursBefore * 3_600_000);
}
