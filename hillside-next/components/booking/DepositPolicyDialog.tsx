"use client";

import { useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";
import { formatPhpPeso } from "../../lib/formatCurrency";
import { ModalDialog } from "../shared/ModalDialog";
import { TermsModal } from "../legal/TermsModal";

type DepositPolicyDialogProps = {
  open: boolean;
  /** Amount charged now via GCash (the deposit). */
  payNow: number;
  /** Balance due at check-in; the row is shown only when this is > 0. */
  balanceDue?: number;
  /** True while the reservation is being created / the GCash redirect is in flight. */
  busy?: boolean;
  /** Confirm — agree to the policy and continue to GCash. */
  onConfirm: () => void;
  /** Dismiss without paying. Ignored while busy. */
  onClose: () => void;
};

/**
 * Interstitial shown at the point of no return (just before redirecting to
 * GCash). It restates the deposit + balance and makes the non-refundable
 * policy explicit; the primary button label IS the consent, so paying always
 * follows an informed, deliberate tap. Matches the real policy on /terms:
 * only the deposit is non-refundable, and only if the *guest* cancels.
 */
export function DepositPolicyDialog({
  open,
  payNow,
  balanceDue = 0,
  busy = false,
  onConfirm,
  onClose,
}: DepositPolicyDialogProps) {
  const [policyOpen, setPolicyOpen] = useState(false);

  if (!open) return null;

  return (
    <>
    <ModalDialog
      titleId="deposit-policy-title"
      title="Review before you pay"
      onClose={busy ? () => {} : onClose}
      maxWidthClass="md:max-w-md"
      zIndexClass="z-50"
    >
      <div className="space-y-4">
        <div className="rounded-2xl bg-[color:color-mix(in_srgb,var(--color-secondary)_10%,white)] p-4">
          <div className="flex items-center justify-between">
            <span className="text-sm muted-text">Pay now with GCash (deposit)</span>
            <span className="text-lg font-semibold text-[var(--color-text)]">{formatPhpPeso(payNow)}</span>
          </div>
          {balanceDue > 0 ? (
            <div className="mt-1 flex items-center justify-between">
              <span className="text-sm muted-text">Balance at check-in</span>
              <span className="text-sm font-semibold text-[var(--color-text)]">{formatPhpPeso(balanceDue)}</span>
            </div>
          ) : null}
        </div>

        <div className="flex gap-3 rounded-2xl border border-[var(--color-border)] p-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-secondary)]" aria-hidden="true" />
          <p className="text-sm leading-relaxed text-[var(--color-text)]">
            This deposit holds your reservation. <strong>It&apos;s non-refundable if you cancel.</strong>
            {balanceDue > 0 ? " The balance is paid at check-in." : ""} If the resort cancels, you get a full
            refund.{" "}
            <button
              type="button"
              onClick={() => setPolicyOpen(true)}
              className="font-semibold text-[var(--color-secondary)] hover:underline"
            >
              See full policy
            </button>
          </p>
        </div>

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="h-11 rounded-2xl border border-[var(--color-border)] px-4 text-sm font-semibold text-[var(--color-text)] transition hover:bg-[var(--color-background)] disabled:opacity-50 sm:px-5"
          >
            Go back
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="flex h-11 items-center justify-center gap-2 rounded-2xl bg-[var(--color-cta)] px-4 text-sm font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60 sm:px-5"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            {busy ? "Redirecting to GCash…" : `Agree & pay ${formatPhpPeso(payNow)}`}
          </button>
        </div>
      </div>
    </ModalDialog>

    <TermsModal open={policyOpen} initialTab="cancellation" onClose={() => setPolicyOpen(false)} />
    </>
  );
}
