import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { BellRing, Check, Loader2, LogOut, Phone, RefreshCw, Image as ImageIcon } from "lucide-react";
import { Wordmark } from "@/components/screen";
import { pushPublicKey } from "@/lib/salon.functions";
import { stylistDay, stylistPushSubscribe, stylistSetStatus, stylistSignIn, type StylistAppt } from "@/lib/stylist.functions";
import { minuteLabel } from "@/lib/salon";
import { cn, haptic } from "@/lib/utils";

// "My day" for a stylist: their own appointments only, one tap to move each
// along, and alerts on this phone for their own bookings. Signed in with the
// stylist's own code (set by the salon in Admin → Staff).

export const Route = createFileRoute("/stylist")({
  head: () => ({
    meta: [
      { title: "My day — Hair by Bhargav" },
      { name: "robots", content: "noindex" },
      { name: "theme-color", content: "#1c1611" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "HB My day" },
    ],
    links: [
      { rel: "manifest", href: "/stylist.webmanifest" },
      { rel: "apple-touch-icon", href: "/icons/apple-touch-icon.png" },
    ],
  }),
  component: StylistScreen,
});

const KEY = "hb.stylist.v1";
type Session = { token: string; expiresAt: number; name: string };

function readSession(): Session | null {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? "null") as Session | null;
    return s && s.expiresAt > Date.now() ? s : null;
  } catch {
    return null;
  }
}

const iso = (offset: number) => new Date(Date.now() + 330 * 60_000 + offset * 86_400_000).toISOString().slice(0, 10);
const longDay = (d: string) =>
  new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

const NEXT: Record<string, { to: "arrived" | "in-chair" | "completed"; label: string } | undefined> = {
  pending: { to: "arrived", label: "Guest arrived" },
  upcoming: { to: "arrived", label: "Guest arrived" },
  arrived: { to: "in-chair", label: "Start · in the chair" },
  "in-chair": { to: "completed", label: "Done" },
};
const STATUS: Record<string, string> = {
  pending: "Booked",
  upcoming: "Booked",
  arrived: "Arrived",
  "in-chair": "In the chair",
  completed: "Done",
  "no-show": "No-show",
};

function StylistScreen() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    setSession(readSession());
    setReady(true);
  }, []);
  if (!ready) return <div className="min-h-[100svh] bg-background" />;
  return session ? (
    <MyDay
      session={session}
      onSignOut={() => {
        try {
          localStorage.removeItem(KEY);
        } catch {
          /* ignore */
        }
        setSession(null);
      }}
    />
  ) : (
    <SignIn onIn={setSession} />
  );
}

function SignIn({ onIn }: { onIn: (s: Session) => void }) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const submit = async () => {
    if (!code.trim()) return;
    setBusy(true);
    setError("");
    try {
      const r = await stylistSignIn({ data: { code } });
      if (!r.ok) {
        setError(
          "lockedFor" in r && r.lockedFor
            ? `Too many tries. Try again in ${Math.ceil(r.lockedFor / 60)} min.`
            : "That code didn't work. Ask the salon for your code.",
        );
        return;
      }
      const s = { token: r.token, expiresAt: r.expiresAt, name: r.name };
      try {
        localStorage.setItem(KEY, JSON.stringify(s));
      } catch {
        /* ignore */
      }
      onIn(s);
    } catch {
      setError("Couldn't reach the salon. Check your connection.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex min-h-[100svh] flex-col items-center justify-center bg-background px-6">
      <Wordmark className="h-14" />
      <div className="mt-8 text-[0.66rem] uppercase tracking-[0.3em] text-muted-foreground">Stylists</div>
      <h1 className="mt-2 font-display text-[2.2rem] leading-none">My day</h1>
      <form
        className="mt-8 w-full max-w-xs"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <input
          value={code}
          onChange={(e) => setCode(e.target.value)}
          type="password"
          autoComplete="current-password"
          placeholder="Your code"
          aria-label="Your code"
          className="w-full rounded-md border border-foreground/15 bg-card px-4 py-3.5 text-center text-[1rem] tracking-[0.2em] outline-none focus:border-foreground/45"
        />
        {error ? <p className="mt-3 text-center text-[0.85rem] text-destructive">{error}</p> : null}
        <button
          type="submit"
          disabled={busy || !code.trim()}
          className="press mt-4 flex min-h-12 w-full items-center justify-center rounded-sm bg-foreground text-[0.72rem] uppercase tracking-[0.22em] text-background disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Open my day"}
        </button>
      </form>
    </div>
  );
}

