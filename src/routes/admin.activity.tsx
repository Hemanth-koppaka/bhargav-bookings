import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { AdminShell, Empty, TinyButton } from "@/components/admin";
import { LoadState } from "@/components/admin-ops";
import { useAdmin } from "@/lib/admin-store";
import { adminActivity, type ActivityEntry } from "@/lib/admin-ops.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/activity")({
  head: () => ({
    meta: [
      { title: "Activity — Hair by Bhargav" },
      { name: "description", content: "Every change made in the console, newest first." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ActivityScreen,
});

const FILTERS: { key: string; label: string }[] = [
  { key: "", label: "Everything" },
  { key: "booking", label: "Bookings" },
  { key: "customer", label: "Customers" },
  { key: "service", label: "Services" },
  { key: "category", label: "Categories" },
  { key: "settings", label: "Settings" },
  { key: "content", label: "Site content" },
  { key: "date", label: "Closures" },
  { key: "notification", label: "Messages" },
  { key: "export", label: "Exports" },
  { key: "security", label: "Security" },
];

const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });
const dayKey = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", {
    timeZone: "Asia/Kolkata",
    weekday: "long",
    day: "numeric",
    month: "long",
  });

function ActivityScreen() {
  const { pin, signOut } = useAdmin();
  const [entity, setEntity] = useState("");
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [list, setList] = useState<ActivityEntry[]>([]);
  const [before, setBefore] = useState<number | null>(null);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [unavailable, setUnavailable] = useState(false);
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => setTerm(q.trim()), 280);
    return () => window.clearTimeout(t);
  }, [q]);
  useEffect(() => setBefore(null), [entity, term]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    adminActivity({
      data: {
        pin,
        ...(entity ? { entity } : {}),
        ...(term ? { q: term } : {}),
        ...(before ? { before } : {}),
      },
    })
      .then((r) => {
        if (!live) return;
        setUnavailable(r.unavailable);
        setList((prev) => (before ? [...prev, ...r.entries] : r.entries));
        setMore(r.entries.length === 50);
        setError("");
      })
      .catch((e: unknown) => {
        if (!live) return;
        if (e instanceof Error && /session/i.test(e.message))
          return signOut("Your session ended. Please sign in again.");
        setError("Couldn't load activity.");
      })
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [pin, entity, term, before, signOut]);

  return (
    <AdminShell
      title="Activity"
      subtitle="Every change made in the console or by guests online, newest first."
    >
      <label className="flex h-11 items-center gap-2.5 rounded-md border border-foreground/15 bg-background px-3 focus-within:border-foreground/50">
        <Search className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search (booking ID, name, service…)"
          className="flex-1 bg-transparent text-[0.92rem] outline-none"
        />
      </label>
      <div className="-mx-1 mt-3 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setEntity(f.key)}
            className={cn(
              "press shrink-0 rounded-full border px-3 py-1 text-[0.78rem]",
              entity === f.key
                ? "border-foreground bg-foreground text-background"
                : "border-foreground/15",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="mt-4">
        <LoadState
          loading={loading && !list.length}
          error={error}
          onRetry={() => setBefore(null)}
        />
        {unavailable ? (
          <Empty title="The activity log appears once the Admin OS database update has been applied." />
        ) : null}
        {!loading && !error && !unavailable && !list.length ? (
          <Empty title="Nothing recorded yet." />
        ) : null}
        {list.length ? (
          <div className="overflow-hidden rounded-md border border-hairline bg-card">
            {list.map((e, i) => {
              const newDay = i === 0 || dayKey(list[i - 1]!.at) !== dayKey(e.at);
              const isOpen = open === e.id;
              return (
                <div key={e.id}>
                  {newDay ? (
                    <div className="border-b border-hairline bg-foreground/[0.025] px-4 py-1.5 text-[0.68rem] uppercase tracking-[0.16em] text-muted-foreground">
                      {dayKey(e.at)}
                    </div>
                  ) : null}
                  <button
                    onClick={() => setOpen(isOpen ? null : e.id)}
                    className="flex w-full items-start gap-3 border-b border-hairline px-4 py-2.5 text-left last:border-0 hover:bg-foreground/[0.02]"
                  >
                    <span className="w-16 shrink-0 pt-0.5 text-[0.75rem] tabular-nums text-muted-foreground">
                      {new Date(e.at).toLocaleTimeString("en-GB", {
                        timeZone: "Asia/Kolkata",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[0.88rem]">{e.summary}</span>
                      <span className="block text-[0.72rem] text-muted-foreground">
                        {e.actor === "guest"
                          ? "Guest online"
                          : e.actor === "system"
                            ? "System"
                            : "Admin"}{" "}
                        · {e.action}
                        {e.reason ? ` · ${e.reason}` : ""}
                      </span>
                      {isOpen ? (
                        <span className="mt-1 block text-[0.72rem] text-muted-foreground">
                          {when(e.at)} · #{e.id}
                          {e.entityId ? ` · ${e.entityId}` : ""}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </div>
              );
            })}
          </div>
        ) : null}
        {more ? (
          <div className="mt-4 flex justify-center">
            <TinyButton disabled={loading} onClick={() => setBefore(list[list.length - 1]!.id)}>
              {loading ? "Loading…" : "Load older"}
            </TinyButton>
          </div>
        ) : null}
      </div>
    </AdminShell>
  );
}
