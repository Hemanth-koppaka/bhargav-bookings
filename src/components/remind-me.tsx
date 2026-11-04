// "Remind me on this phone": free phone reminders for the guest's own booking
// (a day before and 2 hours before), sent by the salon's site through the
// phone's own push service. Where a browser can't do it (iPhone outside a
// Home Screen app), the button stays hidden: Add to calendar covers that.
import { useEffect, useState } from "react";
import { BellRing, Check, Loader2 } from "lucide-react";
import { auth, type Booking } from "@/lib/booking-store";
import { pushPublicKey, remindMeOnPhone } from "@/lib/salon.functions";
import { haptic, cn } from "@/lib/utils";

const KEY = (ref: string) => `hb.remind.${ref}`;

const keyBytes = (b64: string) => {
  const t = b64.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(t + "===".slice((t.length + 3) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

export function RemindMe({ booking, className, tone = "light" }: { booking: Booking; className?: string; tone?: "light" | "dark" }) {
  const [state, setState] = useState<"hidden" | "off" | "busy" | "on" | "blocked">("hidden");
  const [error, setError] = useState("");

  useEffect(() => {
    const ok = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    if (!ok) return setState("hidden");
    if (Notification.permission === "denied") return setState("blocked");
    let on = false;
    try {
      on = localStorage.getItem(KEY(booking.reference)) === "1";
    } catch {
      /* ignore */
    }
    setState(on && Notification.permission === "granted" ? "on" : "off");
  }, [booking.reference]);

  if (state === "hidden" || booking.status === "cancelled") return null;

  const turnOn = async () => {
    setError("");
    setState("busy");
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") return setState(perm === "denied" ? "blocked" : "off");
      const reg = await navigator.serviceWorker.register("/admin-sw.js");
      await navigator.serviceWorker.ready;
      const { publicKey } = await pushPublicKey();
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) as BufferSource }));
      const j = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      const r = await remindMeOnPhone({
        data: { reference: booking.reference, ...auth(booking), endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth, origin: location.origin },
      });
      if (!r.ok) {
        setError(r.error);
        return setState("off");
      }
      try {
        localStorage.setItem(KEY(booking.reference), "1");
      } catch {
        /* ignore */
      }
      haptic();
      setState("on");
    } catch {
      setError("Couldn't turn reminders on here. Add it to your calendar instead.");
      setState("off");
    }
  };

  const dark = tone === "dark";
  return (
    <div className={className}>
      {state === "on" ? (
        <p className={cn("flex items-center gap-2 text-[0.85rem]", dark ? "text-[#E8E1D8]/80" : "text-muted-foreground")}>
          <Check className="h-4 w-4 text-emerald-500" strokeWidth={2} /> We'll remind you on this phone a day before and 2 hours before.
        </p>
      ) : state === "blocked" ? (
        <p className={cn("text-[0.82rem]", dark ? "text-[#E8E1D8]/60" : "text-muted-foreground")}>
          Notifications are blocked for this site, so we can't remind you here. Add it to your calendar instead.
        </p>
      ) : (
        <button
          type="button"
          onClick={() => void turnOn()}
          disabled={state === "busy"}
          className={cn(
            "press flex min-h-12 w-full items-center justify-center gap-2.5 rounded-sm border px-5 text-[0.72rem] uppercase tracking-[0.2em] disabled:opacity-60",
            dark ? "border-[#E8E1D8]/25 text-[#E8E1D8] hover:border-[#E8E1D8]/50" : "border-foreground/20 hover:border-foreground/45",
          )}
        >
          {state === "busy" ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" strokeWidth={1.5} />}
          Remind me on this phone
        </button>
      )}
      {error ? <p className="mt-2 text-[0.8rem] text-destructive">{error}</p> : null}
    </div>
  );
}
