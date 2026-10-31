import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { toast } from "sonner";
import { Ban, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { AdminShell, TinyButton } from "@/components/admin";
import {
  BlockTimeDialog,
  BookingDrawer,
  LoadState,
  NewBookingDialog,
  dateLabel,
  salonToday,
  useAdminData,
} from "@/components/admin-ops";
import { useAdmin, type ApptStatus } from "@/lib/admin-store";
import { adminDay, adminRange, type AdminBooking } from "@/lib/admin-data.functions";
import { adminUpsertBooking } from "@/lib/salon.functions";
import { fromISO, hoursFor, isClosed, minuteLabel, toISO } from "@/lib/salon";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export const Route = createFileRoute("/admin/calendar")({
  head: () => ({
    meta: [
      { title: "Calendar — Hair by Bhargav" },
      { name: "description", content: "Day, week and month view of the salon's chair." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Calendar — Hair by Bhargav" },
      { property: "og:description", content: "Day, week and month view." },
    ],
  }),
  component: CalendarScreen,
});

type View = "day" | "week" | "month";

const addDays = (iso: string, n: number) => {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
};
const weekStart = (iso: string) => addDays(iso, -((fromISO(iso).getDay() + 6) % 7));
const monthStart = (iso: string) => `${iso.slice(0, 8)}01`;

const BLOCK_TONE: Record<ApptStatus, string> = {
  pending: "border-amber-500/60 bg-amber-50 text-amber-950",
  upcoming: "border-foreground/25 bg-background",
  arrived: "border-bronze/60 bg-champagne/30",
  "in-chair": "border-foreground bg-foreground text-background",
  completed: "border-emerald-700/30 bg-emerald-50 text-emerald-950",
  "no-show": "border-destructive/40 bg-destructive/[0.06] text-destructive",
  cancelled: "border-destructive/20 bg-background text-muted-foreground line-through",
};

function CalendarScreen() {
  const [view, setView] = useState<View>("day");
  const [date, setDate] = useState(salonToday());
  const [drawer, setDrawer] = useState<string | null>(null);
  const [newAt, setNewAt] = useState<{ date: string; time: number | null } | null>(null);
  const [blockOpen, setBlockOpen] = useState(false);
  const [version, setVersion] = useState(0);
  const refresh = () => setVersion((v) => v + 1);

  const step = (dir: 1 | -1) => {
    if (view === "day") setDate(addDays(date, dir));
    else if (view === "week") setDate(addDays(date, dir * 7));
    else {
      const d = fromISO(date);
      d.setDate(1);
      d.setMonth(d.getMonth() + dir);
      setDate(toISO(d));
    }
  };

  const title =
    view === "day"
      ? dateLabel(date, { weekday: "long", day: "numeric", month: "long" })
      : view === "week"
        ? `${dateLabel(weekStart(date), { day: "numeric", month: "short" })} – ${dateLabel(addDays(weekStart(date), 6), { day: "numeric", month: "short" })}`
        : fromISO(date).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  return (
    <AdminShell
      title="Calendar"
      wide
      right={
        <div className="flex flex-wrap gap-2">
          <TinyButton tone="primary" onClick={() => setNewAt({ date, time: null })}>
            <Plus className="h-4 w-4" /> New booking
          </TinyButton>
          <TinyButton onClick={() => setBlockOpen(true)}>
            <Ban className="h-4 w-4" /> Block time
          </TinyButton>
        </div>
      }
    >
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <button aria-label="Previous" onClick={() => step(-1)} className="press grid h-9 w-9 place-items-center rounded-md border border-foreground/15">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button aria-label="Next" onClick={() => step(1)} className="press grid h-9 w-9 place-items-center rounded-md border border-foreground/15">
            <ChevronRight className="h-4 w-4" />
          </button>
          <button onClick={() => setDate(salonToday())} className="press ml-1 h-9 rounded-md border border-foreground/15 px-3 text-[0.8rem]">
            Today
          </button>
          <h2 className="ml-3 font-display text-[1.5rem] leading-none">{title}</h2>
        </div>
        <div className="flex rounded-md border border-foreground/15 p-0.5">
          {(["day", "week", "month"] as const).map((v) => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn("rounded px-3.5 py-1.5 text-[0.8rem] capitalize", view === v ? "bg-foreground text-background" : "text-muted-foreground")}
            >
              {v}
            </button>
          ))}
        </div>
      </div>

      {view === "day" ? (
        <DayView key={`${date}-${version}`} date={date} onOpen={setDrawer} onBook={(t) => setNewAt({ date, time: t })} onChanged={refresh} />
      ) : view === "week" ? (
        <WeekView
          key={`${weekStart(date)}-${version}`}
          from={weekStart(date)}
          onOpen={setDrawer}
          onDay={(d) => {
            setDate(d);
            setView("day");
          }}
        />
      ) : (
        <MonthView
          key={`${monthStart(date)}-${version}`}
          month={monthStart(date)}
          onDay={(d) => {
            setDate(d);
            setView("day");
          }}
        />
      )}

      <BookingDrawer reference={drawer} onClose={() => setDrawer(null)} onChanged={refresh} />
      <NewBookingDialog
        open={Boolean(newAt)}
        onOpenChange={(o) => !o && setNewAt(null)}
        initialDate={newAt?.date ?? date}
        initialTime={newAt?.time ?? null}
        onCreated={refresh}
      />
      <BlockTimeDialog open={blockOpen} onOpenChange={setBlockOpen} initialDate={date} onSaved={refresh} />
    </AdminShell>
  );
}

