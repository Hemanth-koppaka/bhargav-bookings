import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CalendarPlus, MessageCircle, Phone, Search } from "lucide-react";
import { AdminShell, Empty, StatusPill, TinyButton, inputClass } from "@/components/admin";
import { BookingDrawer, LoadState, NewBookingDialog, dateLabel, waLink } from "@/components/admin-ops";
import { useAdmin } from "@/lib/admin-store";
import { adminCustomer, adminCustomers, adminSaveCustomer, type AdminCustomer } from "@/lib/admin-data.functions";
import { inr, minuteLabel } from "@/lib/salon";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

export const Route = createFileRoute("/admin/customers")({
  validateSearch: (s: Record<string, unknown>): { id?: string } =>
    typeof s["id"] === "string" && /^[0-9a-f-]{36}$/i.test(s["id"]) ? { id: s["id"] } : {},
  head: () => ({
    meta: [
      { title: "Customers — Hair by Bhargav" },
      { name: "description", content: "Customer records, visits and notes." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Customers — Hair by Bhargav" },
      { property: "og:description", content: "Customer records." },
    ],
  }),
  component: CustomersScreen,
});

function CustomersScreen() {
  const { pin, signOut } = useAdmin();
  const { id } = Route.useSearch();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(0);
  const [list, setList] = useState<AdminCustomer[]>([]);
  const [more, setMore] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setTerm(q.trim());
      setPage(0);
    }, 280);
    return () => window.clearTimeout(t);
  }, [q]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    adminCustomers({ data: { pin, page, ...(term ? { q: term } : {}) } })
      .then((r) => {
        if (!live) return;
        setList((prev) => (page === 0 ? r.customers : [...prev, ...r.customers]));
        setMore(r.more);
        setUnavailable(r.unavailable);
        setError("");
      })
      .catch((e: unknown) => {
        if (!live) return;
        if (e instanceof Error && /session/i.test(e.message)) return signOut("Your session ended. Please sign in again.");
        setError("Couldn't load customers.");
      })
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [pin, term, page, version, signOut]);

  const open = (cid: string | null) => void navigate({ to: "/admin/customers", search: cid ? { id: cid } : {}, replace: true });

  return (
    <AdminShell title="Customers" subtitle="Created automatically from every booking, matched by phone number.">
      <label className="flex h-11 items-center gap-2.5 rounded-md border border-foreground/15 bg-background px-3 focus-within:border-foreground/50">
        <Search className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, phone or email" className="flex-1 bg-transparent text-[0.92rem] outline-none" />
      </label>

      <div className="mt-4">
        <LoadState loading={loading && !list.length} error={error} onRetry={() => setVersion((v) => v + 1)} />
        {unavailable ? (
          <Empty title="Customer records appear once the latest database update has been applied." />
        ) : !loading && !error && !list.length ? (
          <Empty title={term ? `No customers match “${term}”.` : "No customers yet. They're added with their first booking."} />
        ) : null}
        {list.length ? (
          <div className="overflow-hidden rounded-md border border-hairline bg-card">
            <div className="hidden grid-cols-[minmax(0,1fr)_8rem_4rem_6rem_7rem] gap-3 border-b border-hairline px-4 py-2 text-[0.62rem] uppercase tracking-[0.18em] text-muted-foreground md:grid">
              <span>Customer</span>
              <span>Phone</span>
              <span className="text-right">Visits</span>
              <span className="text-right">Spent</span>
              <span className="text-right">Last visit</span>
            </div>
            {list.map((c) => (
              <button
                key={c.id}
                onClick={() => open(c.id)}
                className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-hairline px-4 py-3 text-left last:border-0 hover:bg-foreground/[0.02] md:grid-cols-[minmax(0,1fr)_8rem_4rem_6rem_7rem]"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[0.92rem]">{c.name}</span>
                  <span className="block truncate text-[0.75rem] text-muted-foreground md:hidden">{c.phone}</span>
                  {c.favourite ? <span className="hidden truncate text-[0.75rem] text-muted-foreground md:block">Usually {c.favourite}</span> : null}
                </span>
                <span className="hidden text-[0.82rem] tabular-nums text-muted-foreground md:block">{c.phone}</span>
                <span className="text-right text-[0.85rem] tabular-nums">
                  {c.completed}
                  <span className="md:hidden"> visits</span>
                </span>
                <span className="hidden text-right text-[0.85rem] tabular-nums md:block">{inr(c.spend)}</span>
                <span className="hidden text-right text-[0.8rem] text-muted-foreground md:block">{c.lastVisit ? dateLabel(c.lastVisit, { day: "numeric", month: "short", year: "2-digit" }) : "—"}</span>
              </button>
            ))}
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

      <Profile id={id ?? null} onClose={() => open(null)} onChanged={() => setVersion((v) => v + 1)} />
    </AdminShell>
  );
}

function Profile({ id, onClose, onChanged }: { id: string | null; onClose: () => void; onChanged: () => void }) {
  const { pin } = useAdmin();
  const [data, setData] = useState<Awaited<ReturnType<typeof adminCustomer>> | null>(null);
  const [form, setForm] = useState({ name: "", phone: "", email: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const [drawer, setDrawer] = useState<string | null>(null);
  const [booking, setBooking] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!id) return setData(null);
    let live = true;
    adminCustomer({ data: { pin, id } })
      .then((r) => {
        if (!live) return;
        setData(r);
        if (r.customer) setForm({ name: r.customer.name, phone: r.customer.phone, email: r.customer.email, notes: r.customer.notes });
      })
      .catch(() => live && toast.error("Couldn't load this customer."));
    return () => {
      live = false;
    };
  }, [id, pin, tick]);

  const c = data?.customer ?? null;
  const dirty = c && (form.name !== c.name || form.phone !== c.phone || form.email !== c.email || form.notes !== c.notes);

  const save = async () => {
    if (!id) return;
    setSaving(true);
    try {
      const r = (await adminSaveCustomer({ data: { pin, id, ...form } })) as { ok?: boolean; error?: string };
      if (r && r.ok === false) return void toast.error(r.error ?? "Couldn't save.");
      toast.success("Customer saved.");
      setTick((t) => t + 1);
      onChanged();
    } catch {
      toast.error("Couldn't save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Sheet open={Boolean(id)} onOpenChange={(o) => !o && onClose()}>
        <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-[30rem]">
          <SheetHeader className="sticky top-0 z-10 border-b border-hairline bg-background/95 px-5 py-4 text-left backdrop-blur">
            <SheetTitle className="font-display text-[1.6rem] font-normal">{c?.name ?? "Customer"}</SheetTitle>
            <SheetDescription>{c ? `Customer since ${dateLabel(c.createdAt.slice(0, 10), { month: "long", year: "numeric" })}` : "Loading…"}</SheetDescription>
          </SheetHeader>
          {!c ? (
            <div className="p-5">
              <LoadState loading={!data} error={data && !data.customer ? "Customer not found." : ""} onRetry={() => setTick((t) => t + 1)} />
            </div>
          ) : (
            <div className="space-y-5 px-5 py-5">
              <div className="grid grid-cols-3 gap-2">
                {[
                  ["Visits", String(c.completed)],
                  ["Spent", inr(c.spend)],
                  ["No-shows", String(c.noShows)],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-md border border-hairline px-3 py-2.5">
                    <div className="text-[0.6rem] uppercase tracking-[0.18em] text-muted-foreground">{k}</div>
                    <div className="mt-1 font-display text-[1.4rem] leading-none tabular-nums">{v}</div>
                  </div>
                ))}
              </div>
              {c.favourite ? <p className="text-[0.85rem] text-muted-foreground">Most booked: {c.favourite}</p> : null}

              <div className="flex flex-wrap gap-2">
                <TinyButton tone="primary" onClick={() => setBooking(true)}>
                  <CalendarPlus className="h-4 w-4" /> Book again
                </TinyButton>
                <a href={`tel:${c.phone}`} className="press inline-flex min-h-9 items-center gap-1.5 rounded-md border border-foreground/15 px-3 text-[0.8rem]">
                  <Phone className="h-4 w-4" /> Call
                </a>
                <a href={waLink(c.phone)} target="_blank" rel="noreferrer" className="press inline-flex min-h-9 items-center gap-1.5 rounded-md border border-foreground/15 px-3 text-[0.8rem]">
                  <MessageCircle className="h-4 w-4" /> WhatsApp
                </a>
              </div>

              <div className="space-y-2">
                <input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Name" />
                <input className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone" inputMode="tel" />
                <input className={inputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email" />
                <div>
                  <div className="mb-1 text-[0.62rem] uppercase tracking-[0.2em] text-muted-foreground">Notes (staff only)</div>
                  <textarea
                    className={inputClass + " resize-none"}
                    rows={3}
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                    placeholder="Preferences, allergies, usual style…"
                  />
                </div>
                {dirty ? (
                  <div className="flex gap-2">
                    <TinyButton tone="primary" disabled={saving || !form.name.trim()} onClick={() => void save()}>
                      {saving ? "Saving…" : "Save changes"}
                    </TinyButton>
                    <TinyButton onClick={() => setForm({ name: c.name, phone: c.phone, email: c.email, notes: c.notes })}>Discard</TinyButton>
                  </div>
                ) : null}
              </div>

              <div>
                <div className="text-[0.62rem] uppercase tracking-[0.2em] text-muted-foreground">Appointments</div>
                {data!.bookings.length ? (
                  <ul className="mt-2 divide-y divide-hairline rounded-md border border-hairline">
                    {data!.bookings.map((b) => (
                      <li key={b.reference}>
                        <button onClick={() => setDrawer(b.reference)} className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-foreground/[0.02]">
                          <span className="w-28 shrink-0 text-[0.8rem] tabular-nums text-muted-foreground">
                            {dateLabel(b.date, { day: "numeric", month: "short", year: "2-digit" })} · {minuteLabel(b.time)}
                          </span>
                          <span className="min-w-0 flex-1 truncate text-[0.85rem]">{b.services.map((s) => s.name).join(", ")}</span>
                          <StatusPill status={b.status} />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-[0.85rem] text-muted-foreground">No appointments yet.</p>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
      <BookingDrawer
        reference={drawer}
        onClose={() => setDrawer(null)}
        onChanged={() => {
          setTick((t) => t + 1);
          onChanged();
        }}
      />
      <NewBookingDialog
        open={booking}
        onOpenChange={setBooking}
        customer={c ? { name: c.name, phone: c.phone, email: c.email } : null}
        onCreated={() => {
          setTick((t) => t + 1);
          onChanged();
        }}
      />
    </>
  );
}
