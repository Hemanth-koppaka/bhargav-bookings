import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { CalendarOff, Clock, Plus, Trash2, UserPlus } from "lucide-react";
import { AdminShell, Empty, Panel, TinyButton, inputClass } from "@/components/admin";
import { LoadState, salonToday, useAdminData } from "@/components/admin-ops";
import { useAdmin } from "@/lib/admin-store";
import {
  adminAddLeave,
  adminAddStaffBlock,
  adminRemoveStaffTime,
  adminSaveStaff,
  adminStaffList,
  type StaffBreak,
  type StaffHours,
  type StaffMember,
} from "@/lib/admin-staff.functions";
import { minuteLabel } from "@/lib/salon";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

export const Route = createFileRoute("/admin/staff")({
  head: () => ({
    meta: [
      { title: "Staff — Hair by Bhargav" },
      { name: "description", content: "Stylists, services, hours, breaks and leave." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: StaffScreen,
});

type Data = Extract<Awaited<ReturnType<typeof adminStaffList>>, { available: true }>;
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday first
const TIMES = Array.from({ length: (23 * 60 - 6 * 60) / 15 + 1 }, (_, i) => 6 * 60 + i * 15);

const blank = (n: number): StaffMember => ({
  id: "",
  name: "",
  gender: "",
  specialties: "",
  active: true,
  bookable: true,
  order: n,
  services: [],
  hours: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ day: d, working: d !== 2, start: 600, end: 1200 })),
  breaks: [{ day: null, start: 780, end: 840, label: "Lunch" }],
  leave: [],
  blocks: [],
  upcoming: 0,
});

function StaffScreen() {
  const { pin } = useAdmin();
  const { data, loading, error, reload } = useAdminData(
    (p) => adminStaffList({ data: { pin: p } }),
    [],
  );
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const info = data && data.available ? (data as Data) : null;

  return (
    <AdminShell
      title="Staff"
      subtitle="Who can be booked, for what, and when. Booking times follow this automatically."
      right={
        info ? (
          <TinyButton tone="primary" onClick={() => setEditing(blank(info.staff.length))}>
            <UserPlus className="h-4 w-4" /> Add stylist
          </TinyButton>
        ) : null
      }
    >
      <LoadState loading={loading && !data} error={error} onRetry={reload} />
      {data && !data.available ? (
        <Empty title="Staff appears once the latest database update (0008) has been applied." />
      ) : null}
      {info ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {info.staff.map((s) => (
            <button
              key={s.id}
              onClick={() => setEditing(s)}
              className={cn(
                "press rounded-md border border-hairline bg-card p-5 text-left hover:border-foreground/30",
                !s.active && "opacity-60",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-display text-[1.5rem] leading-tight">{s.name}</div>
                  <div className="text-[0.8rem] text-muted-foreground">
                    {s.specialties ||
                      (s.gender ? s.gender[0]!.toUpperCase() + s.gender.slice(1) : "Stylist")}
                  </div>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded-full border px-2 py-0.5 text-[0.62rem] uppercase tracking-[0.12em]",
                    !s.active
                      ? "border-foreground/20 text-muted-foreground"
                      : s.bookable
                        ? "border-emerald-700/30 text-emerald-700"
                        : "border-amber-600/40 text-amber-700",
                  )}
                >
                  {!s.active ? "Inactive" : s.bookable ? "Bookable" : "Not online"}
                </span>
              </div>
              <div className="mt-3 text-[0.82rem] text-muted-foreground">
                {s.services.length} services · {s.hours.filter((h) => h.working).length} days a week
              </div>
              <div className="mt-1 text-[0.82rem] text-muted-foreground">
                {ORDER.filter((d) => s.hours[d]?.working)
                  .map((d) => DAYS[d])
                  .join(" ")}
              </div>
              {s.leave.length ? (
                <div className="mt-2 text-[0.8rem] text-amber-700">
                  Leave {s.leave[0]!.start}
                  {s.leave[0]!.end !== s.leave[0]!.start ? ` → ${s.leave[0]!.end}` : ""}
                  {s.leave.length > 1 ? ` +${s.leave.length - 1}` : ""}
                </div>
              ) : null}
              <div className="mt-2 text-[0.8rem]">
                {s.upcoming} upcoming appointment{s.upcoming === 1 ? "" : "s"}
              </div>
            </button>
          ))}
        </div>
      ) : null}
      {info ? (
        <StaffEditor
          member={editing}
          info={info}
          onClose={() => setEditing(null)}
          onSaved={reload}
        />
      ) : null}
    </AdminShell>
  );
}

