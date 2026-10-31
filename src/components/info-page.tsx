// Shared layout for the secondary pages (hours, studio, contact, artist, manage).
// One tree for every screen size: a single column on phones, plus a sticky
// editorial image panel on the right from lg up.
import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Wordmark } from "@/components/screen";
import { ImagePanel } from "@/components/desktop";

export function InfoPage({
  back = "/",
  label,
  image,
  imagePos,
  panelEyebrow,
  panelTitle,
  panelSub,
  children,
}: {
  back?: string;
  label: string;
  image: string;
  imagePos?: string;
  panelEyebrow?: string;
  panelTitle: ReactNode;
  panelSub?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-[100svh] bg-background lg:grid lg:h-[100svh] lg:grid-cols-[minmax(0,1fr)_minmax(22rem,40%)] lg:overflow-hidden">
      <div className="flex min-h-[100svh] flex-col lg:min-h-0 lg:overflow-y-auto lg:[scrollbar-width:thin]">
        <header className="sticky top-0 z-30 bg-background/92 backdrop-blur-md hairline-b safe-t">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center px-4 py-2.5 lg:px-12 lg:py-4">
            <Link
              to={back as never}
              aria-label="Back"
              className="press inline-flex h-11 items-center gap-3 justify-self-start rounded-full px-2.5 text-foreground/75 hover:bg-foreground/5 lg:px-3"
            >
              <ArrowLeft className="h-[18px] w-[18px]" strokeWidth={1.25} />
              <span className="label-caps hidden lg:inline">Back</span>
            </Link>
            <Link to="/" aria-label="Hair by Bhargav" className="inline-flex">
              <Wordmark className="h-8 lg:h-11" />
            </Link>
            <span className="label-caps justify-self-end pr-2 text-[0.6rem] text-foreground/55 lg:text-[0.68rem]">
              {label}
            </span>
          </div>
        </header>
        <main className="page-in mx-auto w-full max-w-2xl flex-1 px-5 pt-7 pb-12 lg:px-14 lg:pt-14">{children}</main>
      </div>
      <ImagePanel
        src={image}
        pos={imagePos}
        eyebrow={panelEyebrow}
        title={panelTitle}
        sub={panelSub}
        className="hidden lg:block"
      />
    </div>
  );
}

export function InfoTitle({ eyebrow, children, sub }: { eyebrow: string; children: ReactNode; sub?: ReactNode }) {
  return (
    <div className="stagger">
      <div className="text-[0.62rem] uppercase tracking-[0.3em] text-bronze lg:text-[0.72rem]">{eyebrow}</div>
      <h1 className="mt-3 font-display text-[clamp(2.6rem,11vw,3.2rem)] leading-[1] tracking-[-0.01em] lg:text-[4rem]">
        {children}
      </h1>
      {sub ? (
        <p className="mt-4 max-w-md text-[0.95rem] leading-relaxed text-muted-foreground lg:text-[1.05rem]">{sub}</p>
      ) : null}
    </div>
  );
}

export function BookCTA({ children = "Book an appointment", className }: { children?: ReactNode; className?: string }) {
  return (
    <Link
      to="/book"
      className={cn(
        "label-caps press sheen group flex min-h-14 w-full items-center justify-between gap-4 rounded-sm bg-foreground px-6 text-background hover:bg-foreground/88 lg:min-h-16",
        className,
      )}
    >
      <span>{children}</span>
      <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" strokeWidth={1.25} />
    </Link>
  );
}

/** Small uppercase section label with a hairline. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-[0.62rem] uppercase tracking-[0.3em] text-muted-foreground lg:text-[0.68rem]">
      {children}
      <span className="h-px flex-1 bg-hairline" />
    </div>
  );
}
