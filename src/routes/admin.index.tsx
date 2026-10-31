import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Ban, CalendarX2, ChevronRight, Info, Plus, UserRoundPlus } from "lucide-react";
import { AdminShell, Panel, Stat, StatusPill, TinyButton } from "@/components/admin";
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
        <div className="flex flex-wrap gap-2">
          <TinyButton tone="primary" onClick={() => setNewOpen({ time: null })}>
            <Plus className="h-4 w-4" /> New booking
          </TinyButton>
          <TinyButton onClick={() => setNewOpen({ time: null })}>
            <UserRoundPlus className="h-4 w-4" /> Walk-in
          </TinyButton>
          <TinyButton onClick={() => setBlockOpen(true)}>
            <Ban className="h-4 w-4" /> Block time
          </TinyButton>
          <TinyButton onClick={() => setCloseOpen(true)}>
            <CalendarX2 className="h-4 w-4" /> Close a day
          </TinyButton>
        </div>
      }
    >
      <LoadState loading={loading && !data} error={error} onRetry={reload} />

      {data ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat label="Today" value={String(data.counts.total)} hint="appointments" />
            <Stat label="Still to come" value={String(data.counts.upcoming)} />
            <Stat label="Completed" value={String(data.counts.completed)} />
            <Stat
              label="No-show / cancelled"
              value={`${data.counts.noShow} / ${data.counts.cancelled}`}
              {...(data.counts.noShow ? { tone: "warn" as const } : {})}
            />
            <Stat label="Collected" value={inr(data.revenue.today)} hint={`Expected ${inr(data.revenue.expectedToday)}`} />
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="min-w-0 space-y-5">
              {data.next ? (
                <Panel className="border-bronze/35 bg-champagne/10">
                  <div className="text-[0.62rem] uppercase tracking-[0.2em] text-bronze">
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
                        <TinyButton tone="primary" disabled={busy === data.next.reference} onClick={() => void advance(data.next!)}>
                          {NEXT[data.next.status]!.label}
                        </TinyButton>
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
              <Panel>
                <div className="text-[0.62rem] uppercase tracking-[0.2em] text-muted-foreground">Revenue</div>
                <dl className="mt-3 space-y-2 text-[0.88rem]">
                  {[
                    ["Today", data.revenue.today],
                    ["This week", data.revenue.week],
                    ["This month", data.revenue.month],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between">
                      <dt className="text-muted-foreground">{k}</dt>
                      <dd className="tabular-nums">{inr(v as number)}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-3 text-[0.72rem] text-muted-foreground">Counted from completed appointments.</p>
              </Panel>
            </div>
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
        {live ? <span className="absolute inset-y-0 left-0 w-0.5 bg-bronze" /> : null}
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
