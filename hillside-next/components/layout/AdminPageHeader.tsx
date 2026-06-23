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
  meta,
  cornerSlot,
}: {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  action?: ReactNode;
  /** Optional status row (badges, freshness chips) rendered under the subtitle. */
  meta?: ReactNode;
  /** Small element pinned to the card's top-right corner (e.g. a freshness chip). */
  cornerSlot?: ReactNode;
}) {
  return (
    <header className="surface relative flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7 lg:p-8">
      {cornerSlot ? <div className="absolute right-4 top-4 sm:right-6 sm:top-6">{cornerSlot}</div> : null}
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-[var(--color-secondary)]">{eyebrow}</p>
        ) : null}
        <h1 className="mt-2 text-[1.7rem] font-bold tracking-[-0.01em] text-[var(--color-text)] sm:text-[2rem]">{title}</h1>
        {subtitle ? <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--color-muted)]">{subtitle}</p> : null}
        {meta ? <div className="mt-3 flex flex-wrap items-center gap-2">{meta}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
