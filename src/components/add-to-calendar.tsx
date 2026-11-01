// "Add to calendar": a free reminder mechanism. The guest picks their own
// calendar (Google, Apple, Outlook or a .ics file) and that app reminds them.
// No login, no API, nothing paid; and nothing here can affect the booking.
import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarPlus, Check, ChevronDown } from "lucide-react";
import { BUSINESS } from "@/lib/salon";
import { servicesOf, type Booking } from "@/lib/booking-store";
import {
  buildIcs,
  googleUrl,
  icsFileName,
  outlookUrl,
  type CalendarBooking,
} from "@/lib/calendar";
import { cn } from "@/lib/utils";
import { sfx } from "@/lib/sfx";

type Option = "google" | "apple" | "outlook" | "ics";
const LABEL: Record<Option, string> = {
  google: "Google Calendar",
  apple: "Apple Calendar",
  outlook: "Outlook",
  ics: "Download .ICS",
};

/** Calendar details from the booking's own snapshot (falls back to the menu for old bookings). */
export function calendarBooking(b: Booking): CalendarBooking {
  const snap = b.snapshot;
  const menu = servicesOf(b);
  const names = snap?.services.map((s) => s.name) ?? menu.map((s) => s.name);
  const minutes = snap?.minutes ?? menu.reduce((n, s) => n + (s.minutes ?? s.slots * 30), 0);
  return {
    reference: b.reference,
    serviceName: names.join(" + ") || "Appointment",
    minutes: minutes || 30,
    price: snap?.price ?? menu.reduce((n, s) => n + s.price, 0),
    date: b.date,
    startMin: b.time,
    customerName: b.customer.name,
    // the salon's address from its settings (applied from the database at load)
    location: [BUSINESS.name, BUSINESS.address].filter(Boolean).join(", "),
    manageUrl:
      typeof window !== "undefined"
        ? `${window.location.origin}/manage?ref=${encodeURIComponent(b.reference)}`
        : "",
  };
}

