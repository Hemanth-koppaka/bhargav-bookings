import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AdminShell, Panel, TinyButton, inputClass } from "@/components/admin";
import { useAdmin } from "@/lib/admin-store";
import { BUSINESS, WEEK } from "@/lib/salon";

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
  const { staff, addStaff, toggleStaff, removeStaff, settings, updateSettings, signOut } =
    useAdmin();
  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [pin, setPin] = useState("");
  const [saved, setSaved] = useState("");

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
        <div className="eyebrow">Access code</div>
        <input
          className={inputClass + " mt-4 tracking-[0.4em]"}
          placeholder="New code"
          inputMode="numeric"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
        />
        <div className="mt-5 flex items-center gap-4">
          <TinyButton
            onClick={() => {
              if (pin.trim().length < 4) return;
              updateSettings({ pin: pin.trim() });
              setPin("");
              setSaved("Access code updated.");
            }}
          >
            Save code
          </TinyButton>
          {saved ? <span className="text-xs text-muted-foreground">{saved}</span> : null}
        </div>
      </Panel>

      <Panel className="mt-4">
        <div className="eyebrow">Salon</div>
        <p className="mt-3 text-sm leading-relaxed">{BUSINESS.address}</p>
        <div className="mt-4 grid grid-cols-2 gap-2 text-xs text-muted-foreground sm:grid-cols-4">
          {WEEK.map((d) => (
            <div key={d.day}>
              {d.day} — {d.closed ? "Closed" : "10:00 – 20:00"}
            </div>
          ))}
        </div>
      </Panel>

      <div className="mt-6">
        <TinyButton tone="danger" onClick={signOut}>
          Sign out of console
        </TinyButton>
      </div>
    </AdminShell>
  );
}