/* ── day: appointments fill their real duration; drag to move ── */

const PX_PER_MIN = 1.6;

function DayView({
  date,
  onOpen,
  onBook,
  onChanged,
}: {
  date: string;
  onOpen: (ref: string) => void;
  onBook: (time: number) => void;
  onChanged: () => void;
}) {
  const { pin } = useAdmin();
  const { data, loading, error, reload } = useAdminData((p) => adminDay({ data: { pin: p, date } }), [date]);
  const [drag, setDrag] = useState<{ ref: string; dy: number } | null>(null);
  const [move, setMove] = useState<{ b: AdminBooking; to: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const origin = useRef<{ y: number; moved: boolean } | null>(null);

  if (!data) return <LoadState loading={loading} error={error} onRetry={reload} />;
  const { plan, interval } = data;
  if (plan.closed)
    return <p className="rounded-md border border-dashed border-foreground/15 px-6 py-16 text-center text-muted-foreground">The studio is closed on this day.</p>;

  const start = plan.open;
  const end = plan.close;
  const height = (end - start) * PX_PER_MIN;
  const y = (m: number) => (m - start) * PX_PER_MIN;
  const snap = (m: number) => Math.round(m / interval) * interval;
  const hours: number[] = [];
  for (let m = Math.ceil(start / 60) * 60; m <= end; m += 60) hours.push(m);
  const nowLine = data.now.iso === date && data.now.minute >= start && data.now.minute <= end ? data.now.minute : null;
  const visible = data.bookings.filter((b) => b.status !== "cancelled");
  const movable = (b: AdminBooking) => ["pending", "upcoming"].includes(b.status);

  const onDown = (e: RPointerEvent, b: AdminBooking) => {
    if (!movable(b)) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    origin.current = { y: e.clientY, moved: false };
    setDrag({ ref: b.reference, dy: 0 });
  };
  const onMove = (e: RPointerEvent) => {
    if (!origin.current || !drag) return;
    const dy = e.clientY - origin.current.y;
    if (Math.abs(dy) > 4) origin.current.moved = true;
    setDrag({ ...drag, dy });
  };
  const onUp = (b: AdminBooking) => {
    const o = origin.current;
    origin.current = null;
    const dy = drag?.dy ?? 0;
    setDrag(null);
    if (!o?.moved) return onOpen(b.reference);
    const to = Math.max(start, Math.min(end - b.minutes, snap(b.time + dy / PX_PER_MIN)));
    if (to !== b.time) setMove({ b, to });
  };

  const confirmMove = async () => {
    if (!move) return;
    setSaving(true);
    try {
      await adminUpsertBooking({ data: { pin, reference: move.b.reference, patch: { date, time: move.to } } });
      toast.success(`Moved to ${minuteLabel(move.to)}.`);
      setMove(null);
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error && e.message.length < 120 ? e.message : "That time is no longer available.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="overflow-hidden rounded-md border border-hairline bg-card">
        <div className="relative flex" style={{ height }}>
          {/* hour rail */}
          <div className="relative w-16 shrink-0 border-r border-hairline">
            {hours.map((m) => (
              <span key={m} className="absolute right-2 -translate-y-1/2 text-[0.7rem] tabular-nums text-muted-foreground" style={{ top: y(m) }}>
                {minuteLabel(m)}
              </span>
            ))}
          </div>
          <div className="relative flex-1">
            {hours.map((m) => (
              <span key={m} className="absolute inset-x-0 border-t border-hairline" style={{ top: y(m) }} />
            ))}
            {/* empty time: click to book there */}
            <button
              aria-label="Book a time"
              className="absolute inset-0 cursor-copy"
              onClick={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                onBook(Math.max(start, snap(start + (e.clientY - r.top) / PX_PER_MIN - interval / 2)));
              }}
            />
            {plan.breaks.map((r, i) => (
              <div
                key={`b${i}`}
                className="pointer-events-none absolute inset-x-0 flex items-center justify-center bg-[repeating-linear-gradient(135deg,transparent_0_6px,rgb(0_0_0/0.035)_6px_12px)] text-[0.68rem] uppercase tracking-[0.2em] text-muted-foreground"
                style={{ top: y(r.start), height: (r.end - r.start) * PX_PER_MIN }}
              >
                {r.label || "Break"}
              </div>
            ))}
            {data.blocks.map((r) => (
              <div
                key={r.id}
                className="pointer-events-none absolute inset-x-0 flex items-center justify-center bg-foreground/[0.06] text-[0.72rem] text-muted-foreground"
                style={{ top: y(r.start), height: (r.end - r.start) * PX_PER_MIN }}
              >
                {r.kind === "break" ? r.reason || "Break" : `Blocked · ${r.reason || "Unavailable"}`}
              </div>
            ))}
            {nowLine != null ? (
              <div className="pointer-events-none absolute inset-x-0 z-20 flex items-center" style={{ top: y(nowLine) }}>
                <span className="-ml-1 h-2 w-2 rounded-full bg-bronze" />
                <span className="h-px flex-1 bg-bronze" />
              </div>
            ) : null}
            {visible.map((b) => {
              const dragging = drag?.ref === b.reference;
              const top = y(b.time) + (dragging ? drag.dy : 0);
              const ghost = dragging ? snap(b.time + drag.dy / PX_PER_MIN) : null;
              return (
                <div
                  key={b.reference}
                  onPointerDown={(e) => onDown(e, b)}
                  onPointerMove={onMove}
                  onPointerUp={() => (drag ? onUp(b) : onOpen(b.reference))}
                  onPointerCancel={() => {
                    origin.current = null;
                    setDrag(null);
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => e.key === "Enter" && onOpen(b.reference)}
                  className={cn(
                    "absolute right-2 left-2 z-10 overflow-hidden rounded-md border px-3 py-1.5 text-left shadow-sm transition-shadow select-none",
                    BLOCK_TONE[b.status],
                    movable(b) ? "cursor-grab touch-none" : "cursor-pointer",
                    dragging && "z-30 cursor-grabbing shadow-lg ring-2 ring-bronze/40",
                  )}
                  style={{ top, height: Math.max(26, b.minutes * PX_PER_MIN - 2) }}
                >
                  <div className="flex items-baseline justify-between gap-2 text-[0.82rem]">
                    <span className="truncate font-medium">{b.customer.name}</span>
                    <span className="shrink-0 tabular-nums opacity-70">
                      {dragging && ghost != null ? `→ ${minuteLabel(ghost)}` : `${minuteLabel(b.time)} – ${minuteLabel(b.end)}`}
                    </span>
                  </div>
                  {b.minutes >= 30 ? <div className="truncate text-[0.75rem] opacity-70">{b.services.map((s) => s.name).join(" · ")}</div> : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <p className="mt-2 text-[0.75rem] text-muted-foreground">
        Drag a pending or confirmed appointment to move it · click empty time to book · every move is re-checked for clashes.
      </p>

      <Dialog open={Boolean(move)} onOpenChange={(o) => !o && setMove(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display text-[1.5rem] font-normal">Move appointment?</DialogTitle>
            <DialogDescription>
              {move ? `${move.b.customer.name}: ${minuteLabel(move.b.time)} → ${minuteLabel(move.to)}` : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <TinyButton onClick={() => setMove(null)}>Keep time</TinyButton>
            <TinyButton tone="primary" disabled={saving} onClick={() => void confirmMove()}>
              {saving ? "Moving…" : "Move"}
            </TinyButton>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ── week ─────────────────────────────────────────────────── */

function WeekView({ from, onOpen, onDay }: { from: string; onOpen: (ref: string) => void; onDay: (d: string) => void }) {
  const to = addDays(from, 6);
  const { data, loading, error, reload } = useAdminData((p) => adminRange({ data: { pin: p, from, to } }), [from]);
  const byDay = useMemo(() => {
    const m = new Map<string, AdminBooking[]>();
    for (const b of data?.bookings ?? []) if (b.status !== "cancelled") m.set(b.date, [...(m.get(b.date) ?? []), b]);
    return m;
  }, [data]);
  if (!data) return <LoadState loading={loading} error={error} onRetry={reload} />;

  return (
    <div className="grid gap-2 md:grid-cols-7">
      {data.days.map((d) => {
        const list = byDay.get(d.date) ?? [];
        const h = hoursFor(d.date);
        return (
          <div key={d.date} className={cn("min-h-40 rounded-md border border-hairline bg-card p-2", d.date === data.today && "border-bronze/50", d.closed && "bg-foreground/[0.03]")}>
            <button onClick={() => onDay(d.date)} className="flex w-full items-baseline justify-between px-1 text-left">
              <span className="text-[0.7rem] uppercase tracking-[0.16em] text-muted-foreground">{dateLabel(d.date, { weekday: "short" })}</span>
              <span className={cn("font-display text-[1.3rem]", d.date === data.today && "text-bronze")}>{fromISO(d.date).getDate()}</span>
            </button>
            {d.closed ? (
              <p className="mt-3 px-1 text-[0.75rem] text-muted-foreground">Closed</p>
            ) : (
              <>
                <p className="px-1 text-[0.68rem] text-muted-foreground">
                  {minuteLabel(h.open)}–{minuteLabel(h.close)}
                </p>
                <div className="mt-2 space-y-1">
                  {list.map((b) => (
                    <button
                      key={b.reference}
                      onClick={() => onOpen(b.reference)}
                      className={cn("block w-full rounded border px-2 py-1 text-left text-[0.72rem]", BLOCK_TONE[b.status])}
                    >
                      <span className="tabular-nums opacity-70">{minuteLabel(b.time)}</span> <span className="truncate">{b.customer.name}</span>
                    </button>
                  ))}
                  {!list.length ? <p className="px-1 text-[0.72rem] text-muted-foreground/70">No bookings</p> : null}
                </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── month ────────────────────────────────────────────────── */

function MonthView({ month, onDay }: { month: string; onDay: (d: string) => void }) {
  const first = fromISO(month);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
  const to = toISO(last);
  const { data, loading, error, reload } = useAdminData((p) => adminRange({ data: { pin: p, from: month, to } }), [month]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of data?.bookings ?? []) if (b.status !== "cancelled") m.set(b.date, (m.get(b.date) ?? 0) + 1);
    return m;
  }, [data]);
  if (!data) return <LoadState loading={loading} error={error} onRetry={reload} />;

  const lead = (first.getDay() + 6) % 7;
  return (
    <div>
      <div className="grid grid-cols-7 gap-1 pb-1 text-center text-[0.65rem] uppercase tracking-[0.16em] text-muted-foreground">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: lead }, (_, i) => (
          <span key={`l${i}`} />
        ))}
        {data.days.map((d) => {
          const n = counts.get(d.date) ?? 0;
          const closed = d.closed || isClosed(d.date);
          return (
            <button
              key={d.date}
              onClick={() => onDay(d.date)}
              className={cn(
                "press flex aspect-square flex-col items-start justify-between rounded-md border border-hairline bg-card p-1.5 text-left sm:p-2.5",
                d.date === data.today && "border-bronze/60",
                closed && "bg-foreground/[0.03] text-muted-foreground",
              )}
            >
              <span className={cn("font-display text-[1.1rem] leading-none sm:text-[1.35rem]", d.date === data.today && "text-bronze")}>{fromISO(d.date).getDate()}</span>
              {closed ? (
                <span className="text-[0.62rem]">Closed</span>
              ) : n ? (
                <span className="rounded-full bg-foreground px-1.5 text-[0.65rem] text-background tabular-nums sm:px-2">
                  {n}
                  <span className="hidden sm:inline"> booked</span>
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
