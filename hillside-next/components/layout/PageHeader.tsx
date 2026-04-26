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
        "mb-5 rounded-2xl border p-4 shadow-[var(--shadow-sm)]",
        variant === "hero"
          ? "rounded-3xl border-slate-200/70 bg-gradient-to-br from-white via-slate-50 to-blue-50 p-6 shadow-sm"
          : "border-[var(--color-border)] bg-[var(--color-surface)]",
        className,
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          {eyebrow ? <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">{eyebrow}</p> : null}
          <h1 className={cn("text-2xl text-[var(--color-text)] sm:text-3xl", eyebrow ? "mt-1.5" : "")}>{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-[var(--color-muted)]">{subtitle}</p> : null}
          {statusSlot ? <div className="mt-3 flex flex-wrap gap-2">{statusSlot}</div> : null}
        </div>
        {rightSlot ? <div className="flex flex-wrap items-center gap-2">{rightSlot}</div> : null}
      </div>
    </header>
  );
}
