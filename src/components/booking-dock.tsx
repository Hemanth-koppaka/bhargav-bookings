// The appointment dock: a compact, persistent control that travels with the
// guest through Services → Time → Details → Review on phones. It sits in the
// page flow at the bottom (sticky), so it always has its own space: content
// can always be scrolled fully above it and is never hidden underneath.
// Tapping the summary opens "Your appointment" (the services chosen, editable);
// it never opens by itself.
import { useEffect, useRef, type ReactNode } from "react";
import { ArrowRight, CalendarCheck2, ChevronDown, ChevronUp, X } from "lucide-react";
import { useBooking } from "@/lib/booking-store";
import { formatDuration, inr } from "@/lib/salon";
import { sfx } from "@/lib/sfx";
import { cn } from "@/lib/utils";

/** "Your appointment": the chosen services (editable), with live count, time and total. */
export function YourAppointment({
  onAddMore,
  onContinue,
  continueLabel = "Choose a time",
  onClose,
  className,
}: {
  onAddMore: () => void;
  onContinue: () => void;
  continueLabel?: string;
  onClose?: () => void;
  className?: string;
}) {
  const { selected, removeService, totalMinutes, totalPrice, hasFromPricing } = useBooking();
  return (
    <div className={cn("fade-rise rounded-2xl border border-[#DEDAD2] bg-[#FBF9F5]", className)}>
      <div className="flex items-center justify-between px-4 pt-3.5 lg:px-5">
        <span className="flex items-center gap-2 text-[0.66rem] uppercase tracking-[0.28em] text-foreground/70">
          <CalendarCheck2 className="h-4 w-4" strokeWidth={1.2} /> Your appointment
        </span>
        <span className="flex items-center gap-2">
          <span className="rounded-full bg-champagne/30 px-2.5 py-0.5 text-[0.66rem] uppercase tracking-[0.16em] tabular-nums">
            {selected.length} {selected.length === 1 ? "service" : "services"}
          </span>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close your appointment"
              className="press -mr-1.5 flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground hover:bg-foreground/5"
            >
              <ChevronDown className="h-4 w-4" strokeWidth={1.5} />
            </button>
          ) : null}
        </span>
      </div>
      <ul className="mt-1.5 max-h-[38svh] divide-y divide-hairline overflow-y-auto px-4 lg:px-5">
        {selected.map((x) => (
          <li key={x.id} className="flex items-center gap-3 py-2.5">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[0.95rem]">{x.name}</span>
              <span className="block text-[0.74rem] text-muted-foreground">{formatDuration(x.minutes ?? x.slots * 30)}</span>
            </span>
            <span className="shrink-0 tabular-nums">
              {inr(x.price)}
            </span>
            <button
              type="button"
              onClick={() => {
                sfx.serviceSelect(false);
                removeService(x.id);
              }}
              aria-label={`Remove ${x.name}`}
              className="press -mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-foreground/5 hover:text-foreground"
            >
              <X className="h-4 w-4" strokeWidth={1.5} />
            </button>
          </li>
        ))}
      </ul>
      <div className="mx-4 flex items-baseline justify-between border-t border-hairline py-2.5 lg:mx-5">
        <span className="text-[0.84rem] text-muted-foreground">
          {selected.length} {selected.length === 1 ? "service" : "services"} · {formatDuration(totalMinutes)}
        </span>
        <span key={totalPrice} className="tick-in font-display text-[1.35rem] leading-none">
          {inr(totalPrice)}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 px-4 pb-3.5 lg:px-5">
        <button
          type="button"
          data-sfx="secondary"
          onClick={onAddMore}
          className="press min-h-11 rounded-xl border border-foreground/20 text-[0.66rem] uppercase tracking-[0.18em]"
        >
          Add more
        </button>
        <button
          type="button"
          data-sfx="primary"
          onClick={onContinue}
          disabled={!selected.length}
          className="press flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#1c1611] text-[0.66rem] uppercase tracking-[0.18em] text-ivory disabled:opacity-40"
        >
          {continueLabel} <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}

/**
 * The compact dock (about 64px): count · time · price on the left (tap to see
 * and edit the services), the step's next action on the right.
 */
export function BookingDock({
  action,
  onAction,
  disabled,
  open = false,
  onToggle,
  sheet,
  sub,
  summary,
  className,
}: {
  action: ReactNode;
  onAction: () => void;
  disabled?: boolean;
  /** The basket sheet is showing (replaces the pill until closed). */
  open?: boolean;
  /** Tap on the summary opens/closes the basket; omit to make it static. */
  onToggle?: () => void;
  sheet?: ReactNode;
  /** A tiny second line, e.g. the chosen date and time. */
  sub?: ReactNode;
  /** Replaces the services summary (e.g. on Review). */
  summary?: ReactNode;
  className?: string;
}) {
  const { selected, totalMinutes, totalPrice, hasFromPricing } = useBooking();
  // an open summary folds away when the guest taps anywhere else on the page
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef(onToggle);
  toggle.current = onToggle;
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (root.current && !root.current.contains(e.target as Node)) toggle.current?.();
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);
  return (
    <div
      ref={root}
      data-keep-light=""
      className={cn(
        "sticky bottom-0 z-30 mt-auto bg-gradient-to-t from-background via-background/95 to-background/0 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] md:hidden",
        className,
      )}
    >
      {open && sheet ? (
        sheet
      ) : (
        <div className="fade-rise mx-auto flex h-16 max-w-3xl items-center gap-2 rounded-2xl border border-[#DEDAD2] bg-[#FBF9F5]/95 p-2 pl-3 shadow-[0_12px_30px_-20px_rgba(40,25,10,0.5)] backdrop-blur-sm">
          {summary ?? (
            <button
              type="button"
              onClick={onToggle}
              disabled={!onToggle}
              aria-expanded={onToggle ? open : undefined}
              aria-label={onToggle ? "Show your appointment" : undefined}
              className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
            >
              <span className="tap-icon relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-foreground/12">
                <CalendarCheck2 key={selected.length} className="icon-tap h-[18px] w-[18px]" strokeWidth={1.1} />
                <span
                  key={selected.length}
                  className="pop-in absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-bronze px-1 text-[0.62rem] text-ivory tabular-nums"
                >
                  {selected.length}
                </span>
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.78rem] text-muted-foreground">
                  {sub ?? (
                    <>
                      {selected.length} {selected.length === 1 ? "service" : "services"} · {formatDuration(totalMinutes)}
                    </>
                  )}
                </span>
                <span key={totalPrice} className="tick-in block font-display text-[1.25rem] leading-tight">
                  {inr(totalPrice)}
                </span>
              </span>
              {onToggle ? <ChevronUp className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={1.5} /> : null}
            </button>
          )}
          <button
            type="button"
            data-sfx="primary"
            onClick={onAction}
            disabled={disabled}
            className="press flex h-12 shrink-0 items-center gap-2 rounded-xl bg-[#1c1611] px-4 text-[0.7rem] uppercase tracking-[0.16em] text-ivory disabled:bg-foreground/25"
          >
            {action}
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
          </button>
        </div>
      )}
    </div>
  );
}
