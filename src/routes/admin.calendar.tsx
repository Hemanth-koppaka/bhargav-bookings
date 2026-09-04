import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AdminShell, Panel, StatusPill } from "@/components/admin";
import { useAdmin, todayISO } from "@/lib/admin-store";
import {
  OPEN_MINUTE,
  CLOSE_MINUTE,
  SLOT_MINUTES,
  calendarDays,
  formatLongDate,
  isClosed,
  minuteLabel,
} from "@/lib/salon";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/calendar")({
  head: () => ({
    meta: [
      { title: "Calendar — Hair by Bhargav" },
      { name: "description", content: "Day-by-day chair timeline for the salon." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Calendar — Hair by Bhargav" },
      { property: "og:description", content: "Day-by-day chair timeline." },
    ],
  }),
  component: CalendarScreen,
});

function CalendarScreen() {
  const { byDate } = useAdmin();
  const [iso, setIso] = useState(todayISO());
  const days = calendarDays(28);
  const list = byDate(iso).filter((a) => a.meta.status !== "cancelled");
  const closed = isClosed(iso);

  const rows: { minute: number; label: string }[] = [];
  for (let m = OPEN_MINUTE; m < CLOSE_MINUTE; m += SLOT_MINUTES) {
    rows.push({ minute: m, label: minuteLabel(m) });
  }

  return (
    <AdminShell title="Calendar" subtitle={formatLongDate(iso)}>
      <div className="-mx-6 flex gap-2 overflow-x-auto px-6 pb-2">
        {days.map((d) => {
          const count = byDate(d.iso).filter((a) => a.meta.status !== "cancelled").length;
          return (
            <button
              key={d.iso}
              onClick={() => setIso(d.iso)}
              className={cn(
                "flex w-16 shrink-0 flex-col items-center border px-2 py-3 transition-colors",
                iso === d.iso
                  ? "border-foreground bg-foreground text-background"
                  : d.selectable
                    ? "border-hairline hover:border-foreground/50"
                    : "border-hairline text-foreground/30",
              )}
            >
              <span className="text-[0.55rem] uppercase tracking-[0.18em]">
                {d.date.toLocaleDateString("en-GB", { weekday: "short" })}
              </span>
              <span className="mt-1 font-display text-xl leading-none">{d.date.getDate()}</span>
              <span className="mt-1.5 text-[0.55rem]">
                {d.selectable ? (count ? `${count}` : "—") : "Closed"}
              </span>
            </button>
          );
        })}
      </div>

      <Panel className="mt-6 p-0">
        {closed ? (
          <p className="py-16 text-center text-sm text-muted-foreground">
            The salon is closed on Tuesdays.
          </p>
        ) : (
          <div className="divide-y divide-hairline">
            {rows.map((r) => {
              const here = list.filter(
                (a) => a.time <= r.minute && r.minute < a.time + a.slots * SLOT_MINUTES,
              );
              return (
                <div key={r.minute} className="grid grid-cols-[5rem_minmax(0,1fr)] gap-4 px-5 py-3">
                  <div className="eyebrow pt-1">{r.label}</div>
                  <div className="flex flex-col gap-2">
                    {here.length ? (
                      here.map((a) => (
                        <div
                          key={a.reference + r.minute}
                          className={cn(
                            "flex items-center justify-between gap-3 border-l-2 bg-secondary/60 px-3 py-2",
                            a.time === r.minute ? "border-accent" : "border-hairline opacity-60",
                          )}
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm">{a.customer.name}</div>
                            <div className="truncate text-[0.65rem] text-muted-foreground">
                              {a.services.map((s) => s.name).join(" · ")}
                            </div>
                          </div>
                          <StatusPill status={a.meta.status} />
                        </div>
                      ))
                    ) : (
                      <div className="h-6 border-l-2 border-hairline/60" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </AdminShell>
  );
}
