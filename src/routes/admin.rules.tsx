import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { AdminShell, Panel, TinyButton, inputClass } from "@/components/admin";
import { LoadState, useAdminData } from "@/components/admin-ops";
import { useAdmin } from "@/lib/admin-store";
import { adminGetRules, adminSaveRules } from "@/lib/admin-ops.functions";
import type { BookingRules } from "@/lib/engine.server";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/rules")({
  head: () => ({
    meta: [
      { title: "Booking rules — Hair by Bhargav" },
      { name: "description", content: "How and when guests can book, cancel and reschedule." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: RulesScreen,
});

const NOTICE = [0, 15, 30, 60, 120, 180, 240, 1440];
const DEADLINES = [0, 30, 60, 120, 180, 240, 360, 720, 1440, 2880];
const ADVANCE = [7, 14, 21, 30, 45, 56, 60, 90, 120, 180];

const span = (m: number) =>
  m === 0
    ? "No limit"
    : m < 60
      ? `${m} min`
      : m % 1440 === 0
        ? `${m / 1440} day${m > 1440 ? "s" : ""}`
        : `${m / 60} hr${m > 60 ? "s" : ""}`;

function RulesScreen() {
  const { pin } = useAdmin();
  const { data, loading, error, reload } = useAdminData(
    (p) => adminGetRules({ data: { pin: p } }),
    [],
  );
  const [r, setR] = useState<BookingRules | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data) setR(data.rules);
  }, [data]);

  const dirty = Boolean(r && data && JSON.stringify(r) !== JSON.stringify(data.rules));
  const set = <K extends keyof BookingRules>(k: K, v: BookingRules[K]) =>
    setR((cur) => (cur ? { ...cur, [k]: v } : cur));

  const save = async () => {
    if (!r) return;
    if (!r.pauseMessage.trim())
      return void toast.error("Add the message guests see while bookings are paused.");
    setBusy(true);
    try {
      const res = await adminSaveRules({
        data: { pin, rules: { ...r, pauseMessage: r.pauseMessage.trim() } },
      });
      if (!res.ok) return void toast.error(res.error);
      toast.success("Booking rules saved. They apply immediately.");
      reload();
    } catch {
      toast.error("Couldn't save. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminShell
      title="Booking rules"
      subtitle="The booking engine checks every guest and staff booking against these."
      right={
        dirty ? (
          <div className="flex gap-2">
            <TinyButton onClick={() => data && setR(data.rules)}>Discard</TinyButton>
            <TinyButton tone="primary" disabled={busy} onClick={() => void save()}>
              {busy ? "Saving…" : "Save rules"}
            </TinyButton>
          </div>
        ) : null
      }
    >
      <LoadState loading={loading && !r} error={error} onRetry={reload} />
      {r ? (
        <div className="space-y-4 pb-24 lg:pb-0">
          <Panel className={cn(!r.accepting && "border-amber-600/40 bg-amber-500/[0.06]")}>
            <Row
              title="Online bookings"
              hint={
                r.accepting
                  ? "Guests can book online."
                  : "Paused — guests see the message below. Staff can still book."
              }
            >
              <Toggle
                on={r.accepting}
                onChange={(v) => set("accepting", v)}
                labels={["Paused", "Accepting"]}
              />
            </Row>
            {!r.accepting ? (
              <textarea
                className={cn(inputClass, "mt-3 resize-none")}
                rows={2}
                maxLength={240}
                value={r.pauseMessage}
                onChange={(e) => set("pauseMessage", e.target.value)}
              />
            ) : null}
          </Panel>

          <Panel>
            <h2 className="font-display text-[1.35rem]">Times offered</h2>
            <div className="mt-3 divide-y divide-hairline">
              <Row title="Start times every" hint="Spacing of the times guests can choose.">
                <Choice
                  value={r.slotInterval}
                  options={[15, 30, 45, 60]}
                  label={(v) => `${v} min`}
                  onChange={(v) => set("slotInterval", v as BookingRules["slotInterval"])}
                />
              </Row>
              <Row title="Minimum notice" hint="How soon a same-day booking can start.">
                <Select
                  value={r.minNoticeMinutes}
                  options={NOTICE}
                  label={(v) => (v ? span(v) : "None")}
                  onChange={(v) => set("minNoticeMinutes", v)}
                />
              </Row>
              <Row title="Book up to" hint="How far ahead guests can book.">
                <Select
                  value={r.maxAdvanceDays}
                  options={ADVANCE}
                  label={(v) => `${v} days`}
                  onChange={(v) => set("maxAdvanceDays", v)}
                />
              </Row>
              <Row title="Same-day bookings">
                <Toggle on={r.allowSameDay} onChange={(v) => set("allowSameDay", v)} />
              </Row>
            </div>
          </Panel>

          <Panel>
            <h2 className="font-display text-[1.35rem]">Services per booking</h2>
            <div className="mt-3 divide-y divide-hairline">
              <Row title="Several services in one booking">
                <Toggle on={r.allowMultiple} onChange={(v) => set("allowMultiple", v)} />
              </Row>
              {r.allowMultiple ? (
                <Row title="Most services per booking">
                  <Select
                    value={r.maxServices}
                    options={[2, 3, 4, 5, 6, 8, 10]}
                    label={(v) => String(v)}
                    onChange={(v) => set("maxServices", v)}
                  />
                </Row>
              ) : null}
            </div>
          </Panel>

          <Panel>
            <h2 className="font-display text-[1.35rem]">Changes by guests</h2>
            <div className="mt-3 divide-y divide-hairline">
              <Row title="Guests can cancel online">
                <Toggle on={r.customerCancel} onChange={(v) => set("customerCancel", v)} />
              </Row>
              {r.customerCancel ? (
                <Row title="Cancel until" hint="Before the appointment starts.">
                  <Select
                    value={r.cancelDeadlineMinutes}
                    options={DEADLINES}
                    label={(v) => (v ? `${span(v)} before` : "Any time")}
                    onChange={(v) => set("cancelDeadlineMinutes", v)}
                  />
                </Row>
              ) : null}
              <Row title="Guests can reschedule online">
                <Toggle on={r.customerReschedule} onChange={(v) => set("customerReschedule", v)} />
              </Row>
              {r.customerReschedule ? (
                <>
                  <Row title="Reschedule until">
                    <Select
                      value={r.rescheduleDeadlineMinutes}
                      options={DEADLINES}
                      label={(v) => (v ? `${span(v)} before` : "Any time")}
                      onChange={(v) => set("rescheduleDeadlineMinutes", v)}
                    />
                  </Row>
                  <Row title="Reschedules per booking">
                    <Select
                      value={r.maxReschedules}
                      options={[1, 2, 3, 4, 5]}
                      label={(v) => String(v)}
                      onChange={(v) => set("maxReschedules", v)}
                    />
                  </Row>
                </>
              ) : null}
            </div>
          </Panel>
          <p className="text-[0.75rem] text-muted-foreground">
            Staff bookings from the console skip online-only limits (notice, how far ahead, pauses)
            but never allow two appointments at once.
          </p>
        </div>
      ) : null}

      {dirty ? (
        <div className="fixed inset-x-0 bottom-[4.25rem] z-30 border-t border-hairline bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[0.82rem] text-muted-foreground">Unsaved changes</span>
            <TinyButton tone="primary" disabled={busy} onClick={() => void save()}>
              {busy ? "Saving…" : "Save rules"}
            </TinyButton>
          </div>
        </div>
      ) : null}
    </AdminShell>
  );
}

function Row({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <div className="text-[0.92rem]">{title}</div>
        {hint ? <div className="text-[0.75rem] text-muted-foreground">{hint}</div> : null}
      </div>
      {children}
    </div>
  );
}

function Toggle({
  on,
  onChange,
  labels = ["Off", "On"],
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  labels?: [string, string];
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="press flex items-center gap-2.5 text-[0.82rem] text-muted-foreground"
    >
      {on ? labels[1] : labels[0]}
      <span
        className={cn(
          "relative h-6 w-11 rounded-full transition-colors",
          on ? "bg-foreground" : "bg-foreground/15",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition-transform",
            on ? "translate-x-[1.375rem]" : "translate-x-0.5",
          )}
        />
      </span>
    </button>
  );
}

function Choice({
  value,
  options,
  label,
  onChange,
}: {
  value: number;
  options: number[];
  label: (v: number) => string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex rounded-md border border-foreground/15 p-0.5">
      {options.map((o) => (
        <button
          key={o}
          type="button"
          onClick={() => onChange(o)}
          className={cn(
            "rounded px-3 py-1.5 text-[0.8rem] tabular-nums",
            value === o ? "bg-foreground text-background" : "text-muted-foreground",
          )}
        >
          {label(o)}
        </button>
      ))}
    </div>
  );
}

function Select({
  value,
  options,
  label,
  onChange,
}: {
  value: number;
  options: number[];
  label: (v: number) => string;
  onChange: (v: number) => void;
}) {
  const all = options.includes(value) ? options : [...options, value].sort((a, b) => a - b);
  return (
    <select
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="rounded-md border border-foreground/15 bg-background px-3 py-1.5 text-[0.85rem]"
    >
      {all.map((o) => (
        <option key={o} value={o}>
          {label(o)}
        </option>
      ))}
    </select>
  );
}
