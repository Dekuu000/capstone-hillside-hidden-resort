import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  rightSlot,
  statusSlot,
  variant = "surface",
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  rightSlot?: ReactNode;
  statusSlot?: ReactNode;
  variant?: "surface" | "hero";
  className?: string;
}) {
  return (
    <header
      className={cn(
        "mb-5 rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-card)] sm:p-6",
        variant === "hero" ? "lg:p-8" : "",
        className,
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {eyebrow ? <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--color-secondary)]">{eyebrow}</p> : null}
          <h1 className={cn("text-[1.7rem] font-bold tracking-[-0.01em] text-[var(--color-text)] sm:text-[2rem]", eyebrow ? "mt-2" : "")}>{title}</h1>
          {subtitle ? <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--color-muted)]">{subtitle}</p> : null}
          {statusSlot ? <div className="mt-3 flex flex-wrap gap-2">{statusSlot}</div> : null}
        </div>
        {rightSlot ? <div className="flex flex-wrap items-center gap-2">{rightSlot}</div> : null}
      </div>
    </header>
  );
}
