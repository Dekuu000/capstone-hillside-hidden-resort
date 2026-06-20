"use client";

import { Printer } from "lucide-react";

export function PrintReportButton({ disabled = false }: { disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      disabled={disabled}
      className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] bg-white px-4 text-sm font-semibold text-[var(--color-text)] transition hover:bg-[var(--color-background)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--color-secondary)_30%,white)] disabled:opacity-50"
    >
      <Printer className="h-4 w-4" />
      <span>Print / Save as PDF</span>
    </button>
  );
}
