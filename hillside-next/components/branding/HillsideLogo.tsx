import Image from "next/image";
import { cn } from "../../lib/cn";

type HillsideLogoProps = {
  className?: string;
  light?: boolean;
  compact?: boolean;
};

export function HillsideLogo({ className, light = false, compact = false }: HillsideLogoProps) {
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
      <div className="min-w-0">
        <p
          className={cn("truncate text-[1.5rem] font-semibold leading-none tracking-[0.01em] sm:text-[2rem]", textPrimary)}
          style={{ fontFamily: "Cambria, Georgia, 'Times New Roman', serif" }}
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
            <p className="text-[0.72rem] font-semibold uppercase tracking-[0.42em] sm:text-[0.8rem] sm:tracking-[0.52em]">
              RESORT
            </p>
            <span className={cn("hidden h-px w-10 sm:block", divider)} />
          </div>
        ) : (
          <p
            className={cn(
              "mt-1 block w-full text-left text-[0.72rem] font-semibold uppercase tracking-[0.35em]",
              light ? "text-[#5EEAD4]" : "text-[#22A699]",
            )}
          >
            RESORT
          </p>
        )}
      </div>
    </div>
  );
}
