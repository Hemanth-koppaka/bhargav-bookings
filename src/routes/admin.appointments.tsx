import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Search } from "lucide-react";
import { AdminShell, Empty, StatusPill, TinyButton } from "@/components/admin";
import { BookingDrawer, LoadState, NewBookingDialog, dateLabel, salonToday } from "@/components/admin-ops";
import { useAdmin, STATUS_LABEL, type ApptStatus } from "@/lib/admin-store";
import { adminBookings, type AdminBooking } from "@/lib/admin-data.functions";
import { fromISO, inr, minuteLabel, toISO } from "@/lib/salon";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/appointments")({
  head: () => ({
    meta: [
      { title: "Bookings — Hair by Bhargav" },
      { name: "description", content: "Every booking, with filters and search." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Bookings — Hair by Bhargav" },
      { property: "og:description", content: "Every booking, with filters and search." },
    ],
  }),
  component: BookingsScreen,
});

type Preset = "upcoming" | "today" | "tomorrow" | "week" | "past" | "all";
const PRESETS: { key: Preset; label: string }[] = [
  { key: "upcoming", label: "Upcoming" },
  { key: "today", label: "Today" },
  { key: "tomorrow", label: "Tomorrow" },
  { key: "week", label: "Next 7 days" },
  { key: "past", label: "Past" },
  { key: "all", label: "All" },
];
const STATUSES: ApptStatus[] = ["pending", "upcoming", "arrived", "in-chair", "completed", "no-show", "cancelled"];
const SOURCES = ["online", "walk-in", "phone", "whatsapp", "admin"];

const shift = (iso: string, n: number) => {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
};

function range(p: Preset): { from?: string; to?: string } {
  const t = salonToday();
  switch (p) {
    case "upcoming":
      return { from: t };
    case "today":
      return { from: t, to: t };
    case "tomorrow":
      return { from: shift(t, 1), to: shift(t, 1) };
    case "week":
      return { from: t, to: shift(t, 7) };
    case "past":
      return { to: shift(t, -1) };
    default:
      return {};
  }
}

function BookingsScreen() {
  const { pin, signOut } = useAdmin();
  const [preset, setPreset] = useState<Preset>("upcoming");
  const [status, setStatus] = useState("");
  const [source, setSource] = useState("");
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(0);
  const [list, setList] = useState<AdminBooking[]>([]);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [drawer, setDrawer] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const t = window.setTimeout(() => setTerm(q.trim()), 280);
    return () => window.clearTimeout(t);
  }, [q]);
  useEffect(() => setPage(0), [preset, status, source, term, version]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    const r = range(preset);
    adminBookings({
      data: {
        pin,
        page,
        ...(r.from ? { from: r.from } : {}),
        ...(r.to ? { to: r.to } : {}),
        ...(status ? { status } : {}),
        ...(source ? { source } : {}),
        ...(term ? { q: term } : {}),
      },
    })
      .then((res) => {
        if (!live) return;
        // upcoming lists read soonest first
        const rows = preset === "past" || preset === "all" ? res.bookings : [...res.bookings].reverse();
        setList((prev) => (page === 0 ? rows : [...prev, ...rows]));
        setMore(res.more);
        setError("");
      })
      .catch((e: unknown) => {
        if (!live) return;
        if (e instanceof Error && /session/i.test(e.message)) return signOut("Your session ended. Please sign in again.");
        setError("Couldn't load bookings.");
      })
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [pin, preset, status, source, term, page, version, signOut]);

  const refresh = () => setVersion((v) => v + 1);
  const chip = (on: boolean) =>
    cn("press shrink-0 rounded-full border px-3 py-1 text-[0.78rem]", on ? "border-foreground bg-foreground text-background" : "border-foreground/15 hover:border-foreground/40");

  return (
    <AdminShell
      title="Bookings"
      right={
        <TinyButton tone="primary" onClick={() => setNewOpen(true)}>
          <Plus className="h-4 w-4" /> New booking
        </TinyButton>
      }
    >
      <div className="space-y-3">
        <label className="flex h-11 items-center gap-2.5 rounded-md border border-foreground/15 bg-background px-3 focus-within:border-foreground/50">
          <Search className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search name, phone or booking ID"
            className="flex-1 bg-transparent text-[0.92rem] outline-none"
          />
        </label>
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {PRESETS.map((p) => (
            <button key={p.key} onClick={() => setPreset(p.key)} className={chip(preset === p.key)}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-md border border-foreground/15 bg-background px-3 py-1.5 text-[0.82rem]" aria-label="Status">
            <option value="">Any status</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <select value={source} onChange={(e) => setSource(e.target.value)} className="rounded-md border border-foreground/15 bg-background px-3 py-1.5 text-[0.82rem] capitalize" aria-label="Source">
            <option value="">Any source</option>
            {SOURCES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4">
        <LoadState loading={loading && page === 0 && !list.length} error={error} onRetry={refresh} />
        {!loading && !error && !list.length ? (
          <Empty title={term ? `No bookings match “${term}”.` : "No bookings here yet."} />
        ) : null}
        {list.length ? (
          <div className={cn("overflow-hidden rounded-md border border-hairline bg-card transition-opacity", loading && page === 0 && "opacity-60")}>
            {list.map((b, i) => {
              const newDay = i === 0 || list[i - 1]!.date !== b.date;
              return (
                <div key={b.reference}>
                  {newDay ? (
                    <div className="border-b border-hairline bg-foreground/[0.025] px-4 py-1.5 text-[0.68rem] uppercase tracking-[0.16em] text-muted-foreground">
                      {dateLabel(b.date, { weekday: "long", day: "numeric", month: "long" })}
                      {b.date === salonToday() ? " · Today" : ""}
                    </div>
                  ) : null}
                  <button
                    onClick={() => setDrawer(b.reference)}
                    className="flex w-full items-center gap-3 border-b border-hairline px-4 py-3 text-left last:border-0 hover:bg-foreground/[0.02]"
                  >
                    <span className="w-16 shrink-0 text-[0.9rem] tabular-nums">{minuteLabel(b.time)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.92rem]">{b.customer.name}</span>
                      <span className="block truncate text-[0.78rem] text-muted-foreground">
                        {b.services.map((s) => s.name).join(" · ")}
                      </span>
                    </span>
                    <span className="hidden w-28 shrink-0 text-[0.75rem] tabular-nums text-muted-foreground md:block">{b.customer.phone}</span>
                    <span className="hidden w-24 shrink-0 text-[0.72rem] text-muted-foreground lg:block">{b.reference}</span>
                    <span className="hidden w-16 shrink-0 text-right text-[0.85rem] tabular-nums sm:block">{inr(b.price)}</span>
                    <StatusPill status={b.status} />
                  </button>
                </div>
              );
            })}
          </div>
        ) : null}
        {more ? (
          <div className="mt-4 flex justify-center">
            <TinyButton disabled={loading} onClick={() => setPage((p) => p + 1)}>
              {loading ? "Loading…" : "Load more"}
            </TinyButton>
          </div>
        ) : null}
      </div>

      <BookingDrawer reference={drawer} onClose={() => setDrawer(null)} onChanged={refresh} />
      <NewBookingDialog open={newOpen} onOpenChange={setNewOpen} onCreated={refresh} />
    </AdminShell>
  );
}
