// Salon analytics from a list of bookings (pure, so it can be tested). Revenue
// counts completed visits only (the amount actually paid when recorded,
// otherwise the booked price), so reports match the till, not the diary.

export type ReportBooking = {
  reference: string;
  date: string; // YYYY-MM-DD
  time: number; // minutes from midnight
  minutes: number;
  status: string; // pending | upcoming | arrived | in-chair | completed | no-show | cancelled
  price: number;
  amountPaid: number | null;
  source: string;
  customerId: string | null;
  phone: string;
  services: { id: string; name: string; price: number }[];
};

export type Report = {
  from: string;
  to: string;
  kpis: {
    bookings: number; // excludes cancellations
    completed: number;
    revenue: number;
    avgTicket: number;
    cancelled: number;
    noShows: number;
    cancelRate: number; // of all bookings made for the period
    noShowRate: number; // of bookings that were due (completed + no-show)
    customers: number;
    returning: number;
    repeatRate: number; // returning ÷ customers
  };
  previous: { revenue: number; bookings: number } | null;
  daily: { date: string; revenue: number; bookings: number }[];
  /** weekday (0 = Monday) × hour → appointments starting in that hour. */
  heat: { weekday: number; hour: number; count: number }[];
  hours: [number, number]; // first/last hour that has any booking (for the grid)
  topServices: { name: string; count: number; revenue: number }[];
  sources: { source: string; count: number }[];
};

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const daysBetween = (a: string, b: string) =>
  Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);

const paid = (b: ReportBooking) => (b.status === "completed" ? (b.amountPaid ?? b.price) : 0);
const who = (b: ReportBooking) =>
  b.customerId ?? (b.phone.replace(/\D/g, "").slice(-10) || b.reference);

export function buildReport(
  inRange: ReportBooking[],
  opts: {
    from: string;
    to: string;
    /** Customers seen before `from` (ids or 10-digit phones), for "returning". */
    seenBefore: Set<string>;
    previous?: ReportBooking[] | undefined;
  },
): Report {
  const { from, to } = opts;
  const live = inRange.filter((b) => b.status !== "cancelled");
  const completed = inRange.filter((b) => b.status === "completed");
  const noShows = inRange.filter((b) => b.status === "no-show");
  const cancelled = inRange.filter((b) => b.status === "cancelled");
  const revenue = completed.reduce((n, b) => n + paid(b), 0);

  // customers: anyone with a non-cancelled booking in the period
  const people = new Set(live.map(who));
  const returning = [...people].filter((p) => opts.seenBefore.has(p)).length;

  const daily: Report["daily"] = [];
  const byDay = new Map<string, { revenue: number; bookings: number }>();
  for (const b of inRange) {
    const d = byDay.get(b.date) ?? { revenue: 0, bookings: 0 };
    d.revenue += paid(b);
    if (b.status !== "cancelled") d.bookings += 1;
    byDay.set(b.date, d);
  }
  for (let d = from, i = 0; d <= to && i < 400; d = addDays(d, 1), i++)
    daily.push({ date: d, ...(byDay.get(d) ?? { revenue: 0, bookings: 0 }) });

  const heatMap = new Map<string, number>();
  let minH = 24;
  let maxH = -1;
  for (const b of live.filter((x) => x.status !== "no-show")) {
    const wd = (new Date(`${b.date}T00:00:00Z`).getUTCDay() + 6) % 7;
    const h = Math.floor(b.time / 60);
    minH = Math.min(minH, h);
    maxH = Math.max(maxH, h);
    const k = `${wd}:${h}`;
    heatMap.set(k, (heatMap.get(k) ?? 0) + 1);
  }
  const heat = [...heatMap.entries()].map(([k, count]) => {
    const [weekday, hour] = k.split(":").map(Number) as [number, number];
    return { weekday, hour, count };
  });

  const svc = new Map<string, { name: string; count: number; revenue: number }>();
  for (const b of live.filter((x) => x.status !== "no-show")) {
    for (const s of b.services) {
      const e = svc.get(s.name) ?? { name: s.name, count: 0, revenue: 0 };
      e.count += 1;
      if (b.status === "completed") e.revenue += s.price;
      svc.set(s.name, e);
    }
  }
  const src = new Map<string, number>();
  for (const b of live) src.set(b.source, (src.get(b.source) ?? 0) + 1);

  const due = completed.length + noShows.length;
  const prev = opts.previous;
  return {
    from,
    to,
    kpis: {
      bookings: live.length,
      completed: completed.length,
      revenue,
      avgTicket: completed.length ? Math.round(revenue / completed.length) : 0,
      cancelled: cancelled.length,
      noShows: noShows.length,
      cancelRate: inRange.length ? cancelled.length / inRange.length : 0,
      noShowRate: due ? noShows.length / due : 0,
      customers: people.size,
      returning,
      repeatRate: people.size ? returning / people.size : 0,
    },
    previous: prev
      ? {
          revenue: prev.filter((b) => b.status === "completed").reduce((n, b) => n + paid(b), 0),
          bookings: prev.filter((b) => b.status !== "cancelled").length,
        }
      : null,
    daily,
    heat,
    hours: maxH < 0 ? [10, 19] : [Math.min(minH, 10), Math.max(maxH, 19)],
    topServices: [...svc.values()]
      .sort((a, b) => b.count - a.count || b.revenue - a.revenue)
      .slice(0, 8),
    sources: [...src.entries()]
      .map(([source, count]) => ({ source, count }))
      .sort((a, b) => b.count - a.count),
  };
}

/* ── CSV ─────────────────────────────────────────────────────── */

/**
 * One CSV cell. Quotes when needed and neutralises spreadsheet formulas
 * (a cell starting with = + - @ is prefixed with ') so an exported name like
 * "=HYPERLINK(...)" can't run when the file is opened in Excel/Sheets.
 */
export function csvCell(v: unknown): string {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export const toCsv = (rows: unknown[][]) =>
  "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
