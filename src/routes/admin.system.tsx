import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle2, AlertTriangle, XCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { AdminShell, Panel, TinyButton } from "@/components/admin";
import { LoadState, useAdminData } from "@/components/admin-ops";
import { useAdmin } from "@/lib/admin-store";
import {
  adminSignOutEverywhere,
  adminSystemHealth,
  type HealthCheck,
} from "@/lib/admin-system.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/system")({
  head: () => ({
    meta: [
      { title: "System health — Hair by Bhargav" },
      {
        name: "description",
        content: "Database, scheduled jobs, messaging, storage and security status.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SystemScreen,
});

const ICON = {
  ok: <CheckCircle2 className="h-4 w-4 text-emerald-700" strokeWidth={1.6} aria-label="OK" />,
  warn: (
    <AlertTriangle
      className="h-4 w-4 text-amber-600"
      strokeWidth={1.6}
      aria-label="Needs attention"
    />
  ),
  fail: <XCircle className="h-4 w-4 text-destructive" strokeWidth={1.6} aria-label="Problem" />,
};
const WORD = { ok: "OK", warn: "Check", fail: "Problem" };
const GROUPS: HealthCheck["group"][] = [
  "Database",
  "Scheduled jobs",
  "Messaging",
  "Storage",
  "Secrets",
];

function SystemScreen() {
  const { pin, signOut } = useAdmin();
  const { data, loading, error, reload } = useAdminData(
    (p) => adminSystemHealth({ data: { pin: p } }),
    [],
  );
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const fails = data?.checks.filter((c) => c.status === "fail").length ?? 0;
  const warns = data?.checks.filter((c) => c.status === "warn").length ?? 0;

  const signOutAll = async () => {
    setBusy(true);
    try {
      const r = await adminSignOutEverywhere({ data: { pin } });
      if (!r.ok) return void toast.error("Couldn't sign out other sessions.");
      signOut("Signed out on all devices. Sign in again to continue.");
    } catch {
      toast.error("Couldn't sign out other sessions.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminShell
      title="System health"
      subtitle="What's set up and working. Secret values are never shown."
      right={
        <TinyButton disabled={loading} onClick={reload}>
          <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} /> Check again
        </TinyButton>
      }
    >
      <LoadState loading={loading && !data} error={error} onRetry={reload} />
      {data ? (
        <div className="space-y-4">
          <Panel
            className={cn(
              fails
                ? "border-destructive/30 bg-destructive/[0.03]"
                : warns
                  ? "border-amber-600/30 bg-amber-500/[0.04]"
                  : "border-emerald-700/25 bg-emerald-600/[0.04]",
            )}
          >
            <div className="flex items-center gap-3">
              {fails ? ICON.fail : warns ? ICON.warn : ICON.ok}
              <div>
                <div className="font-display text-[1.35rem] leading-tight">
                  {fails
                    ? `${fails} problem${fails > 1 ? "s" : ""} need fixing`
                    : warns
                      ? `${warns} thing${warns > 1 ? "s" : ""} to check`
                      : "Everything is working"}
                </div>
                <div className="text-[0.75rem] text-muted-foreground">
                  Checked{" "}
                  {new Date(data.checkedAt).toLocaleTimeString("en-GB", {
                    timeZone: "Asia/Kolkata",
                    hour: "numeric",
                    minute: "2-digit",
                  })}
                </div>
              </div>
            </div>
          </Panel>

          <div className="grid gap-4 lg:grid-cols-2">
            {GROUPS.map((g) => {
              const list = data.checks.filter((c) => c.group === g);
              if (!list.length) return null;
              return (
                <Panel key={g}>
                  <h2 className="font-display text-[1.3rem]">{g}</h2>
                  <ul className="mt-2 divide-y divide-hairline">
                    {list.map((c) => (
                      <li key={c.label} className="flex items-start gap-3 py-2.5">
                        <span className="mt-0.5">{ICON[c.status]}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[0.9rem]">{c.label}</span>
                          <span className="block break-words text-[0.76rem] text-muted-foreground">
                            {c.detail}
                          </span>
                        </span>
                        <span
                          className={cn(
                            "shrink-0 text-[0.68rem] uppercase tracking-[0.12em]",
                            c.status === "ok"
                              ? "text-emerald-700"
                              : c.status === "warn"
                                ? "text-amber-700"
                                : "text-destructive",
                          )}
                        >
                          {WORD[c.status]}
                        </span>
                      </li>
                    ))}
                  </ul>
                </Panel>
              );
            })}
          </div>

          <Panel>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-bronze" strokeWidth={1.5} />
              <h2 className="font-display text-[1.35rem]">Security</h2>
            </div>
            <ul className="mt-3 space-y-1.5 text-[0.86rem]">
              <li>
                Access code is stored{" "}
                {data.security.hashed ? (
                  "hashed (PBKDF2), never in plain text"
                ) : (
                  <b>in an old format — it is upgraded on the next sign-in</b>
                )}
                .
              </li>
              <li>
                Sessions last {data.security.sessionHours} hours and end when the access code
                changes.
                {data.security.dedicatedSecret
                  ? ""
                  : " Set ADMIN_SESSION_SECRET for a dedicated signing key."}
              </li>
              <li>
                After {data.security.attemptsBeforeLock} wrong codes, sign-in locks (5 minutes,
                doubling up to an hour).{" "}
                {data.security.lockedUntil ? (
                  <b className="text-destructive">
                    Locked until{" "}
                    {new Date(data.security.lockedUntil).toLocaleTimeString("en-GB", {
                      timeZone: "Asia/Kolkata",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                    .
                  </b>
                ) : data.security.failedAttempts ? (
                  <span className="text-amber-700">
                    {data.security.failedAttempts} wrong attempt
                    {data.security.failedAttempts > 1 ? "s" : ""} since the last successful sign-in.
                  </span>
                ) : (
                  <span className="text-muted-foreground">
                    No wrong attempts since the last sign-in.
                  </span>
                )}
              </li>
            </ul>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                to="/admin/settings"
                hash="access"
                className="press inline-flex min-h-9 items-center rounded-md border border-foreground/15 px-3 text-[0.8rem] hover:border-foreground/45"
              >
                Change access code
              </Link>
              {confirm ? (
                <>
                  <TinyButton tone="danger" disabled={busy} onClick={() => void signOutAll()}>
                    {busy ? "Signing out…" : "Yes, sign out everywhere"}
                  </TinyButton>
                  <TinyButton onClick={() => setConfirm(false)}>Cancel</TinyButton>
                </>
              ) : (
                <TinyButton onClick={() => setConfirm(true)}>Sign out on all devices</TinyButton>
              )}
            </div>
            {confirm ? (
              <p className="mt-2 text-[0.78rem] text-muted-foreground">
                Every signed-in phone and laptop (including this one) will need the access code
                again. Use this if a device was lost or the code was shared.
              </p>
            ) : null}
          </Panel>
        </div>
      ) : null}
    </AdminShell>
  );
}
