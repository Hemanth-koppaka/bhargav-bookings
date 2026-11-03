import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { ChevronDown, RefreshCw, Send } from "lucide-react";
import { AdminShell, Empty, Panel, TinyButton, inputClass } from "@/components/admin";
import { LoadState, useAdminData } from "@/components/admin-ops";
import { useAdmin } from "@/lib/admin-store";
import {
  adminDispatchNow,
  adminNotificationLogs,
  adminNotifySettings,
  adminRetryNotification,
  adminSaveNotifySettings,
  adminSendTestMessage,
  type NotifyLog,
} from "@/lib/admin-notify.functions";
import type { NotifySettings } from "@/lib/notify/service.server";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications — Hair by Bhargav" },
      {
        name: "description",
        content: "Booking emails, reminders and delivery status.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: NotificationsScreen,
});

type Info = Extract<Awaited<ReturnType<typeof adminNotifySettings>>, { available: true }>;

function NotificationsScreen() {
  const { pin } = useAdmin();
  const { data, loading, error, reload } = useAdminData(
    (p) => adminNotifySettings({ data: { pin: p } }),
    [],
  );
  const [s, setS] = useState<NotifySettings | null>(null);
  const [saved, setSaved] = useState<NotifySettings | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data?.available) {
      const v = JSON.parse(data.settingsJson) as NotifySettings;
      setS(v);
      setSaved(v);
    }
  }, [data]);

  const dirty = Boolean(s && saved && JSON.stringify(s) !== JSON.stringify(saved));
  const set = (p: Partial<NotifySettings>) => setS((c) => (c ? { ...c, ...p } : c));

  const save = async () => {
    if (!s) return;
    setBusy(true);
    try {
      const r = await adminSaveNotifySettings({ data: { pin, settings: s } });
      if (!r.ok) return void toast.error(r.error);
      toast.success("Notification settings saved.");
      reload();
    } catch (e) {
      // validation messages (phone / address) come back from the server
      const msg = e instanceof Error ? e.message : "";
      const nice = msg.match(/"message":\s*"([^"]+)"/)?.[1];
      toast.error(nice ?? "Couldn't save. Check the numbers and address.");
    } finally {
      setBusy(false);
    }
  };

  const unavailable = data && !data.available;
  const info = data?.available ? (data as Info) : null;

  return (
    <AdminShell
      title="Notifications"
      subtitle="Booking emails to guests and the salon (free). Bookings never depend on a message going out."
      right={
        dirty ? (
          <div className="flex gap-2">
            <TinyButton onClick={() => setS(saved)}>Discard</TinyButton>
            <TinyButton tone="primary" disabled={busy} onClick={() => void save()}>
              {busy ? "Saving…" : "Save"}
            </TinyButton>
          </div>
        ) : null
      }
    >
      <LoadState loading={loading && !data} error={error} onRetry={reload} />
      {unavailable ? (
        <Empty title="Notifications appear once the latest database update (0004) has been applied." />
      ) : null}

      {s && info ? (
        <div className="space-y-4 pb-24 lg:pb-0">
          <ProviderStatus info={info} />

          <Panel>
            <h2 className="font-display text-[1.35rem]">Messages</h2>
            <div className="mt-3 divide-y divide-hairline">
              <Row title="Guest confirmation" hint="When a booking is confirmed.">
                <Toggle
                  on={s.customerConfirmation}
                  onChange={(v) => set({ customerConfirmation: v })}
                />
              </Row>
              <Row title="Guest updates" hint="When an appointment is rescheduled or cancelled.">
                <Toggle on={s.customerUpdates} onChange={(v) => set({ customerUpdates: v })} />
              </Row>
              <Row title="New-booking alert to the salon" hint="When a guest books online.">
                <Toggle on={s.adminNewBooking} onChange={(v) => set({ adminNewBooking: v })} />
              </Row>
              <Row title="Change alerts to the salon" hint="When a guest reschedules or cancels.">
                <Toggle on={s.adminUpdates} onChange={(v) => set({ adminUpdates: v })} />
              </Row>
              <Row title="24-hour reminder">
                <Toggle on={s.reminder24h} onChange={(v) => set({ reminder24h: v })} />
              </Row>
              <Row title="2-hour reminder">
                <Toggle on={s.reminder2h} onChange={(v) => set({ reminder2h: v })} />
              </Row>
            </div>
          </Panel>

          <Panel>
            <h2 className="font-display text-[1.35rem]">Links</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field
                label="Public site address (optional)"
                hint="Used in “Manage your booking” links when the booking has none. Normally taken from the site the guest booked on."
              >
                <input
                  className={inputClass}
                  value={s.publicSiteUrl}
                  onChange={(e) => set({ publicSiteUrl: e.target.value })}
                  placeholder="https://hairbybhargav.com"
                />
              </Field>
            </div>
          </Panel>

          <EmailSettings s={s} info={info} set={set} />
          <TestPanel dirty={dirty} />
          <MessageLog />
        </div>
      ) : null}

      {dirty ? (
        <div className="fixed inset-x-0 bottom-[4.25rem] z-30 border-t border-hairline bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <span className="text-[0.82rem] text-muted-foreground">Unsaved changes</span>
            <TinyButton tone="primary" disabled={busy} onClick={() => void save()}>
              {busy ? "Saving…" : "Save"}
            </TinyButton>
          </div>
        </div>
      ) : null}
    </AdminShell>
  );
}

