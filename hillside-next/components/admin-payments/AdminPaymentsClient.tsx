"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  AdminPaymentItem,
  AdminPaymentsResponse,
  AdminPaymentsTab,
  ReservationStatus,
} from "../../../packages/shared/src/types";
import {
  adminPaymentsResponseSchema,
  onSitePaymentResponseSchema,
  paymentRejectResponseSchema,
  paymentVerifyResponseSchema,
} from "../../../packages/shared/src/schemas";
import { apiFetch } from "../../lib/apiClient";
import { getSupabaseBrowserClient } from "../../lib/supabase";

type AdminPaymentsClientProps = {
  initialToken?: string | null;
  initialData?: AdminPaymentsResponse | null;
  initialTab?: AdminPaymentsTab;
  initialSearch?: string;
  initialPage?: number;
};

const PAGE_SIZE = 10;
const TAB_LABELS: Array<{ id: AdminPaymentsTab; label: string }> = [
  { id: "to_review", label: "To Review" },
  { id: "verified", label: "Verified" },
  { id: "rejected", label: "Rejected" },
  { id: "all", label: "All" },
];

const RESERVATION_STATUS_META: Partial<Record<ReservationStatus, { label: string; className: string }>> = {
  pending_payment: { label: "Pending Payment", className: "bg-yellow-100 text-yellow-800" },
  for_verification: { label: "For Verification", className: "bg-orange-100 text-orange-800" },
  confirmed: { label: "Confirmed", className: "bg-green-100 text-green-800" },
  checked_in: { label: "Checked In", className: "bg-indigo-100 text-indigo-800" },
  checked_out: { label: "Checked Out", className: "bg-slate-200 text-slate-700" },
  cancelled: { label: "Cancelled", className: "bg-red-100 text-red-800" },
  no_show: { label: "No Show", className: "bg-red-100 text-red-800" },
};

const CANCELLED_STATUSES = new Set<ReservationStatus>(["cancelled", "no_show"]);

function formatPeso(value: number | null | undefined) {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function statusMeta(status?: ReservationStatus | null) {
  if (!status) return { label: "Unknown", className: "bg-slate-100 text-slate-700" };
  return RESERVATION_STATUS_META[status] ?? { label: status.replace("_", " "), className: "bg-slate-100 text-slate-700" };
}

function normalizeProofPath(raw: string) {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) return trimmed;
  if (trimmed.includes("/payment-proofs/")) {
    return trimmed.split("/payment-proofs/")[1] ?? trimmed;
  }
  return trimmed;
}

