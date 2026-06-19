"use client";

import Link from "next/link";
import { Binoculars, CalendarDays } from "lucide-react";
import { GuestEmptyStateIllustration } from "./GuestEmptyStateIllustration";

export function GuestEmptyState({
  title,
  message,
  primaryHref = "/stays",
  primaryLabel = "Book a stay",
  secondaryHref = "/tours",
  secondaryLabel = "Browse tours",
  testId,
  className,
}: {
  title: string;
  message: string;
  primaryHref?: string;
  primaryLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
  testId?: string;
  className?: string;
}) {
  return (
    <div
      data-testid={testId}
      className={`rounded-[2rem] border border-[var(--color-border)] bg-[var(--color-surface)] px-5 py-8 text-center shadow-[var(--shadow-sm)] min-[390px]:px-6 min-[390px]:py-9 ${className ?? ""}`}
    >
      <div className="mx-auto mb-6 flex w-full justify-center">
        <GuestEmptyStateIllustration />
      </div>
      <p className="mt-4 text-xl font-bold text-[var(--color-primary)]">{title}</p>
      <p className="mx-auto mt-3 max-w-[300px] text-base leading-7 text-[var(--color-muted)]">{message}</p>
      <div className="mx-auto mt-7 flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center sm:justify-center">
        <Link href={primaryHref} data-testid="book-stay-cta" className="guest-primary-cta h-12 w-full rounded-2xl px-6 text-sm sm:w-auto sm:min-w-[160px]">
          <CalendarDays className="h-4 w-4" />
          {primaryLabel}
        </Link>
        <Link href={secondaryHref} data-testid="browse-tours-cta" className="guest-secondary-cta h-12 w-full rounded-2xl px-6 text-sm sm:w-auto sm:min-w-[160px]">
          <Binoculars className="h-4 w-4 text-[var(--color-secondary)]" />
          {secondaryLabel}
        </Link>
      </div>
    </div>
  );
}
