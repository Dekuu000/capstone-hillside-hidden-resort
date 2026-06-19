import type { ReactNode } from "react";

/**
 * Standard back-office page header: eyebrow + title + subtitle in a surface
 * card, with an optional right-aligned action slot. Used across admin pages so
 * every screen opens the same way.
 */
export function AdminPageHeader({
  eyebrow,
  title,
  subtitle,
  action,
}: {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="surface flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7 lg:p-8">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--color-secondary)]">{eyebrow}</p>
        ) : null}
        <h1 className="mt-2 text-[1.7rem] font-bold tracking-[-0.01em] text-[var(--color-text)] sm:text-[2rem]">{title}</h1>
        {subtitle ? <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--color-muted)]">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
