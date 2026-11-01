// Admin console shell and shared primitives. The console is a working tool:
// same brand (ivory, ink, bronze, Cormorant headings) but denser, quicker to
// scan, and built for one-handed use on a phone as much as a laptop.
import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import {
  BarChart3,
  CalendarOff,
  Contact,
  BellRing,
  HeartPulse,
  History,
  CalendarDays,
  Ellipsis,
  FileText,
  LayoutGrid,
  ListChecks,
  LogOut,
  Scissors,
  Search,
  Settings,
  SlidersHorizontal,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdmin, STATUS_LABEL, type ApptStatus } from "@/lib/admin-store";
import { inr } from "@/lib/salon";
import { Wordmark } from "@/components/screen";
import { GlobalSearch } from "@/components/admin-ops";

type NavItem = { to: string; label: string; icon: typeof LayoutGrid; exact?: boolean };

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  { label: "Command center", items: [{ to: "/admin", label: "Today", icon: LayoutGrid, exact: true }] },
  {
    label: "Operations",
    items: [
      { to: "/admin/calendar", label: "Calendar", icon: CalendarDays },
      { to: "/admin/appointments", label: "Bookings", icon: ListChecks },
      { to: "/admin/customers", label: "Customers", icon: Users },
      { to: "/admin/staff", label: "Staff", icon: Contact },
      { to: "/admin/closures", label: "Closures", icon: CalendarOff },
    ],
  },
  {
    label: "Catalogue",
    items: [
      { to: "/admin/services", label: "Services", icon: Scissors },
      { to: "/admin/content", label: "Site content", icon: FileText },
    ],
  },
  {
    label: "Insights",
    items: [
      { to: "/admin/reports", label: "Reports", icon: BarChart3 },
      { to: "/admin/activity", label: "Activity", icon: History },
    ],
  },
  {
    label: "System",
    items: [
      { to: "/admin/rules", label: "Booking rules", icon: SlidersHorizontal },
      { to: "/admin/notifications", label: "Notifications", icon: BellRing },
      { to: "/admin/system", label: "System health", icon: HeartPulse },
      { to: "/admin/settings", label: "Settings", icon: Settings },
    ],
  },
];

/** Flat list (kept for older imports). */
export const NAV = NAV_GROUPS.flatMap((g) => g.items);

const MOBILE: NavItem[] = [
  { to: "/admin", label: "Today", icon: LayoutGrid, exact: true },
  { to: "/admin/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/admin/appointments", label: "Bookings", icon: ListChecks },
  { to: "/admin/customers", label: "Customers", icon: Users },
];

