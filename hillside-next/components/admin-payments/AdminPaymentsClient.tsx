"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { AlertCircle, Search, SlidersHorizontal, X } from "lucide-react";
import { useToast } from "../shared/ToastProvider";
import type {
  AdminPaymentItem,
  AdminPaymentsResponse,
  AdminPaymentsTab,
  ReservationListItem,
  ReservationStatus,
} from "../../../packages/shared/src/types";
import {
  adminPaymentsResponseSchema,
  onSitePaymentResponseSchema,
  paymentRejectResponseSchema,
  paymentVerifyResponseSchema,
  reservationListItemSchema,
} from "../../../packages/shared/src/schemas";
import { apiFetch } from "../../lib/apiClient";
import { syncAwareMutation } from "../../lib/offlineSync/mutation";
import { loadPaymentsSnapshot, savePaymentsSnapshot } from "../../lib/offlineSync/store";
import { getSupabaseBrowserClient } from "../../lib/supabase";
import { FancyDatePicker } from "../shared/FancyDatePicker";
import { DataFreshnessBadge } from "../shared/DataFreshnessBadge";

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
type TabCounts = Record<AdminPaymentsTab, number>;
type PaymentWorkflowFilter = "all" | "online" | "walk_in" | "to_review" | "paid" | "partial" | "rejected";

const WORKFLOW_FILTERS: Array<{ id: PaymentWorkflowFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "online", label: "Online" },
  { id: "walk_in", label: "Walk-in" },
  { id: "to_review", label: "To Review" },
  { id: "paid", label: "Paid" },
  { id: "partial", label: "Partial" },
  { id: "rejected", label: "Rejected" },
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

function formatCachedAt(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function statusMeta(status?: ReservationStatus | null) {
  if (!status) return { label: "Unknown", className: "bg-slate-100 text-slate-700" };
  return RESERVATION_STATUS_META[status] ?? { label: status.replace("_", " "), className: "bg-slate-100 text-slate-700" };
}

function policyOutcomeMeta(outcome?: string | null) {
  const value = String(outcome || "").toLowerCase();
  if (value === "released") return { label: "Released", className: "bg-emerald-100 text-emerald-800" };
  if (value === "refunded") return { label: "Refunded", className: "bg-sky-100 text-sky-800" };
  if (value === "forfeited") return { label: "Forfeited", className: "bg-amber-100 text-amber-800" };
  return null;
}

function policyRuleLabel(rule?: string | null) {
  const value = String(rule || "").trim().toLowerCase();
  if (!value) return null;
  if (value === "room_cottage_20pct_clamp_500_1000") return "Room/Cottage: 20% (PHP 500–1000)";
  if (value === "tour_fixed_500_or_full_if_below_500") return "Tour: PHP 500 (or full if below)";
  if (value === "admin_override") return "Admin override";
  return value.replaceAll("_", " ");
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

function looksLikeReservationCode(value: string) {
  return /^HR-[A-Z0-9-]+$/i.test(value.trim());
}

function looksLikeUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value.trim());
}

function getPaymentSource(payment: AdminPaymentItem): "online" | "walk_in" {
  const reservationSource = payment.reservation?.reservation_source;
  if (reservationSource === "online" || reservationSource === "walk_in") {
    return reservationSource;
  }
  return payment.payment_type === "on_site" ? "walk_in" : "online";
}