function MyDay({ session, onSignOut }: { session: Session; onSignOut: () => void }) {
  const [offset, setOffset] = useState(0);
  const date = iso(offset);
  const [data, setData] = useState<Awaited<ReturnType<typeof stylistDay>> | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await stylistDay({ data: { token: session.token, date } }));
      setError("");
    } catch (e) {
      if (e instanceof Error && /session/i.test(e.message)) return onSignOut();
      setError("Couldn't load. Pull down or tap refresh.");
    }
  }, [session.token, date, onSignOut]);

  useEffect(() => {
    setData(null);
    void load();
    const t = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(t);
  }, [load]);

  const move = async (a: StylistAppt, to: "arrived" | "in-chair" | "completed" | "no-show") => {
    if (to === "no-show" && !window.confirm(`Mark ${a.name} as a no-show?`)) return;
    setBusy(a.reference);
    haptic();
    const r = await stylistSetStatus({ data: { token: session.token, reference: a.reference, status: to } }).catch(() => null);
    setBusy(null);
    if (!r?.ok) return setError(r && "error" in r ? r.error : "Couldn't update. Try again.");
    void load();
  };

  const left = data?.appts.filter((a) => !["completed", "no-show"].includes(a.status)).length ?? 0;
  return (
    <div className="min-h-[100svh] bg-background pb-10">
      <header className="sticky top-0 z-20 border-b border-hairline bg-background/95 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3 backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[0.62rem] uppercase tracking-[0.26em] text-muted-foreground">My day · {session.name}</div>
            <div className="mt-0.5 truncate font-display text-[1.5rem] leading-tight">{longDay(date)}</div>
          </div>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => void load()} aria-label="Refresh" className="press flex h-10 w-10 items-center justify-center rounded-full hover:bg-foreground/5">
              <RefreshCw className="h-4 w-4" strokeWidth={1.5} />
            </button>
            <button type="button" onClick={onSignOut} aria-label="Sign out" className="press flex h-10 w-10 items-center justify-center rounded-full hover:bg-foreground/5">
              <LogOut className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-1 rounded-lg bg-foreground/[0.05] p-1 text-[0.85rem]">
          {["Today", "Tomorrow"].map((l, i) => (
            <button
              key={l}
              type="button"
              onClick={() => setOffset(i)}
              className={cn("press rounded-md py-2", offset === i ? "bg-card shadow-sm" : "text-muted-foreground")}
            >
              {l}
            </button>
          ))}
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 pt-4">
        <MyAlerts token={session.token} />
        {error ? <p className="mt-3 text-[0.85rem] text-destructive">{error}</p> : null}
        {!data ? (
          <div className="mt-10 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : data.appts.length === 0 ? (
          <p className="mt-10 text-center text-[0.95rem] text-muted-foreground">No appointments {offset ? "tomorrow" : "today"} yet.</p>
        ) : (
          <>
            <p className="mt-4 text-[0.82rem] text-muted-foreground">
              {data.appts.length} {data.appts.length === 1 ? "appointment" : "appointments"}
              {offset === 0 ? ` · ${left} still to come` : ""}
            </p>
            <ol className="mt-2 space-y-2.5">
              {data.appts.map((a) => {
                const next = NEXT[a.status];
                const live = offset === 0 && data.nowMinute >= a.time && data.nowMinute < a.end;
                const done = a.status === "completed" || a.status === "no-show";
                return (
                  <li
                    key={a.reference}
                    className={cn(
                      "rounded-xl border bg-card p-4",
                      live ? "border-bronze/60 shadow-[0_10px_28px_-18px_rgba(40,25,10,0.5)]" : "border-hairline",
                      done && "opacity-60",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[0.82rem] tabular-nums text-muted-foreground">
                          {minuteLabel(a.time)} – {minuteLabel(a.end)}
                        </div>
                        <div className="mt-0.5 truncate text-[1.1rem]">{a.name}</div>
                        <div className="mt-0.5 text-[0.85rem] text-muted-foreground">{a.services.join(" · ")}</div>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2.5 py-0.5 text-[0.7rem]",
                          a.status === "in-chair"
                            ? "bg-foreground text-background"
                            : a.status === "completed"
                              ? "bg-emerald-600/12 text-emerald-800"
                              : a.status === "no-show"
                                ? "bg-destructive/10 text-destructive"
                                : a.status === "arrived"
                                  ? "bg-champagne/30 text-bronze"
                                  : "bg-foreground/[0.06] text-muted-foreground",
                        )}
                      >
                        {STATUS[a.status] ?? a.status}
                      </span>
                    </div>
                    {a.note ? <p className="mt-2 rounded-md bg-champagne/15 px-3 py-2 text-[0.85rem]">“{a.note}”</p> : null}
                    {a.photos ? (
                      <p className="mt-2 flex items-center gap-1.5 text-[0.8rem] text-muted-foreground">
                        <ImageIcon className="h-3.5 w-3.5" strokeWidth={1.5} /> {a.photos} reference {a.photos === 1 ? "photo" : "photos"} (the guest can show you on their phone)
                      </p>
                    ) : null}
                    {!done ? (
                      <div className="mt-3 flex items-center gap-2">
                        <a href={`tel:${a.phone}`} aria-label={`Call ${a.name}`} className="press flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-foreground/15">
                          <Phone className="h-4 w-4" strokeWidth={1.5} />
                        </a>
                        {next && offset === 0 ? (
                          <button
                            type="button"
                            disabled={busy === a.reference}
                            onClick={() => void move(a, next.to)}
                            className="press flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-foreground text-[0.88rem] text-background disabled:opacity-50"
                          >
                            {busy === a.reference ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" strokeWidth={2} />}
                            {next.label}
                          </button>
                        ) : null}
                        {offset === 0 && ["pending", "upcoming"].includes(a.status) && data.nowMinute > a.time + 10 ? (
                          <button
                            type="button"
                            disabled={busy === a.reference}
                            onClick={() => void move(a, "no-show")}
                            className="press min-h-11 shrink-0 rounded-lg border border-destructive/30 px-3 text-[0.82rem] text-destructive"
                          >
                            No-show
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ol>
          </>
        )}
      </main>
    </div>
  );
}

const keyBytes = (b64: string) => {
  const t = b64.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(t + "===".slice((t.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

/** Alerts on this phone for the stylist's own bookings. */
function MyAlerts({ token }: { token: string }) {
  const [state, setState] = useState<"hidden" | "off" | "on" | "busy" | "blocked">("hidden");
  useEffect(() => {
    if (!("serviceWorker" in navigator && "PushManager" in window && "Notification" in window)) return setState("hidden");
    if (Notification.permission === "denied") return setState("blocked");
    void navigator.serviceWorker
      .register("/admin-sw.js")
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setState(sub && localStorage.getItem("hb.stylist.alerts") === "1" ? "on" : "off"))
      .catch(() => setState("off"));
  }, []);
  if (state === "hidden") return null;
  const on = async () => {
    setState("busy");
    try {
      if ((await Notification.requestPermission()) !== "granted") return setState("blocked");
      const reg = await navigator.serviceWorker.register("/admin-sw.js");
      await navigator.serviceWorker.ready;
      const { publicKey } = await pushPublicKey();
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) as BufferSource }));
      const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      await stylistPushSubscribe({
        data: { token, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, device: /iPhone/.test(navigator.userAgent) ? "iPhone" : "Phone", origin: location.origin },
      });
      localStorage.setItem("hb.stylist.alerts", "1");
      setState("on");
    } catch {
      setState("off");
    }
  };
  return state === "on" ? (
    <p className="flex items-center gap-2 text-[0.82rem] text-emerald-700">
      <Check className="h-4 w-4" strokeWidth={2} /> Alerts on: your new bookings, moves and cancellations.
    </p>
  ) : state === "blocked" ? (
    <p className="text-[0.82rem] text-muted-foreground">Notifications are blocked for this site in the phone's settings.</p>
  ) : (
    <button
      type="button"
      onClick={() => void on()}
      disabled={state === "busy"}
      className="press flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-bronze/40 bg-champagne/15 text-[0.85rem]"
    >
      {state === "busy" ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4 text-bronze" strokeWidth={1.5} />}
      Get alerts for my bookings on this phone
    </button>
  );
}
