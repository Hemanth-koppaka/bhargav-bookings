import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
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
      <div className="mx-auto grid max-w-3xl grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-6 py-3.5">
        {back ? (
          <Link
            to={back as never}
            className="-ml-2 inline-flex h-10 w-10 shrink-0 items-center justify-center text-foreground/70 transition-opacity hover:opacity-60"
            aria-label="Back"
          >
            <ArrowLeft className="h-[18px] w-[18px]" strokeWidth={1.25} />
          </Link>
        ) : (
          <span className="h-10 w-10" />
        )}
        <div className="min-w-0 text-center">
          <Link to="/" aria-label="Hair by Bhargav" className="inline-flex">
            <Wordmark className="h-7 soft-fade" />
          </Link>
          {title || step ? (
            <div className="mt-1 flex items-center justify-center gap-2 truncate">
              {title ? <span className="eyebrow">{title}</span> : null}
              {title && step ? <span className="eyebrow">·</span> : null}
              {step ? <span className="eyebrow">{step}</span> : null}
            </div>
          ) : null}
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
      <div className="page-in">{children}</div>
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
      className="label-caps press sheen group flex min-h-14 w-full items-center justify-between gap-4 rounded-sm bg-foreground px-6 py-4.5 text-background hover:bg-foreground/88 disabled:cursor-not-allowed disabled:bg-foreground/25"
    >
      <span>{children}</span>
      <ArrowRight
        className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1 group-disabled:translate-x-0"
        strokeWidth={1.25}
      />
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
        "label-caps press min-h-12 w-full rounded-sm border border-foreground/20 px-6 py-4 hover:border-foreground/50",
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

/** Phone step header: back · wordmark · 02 / 05, with a progress hairline. */
export function StepHeader({ back, step, total = 5 }: { back: string; step: number; total?: number }) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    <header className="sticky top-0 z-30 bg-background/92 backdrop-blur-md safe-t">
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5">
        <Link
          to={back as never}
          aria-label="Back"
          className="press inline-flex h-11 w-11 items-center justify-center rounded-full text-foreground/75 hover:bg-foreground/5"
        >
          <ArrowLeft className="h-[18px] w-[18px]" strokeWidth={1.25} />
        </Link>
        <Link to="/" aria-label="Hair by Bhargav" className="mx-auto inline-flex">
          <Wordmark className="h-8" />
        </Link>
        <span className="label-caps w-11 whitespace-nowrap text-right text-[0.6rem] tabular-nums text-foreground/60">
          {pad(step)} / {pad(total)}
        </span>
      </div>
      <div
        className="h-px w-full bg-hairline"
        role="progressbar"
        aria-label={`Step ${step} of ${total}`}
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={step}
      >
        <div
          className="h-px bg-bronze/70 transition-[width] duration-700"
          style={{ width: `${(step / total) * 100}%` }}
        />
      </div>
    </header>
  );
}

/** Phone step title: small eyebrow + display heading. */
export function StepIntro({ eyebrow, children, sub }: { eyebrow: string; children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="pt-6">
      <div className="text-[0.62rem] uppercase tracking-[0.3em] text-muted-foreground">{eyebrow}</div>
      <h1 className="mt-2 font-display text-[clamp(2.3rem,10.5vw,2.9rem)] leading-[1.02] tracking-[-0.01em]">
        {children}
      </h1>
      {sub ? <p className="mt-2.5 text-[0.92rem] leading-relaxed text-muted-foreground">{sub}</p> : null}
    </div>
  );
}
