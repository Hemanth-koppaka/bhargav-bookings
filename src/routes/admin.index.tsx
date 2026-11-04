import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  Ban,
  CalendarCheck2,
  CalendarX2,
  ChevronRight,
  Info,
  IndianRupee,
  Plus,
  Receipt,
  TrendingUp,
  UserRoundPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import { AdminShell, Panel, StatusPill, TinyButton } from "@/components/admin";
import { AreaTrend, DASH, Donut, StackedBars } from "@/components/dash-charts";
import { PhoneAlertsNudge } from "@/components/phone-alerts";
import {
  BlockTimeDialog,
  BookingDrawer,
  CloseDayDialog,
  LoadState,
  NewBookingDialog,
  dateLabel,
  useAdminData,
} from "@/components/admin-ops";
import { useAdmin, STATUS_LABEL, type ApptStatus } from "@/lib/admin-store";
import { adminDashboard, type AdminBooking } from "@/lib/admin-data.functions";
import { adminUpsertBooking } from "@/lib/salon.functions";
import { formatDuration, inr, minuteLabel } from "@/lib/salon";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "Today at the salon — Hair by Bhargav" },
      { name: "description", content: "Live view of today's chair, arrivals and takings." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Today at the salon — Hair by Bhargav" },
      { property: "og:description", content: "Live view of today's appointments." },
    ],
  }),
  component: TodayScreen,
});

const NEXT: Partial<Record<ApptStatus, { to: ApptStatus; label: string }>> = {
  pending: { to: "upcoming", label: "Confirm" },
  upcoming: { to: "arrived", label: "Check in" },
  arrived: { to: "in-chair", label: "Start" },
  "in-chair": { to: "completed", label: "Complete" },
};

/** One colour per appointment state (the same as the diary chart). */
const STATUS_COLOR: Record<ApptStatus, string> = {
  pending: DASH.yellow,
  upcoming: DASH.blue,
  arrived: DASH.violet,
  "in-chair": DASH.orange,
  completed: DASH.aqua,
  "no-show": DASH.yellow,
  cancelled: DASH.red,
};

const isActive = (b: AdminBooking) => b.status !== "cancelled" && b.status !== "no-show";

type Row =
  | { kind: "booking"; start: number; end: number; b: AdminBooking }
  | { kind: "free" | "break" | "block"; start: number; end: number; label: string };

/** The day as a sequence: appointments, breaks, blocks and the free gaps between them. */
function timeline(
  open: number,
  close: number,
  bookings: AdminBooking[],
  breaks: { start: number; end: number; label?: string }[],
  blocks: { start: number; end: number; label?: string }[],
  interval: number,
): Row[] {
  const taken: Row[] = [
    ...bookings.filter(isActive).map((b) => ({ kind: "booking" as const, start: b.time, end: b.end, b })),
    ...breaks.map((r) => ({ kind: "break" as const, start: r.start, end: r.end, label: r.label || "Break" })),
    ...blocks.map((r) => ({ kind: "block" as const, start: r.start, end: r.end, label: r.label || "Blocked" })),
  ].sort((a, b) => a.start - b.start);
  const out: Row[] = [];
  let cursor = open;
  for (const r of taken) {
    if (r.start - cursor >= interval) out.push({ kind: "free", start: cursor, end: r.start, label: "Available" });
    out.push(r);
    cursor = Math.max(cursor, r.end);
  }
  if (close - cursor >= interval) out.push({ kind: "free", start: cursor, end: close, label: "Available" });
  return out;
}

function greeting(minute: number) {
  return minute < 12 * 60 ? "Good morning" : minute < 17 * 60 ? "Good afternoon" : "Good evening";
}

