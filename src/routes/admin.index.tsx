import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AdminShell, Panel, Stat, StatusPill, TinyButton, inputClass } from "@/components/admin";
import {
  todayISO,
  isLive,
  useAdmin,
  type ApptStatus,
  type Appointment,
} from "@/lib/admin-store";
import {
  OPEN_MINUTE,
  CLOSE_MINUTE,
  SLOT_MINUTES,
  formatLongDate,
  inr,
  minuteLabel,
  menuFor,
  type Audience,
} from "@/lib/salon";

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

const NEXT: Record<ApptStatus, ApptStatus | null> = {
  upcoming: "arrived",
  arrived: "in-chair",
  "in-chair": "completed",
  completed: null,
  "no-show": null,
  cancelled: null,
};

export function ApptRow({ a }: { a: Appointment }) {
  const { setStatus, setPayment, setStaff, staff } = useAdmin();
  const [open, setOpen] = useState(false);
  const next = NEXT[a.meta.status];
  const assigned = staff.find((s) => s.id === a.meta.staffId);

  return (
    <div className="border-b border-hairline last:border-0">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="grid w-full grid-cols-[4.5rem_minmax(0,1fr)_auto] items-start gap-4 py-4 text-left"
      >
        <div>
          <div className="font-display text-xl leading-none">{minuteLabel(a.time)}</div>
          <div className="eyebrow mt-1.5">{a.slots * SLOT_MINUTES}m</div>
        </div>
        <div className="min-w-0">
          <div className="truncate text-[0.95rem]">{a.customer.name}</div>
          <div className="mt-1 truncate text-xs text-muted-foreground">
            {a.services.map((s) => s.name).join(" · ") || "Appointment"}
          </div>
          <div className="mt-1.5 text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
            {a.reference} · {a.source === "walk-in" ? "Walk-in" : "Online"}
            {assigned ? ` · ${assigned.name}` : ""}
          </div>
        </div>
        <div className="flex flex-col items-end gap-2">
          <StatusPill status={a.meta.status} />
          <span className="text-sm tabular-nums">{inr(a.meta.amount ?? a.total)}</span>
        </div>
      </button>

      {open ? (
        <div className="pb-5">
          <div className="flex flex-wrap gap-2">
            {next ? (
              <TinyButton onClick={() => setStatus(a.reference, next)}>
                Mark {next.replace("-", " ")}
              </TinyButton>
            ) : null}
            {isLive(a.meta.status) ? (
              <TinyButton tone="danger" onClick={() => setStatus(a.reference, "no-show")}>
                No show
              </TinyButton>
            ) : null}
            {a.meta.status !== "upcoming" ? (
              <TinyButton onClick={() => setStatus(a.reference, "upcoming")}>Reset</TinyButton>
            ) : null}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {(["cash", "upi", "card", "unpaid"] as const).map((p) => (
              <TinyButton
                key={p}
                active={a.meta.payment === p}
                onClick={() => setPayment(a.reference, p, a.meta.amount ?? a.total)}
              >
                {p}
              </TinyButton>
            ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {staff
              .filter((s) => s.active)
              .map((s) => (
                <TinyButton
                  key={s.id}
                  active={a.meta.staffId === s.id}
                  onClick={() => setStaff(a.reference, a.meta.staffId === s.id ? null : s.id)}
                >
                  {s.name}
                </TinyButton>
              ))}
          </div>

          <div className="mt-4 flex flex-wrap gap-4 text-xs text-muted-foreground">
            <a className="border-b border-foreground/25 pb-0.5" href={`tel:${a.customer.phone}`}>
              Call {a.customer.phone}
            </a>
            <a
              className="border-b border-foreground/25 pb-0.5"
              href={`https://wa.me/${a.customer.phone.replace(/\D/g, "")}`}
              target="_blank"
              rel="noreferrer"
            >
              WhatsApp
            </a>
          </div>
          {a.customer.notes ? (
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              Note — {a.customer.notes}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function TodayScreen() {
  const { byDate, addWalkIn, appointments } = useAdmin();
  const iso = todayISO();
  const today = byDate(iso);
  const [walkOpen, setWalkOpen] = useState(false);

  const stats = useMemo(() => {
    const live = today.filter((a) => isLive(a.meta.status));
    const done = today.filter((a) => a.meta.status === "completed");
    const takings = done.reduce((n, a) => n + (a.meta.amount ?? a.total), 0);
    const booked = today
      .filter((a) => a.meta.status !== "cancelled")
      .reduce((n, a) => n + a.slots * SLOT_MINUTES, 0);
    const capacity = CLOSE_MINUTE - OPEN_MINUTE;
    return {
      live: live.length,
      done: done.length,
      takings,
      occupancy: Math.min(100, Math.round((booked / capacity) * 100)),
      expected: today
        .filter((a) => a.meta.status !== "cancelled")
        .reduce((n, a) => n + (a.meta.amount ?? a.total), 0),
    };
  }, [today]);

  const upNext = today.find((a) => isLive(a.meta.status));

  return (
    <AdminShell
      title="Today"
      subtitle={formatLongDate(iso)}
      right={
        <button
          onClick={() => setWalkOpen((v) => !v)}
          className="label-caps shrink-0 border border-foreground/25 px-4 py-3 transition-colors hover:border-foreground"
        >
          {walkOpen ? "Close" : "Walk-in"}
        </button>
      }
    >
      {walkOpen ? <WalkInForm onDone={() => setWalkOpen(false)} add={addWalkIn} iso={iso} /> : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="In salon" value={String(stats.live)} hint="Awaiting or in chair" />
        <Stat label="Completed" value={String(stats.done)} />
        <Stat label="Collected" value={inr(stats.takings)} hint={`Expected ${inr(stats.expected)}`} />
        <Stat label="Chair load" value={`${stats.occupancy}%`} hint="Of 10 open hours" />
      </div>

      {upNext ? (
        <Panel className="mt-6 border-accent/50 bg-accent/10">
          <div className="eyebrow">Up next</div>
          <div className="mt-3 flex items-end justify-between gap-4">
            <div className="min-w-0">
              <div className="font-display text-3xl leading-none">{upNext.customer.name}</div>
              <div className="mt-2 truncate text-xs text-muted-foreground">
                {upNext.services.map((s) => s.name).join(" · ")}
              </div>
            </div>
            <div className="font-display text-3xl leading-none">{minuteLabel(upNext.time)}</div>
          </div>
        </Panel>
      ) : null}

      <Panel className="mt-6 p-0">
        <div className="border-b border-hairline px-5 py-4">
          <div className="eyebrow">Today's book — {today.length} appointment{today.length === 1 ? "" : "s"}</div>
        </div>
        <div className="px-5">
          {today.length ? (
            today.map((a) => <ApptRow key={a.reference} a={a} />)
          ) : (
            <p className="py-14 text-center text-sm text-muted-foreground">
              Nothing booked today yet.
            </p>
          )}
        </div>
      </Panel>

      <p className="mt-6 text-[0.7rem] text-muted-foreground">
        {appointments.length} appointment{appointments.length === 1 ? "" : "s"} on record.
      </p>
    </AdminShell>
  );
}

function WalkInForm({
  onDone,
  add,
  iso,
}: {
  onDone: () => void;
  add: ReturnType<typeof useAdmin>["addWalkIn"];
  iso: string;
}) {
  const [audience, setAudience] = useState<Audience>("women");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [serviceId, setServiceId] = useState("");

  const options = useMemo(() => menuFor(audience).flatMap((c) => c.services), [audience]);
  const now = new Date();
  const minute =
    Math.max(OPEN_MINUTE, Math.round((now.getHours() * 60 + now.getMinutes()) / 30) * 30);

  return (
    <Panel className="mb-6">
      <div className="eyebrow">New walk-in · {minuteLabel(minute)}</div>
      <div className="mt-4 flex gap-2">
        {(["women", "men"] as const).map((a) => (
          <TinyButton key={a} active={audience === a} onClick={() => setAudience(a)}>
            {a}
          </TinyButton>
        ))}
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <input className={inputClass} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <input className={inputClass} placeholder="Mobile" value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      <select
        className={inputClass + " mt-4"}
        value={serviceId}
        onChange={(e) => setServiceId(e.target.value)}
      >
        <option value="">Select a service</option>
        {options.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} — {inr(s.price)}
          </option>
        ))}
      </select>
      <div className="mt-6 flex gap-3">
        <button
          type="button"
          disabled={!name.trim() || !serviceId}
          onClick={() => {
            add({
              audience,
              serviceIds: [serviceId],
              date: iso,
              time: minute,
              customer: { name: name.trim(), phone: phone.trim(), email: "" },
            });
            onDone();
          }}
          className="label-caps flex-1 bg-foreground px-5 py-3.5 text-background disabled:bg-foreground/25"
        >
          Add to today
        </button>
        <TinyButton onClick={onDone}>Cancel</TinyButton>
      </div>
    </Panel>
  );
}
