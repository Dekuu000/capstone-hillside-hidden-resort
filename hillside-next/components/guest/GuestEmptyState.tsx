"use client";

import Link from "next/link";
import { Binoculars, CalendarDays } from "lucide-react";
import { GuestEmptyStateIllustration } from "./GuestEmptyStateIllustration";

export function GuestEmptyState({
  title,
  message,
  primaryHref = "/book",
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
      className={`rounded-[2rem] border border-slate-200/80 bg-[var(--color-surface)] px-5 py-8 text-center shadow-[var(--shadow-sm)] min-[390px]:px-6 min-[390px]:py-9 ${className ?? ""}`}
    >
      <div className="mx-auto mb-6 flex w-full justify-center">
        <GuestEmptyStateIllustration />
      </div>
      <p className="mt-4 text-xl font-bold text-[var(--color-primary)]">{title}</p>
      <p className="mx-auto mt-3 max-w-[300px] text-base leading-7 text-slate-500">{message}</p>
      <div className="mt-7 grid w-full grid-cols-1 gap-3 min-[380px]:grid-cols-2 md:mx-auto md:flex md:w-auto md:grid-cols-none md:items-center md:justify-center md:gap-4">
        <Link href={primaryHref} data-testid="book-stay-cta" className="guest-primary-cta h-14 w-full rounded-2xl px-5 text-base font-bold md:h-11 md:w-auto md:min-w-[148px] md:px-6 md:text-sm">
          <CalendarDays className="h-4 w-4" />
          {primaryLabel}
        </Link>
        <Link href={secondaryHref} data-testid="browse-tours-cta" className="guest-secondary-cta h-14 w-full rounded-2xl border border-orange-200 bg-white px-5 text-base font-bold text-[var(--color-primary)] md:h-11 md:w-auto md:min-w-[160px] md:px-6 md:text-sm">
          <Binoculars className="h-4 w-4 text-[var(--color-cta)]" />
          {secondaryLabel}
        </Link>
      </div>
    </div>
  );
}
