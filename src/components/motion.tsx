// Brand motion: the wordmark reveal with a gold sheen.
// (The scissors progress line lives in scissors-line.tsx.)
import { cn } from "@/lib/utils";
import logo from "@/assets/logo.png.asset.json";

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
