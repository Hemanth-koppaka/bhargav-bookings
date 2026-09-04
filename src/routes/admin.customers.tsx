import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AdminShell, Panel, StatusPill, inputClass } from "@/components/admin";
import { customersFrom, useAdmin } from "@/lib/admin-store";
import { formatLongDate, inr, minuteLabel } from "@/lib/salon";

export const Route = createFileRoute("/admin/customers")({
  head: () => ({
    meta: [
      { title: "Clients — Hair by Bhargav" },
      { name: "description", content: "Client history, spend and visit frequency." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Clients — Hair by Bhargav" },
      { property: "og:description", content: "Client history and spend." },
    ],
  }),
  component: CustomersScreen,
});

function CustomersScreen() {
  const { appointments } = useAdmin();
  const [q, setQ] = useState("");
  const [openKey, setOpenKey] = useState<string | null>(null);

  const records = useMemo(() => customersFrom(appointments), [appointments]);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle
      ? records.filter((r) => (r.name + r.phone).toLowerCase().includes(needle))
      : records;
  }, [records, q]);

  return (
    <AdminShell title="Clients" subtitle={`${records.length} on record`}>
      <input
        className={inputClass}
        placeholder="Search by name or mobile"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />

      <div className="mt-6 flex flex-col gap-3">
        {list.length ? (
          list.map((r) => (
            <Panel key={r.key} className="p-0">
              <button
                type="button"
                onClick={() => setOpenKey((k) => (k === r.key ? null : r.key))}
                className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left"
              >
                <div className="min-w-0">
                  <div className="font-display text-2xl leading-none">{r.name}</div>
                  <div className="mt-2 text-xs text-muted-foreground">{r.phone || "No number"}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm tabular-nums">{inr(r.spend)}</div>
                  <div className="eyebrow mt-1.5">
                    {r.visits} visit{r.visits === 1 ? "" : "s"}
                  </div>
                </div>
              </button>

              {openKey === r.key ? (
                <div className="border-t border-hairline px-5 py-4">
                  {r.lastVisit ? (
                    <div className="eyebrow">Last visit · {formatLongDate(r.lastVisit)}</div>
                  ) : (
                    <div className="eyebrow">No completed visits yet</div>
                  )}
                  <div className="mt-4 flex flex-col gap-3">
                    {r.appointments.map((a) => (
                      <div key={a.reference} className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <div className="text-sm">
                            {formatLongDate(a.date)} · {minuteLabel(a.time)}
                          </div>
                          <div className="truncate text-xs text-muted-foreground">
                            {a.services.map((s) => s.name).join(" · ")}
                          </div>
                        </div>
                        <StatusPill status={a.meta.status} />
                      </div>
                    ))}
                  </div>
                  <div className="mt-5 flex gap-4 text-xs text-muted-foreground">
                    <a className="border-b border-foreground/25 pb-0.5" href={`tel:${r.phone}`}>
                      Call
                    </a>
                    <a
                      className="border-b border-foreground/25 pb-0.5"
                      href={`https://wa.me/${r.phone.replace(/\D/g, "")}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      WhatsApp
                    </a>
                  </div>
                </div>
              ) : null}
            </Panel>
          ))
        ) : (
          <p className="py-20 text-center text-sm text-muted-foreground">No clients yet.</p>
        )}
      </div>
    </AdminShell>
  );
}