// Fixed order with nothing pre-picked: the guest chooses their own calendar.
const ORDER: Option[] = ["google", "apple", "outlook", "ics"];
const STORE = "hb.calendar.";
const slotKey = (b: Booking) => `${b.date}T${b.time}`;

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/calendar;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function AddToCalendar({
  booking,
  tone = "dark",
  className,
}: {
  booking: Booking;
  /** dark = cinematic confirmation screen, light = ivory pages */
  tone?: "dark" | "light";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [added, setAdded] = useState<"none" | "current" | "outdated">("none");
  const [failed, setFailed] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const cancelled = booking.status === "cancelled";

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORE + booking.reference);
      setAdded(saved ? (saved === slotKey(booking) ? "current" : "outdated") : "none");
    } catch {
      /* storage unavailable */
    }
  }, [booking]);

  // close on outside tap / Escape
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) =>
      wrap.current && !wrap.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const cal = useMemo(() => {
    try {
      return calendarBooking(booking);
    } catch {
      return null;
    }
  }, [booking]);

  const remember = () => {
    try {
      localStorage.setItem(STORE + booking.reference, slotKey(booking));
    } catch {
      /* ignore */
    }
    setAdded("current");
  };

  const choose = (o: Option) => {
    setFailed(false);
    try {
      if (!cal) throw new Error("no details");
      if (o === "google") window.open(googleUrl(cal), "_blank", "noopener");
      else if (o === "outlook") window.open(outlookUrl(cal), "_blank", "noopener");
      else {
        const ics = buildIcs(cal, { cancelled });
        const iOS =
          /iPhone|iPad|iPod/.test(navigator.userAgent) ||
          (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
        // iPhone/iPad: open the event directly (Safari shows "Add to Calendar")
        if (o === "apple" && iOS)
          window.location.href = `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
        else download(icsFileName(cal), ics);
      }
      if (!cancelled) remember();
      setOpen(false);
      sfx.calendarDone();
    } catch {
      setFailed(true);
      sfx.error();
    }
  };

  const fallbackIcs = () => {
    try {
      if (!cal) throw new Error("no details");
      download(icsFileName(cal), buildIcs(cal, { cancelled }));
      if (!cancelled) remember();
      setFailed(false);
      sfx.calendarDone();
    } catch {
      setFailed(true);
      sfx.error();
    }
  };

  const dark = tone === "dark";
  const primary = dark
    ? "bg-[#C9A96A] text-[#0B0B0B] hover:opacity-90"
    : "bg-foreground text-background hover:bg-foreground/88";

  if (cancelled) {
    return (
      <div className={className}>
        <button
          onClick={fallbackIcs}
          className={cn(
            "press flex min-h-12 w-full items-center justify-center gap-3 rounded-sm border px-6 text-[0.68rem] uppercase tracking-[0.2em]",
            dark ? "border-[#E8E1D8]/28 text-[#E8E1D8]" : "border-foreground/20 text-foreground/80",
          )}
        >
          <CalendarPlus className="h-4 w-4" strokeWidth={1.25} /> Remove from calendar (.ics)
        </button>
        <p
          className={cn(
            "mt-2 text-center text-[0.74rem]",
            dark ? "text-[#E8E1D8]/55" : "text-muted-foreground",
          )}
        >
          Calendars don't update by themselves — open this file or delete the event.
        </p>
      </div>
    );
  }

  return (
    <div ref={wrap} className={cn("relative", className)}>
      <button
        onClick={() => setOpen((v) => !v)}
        data-sfx="calendar"
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(
          "press sheen flex min-h-14 w-full items-center justify-center gap-3 rounded-sm px-6 text-[0.7rem] uppercase tracking-[0.22em]",
          primary,
        )}
      >
        <CalendarPlus className="h-4 w-4" strokeWidth={1.25} />
        Add to calendar
        <ChevronDown
          className={cn("h-3.5 w-3.5 transition-transform", open && "rotate-180")}
          strokeWidth={1.5}
        />
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Add appointment to"
          className={cn(
            "fade-rise z-40 mt-2 w-full overflow-hidden rounded-sm border sm:absolute sm:left-0 sm:right-0 sm:top-full",
            dark
              ? "border-[#E8E1D8]/18 bg-[#141210] shadow-[0_18px_40px_-20px_rgba(0,0,0,0.8)]"
              : "border-hairline bg-card shadow-lg",
          )}
        >
          <div
            className={cn(
              "px-5 pt-3 pb-1 text-[0.6rem] uppercase tracking-[0.26em]",
              dark ? "text-[#E8E1D8]/45" : "text-muted-foreground",
            )}
          >
            Add appointment to
          </div>
          {ORDER.map((o, i) => (
            <button
              key={o}
              role="menuitem"
              data-sfx="secondary"
              onClick={() => choose(o)}
              className={cn(
                "flex w-full items-center justify-between px-5 py-3.5 text-left text-[0.95rem] transition-colors",
                dark ? "text-[#E8E1D8] hover:bg-[#E8E1D8]/[0.06]" : "hover:bg-foreground/[0.04]",
                i > 0 && (dark ? "border-t border-[#E8E1D8]/10" : "border-t border-hairline"),
              )}
            >
              {LABEL[o]}
            </button>
          ))}
        </div>
      ) : null}

      {failed ? (
        <div
          role="alert"
          className={cn(
            "mt-3 text-center text-[0.8rem]",
            dark ? "text-[#E8E1D8]/80" : "text-destructive",
          )}
        >
          We couldn't create the calendar event.{" "}
          <button onClick={fallbackIcs} className="underline underline-offset-4">
            Download the appointment as an .ICS file instead.
          </button>
        </div>
      ) : added === "current" ? (
        <p
          className={cn(
            "mt-2.5 flex items-center justify-center gap-1.5 text-[0.62rem] uppercase tracking-[0.24em]",
            dark ? "text-[#C9A96A]" : "text-bronze",
          )}
        >
          <Check className="h-3.5 w-3.5" strokeWidth={1.75} /> Added to calendar
        </p>
      ) : added === "outdated" ? (
        <p
          className={cn(
            "mt-2.5 text-center text-[0.76rem]",
            dark ? "text-[#E8E1D8]/70" : "text-muted-foreground",
          )}
        >
          Your calendar still shows the old time — add the new time.
        </p>
      ) : null}
    </div>
  );
}
