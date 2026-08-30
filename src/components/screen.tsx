import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import logo from "@/assets/logo.png.asset.json";

export function Wordmark({ className }: { className?: string }) {
  return (
    <img
      src={logo.url}
      alt="Hair by Bhargav"
      className={cn("h-9 w-auto object-contain", className)}
    />
  );
}

export function ScreenHeader({
  back,
  title,
  step,
  right,
}: {
  back?: string;
  title?: string;
  step?: string;
  right?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 bg-background/92 backdrop-blur-md hairline-b safe-t">
      <div className="mx-auto grid max-w-3xl grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-6 py-4">
        {back ? (
          <Link
            to={back}
            className="-ml-2 inline-flex h-10 w-10 shrink-0 items-center justify-center text-foreground/70 transition-opacity hover:opacity-60"
            aria-label="Back"
          >
            <ArrowLeft className="h-[18px] w-[18px]" strokeWidth={1.25} />
          </Link>
        ) : (
          <span className="h-10 w-10" />
        )}
        <div className="min-w-0 text-center">
          {title ? <div className="label-caps truncate">{title}</div> : null}
          {step ? <div className="eyebrow mt-1">{step}</div> : null}
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-end">{right}</div>
      </div>
    </header>
  );
}

export function Screen({
  children,
  className,
  center,
}: {
  children: ReactNode;
  className?: string;
  center?: boolean;
}) {
  return (
    <main
      className={cn(
        "mx-auto w-full max-w-3xl flex-1 px-6 pb-10",
        center && "flex flex-col justify-center",
        className,
      )}
    >
      <div className="fade-rise">{children}</div>
    </main>
  );
}

export function Page({ children }: { children: ReactNode }) {
  return <div className="flex min-h-[100svh] flex-col bg-background">{children}</div>;
}

export function StickyBar({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 z-30 mt-auto bg-background/94 backdrop-blur-md hairline-t">
      <div className="mx-auto w-full max-w-3xl px-6 pt-4 safe-b">{children}</div>
    </div>
  );
}

export function PrimaryAction({
  children,
  onClick,
  disabled,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="label-caps group flex w-full items-center justify-between gap-4 bg-foreground px-6 py-4.5 text-background transition-all duration-300 hover:bg-foreground/88 disabled:cursor-not-allowed disabled:bg-foreground/25"
    >
      <span>{children}</span>
      <span className="transition-transform duration-300 group-hover:translate-x-1 group-disabled:translate-x-0">
        →
      </span>
    </button>
  );
}

export function GhostAction({
  children,
  onClick,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "label-caps w-full border border-foreground/20 px-6 py-4 transition-colors duration-300 hover:border-foreground/50",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function Rule() {
  return <div className="h-px w-full bg-hairline" />;
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="py-24 text-center">
      <h2 className="font-display text-3xl">{title}</h2>
      <p className="mx-auto mt-3 max-w-xs text-sm leading-relaxed text-muted-foreground">{body}</p>
      {action ? <div className="mx-auto mt-8 max-w-xs">{action}</div> : null}
    </div>
  );
}
