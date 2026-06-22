"use client";

import { useEffect } from "react";
import { Printer } from "lucide-react";

/**
 * Rendered on the standalone /reports-print page. Opens the print dialog once
 * on mount; also shows a manual "Print / Save as PDF" control (hidden when
 * printing) in case the auto-trigger is blocked.
 */
export function AutoPrint() {
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("noauto") === "1") return;
    const timer = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="no-print fixed bottom-4 right-4 z-10 flex gap-2">
      <button
        type="button"
        onClick={() => window.print()}
        className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] px-4 text-sm font-semibold text-white shadow-lg transition hover:brightness-110"
      >
        <Printer className="h-4 w-4" />
        Print / Save as PDF
      </button>
    </div>
  );
}