function Section({ title, children, hint }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="border-t border-hairline pt-4">
      <div className="text-[0.62rem] uppercase tracking-[0.2em] text-muted-foreground">{title}</div>
      {hint ? <p className="mt-0.5 text-[0.75rem] text-muted-foreground">{hint}</p> : null}
      <div className="mt-2">{children}</div>
    </section>
  );
}

const TimeSelect = ({
  value,
  onChange,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
}) => (
  <select
    aria-label={label}
    value={value}
    onChange={(e) => onChange(Number(e.target.value))}
    className="rounded-md border border-foreground/15 bg-background px-2 py-1.5 text-[0.85rem] tabular-nums"
  >
    {TIMES.map((t) => (
      <option key={t} value={t}>
        {minuteLabel(t)}
      </option>
    ))}
  </select>
);

function StaffEditor({
  member,
  info,
  onClose,
  onSaved,
}: {
  member: StaffMember | null;
  info: Data;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { pin } = useAdmin();
  const [f, setF] = useState<StaffMember | null>(member);
  const [busy, setBusy] = useState(false);
  useEffect(() => setF(member), [member]);
  const groups = useMemo(
    () =>
      info.categories
        .map((c) => ({ ...c, services: info.services.filter((s) => s.categoryId === c.id) }))
        .filter((c) => c.services.length),
    [info],
  );
  if (!f) return null;
  const set = (p: Partial<StaffMember>) => setF((c) => (c ? { ...c, ...p } : c));
  const setHours = (day: number, p: Partial<StaffHours>) =>
    set({ hours: f.hours.map((h) => (h.day === day ? { ...h, ...p } : h)) });
  const setBreak = (i: number, p: Partial<StaffBreak>) =>
    set({ breaks: f.breaks.map((b, j) => (j === i ? { ...b, ...p } : b)) });
  const toggle = (ids: string[], on: boolean) =>
    set({
      services: on
        ? [...new Set([...f.services, ...ids])]
        : f.services.filter((x) => !ids.includes(x)),
    });

  const save = async () => {
    if (!f.name.trim()) return void toast.error("Add a name.");
    setBusy(true);
    try {
      const r = await adminSaveStaff({
        data: {
          pin,
          staff: {
            ...(f.id ? { id: f.id } : {}),
            name: f.name,
            gender: f.gender as "",
            specialties: f.specialties,
            active: f.active,
            bookable: f.bookable,
            order: f.order,
            services: f.services,
            hours: f.hours,
            breaks: f.breaks.map((b) => ({
              day: b.day,
              start: b.start,
              end: b.end,
              label: b.label,
            })),
          },
        },
      });
      if (!r.ok) return void toast.error(r.error);
      toast.success(`${f.name} saved. Booking times update straight away.`);
      onSaved();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error && e.message.length < 160 ? e.message : "Couldn't save.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={Boolean(member)} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="w-full overflow-y-auto p-0 sm:max-w-[34rem]">
        <SheetHeader className="sticky top-0 z-10 border-b border-hairline bg-background/95 px-5 py-4 text-left backdrop-blur">
          <SheetTitle className="font-display text-[1.6rem] font-normal">
            {f.id ? f.name || "Stylist" : "New stylist"}
          </SheetTitle>
          <SheetDescription>
            {f.id
              ? `${f.upcoming} upcoming appointment${f.upcoming === 1 ? "" : "s"}`
              : "Shows up in booking times as soon as you save."}
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-5 py-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[0.62rem] uppercase tracking-[0.2em] text-muted-foreground">
                Name
              </span>
              <input
                className={inputClass}
                value={f.name}
                onChange={(e) => set({ name: e.target.value })}
                maxLength={80}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[0.62rem] uppercase tracking-[0.2em] text-muted-foreground">
                Gender
              </span>
              <select
                className={inputClass}
                value={f.gender}
                onChange={(e) => set({ gender: e.target.value })}
              >
                <option value="">—</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </label>
            <label className="block sm:col-span-2">
              <span className="mb-1 block text-[0.62rem] uppercase tracking-[0.2em] text-muted-foreground">
                Specialties (shown to guests)
              </span>
              <input
                className={inputClass}
                value={f.specialties}
                onChange={(e) => set({ specialties: e.target.value })}
                maxLength={160}
                placeholder="e.g. Fades, beard sculpting"
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-x-6 gap-y-2 text-[0.88rem]">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--bronze)]"
                checked={f.active}
                onChange={(e) => set({ active: e.target.checked })}
              />{" "}
              Works here (active)
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[var(--bronze)]"
                checked={f.bookable}
                onChange={(e) => set({ bookable: e.target.checked })}
              />{" "}
              Guests can book online
            </label>
          </div>

          <Section title="Services" hint="Only these can be booked with this stylist.">
            <div className="space-y-3">
              {groups.map((g) => {
                const ids = g.services.map((s) => s.id);
                const all = ids.every((id) => f.services.includes(id));
                return (
                  <div key={g.id}>
                    <label className="flex items-center gap-2 text-[0.82rem] font-medium">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[var(--bronze)]"
                        checked={all}
                        onChange={(e) => toggle(ids, e.target.checked)}
                      />
                      {g.name}{" "}
                      <span className="text-muted-foreground capitalize">· {g.audience}</span>
                    </label>
                    <div className="mt-1 flex flex-wrap gap-1.5 pl-6">
                      {g.services.map((s) => {
                        const on = f.services.includes(s.id);
                        return (
                          <button
                            key={s.id}
                            onClick={() => toggle([s.id], !on)}
                            className={cn(
                              "press rounded-full border px-2.5 py-0.5 text-[0.75rem]",
                              on
                                ? "border-foreground bg-foreground text-background"
                                : "border-foreground/15",
                            )}
                          >
                            {s.name}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </Section>

          <Section title="Working hours">
            <div className="space-y-1.5">
              {ORDER.map((d) => {
                const h = f.hours.find((x) => x.day === d)!;
                return (
                  <div key={d} className="flex flex-wrap items-center gap-2">
                    <label className="flex w-20 items-center gap-2 text-[0.85rem]">
                      <input
                        type="checkbox"
                        className="h-4 w-4 accent-[var(--bronze)]"
                        checked={h.working}
                        onChange={(e) => setHours(d, { working: e.target.checked })}
                      />
                      {DAYS[d]}
                    </label>
                    {h.working ? (
                      <>
                        <TimeSelect
                          label={`${DAYS[d]} start`}
                          value={h.start}
                          onChange={(v) => setHours(d, { start: v })}
                        />
                        <span className="text-muted-foreground">–</span>
                        <TimeSelect
                          label={`${DAYS[d]} end`}
                          value={h.end}
                          onChange={(v) => setHours(d, { end: v })}
                        />
                      </>
                    ) : (
                      <span className="text-[0.82rem] text-muted-foreground">Day off</span>
                    )}
                  </div>
                );
              })}
            </div>
          </Section>

          <Section title="Breaks" hint="Only this stylist is unavailable; others stay bookable.">
            <div className="space-y-1.5">
              {f.breaks.map((b, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label="Day"
                    value={b.day ?? ""}
                    onChange={(e) =>
                      setBreak(i, { day: e.target.value === "" ? null : Number(e.target.value) })
                    }
                    className="rounded-md border border-foreground/15 bg-background px-2 py-1.5 text-[0.85rem]"
                  >
                    <option value="">Every day</option>
                    {ORDER.map((d) => (
                      <option key={d} value={d}>
                        {DAYS[d]}
                      </option>
                    ))}
                  </select>
                  <TimeSelect
                    label="Break start"
                    value={b.start}
                    onChange={(v) => setBreak(i, { start: v })}
                  />
                  <span className="text-muted-foreground">–</span>
                  <TimeSelect
                    label="Break end"
                    value={b.end}
                    onChange={(v) => setBreak(i, { end: v })}
                  />
                  <input
                    aria-label="Label"
                    className="w-24 rounded-md border border-foreground/15 px-2 py-1.5 text-[0.85rem]"
                    value={b.label}
                    onChange={(e) => setBreak(i, { label: e.target.value })}
                  />
                  <button
                    aria-label="Remove break"
                    onClick={() => set({ breaks: f.breaks.filter((_, j) => j !== i) })}
                    className="press p-1 text-foreground/50 hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" strokeWidth={1.5} />
                  </button>
                </div>
              ))}
              <TinyButton
                onClick={() =>
                  set({
                    breaks: [...f.breaks, { day: null, start: 780, end: 840, label: "Break" }],
                  })
                }
              >
                <Plus className="h-3.5 w-3.5" /> Add break
              </TinyButton>
            </div>
          </Section>

          <div className="sticky bottom-0 -mx-5 flex justify-end gap-2 border-t border-hairline bg-background/95 px-5 py-3 backdrop-blur">
            <TinyButton onClick={onClose}>Cancel</TinyButton>
            <TinyButton tone="primary" disabled={busy} onClick={() => void save()}>
              {busy ? "Saving…" : f.id ? "Save" : "Add stylist"}
            </TinyButton>
          </div>

          {f.id ? <TimeOff member={f} onChanged={onSaved} /> : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Leave (whole days) and temporary unavailability (hours on a date). */
function TimeOff({ member, onChanged }: { member: StaffMember; onChanged: () => void }) {
  const { pin } = useAdmin();
  const today = salonToday();
  const [lv, setLv] = useState({ start: today, end: today, reason: "" });
  const [bl, setBl] = useState({ date: today, start: 960, end: 1080, reason: "" });
  const [clash, setClash] = useState<{
    kind: "leave" | "block";
    list: { reference: string; date: string; time: number; name: string }[];
  } | null>(null);
  const [leave, setLeave] = useState(member.leave);
  const [blocks, setBlocks] = useState(member.blocks);
  useEffect(() => {
    setLeave(member.leave);
    setBlocks(member.blocks);
  }, [member]);

  const addLeave = async (confirm = false) => {
    const r = await adminAddLeave({
      data: { pin, staffId: member.id, ...lv, ...(confirm ? { confirm: true } : {}) },
    }).catch(() => null);
    if (!r) return void toast.error("Couldn't save the leave.");
    if (!r.ok && "clashes" in r && r.clashes?.length)
      return setClash({ kind: "leave", list: r.clashes });
    if (!r.ok) return void toast.error(("error" in r && r.error) || "Couldn't save.");
    toast.success(
      `${member.name} on leave ${lv.start}${lv.end !== lv.start ? ` → ${lv.end}` : ""}.`,
    );
    setClash(null);
    setLeave((x) => [...x, { id: crypto.randomUUID(), ...lv }]);
    onChanged();
  };
  const addBlock = async (confirm = false) => {
    const r = await adminAddStaffBlock({
      data: { pin, staffId: member.id, ...bl, ...(confirm ? { confirm: true } : {}) },
    }).catch(() => null);
    if (!r) return void toast.error("Couldn't save.");
    if (!r.ok && "clashes" in r && r.clashes?.length)
      return setClash({ kind: "block", list: r.clashes });
    if (!r.ok) return void toast.error(("error" in r && r.error) || "Couldn't save.");
    toast.success(
      `${member.name} unavailable ${minuteLabel(bl.start)}–${minuteLabel(bl.end)} on ${bl.date}.`,
    );
    setClash(null);
    setBlocks((x) => [...x, { id: crypto.randomUUID(), ...bl }]);
    onChanged();
  };
  const remove = async (kind: "leave" | "block", id: string) => {
    await adminRemoveStaffTime({ data: { pin, kind, id } }).catch(() => null);
    if (kind === "leave") setLeave((x) => x.filter((y) => y.id !== id));
    else setBlocks((x) => x.filter((y) => y.id !== id));
    onChanged();
  };

  return (
    <Panel className="space-y-4">
      <div className="flex items-center gap-2">
        <CalendarOff className="h-4 w-4 text-bronze" strokeWidth={1.5} />
        <span className="font-display text-[1.3rem]">Time off</span>
      </div>
      <p className="text-[0.78rem] text-muted-foreground">
        Only {member.name} becomes unavailable; the salon and other stylists stay open. Existing
        bookings stay booked — you'll see any clashes.
      </p>

      <div>
        <div className="text-[0.62rem] uppercase tracking-[0.2em] text-muted-foreground">Leave</div>
        <ul className="mt-1 space-y-1 text-[0.85rem]">
          {leave.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-2">
              <span>
                {l.start}
                {l.end !== l.start ? ` → ${l.end}` : ""}{" "}
                {l.reason ? <span className="text-muted-foreground">· {l.reason}</span> : null}
              </span>
              <button
                onClick={() => void remove("leave", l.id)}
                className="text-[0.75rem] text-muted-foreground underline underline-offset-4 hover:text-destructive"
              >
                Remove
              </button>
            </li>
          ))}
          {!leave.length ? <li className="text-muted-foreground">None planned.</li> : null}
        </ul>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={lv.start}
            min={today}
            onChange={(e) =>
              setLv({
                ...lv,
                start: e.target.value,
                end: e.target.value > lv.end ? e.target.value : lv.end,
              })
            }
            className="rounded-md border border-foreground/15 px-2 py-1.5 text-[0.85rem]"
            aria-label="Leave from"
          />
          <span className="text-muted-foreground">→</span>
          <input
            type="date"
            value={lv.end}
            min={lv.start}
            onChange={(e) => setLv({ ...lv, end: e.target.value })}
            className="rounded-md border border-foreground/15 px-2 py-1.5 text-[0.85rem]"
            aria-label="Leave to"
          />
          <input
            value={lv.reason}
            onChange={(e) => setLv({ ...lv, reason: e.target.value })}
            placeholder="Reason"
            className="w-32 rounded-md border border-foreground/15 px-2 py-1.5 text-[0.85rem]"
          />
          <TinyButton onClick={() => void addLeave()}>Add leave</TinyButton>
        </div>
      </div>

      <div>
        <div className="text-[0.62rem] uppercase tracking-[0.2em] text-muted-foreground">
          Unavailable for a few hours
        </div>
        <ul className="mt-1 space-y-1 text-[0.85rem]">
          {blocks.map((b) => (
            <li key={b.id} className="flex items-center justify-between gap-2">
              <span>
                <Clock
                  className="mr-1 inline h-3.5 w-3.5 text-muted-foreground"
                  strokeWidth={1.5}
                />
                {b.date} · {minuteLabel(b.start)}–{minuteLabel(b.end)}{" "}
                {b.reason ? <span className="text-muted-foreground">· {b.reason}</span> : null}
              </span>
              <button
                onClick={() => void remove("block", b.id)}
                className="text-[0.75rem] text-muted-foreground underline underline-offset-4 hover:text-destructive"
              >
                Remove
              </button>
            </li>
          ))}
          {!blocks.length ? <li className="text-muted-foreground">None.</li> : null}
        </ul>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={bl.date}
            min={today}
            onChange={(e) => setBl({ ...bl, date: e.target.value })}
            className="rounded-md border border-foreground/15 px-2 py-1.5 text-[0.85rem]"
            aria-label="Date"
          />
          <TimeSelect label="From" value={bl.start} onChange={(v) => setBl({ ...bl, start: v })} />
          <span className="text-muted-foreground">–</span>
          <TimeSelect label="Until" value={bl.end} onChange={(v) => setBl({ ...bl, end: v })} />
          <input
            value={bl.reason}
            onChange={(e) => setBl({ ...bl, reason: e.target.value })}
            placeholder="Reason"
            className="w-32 rounded-md border border-foreground/15 px-2 py-1.5 text-[0.85rem]"
          />
          <TinyButton onClick={() => void addBlock()}>Block</TinyButton>
        </div>
      </div>

      {clash ? (
        <div className="rounded-md border border-amber-600/30 bg-amber-500/10 p-3 text-[0.85rem]">
          {member.name} has {clash.list.length} booking{clash.list.length > 1 ? "s" : ""} in that
          time:
          <ul className="mt-1 list-disc pl-5">
            {clash.list.map((c) => (
              <li key={c.reference}>
                {c.date} {minuteLabel(c.time)} · {c.name} ({c.reference})
              </li>
            ))}
          </ul>
          They stay booked — move or reassign them from the calendar. Save anyway?
          <div className="mt-2 flex gap-2">
            <TinyButton
              tone="primary"
              onClick={() => void (clash.kind === "leave" ? addLeave(true) : addBlock(true))}
            >
              Save anyway
            </TinyButton>
            <TinyButton onClick={() => setClash(null)}>Cancel</TinyButton>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}
