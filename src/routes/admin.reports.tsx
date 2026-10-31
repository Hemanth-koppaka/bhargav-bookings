import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Download } from "lucide-react";
import { AdminShell, Panel, TinyButton } from "@/components/admin";
import { LoadState, salonToday, useAdminData } from "@/components/admin-ops";
import { useAdmin } from "@/lib/admin-store";
import { adminAnalytics, adminExportCsv } from "@/lib/admin-data.functions";
import type { Report } from "@/lib/analytics";
import { fromISO, inr, toISO } from "@/lib/salon";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/reports")({
  head: () => ({
    meta: [
      { title: "Reports — Hair by Bhargav" },
      {
        name: "description",
        content: "Revenue, busiest hours, top services and customer return rate.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ReportsScreen,
});

const shift = (iso: string, n: number) => {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
};
type Preset = "7" | "30" | "month" | "90";
const rangeFor = (p: Preset): [string, string] => {
  const t = salonToday();
  if (p === "month") return [`${t.slice(0, 8)}01`, t];
  return [shift(t, -(Number(p) - 1)), t];
};

const pct = (n: number) => `${Math.round(n * 100)}%`;
const dayLabel = (
  iso: string,
  o: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" },
) => fromISO(iso).toLocaleDateString("en-GB", o);
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const hourLabel = (h: number) => `${h % 12 === 0 ? 12 : h % 12}${h >= 12 ? "pm" : "am"}`;

function ReportsScreen() {
  const { pin } = useAdmin();
  const [preset, setPreset] = useState<Preset | "custom">("30");
  const [custom, setCustom] = useState<[string, string]>(rangeFor("30"));
  const [from, to] = preset === "custom" ? custom : rangeFor(preset);
  const { data, loading, error, reload } = useAdminData(
    (p) => adminAnalytics({ data: { pin: p, from, to } }),
    [from, to],
  );

  return (
    <AdminShell
      title="Reports"
      subtitle="Revenue counts completed visits (amount paid when recorded)."
      right={<Exports from={from} to={to} />}
    >
      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ["7", "Last 7 days"],
            ["30", "Last 30 days"],
            ["month", "This month"],
            ["90", "Last 90 days"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            onClick={() => setPreset(k)}
            className={cn(
              "press rounded-full border px-3 py-1 text-[0.8rem]",
              preset === k
                ? "border-foreground bg-foreground text-background"
                : "border-foreground/15",
            )}
          >
            {label}
          </button>
        ))}
        <span className="flex items-center gap-1.5 text-[0.8rem]">
          <input
            type="date"
            value={from}
            max={to}
            onChange={(e) => {
              setCustom([e.target.value, to]);
              setPreset("custom");
            }}
            className="rounded-md border border-foreground/15 bg-background px-2 py-1"
            aria-label="From"
          />
          –
          <input
            type="date"
            value={to}
            min={from}
            onChange={(e) => {
              setCustom([from, e.target.value]);
              setPreset("custom");
            }}
            className="rounded-md border border-foreground/15 bg-background px-2 py-1"
            aria-label="To"
          />
        </span>
      </div>

      <div className="mt-4">
        <LoadState loading={loading && !data} error={error} onRetry={reload} />
      </div>
      {data ? (
        <div className={cn("space-y-4 transition-opacity", loading && "opacity-60")}>
          <Kpis r={data} />
          <Panel>
            <ChartTitle
              title="Revenue by day"
              sub={`${dayLabel(data.from, { day: "numeric", month: "long" })} – ${dayLabel(data.to, { day: "numeric", month: "long" })}`}
            />
            <RevenueBars days={data.daily} />
          </Panel>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <Panel>
              <ChartTitle
                title="Busiest hours"
                sub="Appointments by start time (cancellations and no-shows excluded)."
              />
              <Heatmap r={data} />
            </Panel>
            <Panel>
              <ChartTitle title="Top services" sub="By number booked." />
              <TopServices r={data} />
              {data.sources.length ? (
                <>
                  <div className="mt-5 text-[0.62rem] uppercase tracking-[0.2em] text-muted-foreground">
                    How guests booked
                  </div>
                  <ul className="mt-2 space-y-1 text-[0.85rem]">
                    {data.sources.map((s) => (
                      <li key={s.source} className="flex justify-between gap-3">
                        <span className="capitalize">{s.source}</span>
                        <span className="tabular-nums text-muted-foreground">{s.count}</span>
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </Panel>
          </div>
        </div>
      ) : null}
    </AdminShell>
  );
}

function ChartTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-4">
      <h2 className="font-display text-[1.35rem] leading-tight">{title}</h2>
      {sub ? <p className="text-[0.78rem] text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

/* ── KPI tiles ─────────────────────────────────────────────── */

function Tile({
  label,
  value,
  hint,
  children,
}: {
  label: string;
  value: string;
  hint?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-md border border-hairline bg-card px-4 py-3.5">
      <div className="text-[0.62rem] uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
      <div className="mt-1.5 font-display text-[1.9rem] leading-none tabular-nums">{value}</div>
      {hint ? <div className="mt-1 text-[0.74rem] text-muted-foreground">{hint}</div> : null}
      {children}
    </div>
  );
}

function Change({ now, before }: { now: number; before: number }) {
  if (!before) return <span>no earlier data</span>;
  const d = (now - before) / before;
  return (
    <span>
      <span className="text-foreground">
        {d >= 0 ? "▲" : "▼"} {Math.abs(Math.round(d * 100))}%
      </span>{" "}
      vs previous period
    </span>
  );
}

function Kpis({ r }: { r: Report }) {
  const k = r.kpis;
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      <Tile
        label="Revenue"
        value={inr(k.revenue)}
        hint={r.previous ? <Change now={k.revenue} before={r.previous.revenue} /> : undefined}
      />
      <Tile
        label="Completed visits"
        value={String(k.completed)}
        hint={`Average ${inr(k.avgTicket)} per visit`}
      />
      <Tile
        label="Bookings"
        value={String(k.bookings)}
        hint={r.previous ? <Change now={k.bookings} before={r.previous.bookings} /> : undefined}
      />
      <Tile
        label="Returning customers"
        value={pct(k.repeatRate)}
        hint={`${k.returning} of ${k.customers} had visited before`}
      />
      <Tile
        label="No-show rate"
        value={pct(k.noShowRate)}
        hint={`${k.noShows} no-show${k.noShows === 1 ? "" : "s"}`}
      />
      <Tile label="Cancellation rate" value={pct(k.cancelRate)} hint={`${k.cancelled} cancelled`} />
    </div>
  );
}

/* ── revenue bars (single series, one hue, baseline-anchored) ── */

function RevenueBars({ days }: { days: Report["daily"] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...days.map((d) => d.revenue));
  const nice = useMemo(() => {
    const step = 10 ** Math.floor(Math.log10(max));
    return Math.ceil(max / step) * step;
  }, [max]);
  const total = days.reduce((n, d) => n + d.revenue, 0);
  if (!total)
    return (
      <p className="py-10 text-center text-[0.85rem] text-muted-foreground">
        No completed visits in this period yet.
      </p>
    );
  const labelEvery = Math.max(1, Math.ceil(days.length / 10));
  const h = hover != null ? days[hover] : null;
  return (
    <div>
      <div
        className="relative flex h-48 items-end gap-[2px] border-b border-hairline pr-14"
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label={`Revenue by day, total ${inr(total)}`}
      >
        {/* recessive gridlines */}
        {[0.5, 1].map((f) => (
          <div
            key={f}
            className="pointer-events-none absolute inset-x-0 border-t border-dashed border-foreground/[0.07]"
            style={{ bottom: `${f * 100}%` }}
          >
            <span className="absolute -top-2 right-0 w-14 pl-2 text-[0.62rem] tabular-nums text-muted-foreground">
              {inr(nice * f)}
            </span>
          </div>
        ))}
        {days.map((d, i) => (
          <div
            key={d.date}
            className="relative flex h-full min-w-0 flex-1 items-end"
            onMouseEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            tabIndex={0}
            aria-label={`${dayLabel(d.date)}: ${inr(d.revenue)}, ${d.bookings} bookings`}
          >
            <div
              className={cn(
                "w-full rounded-t-[4px] transition-colors",
                d.revenue ? (hover === i ? "bg-foreground" : "bg-bronze") : "",
              )}
              style={{ height: `${(d.revenue / nice) * 100}%`, minHeight: d.revenue ? 2 : 0 }}
            />
          </div>
        ))}
        {h ? (
          <div
            className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full rounded-md border border-hairline bg-background px-2.5 py-1.5 text-[0.75rem] shadow-sm"
            style={{ left: `calc(${(hover! + 0.5) / days.length} * (100% - 3.5rem))` }}
          >
            <div className="font-medium">
              {dayLabel(h.date, { weekday: "short", day: "numeric", month: "short" })}
            </div>
            <div className="tabular-nums">{inr(h.revenue)}</div>
            <div className="text-muted-foreground">
              {h.bookings} booking{h.bookings === 1 ? "" : "s"}
            </div>
          </div>
        ) : null}
      </div>
      <div className="mt-1 flex h-4 gap-[2px] pr-14">
        {days.map((d, i) => (
          <span
            key={d.date}
            className="relative min-w-0 flex-1 text-[0.6rem] text-muted-foreground"
          >
            {i % labelEvery === 0 ? (
              // on phones every other label, so they never collide
              <span
                className={cn(
                  "absolute left-1/2 -translate-x-1/2 whitespace-nowrap",
                  (i / labelEvery) % 2 === 1 && "max-sm:hidden",
                )}
              >
                {dayLabel(d.date, {
                  day: "numeric",
                  ...(days.length > 31 ? { month: "short" as const } : {}),
                })}
              </span>
            ) : null}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── busiest hours (sequential: one hue, light → dark) ───────── */

function Heatmap({ r }: { r: Report }) {
  const [lo, hi] = r.hours;
  const hours = Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
  const map = new Map(r.heat.map((c) => [`${c.weekday}:${c.hour}`, c.count]));
  const max = Math.max(1, ...r.heat.map((c) => c.count));
  const [hover, setHover] = useState<string | null>(null);
  if (!r.heat.length)
    return (
      <p className="py-10 text-center text-[0.85rem] text-muted-foreground">
        No appointments in this period yet.
      </p>
    );
  const level = (n: number) => (n ? 0.14 + 0.86 * (n / max) : 0);
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-[2px] text-[0.7rem]">
        <thead>
          <tr>
            <th className="w-10" />
            {hours.map((h) => (
              <th key={h} className="font-normal text-muted-foreground">
                {hourLabel(h)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {WEEKDAYS.map((wd, w) => (
            <tr key={wd}>
              <th className="pr-1 text-left font-normal text-muted-foreground">{wd}</th>
              {hours.map((h) => {
                const n = map.get(`${w}:${h}`) ?? 0;
                const k = `${w}:${h}`;
                return (
                  <td
                    key={h}
                    onMouseEnter={() => setHover(k)}
                    onMouseLeave={() => setHover(null)}
                    title={`${wd} ${hourLabel(h)}: ${n} appointment${n === 1 ? "" : "s"}`}
                    className={cn(
                      "relative h-7 min-w-7 rounded-[4px] bg-foreground/[0.04]",
                      hover === k && "outline outline-1 outline-foreground",
                    )}
                  >
                    <span
                      className="absolute inset-0 rounded-[4px] bg-bronze"
                      style={{ opacity: level(n) }}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex items-center justify-end gap-2 text-[0.68rem] text-muted-foreground">
        Fewer
        {[0.14, 0.4, 0.7, 1].map((o) => (
          <span key={o} className="h-3 w-5 rounded-[3px] bg-bronze" style={{ opacity: o }} />
        ))}
        More
        {hover ? (
          <span className="ml-3 text-foreground">
            {WEEKDAYS[Number(hover.split(":")[0])]} {hourLabel(Number(hover.split(":")[1]))}:{" "}
            {map.get(hover) ?? 0}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/* ── top services (single series horizontal bars, labelled) ─── */

function TopServices({ r }: { r: Report }) {
  const max = Math.max(1, ...r.topServices.map((s) => s.count));
  if (!r.topServices.length)
    return (
      <p className="py-6 text-center text-[0.85rem] text-muted-foreground">
        No services booked in this period yet.
      </p>
    );
  return (
    <ul className="space-y-2.5">
      {r.topServices.map((s) => (
        <li key={s.name} title={`${s.name}: ${s.count} booked, ${inr(s.revenue)} completed`}>
          <div className="flex items-baseline justify-between gap-3 text-[0.85rem]">
            <span className="truncate">{s.name}</span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {s.count} · {inr(s.revenue)}
            </span>
          </div>
          <div className="mt-1 h-2 rounded-full bg-foreground/[0.05]">
            <div
              className="h-2 rounded-full bg-bronze"
              style={{ width: `${(s.count / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

/* ── CSV exports ───────────────────────────────────────────── */

function Exports({ from, to }: { from: string; to: string }) {
  const { pin } = useAdmin();
  const [busy, setBusy] = useState<string | null>(null);
  const run = async (key: string, kind: "bookings" | "customers", range: boolean) => {
    setBusy(key);
    try {
      const r = await adminExportCsv({ data: { pin, kind, ...(range ? { from, to } : {}) } });
      if (!r.csv) return void toast.error("Nothing to export yet.");
      const url = URL.createObjectURL(new Blob([r.csv], { type: "text/csv;charset=utf-8" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = r.filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      toast.success(`Exported ${r.rows} ${kind}.`);
    } catch {
      toast.error("Couldn't export. Please try again.");
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="flex flex-wrap gap-2">
      <TinyButton disabled={busy !== null} onClick={() => void run("range", "bookings", true)}>
        <Download className="h-3.5 w-3.5" />{" "}
        {busy === "range" ? "Exporting…" : "Bookings (this range)"}
      </TinyButton>
      <TinyButton disabled={busy !== null} onClick={() => void run("all", "bookings", false)}>
        <Download className="h-3.5 w-3.5" /> {busy === "all" ? "Exporting…" : "All bookings"}
      </TinyButton>
      <TinyButton disabled={busy !== null} onClick={() => void run("cust", "customers", false)}>
        <Download className="h-3.5 w-3.5" /> {busy === "cust" ? "Exporting…" : "Customers"}
      </TinyButton>
    </div>
  );
}
