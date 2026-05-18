"use client";

import type { ReactNode } from "react";

export function GuestHero({
  eyebrow,
  title,
  subtitle,
  rightSlot,
}: {
  eyebrow?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  rightSlot?: ReactNode;
}) {
  return (
    <header className="mb-6 rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-sm)] sm:p-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          {eyebrow ? (
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">{eyebrow}</p>
          ) : null}
          <h1 className="mt-1 text-2xl font-bold text-[var(--color-text)] sm:text-3xl">{title}</h1>
          {subtitle ? <p className="mt-2 text-sm text-[var(--color-muted)] sm:text-base">{subtitle}</p> : null}
        </div>
        {rightSlot ? <div className="w-full max-w-sm lg:w-auto">{rightSlot}</div> : null}
      </div>
    </header>
  );
}
