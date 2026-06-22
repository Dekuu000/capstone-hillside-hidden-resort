import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export type KpiTone = "emerald" | "sky" | "amber" | "rose" | "teal" | "primary";

const TONE_CLASSES: Record<KpiTone, string> = {
  emerald: "bg-emerald-50 text-emerald-600",
  sky: "bg-sky-50 text-[var(--color-primary)]",
  amber: "bg-amber-50 text-amber-600",
  rose: "bg-rose-50 text-rose-600",
  teal: "bg-[color:color-mix(in_srgb,var(--color-secondary)_14%,white)] text-[var(--color-secondary)]",
  primary: "bg-sky-50 text-[var(--color-primary)]",
};

/**
 * Shared KPI/stat tile matching the dashboard's Resort Snapshot tiles:
 * a rounded surface card with a circular tinted icon, an uppercase label, a
 * large value and an optional hint. Pass `onClick` to render it as a clickable
 * filter tile (with an `active` highlight). Used across the back-office pages so
 * every stat row reads the same as the dashboard.
 */
export function KpiTile({
  icon: Icon,
  tone = "teal",
  label,
  value,
  hint,
  active = false,
  onClick,
  className,
}: {
  icon: LucideIcon;
  tone?: KpiTone;
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const base = cn(
    "group h-full min-h-[84px] rounded-2xl border bg-white p-3.5 text-left transition-colors duration-200 sm:min-h-[92px]",
    active
      ? "border-[var(--color-secondary)] ring-1 ring-[color:color-mix(in_srgb,var(--color-secondary)_45%,white)]"
      : "border-[var(--color-border)] hover:border-[color:color-mix(in_srgb,var(--color-secondary)_35%,white)]",
    className,
  );

  const inner = (
    <>
      <p className="flex items-start gap-2 text-[11px] font-semibold uppercase leading-tight tracking-[0.12em] text-[var(--color-muted)]">
        <span className={cn("inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full", TONE_CLASSES[tone])}>
          <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <span className="min-w-0 pt-1">{label}</span>
      </p>
      <p className="mt-2 text-2xl font-bold tracking-[-0.01em] text-[var(--color-text)]">{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-[var(--color-muted)]">{hint}</p> : null}
    </>
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} aria-pressed={active} className={cn(base, "w-full active:bg-[var(--color-background)]")}>
        {inner}
      </button>
    );
  }

  return <article className={base}>{inner}</article>;
}
