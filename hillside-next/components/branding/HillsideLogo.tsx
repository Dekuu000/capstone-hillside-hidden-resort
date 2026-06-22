import Image from "next/image";
import { cn } from "../../lib/cn";

type HillsideLogoProps = {
  className?: string;
  light?: boolean;
  compact?: boolean;
  /** Render the full name on a single line ("Hillside Hidden Resort") for a cleaner header. */
  oneLine?: boolean;
};

/**
 * Shared logo sizing for every guest-facing header (public funnel + signed-in
 * shell) so the brand title is identical across pages. Controls the emblem size
 * and the one-line title size responsively. Tuned to fit the one-liner even on a
 * small phone with the auth buttons present.
 */
export const GUEST_HEADER_LOGO_CLASS =
  "[&_img]:h-9 [&_img]:w-9 min-[390px]:[&_img]:h-10 min-[390px]:[&_img]:w-10 md:[&_img]:h-11 md:[&_img]:w-11 " +
  "[&_.hillside-brand-title]:text-[1.02rem] min-[400px]:[&_.hillside-brand-title]:text-[1.12rem] " +
  "sm:[&_.hillside-brand-title]:text-[1.3rem] md:[&_.hillside-brand-title]:text-[1.55rem]";

export function HillsideLogo({ className, light = false, compact = false, oneLine = false }: HillsideLogoProps) {
  const textPrimary = light ? "text-white" : "text-[#0E1F33]";
  const textSecondary = light ? "text-teal-300" : "text-[#22A699]";
  const divider = light ? "bg-teal-300" : "bg-[#22A699]";

  return (
    <div className={cn("inline-flex min-w-0 items-center gap-2.5 sm:gap-4", className)}>
      <Image
        src="/branding/hillside-logo-emblem-transparent.png"
        alt="Hillside Hidden emblem"
        width={56}
        height={56}
        className="h-12 w-12 shrink-0 object-contain sm:h-14 sm:w-14"
        priority
      />
      {oneLine ? (
        <div className="min-w-0">
          <p
            className={cn(
              "hillside-brand-title truncate text-[1.5rem] font-semibold leading-tight tracking-[0.01em] sm:text-[2rem]",
              textPrimary,
            )}
          >
            Hillside Hidden <span className={cn("font-medium", textSecondary)}>Resort</span>
          </p>
        </div>
      ) : (
      <div className="min-w-0">
        <p
          className={cn(
            "hillside-brand-title truncate text-[1.5rem] font-semibold leading-none tracking-[0.01em] sm:text-[2rem]",
            textPrimary,
          )}
        >
          Hillside Hidden
        </p>
        {!compact ? (
          <div
            className={cn(
              "mt-1.5 flex w-full items-center justify-start gap-2 sm:mt-2 sm:justify-center sm:gap-3",
              textSecondary,
            )}
          >
            <span className={cn("hidden h-px w-10 sm:block", divider)} />
            <p className="hillside-brand-subtitle text-[0.72rem] font-semibold uppercase tracking-[0.42em] sm:text-[0.8rem] sm:tracking-[0.52em]">
              RESORT
            </p>
            <span className={cn("hidden h-px w-10 sm:block", divider)} />
          </div>
        ) : (
          <p
            className={cn(
              "hillside-brand-subtitle mt-1 block w-full text-left text-[0.72rem] font-semibold uppercase tracking-[0.35em]",
              light ? "text-[#5EEAD4]" : "text-[#22A699]",
            )}
          >
            RESORT
          </p>
        )}
      </div>
      )}
    </div>
  );
}