export function AdminShell({
  title,
  subtitle,
  right,
  children,
  wide,
}: {
  title: string;
  subtitle?: string | undefined;
  right?: ReactNode;
  children: ReactNode;
  /** Full-width content (calendar). */
  wide?: boolean;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { signOut, weakCode } = useAdmin();
  const [searchOpen, setSearchOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const isActive = (to: string, exact?: boolean) =>
    exact ? pathname === to || pathname === to + "/" : pathname.startsWith(to);

  // "/" opens search from anywhere (except while typing)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      if (!typing && (e.key === "/" || ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k"))) {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex min-h-[100svh] bg-background">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-[100svh] w-56 shrink-0 flex-col border-r border-hairline bg-card/40 px-4 py-5 lg:flex">
        <Link to="/admin" className="flex items-center gap-3 px-2">
          <Wordmark className="h-9" />
          <span className="text-[0.6rem] uppercase leading-tight tracking-[0.24em] text-muted-foreground">
            Admin
            <br />
            portal
          </span>
        </Link>
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="press mt-6 flex h-9 items-center gap-2.5 rounded-md border border-hairline bg-background px-3 text-[0.8rem] text-muted-foreground hover:border-foreground/30"
        >
          <Search className="h-3.5 w-3.5" strokeWidth={1.5} />
          Search
          <kbd className="ml-auto rounded border border-hairline px-1.5 text-[0.65rem]">/</kbd>
        </button>
        <nav className="mt-5 flex flex-1 flex-col gap-4 overflow-y-auto">
          {NAV_GROUPS.map((g) => (
            <div key={g.label}>
              <div className="px-2 text-[0.58rem] uppercase tracking-[0.22em] text-muted-foreground/80">{g.label}</div>
              <div className="mt-1.5 flex flex-col gap-0.5">
                {g.items.map((n) => (
                  <Link
                    key={n.to}
                    to={n.to as never}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[0.85rem] transition-colors",
                      isActive(n.to, n.exact)
                        ? "bg-foreground text-background"
                        : "text-foreground/70 hover:bg-foreground/[0.04] hover:text-foreground",
                    )}
                  >
                    <n.icon className="h-4 w-4" strokeWidth={1.4} />
                    {n.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <button
          onClick={() => signOut()}
          className="press mt-3 flex items-center gap-2.5 rounded-md px-2.5 py-2 text-[0.85rem] text-foreground/55 hover:bg-foreground/[0.04] hover:text-foreground"
        >
          <LogOut className="h-4 w-4" strokeWidth={1.4} /> Sign out
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-hairline bg-background/92 px-4 py-3.5 backdrop-blur-md safe-t lg:px-8 lg:py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0">
              <h1 className="truncate font-display text-[1.9rem] leading-none lg:text-[2.2rem]">{title}</h1>
              {subtitle ? <div className="mt-1 truncate text-[0.78rem] text-muted-foreground">{subtitle}</div> : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {right}
              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                aria-label="Search"
                className="press flex h-9 w-9 items-center justify-center rounded-md border border-hairline lg:hidden"
              >
                <Search className="h-4 w-4" strokeWidth={1.5} />
              </button>
            </div>
          </div>
        </header>
        {weakCode ? (
          <div
            role="status"
            className="flex flex-wrap items-center justify-between gap-3 border-b border-destructive/20 bg-destructive/[0.05] px-4 py-2.5 text-[0.82rem] lg:px-8"
          >
            <span>This console is protected by a short or default access code.</span>
            <Link to="/admin/settings" hash="access" className="font-medium text-destructive underline underline-offset-4">
              Set a stronger code
            </Link>
          </div>
        ) : null}

        <main className="flex-1 px-4 pb-28 pt-5 lg:px-8 lg:pb-12">
          <div className={cn("page-in mx-auto w-full", wide ? "max-w-none" : "max-w-6xl")}>{children}</div>
        </main>

        {/* Phone bottom navigation */}
        <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-hairline bg-background/96 backdrop-blur-md safe-b lg:hidden">
          {MOBILE.map((n) => (
            <Link
              key={n.to}
              to={n.to as never}
              className={cn(
                "flex flex-col items-center gap-1 pt-2.5 text-[0.62rem] tracking-[0.04em]",
                isActive(n.to, n.exact) ? "text-foreground" : "text-foreground/45",
              )}
            >
              <n.icon className="h-5 w-5" strokeWidth={1.4} />
              {n.label}
            </Link>
          ))}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            className="flex flex-col items-center gap-1 pt-2.5 text-[0.62rem] tracking-[0.04em] text-foreground/45"
          >
            <Ellipsis className="h-5 w-5" strokeWidth={1.4} />
            More
          </button>
        </nav>
        {moreOpen ? (
          <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal aria-label="More">
            <button className="absolute inset-0 bg-ink/40" aria-label="Close" onClick={() => setMoreOpen(false)} />
            <div className="slide-in absolute inset-x-0 bottom-0 rounded-t-xl bg-background p-4 pb-8 safe-b">
              <div className="flex items-center justify-between">
                <span className="text-[0.7rem] uppercase tracking-[0.22em] text-muted-foreground">More</span>
                <button onClick={() => setMoreOpen(false)} aria-label="Close" className="press p-2">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {[
                  { to: "/admin/staff", label: "Staff", icon: Contact },
                  { to: "/admin/closures", label: "Closures", icon: CalendarOff },
                  { to: "/admin/services", label: "Services", icon: Scissors },
                  { to: "/admin/content", label: "Site content", icon: FileText },
                  { to: "/admin/rules", label: "Booking rules", icon: SlidersHorizontal },
                  { to: "/admin/notifications", label: "Messages", icon: BellRing },
                  { to: "/admin/reports", label: "Reports", icon: BarChart3 },
                  { to: "/admin/activity", label: "Activity", icon: History },
                  { to: "/admin/system", label: "Health", icon: HeartPulse },
                  { to: "/admin/settings", label: "Settings", icon: Settings },
                ].map((n) => (
                  <Link
                    key={n.label}
                    to={n.to as never}
                    onClick={() => setMoreOpen(false)}
                    className="press flex flex-col items-center gap-2 rounded-md border border-hairline py-4 text-[0.8rem]"
                  >
                    <n.icon className="h-5 w-5" strokeWidth={1.4} />
                    {n.label}
                  </Link>
                ))}
                <button
                  onClick={() => signOut()}
                  className="press col-span-3 mt-2 flex items-center justify-center gap-2 rounded-md border border-hairline py-3 text-[0.85rem] text-foreground/70"
                >
                  <LogOut className="h-4 w-4" strokeWidth={1.4} /> Sign out
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
      <GlobalSearch open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
  );
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn("rounded-md border border-hairline bg-card p-4 lg:p-5", className)}>{children}</section>;
}

export function Stat({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "warn" }) {
  return (
    <div className="rounded-md border border-hairline bg-card px-4 py-3.5">
      <div className="text-[0.62rem] uppercase tracking-[0.2em] text-muted-foreground">{label}</div>
      <div className={cn("mt-1.5 font-display text-[1.9rem] leading-none tabular-nums", tone === "warn" && "text-destructive")}>
        {value}
      </div>
      {hint ? <div className="mt-1 text-[0.72rem] text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

const STATUS_STYLE: Record<ApptStatus, string> = {
  pending: "border-amber-600/40 bg-amber-500/10 text-amber-800",
  upcoming: "border-foreground/25 text-foreground/75",
  arrived: "border-bronze/50 bg-champagne/20 text-bronze",
  "in-chair": "border-foreground bg-foreground text-background",
  completed: "border-emerald-700/25 bg-emerald-600/10 text-emerald-800",
  "no-show": "border-destructive/40 text-destructive",
  cancelled: "border-destructive/25 text-destructive/70",
};

export function StatusPill({ status }: { status: ApptStatus }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[0.66rem] font-medium tracking-[0.04em]",
        STATUS_STYLE[status],
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

export function Money({ value }: { value: number }) {
  return <span className="tabular-nums">{inr(value)}</span>;
}

export const inputClass =
  "w-full rounded-md border border-foreground/15 bg-background px-3 py-2.5 text-[0.95rem] outline-none transition-colors placeholder:text-foreground/35 focus:border-foreground/50";

export function TinyButton({
  children,
  onClick,
  active,
  tone = "default",
  type = "button",
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  active?: boolean;
  tone?: "default" | "danger" | "primary";
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "press inline-flex min-h-9 items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-[0.8rem] transition-colors disabled:opacity-40",
        active || tone === "primary"
          ? "border-foreground bg-foreground text-background hover:bg-foreground/88"
          : tone === "danger"
            ? "border-destructive/35 text-destructive hover:bg-destructive/[0.06]"
            : "border-foreground/15 hover:border-foreground/45",
      )}
    >
      {children}
    </button>
  );
}

export function Empty({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-foreground/15 px-6 py-10 text-center">
      <p className="text-[0.92rem] text-muted-foreground">{title}</p>
      {action}
    </div>
  );
}
