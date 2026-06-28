"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { ReservationListItem } from "../../../packages/shared/src/types";
import { computeStayDepositPreview } from "../../../packages/shared/src/types";
import { reservationListItemSchema } from "../../../packages/shared/src/schemas";
import { apiFetch } from "../../lib/apiClient";
import { getApiErrorMessage } from "../../lib/apiError";
import { formatPhpPeso as formatPeso } from "../../lib/formatCurrency";
import { DepositPolicyDialog } from "./DepositPolicyDialog";

export function PaymentClient({ token, reservationId }: { token: string; reservationId: string }) {
  const router = useRouter();
  const [booking, setBooking] = useState<ReservationListItem | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [redirecting, setRedirecting] = useState(false);
  const [onlineError, setOnlineError] = useState<string | null>(null);
  const [policyOpen, setPolicyOpen] = useState(false);

  const totals = useMemo(() => {
    const total = Number(booking?.total_amount ?? 0);
    const paid = Number(booking?.amount_paid_verified ?? 0);
    const depositRequired = Number(booking?.deposit_required ?? 0);
    const expectedPayNow = Number(booking?.expected_pay_now ?? 0);
    const deposit = depositRequired > 0 ? depositRequired : expectedPayNow > 0 ? expectedPayNow : computeStayDepositPreview(total);
    const remaining = Math.max(0, total - paid);
    return { total, paid, deposit, remaining };
  }, [booking]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await apiFetch(
          `/v2/me/bookings/${encodeURIComponent(reservationId)}`,
          { method: "GET" },
          token,
          reservationListItemSchema,
        );
        if (active) setBooking(data);
      } catch (unknownError) {
        if (active) setLoadError(getApiErrorMessage(unknownError, "Could not load this reservation."));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [reservationId, token]);

  const payOnline = useCallback(async () => {
    setRedirecting(true);
    setOnlineError(null);
    try {
      const res = await apiFetch<{ checkout_url?: string }>(
        "/v2/payments/paymongo/checkout",
        { method: "POST", body: JSON.stringify({ reservation_id: reservationId }) },
        token,
      );
      if (res?.checkout_url) {
        // Full-page redirect to PayMongo's hosted GCash checkout.
        window.location.assign(res.checkout_url);
        return;
      }
      setOnlineError("Could not start the GCash payment. Please try again.");
      setPolicyOpen(false);
      setRedirecting(false);
    } catch (unknownError) {
      setOnlineError(getApiErrorMessage(unknownError, "Online payment is unavailable right now."));
      setPolicyOpen(false);
      setRedirecting(false);
    }
  }, [reservationId, token]);

  if (loading) {
    return (
      <div className="mx-auto flex min-h-[50vh] w-full max-w-[1080px] items-center justify-center px-4">
        <p className="flex items-center gap-2 text-sm muted-text">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading your reservation…
        </p>
      </div>
    );
  }

  if (loadError || !booking) {
    return (
      <div className="mx-auto w-full max-w-[680px] px-4 py-12 text-center">
        <p className="text-sm text-[var(--color-error)]">{loadError || "Reservation not found."}</p>
        <button
          type="button"
          onClick={() => router.push("/my-bookings")}
          className="mt-4 rounded-full border border-[var(--color-border)] px-4 py-2 text-sm font-semibold"
        >
          Go to my trips
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-[1080px] px-4 py-8 md:px-6 lg:px-8">
      <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Confirm and pay</h1>
      <p className="mt-1 text-sm muted-text">
        Reservation <span className="font-semibold text-[var(--color-text)]">{booking.reservation_code}</span> · pay the
        deposit to secure your stay.
      </p>

      <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_380px]">
        <section className="rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
          <h2 className="text-lg font-semibold">Pay with GCash</h2>
          <p className="mt-1 text-sm muted-text">
            You&apos;ll be redirected to GCash&apos;s secure checkout to pay your{" "}
            <span className="font-semibold text-[var(--color-text)]">{formatPeso(totals.deposit)}</span> deposit. Your
            reservation is confirmed automatically once GCash confirms the payment — no proof upload needed.
          </p>
          {onlineError ? (
            <p className="mt-3 rounded-xl bg-[color:color-mix(in_srgb,var(--color-error)_10%,white)] px-3 py-2 text-sm text-[var(--color-error)]">
              {onlineError}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => setPolicyOpen(true)}
            disabled={redirecting}
            className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--color-primary)] text-base font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {redirecting ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
            {redirecting ? "Redirecting to GCash…" : `Pay ${formatPeso(totals.deposit)} with GCash`}
          </button>
          <p className="mt-2 text-center text-xs muted-text">
            Secured by PayMongo. Deposit is non-refundable if you cancel.
          </p>
        </section>

        <aside>
          <div className="lg:sticky lg:top-24 rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-md)]">
            <h2 className="text-base font-semibold">Price details</h2>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="muted-text">Stay total</dt>
                <dd>{formatPeso(totals.total)}</dd>
              </div>
              <div className="flex justify-between border-t border-[var(--color-border)] pt-2 font-semibold">
                <dt>Due now (deposit)</dt>
                <dd>{formatPeso(totals.deposit)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="muted-text">Balance at check-in</dt>
                <dd>{formatPeso(Math.max(0, totals.total - totals.deposit))}</dd>
              </div>
            </dl>
          </div>
        </aside>
      </div>

      <DepositPolicyDialog
        open={policyOpen}
        payNow={totals.deposit}
        balanceDue={Math.max(0, totals.total - totals.deposit)}
        busy={redirecting}
        onConfirm={() => void payOnline()}
        onClose={() => setPolicyOpen(false)}
      />
    </div>
  );
}
