import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AdminShell, Panel, TinyButton, inputClass } from "@/components/admin";
import { ApptRow } from "./admin.index";
import { useAdmin, todayISO, type ApptStatus, STATUS_LABEL } from "@/lib/admin-store";
import { formatLongDate } from "@/lib/salon";

export const Route = createFileRoute("/admin/appointments")({
  head: () => ({
    meta: [
      { title: "All bookings — Hair by Bhargav" },
      { name: "description", content: "Search, filter and manage every appointment." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "All bookings — Hair by Bhargav" },
      { property: "og:description", content: "Search and manage every appointment." },
    ],
  }),
  component: AppointmentsScreen,
});

const FILTERS = ["all", "upcoming", "arrived", "in-chair", "completed", "no-show", "cancelled"] as const;

function AppointmentsScreen() {
  const { appointments } = useAdmin();
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>("all");
  const [scope, setScope] = useState<"upcoming" | "past" | "all">("upcoming");

  const today = todayISO();

  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return appointments
      .filter((a) => (filter === "all" ? true : a.meta.status === (filter as ApptStatus)))
      .filter((a) => (scope === "all" ? true : scope === "upcoming" ? a.date >= today : a.date < today))
      .filter((a) =>
        !needle
          ? true
          : [a.customer.name, a.customer.phone, a.reference, ...a.services.map((s) => s.name)]
              .join(" ")
              .toLowerCase()
              .includes(needle),
      );
  }, [appointments, q, filter, scope, today]);

  const grouped = useMemo(() => {
    const map = new Map<string, typeof list>();
    for (const a of list) map.set(a.date, [...(map.get(a.date) ?? []), a]);
    return [...map.entries()];
  }, [list]);

  return (
    <AdminShell title="Bookings" subtitle={`${list.length} shown`}>
      <input
        className={inputClass}
        placeholder="Search name, mobile, reference or service"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      <div className="mt-5 flex flex-wrap gap-2">
        {(["upcoming", "past", "all"] as const).map((s) => (
          <TinyButton key={s} active={scope === s} onClick={() => setScope(s)}>
            {s}
          </TinyButton>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <TinyButton key={f} active={filter === f} onClick={() => setFilter(f)}>
            {f === "all" ? "All" : STATUS_LABEL[f as ApptStatus]}
          </TinyButton>
        ))}
      </div>

      <div className="mt-6 flex flex-col gap-6">
        {grouped.length ? (
          grouped.map(([date, items]) => (
            <Panel key={date} className="p-0">
              <div className="border-b border-hairline px-5 py-4">
                <div className="eyebrow">{formatLongDate(date)}</div>
              </div>
              <div className="px-5">
                {items.map((a) => (
                  <ApptRow key={a.reference} a={a} />
                ))}
              </div>
            </Panel>
          ))
        ) : (
          <p className="py-20 text-center text-sm text-muted-foreground">
            No appointments match this view.
          </p>
        )}
      </div>
    </AdminShell>
  );
}
