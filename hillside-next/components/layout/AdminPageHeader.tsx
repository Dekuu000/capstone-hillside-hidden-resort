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
    <header className="surface flex flex-col gap-4 p-5 shadow-[var(--shadow-sm)] sm:flex-row sm:items-center sm:justify-between sm:p-6 lg:p-7">
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-[var(--color-muted)]">{eyebrow}</p>
        ) : null}
        <h1 className="mt-2 text-2xl font-bold text-[var(--color-text)] sm:text-3xl">{title}</h1>
        {subtitle ? <p className="mt-2 text-sm text-[var(--color-muted)]">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
