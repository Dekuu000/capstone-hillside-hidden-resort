import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  rightSlot,
  statusSlot,
}: {
  title: string;
  subtitle?: string;
  rightSlot?: ReactNode;
  statusSlot?: ReactNode;
}) {
  return (
    <header className="mb-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-[var(--shadow-sm)]">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl text-[var(--color-text)] sm:text-3xl">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-[var(--color-muted)]">{subtitle}</p> : null}
          {statusSlot ? <div className="mt-3 flex flex-wrap gap-2">{statusSlot}</div> : null}
        </div>
        {rightSlot ? <div className="flex flex-wrap items-center gap-2">{rightSlot}</div> : null}
      </div>
    </header>
  );
}
