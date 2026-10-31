// Brand motion pieces: the scissors that cut along the progress line,
// and the wordmark reveal with a gold sheen.
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { ServiceGlyph } from "@/components/service-icons";
import logo from "@/assets/logo.png.asset.json";

/**
 * Progress hairline with a pair of scissors at its leading edge.
 * On arrival the line grows from the previous step and the scissors snip along it.
 * The unfinished part is drawn as a dashed "cut here" guide.
 */
export function SnipLine({
  step,
  total = 5,
  className,
}: {
  step: number;
  total?: number;
  className?: string | undefined;
}) {
  const target = (step / total) * 100;
  const [width, setWidth] = useState(((step - 1) / total) * 100);
  const [cutting, setCutting] = useState(false);

  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      setCutting(true);
      setWidth(target);
    });
    const done = window.setTimeout(() => setCutting(false), 1000);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(done);
    };
  }, [target]);

  return (
    <div
      className={cn("relative h-px w-full", className)}
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={total}
      aria-valuenow={step}
      aria-label={`Step ${step} of ${total}`}
    >
      <span className="absolute inset-0 [background-image:linear-gradient(90deg,var(--hairline)_55%,transparent_55%)] [background-size:7px_1px]" />
      <span
        className="absolute inset-y-0 left-0 bg-bronze/75 transition-[width] duration-[900ms] ease-[cubic-bezier(0.22,0.61,0.36,1)] motion-reduce:transition-none"
        style={{ width: `${width}%` }}
      />
      <span
        aria-hidden
        className="absolute top-1/2 flex h-5 w-5 -translate-x-full -translate-y-1/2 items-center justify-center rounded-full bg-background text-bronze transition-[left] duration-[900ms] ease-[cubic-bezier(0.22,0.61,0.36,1)] motion-reduce:transition-none"
        style={{ left: `${width}%` }}
      >
        <ServiceGlyph
          kind="scissors"
          className={cn("h-3.5 w-3.5 rotate-90", cutting && "snip-run")}
        />
      </span>
    </div>
  );
}

/** The HB wordmark, unveiled left-to-right with a single gold sheen passing over it. */
export function LogoReveal({
  className,
  imgClassName,
  delay,
}: {
  className?: string | undefined;
  imgClassName?: string | undefined;
  delay?: number;
}) {
  const mask = {
    WebkitMaskImage: `url(${logo.url})`,
    maskImage: `url(${logo.url})`,
    WebkitMaskSize: "100% 100%",
    maskSize: "100% 100%",
    WebkitMaskRepeat: "no-repeat",
    maskRepeat: "no-repeat",
  } as const;
  return (
    <span
      className={cn("logo-reveal relative inline-block", className)}
      style={delay != null ? { animationDelay: `${delay}ms` } : undefined}
    >
      <img
        src={logo.url}
        alt="Hair by Bhargav"
        className={cn("block h-full w-auto object-contain", imgClassName)}
      />
      <span
        aria-hidden
        className="logo-sheen absolute inset-0"
        style={delay != null ? { ...mask, animationDelay: `${delay + 700}ms` } : mask}
      />
    </span>
  );
}
