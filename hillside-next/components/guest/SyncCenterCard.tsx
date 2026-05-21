"use client";

import Link from "next/link";
import { ChevronRight, RefreshCcw } from "lucide-react";

type SyncCenterCardProps = {
  compact?: boolean;
  helperText?: string;
};

export function SyncCenterCard({
  compact = false,
  helperText,
}: SyncCenterCardProps) {
  const resolvedHelperText =
    helperText ?? (compact ? "Keep your bookings in sync" : "Sync reservations and update your account");

  const titleClass = compact
    ? "text-base font-bold leading-none"
    : "text-base font-bold leading-none";

  return (
    <Link
      href="/guest/sync"
      data-testid="sync-center-card"
      className={`flex items-center justify-between gap-3 rounded-2xl border border-slate-200/90 bg-white px-4 py-3 shadow-sm transition hover:border-teal-200 hover:bg-slate-50 ${
        compact ? "h-[68px] w-full max-w-[250px]" : "min-h-[76px] w-full"
      }`}
    >
      <div className="flex items-center gap-3">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-teal-50 text-[var(--color-secondary)]">
          <RefreshCcw className="h-4 w-4" />
        </span>
        <span>
          <span className={`block font-semibold text-[var(--color-primary)] ${titleClass}`}>Sync Center</span>
          <span className={`mt-1 block leading-snug text-slate-500 ${compact ? "text-xs" : "text-sm"}`}>{resolvedHelperText}</span>
        </span>
      </div>
      <span className="flex items-center gap-2">
        {compact ? <span className="h-2 w-2 rounded-full bg-[var(--color-secondary)]" /> : null}
        <ChevronRight className="h-5 w-5 text-slate-400" />
      </span>
    </Link>
  );
}