export function AdminPaymentsClient({
  initialToken = null,
  initialData = null,
  initialTab = "to_review",
  initialSearch = "",
  initialPage = 1,
}: AdminPaymentsClientProps) {
  const token = initialToken;

  const [tab, setTab] = useState<AdminPaymentsTab>(initialTab);
  const [searchInput, setSearchInput] = useState(initialSearch);
  const [searchValue, setSearchValue] = useState(initialSearch);
  const [page, setPage] = useState(Math.max(1, initialPage));

  const [items, setItems] = useState<AdminPaymentItem[]>(initialData?.items ?? []);
  const [count, setCount] = useState(initialData?.count ?? 0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [notice, setNotice] = useState<string | null>(null);
  const [proofBusy, setProofBusy] = useState<Record<string, boolean>>({});
  const [onSiteReservationId, setOnSiteReservationId] = useState("");
  const [onSiteAmount, setOnSiteAmount] = useState("100");
  const [onSiteMethod, setOnSiteMethod] = useState("cash");
  const [onSiteReferenceNo, setOnSiteReferenceNo] = useState("");
  const [onSiteBusy, setOnSiteBusy] = useState(false);

  const [rejectTarget, setRejectTarget] = useState<AdminPaymentItem | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectBusy, setRejectBusy] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSearchValue(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  const fetchList = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const offset = (page - 1) * PAGE_SIZE;
      const qs = new URLSearchParams();
      qs.set("tab", tab);
      qs.set("limit", String(PAGE_SIZE));
      qs.set("offset", String(offset));
      if (searchValue) qs.set("search", searchValue);

      const data = await apiFetch<AdminPaymentsResponse>(
        `/v2/payments?${qs.toString()}`,
        { method: "GET" },
        token,
        adminPaymentsResponseSchema,
      );
      setItems(data.items ?? []);
      setCount(data.count ?? 0);
    } catch (unknownError) {
      setItems([]);
      setCount(0);
      setError(unknownError instanceof Error ? unknownError.message : "Failed to load payments.");
    } finally {
      setLoading(false);
    }
  }, [page, searchValue, tab, token]);

  useEffect(() => {
    if (!token) return;
    const isInitialState =
      initialData &&
      page === Math.max(1, initialPage) &&
      tab === initialTab &&
      searchValue === initialSearch;
    if (isInitialState) return;
    void fetchList();
  }, [fetchList, initialData, initialPage, initialSearch, initialTab, page, searchValue, tab, token]);

  const verifyPayment = useCallback(
    async (paymentId: string) => {
      if (!token) return;
      setError(null);
      try {
        await apiFetch(
          `/v2/payments/${encodeURIComponent(paymentId)}/verify`,
          { method: "POST" },
          token,
          paymentVerifyResponseSchema,
        );
        setNotice("Payment verified.");
        await fetchList();
      } catch (unknownError) {
        setError(unknownError instanceof Error ? unknownError.message : "Failed to verify payment.");
      }
    },
    [fetchList, token],
  );

  const confirmReject = useCallback(async () => {
    if (!token || !rejectTarget) return;
    const reason = rejectReason.trim();
    if (reason.length < 5) {
      setRejectError("Reason must be at least 5 characters.");
      return;
    }

    setRejectBusy(true);
    setRejectError(null);
    try {
      await apiFetch(
        `/v2/payments/${encodeURIComponent(rejectTarget.payment_id)}/reject`,
        {
          method: "POST",
          body: JSON.stringify({ reason }),
        },
        token,
        paymentRejectResponseSchema,
      );
      setNotice("Payment rejected.");
      setRejectTarget(null);
      setRejectReason("");
      await fetchList();
    } catch (unknownError) {
      setRejectError(unknownError instanceof Error ? unknownError.message : "Failed to reject payment.");
    } finally {
      setRejectBusy(false);
    }
  }, [fetchList, rejectReason, rejectTarget, token]);

  const openProof = useCallback(async (payment: AdminPaymentItem) => {
    if (!payment.proof_url) return;
    const raw = payment.proof_url;
    if (raw.startsWith("http://") || raw.startsWith("https://")) {
      window.open(raw, "_blank", "noopener,noreferrer");
      return;
    }

    const normalizedPath = normalizeProofPath(raw);
    if (!normalizedPath) return;

    setProofBusy((prev) => ({ ...prev, [payment.payment_id]: true }));
    try {
      const supabase = getSupabaseBrowserClient();
      const { data, error: signError } = await supabase.storage
        .from("payment-proofs")
        .createSignedUrl(normalizedPath, 600);

      if (signError || !data?.signedUrl) {
        throw signError ?? new Error("Failed to generate signed URL.");
      }
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : "Failed to open proof.");
    } finally {
      setProofBusy((prev) => ({ ...prev, [payment.payment_id]: false }));
    }
  }, []);

  const submitOnSitePayment = useCallback(async () => {
    if (!token) return;
    const reservationId = onSiteReservationId.trim();
    const amount = Number(onSiteAmount);
    if (!reservationId) {
      setError("Reservation ID is required for on-site payment.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Amount must be greater than zero.");
      return;
    }

    setOnSiteBusy(true);
    setError(null);
    setNotice(null);
    try {
      const response = await apiFetch(
        "/v2/payments/on-site",
        {
          method: "POST",
          body: JSON.stringify({
            reservation_id: reservationId,
            amount,
            method: onSiteMethod,
            reference_no: onSiteReferenceNo.trim() || null,
          }),
        },
        token,
        onSitePaymentResponseSchema,
      );
      setNotice(
        `On-site payment recorded (${response.payment_id}). Reservation status: ${response.reservation_status}.`,
      );
      await fetchList();
    } catch (unknownError) {
      setError(unknownError instanceof Error ? unknownError.message : "Failed to record on-site payment.");
    } finally {
      setOnSiteBusy(false);
    }
  }, [fetchList, onSiteAmount, onSiteMethod, onSiteReferenceNo, onSiteReservationId, token]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(count / PAGE_SIZE)), [count]);
  const canPrev = page > 1;
  const canNext = page < totalPages;
  const isToReview = tab === "to_review";
  const showVerifiedCols = tab === "verified" || tab === "all";
  const showRejectedCols = tab === "rejected" || tab === "all";

  if (!token) {
    return (
      <section className="mx-auto w-full max-w-6xl">
        <h1 className="text-3xl font-bold text-slate-900">Payments</h1>
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          No active session found. Sign in as admin first.
        </p>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-6xl">
      <header className="mb-5">
        <h1 className="text-3xl font-bold text-slate-900">Payments</h1>
        <p className="mt-1 text-sm text-slate-600">Verification inbox and payment history</p>
      </header>

      <div className="mb-4 rounded-xl border border-blue-100 bg-white p-3 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {TAB_LABELS.map((tabDef) => (
            <button
              key={tabDef.id}
              type="button"
              onClick={() => {
                setTab(tabDef.id);
                setPage(1);
              }}
              className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                tab === tabDef.id
                  ? "border-blue-700 bg-blue-700 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:border-blue-300 hover:text-blue-700"
              }`}
            >
              {tabDef.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-blue-100 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <input
            type="text"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search reservation code, guest, or reference"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-200 transition focus:ring-2 md:max-w-md"
          />
          <p className="text-xs text-slate-500">
            {isToReview
              ? "To Review: pending submissions with proof/reference only."
              : "History tab: verified and rejected attempts."}
          </p>
        </div>
      </div>

      <div className="mb-4 rounded-xl border border-emerald-100 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-900">Record On-site Payment</h3>
        <div className="grid gap-3 md:grid-cols-4">
          <label className="grid gap-1 text-xs text-slate-600 md:col-span-2">
            Reservation ID
            <input
              type="text"
              value={onSiteReservationId}
              onChange={(event) => setOnSiteReservationId(event.target.value)}
              placeholder="UUID"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="grid gap-1 text-xs text-slate-600">
            Amount
            <input
              type="number"
              min={1}
              value={onSiteAmount}
              onChange={(event) => setOnSiteAmount(event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <label className="grid gap-1 text-xs text-slate-600">
            Method
            <select
              value={onSiteMethod}
              onChange={(event) => setOnSiteMethod(event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="cash">Cash</option>
              <option value="gcash">GCash</option>
              <option value="bank">Bank</option>
              <option value="card">Card</option>
            </select>
          </label>
          <label className="grid gap-1 text-xs text-slate-600 md:col-span-3">
            Reference No (optional)
            <input
              type="text"
              value={onSiteReferenceNo}
              onChange={(event) => setOnSiteReferenceNo(event.target.value)}
              placeholder="Receipt / ref number"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </label>
          <div className="flex items-end">
            <button
              type="button"
              onClick={() => void submitOnSitePayment()}
              disabled={onSiteBusy}
              className="w-full rounded-lg border border-emerald-700 bg-emerald-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {onSiteBusy ? "Recording..." : "Record"}
            </button>
          </div>
        </div>
      </div>

      {notice ? (
        <p className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p>
      ) : null}
      {error ? (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
      ) : null}
      {loading ? <p className="mb-3 text-sm text-slate-600">Loading payments...</p> : null}

      {!loading && count === 0 ? (
        <div className="rounded-xl border border-blue-100 bg-white p-8 text-center shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">
            {isToReview ? "No payment submissions to review" : "No payment history in this tab"}
          </h3>
          <p className="mt-2 text-sm text-slate-600">
            {isToReview ? "Only pending submissions with proof/reference appear here." : "Try another tab or search."}
          </p>
          {isToReview ? (
            <a
              href="/admin/reservations?status=pending_payment"
              className="mt-5 inline-flex rounded-lg border border-blue-700 bg-blue-700 px-4 py-2 text-sm font-semibold text-white"
            >
              View Pending Payment Reservations
            </a>
          ) : null}
        </div>
      ) : null}

      {count > 0 ? (
        <div className="overflow-hidden rounded-xl border border-blue-100 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">Reservation</th>
                  <th className="px-4 py-3 font-semibold">Reservation Status</th>
                  <th className="px-4 py-3 font-semibold">Guest</th>
                  <th className="px-4 py-3 font-semibold">Amount</th>
                  <th className="px-4 py-3 font-semibold">Method</th>
                  <th className="px-4 py-3 font-semibold">Reference</th>
                  <th className="px-4 py-3 font-semibold">Proof</th>
                  {showVerifiedCols ? <th className="px-4 py-3 font-semibold">Verified</th> : null}
                  {showRejectedCols ? <th className="px-4 py-3 font-semibold">Rejected</th> : null}
                  {isToReview ? <th className="px-4 py-3 text-right font-semibold">Actions</th> : null}
                </tr>
              </thead>
              <tbody>
                {items.map((payment) => {
                  const reservationStatus = payment.reservation?.status ?? null;
                  const isCancelledReservation = reservationStatus ? CANCELLED_STATUSES.has(reservationStatus) : false;
                  const hasEvidence = Boolean(payment.proof_url || payment.reference_no);
                  const resMeta = statusMeta(reservationStatus);
                  return (
                    <tr key={payment.payment_id} className="border-t border-slate-100">
                      <td className="px-4 py-3">
                        <p className="font-mono font-semibold text-blue-800">{payment.reservation?.reservation_code ?? "-"}</p>
                        <p className="text-xs text-slate-500">{formatDateTime(payment.created_at)}</p>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${resMeta.className}`}>{resMeta.label}</span>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{payment.reservation?.guest?.name || payment.reservation?.guest?.email || "-"}</p>
                        <p className="text-xs text-slate-500">{payment.reservation?.guest?.email || "-"}</p>
                      </td>
                      <td className="px-4 py-3 font-semibold text-slate-900">{formatPeso(payment.amount)}</td>
                      <td className="px-4 py-3 capitalize text-slate-700">{payment.method}</td>
                      <td className="px-4 py-3 text-slate-700">{payment.reference_no || "-"}</td>
                      <td className="px-4 py-3">
                        {payment.proof_url ? (
                          <button
                            type="button"
                            onClick={() => void openProof(payment)}
                            disabled={Boolean(proofBusy[payment.payment_id])}
                            className="text-sm font-semibold text-blue-700 hover:underline disabled:opacity-60"
                          >
                            {proofBusy[payment.payment_id] ? "Loading..." : "View"}
                          </button>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )}
                      </td>
                      {showVerifiedCols ? (
                        <td className="px-4 py-3 text-slate-700">
                          {formatDateTime(payment.verified_at)}
                          <br />
                          <span className="text-xs text-slate-500">
                            {payment.verified_admin?.name || payment.verified_admin?.email || "-"}
                          </span>
                        </td>
                      ) : null}
                      {showRejectedCols ? (
                        <td className="px-4 py-3 text-slate-700">
                          {payment.rejected_reason || "-"}
                          <br />
                          <span className="text-xs text-slate-500">
                            {formatDateTime(payment.rejected_at)} by {payment.rejected_admin?.name || payment.rejected_admin?.email || "-"}
                          </span>
                        </td>
                      ) : null}
                      {isToReview ? (
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex gap-2">
                            <button
                              type="button"
                              onClick={() => void verifyPayment(payment.payment_id)}
                              disabled={isCancelledReservation || !hasEvidence}
                              className="rounded-lg border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              Verify
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setRejectTarget(payment);
                                setRejectReason("");
                                setRejectError(null);
                              }}
                              disabled={isCancelledReservation || !hasEvidence}
                              className="rounded-lg border border-red-600 bg-red-600 px-3 py-1.5 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              Reject
                            </button>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
            <p className="text-xs text-slate-500">
              Page {page} of {totalPages} | {count} total
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPage((prev) => Math.max(1, prev - 1))}
                disabled={!canPrev}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 disabled:opacity-50"
              >
                Previous
              </button>
              <button
                type="button"
                onClick={() => setPage((prev) => prev + 1)}
                disabled={!canNext}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {rejectTarget ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 md:items-center md:p-4">
          <div className="w-full rounded-t-2xl border border-blue-100 bg-white p-4 md:max-w-xl md:rounded-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Reject payment submission</h3>
              <button
                type="button"
                aria-label="Close"
                onClick={() => {
                  if (rejectBusy) return;
                  setRejectTarget(null);
                  setRejectReason("");
                  setRejectError(null);
                }}
                className="h-8 w-8 rounded-lg border border-slate-300 text-slate-600"
              >
                x
              </button>
            </div>
            <p className="mb-3 text-sm text-slate-600">
              This will notify the guest that the submitted proof/reference could not be verified. They can resubmit payment proof.
            </p>
            <textarea
              value={rejectReason}
              onChange={(event) => setRejectReason(event.target.value)}
              placeholder="e.g., Reference number not found in GCash records."
              className="min-h-[120px] w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-200 transition focus:ring-2"
            />
            <p className="mt-1 text-xs text-slate-500">Minimum 5 characters.</p>
            {rejectError ? (
              <p className="mt-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{rejectError}</p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  if (rejectBusy) return;
                  setRejectTarget(null);
                  setRejectReason("");
                  setRejectError(null);
                }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                disabled={rejectBusy}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmReject()}
                className="rounded-lg border border-red-600 bg-red-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                disabled={rejectBusy || rejectReason.trim().length < 5}
              >
                {rejectBusy ? "Rejecting..." : "Confirm Reject"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
