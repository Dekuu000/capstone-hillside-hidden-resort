import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

type StatCardTone = "neutral" | "info" | "success" | "warn";

const toneClass: Record<StatCardTone, string> = {
  neutral: "border-[var(--color-border)] bg-[var(--color-surface)]",
  info: "border-sky-200 bg-sky-50",
  success: "border-emerald-200 bg-emerald-50",
  warn: "border-amber-200 bg-amber-50",
};

export function StatCard({
  label,
  value,
  hint,
  icon,
  tone = "neutral",
  className,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: ReactNode;
  tone?: StatCardTone;
  className?: string;
}) {
  return (
    <article className={cn("rounded-[var(--radius-md)] border p-4 shadow-[var(--shadow-sm)]", toneClass[tone], className)}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--color-muted)]">{label}</p>
        {icon ? <span className="inline-flex h-5 w-5 items-center justify-center text-[var(--color-secondary)]">{icon}</span> : null}
      </div>
      <p className="mt-2 text-2xl font-bold text-[var(--color-text)]">{value}</p>
      {hint ? <p className="mt-1 text-xs text-[var(--color-muted)]">{hint}</p> : null}
    </article>
  );
}