function TodayScreen() {
  const { pin } = useAdmin();
  const { data, loading, error, reload } = useAdminData((p) => adminDashboard({ data: { pin: p } }), []);
  const [drawer, setDrawer] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState<{ time: number | null } | null>(null);
  const [blockOpen, setBlockOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  // keep the day live while the screen is open
  useEffect(() => {
    const t = window.setInterval(reload, 60_000);
    return () => window.clearInterval(t);
  }, [reload]);

  const rows = useMemo(
    () =>
      data && !data.plan.closed
        ? timeline(data.plan.open, data.plan.close, data.bookings, data.plan.breaks, data.plan.blocks, data.interval)
        : [],
    [data],
  );
  const inactive = data?.bookings.filter((b) => !isActive(b)) ?? [];

  const advance = async (b: AdminBooking) => {
    const step = NEXT[b.status];
    if (!step) return;
    setBusy(b.reference);
    try {
      await adminUpsertBooking({ data: { pin, reference: b.reference, patch: { meta: { status: step.to } } } });
      toast.success(`${b.customer.name}: ${STATUS_LABEL[step.to]}.`);
      reload();
    } catch {
      toast.error("Couldn't update. Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const now = data?.nowMinute ?? 0;

  return (
    <AdminShell
      title={data ? greeting(now) : "Today"}
      subtitle={data ? dateLabel(data.today, { weekday: "long", day: "numeric", month: "long" }) : undefined}
      right={
        <div className="flex gap-2">
          <TinyButton tone="primary" onClick={() => setNewOpen({ time: null })}>
            <Plus className="h-4 w-4" /> <span className="max-sm:hidden">New booking</span>
            <span className="sm:hidden">New</span>
          </TinyButton>
          <span className="hidden gap-2 lg:flex">
            <TinyButton onClick={() => setNewOpen({ time: null })}>
              <UserRoundPlus className="h-4 w-4" /> Walk-in
            </TinyButton>
            <TinyButton onClick={() => setBlockOpen(true)}>
              <Ban className="h-4 w-4" /> Block time
            </TinyButton>
            <TinyButton onClick={() => setCloseOpen(true)}>
              <CalendarX2 className="h-4 w-4" /> Close a day
            </TinyButton>
          </span>
        </div>
      }
    >
      <LoadState loading={loading && !data} error={error} onRetry={reload} />

      <PhoneAlertsNudge />

      {/* phones and tablets: the other quick actions, one tap away */}
      <div className="mb-4 grid grid-cols-3 gap-2 lg:hidden">
        {[
          { icon: UserRoundPlus, label: "Walk-in", on: () => setNewOpen({ time: null }) },
          { icon: Ban, label: "Block time", on: () => setBlockOpen(true) },
          { icon: CalendarX2, label: "Close a day", on: () => setCloseOpen(true) },
        ].map((a) => (
          <button
            key={a.label}
            type="button"
            onClick={a.on}
            className="press tap-icon flex flex-col items-center gap-1.5 rounded-xl border border-hairline bg-card py-3 text-[0.75rem]"
          >
            <a.icon className="h-[18px] w-[18px]" strokeWidth={1.5} />
            {a.label}
          </button>
        ))}
      </div>

      {data ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5 [&>*:last-child]:max-sm:col-span-2">
            <Tile
              tone="blue"
              icon={CalendarCheck2}
              label="Today"
              value={String(data.counts.total)}
              hint={`${data.counts.upcoming} still to come · ${data.counts.completed} done`}
              delay={0}
            />
            <Tile
              tone="aqua"
              icon={IndianRupee}
              label="Collected today"
              value={inr(data.revenue.today)}
              hint={`Expected ${inr(data.revenue.expectedToday)}`}
              delay={60}
            />
            <Tile
              tone="orange"
              icon={TrendingUp}
              label="This month"
              value={inr(data.revenue.month)}
              hint={`This week ${inr(data.revenue.week)}`}
              delay={120}
            />
            <Tile
              tone="violet"
              icon={Users}
              label="Guests · 30 days"
              value={String(data.month30.guests)}
              hint={`${data.month30.visits} completed visits`}
              delay={180}
            />
            <Tile
              tone="yellow"
              icon={Receipt}
              label="Average visit"
              value={inr(data.month30.average)}
              hint={
                data.counts.noShow || data.counts.cancelled
                  ? `Today: ${data.counts.noShow} no-show · ${data.counts.cancelled} cancelled`
                  : `${data.month30.noShows} no-shows in 30 days`
              }
              delay={240}
            />
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <ChartCard title="Revenue" hint={`Last 30 days · ${inr(data.revenue.last30)}`}>
              <AreaTrend
                label="Revenue per day, last 30 days"
                color={DASH.blue}
                points={data.days.filter((d) => d.date <= data.today).map((d) => ({ date: d.date, value: d.revenue }))}
                format={(n) => (n >= 1000 ? `₹${Math.round(n / 100) / 10}k` : `₹${Math.round(n)}`)}
              />
            </ChartCard>
            <ChartCard title="The diary" hint="Last 2 weeks and the week ahead">
              <StackedBars
                label="Appointments per day by outcome"
                today={data.today}
                days={data.days.slice(-21)}
                series={[
                  { key: "completed", label: "Completed", color: DASH.aqua },
                  { key: "upcoming", label: "Booked", color: DASH.blue },
                  { key: "noShow", label: "No-show", color: DASH.yellow },
                  { key: "cancelled", label: "Cancelled", color: DASH.red },
                ]}
              />
            </ChartCard>
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="min-w-0 space-y-5">
              {data.next ? (
                <Panel className="rounded-2xl border-0 bg-[linear-gradient(120deg,#1c1611_0%,#3a2a1c_100%)] text-ivory shadow-[0_18px_40px_-26px_rgba(30,20,10,0.8)] [&_.text-muted-foreground]:text-ivory/70">
                  <div className="flex items-center gap-2 text-[0.62rem] uppercase tracking-[0.2em] text-champagne">
                    <span className="h-2 w-2 animate-pulse rounded-full" style={{ background: data.next.time <= now ? DASH.orange : DASH.aqua }} />
                    {data.next.time <= now ? "In progress" : "Up next"}
                  </div>
                  <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
                    <button onClick={() => setDrawer(data.next!.reference)} className="min-w-0 text-left">
                      <div className="font-display text-[2rem] leading-none">{data.next.customer.name}</div>
                      <div className="mt-1.5 truncate text-[0.85rem] text-muted-foreground">
                        {data.next.services.map((s) => s.name).join(" · ")} · {formatDuration(data.next.minutes)}
                      </div>
                    </button>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="font-display text-[2rem] leading-none">{minuteLabel(data.next.time)}</div>
                        <div className="mt-1 text-[0.75rem] text-muted-foreground">
                          {data.next.time > now ? `in ${formatDuration(data.next.time - now)}` : `until ${minuteLabel(data.next.end)}`}
                        </div>
                      </div>
                      {NEXT[data.next.status] ? (
                        <button
                          type="button"
                          disabled={busy === data.next.reference}
                          onClick={() => void advance(data.next!)}
                          className="press min-h-10 rounded-lg bg-champagne px-4 text-[0.85rem] font-medium text-ink disabled:opacity-50"
                        >
                          {NEXT[data.next.status]!.label}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </Panel>
              ) : null}

              <Panel className="p-0 lg:p-0">
                <div className="flex items-center justify-between border-b border-hairline px-4 py-3 lg:px-5">
                  <div className="text-[0.62rem] uppercase tracking-[0.2em] text-muted-foreground">Today's schedule</div>
                  {!data.plan.closed ? (
                    <div className="text-[0.75rem] text-muted-foreground">
                      {minuteLabel(data.plan.open)} – {minuteLabel(data.plan.close)}
                    </div>
                  ) : null}
                </div>
                {data.plan.closed ? (
                  <p className="px-5 py-12 text-center text-[0.9rem] text-muted-foreground">The studio is closed today.</p>
                ) : (
                  <ol>
                    {rows.map((r) => (
                      <TimelineRow
                        key={`${r.kind}-${r.start}-${r.kind === "booking" ? r.b.reference : ""}`}
                        row={r}
                        now={now}
                        busy={r.kind === "booking" && busy === r.b.reference}
                        onOpen={(ref) => setDrawer(ref)}
                        onAdvance={advance}
                        onBook={(t) => setNewOpen({ time: t })}
                      />
                    ))}
                  </ol>
                )}
                {inactive.length ? (
                  <div className="border-t border-hairline px-4 py-3 lg:px-5">
                    <div className="text-[0.62rem] uppercase tracking-[0.2em] text-muted-foreground">Cancelled & no-shows</div>
                    {inactive.map((b) => (
                      <button
                        key={b.reference}
                        onClick={() => setDrawer(b.reference)}
                        className="mt-2 flex w-full items-center gap-3 text-left text-[0.85rem] text-muted-foreground"
                      >
                        <span className="w-16 tabular-nums">{minuteLabel(b.time)}</span>
                        <span className="min-w-0 flex-1 truncate line-through decoration-foreground/30">{b.customer.name}</span>
                        <StatusPill status={b.status} />
                      </button>
                    ))}
                  </div>
                ) : null}
              </Panel>
            </div>

            <div className="space-y-5">
              <Panel>
                <div className="text-[0.62rem] uppercase tracking-[0.2em] text-muted-foreground">Needs attention</div>
                <ul className="mt-3 space-y-2.5">
                  {data.alerts.map((a, i) => {
                    const Icon = a.level === "warn" ? AlertTriangle : Info;
                    const body = (
                      <span className="flex items-start gap-2.5 text-[0.85rem]">
                        <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", a.level === "warn" ? "text-amber-600" : "text-muted-foreground")} strokeWidth={1.6} />
                        <span className="flex-1">{a.text}</span>
                        {a.to ? <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" /> : null}
                      </span>
                    );
                    return <li key={i}>{a.to ? <Link to={a.to as never}>{body}</Link> : body}</li>;
                  })}
                </ul>
              </Panel>
            </div>
          </div>
          {data.visits ? <JourneyCard visits={data.visits} /> : null}

          <div className="mt-5 grid gap-5 lg:grid-cols-2">
            <ChartCard title="Most booked services" hint="Last 30 days">
              {data.topServices.length ? (
                <Donut
                  centre={String(data.topServices.reduce((n, x) => n + x.count, 0))}
                  centreHint="services"
                  items={data.topServices.map((x, i) => ({
                    label: x.name,
                    value: x.count,
                    color: [DASH.blue, DASH.orange, DASH.aqua, DASH.yellow, DASH.magenta, DASH.violet][i]!,
                  }))}
                />
              ) : (
                <p className="py-10 text-center text-[0.88rem] text-muted-foreground">No bookings in the last 30 days yet.</p>
              )}
            </ChartCard>
            <ChartCard title="Who did what" hint="Last 30 days">
              {data.team.length ? (
                <div className="-mx-1 overflow-x-auto">
                  <table className="w-full min-w-[20rem] text-[0.85rem]">
                    <thead>
                      <tr className="border-b border-hairline text-left text-[0.72rem] text-muted-foreground">
                        <th className="px-1 py-2 font-normal">Stylist</th>
                        <th className="px-1 py-2 text-right font-normal">Services</th>
                        <th className="px-1 py-2 text-right font-normal">Brought in</th>
                        <th className="px-1 py-2 text-right font-normal">No-shows</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.team.map((t, i) => {
                        const top = Math.max(...data.team.map((x) => x.revenue), 1);
                        return (
                          <tr key={t.name + i} className="border-b border-hairline last:border-0">
                            <td className="px-1 py-2.5">
                              <span className="flex items-center gap-2.5">
                                <span
                                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[0.72rem] font-medium text-white"
                                  style={{ background: [DASH.violet, DASH.orange, DASH.aqua, DASH.blue, DASH.magenta][i % 5] }}
                                >
                                  {t.name.slice(0, 1).toUpperCase()}
                                </span>
                                <span className="min-w-0">
                                  <span className="block truncate">{t.name}</span>
                                  <span className="mt-1 block h-1 w-24 overflow-hidden rounded-full bg-foreground/[0.06]">
                                    <span
                                      className="block h-full rounded-full"
                                      style={{ width: `${(t.revenue / top) * 100}%`, background: DASH.aqua }}
                                    />
                                  </span>
                                </span>
                              </span>
                            </td>
                            <td className="px-1 py-2.5 text-right tabular-nums">{t.services}</td>
                            <td className="px-1 py-2.5 text-right font-medium tabular-nums">{inr(t.revenue)}</td>
                            <td className={cn("px-1 py-2.5 text-right tabular-nums", t.noShows ? "text-destructive" : "text-muted-foreground")}>
                              {t.noShows}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="py-10 text-center text-[0.88rem] text-muted-foreground">Nothing yet.</p>
              )}
            </ChartCard>
          </div>
        </>
      ) : null}

      <BookingDrawer reference={drawer} onClose={() => setDrawer(null)} onChanged={reload} />
      <NewBookingDialog
        open={Boolean(newOpen)}
        onOpenChange={(o) => !o && setNewOpen(null)}
        initialTime={newOpen?.time ?? null}
        onCreated={reload}
        {...(data ? { initialDate: data.today } : {})}
      />
      <BlockTimeDialog open={blockOpen} onOpenChange={setBlockOpen} onSaved={reload} {...(data ? { initialDate: data.today } : {})} />
      <CloseDayDialog open={closeOpen} onOpenChange={setCloseOpen} onSaved={reload} />
    </AdminShell>
  );
}

function TimelineRow({
  row,
  now,
  busy,
  onOpen,
  onAdvance,
  onBook,
}: {
  row: Row;
  now: number;
  busy: boolean;
  onOpen: (ref: string) => void;
  onAdvance: (b: AdminBooking) => void;
  onBook: (time: number) => void;
}) {
  const past = row.end <= now;
  const time = (
    <div className="w-[4.5rem] shrink-0">
      <div className="text-[0.95rem] tabular-nums">{minuteLabel(row.start)}</div>
      <div className="text-[0.7rem] tabular-nums text-muted-foreground">{minuteLabel(row.end)}</div>
    </div>
  );

  if (row.kind === "booking") {
    const b = row.b;
    const step = NEXT[b.status];
    const live = row.start <= now && now < row.end;
    return (
      <li className={cn("relative flex items-center gap-3 border-b border-hairline px-4 py-3 last:border-0 lg:px-5", live && "bg-champagne/10")}>
        <span className={cn("absolute inset-y-2 left-1 rounded-full", live ? "w-1" : "w-[3px]")} style={{ background: STATUS_COLOR[b.status] }} />
        {time}
        <button onClick={() => onOpen(b.reference)} className="min-w-0 flex-1 text-left">
          <div className="flex items-center gap-2">
            <span className="truncate text-[0.95rem]">{b.customer.name}</span>
            {b.source !== "online" ? <span className="text-[0.62rem] uppercase tracking-[0.14em] text-muted-foreground">{b.source}</span> : null}
          </div>
          <div className="truncate text-[0.8rem] text-muted-foreground">
            {b.services.map((s) => s.name).join(" · ")} · {inr(b.price)}
          </div>
        </button>
        <StatusPill status={b.status} />
        {step ? (
          <TinyButton disabled={busy} onClick={() => onAdvance(b)}>
            {step.label}
          </TinyButton>
        ) : null}
      </li>
    );
  }

  if (row.kind === "free") {
    const bookable = !past;
    return (
      <li className="flex items-center gap-3 border-b border-hairline px-4 py-2.5 last:border-0 lg:px-5">
        {time}
        <span className={cn("flex-1 text-[0.85rem]", past ? "text-muted-foreground/60" : "text-emerald-700")}>
          {past ? "Free (passed)" : `Available · ${formatDuration(row.end - Math.max(row.start, now))}`}
        </span>
        {bookable ? (
          <button onClick={() => onBook(row.start)} className="press text-[0.8rem] text-bronze underline underline-offset-4">
            Book
          </button>
        ) : null}
      </li>
    );
  }

  return (
    <li className="flex items-center gap-3 border-b border-hairline bg-foreground/[0.025] px-4 py-2.5 last:border-0 lg:px-5">
      {time}
      <span className="flex-1 text-[0.85rem] text-muted-foreground">
        {row.kind === "break" ? row.label : `Blocked · ${row.label}`}
      </span>
    </li>
  );
}

const TONES = {
  blue: { bg: "linear-gradient(135deg,#2a78d6 0%,#3f8ee8 100%)", ink: "#fff" },
  aqua: { bg: "linear-gradient(135deg,#118a5f 0%,#1baf7a 100%)", ink: "#fff" },
  orange: { bg: "linear-gradient(135deg,#dc5524 0%,#f27a45 100%)", ink: "#fff" },
  violet: { bg: "linear-gradient(135deg,#5141c4 0%,#7465e0 100%)", ink: "#fff" },
  yellow: { bg: "linear-gradient(135deg,#eda100 0%,#f6bd32 100%)", ink: "#1c1611" },
} as const;

/** A bold, colourful headline number (the dashboard's top row). */
function Tile({
  tone,
  icon: Icon,
  label,
  value,
  hint,
  delay,
}: {
  tone: keyof typeof TONES;
  icon: LucideIcon;
  label: string;
  value: string;
  hint: string;
  delay: number;
}) {
  const t = TONES[tone];
  return (
    <div
      className="dash-tile relative min-w-0 overflow-hidden rounded-2xl px-4 py-4 shadow-[0_14px_30px_-20px_rgba(30,20,10,0.55)] transition-transform sm:min-w-0"
      style={{ background: t.bg, color: t.ink, animationDelay: `${delay}ms` }}
    >
      {/* soft rings for texture */}
      <span className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full border-[14px] border-white/10" />
      <span className="pointer-events-none absolute -right-2 bottom-[-3.5rem] h-24 w-24 rounded-full bg-white/10" />
      <span className="dash-tile-icon relative flex h-9 w-9 items-center justify-center rounded-xl bg-white/20">
        <Icon className="h-[18px] w-[18px]" strokeWidth={1.8} />
      </span>
      <div className="relative mt-3 truncate text-[clamp(1.35rem,6vw,1.75rem)] font-semibold leading-none tracking-tight tabular-nums">{value}</div>
      <div className="relative mt-1.5 text-[0.8rem] font-medium opacity-95">{label}</div>
      <div className="relative mt-0.5 truncate text-[0.72rem] opacity-80">{hint}</div>
    </div>
  );
}

function ChartCard({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-hairline bg-card p-4 shadow-[0_10px_30px_-24px_rgba(30,20,10,0.4)] lg:p-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-[1rem] font-medium">{title}</h2>
        {hint ? <span className="truncate text-[0.75rem] text-muted-foreground">{hint}</span> : null}
      </div>
      {children}
    </section>
  );
}

const JOURNEY: { key: "home" | "book" | "services" | "time" | "details" | "review" | "booked"; label: string }[] = [
  { key: "home", label: "Visited the site" },
  { key: "book", label: "Started booking" },
  { key: "services", label: "Chose services" },
  { key: "time", label: "Picked a time" },
  { key: "details", label: "Entered details" },
  { key: "review", label: "Reviewed" },
  { key: "booked", label: "Booked" },
];

/** How far visitors get through booking (last 7 days, no cookies, no personal data). */
function JourneyCard({ visits }: { visits: Record<string, number> }) {
  const top = Math.max(1, ...JOURNEY.map((j) => visits[j.key] ?? 0));
  let biggest = { at: -1, drop: 0 };
  JOURNEY.forEach((j, i) => {
    if (!i) return;
    const prev = visits[JOURNEY[i - 1]!.key] ?? 0;
    const drop = prev ? 1 - (visits[j.key] ?? 0) / prev : 0;
    if (prev >= 5 && drop > biggest.drop) biggest = { at: i, drop };
  });
  return (
    <div className="mt-5">
      <ChartCard title="Booking journey" hint="Last 7 days · visitors who reached each step">
        <ol className="space-y-2">
          {JOURNEY.map((j, i) => {
            const n = visits[j.key] ?? 0;
            const prev = i ? (visits[JOURNEY[i - 1]!.key] ?? 0) : 0;
            const pct = i && prev ? Math.round((n / prev) * 100) : null;
            return (
              <li key={j.key} className="grid grid-cols-[8.5rem_minmax(0,1fr)_4.5rem] items-center gap-3 text-[0.82rem] sm:grid-cols-[10rem_minmax(0,1fr)_5rem]">
                <span className="truncate text-muted-foreground">{j.label}</span>
                <span className="h-5 overflow-hidden rounded bg-foreground/[0.05]">
                  <span
                    className="dash-bar block h-full rounded"
                    style={{ width: `${(n / top) * 100}%`, background: i === biggest.at ? DASH.orange : j.key === "booked" ? DASH.aqua : DASH.blue }}
                  />
                </span>
                <span className="text-right tabular-nums">
                  {n}
                  {pct != null ? <span className="ml-1.5 text-[0.72rem] text-muted-foreground">{pct}%</span> : null}
                </span>
              </li>
            );
          })}
        </ol>
        {biggest.at > 0 ? (
          <p className="mt-3 text-[0.8rem] text-muted-foreground">
            Most people leave between <b className="font-medium text-foreground">{JOURNEY[biggest.at - 1]!.label.toLowerCase()}</b> and{" "}
            <b className="font-medium text-foreground">{JOURNEY[biggest.at]!.label.toLowerCase()}</b> ({Math.round(biggest.drop * 100)}% stop there).
          </p>
        ) : (
          <p className="mt-3 text-[0.8rem] text-muted-foreground">Counts build up as people visit. No cookies, no personal data.</p>
        )}
      </ChartCard>
    </div>
  );
}
