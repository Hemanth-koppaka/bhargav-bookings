import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AdminShell, Panel, TinyButton, inputClass } from "@/components/admin";
import { useAdmin } from "@/lib/admin-store";
import { adminSaveBusinessHours } from "@/lib/salon.functions";
import { BUSINESS, WEEK, type WeekDay } from "@/lib/salon";

export const Route = createFileRoute("/admin/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Hair by Bhargav" },
      { name: "description", content: "Team, access code and salon preferences." },
      { name: "robots", content: "noindex" },
      { property: "og:title", content: "Settings — Hair by Bhargav" },
      { property: "og:description", content: "Team and salon preferences." },
    ],
  }),
  component: SettingsScreen,
});

function SettingsScreen() {
  const { staff, addStaff, toggleStaff, removeStaff, settings, updateSettings, signOut, changeCode, pin: adminPin } =
    useAdmin();
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [currentCode, setCurrentCode] = useState("");
  const [nextCode, setNextCode] = useState("");
  const [confirmCode, setConfirmCode] = useState("");
  const [codeBusy, setCodeBusy] = useState(false);
  const [codeMsg, setCodeMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [hoursSaved, setHoursSaved] = useState("");
  const [hoursBusy, setHoursBusy] = useState(false);
  const [hoursError, setHoursError] = useState("");

  const toTime = (min: number | undefined, fallback: string) => {
    if (min == null) return fallback;
    const h = Math.floor(min / 60);
    const m = min % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
  };
  const dayToIndex = (day: WeekDay["day"]) =>
    ({
      Sunday: 0,
      Monday: 1,
      Tuesday: 2,
      Wednesday: 3,
      Thursday: 4,
      Friday: 5,
      Saturday: 6,
    })[day] ?? 1;

  const [hours, setHours] = useState(() =>
    WEEK.map((d) => ({
      day: d.day,
      dayIndex: dayToIndex(d.day),
      open: !d.closed,
      from: toTime(d.open, "10:00"),
      to: toTime(d.close, "20:00"),
      breaks: (d.breaks ?? []).map((b) => ({
        start: toTime(b.start, "13:00"),
        end: toTime(b.end, "14:00"),
      })),
    })),
  );
  const canSaveHours = useMemo(
    () => hours.every((h) => /^\d{2}:\d{2}$/.test(h.from) && /^\d{2}:\d{2}$/.test(h.to)),
    [hours],
  );

  return (
    <AdminShell title="Settings" subtitle="Team, access and preferences">
      <Panel>
        <div className="eyebrow">Team</div>
        <div className="mt-4 divide-y divide-hairline">
          {staff.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-4 py-3.5">
              <div className="min-w-0">
                <div className="text-sm">{s.name}</div>
                <div className="text-xs text-muted-foreground">{s.role}</div>
              </div>
              <div className="flex shrink-0 gap-2">
                <TinyButton active={s.active} onClick={() => toggleStaff(s.id)}>
                  {s.active ? "Active" : "Off"}
                </TinyButton>
                <TinyButton tone="danger" onClick={() => removeStaff(s.id)}>
                  Remove
                </TinyButton>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <input className={inputClass} placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
          <input className={inputClass} placeholder="Role" value={role} onChange={(e) => setRole(e.target.value)} />
        </div>
        <div className="mt-5">
          <TinyButton
            onClick={() => {
              if (!name.trim()) return;
              addStaff(name.trim(), role.trim() || "Stylist");
              setName("");
              setRole("");
            }}
          >
            Add team member
          </TinyButton>
        </div>
      </Panel>

      <Panel className="mt-4">
        <div className="eyebrow">Business hours</div>
        <p className="mt-3 text-sm text-muted-foreground">
          Configure opening hours and lunch/break periods. Breaks are hidden in customer slot
          availability.
        </p>
        <div className="mt-5 flex flex-col gap-4">
          {hours.map((h, idx) => (
            <div key={h.day} className="border border-hairline p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm">{h.day}</div>
                <TinyButton
                  active={h.open}
                  onClick={() =>
                    setHours((list) =>
                      list.map((x, i) => (i === idx ? { ...x, open: !x.open, breaks: !x.open ? x.breaks : [] } : x)),
                    )
                  }
                >
                  {h.open ? "Open" : "Closed"}
                </TinyButton>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <input
                  className={inputClass}
                  type="time"
                  value={h.from}
                  disabled={!h.open}
                  onChange={(e) =>
                    setHours((list) =>
                      list.map((x, i) => (i === idx ? { ...x, from: e.target.value } : x)),
                    )
                  }
                />
                <input
                  className={inputClass}
                  type="time"
                  value={h.to}
                  disabled={!h.open}
                  onChange={(e) =>
                    setHours((list) =>
                      list.map((x, i) => (i === idx ? { ...x, to: e.target.value } : x)),
                    )
                  }
                />
              </div>
              <div className="mt-4">
                <div className="eyebrow">Break periods</div>
                <div className="mt-3 flex flex-col gap-2">
                  {h.breaks.map((b, bi) => (
                    <div key={bi} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
                      <input
                        className={inputClass}
                        type="time"
                        value={b.start}
                        disabled={!h.open}
                        onChange={(e) =>
                          setHours((list) =>
                            list.map((x, i) =>
                              i === idx
                                ? {
                                    ...x,
                                    breaks: x.breaks.map((it, ii) =>
                                      ii === bi ? { ...it, start: e.target.value } : it,
                                    ),
                                  }
                                : x,
                            ),
                          )
                        }
                      />
                      <input
                        className={inputClass}
                        type="time"
                        value={b.end}
                        disabled={!h.open}
                        onChange={(e) =>
                          setHours((list) =>
                            list.map((x, i) =>
                              i === idx
                                ? {
                                    ...x,
                                    breaks: x.breaks.map((it, ii) =>
                                      ii === bi ? { ...it, end: e.target.value } : it,
                                    ),
                                  }
                                : x,
                            ),
                          )
                        }
                      />
                      <TinyButton
                        tone="danger"
                        onClick={() =>
                          setHours((list) =>
                            list.map((x, i) =>
                              i === idx
                                ? { ...x, breaks: x.breaks.filter((_, ii) => ii !== bi) }
                                : x,
                            ),
                          )
                        }
                      >
                        Remove
                      </TinyButton>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex gap-2">
                  <TinyButton
                    onClick={() =>
                      setHours((list) =>
                        list.map((x, i) =>
                          i === idx
                            ? { ...x, breaks: [...x.breaks, { start: "13:00", end: "14:00" }] }
                            : x,
                        ),
                      )
                    }
                  >
                    Add break
                  </TinyButton>
                  {h.breaks.length ? (
                    <TinyButton
                      tone="danger"
                      onClick={() =>
                        setHours((list) =>
                          list.map((x, i) => (i === idx ? { ...x, breaks: [] } : x)),
                        )
                      }
                    >
                      Clear breaks
                    </TinyButton>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-4">
          <TinyButton
            onClick={async () => {
              if (!canSaveHours) {
                setHoursError("Enter valid opening and closing times.");
                return;
              }
              if (!adminPin) {
                setHoursError("Session expired. Please sign in again.");
                return;
              }
              setHoursSaved("");
              setHoursError("");
              setHoursBusy(true);
              try {
                await adminSaveBusinessHours({
                  data: {
                    pin: adminPin,
                    hours: hours.map((h) => ({
                      day: h.dayIndex,
                      open: h.open,
                      from: h.from,
                      to: h.to,
                      breaks: h.open ? h.breaks : [],
                    })),
                  },
                });
                for (const d of WEEK) {
                  const next = hours.find((x) => x.day === d.day);
                  if (!next) continue;
                  d.closed = !next.open;
                  const [oh, om] = next.from.split(":").map(Number);
                  const [ch, cm] = next.to.split(":").map(Number);
                  d.open = (oh ?? 10) * 60 + (om ?? 0);
                  d.close = (ch ?? 20) * 60 + (cm ?? 0);
                  d.breaks = (next.open ? next.breaks : []).map((b) => {
                    const [sh, sm] = b.start.split(":").map(Number);
                    const [eh, em] = b.end.split(":").map(Number);
                    return {
                      start: (sh ?? 13) * 60 + (sm ?? 0),
                      end: (eh ?? 14) * 60 + (em ?? 0),
                    };
                  });
                }
                setHoursSaved("Business hours saved.");
              } catch (e) {
                setHoursError(e instanceof Error ? e.message : "Unable to save business hours.");
              } finally {
                setHoursBusy(false);
              }
            }}
          >
            {hoursBusy ? "Saving…" : "Save hours"}
          </TinyButton>
          {hoursSaved ? <span className="text-xs text-muted-foreground">{hoursSaved}</span> : null}
          {hoursError ? <span className="text-xs text-destructive">{hoursError}</span> : null}
          {!canSaveHours ? (
            <span className="text-xs text-muted-foreground">Set valid HH:MM values to save.</span>
          ) : null}
        </div>
      </Panel>

      <Panel className="mt-4">
        <div className="eyebrow">Online bookings</div>
        <p className="mt-3 text-sm text-muted-foreground">
          {settings.acceptingBookings
            ? "Customers can reserve chairs online."
            : "New online reservations are paused."}
        </p>
        <div className="mt-4">
          <TinyButton
            active={settings.acceptingBookings}
            onClick={() => updateSettings({ acceptingBookings: !settings.acceptingBookings })}
          >
            {settings.acceptingBookings ? "Accepting" : "Paused"}
          </TinyButton>
        </div>
      </Panel>

      <Panel className="mt-4">
        <div id="access" className="eyebrow scroll-mt-28">Access code</div>
        <p className="mt-3 text-sm text-muted-foreground">
          Use 6–12 digits that aren't on any sign or receipt. Changing it signs out every other device.
        </p>
        <form
          className="mt-4 grid gap-3 sm:grid-cols-3"
          onSubmit={async (e) => {
            e.preventDefault();
            setCodeMsg(null);
            if (!/^\d{6,12}$/.test(nextCode)) return setCodeMsg({ ok: false, text: "The new code must be 6–12 digits." });
            if (nextCode !== confirmCode) return setCodeMsg({ ok: false, text: "The two new codes don't match." });
            setCodeBusy(true);
            const r = await changeCode(currentCode, nextCode);
            setCodeBusy(false);
            if (r.ok) {
              setCurrentCode("");
              setNextCode("");
              setConfirmCode("");
              setCodeMsg({ ok: true, text: "Access code updated. Other devices have been signed out." });
            } else setCodeMsg({ ok: false, text: r.message });
          }}
        >
          <input
            className={inputClass + " tracking-[0.3em]"}
            placeholder="Current code"
            inputMode="numeric"
            type="password"
            autoComplete="current-password"
            aria-label="Current code"
            value={currentCode}
            onChange={(e) => setCurrentCode(e.target.value)}
          />
          <input
            className={inputClass + " tracking-[0.3em]"}
            placeholder="New code"
            inputMode="numeric"
            type="password"
            autoComplete="new-password"
            aria-label="New code"
            value={nextCode}
            onChange={(e) => setNextCode(e.target.value.replace(/\D/g, "").slice(0, 12))}
          />
          <input
            className={inputClass + " tracking-[0.3em]"}
            placeholder="Repeat new code"
            inputMode="numeric"
            type="password"
            autoComplete="new-password"
            aria-label="Repeat new code"
            value={confirmCode}
            onChange={(e) => setConfirmCode(e.target.value.replace(/\D/g, "").slice(0, 12))}
          />
          <div className="flex items-center gap-4 sm:col-span-3">
            <TinyButton type="submit" disabled={codeBusy || !currentCode || !nextCode}>
              {codeBusy ? "Saving…" : "Save code"}
            </TinyButton>
            {codeMsg ? (
              <span role="status" className={"text-xs " + (codeMsg.ok ? "text-muted-foreground" : "text-destructive")}>
                {codeMsg.text}
              </span>
            ) : null}
          </div>
        </form>
      </Panel>

      <Panel className="mt-4">
        <div className="eyebrow">Salon</div>
        <p className="mt-3 text-sm leading-relaxed">{BUSINESS.address}</p>
        <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-4">
          {hours.map((d) => (
            <div key={d.day}>
              {d.day} — {d.open ? `${d.from} – ${d.to}` : "Closed"}
            </div>
          ))}
        </div>
      </Panel>

      <div className="mt-6">
        <TinyButton tone="danger" onClick={() => signOut()}>
          Sign out of console
        </TinyButton>
      </div>
    </AdminShell>
  );
}