export function AdminPaymentsClient({
  initialToken = null,
  initialData = null,
  initialTab = "to_review",
  initialSearch = "",
  initialPage = 1,
}: AdminPaymentsClientProps) {
  const token = initialToken;
  const searchParams = useSearchParams();
  const { showToast } = useToast();

  const [tab, setTab] = useState<AdminPaymentsTab>(initialTab);
  const [workflowFilter, setWorkflowFilter] = useState<PaymentWorkflowFilter>(
    initialTab === "to_review" ? "to_review" : initialTab === "rejected" ? "rejected" : "all",
  );
  const [searchInput, setSearchInput] = useState(initialSearch);
  const [searchValue, setSearchValue] = useState(initialSearch);
  const [page, setPage] = useState(Math.max(1, initialPage));
  const [tabCounts, setTabCounts] = useState<TabCounts>({
    to_review: initialTab === "to_review" ? initialData?.count ?? 0 : 0,
    verified: initialTab === "verified" ? initialData?.count ?? 0 : 0,
    rejected: initialTab === "rejected" ? initialData?.count ?? 0 : 0,
    all: initialTab === "all" ? initialData?.count ?? 0 : 0,
  });

  const [items, setItems] = useState<AdminPaymentItem[]>(initialData?.items ?? []);
  const [count, setCount] = useState(initialData?.count ?? 0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cachedViewMeta, setCachedViewMeta] = useState<string | null>(null);

  const [notice, setNotice] = useState<string | null>(null);
  const [walkInQuickAction, setWalkInQuickAction] = useState(false);
  const [walkInFlowType, setWalkInFlowType] = useState<"stay" | "tour" | null>(null);
  const [lastProcessedReservation, setLastProcessedReservation] = useState<{
    reservationId: string;
    reservationCode: string | null;
  } | null>(null);
  const [proofBusy, setProofBusy] = useState<Record<string, boolean>>({});
  const [onSiteReservationId, setOnSiteReservationId] = useState("");
  const [onSiteAmount, setOnSiteAmount] = useState("100");
  const [onSiteMethod, setOnSiteMethod] = useState("cash");
  const [onSiteReferenceNo, setOnSiteReferenceNo] = useState("");
  const [onSiteBusy, setOnSiteBusy] = useState(false);
  const [reservationContext, setReservationContext] = useState<ReservationListItem | null>(null);
  const [reservationContextLoading, setReservationContextLoading] = useState(false);
  const [amountPreset, setAmountPreset] = useState<"full" | "half" | "custom" | null>(null);
  const amountInputRef = useRef<HTMLInputElement | null>(null);

  const [rejectTarget, setRejectTarget] = useState<AdminPaymentItem | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectBusy, setRejectBusy] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [methodFilter, setMethodFilter] = useState("");
  const [fromDateFilter, setFromDateFilter] = useState("");
  const [toDateFilter, setToDateFilter] = useState("");

  useEffect(() => {
    const reservationId = searchParams.get("reservation_id")?.trim() || "";
    const amount = searchParams.get("amount")?.trim() || "";
    const method = searchParams.get("method")?.trim().toLowerCase() || "";
    const source = searchParams.get("source")?.trim().toLowerCase() || "";
    const walkInType = searchParams.get("walkin_type")?.trim().toLowerCase() || "";
    if (!reservationId) return;

    setOnSiteReservationId(reservationId);
    if (amount && Number.isFinite(Number(amount)) && Number(amount) > 0) {
      setOnSiteAmount(amount);
    }
    if (method && ["cash", "gcash", "bank", "card"].includes(method)) {
      setOnSiteMethod(method);
    }
    if (source === "walkin") {
      setNotice("Walk-in reservation loaded. Review payment details and submit.");
      setWalkInQuickAction(true);
      setWalkInFlowType(walkInType === "tour" ? "tour" : "stay");
    } else {
      setWalkInFlowType(null);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!token) return;
    const input = onSiteReservationId.trim();
    if (!input) {
      setReservationContext(null);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setReservationContextLoading(true);
      try {
        let row: ReservationListItem;
        if (looksLikeReservationCode(input)) {
          row = await apiFetch<ReservationListItem>(
            `/v2/reservations/by-code/${encodeURIComponent(input)}`,
            { method: "GET" },
            token,
            reservationListItemSchema,
          );
        } else if (looksLikeUuid(input)) {
          row = await apiFetch<ReservationListItem>(
            `/v2/reservations/${encodeURIComponent(input)}`,
            { method: "GET" },
            token,
            reservationListItemSchema,
          );
        } else {
          setReservationContext(null);
          return;
        }
        if (!cancelled) {
          setReservationContext(row);
          if (row.reservation_code && row.reservation_code !== input) {
            setOnSiteReservationId(row.reservation_code);
          }
          const balance = Number(row.balance_due ?? 0);
          if (Number.isFinite(balance) && balance > 0) {
            setOnSiteAmount(String(Math.round(balance)));
            setAmountPreset("full");
          }
        }
      } catch {
        if (!cancelled) {
          setReservationContext(null);
        }
      } finally {
        if (!cancelled) setReservationContextLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [onSiteReservationId, token]);

  useEffect(() => {
    const nextTab: AdminPaymentsTab =
      workflowFilter === "to_review"
        ? "to_review"
        : workflowFilter === "rejected"
          ? "rejected"
          : workflowFilter === "paid"
            ? "verified"
            : "all";
    if (tab !== nextTab) {
      setTab(nextTab);
      setPage(1);
    }
  }, [tab, workflowFilter]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSearchValue(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  const fetchList = useCallback(async () => {
    if (!token) return;
    const snapshotVariantKey = [
      "admin_payments",
      tab,
      workflowFilter,
      methodFilter || "__all__",
      fromDateFilter || "__none__",
      toDateFilter || "__none__",
      searchValue || "__all__",
      String(page),
      String(PAGE_SIZE),
    ].join("::");
    setLoading(true);
    setError(null);
    try {
      const offset = (page - 1) * PAGE_SIZE;
      const qs = new URLSearchParams();
      qs.set("tab", tab);
      qs.set("limit", String(PAGE_SIZE));
      qs.set("offset", String(offset));
      if (searchValue) qs.set("search", searchValue);
      if (methodFilter) qs.set("method", methodFilter);
      if (fromDateFilter) qs.set("from", `${fromDateFilter}T00:00:00Z`);
      if (toDateFilter) qs.set("to", `${toDateFilter}T23:59:59Z`);
      if (workflowFilter === "online") qs.set("source", "online");
      if (workflowFilter === "walk_in") qs.set("source", "walk_in");
      if (workflowFilter === "partial") qs.set("settlement", "partial");
      if (workflowFilter === "paid") qs.set("settlement", "paid");

      const data = await apiFetch<AdminPaymentsResponse>(
        `/v2/payments?${qs.toString()}`,
        { method: "GET" },
        token,
        adminPaymentsResponseSchema,
      );
      setItems(data.items ?? []);
      setCount(data.count ?? 0);
      setTabCounts((prev) => ({ ...prev, [tab]: data.count ?? 0 }));
      await savePaymentsSnapshot("admin", data, { variantKey: snapshotVariantKey });
      setCachedViewMeta(null);
    } catch (unknownError) {
      const cached = await loadPaymentsSnapshot("admin", { variantKey: snapshotVariantKey });
      if (cached?.data) {
        setItems(cached.data.items ?? []);
        setCount(cached.data.count ?? 0);
        setCachedViewMeta(`Using cached data from ${formatCachedAt(cached.cached_at)}`);
        setError(null);
      } else {
        setItems([]);
        setCount(0);
        setCachedViewMeta(null);
        setError(unknownError instanceof Error ? unknownError.message : "Failed to load payments.");
      }
    } finally {
      setLoading(false);
    }
  }, [fromDateFilter, methodFilter, page, searchValue, tab, toDateFilter, token, workflowFilter]);

  const fetchTabCounts = useCallback(async () => {
    if (!token) return;
    try {
      const counts = await Promise.all(
        TAB_LABELS.map(async (tabDef) => {
          const qs = new URLSearchParams({
            tab: tabDef.id,
            limit: "1",
            offset: "0",
          });
          const data = await apiFetch<AdminPaymentsResponse>(
            `/v2/payments?${qs.toString()}`,
            { method: "GET" },
            token,
            adminPaymentsResponseSchema,
          );
          return [tabDef.id, data.count ?? 0] as const;
        }),
      );
      setTabCounts({
        to_review: counts.find(([id]) => id === "to_review")?.[1] ?? 0,
        verified: counts.find(([id]) => id === "verified")?.[1] ?? 0,
        rejected: counts.find(([id]) => id === "rejected")?.[1] ?? 0,
        all: counts.find(([id]) => id === "all")?.[1] ?? 0,
      });
    } catch {
      // ignore secondary metrics errors
    }
  }, [token]);

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

  useEffect(() => {
    if (!token) return;
    void fetchTabCounts();
  }, [fetchTabCounts, token]);

  const verifyPayment = useCallback(
    async (paymentId: string) => {
      if (!token) return;
      setError(null);
      try {
        const payload = { payment_id: paymentId };
        const outcome = await syncAwareMutation<typeof payload, { ok: true; payment_id: string; status: "verified" }>({
          path: `/v2/payments/${encodeURIComponent(paymentId)}/verify`,
          method: "POST",
          payload,
          parser: paymentVerifyResponseSchema,
          accessToken: token,
          entityType: "payment_submission",
          action: "payments.verify",
          entityId: paymentId,
          buildOptimisticResponse: () => ({ ok: true, payment_id: paymentId, status: "verified" }),
        });

        if (outcome.mode === "online") {
          setNotice("Payment verified.");
          showToast({
            type: "success",
            title: "Payment verified",
            message: "The payment is now marked as verified.",
          });
          await fetchList();
          await fetchTabCounts();
        } else {
          setNotice("Payment verification queued for sync.");
          setItems((prev) =>
            prev.map((item) =>
              item.payment_id === paymentId
                ? {
                    ...item,
                    status: "verified",
                    verified_at: new Date().toISOString(),
                    rejected_reason: null,
                    rejected_at: null,
                  }
                : item,
            ),
          );
          showToast({
            type: "info",
            title: "Saved offline",
            message: "Payment verification queued and will sync when internet is available.",
          });
        }
      } catch (unknownError) {
        setError(unknownError instanceof Error ? unknownError.message : "Failed to verify payment.");
      }
    },
    [fetchList, fetchTabCounts, showToast, token],
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
      const targetPaymentId = rejectTarget.payment_id;
      const payload = { payment_id: targetPaymentId, reason };
      const outcome = await syncAwareMutation<typeof payload, { ok: true; payment_id: string; status: "rejected"; reason: string }>({
        path: `/v2/payments/${encodeURIComponent(targetPaymentId)}/reject`,
        method: "POST",
        payload,
        parser: paymentRejectResponseSchema,
        accessToken: token,
        entityType: "payment_submission",
        action: "payments.reject",
        entityId: targetPaymentId,
        buildOptimisticResponse: () => ({
          ok: true,
          payment_id: targetPaymentId,
          status: "rejected",
          reason,
        }),
      });

      setRejectTarget(null);
      setRejectReason("");
      if (outcome.mode === "online") {
        setNotice("Payment rejected.");
        showToast({
          type: "success",
          title: "Payment rejected",
          message: "The guest can now resubmit proof of payment.",
        });
        await fetchList();
        await fetchTabCounts();
      } else {
        setNotice("Payment rejection queued for sync.");
        setItems((prev) =>
          prev.map((item) =>
            item.payment_id === targetPaymentId
              ? {
                  ...item,
                  status: "rejected",
                  rejected_reason: reason,
                  rejected_at: new Date().toISOString(),
                }
              : item,
          ),
        );
        showToast({
          type: "info",
          title: "Saved offline",
          message: "Payment rejection queued and will sync when internet is available.",
        });
      }
    } catch (unknownError) {
      setRejectError(unknownError instanceof Error ? unknownError.message : "Failed to reject payment.");
    } finally {
      setRejectBusy(false);
    }
  }, [fetchList, fetchTabCounts, rejectReason, rejectTarget, showToast, token]);

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
    const rawReservationInput = onSiteReservationId.trim();
    const amount = Number(onSiteAmount);
    if (!rawReservationInput) {
      setError("Reservation code is required for on-site payment.");
      return;
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      setError("Amount must be greater than zero.");
      return;
    }
    if (onSiteMethod !== "cash" && !onSiteReferenceNo.trim()) {
      setError("Reference number is required for non-cash payments.");
      return;
    }

    setOnSiteBusy(true);
    setError(null);
    setNotice(null);
    setWalkInQuickAction(false);
    setLastProcessedReservation(null);
    try {
      let reservationIdentifier = rawReservationInput;
      if (looksLikeReservationCode(rawReservationInput)) {
        if (
          reservationContext?.reservation_code &&
          reservationContext.reservation_code.toLowerCase() === rawReservationInput.toLowerCase()
        ) {
          reservationIdentifier = reservationContext.reservation_id;
        } else {
          const canResolveNow = typeof navigator === "undefined" || navigator.onLine;
          if (canResolveNow) {
            const byCode = await apiFetch<ReservationListItem>(
              `/v2/reservations/by-code/${encodeURIComponent(rawReservationInput)}`,
              { method: "GET" },
              token,
              reservationListItemSchema,
            );
            reservationIdentifier = byCode.reservation_id;
          }
        }
      }

      const payload = {
        reservation_id: reservationIdentifier,
        amount,
        method: onSiteMethod,
        reference_no: onSiteReferenceNo.trim() || null,
      };
      const outcome = await syncAwareMutation<typeof payload, { ok: true; payment_id: string; status: string; reservation_status: string }>({
        path: "/v2/payments/on-site",
        method: "POST",
        payload,
        parser: onSitePaymentResponseSchema,
        accessToken: token,
        entityType: "payment_submission",
        action: "payments.on_site.create",
        entityId: looksLikeUuid(reservationIdentifier) ? reservationIdentifier : null,
        buildOptimisticResponse: () => ({
          ok: true,
          payment_id: `queued-${crypto.randomUUID().slice(0, 8)}`,
          status: "queued",
          reservation_status: String(reservationContext?.status || "pending_payment"),
        }),
      });
      const response = outcome.data ?? {
        ok: true as const,
        payment_id: "queued-payment",
        status: "queued",
        reservation_status: String(reservationContext?.status || "pending_payment"),
      };
      setNotice(
        outcome.mode === "online"
          ? `On-site payment recorded (${response.payment_id}). Reservation status: ${response.reservation_status}.`
          : "Payment saved offline and queued for sync.",
      );
      setLastProcessedReservation({
        reservationId: looksLikeUuid(reservationIdentifier)
          ? reservationIdentifier
          : (reservationContext?.reservation_id || reservationIdentifier),
        reservationCode: reservationContext?.reservation_code ?? null,
      });
      setOnSiteReservationId("");
      setOnSiteReferenceNo("");
      setAmountPreset(null);
      setWalkInQuickAction(true);
      showToast(
        outcome.mode === "online"
          ? {
              type: "success",
              title: "Payment recorded successfully",
              message: "On-site payment has been saved.",
            }
          : {
              type: "info",
              title: "Saved offline",
              message: "On-site payment queued and will sync when internet is available.",
            },
      );
      if (outcome.mode === "online") {
        await fetchList();
        await fetchTabCounts();
      }
    } catch (unknownError) {
      if (unknownError instanceof Error && unknownError.message === "Failed to fetch") {
        setError("Failed to reach API. Check if hillside-api is running and NEXT_PUBLIC_API_BASE_URL is correct.");
      } else {
        setError(unknownError instanceof Error ? unknownError.message : "Failed to record on-site payment.");
      }
    } finally {
      setOnSiteBusy(false);
    }
  }, [fetchList, fetchTabCounts, onSiteAmount, onSiteMethod, onSiteReferenceNo, onSiteReservationId, reservationContext, showToast, token]);

  const totalPages = useMemo(() => Math.max(1, Math.ceil(count / PAGE_SIZE)), [count]);
  const reservationBalance = Number(reservationContext?.balance_due ?? 0);
  const reservationTotal = Number(reservationContext?.total_amount ?? 0);
  const reservationPaidVerified = Number(
    reservationContext?.amount_paid_verified ?? Math.max(0, reservationTotal - reservationBalance),
  );
  const enteredAmount = Number(onSiteAmount || 0);
  const projectedRemaining = Number.isFinite(enteredAmount) ? reservationBalance - enteredAmount : reservationBalance;
  const hasOutstandingBalance = Number.isFinite(reservationBalance) && reservationBalance > 0;
  const requiresReference = onSiteMethod !== "cash";
  const isWalkInContextNotice = Boolean(
    notice && notice.toLowerCase().startsWith("walk-in reservation loaded"),
  );
  const onSitePrimaryLabel = onSiteBusy ? "Recording..." : onSiteMethod === "cash" ? "Record Cash Payment" : "Record Payment";
  const canPrev = page > 1;
  const canNext = page < totalPages;
  const activeFilterCount = [methodFilter, fromDateFilter, toDateFilter].filter(Boolean).length;
  const isToReview = workflowFilter === "to_review";
  const showVerifiedCols = tab === "verified" || tab === "all";
  const showRejectedCols = tab === "rejected" || tab === "all";

  if (!token) {
    return (
      <section className="mx-auto w-full max-w-6xl">
        <header className="mb-4 rounded-3xl border border-slate-200/70 bg-gradient-to-br from-white via-slate-50 to-blue-50 p-6 shadow-sm">
          <h1 className="text-3xl font-bold text-slate-900">Payments Console</h1>
          <p className="mt-2 text-sm text-slate-600">Verification inbox, on-site payments, and payment history.</p>
        </header>
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          No active session found. Sign in as admin first.
        </p>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-6xl">
      <header className="mb-6 rounded-3xl border border-slate-200/70 bg-gradient-to-br from-white via-slate-50 to-blue-50 p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Payments Desk</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">Payments Console</h1>
            <p className="mt-2 text-sm text-slate-600">Verification inbox, on-site payments, and payment history.</p>
            <div className="mt-2">
              <DataFreshnessBadge />
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-xs text-slate-600">
            <p className="font-semibold text-slate-900">Queue snapshot</p>
            <p className="mt-1">{count} total records</p>
          </div>
        </div>
      </header>

      <div className="mb-4 rounded-2xl border border-slate-200/70 bg-white p-3 shadow-sm">
        <div className="flex flex-col gap-2 xl:flex-row xl:items-center">
          <div
            className="grid grid-cols-2 gap-1 rounded-xl border border-slate-200/80 bg-slate-50 p-1 sm:grid-cols-4 md:grid-cols-7 xl:min-w-[640px]"
            role="tablist"
            aria-label="Payment workflow filters"
          >
            {WORKFLOW_FILTERS.map((filterDef) => {
              const isActive = workflowFilter === filterDef.id;
              return (
                <button
                  key={filterDef.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  aria-controls={`payments-panel-${filterDef.id}`}
                  id={`payments-tab-${filterDef.id}`}
                  onClick={() => {
                    setWorkflowFilter(filterDef.id);
                    setPage(1);
                  }}
                  className={`inline-flex h-9 items-center justify-center gap-1 rounded-lg px-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 ${
                    isActive
                      ? "border border-slate-900 bg-white text-slate-900 shadow-sm"
                      : filterDef.id === "all"
                        ? "border border-transparent text-slate-500 hover:bg-white hover:text-slate-700"
                        : "border border-transparent text-slate-600 hover:bg-white hover:text-slate-900"
                  }`}
                >
                  <span>{filterDef.label}</span>
                </button>
              );
            })}
          </div>

          <div className="relative flex-1 rounded-xl border border-slate-200/80 bg-slate-50 p-2">
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="flex h-10 flex-1 items-center rounded-lg border border-slate-300 bg-white px-2">
                <Search className="h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  placeholder="Search reservation, guest, or reference"
                  className="h-full flex-1 border-0 bg-transparent px-2 text-sm text-slate-700 outline-none"
                />
                {searchInput ? (
                  <button
                    type="button"
                    onClick={() => setSearchInput("")}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100"
                    aria-label="Clear search"
                  >
                    <X className="h-4 w-4" />
                  </button>
                ) : null}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setFiltersOpen((prev) => !prev)}
                  aria-expanded={filtersOpen}
                  aria-controls="payments-filters-popover"
                  className="inline-flex h-10 items-center justify-center gap-1 rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <SlidersHorizontal className="h-4 w-4" />
                  Filters
                  {activeFilterCount > 0 ? (
                    <span className="rounded-full bg-slate-900 px-1.5 text-[11px] leading-5 text-white">{activeFilterCount}</span>
                  ) : null}
                </button>
                {activeFilterCount > 0 ? (
                  <button
                    type="button"
                    onClick={() => {
                      setMethodFilter("");
                      setFromDateFilter("");
                      setToDateFilter("");
                      setPage(1);
                    }}
                    className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Clear filters
                  </button>
                ) : null}
              </div>
            </div>

            {filtersOpen ? (
              <div
                id="payments-filters-popover"
                className="absolute right-2 top-[calc(100%+6px)] z-30 w-full max-w-[360px] rounded-xl border border-slate-200 bg-white p-3 shadow-lg"
              >
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Filters</p>
                <div className="mt-2 grid gap-2">
                  <label className="grid gap-1 text-xs text-slate-600">
                    Payment method
                    <select
                      value={methodFilter}
                      onChange={(event) => {
                        setMethodFilter(event.target.value);
                        setPage(1);
                      }}
                      className="h-9 rounded-lg border border-slate-300 bg-slate-50 px-2 text-sm text-slate-700"
                    >
                      <option value="">All methods</option>
                      <option value="cash">Cash</option>
                      <option value="gcash">GCash</option>
                      <option value="bank">Bank</option>
                      <option value="card">Card</option>
                    </select>
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <FancyDatePicker
                      label="From date"
                      value={fromDateFilter}
                      onChange={(next) => {
                        setFromDateFilter(next);
                        if (toDateFilter && next && toDateFilter < next) {
                          setToDateFilter(next);
                        }
                        setPage(1);
                      }}
                      max={toDateFilter || undefined}
                      placeholder="mm/dd/yyyy"
                      allowClear
                    />
                    <FancyDatePicker
                      label="To date"
                      value={toDateFilter}
                      onChange={(next) => {
                        setToDateFilter(next);
                        if (fromDateFilter && next && fromDateFilter > next) {
                          setFromDateFilter(next);
                        }
                        setPage(1);
                      }}
                      min={fromDateFilter || undefined}
                      placeholder="mm/dd/yyyy"
                      allowClear
                      popoverAlign="end"
                    />
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {isWalkInContextNotice ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200/80 bg-emerald-50/70 px-3 py-1.5 text-sm text-emerald-800">
          <p className="font-semibold">Walk-in reservation loaded</p>
          {walkInQuickAction ? (
            <div className="flex flex-wrap gap-2">
              <Link
                href={walkInFlowType === "tour" ? "/admin/walk-in?tab=tour" : "/admin/walk-in?tab=stay"}
                className="inline-flex rounded-md border border-emerald-300 bg-white px-2.5 py-1 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100"
              >
                {walkInFlowType === "tour" ? "Create another walk-in tour" : "Create another walk-in"}
              </Link>
              {reservationContext?.reservation_code ? (
                <Link
                  href={`/admin/reservations?reservation_id=${encodeURIComponent(reservationContext.reservation_id)}`}
                  className="inline-flex rounded-md border border-emerald-300 bg-white px-2.5 py-1 text-xs font-semibold text-emerald-800 transition hover:bg-emerald-100"
                >
                  View reservation
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="mb-4 rounded-2xl border border-emerald-100 bg-white p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-600">Walk-in</p>
            <h3 className="text-sm font-semibold text-slate-900">Record On-site Payment</h3>
          </div>
          <p className="text-xs text-slate-500">Front-desk payment capture for walk-ins and manual collections.</p>
        </div>

        <div className="grid gap-3 lg:grid-cols-5">
          <aside className="order-1 rounded-xl border border-slate-200 bg-slate-50 p-3 lg:order-2 lg:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Payment Summary</p>
            {reservationContextLoading ? (
              <p className="mt-2 text-xs text-slate-500">Loading reservation details...</p>
            ) : (
              <div className="mt-2 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Reservation code</span>
                  <span className="font-semibold text-slate-900">{reservationContext?.reservation_code ?? "-"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Reservation status</span>
                  <span className="font-semibold text-slate-900">
                    {(reservationContext?.status ?? "pending_payment").replaceAll("_", " ")}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Total due</span>
                  <span className="font-semibold text-slate-900">{formatPeso(reservationTotal)}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-600">Total paid</span>
                  <span className="font-semibold text-slate-900">{formatPeso(reservationPaidVerified)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-slate-200 pt-2">
                  <span className="text-slate-700">Remaining balance</span>
                  <span className={`font-semibold ${hasOutstandingBalance ? "text-amber-700" : "text-emerald-700"}`}>
                    {formatPeso(reservationBalance)}
                  </span>
                </div>
                {reservationContext?.policy_outcome ? (
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Policy outcome</span>
                    <span className="font-semibold text-slate-900">
                      {policyOutcomeMeta(reservationContext.policy_outcome)?.label ?? reservationContext.policy_outcome}
                    </span>
                  </div>
                ) : null}
                {reservationContext?.deposit_rule_applied ? (
                  <p className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-600">
                    Deposit rule: {policyRuleLabel(reservationContext.deposit_rule_applied) ?? reservationContext.deposit_rule_applied}
                  </p>
                ) : null}
                <p className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-600">
                  Recording payment updates reservation balance immediately and moves eligible reservations toward check-in.
                </p>
                {Number.isFinite(enteredAmount) && enteredAmount > 0 ? (
                  <p
                    className={`rounded-lg border px-2 py-1.5 text-xs font-semibold ${
                      projectedRemaining < 0
                        ? "border-amber-200 bg-amber-50 text-amber-800"
                        : projectedRemaining === 0
                          ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                          : "border-blue-200 bg-blue-50 text-blue-800"
                    }`}
                  >
                    {projectedRemaining < 0
                      ? "Overpayment detected"
                      : projectedRemaining === 0
                        ? "This payment will fully settle the reservation"
                        : `${formatPeso(projectedRemaining)} will remain after this payment`}
                  </p>
                ) : null}
              </div>
            )}
          </aside>

          <div className="order-2 lg:order-1 lg:col-span-3">
            <div className="grid gap-3">
              <label className="grid gap-1 text-xs text-slate-600">
                Reservation Code
                <input
                  type="text"
                  value={onSiteReservationId}
                  onChange={(event) => {
                    setOnSiteReservationId(event.target.value);
                    setReservationContext(null);
                  }}
                  placeholder="HR-20260309-ABCD"
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                />
                <span className="text-[11px] text-slate-500">Use the reservation code from booking, QR, or front-desk slip.</span>
              </label>

              <label className="grid gap-1 text-xs text-slate-600">
                Amount Received
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-500">&#8369;</span>
                  <input
                    ref={amountInputRef}
                    type="number"
                    min={1}
                    value={onSiteAmount}
                    onChange={(event) => {
                      setOnSiteAmount(event.target.value);
                      setAmountPreset("custom");
                    }}
                    className="w-full rounded-lg border border-slate-300 bg-white py-2 pl-7 pr-3 text-sm"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setOnSiteAmount(String(Math.max(1, Math.round(reservationBalance || 0))));
                      setAmountPreset("full");
                    }}
                    disabled={!hasOutstandingBalance}
                    className={`inline-flex h-7 items-center rounded-full border px-2.5 text-xs font-semibold disabled:opacity-50 ${
                      amountPreset === "full"
                        ? "border-emerald-700 bg-emerald-700 text-white"
                        : "border-slate-300 bg-white text-slate-700"
                    }`}
                  >
                    Full
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setOnSiteAmount(String(Math.max(1, Math.round((reservationBalance || 0) / 2))));
                      setAmountPreset("half");
                    }}
                    disabled={!hasOutstandingBalance}
                    className={`inline-flex h-7 items-center rounded-full border px-2.5 text-xs font-semibold disabled:opacity-50 ${
                      amountPreset === "half"
                        ? "border-emerald-700 bg-emerald-700 text-white"
                        : "border-slate-300 bg-white text-slate-700"
                    }`}
                  >
                    Half
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAmountPreset("custom");
                      amountInputRef.current?.focus();
                    }}
                    className={`inline-flex h-7 items-center rounded-full border px-2.5 text-xs font-semibold ${
                      amountPreset === "custom"
                        ? "border-emerald-700 bg-emerald-700 text-white"
                        : "border-slate-300 bg-white text-slate-700"
                    }`}
                  >
                    Custom
                  </button>
                </div>
              </label>

              <label className="grid gap-1 text-xs text-slate-600">
                Payment Method
                <select
                  value={onSiteMethod}
                  onChange={(event) => {
                    const nextMethod = event.target.value;
                    setOnSiteMethod(nextMethod);
                    if (nextMethod === "cash") {
                      setOnSiteReferenceNo("");
                    }
                  }}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="cash">Cash</option>
                  <option value="gcash">GCash</option>
                  <option value="bank">Bank Transfer</option>
                  <option value="card">Card</option>
                </select>
                {requiresReference ? (
                  <span className="text-[11px] text-slate-500">Reference number is required for this payment method.</span>
                ) : null}
              </label>

              {requiresReference ? (
                <label className="grid gap-1 text-xs text-slate-600">
                  Reference Number
                  <input
                    type="text"
                    value={onSiteReferenceNo}
                    onChange={(event) => setOnSiteReferenceNo(event.target.value)}
                    placeholder="Receipt / transfer reference"
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  />
                </label>
              ) : null}

              <div>
                <button
                  type="button"
                  onClick={() => void submitOnSitePayment()}
                  disabled={onSiteBusy}
                  className="w-full rounded-lg border border-emerald-700 bg-emerald-700 px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {onSitePrimaryLabel}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {notice ? (
        <div className={`mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700 ${isWalkInContextNotice ? "hidden" : ""}`}>
          <p>{notice}</p>
          {walkInQuickAction ? (
            <div className="mt-2 flex flex-wrap gap-2">
              <Link
                href={walkInFlowType === "tour" ? "/admin/walk-in?tab=tour" : "/admin/walk-in?tab=stay"}
                className="inline-flex rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800"
              >
                {walkInFlowType === "tour" ? "Create another walk-in tour" : "Create another walk-in"}
              </Link>
              {lastProcessedReservation?.reservationId ? (
                <Link
                  href={`/admin/reservations?reservation_id=${encodeURIComponent(lastProcessedReservation.reservationId)}`}
                  className="inline-flex rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800"
                >
                  View reservation
                </Link>
              ) : null}
              {walkInFlowType === "tour" && lastProcessedReservation?.reservationCode ? (
                <Link
                  href={`/admin/check-in?mode=code&reservation_code=${encodeURIComponent(lastProcessedReservation.reservationCode)}`}
                  className="inline-flex rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-semibold text-emerald-800"
                >
                  Mark arrived / Check in
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
      {cachedViewMeta ? (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
          {cachedViewMeta}
        </p>
      ) : null}
      {error ? (
        <div className="mb-3 inline-flex w-full items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}
      {loading ? <p className="mb-3 text-sm text-slate-600">Loading payments...</p> : null}

      {!loading && count === 0 ? (
        <div className="rounded-2xl border border-slate-200/70 bg-white p-8 text-center shadow-sm">
          <h3 className="text-lg font-semibold text-slate-900">
            {isToReview ? "No payment submissions to review" : "No payment history in this tab"}
          </h3>
          <p className="mt-2 text-sm text-slate-600">
            {isToReview ? "Only pending submissions with proof/reference appear here." : "Try another tab or search."}
          </p>
          {isToReview ? (
            <Link
              href="/admin/reservations?status=pending_payment"
              className="mt-5 inline-flex rounded-lg border border-slate-900 bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
            >
              View Pending Payment Reservations
            </Link>
          ) : null}
        </div>
      ) : null}

      {count > 0 ? (
        <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">Reservation</th>
                  <th className="px-4 py-3 font-semibold">Source</th>
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
                  const outcomeMeta = policyOutcomeMeta(payment.reservation?.policy_outcome);
                  return (
                    <tr key={payment.payment_id} className="border-t border-slate-100 hover:bg-slate-50/80">
                      <td className="px-4 py-3">
                        <p className="font-mono font-semibold text-slate-900">{payment.reservation?.reservation_code ?? "-"}</p>
                        <p className="text-xs text-slate-500">{formatDateTime(payment.created_at)}</p>
                      </td>
                      <td className="px-4 py-3">
                        {(() => {
                          const source = getPaymentSource(payment);
                          return (
                            <span
                              className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${
                                source === "walk_in" ? "bg-emerald-100 text-emerald-800" : "bg-blue-100 text-blue-800"
                              }`}
                            >
                              {source === "walk_in" ? "Walk-in" : "Online"}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${resMeta.className}`}>{resMeta.label}</span>
                          {outcomeMeta ? (
                            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${outcomeMeta.className}`}>
                              {outcomeMeta.label}
                            </span>
                          ) : null}
                        </div>
                        {payment.reservation?.deposit_rule_applied ? (
                          <p className="mt-1 text-[11px] text-slate-500">
                            {policyRuleLabel(payment.reservation.deposit_rule_applied) ?? payment.reservation.deposit_rule_applied}
                          </p>
                        ) : null}
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
                              className="rounded-lg border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
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
                              className="rounded-lg border border-red-600 bg-red-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
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
              Page {page} of {totalPages} • {count} total
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
          <div className="w-full rounded-t-2xl border border-slate-200/70 bg-white p-4 md:max-w-xl md:rounded-2xl">
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
              className="min-h-[120px] w-full rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm outline-none ring-blue-200 transition focus:ring-2"
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
