"use client";

import Link from "next/link";
import { AlertCircle, Check, ChevronDown, Copy, ExternalLink, ShieldCheck, X } from "lucide-react";
import { useMemo, useState } from "react";
import type { AdminPaymentItem, ReservationListItem } from "../../../packages/shared/src/types";
import { buildTxExplorerUrl } from "../../lib/chainExplorer";
import { formatDateTime, formatDateWithYear } from "../../lib/dateDisplay";
import { todayPlusLocalIsoDate } from "../../lib/dateIso";
import { formatPhpPeso as formatPeso } from "../../lib/formatCurrency";
import { getReservationStatusMeta } from "../../lib/reservationStatus";
import { getUnitLabel } from "../../lib/unitLabel";
import { getReservationPaymentState, getReservationSource, type ReservationPaymentState } from "../../lib/reservationView";

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

function getPaymentStateMeta(state: ReservationPaymentState) {
  if (state === "settled") return { label: "Paid", className: "bg-emerald-100 text-emerald-800" };
  if (state === "partial") return { label: "Partial", className: "bg-amber-100 text-amber-800" };
  return { label: "Unpaid", className: "bg-[var(--color-border)] text-[var(--color-text)]" };
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
      className: "border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-text)]",
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
  const [copiedField, setCopiedField] = useState<
    "reservation_code" | "contact" | "total_due" | "total_paid" | "remaining" | null
  >(null);
  const [copyToast, setCopyToast] = useState<string | null>(null);

  const source = reservation ? getReservationSource(reservation) : "online";
  const isTour = (reservation?.service_bookings?.length ?? 0) > 0;
  const reservationType = isTour ? "tour" : "room";
  const arrivalDate = isTour
    ? reservation?.service_bookings?.[0]?.visit_date ?? reservation?.check_in_date ?? null
    : reservation?.check_in_date ?? null;
  const todayKey = todayPlusLocalIsoDate(0);
  const isSameDay = Boolean(arrivalDate && arrivalDate === todayKey);
  const paymentState = reservation ? getReservationPaymentState(reservation) : "unpaid";
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
  const txUrl = buildTxExplorerUrl(reservation?.chain_key, txHash);
  const checkInActionHref = paymentState === "settled" ? checkInUrl : `${checkInUrl}&override=1`;
  const checkInActionLabel = paymentState === "settled" ? "Check-in" : "Check-in (Override)";
  const remainingBalance = Number(reservation?.balance_due ?? 0);
  const hasRemainingBalance = remainingBalance > 0;
  const remainingBalanceClass = hasRemainingBalance ? "text-amber-700" : "text-emerald-700";
  const remainingBadgeClass = hasRemainingBalance
    ? "border-amber-200 bg-amber-50 text-amber-800"
    : "border-emerald-200 bg-emerald-50 text-emerald-800";
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

  const handleCopy = async (
    field: "reservation_code" | "contact",
    value: string | null | undefined,
    label: string,
  ) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      setCopyToast(`${label} copied`);
      window.setTimeout(() => setCopiedField((prev) => (prev === field ? null : prev)), 1200);
      window.setTimeout(() => setCopyToast((prev) => (prev ? null : prev)), 1400);
    } catch {
      // no-op: keep UX quiet if clipboard permission is denied
    }
  };
  const handleCopyMoney = async (
    field: "total_due" | "total_paid" | "remaining",
    value: number | null | undefined,
    label: string,
  ) => {
    if (value == null) return;
    try {
      await navigator.clipboard.writeText(formatPeso(Number(value)));
      setCopiedField(field);
      setCopyToast(`${label} copied`);
      window.setTimeout(() => setCopiedField((prev) => (prev === field ? null : prev)), 1200);
      window.setTimeout(() => setCopyToast((prev) => (prev ? null : prev)), 1400);
    } catch {
      // no-op
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/55 p-3 backdrop-blur-[2px] lg:left-64">
      <div className="w-full max-w-4xl overflow-hidden rounded-[var(--radius-xl)] border border-[var(--color-border)] bg-white shadow-[var(--shadow-lg)]">
        <div className="max-h-[92vh] overflow-y-auto">
          <div className="sticky top-0 z-10 border-b border-[var(--color-border)] bg-white/95 px-4 py-3 backdrop-blur">
            <div className="flex items-start justify-between gap-3">
              <h3 className="text-lg font-bold text-[var(--color-text)]">{reservation?.reservation_code ?? "Reservation details"}</h3>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close reservation details"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--color-border)] text-[var(--color-muted)] transition hover:bg-[var(--color-background)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--color-secondary)_30%,white)]"
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
                  <span className="shrink-0 rounded-full border border-[var(--color-border)] bg-[var(--color-background)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-muted)]">
                    Created {formatDateTime(reservation.created_at)}
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="space-y-3 p-4">
            {loading ? <p className="text-sm text-[var(--color-muted)]">Loading details...</p> : null}
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

                <section className="rounded-2xl border border-[var(--color-border)] p-3">
                  <h4 className="text-sm font-semibold text-[var(--color-text)]">Reservation Summary</h4>
                  <div className="mt-2 grid gap-3 md:grid-cols-2">
                    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm">
                          <span className="text-[var(--color-muted)]">Reservation:</span>{" "}
                          <span className="font-semibold text-[var(--color-text)]">{reservation.reservation_code}</span>
                        </p>
                        <button
                          type="button"
                          onClick={() => handleCopy("reservation_code", reservation.reservation_code, "Reservation code")}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--color-border)] bg-white text-[var(--color-muted)] transition hover:bg-[var(--color-background)]"
                          aria-label="Copy reservation code"
                          title="Copy reservation code"
                        >
                          {copiedField === "reservation_code" ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                      <p className="mt-1 text-sm">
                        <span className="text-[var(--color-muted)]">Guest:</span>{" "}
                        <span className="font-semibold text-[var(--color-text)]">{reservation.guest?.name || "-"}</span>
                      </p>
                      <p className="mt-1 text-sm">
                        <span className="text-[var(--color-muted)]">{isTour ? "Tour" : "Unit"}:</span>{" "}
                        <span className="font-semibold text-[var(--color-text)]">
                          {isTour
                            ? (reservation.service_bookings?.map((item) => item.service?.service_name || "Tour").join(", ") || "-")
                            : (
                                reservation.units?.map((item) => {
                                  const label = getUnitLabel(item.unit?.name || "Unit");
                                  return label.subtitle ? `${label.title} (${label.subtitle})` : label.title;
                                }).join(", ") || "-"
                              )}
                        </span>
                      </p>
                      <p className="mt-1 text-sm"><span className="text-[var(--color-muted)]">Pax:</span> {reservation.guest_count ?? "-"}</p>
                    </div>

                    <div className="rounded-xl border border-[var(--color-border)] bg-white p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm">
                          <span className="text-[var(--color-muted)]">Contact:</span>{" "}
                          <span className="font-semibold text-[var(--color-text)]">{reservation.guest?.phone || reservation.guest?.email || "-"}</span>
                        </p>
                        <button
                          type="button"
                          onClick={() => handleCopy("contact", reservation.guest?.phone || reservation.guest?.email, "Contact")}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--color-border)] bg-white text-[var(--color-muted)] transition hover:bg-[var(--color-background)]"
                          aria-label="Copy contact"
                          title="Copy contact"
                        >
                          {copiedField === "contact" ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                      <p className="mt-1 text-sm"><span className="text-[var(--color-muted)]">{isTour ? "Visit date:" : "Stay dates:"}</span> {isTour ? formatDateWithYear(arrivalDate) : `${formatDateWithYear(reservation.check_in_date)} to ${formatDateWithYear(reservation.check_out_date)}`}</p>
                      <p className="mt-1 text-sm"><span className="text-[var(--color-muted)]">Created at:</span> {formatDateTime(reservation.created_at)}</p>
                      <p className="mt-1 text-sm"><span className="text-[var(--color-muted)]">Booking source:</span> {source === "walk_in" ? "Walk-in front desk" : "Online guest portal"}</p>
                      <p className="mt-1 text-sm"><span className="text-[var(--color-muted)]">Created by:</span> {source === "walk_in" ? "Front desk admin" : "Guest account"}</p>
                    </div>
                  </div>
                </section>

                <section className="rounded-2xl border border-[var(--color-border)] p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="text-sm font-semibold text-[var(--color-text)]">Payment Summary</h4>
                    <button
                      type="button"
                      onClick={onRefreshPayments}
                      className="rounded-lg border border-[var(--color-border)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--color-text)] transition hover:bg-[var(--color-background)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--color-secondary)_30%,white)]"
                    >
                      Refresh
                    </button>
                  </div>
                  <div className="mb-3 grid gap-2 sm:grid-cols-3">
                    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">Total due</p>
                        <button
                          type="button"
                          onClick={() => handleCopyMoney("total_due", Number(reservation.total_amount), "Total due")}
                          className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-[var(--color-border)] bg-white text-[var(--color-muted)] transition hover:bg-[var(--color-background)]"
                          aria-label="Copy total due"
                          title="Copy total due"
                        >
                          {copiedField === "total_due" ? <Check className="h-3.5 w-3.5 text-emerald-600" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                      <p className="mt-1 text-lg font-semibold text-[var(--color-text)]">{formatPeso(reservation.total_amount)}</p>
                    </div>
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-3 py-2">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">Paid</p>
                        <button
                          type="button"
                          onClick={() => handleCopyMoney("total_paid", Number(reservation.amount_paid_verified), "Total paid")}
                          className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-emerald-200 bg-white/90 text-emerald-700 transition hover:bg-emerald-100"
                          aria-label="Copy total paid"
                          title="Copy total paid"
                        >
                          {copiedField === "total_paid" ? <Check className="h-3.5 w-3.5 text-emerald-700" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                      </div>
                      <p className="mt-1 text-lg font-semibold text-emerald-800">{formatPeso(reservation.amount_paid_verified)}</p>
                    </div>
                    <div className={`rounded-xl border px-3 py-2 ${remainingBadgeClass}`}>
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em]">Remaining</p>
                        <div className="flex items-center gap-1.5">
                          <span className="rounded-full border border-current/20 bg-white/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]">
                            {hasRemainingBalance ? "Payment needed" : "Settled"}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopyMoney("remaining", Number(reservation.balance_due), "Remaining balance")}
                            className="inline-flex h-6 w-6 items-center justify-center rounded-md border border-current/25 bg-white/80 text-current transition hover:bg-white"
                            aria-label="Copy remaining balance"
                            title="Copy remaining balance"
                          >
                            {copiedField === "remaining" ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                          </button>
                        </div>
                      </div>
                      <p className={`mt-1 text-2xl font-bold leading-none ${remainingBalanceClass}`}>{formatPeso(reservation.balance_due)}</p>
                    </div>
                  </div>
                  <div className="grid gap-2 text-sm md:grid-cols-3">
                    <p><span className="text-[var(--color-muted)]">Payment method:</span> {latestPayment?.method?.toUpperCase() || "-"}</p>
                    <p><span className="text-[var(--color-muted)]">Latest payment:</span> {formatDateTime(latestPayment?.created_at)}</p>
                    <p>
                      <span className="text-[var(--color-muted)]">Verification:</span>{" "}
                      {firstPendingPayment ? (
                        <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">Pending verification</span>
                      ) : (
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${paymentMeta.className}`}>{paymentMeta.label}</span>
                      )}
                    </p>
                  </div>
                  <p className="mt-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-2.5 py-2 text-xs text-[var(--color-text)]">
                    {paymentDynamicNote}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link href={paymentListUrl} className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-xs font-semibold text-[var(--color-text)]">
                      View Payments
                    </Link>
                    <Link href={paymentRecordUrl} className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-xs font-semibold text-[var(--color-text)] transition hover:bg-[var(--color-background)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--color-secondary)_30%,white)]">
                      Open Payment Form
                    </Link>
                    {paymentState !== "settled" ? (
                      <Link
                        href={paymentRecordUrl}
                        className="rounded-lg border border-[var(--color-primary)] bg-[var(--color-primary)] px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--color-secondary)_40%,white)]"
                      >
                        Record Payment
                      </Link>
                    ) : (
                      <Link
                        href={checkInActionHref}
                        className="rounded-lg border border-[var(--color-primary)] bg-[var(--color-primary)] px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--color-secondary)_40%,white)]"
                      >
                        {checkInActionLabel}
                      </Link>
                    )}
                    {paymentState !== "settled" ? (
                      <Link
                        href={checkInActionHref}
                        className="rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 transition hover:bg-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-200"
                      >
                        Check-in (Override)
                      </Link>
                    ) : null}
                    {source === "online" && firstPendingPayment ? (
                      <button
                        type="button"
                        onClick={() => onVerifyPayment(firstPendingPayment.payment_id)}
                        disabled={Boolean(verifyBusy[firstPendingPayment.payment_id])}
                        className="rounded-lg border border-[var(--color-primary)] bg-[var(--color-primary)] px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--color-secondary)_40%,white)] disabled:opacity-60"
                      >
                        {verifyBusy[firstPendingPayment.payment_id] ? "Verifying..." : "Verify Payment"}
                      </button>
                    ) : null}
                  </div>
                  {paymentsLoading ? <p className="mt-2 text-xs text-[var(--color-muted)]">Loading payments...</p> : null}
                  {paymentsError ? <p className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700">{paymentsError}</p> : null}
                  {!paymentsLoading && payments.length > 0 ? (
                    <div className="mt-3 overflow-x-auto">
                      <table className="min-w-full text-left text-xs">
                        <thead className="text-[var(--color-muted)]">
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
                            <tr key={payment.payment_id} className="border-t border-[var(--color-border)]">
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
                                    className="rounded border border-[var(--color-border)] bg-white px-2 py-1 font-semibold text-[var(--color-text)] transition hover:bg-[var(--color-background)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--color-secondary)_30%,white)] disabled:opacity-60"
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

                <section className="rounded-2xl border border-[var(--color-border)] p-3">
                  <button
                    type="button"
                    onClick={() => setLedgerOpen((prev) => !prev)}
                    className="flex w-full items-center justify-between text-left"
                  >
                    <h4 className="text-sm font-semibold text-[var(--color-text)]">Blockchain / Ledger</h4>
                    <ChevronDown className={`h-4 w-4 text-[var(--color-muted)] transition ${ledgerOpen ? "rotate-180" : ""}`} />
                  </button>
                  {ledgerOpen ? (
                    <div className="mt-3 space-y-2 text-sm">
                      <p><span className="text-[var(--color-muted)]">Escrow state:</span> {reservation.escrow_state || "-"}</p>
                      <p><span className="text-[var(--color-muted)]">NFT guest pass:</span> {reservation.guest_pass_token_id ? "Minted" : "Not minted"}</p>
                      <p><span className="text-[var(--color-muted)]">Tx hash:</span> <span className="font-mono text-xs break-all">{reservation.chain_tx_hash || "-"}</span></p>
                      <p><span className="text-[var(--color-muted)]">Token ID:</span> {reservation.guest_pass_token_id ?? "-"}</p>
                      <p><span className="text-[var(--color-muted)]">Booking hash:</span> <span className="font-mono text-xs break-all">{reservation.guest_pass_reservation_hash || reservation.onchain_booking_id || "-"}</span></p>
                      <div className="flex flex-wrap gap-2 pt-1">
                        <Link href="/admin/blockchain?tab=reconciliation" className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-xs font-semibold text-[var(--color-text)] transition hover:bg-[var(--color-background)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--color-secondary)_30%,white)]">
                          Open Reconciliation
                        </Link>
                        <Link
                          href={`/admin/blockchain?tab=audit&search=${encodeURIComponent(reservation.reservation_id)}`}
                          className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-xs font-semibold text-[var(--color-text)] transition hover:bg-[var(--color-background)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--color-secondary)_30%,white)]"
                        >
                          Open Audit
                        </Link>
                        {txUrl ? (
                          <a
                            href={txUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-xs font-semibold text-[var(--color-text)] transition hover:bg-[var(--color-background)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--color-secondary)_30%,white)]"
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
            <div className="sticky bottom-0 z-10 border-t border-[var(--color-border)] bg-white/95 p-3 backdrop-blur">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-h-7 items-center gap-2" aria-live="polite">
                  <span
                    className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${remainingBadgeClass}`}
                  >
                    {hasRemainingBalance
                      ? `Blocked: ${formatPeso(remainingBalance)} remaining`
                      : "Payment settled"}
                  </span>
                  {copyToast ? (
                    <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                      {copyToast}
                    </span>
                  ) : null}
                </div>
                <div className="flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-2 text-xs font-semibold text-[var(--color-text)] transition hover:bg-[var(--color-background)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--color-secondary)_30%,white)]"
                >
                  Close
                </button>
                {primaryAction.href ? (
                  primaryAction.type === "view_history" ? (
                    <Link
                      href={primaryAction.href}
                      className="inline-flex items-center gap-1 rounded-lg border border-[var(--color-primary)] bg-[var(--color-primary)] px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--color-secondary)_40%,white)]"
                    >
                      <ShieldCheck className="h-3.5 w-3.5" />
                      {primaryAction.label}
                    </Link>
                  ) : (
                    <Link
                      href={primaryAction.href}
                      className="rounded-lg border border-[var(--color-primary)] bg-[var(--color-primary)] px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--color-secondary)_40%,white)]"
                    >
                      {primaryAction.label}
                    </Link>
                  )
                ) : null}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
