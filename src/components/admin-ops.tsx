// Operational building blocks for the admin console: global search, the
// booking drawer (every action a booking can need), and the dialogs for new
// bookings / walk-ins, blocking time and closing a day. All writes go through
// the server, which re-checks availability, so the console can't create a
// clash even by accident.
import { Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  CalendarClock,
  Check,
  Copy,
  Loader2,
  MessageCircle,
  Phone,
  Search,
  UserPlus,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdmin, STATUS_LABEL, type ApptStatus } from "@/lib/admin-store";
import { BUSINESS, formatDuration, fromISO, inr, menuFor, minuteLabel, toISO, type Audience } from "@/lib/salon";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  adminAvailability,
  adminBooking,
  adminBookings,
  adminCustomers,
  adminDay,
  type AdminBooking,
  type AdminCustomer,
} from "@/lib/admin-data.functions";
import { adminUpsertBooking } from "@/lib/salon.functions";
import { adminSaveBlock } from "@/lib/admin-ops.functions";
import { adminSaveException } from "@/lib/admin-content.functions";
import type { Slot } from "@/lib/availability";
import { adminReferencePhotos } from "@/lib/photos.functions";
import { adminNotificationLogs, type NotifyLog } from "@/lib/admin-notify.functions";
import { messageText, type BookingFacts, type NotifyEvent } from "@/lib/notify/messages";
import { waLink as whatsapp } from "@/lib/whatsapp-link";

/* ── small shared bits ─────────────────────────────────────── */

export const dateLabel = (iso: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "short" }) =>
  fromISO(iso).toLocaleDateString("en-GB", opts);

export const salonToday = () => toISO(new Date(Date.now() + (new Date().getTimezoneOffset() + 330) * 60_000));

const digits = (p: string) => p.replace(/\D/g, "").slice(-10);
export const waLink = (phone: string) => `https://wa.me/91${digits(phone)}`;

/** Runs a server read for the admin, with loading/error state and a reload(). */
export function useAdminData<T>(load: (pin: string) => Promise<T>, deps: unknown[]) {
  const { pin, signOut } = useAdmin();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setLoading(true);
    load(pin)
      .then((d) => {
        if (!live) return;
        setData(d);
        setError("");
      })
      .catch((e: unknown) => {
        if (!live) return;
        const msg = e instanceof Error ? e.message : "";
        if (/session/i.test(msg)) return signOut("Your session ended. Please sign in again.");
        setError("Couldn't load. Check your connection and try again.");
      })
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin, tick, ...deps]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, reload };
}

export function LoadState({ loading, error, onRetry }: { loading: boolean; error: string; onRetry: () => void }) {
  if (error)
    return (
      <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/25 bg-destructive/[0.04] px-4 py-3 text-[0.85rem] text-destructive">
        {error}
        <button onClick={onRetry} className="press underline underline-offset-4">
          Retry
        </button>
      </div>
    );
  if (loading) return <div className="h-1 overflow-hidden rounded bg-foreground/5"><div className="h-full w-1/3 animate-pulse bg-bronze/40" /></div>;
  return null;
}

/* ── global search ─────────────────────────────────────────── */

