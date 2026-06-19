"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { LegalDocument } from "./legalContent";

type TermsModalProps = {
  open: boolean;
  onClose: () => void;
  /** When provided, shows an "I Agree" button that calls this then closes. */
  onAgree?: () => void;
};

export function TermsModal({ open, onClose, onAgree }: TermsModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="terms-modal-title"
    >
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-[var(--color-surface)] shadow-[var(--shadow-lg)] sm:max-h-[85vh] sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-5 py-4">
          <h2 id="terms-modal-title" className="text-lg font-semibold text-[var(--color-text)]">
            Terms, Privacy &amp; Cancellation
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close terms"
            className="rounded-full p-1.5 text-[var(--color-muted)] transition hover:bg-[color:color-mix(in_srgb,var(--color-secondary)_12%,white)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="overflow-y-auto px-5 py-5">
          <LegalDocument />
        </div>

        {onAgree ? (
          <div className="flex items-center justify-end gap-3 border-t border-[var(--color-border)] px-5 py-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text)] transition hover:bg-[color:color-mix(in_srgb,var(--color-secondary)_8%,white)]"
            >
              Close
            </button>
            <button
              type="button"
              onClick={() => {
                onAgree();
                onClose();
              }}
              className="rounded-full bg-[var(--color-cta)] px-5 py-2 text-sm font-semibold text-white transition hover:brightness-95"
            >
              I Agree
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
