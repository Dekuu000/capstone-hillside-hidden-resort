"use client";

import Link from "next/link";
import { AlertCircle, ChevronDown, ExternalLink, ShieldCheck, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { AdminPaymentItem, ReservationListItem } from "../../../packages/shared/src/types";

type ReservationDetailDrawerProps = {
  open: boolean;
  loading: boolean;
  error: string | null;
  reservation: ReservationListItem | null;
  payments: AdminPaymentItem[];
  paymentsLoading: boolean;
  paymentsError: string | null;
  proofBusy: Record<string, boolean>;
  verifyBusy: Record<string, boolean>;
  onClose: () => void;
  onRefreshPayments: () => void;
  onOpenProof: (payment: AdminPaymentItem) => void;
  onVerifyPayment: (paymentId: string) => void;
};

type ReadinessState =
  | "ready"
  | "blocked_unpaid"
  | "blocked_date"
  | "already_checked_in"
  | "queued_offline"
  | "completed";

type PrimaryActionType = "record_payment" | "check_in" | "check_out" | "view_history" | "none";

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function formatPeso(value: number | null | undefined) {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function getReservationSource(reservation: ReservationListItem): "online" | "walk_in" {
  if (reservation.reservation_source === "online" || reservation.reservation_source === "walk_in") {
    return reservation.reservation_source;
  }
  const notes = String(reservation.notes || "").toLowerCase();
  return notes.includes("walk-in") || notes.includes("walk in") ? "walk_in" : "online";
}

function getPaymentState(reservation: ReservationListItem): "unpaid" | "partial" | "settled" {
  const total = Number(reservation.total_amount ?? 0);
  const paid = Number(reservation.amount_paid_verified ?? 0);
  const balance = Number(reservation.balance_due ?? Math.max(total - paid, 0));
  if (balance <= 0 && total > 0) return "settled";
  if (paid > 0 && balance > 0) return "partial";
  return "unpaid";
}

function getPaymentStateMeta(state: "unpaid" | "partial" | "settled") {
  if (state === "settled") return { label: "Paid", className: "bg-emerald-100 text-emerald-800" };
  if (state === "partial") return { label: "Partial", className: "bg-amber-100 text-amber-800" };
  return { label: "Unpaid", className: "bg-slate-200 text-slate-700" };
}

function getReservationStatusMeta(status: string) {
  const map: Record<string, string> = {
    pending_payment: "bg-yellow-100 text-yellow-800",
    for_verification: "bg-blue-100 text-blue-800",
    confirmed: "bg-emerald-100 text-emerald-800",
    checked_in: "bg-indigo-100 text-indigo-800",
    checked_out: "bg-slate-200 text-slate-700",
    cancelled: "bg-red-100 text-red-800",
    no_show: "bg-red-100 text-red-800",
  };
  return {
    label: status.replaceAll("_", " "),
    className: map[status] ?? "bg-slate-200 text-slate-700",
  };
}

function getExplorerBase(chainKey: string | null | undefined) {
  if (chainKey === "amoy") return "https://amoy.polygonscan.com/tx/";
  return "https://sepolia.etherscan.io/tx/";
}

function readinessMeta(state: ReadinessState) {
  const map: Record<ReadinessState, { label: string; detail: string; className: string }> = {
    ready: {
      label: "Ready for check-in",
      detail: "Payment settled and arrival date is valid.",
      className: "border-emerald-200 bg-emerald-50 text-emerald-800",
    },
    blocked_unpaid: {
      label: "Blocked: unpaid balance",
      detail: "Record/verify payment first before check-in.",
      className: "border-amber-200 bg-amber-50 text-amber-800",
    },
    blocked_date: {
      label: "Blocked: not arrival date",
      detail: "Check-in is allowed only on the reservation date.",
      className: "border-red-200 bg-red-50 text-red-800",
    },
    already_checked_in: {
      label: "Already checked in",
      detail: "Use check-out flow when guest is ready to leave.",
      className: "border-indigo-200 bg-indigo-50 text-indigo-800",
    },
    queued_offline: {
      label: "Queued offline",
      detail: "Action is queued and will sync when connection returns.",
      className: "border-blue-200 bg-blue-50 text-blue-800",
    },
    completed: {
      label: "Completed",
      detail: "Reservation is already completed/cancelled/no-show.",
      className: "border-slate-200 bg-slate-100 text-slate-700",
    },
  };
  return map[state];
}

export function ReservationDetailDrawer({
  open,
  loading,
  error,
  reservation,
  payments,
  paymentsLoading,
  paymentsError,
  proofBusy,
  verifyBusy,
  onClose,
  onRefreshPayments,
  onOpenProof,
  onVerifyPayment,
}: ReservationDetailDrawerProps) {
  const [ledgerOpen, setLedgerOpen] = useState(false);

  const source = reservation ? getReservationSource(reservation) : "online";
  const isTour = (reservation?.service_bookings?.length ?? 0) > 0;
  const reservationType = isTour ? "tour" : "room";
  const arrivalDate = isTour
    ? reservation?.service_bookings?.[0]?.visit_date ?? reservation?.check_in_date ?? null
    : reservation?.check_in_date ?? null;
  const todayKey = new Date().toISOString().slice(0, 10);
  const isSameDay = Boolean(arrivalDate && arrivalDate === todayKey);
  const paymentState = reservation ? getPaymentState(reservation) : "unpaid";
  const paymentMeta = getPaymentStateMeta(paymentState);
  const reservationStatusMeta = getReservationStatusMeta(reservation?.status ?? "pending_payment");
  const isOfflineQueued = String(reservation?.notes || "").toLowerCase().includes("offline queue");

  const latestPayment = useMemo(() => {
    const sorted = [...payments].sort(
      (a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime(),
    );
    return sorted[0] ?? null;
  }, [payments]);
  const firstPendingPayment = payments.find((payment) => payment.status === "pending") ?? null;

  const readinessState: ReadinessState = useMemo(() => {
    if (!reservation) return "blocked_unpaid";
    if (["checked_out", "cancelled", "no_show"].includes(reservation.status)) return "completed";
    if (reservation.status === "checked_in") return "already_checked_in";
    if (isOfflineQueued) return "queued_offline";
    if (paymentState !== "settled") return "blocked_unpaid";
    if (!arrivalDate || arrivalDate > todayKey) return "blocked_date";
    return "ready";
  }, [arrivalDate, isOfflineQueued, paymentState, reservation, todayKey]);

  const readiness = readinessMeta(readinessState);
  const checkInUrl = reservation
    ? `/admin/check-in?mode=code&reservation_code=${encodeURIComponent(reservation.reservation_code)}`
    : "/admin/check-in";
  const paymentRecordUrl = reservation
    ? `/admin/payments?reservation_id=${encodeURIComponent(reservation.reservation_id)}${source === "walk_in" ? "&source=walkin" : ""}`
    : "/admin/payments";
  const paymentListUrl = reservation ? `/admin/payments?search=${encodeURIComponent(reservation.reservation_code)}` : "/admin/payments";
  const txHash = reservation?.chain_tx_hash ?? null;
  const txUrl = txHash ? `${getExplorerBase(reservation?.chain_key)}${txHash}` : null;
  const checkInActionHref = paymentState === "settled" ? checkInUrl : `${checkInUrl}&override=1`;
  const checkInActionLabel = paymentState === "settled" ? "Check-in" : "Check-in (Override)";
  const remainingBalance = Number(reservation?.balance_due ?? 0);
  const historyUrl = reservation
    ? `/admin/blockchain?tab=audit&search=${encodeURIComponent(reservation.reservation_id)}`
    : "/admin/blockchain?tab=audit";

  const primaryAction = useMemo((): { type: PrimaryActionType; label: string; href: string | null; detail: string } => {
    if (!reservation) {
      return { type: "none", label: "Close", href: null, detail: "No reservation selected." };
    }
    if (["checked_out", "cancelled", "no_show"].includes(reservation.status)) {
      return {
        type: "view_history",
        label: "View history",
        href: historyUrl,
        detail: "Reservation is complete. Review history and audit trail.",
      };
    }
    if (reservation.status === "checked_in") {
      return {
        type: "check_out",
        label: "Check Out",
        href: checkInUrl,
        detail: "Guest is checked in. Next step is check-out.",
      };
    }
    if (paymentState !== "settled") {
      return {
        type: "record_payment",
        label: "Record Payment",
        href: paymentRecordUrl,
        detail: "Blocked by unpaid balance. Record payment to enable check-in.",
      };
    }
    if (readinessState === "ready") {
      return {
        type: "check_in",
        label: "Check In Now",
        href: checkInUrl,
        detail: "Reservation is fully settled and ready for check-in.",
      };
    }
    return {
      type: "none",
      label: "Close",
      href: null,
      detail: readinessState === "blocked_date"
        ? "Arrival date is not yet eligible for check-in."
        : "No direct action required right now.",
    };
  }, [checkInUrl, historyUrl, paymentRecordUrl, paymentState, readinessState, reservation]);

  const paymentDynamicNote = useMemo(() => {
    if (!reservation) return "";
    if (paymentState === "settled") {
      return readinessState === "ready"
        ? "Reservation is fully settled and ready for check-in."
        : "Reservation is fully settled.";
    }
    const amount = Math.max(0, remainingBalance);
    return `Recording ${formatPeso(amount)} will unlock check-in.`;
  }, [paymentState, readinessState, remainingBalance, reservation]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/55 p-3 backdrop-blur-[2px] lg:left-64">
      <div className="w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xl">
        <div className="max-h-[92vh] overflow-y-auto">
          <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-bold text-slate-900">{reservation?.reservation_code ?? "Reservation details"}</h3>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close reservation details"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-300 text-slate-600 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {reservation ? (
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1.5 text-[11px] font-semibold">
                  <span className={`rounded-full px-2 py-0.5 ${source === "walk_in" ? "bg-emerald-100 text-emerald-800" : "bg-blue-100 text-blue-800"}`}>
                    {source === "walk_in" ? "Walk-in" : "Online"}
                  </span>
                  <span className="rounded-full bg-purple-100 px-2 py-0.5 text-purple-800">{reservationType === "tour" ? "Tour" : "Room"}</span>
                  {isSameDay ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">Arriving today</span> : null}
                </div>
                {reservation.created_at ? (
                  <span className="shrink-0 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                    Created {formatDateTime(reservation.created_at)}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="space-y-3 p-4">
            {loading ? <p className="text-sm text-slate-600">Loading details...</p> : null}
            {error ? (
              <div className="inline-flex w-full items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </div>
            ) : null}

            {reservation ? (
              <>
                <section className={`rounded-2xl border p-3 ${readiness.className}`}>
                  <div className="grid gap-2 md:grid-cols-2">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] opacity-75">Current state</p>
                      <p className="mt-1 text-sm font-semibold">{readiness.label}</p>
                    </div>
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] opacity-75">Next step</p>
                      <p className="mt-1 text-sm font-semibold">{primaryAction.detail}</p>
                    </div>
                  </div>
                </section>

                <section className="rounded-2xl border border-slate-200 p-3">
                  <h4 className="text-sm font-semibold text-slate-900">Reservation Summary</h4>
                  <div className="mt-2 grid gap-2 text-sm md:grid-cols-2">
                    <p><span className="text-slate-500">Guest:</span> {reservation.guest?.name || "-"}</p>
                    <p><span className="text-slate-500">Contact:</span> {reservation.guest?.phone || reservation.guest?.email || "-"}</p>
                    <p><span className="text-slate-500">{isTour ? "Tour" : "Unit"}:</span> {isTour ? (reservation.service_bookings?.map((item) => item.service?.service_name || "Tour").join(", ") || "-") : (reservation.units?.map((item) => item.unit?.name || "Unit").join(", ") || "-")}</p>
                    <p><span className="text-slate-500">{isTour ? "Visit date:" : "Stay dates:"}</span> {isTour ? formatDate(arrivalDate) : `${formatDate(reservation.check_in_date)} to ${formatDate(reservation.check_out_date)}`}</p>
                    <p><span className="text-slate-500">Pax:</span> {reservation.guest_count ?? "-"}</p>
                    <p><span className="text-slate-500">Created at:</span> {formatDateTime(reservation.created_at)}</p>
                    <p><span className="text-slate-500">Booking source:</span> {source === "walk_in" ? "Walk-in front desk" : "Online guest portal"}</p>
                    <p><span className="text-slate-500">Created by:</span> {source === "walk_in" ? "Front desk admin" : "Guest account"}</p>
                  </div>
                </section>

                <section className="rounded-2xl border border-slate-200 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-slate-900">Payment Summary</h4>
                    <button
                      type="button"
                      onClick={onRefreshPayments}
                      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700"
                    >
                      Refresh
                    </button>
                  </div>
                  <div className="grid gap-2 text-sm md:grid-cols-2">
                    <p><span className="text-slate-500">Total due:</span> {formatPeso(reservation.total_amount)}</p>
                    <p><span className="text-slate-500">Total paid:</span> {formatPeso(reservation.amount_paid_verified)}</p>
                    <p><span className="text-slate-500">Remaining:</span> {formatPeso(reservation.balance_due)}</p>
                    <p><span className="text-slate-500">Payment method:</span> {latestPayment?.method?.toUpperCase() || "-"}</p>
                    <p><span className="text-slate-500">Latest payment:</span> {formatDateTime(latestPayment?.created_at)}</p>
                    <p><span className="text-slate-500">Verification:</span> {firstPendingPayment ? "Pending verification" : paymentMeta.label}</p>
                  </div>
                  <p className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs text-slate-700">
                    {paymentDynamicNote}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link href={paymentListUrl} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
                      View Payments
                    </Link>
                    <Link href={paymentRecordUrl} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
                      Open Payment Form
                    </Link>
                    <Link
                      href={checkInActionHref}
                      className={`rounded-lg px-3 py-2 text-xs font-semibold ${
                        paymentState === "settled"
                          ? "border border-emerald-700 bg-emerald-700 text-white"
                          : "border border-amber-400 bg-amber-50 text-amber-800"
                      }`}
                    >
                      {checkInActionLabel}
                    </Link>
                    {source === "online" && firstPendingPayment ? (
                      <button
                        type="button"
                        onClick={() => onVerifyPayment(firstPendingPayment.payment_id)}
                        disabled={Boolean(verifyBusy[firstPendingPayment.payment_id])}
                        className="rounded-lg border border-emerald-600 bg-emerald-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-60"
                      >
                        {verifyBusy[firstPendingPayment.payment_id] ? "Verifying..." : "Verify Payment"}
                      </button>
                    ) : null}
                  </div>
                  {paymentsLoading ? <p className="mt-2 text-xs text-slate-500">Loading payments...</p> : null}
                  {paymentsError ? <p className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{paymentsError}</p> : null}
                  {!paymentsLoading && payments.length > 0 ? (
                    <div className="mt-3 overflow-x-auto">
                      <table className="min-w-full text-left text-xs">
                        <thead className="text-slate-500">
                          <tr>
                            <th className="px-2 py-1">When</th>
                            <th className="px-2 py-1">Method</th>
                            <th className="px-2 py-1">Amount</th>
                            <th className="px-2 py-1">Status</th>
                            <th className="px-2 py-1">Proof</th>
                          </tr>
                        </thead>
                        <tbody>
                          {payments.slice(0, 5).map((payment) => (
                            <tr key={payment.payment_id} className="border-t border-slate-100">
                              <td className="px-2 py-1">{formatDateTime(payment.created_at)}</td>
                              <td className="px-2 py-1">{payment.method.toUpperCase()}</td>
                              <td className="px-2 py-1 font-semibold">{formatPeso(payment.amount)}</td>
                              <td className="px-2 py-1">{payment.status}</td>
                              <td className="px-2 py-1">
                                {payment.proof_url ? (
                                  <button
                                    type="button"
                                    onClick={() => onOpenProof(payment)}
                                    disabled={Boolean(proofBusy[payment.payment_id])}
                                    className="rounded border border-slate-300 bg-white px-2 py-1 font-semibold text-slate-700 disabled:opacity-60"
                                  >
                                    {proofBusy[payment.payment_id] ? "Loading..." : "View"}
                                  </button>
                                ) : (
                                  "-"
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : null}
                </section>

                <section className="rounded-2xl border border-slate-200 p-3">
                  <button
                    type="button"
                    onClick={() => setLedgerOpen((prev) => !prev)}
                    className="flex w-full items-center justify-between text-left"
                  >
                    <h4 className="text-sm font-semibold text-slate-900">Blockchain / Ledger</h4>
                    <ChevronDown className={`h-4 w-4 text-slate-500 transition ${ledgerOpen ? "rotate-180" : ""}`} />
                  </button>
                  {ledgerOpen ? (
                    <div className="mt-3 space-y-2 text-sm">
                      <p><span className="text-slate-500">Escrow state:</span> {reservation.escrow_state || "-"}</p>
                      <p><span className="text-slate-500">NFT guest pass:</span> {reservation.guest_pass_token_id ? "Minted" : "Not minted"}</p>
                      <p><span className="text-slate-500">Tx hash:</span> <span className="font-mono text-xs break-all">{reservation.chain_tx_hash || "-"}</span></p>
                      <p><span className="text-slate-500">Token ID:</span> {reservation.guest_pass_token_id ?? "-"}</p>
                      <p><span className="text-slate-500">Booking hash:</span> <span className="font-mono text-xs break-all">{reservation.guest_pass_reservation_hash || reservation.onchain_booking_id || "-"}</span></p>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Link href="/admin/blockchain?tab=reconciliation" className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700">
                          Open Reconciliation
                        </Link>
                        <Link
                          href={`/admin/blockchain?tab=audit&search=${encodeURIComponent(reservation.reservation_id)}`}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                        >
                          Open Audit
                        </Link>
                        {txUrl ? (
                          <a
                            href={txUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                          >
                            View transaction
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </section>
              </>
            ) : null}
          </div>

          {reservation ? (
            <div className="sticky bottom-0 z-10 border-t border-slate-200 bg-white/95 p-3 backdrop-blur">
              <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700"
                >
                  Close
                </button>
                {primaryAction.href ? (
                  primaryAction.type === "view_history" ? (
                    <Link
                      href={primaryAction.href}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-900 bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
                    >
                      <ShieldCheck className="h-3.5 w-3.5" />
                      {primaryAction.label}
                    </Link>
                  ) : (
                    <Link
                      href={primaryAction.href}
                      className="rounded-lg border border-slate-900 bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
                    >
                      {primaryAction.label}
                    </Link>
                  )
                ) : null}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
