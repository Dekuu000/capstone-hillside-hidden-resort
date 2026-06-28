"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Wallet } from "lucide-react";
import { onSitePaymentResponseSchema } from "../../../packages/shared/src/schemas";
import { apiFetch } from "../../lib/apiClient";
import { getApiErrorMessage } from "../../lib/apiError";
import { formatPhpPeso as toPeso } from "../../lib/formatCurrency";
import { Select } from "../shared/Select";

const METHOD_OPTIONS = [
  { value: "cash", label: "Cash" },
  { value: "gcash", label: "GCash" },
  { value: "bank", label: "Bank transfer" },
  { value: "card", label: "Card" },
];

export type WalkInPaymentResult = {
  paymentId: string;
  paymentStatus: string;
  reservationStatus: string;
  amount: number;
};

/**
 * Inline "Take payment" panel shown on the walk-in success card so Front Desk can
 * collect cash (or GCash/card) without leaving for the Payments page — which isn't
 * even in their nav. Reuses POST /v2/payments/on-site; the parent flips the card to
 * "Paid" + enables Check In Now via onRecorded. A link to the full Payments console
 * stays for split payments / corrections.
 */
export function WalkInPaymentPanel({
  token,
  reservationId,
  reservationCode,
  balanceDue,
  walkInType,
  onRecorded,
}: {
  token: string;
  reservationId: string;
  reservationCode: string;
  balanceDue: number;
  walkInType: "stay" | "tour";
  onRecorded: (result: WalkInPaymentResult) => void;
}) {
  const roundedBalance = Math.max(0, Math.round(balanceDue));
  const [amount, setAmount] = useState(String(roundedBalance));
  const [method, setMethod] = useState("cash");
  const [referenceNo, setReferenceNo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requiresReference = method !== "cash";
  const numericAmount = Number(amount);
  const remaining = useMemo(
    () => Math.max(0, roundedBalance - (Number.isFinite(numericAmount) ? numericAmount : 0)),
    [numericAmount, roundedBalance],
  );

  const record = async () => {
    setError(null);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError("Amount must be greater than zero.");
      return;
    }
    if (requiresReference && !referenceNo.trim()) {
      setError("Reference number is required for this payment method.");
      return;
    }
    setBusy(true);
    try {
      const result = await apiFetch(
        "/v2/payments/on-site",
        {
          method: "POST",
          body: JSON.stringify({
            reservation_id: reservationId,
            amount: numericAmount,
            method,
            reference_no: referenceNo.trim() || null,
          }),
        },
        token,
        onSitePaymentResponseSchema,
      );
      onRecorded({
        paymentId: result.payment_id,
        paymentStatus: result.status,
        reservationStatus: result.reservation_status,
        amount: numericAmount,
      });
    } catch (caught) {
      setError(getApiErrorMessage(caught, "Couldn't record the payment. Open the Payments page to try there."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-[var(--color-border)] bg-white p-4">
      <div className="flex items-center gap-2">
        <Wallet className="h-4 w-4 text-[var(--color-secondary)]" aria-hidden="true" />
        <h3 className="text-sm font-semibold text-[var(--color-text)]">Take payment</h3>
        <span className="ml-auto text-xs font-semibold text-[var(--color-muted)]">
          Balance {toPeso(roundedBalance)}
        </span>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-sm text-[var(--color-text)]">
          Amount received
          <div className="relative">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[var(--color-muted)]">₱</span>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={amount}
              onFocus={(event) => event.target.select()}
              onChange={(event) => setAmount(event.target.value.replace(/[^0-9]/g, "").replace(/^0+(?=\d)/, ""))}
              className="w-full rounded-xl border border-[var(--color-border)] bg-white py-2 pl-7 pr-3 text-sm text-[var(--color-text)] outline-none ring-[var(--color-secondary)]/20 transition focus:ring-2"
            />
          </div>
          <button
            type="button"
            onClick={() => setAmount(String(roundedBalance))}
            className="justify-self-start text-[11px] font-semibold text-[var(--color-secondary)] hover:underline"
          >
            Full balance ({toPeso(roundedBalance)})
          </button>
        </label>

        <label className="grid gap-1 text-sm text-[var(--color-text)]">
          Method
          <Select
            ariaLabel="Payment method"
            value={method}
            onChange={(next) => {
              setMethod(next);
              if (next === "cash") setReferenceNo("");
            }}
            options={METHOD_OPTIONS}
          />
          {requiresReference ? (
            <input
              type="text"
              value={referenceNo}
              onChange={(event) => setReferenceNo(event.target.value)}
              placeholder="Reference number"
              className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text)] outline-none ring-[var(--color-secondary)]/20 transition focus:ring-2"
            />
          ) : (
            <span className="text-[11px] text-[var(--color-muted)]">No reference needed for cash.</span>
          )}
        </label>
      </div>

      {error ? <p className="mt-2 text-xs font-medium text-[var(--color-error)]">{error}</p> : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void record()}
          disabled={busy}
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-[var(--color-primary)] px-4 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> : null}
          {method === "cash" ? "Record cash payment" : "Record payment"}
        </button>
        <span className="text-xs text-[var(--color-muted)]">
          Remaining after this: <span className="font-semibold text-[var(--color-text)]">{toPeso(remaining)}</span>
        </span>
        <Link
          href={`/admin/payments?source=walkin&walkin_type=${walkInType}&reservation_id=${encodeURIComponent(reservationId)}&amount=${encodeURIComponent(String(Math.max(1, roundedBalance)))}&method=cash`}
          className="ml-auto text-xs font-semibold text-[var(--color-secondary)] hover:underline"
        >
          Open in Payments
        </Link>
      </div>
      <p className="mt-1 text-[11px] text-[var(--color-muted)]">Recording payment for {reservationCode}.</p>
    </div>
  );
}
