"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Upload } from "lucide-react";
import type {
  PaymentSubmissionResponse,
  ReservationListItem,
} from "../../../packages/shared/src/types";
import { computeStayDepositPreview } from "../../../packages/shared/src/types";
import {
  paymentSubmissionResponseSchema,
  reservationListItemSchema,
} from "../../../packages/shared/src/schemas";
import { apiFetch } from "../../lib/apiClient";
import { getApiErrorMessage } from "../../lib/apiError";
import { formatPhpPeso as formatPeso } from "../../lib/formatCurrency";
import { parseJwtSub } from "../../lib/jwt";
import { syncAwareMutation } from "../../lib/offlineSync/mutation";
import { queuePaymentSubmissionWithFile } from "../../lib/offlineSync/paymentSubmission";
import { getSupabaseBrowserClient } from "../../lib/supabase";
import { GcashPaymentGuide } from "../shared/GcashPaymentGuide";
import { Input } from "../shared/Input";

export function PaymentClient({ token, reservationId }: { token: string; reservationId: string }) {
  const router = useRouter();
  const [booking, setBooking] = useState<ReservationListItem | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [amount, setAmount] = useState("");
  const [referenceNo, setReferenceNo] = useState("");
  const [proofMode, setProofMode] = useState<"file" | "url">("file");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofUrl, setProofUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const [onlineError, setOnlineError] = useState<string | null>(null);

  const totals = useMemo(() => {
    const total = Number(booking?.total_amount ?? 0);
    const paid = Number(booking?.amount_paid_verified ?? 0);
    const depositRequired = Number(booking?.deposit_required ?? 0);
    const expectedPayNow = Number(booking?.expected_pay_now ?? 0);
    const deposit = depositRequired > 0 ? depositRequired : expectedPayNow > 0 ? expectedPayNow : computeStayDepositPreview(total);
    const remaining = Math.max(0, total - paid);
    return { total, paid, deposit, remaining, requiresDepositFlow: depositRequired > 0 || expectedPayNow > 0 };
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
        if (!active) return;
        setBooking(data);
        const total = Number(data.total_amount ?? 0);
        const depositRequired = Number(data.deposit_required ?? 0);
        const expectedPayNow = Number(data.expected_pay_now ?? 0);
        const deposit = depositRequired > 0 ? depositRequired : expectedPayNow > 0 ? expectedPayNow : computeStayDepositPreview(total);
        setAmount(String(deposit > 0 ? deposit : total));
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

  const uploadProofIfNeeded = useCallback(async (): Promise<string | null> => {
    if (proofMode === "url") return proofUrl.trim() || null;
    if (!proofFile) return null;
    const userId = parseJwtSub(token);
    if (!userId) throw new Error("Unable to identify current user for proof upload.");
    const ext = proofFile.name.split(".").pop()?.toLowerCase() || "jpg";
    const storagePath = `payments/${userId}/${reservationId}-${crypto.randomUUID()}.${ext}`;
    const supabase = getSupabaseBrowserClient();
    const { error: uploadError } = await supabase.storage
      .from("payment-proofs")
      .upload(storagePath, proofFile, { upsert: false });
    if (uploadError) throw uploadError;
    return storagePath;
  }, [proofFile, proofMode, proofUrl, reservationId, token]);

  const submit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      const numericAmount = Number(amount);
      if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
        setError("Amount must be greater than zero.");
        return;
      }
      if (proofMode === "url" && !proofUrl.trim()) {
        setError("Proof URL is required.");
        return;
      }
      if (proofMode === "file" && !proofFile) {
        setError("Payment proof file is required.");
        return;
      }
      if (!totals.requiresDepositFlow && totals.remaining > 0 && numericAmount !== totals.remaining) {
        setError(`This booking requires full payment of ${formatPeso(totals.remaining)}.`);
        return;
      }

      setBusy(true);
      setError(null);
      setProgress("Preparing payment…");
      try {
        const paymentType = totals.requiresDepositFlow
          ? numericAmount >= totals.total
            ? "full"
            : "deposit"
          : "full";

        if (proofMode === "file" && proofFile && typeof navigator !== "undefined" && !navigator.onLine) {
          const userId = parseJwtSub(token);
          if (!userId) throw new Error("Unable to identify current user for offline proof queue.");
          await queuePaymentSubmissionWithFile({
            userId,
            reservationId,
            amount: numericAmount,
            paymentType,
            method: "gcash",
            referenceNo,
            file: proofFile,
          });
          router.replace(`/reserve/${encodeURIComponent(reservationId)}/confirmation?queued=1`);
          return;
        }

        setProgress("Recording payment intent…");
        await apiFetch(
          "/v2/payments/intent",
          { method: "POST", body: JSON.stringify({ reservation_id: reservationId, amount: numericAmount }) },
          token,
        );

        setProgress(proofMode === "file" ? "Uploading proof…" : "Checking proof link…");
        const proofPath = await uploadProofIfNeeded();

        setProgress("Submitting for verification…");
        const payload = {
          reservation_id: reservationId,
          amount: numericAmount,
          payment_type: paymentType,
          method: "gcash",
          reference_no: referenceNo.trim() || null,
          proof_url: proofPath,
          idempotency_key: crypto.randomUUID(),
        };
        const outcome = await syncAwareMutation<typeof payload, PaymentSubmissionResponse>({
          path: "/v2/payments/submissions",
          method: "POST",
          payload,
          parser: paymentSubmissionResponseSchema,
          accessToken: token,
          entityType: "payment_submission",
          action: "payments.submissions.create",
        });

        const queued = outcome.mode === "queued";
        router.replace(`/reserve/${encodeURIComponent(reservationId)}/confirmation${queued ? "?queued=1" : ""}`);
      } catch (unknownError) {
        setError(getApiErrorMessage(unknownError, "Failed to submit payment."));
        setBusy(false);
        setProgress(null);
      }
    },
    [amount, proofFile, proofMode, proofUrl, referenceNo, reservationId, router, token, totals, uploadProofIfNeeded],
  );

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
      setRedirecting(false);
    } catch (unknownError) {
      setOnlineError(getApiErrorMessage(unknownError, "Online payment is unavailable right now."));
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
        <div className="space-y-6 lg:col-start-1 lg:row-start-1">
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
              onClick={() => void payOnline()}
              disabled={redirecting}
              className="mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--color-cta)] text-base font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {redirecting ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
              {redirecting ? "Redirecting to GCash…" : `Pay ${formatPeso(totals.deposit)} with GCash`}
            </button>
            <p className="mt-2 text-center text-xs muted-text">Secured by PayMongo.</p>
          </section>
        </div>

        <form onSubmit={submit} className="space-y-6 lg:col-start-1 lg:row-start-2">
          <section className="space-y-4 rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
            <h2 className="text-lg font-semibold">Or submit a GCash proof manually</h2>
            <p className="-mt-1 text-sm muted-text">
              Paid via the manual GCash account instead? Enter your reference and upload the receipt for admin
              verification.
            </p>
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-3">
              <GcashPaymentGuide />
            </div>
            <Input
              label="Amount paid (PHP)"
              type="number"
              min={1}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              helperText={`Minimum deposit due: ${formatPeso(totals.deposit)}`}
            />
            <Input
              label="GCash reference number"
              value={referenceNo}
              onChange={(event) => setReferenceNo(event.target.value)}
              placeholder="e.g. 0123 456 789"
            />

            <div>
              <span className="mb-1.5 block text-sm font-semibold text-[var(--color-text)]">Payment proof</span>
              <div className="mb-3 inline-flex rounded-full border border-[var(--color-border)] p-1">
                {(["file", "url"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    onClick={() => setProofMode(mode)}
                    className={`rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                      proofMode === mode
                        ? "bg-[var(--color-primary)] text-white"
                        : "text-[var(--color-text)]"
                    }`}
                  >
                    {mode === "file" ? "Upload file" : "Paste link"}
                  </button>
                ))}
              </div>
              {proofMode === "file" ? (
                <label className="flex cursor-pointer items-center gap-2 rounded-2xl border border-dashed border-[var(--color-border)] px-4 py-3 text-sm muted-text hover:border-[var(--color-text)]">
                  <Upload className="h-4 w-4" />
                  {proofFile ? proofFile.name : "Choose a screenshot of your GCash receipt"}
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    className="hidden"
                    onChange={(event) => setProofFile(event.target.files?.[0] ?? null)}
                  />
                </label>
              ) : (
                <Input
                  label=""
                  value={proofUrl}
                  onChange={(event) => setProofUrl(event.target.value)}
                  placeholder="https://link-to-your-receipt"
                />
              )}
            </div>

            {error ? (
              <p className="rounded-xl bg-[color:color-mix(in_srgb,var(--color-error)_10%,white)] px-3 py-2 text-sm text-[var(--color-error)]">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={busy}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-[var(--color-cta)] text-base font-semibold text-white transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
              {busy ? progress || "Submitting…" : "Confirm and submit payment"}
            </button>
            <p className="text-center text-xs muted-text">
              An admin verifies your payment, then your stay is confirmed for QR check-in.
            </p>
          </section>
        </form>

        <aside className="lg:col-start-2 lg:row-start-1">
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
    </div>
  );
}