export function GlobalSearch({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { pin } = useAdmin();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<{ bookings: AdminBooking[]; customers: AdminCustomer[] }>({ bookings: [], customers: [] });
  const [drawer, setDrawer] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const term = q.trim();
    if (term.length < 2) {
      setResults({ bookings: [], customers: [] });
      return;
    }
    setBusy(true);
    const t = window.setTimeout(() => {
      Promise.all([
        adminBookings({ data: { pin, q: term, page: 0 } }).catch(() => ({ bookings: [] as AdminBooking[] })),
        adminCustomers({ data: { pin, q: term, page: 0 } }).catch(() => ({ customers: [] as AdminCustomer[] })),
      ])
        .then(([b, c]) => setResults({ bookings: b.bookings.slice(0, 8), customers: c.customers.slice(0, 6) }))
        .finally(() => setBusy(false));
    }, 250);
    return () => window.clearTimeout(t);
  }, [q, open, pin]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="top-[12%] max-w-xl translate-y-0 gap-0 p-0">
          <DialogHeader className="sr-only">
            <DialogTitle>Search</DialogTitle>
            <DialogDescription>Customers, bookings, phone numbers and booking IDs</DialogDescription>
          </DialogHeader>
          <div className="flex items-center gap-3 border-b border-hairline px-4">
            <Search className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Name, phone, booking ID or service…"
              className="h-12 flex-1 bg-transparent text-[0.95rem] outline-none"
            />
            {busy ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : null}
          </div>
          <div className="max-h-[60vh] overflow-y-auto p-2">
            {q.trim().length < 2 ? (
              <p className="px-3 py-6 text-center text-[0.85rem] text-muted-foreground">Type at least two characters.</p>
            ) : !busy && !results.bookings.length && !results.customers.length ? (
              <p className="px-3 py-6 text-center text-[0.85rem] text-muted-foreground">Nothing found.</p>
            ) : null}
            {results.customers.length ? <div className="px-3 pt-2 pb-1 text-[0.6rem] uppercase tracking-[0.2em] text-muted-foreground">Customers</div> : null}
            {results.customers.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  onOpenChange(false);
                  void navigate({ to: "/admin/customers", search: { id: c.id } as never });
                }}
                className="flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left hover:bg-foreground/[0.04]"
              >
                <span className="truncate text-[0.9rem]">{c.name}</span>
                <span className="shrink-0 text-[0.78rem] tabular-nums text-muted-foreground">{c.phone}</span>
              </button>
            ))}
            {results.bookings.length ? <div className="px-3 pt-3 pb-1 text-[0.6rem] uppercase tracking-[0.2em] text-muted-foreground">Bookings</div> : null}
            {results.bookings.map((b) => (
              <button
                key={b.reference}
                onClick={() => {
                  onOpenChange(false);
                  setDrawer(b.reference);
                }}
                className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left hover:bg-foreground/[0.04]"
              >
                <span className="w-24 shrink-0 text-[0.78rem] tabular-nums text-muted-foreground">
                  {dateLabel(b.date, { day: "numeric", month: "short" })} · {minuteLabel(b.time)}
                </span>
                <span className="min-w-0 flex-1 truncate text-[0.9rem]">
                  {b.customer.name} <span className="text-muted-foreground">· {b.services.map((s) => s.name).join(", ")}</span>
                </span>
                <span className="shrink-0 text-[0.72rem] text-muted-foreground">{b.reference}</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      <BookingDrawer reference={drawer} onClose={() => setDrawer(null)} />
    </>
  );
}

/* ── booking drawer ────────────────────────────────────────── */

type BookingPatch = {
  date?: string;
  time?: number;
  status?: "confirmed" | "cancelled";
  meta?: Record<string, unknown>;
  cancelReason?: string;
  customer?: { name: string; phone: string; email: string };
};

const CANCEL_REASONS = ["Customer requested", "Studio unavailable", "Emergency", "Scheduling conflict", "Other"];

const NEXT_STEP: Partial<Record<ApptStatus, { to: ApptStatus; label: string }>> = {
  pending: { to: "upcoming", label: "Confirm" },
  upcoming: { to: "arrived", label: "Check in" },
  arrived: { to: "in-chair", label: "Start service" },
  "in-chair": { to: "completed", label: "Mark completed" },
};

/** Right-side drawer on laptops, full-screen sheet on phones. */
export function BookingDrawer({
  reference,
  onClose,
  onChanged,
}: {
  reference: string | null;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const { pin } = useAdmin();
  const [data, setData] = useState<Awaited<ReturnType<typeof adminBooking>> | null>(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"view" | "reschedule" | "cancel" | "edit">("view");
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!reference) return;
    setLoading(true);
    adminBooking({ data: { pin, reference } })
      .then(setData)
      .catch(() => toast.error("Couldn't load this booking."))
      .finally(() => setLoading(false));
  }, [pin, reference]);

  useEffect(() => {
    setMode("view");
    setData(null);
    load();
  }, [load]);

  const b = data?.booking ?? null;

  const patch = async (p: BookingPatch, done: string) => {
    if (!b) return false;
    setBusy(true);
    try {
      await adminUpsertBooking({ data: { pin, reference: b.reference, patch: p } });
      toast.success(done);
      load();
      onChanged?.();
      return true;
    } catch (e) {
      toast.error(e instanceof Error && e.message.length < 120 ? e.message : "Couldn't save. Please try again.");
      return false;
    } finally {
      setBusy(false);
    }
  };

  const setStatus = (s: ApptStatus, label: string) => patch({ meta: { status: s } }, label);

  return (
    <Sheet open={Boolean(reference)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-[30rem]">
        <SheetHeader className="sticky top-0 z-10 border-b border-hairline bg-background/95 px-5 py-4 text-left backdrop-blur">
          <SheetTitle className="font-display text-[1.6rem] font-normal leading-tight">
            {b ? b.customer.name || "Booking" : "Booking"}
          </SheetTitle>
          <SheetDescription className="flex flex-wrap items-center gap-2 text-[0.8rem]">
            {b ? (
              <>
                <StatusDot status={b.status} /> {b.reference}
                {b.source !== "online" ? <span className="text-muted-foreground">· {b.source}</span> : null}
              </>
            ) : loading ? (
              "Loading…"
            ) : (
              "Not found"
            )}
          </SheetDescription>
        </SheetHeader>

        {b ? (
          <div className="space-y-5 px-5 py-5">
            {/* appointment */}
            <section className="rounded-md border border-hairline p-4">
              <div className="flex items-baseline justify-between gap-3">
                <div className="font-display text-[1.35rem] leading-tight">
                  {dateLabel(b.date, { weekday: "long", day: "numeric", month: "long" })}
                </div>
                <div className="font-display text-[1.35rem]">{inr(b.price)}</div>
              </div>
              <div className="mt-0.5 text-[0.9rem] text-muted-foreground">
                {minuteLabel(b.time)} – {minuteLabel(b.time + b.minutes)} · {formatDuration(b.minutes)}
              </div>
              <ul className="mt-3 space-y-1 text-[0.9rem]">
                {b.services.map((s) => (
                  <li key={s.id} className="flex justify-between gap-3">
                    <span>{s.name}</span>
                    <span className="text-muted-foreground">{inr(s.price)}</span>
                  </li>
                ))}
              </ul>
              {b.cancelReason ? <p className="mt-3 text-[0.82rem] text-destructive">Cancelled: {b.cancelReason}</p> : null}
            </section>

            {/* actions */}
            {mode === "view" ? (
              <section className="flex flex-wrap gap-2">
                {NEXT_STEP[b.status] ? (
                  <Action primary disabled={busy} onClick={() => void setStatus(NEXT_STEP[b.status]!.to, `${STATUS_LABEL[NEXT_STEP[b.status]!.to]}.`)}>
                    <Check className="h-4 w-4" /> {NEXT_STEP[b.status]!.label}
                  </Action>
                ) : null}
                {b.status !== "completed" && b.status !== "cancelled" && b.status !== "in-chair" ? (
                  <Action disabled={busy} onClick={() => void setStatus("completed", "Marked completed.")}>
                    Mark completed
                  </Action>
                ) : null}
                {b.status !== "cancelled" && b.status !== "completed" ? (
                  <Action disabled={busy} onClick={() => setMode("reschedule")}>
                    <CalendarClock className="h-4 w-4" /> Reschedule
                  </Action>
                ) : null}
                {["pending", "upcoming", "arrived"].includes(b.status) ? (
                  <Action
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm(`Mark ${b.customer.name} as a no-show?`)) void setStatus("no-show", "Marked no-show.");
                    }}
                  >
                    No-show
                  </Action>
                ) : null}
                {b.status !== "cancelled" && b.status !== "completed" ? (
                  <Action danger disabled={busy} onClick={() => setMode("cancel")}>
                    Cancel
                  </Action>
                ) : null}
                {b.status === "cancelled" || b.status === "no-show" ? (
                  <Action disabled={busy} onClick={() => void patch({ status: "confirmed", meta: { status: "upcoming" } }, "Booking restored.")}>
                    Restore
                  </Action>
                ) : null}
              </section>
            ) : null}

            {mode === "reschedule" ? (
              <Reschedule
                booking={b}
                onCancel={() => setMode("view")}
                onConfirm={async (date, time) => {
                  if (await patch({ date, time }, "Booking rescheduled.")) setMode("view");
                }}
                busy={busy}
              />
            ) : null}

            {mode === "cancel" ? (
              <CancelForm
                booking={b}
                busy={busy}
                onBack={() => setMode("view")}
                onConfirm={async (reason) => {
                  if (await patch({ status: "cancelled", meta: { status: "cancelled" }, cancelReason: reason }, "Booking cancelled.")) setMode("view");
                }}
              />
            ) : null}

            {/* contact */}
            <section className="rounded-md border border-hairline p-4">
              <div className="flex items-center justify-between">
                <Label>Customer</Label>
                {mode === "view" ? (
                  <button onClick={() => setMode("edit")} className="text-[0.8rem] text-bronze underline underline-offset-4">
                    Edit
                  </button>
                ) : null}
              </div>
              {mode === "edit" ? (
                <EditContact
                  booking={b}
                  busy={busy}
                  onCancel={() => setMode("view")}
                  onSave={async (c) => {
                    if (await patch({ customer: c }, "Details updated.")) setMode("view");
                  }}
                />
              ) : (
                <>
                  <div className="mt-2 text-[0.95rem]">{b.customer.name}</div>
                  <div className="text-[0.88rem] tabular-nums text-muted-foreground">{b.customer.phone}</div>
                  {b.customer.email ? <div className="text-[0.88rem] text-muted-foreground">{b.customer.email}</div> : null}
                  <div className="mt-3 flex flex-wrap gap-2">
                    <a href={`tel:${b.customer.phone}`} className={ACTION}>
                      <Phone className="h-4 w-4" /> Call
                    </a>
                    <a href={waLink(b.customer.phone)} target="_blank" rel="noreferrer" className={ACTION}>
                      <MessageCircle className="h-4 w-4" /> WhatsApp
                    </a>
                    <button
                      className={ACTION}
                      onClick={() =>
                        void navigator.clipboard?.writeText(b.customer.phone).then(() => toast.success("Phone number copied."))
                      }
                    >
                      <Copy className="h-4 w-4" /> Copy phone
                    </button>
                    {b.customerId ? (
                      <Link to="/admin/customers" search={{ id: b.customerId } as never} className={ACTION}>
                        Profile
                      </Link>
                    ) : null}
                  </div>
                  {b.customer.notes ? <p className="mt-3 text-[0.85rem]">Guest note: “{b.customer.notes}”</p> : null}
                  {data?.customerNotes ? (
                    <p className="mt-2 rounded bg-champagne/15 px-3 py-2 text-[0.85rem]">Internal: {data.customerNotes}</p>
                  ) : null}
                  {b.customer.photos ? <RefPhotos reference={b.reference} count={b.customer.photos} /> : null}
                </>
              )}
            </section>

            {/* internal note + payment */}
            <InternalNote booking={b} busy={busy} onSave={(note) => void patch({ meta: { note } }, "Note saved.")} />
            <PaymentRow booking={b} busy={busy} onSave={(payment, amount) => void patch({ meta: { payment, amount } }, "Payment recorded.")} />

            <WhatsAppSend booking={b} />

            <BookingMessages reference={b.reference} version={data?.booking ? b.history.length + b.status : ""} />

            {/* history */}
            <section>
              <Label>History</Label>
              <ul className="mt-2 space-y-1.5 text-[0.82rem] text-muted-foreground">
                <li>Booked {new Date(b.createdAt).toLocaleString("en-GB", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} · {b.source}</li>
                {b.history.map((h, i) => (
                  <li key={i}>
                    {new Date(h.at).toLocaleString("en-GB", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })} ·{" "}
                    {h.by} {h.action.replace("status:", "→ ")}
                    {h.from && h.to ? ` ${dateLabel(h.from.date)} ${minuteLabel(h.from.time)} → ${dateLabel(h.to.date)} ${minuteLabel(h.to.time)}` : ""}
                    {h.reason ? ` (${h.reason})` : ""}
                  </li>
                ))}
              </ul>
            </section>
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

/** The guest's reference photos, fetched on demand as short-lived private links. */
function RefPhotos({ reference, count }: { reference: string; count: number }) {
  const { pin } = useAdmin();
  const [urls, setUrls] = useState<string[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    adminReferencePhotos({ data: { pin, reference } })
      .then((r) => live && setUrls(r.urls))
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [pin, reference]);
  return (
    <div className="mt-3">
      <Label>Reference photos · deleted when completed</Label>
      <div className="mt-2 flex gap-2">
        {failed ? (
          <span className="text-xs text-destructive">Couldn't load photos.</span>
        ) : urls === null ? (
          Array.from({ length: count }, (_, i) => <span key={i} className="h-20 w-20 animate-pulse rounded-md bg-muted" />)
        ) : urls.length === 0 ? (
          <span className="text-xs text-muted-foreground">Photos have been removed.</span>
        ) : (
          urls.map((u) => (
            <a key={u} href={u} target="_blank" rel="noreferrer" className="press block">
              <img src={u} alt="Guest reference" className="h-20 w-20 rounded-md object-cover" />
            </a>
          ))
        )}
      </div>
    </div>
  );
}

/**
 * Free messaging: opens WhatsApp on this device with the message written out
 * (from the booking's stored details). The salon taps Send in its own WhatsApp.
 */
function WhatsAppSend({ booking: b }: { booking: AdminBooking }) {
  const facts: BookingFacts = {
    reference: b.reference,
    customerName: b.customer.name || "there",
    customerPhone: b.customer.phone,
    date: b.date,
    time: b.time,
    services: b.services.map((s) => s.name),
    minutes: b.minutes,
    price: b.price,
    priceFrom: false,
    location: BUSINESS.locationShort || BUSINESS.address,
    manageUrl: typeof window !== "undefined" ? `${window.location.origin}/manage?ref=${b.reference}` : "",
  };
  const moved = b.history.some((h) => h.action === "rescheduled");
  const options: { event: NotifyEvent; label: string }[] =
    b.status === "cancelled"
      ? [{ event: "BOOKING_CANCELLED", label: "Cancellation" }]
      : [
          { event: "BOOKING_CONFIRMED", label: "Confirmation" },
          { event: "BOOKING_REMINDER_24H", label: "Reminder" },
          ...(moved ? [{ event: "BOOKING_RESCHEDULED" as const, label: "New time" }] : []),
        ];
  if (!b.customer.phone) return null;
  return (
    <section>
      <Label>Send on WhatsApp (free)</Label>
      <div className="mt-2 flex flex-wrap gap-2">
        {options.map((o) => (
          <a
            key={o.event}
            href={whatsapp(b.customer.phone, messageText("customer", o.event, facts))}
            target="_blank"
            rel="noreferrer"
            className={ACTION}
          >
            <MessageCircle className="h-4 w-4" /> {o.label}
          </a>
        ))}
      </div>
      <p className="mt-1.5 text-[0.74rem] text-muted-foreground">Opens WhatsApp with the message ready — just tap Send.</p>
    </section>
  );
}

/** What was sent about this booking, and whether it arrived. */
function BookingMessages({ reference, version }: { reference: string; version: string }) {
  const { pin } = useAdmin();
  const [logs, setLogs] = useState<NotifyLog[] | null>(null);
  useEffect(() => {
    let live = true;
    adminNotificationLogs({ data: { pin, bookingId: reference, page: 0 } })
      .then((r) => live && setLogs(r.available ? r.logs : []))
      .catch(() => live && setLogs([]));
    return () => {
      live = false;
    };
  }, [pin, reference, version]);
  if (!logs?.length) return null;
  const who = (r: string) => (r === "admin" ? "Salon" : "Guest");
  const icon = (st: string) => (st === "delivered" || st === "sent" ? "✓" : st === "failed" || st === "skipped" ? "⚠" : "•");
  return (
    <section>
      <Label>Messages</Label>
      <ul className="mt-2 space-y-1.5 text-[0.82rem]">
        {logs.map((l) => (
          <li key={l.id} className="flex items-start gap-2">
            <span className={cn("w-3 shrink-0", MSG_TONE[l.status])}>{icon(l.status)}</span>
            <span className="min-w-0 flex-1">
              {who(l.recipient)} {l.eventLabel.toLowerCase()} — {l.channel === "whatsapp" ? "WhatsApp" : l.channel === "email" ? "Email" : "SMS"}
              {l.fallback ? " (fallback)" : ""}
              {l.errorMessage && ["failed", "skipped"].includes(l.status) ? <span className="block text-[0.74rem] text-muted-foreground">{l.errorMessage}</span> : null}
            </span>
            <span className={cn("shrink-0 text-[0.72rem] font-medium uppercase tracking-[0.06em]", MSG_TONE[l.status])}>
              {l.status === "scheduled" && l.scheduledFor
                ? `Scheduled ${new Date(l.scheduledFor).toLocaleString("en-GB", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}`
                : l.status}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

const MSG_TONE: Record<string, string> = {
  delivered: "text-emerald-700",
  sent: "text-emerald-700",
  failed: "text-destructive",
  skipped: "text-amber-700",
  scheduled: "text-muted-foreground",
  cancelled: "text-muted-foreground line-through",
};

const ACTION =
  "press inline-flex min-h-9 items-center gap-1.5 rounded-md border border-foreground/15 px-3 py-1.5 text-[0.82rem] hover:border-foreground/45";

function Action({
  children,
  onClick,
  primary,
  danger,
  disabled,
}: {
  children: ReactNode;
  onClick: () => void;
  primary?: boolean;
  danger?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        ACTION,
        primary && "border-foreground bg-foreground text-background hover:bg-foreground/88",
        danger && "border-destructive/35 text-destructive hover:border-destructive",
        "disabled:opacity-40",
      )}
    >
      {children}
    </button>
  );
}

const Label = ({ children }: { children: ReactNode }) => (
  <div className="text-[0.62rem] uppercase tracking-[0.2em] text-muted-foreground">{children}</div>
);

function StatusDot({ status }: { status: ApptStatus }) {
  const color: Record<ApptStatus, string> = {
    pending: "bg-amber-500",
    upcoming: "bg-foreground/50",
    arrived: "bg-bronze",
    "in-chair": "bg-foreground",
    completed: "bg-emerald-600",
    "no-show": "bg-destructive",
    cancelled: "bg-destructive/50",
  };
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-2 w-2 rounded-full", color[status])} />
      {STATUS_LABEL[status]}
    </span>
  );
}

/** Day + free times picker, shared by reschedule and new booking. */
export function TimePicker({
  audience,
  serviceIds,
  reference,
  date,
  onDate,
  time,
  onTime,
}: {
  audience: Audience;
  serviceIds: string[];
  reference?: string;
  date: string;
  onDate: (d: string) => void;
  time: number | null;
  onTime: (t: number | null) => void;
}) {
  const { pin } = useAdmin();
  const [slots, setSlots] = useState<Slot[] | null>(null);
  const [closed, setClosed] = useState(false);
  const key = serviceIds.join(",");
  useEffect(() => {
    if (!key) {
      setSlots([]);
      return;
    }
    let live = true;
    setSlots(null);
    adminAvailability({ data: { pin, date, audience, serviceIds: key.split(","), ...(reference ? { reference } : {}) } })
      .then((r) => {
        if (!live) return;
        setClosed(r.closed);
        setSlots(r.slots.filter((s) => s.reason !== "break"));
      })
      .catch(() => live && setSlots([]));
    return () => {
      live = false;
    };
  }, [pin, date, audience, key, reference]);

  return (
    <div>
      <input
        type="date"
        value={date}
        min={salonToday()}
        onChange={(e) => {
          onDate(e.target.value);
          onTime(null);
        }}
        className="w-full rounded-md border border-foreground/15 bg-background px-3 py-2 text-[0.9rem]"
      />
      <div className="mt-3 grid grid-cols-4 gap-1.5 sm:grid-cols-5">
        {slots === null ? (
          <span className="col-span-full text-[0.82rem] text-muted-foreground">Checking free times…</span>
        ) : closed ? (
          <span className="col-span-full text-[0.82rem] text-muted-foreground">The studio is closed that day.</span>
        ) : !slots.length ? (
          <span className="col-span-full text-[0.82rem] text-muted-foreground">Choose a service to see times.</span>
        ) : (
          slots.map((s) => (
            <button
              key={s.minute}
              disabled={!s.available}
              onClick={() => onTime(s.minute)}
              className={cn(
                "press rounded-md border px-1 py-1.5 text-[0.8rem] tabular-nums",
                time === s.minute
                  ? "border-foreground bg-foreground text-background"
                  : s.available
                    ? "border-foreground/15 hover:border-foreground/50"
                    : "border-transparent bg-foreground/[0.04] text-foreground/30 line-through",
              )}
              title={s.available ? undefined : s.reason ?? undefined}
            >
              {minuteLabel(s.minute)}
            </button>
          ))
        )}
      </div>
    </div>
  );
}

function Reschedule({
  booking,
  onCancel,
  onConfirm,
  busy,
}: {
  booking: AdminBooking;
  onCancel: () => void;
  onConfirm: (date: string, time: number) => void;
  busy: boolean;
}) {
  const [date, setDate] = useState(booking.date);
  const [time, setTime] = useState<number | null>(null);
  return (
    <section className="rounded-md border border-foreground/25 p-4">
      <Label>Reschedule</Label>
      <div className="mt-3">
        <TimePicker
          audience={booking.audience}
          serviceIds={booking.serviceIds}
          reference={booking.reference}
          date={date}
          onDate={setDate}
          time={time}
          onTime={setTime}
        />
      </div>
      {time != null ? (
        <p className="mt-3 text-[0.85rem]">
          Move {dateLabel(booking.date)} {minuteLabel(booking.time)} → <b>{dateLabel(date)} {minuteLabel(time)}</b>?
        </p>
      ) : null}
      <div className="mt-3 flex gap-2">
        <Action primary disabled={time == null || busy} onClick={() => time != null && onConfirm(date, time)}>
          Confirm move
        </Action>
        <Action onClick={onCancel}>Back</Action>
      </div>
    </section>
  );
}

function CancelForm({
  booking,
  busy,
  onBack,
  onConfirm,
}: {
  booking: AdminBooking;
  busy: boolean;
  onBack: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState(CANCEL_REASONS[0]!);
  const [other, setOther] = useState("");
  return (
    <section className="rounded-md border border-destructive/30 bg-destructive/[0.03] p-4">
      <Label>Cancel appointment</Label>
      <p className="mt-2 text-[0.88rem]">
        {booking.customer.name} · {booking.services.map((s) => s.name).join(", ")}
        <br />
        {dateLabel(booking.date, { weekday: "long", day: "numeric", month: "long" })} at {minuteLabel(booking.time)}
      </p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {CANCEL_REASONS.map((r) => (
          <button
            key={r}
            onClick={() => setReason(r)}
            className={cn("press rounded-full border px-3 py-1 text-[0.78rem]", reason === r ? "border-foreground bg-foreground text-background" : "border-foreground/15")}
          >
            {r}
          </button>
        ))}
      </div>
      {reason === "Other" ? (
        <input value={other} onChange={(e) => setOther(e.target.value)} placeholder="Reason" className="mt-2 w-full rounded-md border border-foreground/15 px-3 py-2 text-[0.9rem]" />
      ) : null}
      <p className="mt-3 text-[0.78rem] text-muted-foreground">The booking stays in history and can be restored.</p>
      <div className="mt-3 flex gap-2">
        <Action danger disabled={busy} onClick={() => onConfirm(reason === "Other" ? other || "Other" : reason)}>
          Cancel appointment
        </Action>
        <Action onClick={onBack}>Keep it</Action>
      </div>
    </section>
  );
}

function EditContact({
  booking,
  busy,
  onCancel,
  onSave,
}: {
  booking: AdminBooking;
  busy: boolean;
  onCancel: () => void;
  onSave: (c: { name: string; phone: string; email: string }) => void;
}) {
  const [c, setC] = useState({ name: booking.customer.name, phone: booking.customer.phone, email: booking.customer.email });
  const field = "w-full rounded-md border border-foreground/15 px-3 py-2 text-[0.9rem]";
  return (
    <div className="mt-3 space-y-2">
      <input className={field} value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} placeholder="Name" />
      <input className={field} value={c.phone} onChange={(e) => setC({ ...c, phone: e.target.value })} placeholder="Phone" inputMode="tel" />
      <input className={field} value={c.email} onChange={(e) => setC({ ...c, email: e.target.value })} placeholder="Email" />
      <div className="flex gap-2">
        <Action primary disabled={busy || !c.name.trim()} onClick={() => onSave(c)}>
          Save
        </Action>
        <Action onClick={onCancel}>Cancel</Action>
      </div>
    </div>
  );
}

function InternalNote({ booking, busy, onSave }: { booking: AdminBooking; busy: boolean; onSave: (n: string) => void }) {
  const [note, setNote] = useState(booking.note);
  useEffect(() => setNote(booking.note), [booking.note]);
  const dirty = note !== booking.note;
  return (
    <section>
      <Label>Internal note (staff only)</Label>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="e.g. Prefers a low fade"
        className="mt-2 w-full resize-none rounded-md border border-foreground/15 px-3 py-2 text-[0.88rem]"
      />
      {dirty ? (
        <div className="mt-1.5 flex gap-2">
          <Action primary disabled={busy} onClick={() => onSave(note)}>
            Save note
          </Action>
          <Action onClick={() => setNote(booking.note)}>Discard</Action>
        </div>
      ) : null}
    </section>
  );
}

function PaymentRow({ booking, busy, onSave }: { booking: AdminBooking; busy: boolean; onSave: (method: string, amount: number) => void }) {
  const [amount, setAmount] = useState(String(booking.amountPaid ?? booking.price));
  return (
    <section>
      <Label>Payment</Label>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
          inputMode="numeric"
          className="w-24 rounded-md border border-foreground/15 px-3 py-1.5 text-[0.88rem] tabular-nums"
          aria-label="Amount"
        />
        {(["cash", "upi", "card", "unpaid"] as const).map((m) => (
          <button
            key={m}
            disabled={busy}
            onClick={() => onSave(m, Number(amount || 0))}
            className={cn(
              "press rounded-full border px-3 py-1 text-[0.78rem] uppercase tracking-[0.06em]",
              booking.payment === m ? "border-foreground bg-foreground text-background" : "border-foreground/15",
            )}
          >
            {m}
          </button>
        ))}
      </div>
    </section>
  );
}

/* ── new booking / walk-in ─────────────────────────────────── */

const SOURCES = [
  { key: "walk-in", label: "Walk-in" },
  { key: "phone", label: "Phone" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "admin", label: "Other" },
] as const;

export function NewBookingDialog({
  open,
  onOpenChange,
  initialDate,
  initialTime,
  customer: presetCustomer,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initialDate?: string;
  initialTime?: number | null;
  customer?: { name: string; phone: string; email: string } | null;
  onCreated?: (reference: string) => void;
}) {
  const { pin } = useAdmin();
  const [audience, setAudience] = useState<Audience>("men");
  const [ids, setIds] = useState<string[]>([]);
  const [date, setDate] = useState(initialDate ?? salonToday());
  const [time, setTime] = useState<number | null>(initialTime ?? null);
  const [source, setSource] = useState<(typeof SOURCES)[number]["key"]>("walk-in");
  const [cust, setCust] = useState({ name: "", phone: "", email: "" });
  const [q, setQ] = useState("");
  const [matches, setMatches] = useState<AdminCustomer[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const first = useRef(true);

  useEffect(() => {
    if (!open) return;
    setDate(initialDate ?? salonToday());
    setTime(initialTime ?? null);
    setIds([]);
    setError("");
    setCust(presetCustomer ?? { name: "", phone: "", email: "" });
    setQ("");
    first.current = true;
  }, [open, initialDate, initialTime, presetCustomer]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return setMatches([]);
    const t = window.setTimeout(() => {
      adminCustomers({ data: { pin, q: term, page: 0 } })
        .then((r) => setMatches(r.customers.slice(0, 5)))
        .catch(() => setMatches([]));
    }, 250);
    return () => window.clearTimeout(t);
  }, [q, pin]);

  const menu = useMemo(() => menuFor(audience), [audience]);
  const chosen = menu.flatMap((c) => c.services).filter((s) => ids.includes(s.id));
  const total = chosen.reduce((n, s) => n + s.price, 0);
  const minutes = chosen.reduce((n, s) => n + s.minutes, 0);

  const create = async () => {
    if (!cust.name.trim() || cust.phone.replace(/\D/g, "").length < 10) return setError("Add the customer's name and a 10-digit phone.");
    if (!ids.length) return setError("Choose at least one service.");
    if (time == null) return setError("Choose a time.");
    setBusy(true);
    setError("");
    try {
      const r = (await adminUpsertBooking({
        data: {
          pin,
          reference: "new",
          insert: { audience, serviceIds: ids, date, time, customer: { name: cust.name.trim(), phone: cust.phone.trim(), email: cust.email.trim() }, source },
        },
      })) as { reference?: string };
      toast.success(`Booked ${cust.name.trim()} for ${minuteLabel(time)}.`);
      onCreated?.(r.reference ?? "");
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't create the booking.");
    } finally {
      setBusy(false);
    }
  };

  const field = "w-full rounded-md border border-foreground/15 px-3 py-2 text-[0.9rem]";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92svh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display text-[1.7rem] font-normal">New booking</DialogTitle>
          <DialogDescription>Walk-ins, phone and WhatsApp bookings appear in the calendar immediately.</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div>
            <Label>Customer</Label>
            {!presetCustomer ? (
              <div className="relative mt-2">
                <input className={field} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find an existing customer (name or phone)" />
                {matches.length ? (
                  <div className="absolute inset-x-0 top-full z-10 mt-1 rounded-md border border-hairline bg-background p-1 shadow-lg">
                    {matches.map((m) => (
                      <button
                        key={m.id}
                        onClick={() => {
                          setCust({ name: m.name, phone: m.phone, email: m.email });
                          setQ("");
                          setMatches([]);
                        }}
                        className="flex w-full justify-between rounded px-3 py-2 text-left text-[0.88rem] hover:bg-foreground/[0.04]"
                      >
                        {m.name} <span className="tabular-nums text-muted-foreground">{m.phone}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <input className={field} value={cust.name} onChange={(e) => setCust({ ...cust, name: e.target.value })} placeholder="Name" />
              <input className={field} value={cust.phone} onChange={(e) => setCust({ ...cust, phone: e.target.value })} placeholder="Phone" inputMode="tel" />
              <input className={field} value={cust.email} onChange={(e) => setCust({ ...cust, email: e.target.value })} placeholder="Email (optional)" />
            </div>
            <div className="mt-2 flex items-center gap-1.5 text-[0.75rem] text-muted-foreground">
              <UserPlus className="h-3.5 w-3.5" /> New numbers create a customer record automatically.
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label>Services</Label>
              <div className="flex gap-1">
                {(["men", "women"] as const).map((a) => (
                  <button
                    key={a}
                    onClick={() => {
                      setAudience(a);
                      setIds([]);
                      setTime(null);
                    }}
                    className={cn("press rounded-full border px-3 py-0.5 text-[0.75rem] capitalize", audience === a ? "border-foreground bg-foreground text-background" : "border-foreground/15")}
                  >
                    {a}
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-2 max-h-48 space-y-3 overflow-y-auto rounded-md border border-hairline p-3">
              {menu.map((c) => (
                <div key={c.id}>
                  <div className="text-[0.7rem] uppercase tracking-[0.16em] text-muted-foreground">{c.title}</div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {c.services.map((s) => {
                      const on = ids.includes(s.id);
                      return (
                        <button
                          key={s.id}
                          onClick={() => {
                            setIds((v) => (on ? v.filter((x) => x !== s.id) : [...v, s.id]));
                            setTime(null);
                          }}
                          className={cn("press rounded-full border px-3 py-1 text-[0.8rem]", on ? "border-foreground bg-foreground text-background" : "border-foreground/15 hover:border-foreground/40")}
                        >
                          {s.name} · {inr(s.price)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            {chosen.length ? (
              <div className="mt-1.5 text-[0.82rem] text-muted-foreground">
                {formatDuration(minutes)} · {inr(total)}
              </div>
            ) : null}
          </div>

          <div>
            <Label>Date & time</Label>
            <div className="mt-2">
              <TimePicker audience={audience} serviceIds={ids} date={date} onDate={setDate} time={time} onTime={setTime} />
            </div>
          </div>

          <div>
            <Label>Booked via</Label>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {SOURCES.map((s) => (
                <button
                  key={s.key}
                  onClick={() => setSource(s.key)}
                  className={cn("press rounded-full border px-3 py-1 text-[0.8rem]", source === s.key ? "border-foreground bg-foreground text-background" : "border-foreground/15")}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {error ? <p role="alert" className="shake text-[0.85rem] text-destructive">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Action onClick={() => onOpenChange(false)}>Cancel</Action>
            <Action primary disabled={busy} onClick={() => void create()}>
              {busy ? "Booking…" : "Create booking"}
            </Action>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── block time / close day ────────────────────────────────── */

const BLOCK_REASONS = ["Personal work", "Emergency", "Maintenance", "Walk-in reserved", "Staff unavailable", "Other"];
const CLOSE_REASONS = ["Holiday", "Personal leave", "Emergency", "Private event", "Maintenance"];

const timeOptions = (from = 8 * 60, to = 22 * 60, step = 15) => {
  const out: number[] = [];
  for (let m = from; m <= to; m += step) out.push(m);
  return out;
};

export function BlockTimeDialog({
  open,
  onOpenChange,
  initialDate,
  initialStart,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initialDate?: string;
  initialStart?: number;
  onSaved?: () => void;
}) {
  const { pin } = useAdmin();
  const [date, setDate] = useState(initialDate ?? salonToday());
  const [start, setStart] = useState(initialStart ?? 15 * 60);
  const [end, setEnd] = useState((initialStart ?? 15 * 60) + 60);
  const [kind, setKind] = useState<"block" | "break">("block");
  const [reason, setReason] = useState(BLOCK_REASONS[0]!);
  const [clashes, setClashes] = useState<{ reference: string; time: number; name: string }[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setDate(initialDate ?? salonToday());
    setStart(initialStart ?? 15 * 60);
    setEnd((initialStart ?? 15 * 60) + 60);
    setClashes([]);
    setError("");
  }, [open, initialDate, initialStart]);

  const save = async (confirm = false) => {
    if (end <= start) return setError("End must be after start.");
    setBusy(true);
    setError("");
    try {
      const r = await adminSaveBlock({ data: { pin, date, start, end, kind, reason, ...(confirm ? { confirm: true } : {}) } });
      if (!r.ok && "clashes" in r && r.clashes.length) return setClashes(r.clashes);
      if (!r.ok) return setError(("error" in r && r.error) || "Couldn't save.");
      toast.success(kind === "break" ? "Break added." : "Time blocked.");
      onSaved?.();
      onOpenChange(false);
    } catch {
      setError("Couldn't save. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const sel = "rounded-md border border-foreground/15 bg-background px-3 py-2 text-[0.9rem]";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-[1.6rem] font-normal">Block time</DialogTitle>
          <DialogDescription>Guests immediately see this period as unavailable.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-1.5">
            {(["block", "break"] as const).map((k) => (
              <button key={k} onClick={() => setKind(k)} className={cn("press rounded-full border px-3 py-1 text-[0.8rem]", kind === k ? "border-foreground bg-foreground text-background" : "border-foreground/15")}>
                {k === "block" ? "Block" : "One-day break"}
              </button>
            ))}
          </div>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={cn(sel, "w-full")} />
          <div className="grid grid-cols-2 gap-2">
            <select value={start} onChange={(e) => setStart(Number(e.target.value))} className={sel} aria-label="From">
              {timeOptions().map((m) => <option key={m} value={m}>{minuteLabel(m)}</option>)}
            </select>
            <select value={end} onChange={(e) => setEnd(Number(e.target.value))} className={sel} aria-label="Until">
              {timeOptions().map((m) => <option key={m} value={m}>{minuteLabel(m)}</option>)}
            </select>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {BLOCK_REASONS.map((r) => (
              <button key={r} onClick={() => setReason(r)} className={cn("press rounded-full border px-3 py-1 text-[0.78rem]", reason === r ? "border-foreground bg-foreground text-background" : "border-foreground/15")}>
                {r}
              </button>
            ))}
          </div>
          {clashes.length ? (
            <div className="rounded-md border border-amber-600/30 bg-amber-500/10 p-3 text-[0.85rem]">
              These bookings are inside that time:
              <ul className="mt-1 list-disc pl-5">
                {clashes.map((c) => <li key={c.reference}>{minuteLabel(c.time)} · {c.name}</li>)}
              </ul>
              They stay booked. Block anyway?
              <div className="mt-2 flex gap-2">
                <Action primary disabled={busy} onClick={() => void save(true)}>Block anyway</Action>
                <Action onClick={() => setClashes([])}>Change time</Action>
              </div>
            </div>
          ) : null}
          {error ? <p role="alert" className="text-[0.85rem] text-destructive">{error}</p> : null}
          {!clashes.length ? (
            <div className="flex justify-end gap-2">
              <Action onClick={() => onOpenChange(false)}>Cancel</Action>
              <Action primary disabled={busy} onClick={() => void save()}>{busy ? "Saving…" : "Save"}</Action>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function CloseDayDialog({
  open,
  onOpenChange,
  initialDate,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  initialDate?: string;
  onSaved?: () => void;
}) {
  const { pin } = useAdmin();
  const [date, setDate] = useState(initialDate ?? salonToday());
  const [reason, setReason] = useState(CLOSE_REASONS[0]!);
  const [existing, setExisting] = useState<AdminBooking[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setDate(initialDate ?? salonToday());
  }, [open, initialDate]);
  useEffect(() => {
    if (!open) return;
    setExisting(null);
    adminDay({ data: { pin, date } })
      .then((d) => setExisting(d.bookings.filter((b) => b.status !== "cancelled" && b.status !== "no-show")))
      .catch(() => setExisting([]));
  }, [open, date, pin]);

  const close = async () => {
    setBusy(true);
    try {
      await adminSaveException({ data: { pin, date, open: false, from: null, to: null, note: reason } });
      toast.success(`${dateLabel(date)} closed.`);
      onSaved?.();
      onOpenChange(false);
    } catch {
      toast.error("Couldn't close the day. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-[1.6rem] font-normal">Close a day</DialogTitle>
          <DialogDescription>Guests will see the day as closed and can't book it.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <input type="date" value={date} min={salonToday()} onChange={(e) => setDate(e.target.value)} className="w-full rounded-md border border-foreground/15 px-3 py-2 text-[0.9rem]" />
          <div className="flex flex-wrap gap-1.5">
            {CLOSE_REASONS.map((r) => (
              <button key={r} onClick={() => setReason(r)} className={cn("press rounded-full border px-3 py-1 text-[0.78rem]", reason === r ? "border-foreground bg-foreground text-background" : "border-foreground/15")}>
                {r}
              </button>
            ))}
          </div>
          {existing === null ? (
            <p className="text-[0.82rem] text-muted-foreground">Checking bookings…</p>
          ) : existing.length ? (
            <div className="rounded-md border border-amber-600/30 bg-amber-500/10 p-3 text-[0.85rem]">
              {existing.length} booking{existing.length > 1 ? "s" : ""} on this day will stay booked — contact or reschedule them:
              <ul className="mt-1 list-disc pl-5">
                {existing.map((b) => <li key={b.reference}>{minuteLabel(b.time)} · {b.customer.name}</li>)}
              </ul>
            </div>
          ) : (
            <p className="text-[0.82rem] text-muted-foreground">No bookings on this day.</p>
          )}
          <div className="flex justify-end gap-2">
            <Action onClick={() => onOpenChange(false)}>Cancel</Action>
            <Action danger disabled={busy} onClick={() => void close()}>{busy ? "Closing…" : `Close ${dateLabel(date)}`}</Action>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export { X };
