// "Booking alerts on this phone": turns free web-push notifications on or off
// for the device the admin console is open on, sends a test, and lists the
// phones that get alerts. iPhones need the console added to the Home Screen
// first (Apple's rule for web notifications); the panel explains that.
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { BellRing, BellOff, Loader2, Share, Smartphone, X } from "lucide-react";
import { useAdmin } from "@/lib/admin-store";
import { adminPushInfo, adminPushSubscribe, adminPushTest, adminPushUnsubscribe } from "@/lib/push.functions";
import { cn } from "@/lib/utils";

type State = "checking" | "unsupported" | "ios-home" | "denied" | "off" | "on";

const keyBytes = (b64: string) => {
  const t = b64.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(t + "===".slice((t.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

function deviceName() {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad|Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return "iPad";
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? "Android phone" : "Android tablet";
  if (/Mac/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows PC";
  return "This device";
}

const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
const standalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

async function registration() {
  return navigator.serviceWorker.register("/admin-sw.js");
}

function usePhoneAlerts() {
  const { pin } = useAdmin();
  const [state, setState] = useState<State>("checking");
  const [busy, setBusy] = useState(false);
  const [devices, setDevices] = useState<{ endpoint: string; device: string; at: number }[]>([]);

  const refresh = useCallback(async () => {
    const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    if (!supported) return setState(isIos() && !standalone() ? "ios-home" : "unsupported");
    if (Notification.permission === "denied") return setState("denied");
    try {
      const reg = await registration();
      const sub = await reg.pushManager.getSubscription();
      const info = await adminPushInfo({ data: { pin } });
      setDevices(info.devices);
      setState(sub && info.devices.some((d) => d.endpoint === sub.endpoint) ? "on" : "off");
    } catch {
      setState("off");
    }
  }, [pin]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const turnOn = async () => {
    setBusy(true);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "off");
        return;
      }
      const reg = await registration();
      await navigator.serviceWorker.ready;
      const { publicKey } = await adminPushInfo({ data: { pin } });
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) as BufferSource }));
      const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      await adminPushSubscribe({
        data: { pin, endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, device: deviceName(), origin: location.origin },
      });
      toast.success("Booking alerts are on for this phone.");
      await refresh();
      void adminPushTest({ data: { pin } }).catch(() => {});
    } catch {
      toast.error("Couldn't turn alerts on. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const turnOff = async () => {
    setBusy(true);
    try {
      const reg = await registration();
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await adminPushUnsubscribe({ data: { pin, endpoint: sub.endpoint } });
        await sub.unsubscribe();
      }
      toast.success("Alerts are off for this phone.");
      await refresh();
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    setBusy(true);
    try {
      const r = await adminPushTest({ data: { pin } });
      if (r.sent) toast.success(`Test sent to ${r.sent} ${r.sent === 1 ? "phone" : "phones"}.`);
      else toast.error("No phone received the test. Turn alerts on again on that phone.");
    } finally {
      setBusy(false);
    }
  };

  const forget = async (endpoint: string) => {
    await adminPushUnsubscribe({ data: { pin, endpoint } });
    await refresh();
  };

  return { state, busy, devices, turnOn, turnOff, test, forget };
}

const btn =
  "press inline-flex min-h-10 items-center justify-center gap-2 rounded-lg px-4 text-[0.85rem] font-medium disabled:opacity-50";

/** Full panel (Notifications page). */
export function PhoneAlertsPanel() {
  const a = usePhoneAlerts();
  return (
    <section className="rounded-md border border-hairline bg-card p-4 lg:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-[1.35rem]">Booking alerts on your phone</h2>
          <p className="mt-1 text-[0.82rem] text-muted-foreground">
            Free. A notification pops up the moment a guest books, moves or cancels online.
          </p>
        </div>
        <BellRing className="mt-1 h-5 w-5 shrink-0 text-bronze" strokeWidth={1.5} />
      </div>
      <div className="mt-4">
        <Body a={a} />
      </div>
      {a.devices.length ? (
        <div className="mt-5 border-t border-hairline pt-4">
          <div className="text-[0.62rem] uppercase tracking-[0.2em] text-muted-foreground">
            Getting alerts ({a.devices.length})
          </div>
          <ul className="mt-2 space-y-1.5">
            {a.devices.map((d) => (
              <li key={d.endpoint} className="flex items-center gap-2.5 text-[0.88rem]">
                <Smartphone className="h-4 w-4 text-muted-foreground" strokeWidth={1.5} />
                <span className="flex-1">
                  {d.device}{" "}
                  <span className="text-[0.75rem] text-muted-foreground">
                    · since {new Date(d.at).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => void a.forget(d.endpoint)}
                  aria-label={`Stop alerts on ${d.device}`}
                  className="press rounded p-1.5 text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

function Body({ a }: { a: ReturnType<typeof usePhoneAlerts> }) {
  if (a.state === "checking")
    return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  if (a.state === "ios-home")
    return (
      <ol className="space-y-1.5 text-[0.88rem]">
        <li>
          1. In Safari, tap <Share className="inline h-4 w-4 align-[-3px]" strokeWidth={1.5} /> Share, then{" "}
          <b className="font-medium">Add to Home Screen</b>.
        </li>
        <li>2. Open <b className="font-medium">HB Salon</b> from your Home Screen and sign in.</li>
        <li>3. Come back here and tap “Turn on alerts on this phone”.</li>
      </ol>
    );
  if (a.state === "unsupported")
    return (
      <p className="text-[0.88rem] text-muted-foreground">
        This browser can't show notifications. Open the console in Chrome (Android) or add it to the Home Screen (iPhone).
      </p>
    );
  if (a.state === "denied")
    return (
      <p className="text-[0.88rem] text-muted-foreground">
        Notifications are blocked for this site. Allow them in the phone's settings for this site (or the HB Salon app), then come back.
      </p>
    );
  if (a.state === "on")
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-2 inline-flex items-center gap-2 text-[0.88rem] text-emerald-700">
          <span className="h-2 w-2 rounded-full bg-emerald-600" /> On for this phone
        </span>
        <button type="button" disabled={a.busy} onClick={() => void a.test()} className={cn(btn, "border border-foreground/15")}>
          Send a test
        </button>
        <button type="button" disabled={a.busy} onClick={() => void a.turnOff()} className={cn(btn, "text-muted-foreground")}>
          <BellOff className="h-4 w-4" strokeWidth={1.5} /> Turn off
        </button>
      </div>
    );
  return (
    <button type="button" disabled={a.busy} onClick={() => void a.turnOn()} className={cn(btn, "bg-foreground text-background")}>
      {a.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" strokeWidth={1.5} />}
      Turn on alerts on this phone
    </button>
  );
}

/** A small nudge on the Today screen until this phone has alerts on (can be dismissed). */
export function PhoneAlertsNudge() {
  const a = usePhoneAlerts();
  const [hidden, setHidden] = useState(true);
  useEffect(() => {
    try {
      setHidden(localStorage.getItem("hb.alerts.nudge") === "off");
    } catch {
      setHidden(false);
    }
  }, []);
  if (hidden || !["off", "ios-home"].includes(a.state)) return null;
  const dismiss = () => {
    setHidden(true);
    try {
      localStorage.setItem("hb.alerts.nudge", "off");
    } catch {
      /* ignore */
    }
  };
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-bronze/30 bg-champagne/15 px-4 py-3">
      <BellRing className="h-5 w-5 shrink-0 text-bronze" strokeWidth={1.5} />
      <div className="min-w-0 flex-1 text-[0.88rem]">
        <b className="font-medium">Get booking alerts on this phone</b>
        <span className="block text-[0.78rem] text-muted-foreground">
          {a.state === "ios-home"
            ? "On iPhone: Share → Add to Home Screen, open HB Salon, then turn alerts on."
            : "Free. New bookings, moves and cancellations pop up instantly."}
        </span>
      </div>
      {a.state === "off" ? (
        <button type="button" disabled={a.busy} onClick={() => void a.turnOn()} className={cn(btn, "bg-foreground text-background")}>
          {a.busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Turn on
        </button>
      ) : null}
      <button type="button" onClick={dismiss} aria-label="Not now" className="press rounded p-1.5 text-muted-foreground hover:bg-foreground/5">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
