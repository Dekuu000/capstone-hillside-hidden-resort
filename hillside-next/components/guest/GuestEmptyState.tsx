"use client";

import Link from "next/link";

export function GuestEmptyState({
  title,
  message,
  primaryHref = "/book",
  primaryLabel = "Book a stay",
  secondaryHref = "/tours",
  secondaryLabel = "Browse tours",
  testId,
}: {
  title: string;
  message: string;
  primaryHref?: string;
  primaryLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-center shadow-[var(--shadow-sm)]"
    >
      <p className="text-base font-semibold text-[var(--color-text)]">{title}</p>
      <p className="mt-2 text-sm text-[var(--color-muted)]">{message}</p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
        <Link href={primaryHref} className="guest-primary-cta min-h-11 px-4 text-sm">
          {primaryLabel}
        </Link>
        <Link href={secondaryHref} className="guest-secondary-cta min-h-11 px-4 text-sm">
          {secondaryLabel}
        </Link>
      </div>
    </div>
  );
}