/* ── status ───────────────────────────────────────────────── */

function Dot({ on, warn }: { on: boolean; warn?: boolean }) {
  return (
    <span
      className={cn(
        "inline-block h-2 w-2 shrink-0 rounded-full",
        on ? "bg-emerald-600" : warn ? "bg-amber-500" : "bg-foreground/25",
      )}
    />
  );
}

function ProviderStatus({ info }: { info: Info }) {
  const st = info.status;
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const lines: { label: string; ok: boolean; text: string; detail?: string }[] = [
    {
      label: "Reminder schedule",
      ok: st.cronSecret,
      text: st.cronSecret ? "Ready" : "Not configured",
      detail: `Schedule POST ${origin}/api/notifications/dispatch every 10 minutes (Lovable cron).`,
    },
    {
      label: "Email (free)",
      ok: st.email.configured,
      text: st.email.configured
        ? `${st.email.provider} · Ready`
        : `${st.email.provider} · Not configured`,
      ...(st.email.missing.length ? { detail: `Missing: ${st.email.missing.join(", ")}.` } : {}),
    },
  ];
  return (
    <Panel className={cn(!st.email.configured && "border-amber-600/35 bg-amber-500/[0.05]")}>
      <h2 className="font-display text-[1.35rem]">Connection</h2>
      {!st.connected ? (
        <p className="mt-1 text-[0.82rem]">
          No messages are being sent yet. Everything is recorded as <b>skipped</b> until the
          provider is connected — nothing is ever reported as sent when it wasn't.
        </p>
      ) : null}
      <ul className="mt-3 divide-y divide-hairline">
        {lines.map((l) => (
          <li key={l.label} className="py-2.5">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[0.9rem]">{l.label}</span>
              <span className="flex items-center gap-2 text-[0.82rem]">
                <Dot on={l.ok} warn={!l.ok} /> {l.text}
              </span>
            </div>
            {l.detail && !l.ok ? (
              <p className="mt-1 break-words text-[0.74rem] text-muted-foreground">{l.detail}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/* ── email (free) ─────────────────────────────────────────── */

function EmailSettings({
  s,
  info,
  set,
}: {
  s: NotifySettings;
  info: Info;
  set: (p: Partial<NotifySettings>) => void;
}) {
  const st = info.status.email;
  const free = s.email.provider === "brevo" ? "300 emails a day free" : "3,000 emails a month free";
  return (
    <Panel>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-[1.35rem]">Email</h2>
        <span className="flex items-center gap-2 text-[0.8rem]">
          <Dot on={st.configured} warn={!st.configured} />{" "}
          {st.configured ? "Ready" : "Not configured"}
        </span>
      </div>
      <p className="mt-1 text-[0.8rem] text-muted-foreground">
        Free and automatic: confirmations, changes and reminders go to guests who gave an email (
        {free}).
      </p>
      <div className="mt-3 divide-y divide-hairline">
        <Row title="Emails to guests" hint="Only guests who entered an email address.">
          <Toggle on={s.customerEmail} onChange={(v) => set({ customerEmail: v })} />
        </Row>
        <Row title="Email alerts to the salon" hint="New bookings, moves and cancellations, plus a summary of the day each morning at 8 AM.">
          <Toggle on={s.adminEmail} onChange={(v) => set({ adminEmail: v })} />
        </Row>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="Email service">
          <select
            className={inputClass}
            value={s.email.provider}
            onChange={(e) =>
              set({
                email: { ...s.email, provider: e.target.value === "resend" ? "resend" : "brevo" },
              })
            }
          >
            <option value="brevo">Brevo — works with a Gmail sender</option>
            <option value="resend">Resend — needs your own domain</option>
          </select>
        </Field>
        <Field label="Salon email" hint="Gets salon alerts and test emails.">
          <input
            className={inputClass}
            value={s.adminEmailAddress}
            onChange={(e) => set({ adminEmailAddress: e.target.value })}
            placeholder="salon@example.com"
            inputMode="email"
          />
        </Field>
        <Field
          label="Send from (email)"
          hint={
            s.email.provider === "brevo"
              ? "Verify this address in Brevo first."
              : "An address on your verified domain."
          }
        >
          <input
            className={inputClass}
            value={s.email.from}
            onChange={(e) => set({ email: { ...s.email, from: e.target.value } })}
            placeholder="bookings@example.com"
            inputMode="email"
          />
        </Field>
        <Field label="Send from (name)">
          <input
            className={inputClass}
            value={s.email.fromName}
            onChange={(e) => set({ email: { ...s.email, fromName: e.target.value } })}
            placeholder="Hair by Bhargav"
          />
        </Field>
      </div>
      {!st.configured ? (
        <p className="mt-2 text-[0.75rem] text-muted-foreground">
          Missing: {st.missing.join(", ")}. The API key is added as a project secret (
          {s.email.provider === "resend" ? "RESEND_API_KEY" : "BREVO_API_KEY"}), never here.
        </p>
      ) : null}
    </Panel>
  );
}

/* ── provider setup (templates) ───────────────────────────── */

/* ── test messages ────────────────────────────────────────── */

function TestPanel({ dirty }: { dirty: boolean }) {
  const { pin } = useAdmin();
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<{ ok: boolean; status: string; detail: string } | null>(
    null,
  );
  const run = async (kind: "customer" | "admin", channel: "whatsapp" | "sms" | "email") => {
    setBusy(`${kind}-${channel}`);
    setResult(null);
    try {
      setResult(await adminSendTestMessage({ data: { pin, kind, channel } }));
    } catch {
      setResult({ ok: false, status: "error", detail: "Couldn't run the test." });
    } finally {
      setBusy(null);
    }
  };
  return (
    <Panel>
      <h2 className="font-display text-[1.35rem]">Test</h2>
      <p className="mt-1 text-[0.8rem] text-muted-foreground">
        Sends a sample to the test number only. {dirty ? "Save your changes first." : ""}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {([["customer", "email", "Test guest email"]] as const).map(([k, c, label]) => (
          <TinyButton
            key={`${k}-${c}`}
            disabled={dirty || busy !== null}
            onClick={() => void run(k, c)}
          >
            <Send className="h-3.5 w-3.5" /> {busy === `${k}-${c}` ? "Sending…" : label}
          </TinyButton>
        ))}
      </div>
      {result ? (
        <p
          className={cn("mt-3 text-[0.85rem]", result.ok ? "text-emerald-700" : "text-destructive")}
        >
          {result.ok ? "✓ " : "⚠ "}
          {result.status.toUpperCase()} — {result.detail}
        </p>
      ) : null}
    </Panel>
  );
}

/* ── message log ──────────────────────────────────────────── */

export const STATUS_TONE: Record<string, string> = {
  delivered: "text-emerald-700",
  sent: "text-emerald-700",
  scheduled: "text-muted-foreground",
  queued: "text-muted-foreground",
  sending: "text-muted-foreground",
  failed: "text-destructive",
  skipped: "text-amber-700",
  cancelled: "text-muted-foreground line-through",
};

function MessageLog() {
  const { pin } = useAdmin();
  const [problems, setProblems] = useState(false);
  const [tick, setTick] = useState(0);
  const [logs, setLogs] = useState<NotifyLog[] | null>(null);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    let live = true;
    adminNotificationLogs({ data: { pin, page: 0, ...(problems ? { problems: true } : {}) } })
      .then((r) => live && setLogs(r.logs))
      .catch(() => live && setLogs([]));
    return () => {
      live = false;
    };
  }, [pin, problems, tick]);

  const retry = async (id: number) => {
    const r = await adminRetryNotification({ data: { pin, id } }).catch(() => ({
      ok: false,
      detail: "Couldn't retry.",
    }));
    (r.ok ? toast.success : toast.error)(r.detail);
    setTick((t) => t + 1);
  };
  const dispatch = async () => {
    setRunning(true);
    try {
      const r = (await adminDispatchNow({ data: { pin } })) as Record<string, unknown>;
      toast.success(
        r["ok"]
          ? `Reminders sent: ${r["reminders"] ?? 0} · retries: ${r["retries"] ?? 0}`
          : "Nothing to send.",
      );
    } catch {
      toast.error("Couldn't run the reminders.");
    } finally {
      setRunning(false);
      setTick((t) => t + 1);
    }
  };

  return (
    <Panel className="p-0 lg:p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-hairline px-4 py-3 lg:px-5">
        <h2 className="font-display text-[1.35rem]">Recent messages</h2>
        <div className="flex gap-2">
          <TinyButton active={problems} onClick={() => setProblems((v) => !v)}>
            Problems only
          </TinyButton>
          <TinyButton disabled={running} onClick={() => void dispatch()}>
            <RefreshCw className={cn("h-3.5 w-3.5", running && "animate-spin")} /> Run reminders now
          </TinyButton>
        </div>
      </div>
      {logs === null ? (
        <p className="px-5 py-6 text-[0.85rem] text-muted-foreground">Loading…</p>
      ) : !logs.length ? (
        <p className="px-5 py-6 text-[0.85rem] text-muted-foreground">
          {problems ? "No failed or skipped messages." : "No messages yet."}
        </p>
      ) : (
        <ul className="divide-y divide-hairline">
          {logs.map((l) => (
            <li
              key={l.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-[0.82rem] lg:px-5"
            >
              <span className="w-24 shrink-0 tabular-nums text-muted-foreground">
                {shortTime(
                  l.scheduledFor && l.status === "scheduled" ? l.scheduledFor : l.createdAt,
                )}
              </span>
              <span className="w-28 shrink-0 font-medium">{l.bookingId}</span>
              <span className="min-w-0 flex-1">
                {l.recipient === "admin" ? "Salon" : l.recipient === "test" ? "Test" : "Guest"} ·{" "}
                {l.eventLabel} ·{" "}
                {l.channel === "whatsapp" ? "WhatsApp" : l.channel === "email" ? "Email" : "SMS"}
                {l.fallback ? " (fallback)" : ""}
                {l.errorMessage && ["failed", "skipped"].includes(l.status) ? (
                  <span className="block text-[0.75rem] text-muted-foreground">
                    {l.errorMessage}
                  </span>
                ) : null}
              </span>
              <span
                className={cn(
                  "shrink-0 font-medium uppercase tracking-[0.06em]",
                  STATUS_TONE[l.status],
                )}
              >
                {l.status}
              </span>
              {["failed", "skipped"].includes(l.status) && l.recipient !== "test" ? (
                <TinyButton onClick={() => void retry(l.id)}>Retry</TinyButton>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

export const shortTime = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    timeZone: "Asia/Kolkata",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });

/* ── small parts ──────────────────────────────────────────── */

function Row({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <div className="text-[0.92rem]">{title}</div>
        {hint ? <div className="text-[0.75rem] text-muted-foreground">{hint}</div> : null}
      </div>
      {children}
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="press flex shrink-0 items-center gap-2.5 text-[0.8rem] text-muted-foreground"
    >
      {on ? "On" : "Off"}
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

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[0.62rem] uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </span>
      {children}
      {hint ? (
        <span className="mt-1 block text-[0.72rem] text-muted-foreground">{hint}</span>
      ) : null}
    </label>
  );
}
