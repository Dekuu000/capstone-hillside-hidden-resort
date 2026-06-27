"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ScrollText, X } from "lucide-react";
import { CancellationContent, PrivacyContent, TermsContent } from "./legalContent";

const TABS = [
  { key: "terms", label: "Terms of Service" },
  { key: "privacy", label: "Privacy Policy" },
  { key: "cancellation", label: "Cancellation" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

type TermsModalProps = {
  open: boolean;
  onClose: () => void;
  /** When provided, shows the confirm + "Accept & Continue" flow that calls this then closes. */
  onAgree?: () => void;
  /** Tab to open on (default "terms"). Use "cancellation" when launched from a payment flow. */
  initialTab?: TabKey;
};

export function TermsModal({ open, onClose, onAgree, initialTab = "terms" }: TermsModalProps) {
  const [tab, setTab] = useState<TabKey>(initialTab);
  const [confirmed, setConfirmed] = useState(false);
  const [visited, setVisited] = useState<Set<TabKey>>(() => new Set<TabKey>([initialTab]));
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    // Reset to a clean state each time the modal opens.
    setTab(initialTab);
    setConfirmed(false);
    setVisited(new Set<TabKey>([initialTab]));
    // Pull focus into this panel so that — when opened on top of another modal —
    // Escape closes only this one, not the dialog underneath.
    panelRef.current?.focus();
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
  }, [open, onClose, initialTab]);

  if (!open) return null;

  const allViewed = TABS.every((item) => visited.has(item.key));

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end justify-center p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="terms-modal-title"
    >
      <div className="absolute inset-0 bg-black/50" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-t-3xl bg-[var(--color-surface)] shadow-[var(--shadow-lg)] outline-none sm:max-h-[88vh] sm:rounded-3xl"
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-[var(--color-border)] px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[color:color-mix(in_srgb,var(--color-secondary)_14%,white)] text-[var(--color-secondary)]">
              <ScrollText className="h-5 w-5" />
            </span>
            <div>
              <h2 id="terms-modal-title" className="text-lg font-semibold text-[var(--color-text)]">
                Terms &amp; Policies
              </h2>
              <p className="text-sm text-[var(--color-muted)]">Please review before you continue.</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-full p-1.5 text-[var(--color-muted)] transition hover:bg-[color:color-mix(in_srgb,var(--color-secondary)_12%,white)]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[var(--color-border)] px-2" role="tablist" aria-label="Policy documents">
          {TABS.map((item) => {
            const active = tab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => {
                  setTab(item.key);
                  setVisited((prev) => new Set(prev).add(item.key));
                }}
                className={`flex flex-1 items-center justify-center gap-1 border-b-2 px-2 py-3 text-center text-sm font-semibold transition ${
                  active
                    ? "border-[var(--color-secondary)] text-[var(--color-secondary)]"
                    : "border-transparent text-[var(--color-muted)] hover:text-[var(--color-text)]"
                }`}
              >
                {item.label}
                {visited.has(item.key) ? (
                  <Check className="h-3.5 w-3.5 text-emerald-600" aria-label="viewed" />
                ) : null}
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="overflow-y-auto px-5 py-5">
          {tab === "terms" ? <TermsContent /> : tab === "privacy" ? <PrivacyContent /> : <CancellationContent />}
        </div>

        {/* Footer */}
        {onAgree ? (
          <div className="space-y-3 border-t border-[var(--color-border)] bg-[color:color-mix(in_srgb,var(--color-secondary)_5%,white)] px-5 py-4">
            {!allViewed ? (
              <p className="text-xs font-semibold text-[var(--color-secondary)]">
                Please open all three sections (Terms, Privacy &amp; Cancellation) to continue.
              </p>
            ) : null}
            <label
              className={`flex items-start gap-2 text-sm ${
                allViewed ? "text-[var(--color-text)]" : "text-[var(--color-muted)]"
              }`}
            >
              <input
                type="checkbox"
                checked={confirmed}
                disabled={!allViewed}
                onChange={(event) => setConfirmed(event.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-[var(--color-border)] text-[var(--color-secondary)] focus-visible:ring-2 focus-visible:ring-teal-200 disabled:cursor-not-allowed disabled:opacity-50"
              />
              <span>
                I confirm I have reviewed and accept the Terms &amp; Conditions, Privacy Policy &amp; Cancellation
                Policy.
              </span>
            </label>
            <div className="flex justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text)] transition hover:bg-[color:color-mix(in_srgb,var(--color-secondary)_8%,white)]"
              >
                Decline
              </button>
              <button
                type="button"
                disabled={!confirmed || !allViewed}
                onClick={() => {
                  onAgree();
                  onClose();
                }}
                className="rounded-full bg-[var(--color-cta)] px-5 py-2 text-sm font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Accept &amp; Continue
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-end border-t border-[var(--color-border)] px-5 py-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold text-[var(--color-text)] transition hover:bg-[color:color-mix(in_srgb,var(--color-secondary)_8%,white)]"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
