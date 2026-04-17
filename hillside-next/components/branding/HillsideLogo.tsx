import { cn } from "../../lib/cn";

type HillsideLogoProps = {
  className?: string;
  light?: boolean;
  compact?: boolean;
};

export function HillsideLogo({ className, light = false, compact = false }: HillsideLogoProps) {
  const textPrimary = light ? "text-white" : "text-[var(--color-primary)]";
  const textSecondary = light ? "text-[#67e8f9]" : "text-[var(--color-secondary)]";

  return (
    <div className={cn("inline-flex items-center gap-3", className)}>
      <svg width="48" height="48" viewBox="0 0 48 48" aria-hidden="true">
        <defs>
          <linearGradient id="hillside-logo-grad" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="#0ea5a4" />
            <stop offset="100%" stopColor="#22d3ee" />
          </linearGradient>
        </defs>
        <path d="M8 34c5-7 11-10 19-10 5 0 9 1 13 3-3 5-7 9-12 12-5 2-12 2-20-5Z" fill="url(#hillside-logo-grad)" opacity="0.95" />
        <path d="M25 9c-2 4-2 8 1 12" stroke="#f97316" strokeWidth="2.5" strokeLinecap="round" fill="none" />
        <path d="M30 12c-1.5 3-1.5 6 0.5 9" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" fill="none" />
        <path d="M18 11c2 4 2 8-1 12" stroke="#22c55e" strokeWidth="2.3" strokeLinecap="round" fill="none" />
      </svg>
      <div>
        <p className={cn("text-[1.72rem] font-semibold leading-none tracking-[0.12em]", textPrimary)}>HILLSIDE</p>
        {!compact ? (
          <p className={cn("mt-1 text-[0.72rem] font-semibold uppercase tracking-[0.32em]", textSecondary)}>Hidden Resort</p>
        ) : null}
      </div>
    </div>
  );
}
