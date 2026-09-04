import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  CalendarDays,
  LayoutGrid,
  ListChecks,
  LogOut,
  Scissors,
  Settings,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAdmin, STATUS_LABEL, type ApptStatus } from "@/lib/admin-store";
import { inr } from "@/lib/salon";

export const NAV = [
  { to: "/admin", label: "Today", icon: LayoutGrid, exact: true },
  { to: "/admin/calendar", label: "Calendar", icon: CalendarDays },
  { to: "/admin/appointments", label: "Bookings", icon: ListChecks },
  { to: "/admin/customers", label: "Clients", icon: Users },
  { to: "/admin/services", label: "Menu", icon: Scissors },
  { to: "/admin/settings", label: "Settings", icon: Settings },
] as const;

export function AdminShell({ title, subtitle, right, children }: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
  children: ReactNode;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { signOut, settings } = useAdmin();

  const isActive = (to: string, exact?: boolean) =>
    exact ? pathname === to || pathname === to + "/" : pathname.startsWith(to);

  return (
    <div className="flex min-h-[100svh] bg-background">
      {/* Desktop rail */}
      <aside className="sticky top-0 hidden h-[100svh] w-60 shrink-0 flex-col border-r border-hairline px-5 py-7 lg:flex">
        <div>
          <div className="font-display text-2xl leading-none">{settings.salonName}</div>
          <div className="eyebrow mt-2">Operations</div>
        </div>
        <nav className="mt-10 flex flex-col gap-1">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className={cn(
                "label-caps flex items-center gap-3 px-3 py-3 transition-colors",
                isActive(n.to, "exact" in n ? n.exact : false)
                  ? "bg-foreground text-background"
                  : "text-foreground/60 hover:text-foreground",
              )}
            >
              <n.icon className="h-4 w-4" strokeWidth={1.25} />
              {n.label}
            </Link>
          ))}
        </nav>
        <button
          onClick={signOut}
          className="label-caps mt-auto flex items-center gap-3 px-3 py-3 text-foreground/50 transition-colors hover:text-foreground"
        >
          <LogOut className="h-4 w-4" strokeWidth={1.25} /> Sign out
        </button>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 border-b border-hairline bg-background/92 px-6 py-5 backdrop-blur-md safe-t">
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0">
              <h1 className="truncate font-display text-3xl leading-none sm:text-4xl">{title}</h1>
              {subtitle ? <div className="eyebrow mt-2 truncate">{subtitle}</div> : null}
            </div>
            {right}
          </div>
        </header>

        <main className="flex-1 px-6 pb-28 pt-6 lg:pb-12">
          <div className="fade-rise mx-auto w-full max-w-5xl">{children}</div>
        </main>

        {/* Mobile bar */}
        <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t border-hairline bg-background/96 backdrop-blur-md safe-b lg:hidden">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              className={cn(
                "flex flex-col items-center gap-1 pt-3 text-[0.55rem] uppercase tracking-[0.16em]",
                isActive(n.to, "exact" in n ? n.exact : false)
                  ? "text-foreground"
                  : "text-foreground/40",
              )}
            >
              <n.icon className="h-[18px] w-[18px]" strokeWidth={1.25} />
              {n.label}
            </Link>
          ))}
        </nav>
      </div>
    </div>
  );
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <section className={cn("border border-hairline bg-card p-5", className)}>{children}</section>
  );
}

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="border border-hairline bg-card px-5 py-5">
      <div className="eyebrow">{label}</div>
      <div className="mt-3 font-display text-3xl leading-none">{value}</div>
      {hint ? <div className="mt-2 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

const STATUS_STYLE: Record<ApptStatus, string> = {
  upcoming: "border-foreground/25 text-foreground/70",
  arrived: "border-accent text-accent-foreground bg-accent/25",
  "in-chair": "border-foreground bg-foreground text-background",
  completed: "border-foreground/15 text-muted-foreground",
  "no-show": "border-destructive/40 text-destructive",
  cancelled: "border-destructive/30 text-destructive/70 line-through",
};

export function StatusPill({ status }: { status: ApptStatus }) {
  return (
    <span
      className={cn(
        "label-caps inline-flex shrink-0 border px-2.5 py-1 text-[0.55rem]",
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
  "w-full border-0 border-b border-foreground/20 bg-transparent px-0 py-3 text-[1rem] outline-none transition-colors placeholder:text-foreground/30 focus:border-foreground";

export function TinyButton({
  children,
  onClick,
  active,
  tone = "default",
}: {
  children: ReactNode;
  onClick?: () => void;
  active?: boolean;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "label-caps border px-3 py-2 text-[0.55rem] transition-colors",
        active
          ? "border-foreground bg-foreground text-background"
          : tone === "danger"
            ? "border-destructive/40 text-destructive hover:bg-destructive/10"
            : "border-foreground/20 hover:border-foreground/60",
      )}
    >
      {children}
    </button>
  );
}
