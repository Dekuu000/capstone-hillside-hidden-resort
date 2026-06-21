"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Printer } from "lucide-react";

/**
 * Prints the chrome-free /reports-print document via a hidden iframe so the
 * native print dialog opens right here — no extra browser tab. The iframe loads
 * the same isolated route (with ?noauto so its own AutoPrint stays quiet) and we
 * drive print() from the parent once it has rendered.
 */
export function PrintReportButton({
  fromDate,
  toDate,
  disabled = false,
}: {
  fromDate: string;
  toDate: string;
  disabled?: boolean;
}) {
  const frameRef = useRef<HTMLIFrameElement | null>(null);
  const [loading, setLoading] = useState(false);

  // Tidy up any lingering iframe on unmount.
  useEffect(() => {
    return () => {
      frameRef.current?.remove();
      frameRef.current = null;
    };
  }, []);

  const print = () => {
    if (loading) return;
    setLoading(true);

    // Reuse a single hidden iframe; rebuild it each time so the date range is fresh.
    frameRef.current?.remove();
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.style.visibility = "hidden";
    frameRef.current = iframe;

    const params = new URLSearchParams({ from: fromDate, to: toDate, noauto: "1" });

    const cleanup = () => {
      iframe.remove();
      if (frameRef.current === iframe) frameRef.current = null;
      setLoading(false);
    };

    iframe.onload = () => {
      const win = iframe.contentWindow;
      if (!win) {
        cleanup();
        return;
      }
      // Remove the iframe once the print dialog is dismissed.
      win.addEventListener("afterprint", cleanup, { once: true });
      // Fallback cleanup in case afterprint never fires (some browsers/cancel paths).
      window.setTimeout(cleanup, 60_000);
      // Give the layout a tick to settle before invoking the dialog.
      window.setTimeout(() => {
        try {
          win.focus();
          win.print();
        } catch {
          cleanup();
        }
      }, 250);
    };

    iframe.src = `/reports-print?${params.toString()}`;
    document.body.appendChild(iframe);
  };

  return (
    <button
      type="button"
      onClick={print}
      disabled={disabled || loading}
      className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] bg-white px-4 text-sm font-semibold text-[var(--color-text)] transition hover:bg-[var(--color-background)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--color-secondary)_30%,white)] disabled:opacity-50"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Printer className="h-4 w-4" />}
      <span>{loading ? "Preparing…" : "Print / Save as PDF"}</span>
    </button>
  );
}
