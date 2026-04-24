"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Search, X } from "lucide-react";
import type {
  AdminPaymentItem,
  AdminPaymentsResponse,
  ReservationListItem as ReservationItem,
  ReservationListResponse as ReservationsResponse,
  ReservationStatus,
} from "../../../packages/shared/src/types";
import {
  adminPaymentsResponseSchema,
  paymentVerifyResponseSchema,
  reservationListItemSchema,
  reservationListResponseSchema,
} from "../../../packages/shared/src/schemas";
import { apiFetch } from "../../lib/apiClient";
import { getApiErrorMessage } from "../../lib/apiError";
import { getSupabaseBrowserClient } from "../../lib/supabase";
import { ReservationDetailDrawer } from "./ReservationDetailDrawer";
import { DataFreshnessBadge } from "../shared/DataFreshnessBadge";
import { useToast } from "../shared/ToastProvider";
import { loadReservationsSnapshot, saveReservationsSnapshot } from "../../lib/offlineSync/store";

type AdminReservationsClientProps = {
  initialToken?: string | null;
  initialSessionEmail?: string | null;
  initialData?: ReservationsResponse | null;
  initialOpenReservationId?: string | null;
};

type ReservationQuickFilter =
  | "all"
  | "online"
  | "walk_in";

const QUICK_FILTERS: Array<{ id: ReservationQuickFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "online", label: "Online" },
  { id: "walk_in", label: "Walk-in" },
];

type PaymentStatusFilter = "all" | "unpaid" | "partial" | "settled";
type StatQuickFilter = "none" | "today_arrivals" | "pending_payment" | "walk_ins_today" | "ready_for_checkin";

const STATUS_BADGE_CLASS: Partial<Record<ReservationStatus, string>> = {
  pending_payment: "bg-yellow-100 text-yellow-800",
  for_verification: "bg-blue-100 text-blue-800",
  confirmed: "bg-emerald-100 text-emerald-800",
  checked_in: "bg-indigo-100 text-indigo-800",
  checked_out: "bg-slate-200 text-slate-700",
  cancelled: "bg-red-100 text-red-800",
  no_show: "bg-red-100 text-red-800",
};

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

function formatCachedAt(value?: string | null) {
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

function getPaymentState(reservation: ReservationItem): "unpaid" | "partial" | "settled" {
  const total = Number(reservation.total_amount ?? 0);
  const paid = Number(reservation.amount_paid_verified ?? 0);
  const balance = Number(reservation.balance_due ?? Math.max(total - paid, 0));
  if (balance <= 0 && total > 0) return "settled";
  if (paid > 0 && balance > 0) return "partial";
  return "unpaid";
}

function getPaymentStateMeta(state: "unpaid" | "partial" | "settled") {
  if (state === "settled") {
    return { label: "Paid in Full", className: "bg-emerald-100 text-emerald-800" };
  }
  if (state === "partial") {
    return { label: "Partially Paid", className: "bg-amber-100 text-amber-800" };
  }
  return { label: "Unpaid", className: "bg-slate-200 text-slate-700" };
}

function getReservationSource(reservation: ReservationItem): "online" | "walk_in" {
  if (reservation.reservation_source === "online" || reservation.reservation_source === "walk_in") {
    return reservation.reservation_source;
  }
  const notes = String(reservation.notes || "").toLowerCase();
  const fromWalkInNotes = notes.includes("walk-in") || notes.includes("walk in");
  return fromWalkInNotes ? "walk_in" : "online";
}

function matchesPaymentFilter(reservation: ReservationItem, filter: PaymentStatusFilter) {
  if (filter === "all") return true;
  const state = getPaymentState(reservation);
  if (filter === "unpaid") return state === "unpaid";
  if (filter === "partial") return state === "partial";
  return state === "settled";
}

function matchesStatQuickFilter(
  reservation: ReservationItem,
  statFilter: StatQuickFilter,
  today: string,
) {
  const createdDate = reservation.created_at ? reservation.created_at.slice(0, 10) : "";
  const isWalkInToday = getReservationSource(reservation) === "walk_in"
    && (reservation.check_in_date === today || createdDate === today);

  if (statFilter === "none") return true;
  if (statFilter === "today_arrivals") return reservation.check_in_date === today;
  if (statFilter === "pending_payment") {
    return (
      reservation.status === "pending_payment"
      || reservation.status === "for_verification"
      || getPaymentState(reservation) !== "settled"
    );
  }
  if (statFilter === "walk_ins_today") {
    return isWalkInToday;
  }
  return (
    reservation.check_in_date === today
    && ["confirmed", "for_verification", "pending_payment"].includes(reservation.status)
    && getPaymentState(reservation) === "settled"
  );
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

export function AdminReservationsClient({
  initialToken = null,
  initialSessionEmail = null,
  initialData = null,
  initialOpenReservationId = null,
}: AdminReservationsClientProps) {
  const token = initialToken;
  const sessionEmail = initialSessionEmail;
  const { showToast } = useToast();

  const [quickFilter, setQuickFilter] = useState<ReservationQuickFilter>("all");
  const [searchInput, setSearchInput] = useState("");
  const [searchValue, setSearchValue] = useState("");
  const [reservationStatusFilter, setReservationStatusFilter] = useState<ReservationStatus | "all">("all");
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<PaymentStatusFilter>("all");
  const [arrivalDateFilter, setArrivalDateFilter] = useState("");
  const [statQuickFilter, setStatQuickFilter] = useState<StatQuickFilter>("none");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);
  const [quickFilterCounts, setQuickFilterCounts] = useState<Record<ReservationQuickFilter, number>>({
    all: initialData?.count ?? 0,
    online: 0,
    walk_in: 0,
  });
  const [quickStats, setQuickStats] = useState({
    todayArrivals: 0,
    pendingPayment: 0,
    walkInsToday: 0,
    readyForCheckIn: 0,
  });

  const [items, setItems] = useState<ReservationItem[]>(initialData?.items ?? []);
  const [count, setCount] = useState(initialData?.count ?? 0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cachedViewMeta, setCachedViewMeta] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [details, setDetails] = useState<ReservationItem | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [autoOpenedReservationId, setAutoOpenedReservationId] = useState<string | null>(null);
  const [reservationPayments, setReservationPayments] = useState<AdminPaymentItem[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentsError, setPaymentsError] = useState<string | null>(null);
  const [proofBusy, setProofBusy] = useState<Record<string, boolean>>({});
  const [verifyBusy, setVerifyBusy] = useState<Record<string, boolean>>({});
  const listRequestIdRef = useRef(0);
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSearchValue(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  const fetchList = useCallback(async () => {
    if (!token) return;
    const requestId = ++listRequestIdRef.current;
    const snapshotVariantKey = [
      quickFilter,
      reservationStatusFilter,
      paymentStatusFilter,
      arrivalDateFilter || "__any__",
      statQuickFilter,
      searchValue || "__all__",
      String(page),
      String(pageSize),
    ].join("::");
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      const sourceFromQuickFilter: Partial<Record<ReservationQuickFilter, "online" | "walk_in">> = {
        online: "online",
        walk_in: "walk_in",
      };
      const isClientSideFilter = Boolean(arrivalDateFilter) || paymentStatusFilter !== "all" || statQuickFilter !== "none";
      const offset = isClientSideFilter ? 0 : (page - 1) * pageSize;
      const limit = isClientSideFilter ? 500 : pageSize;
      const qs = new URLSearchParams();
      qs.set("limit", String(limit));
      qs.set("offset", String(offset));
      qs.set("sort_by", "created_at");
      qs.set("sort_dir", "desc");
      if (reservationStatusFilter !== "all") qs.set("status", reservationStatusFilter);
      if (sourceFromQuickFilter[quickFilter]) qs.set("source", sourceFromQuickFilter[quickFilter] as "online" | "walk_in");
      if (searchValue) qs.set("search", searchValue);

      const data = await apiFetch<ReservationsResponse>(
        `/v2/reservations?${qs.toString()}`,
        { method: "GET" },
        token,
        reservationListResponseSchema,
      );
      let nextItems = data.items ?? [];
      if (arrivalDateFilter) {
        nextItems = nextItems.filter((item) => item.check_in_date === arrivalDateFilter);
      }
      nextItems = nextItems.filter((item) => matchesPaymentFilter(item, paymentStatusFilter));
      nextItems = nextItems.filter((item) => matchesStatQuickFilter(item, statQuickFilter, todayIso));
      if (requestId !== listRequestIdRef.current) return;
      if (isClientSideFilter) {
        const total = nextItems.length;
        const start = (page - 1) * pageSize;
        const pagedItems = nextItems.slice(start, start + pageSize);
        setItems(pagedItems);
        setCount(total);
        setQuickFilterCounts((prev) => ({
          ...prev,
          [quickFilter]: total,
        }));
        await saveReservationsSnapshot("admin", {
          items: pagedItems,
          count: total,
          limit: pageSize,
          offset: start,
          has_more: start + pageSize < total,
        }, { variantKey: snapshotVariantKey });
      } else {
        setItems(nextItems);
        setCount(data.count ?? 0);
        setQuickFilterCounts((prev) => ({
          ...prev,
          [quickFilter]: data.count ?? 0,
        }));
        await saveReservationsSnapshot("admin", {
          items: nextItems,
          count: data.count ?? 0,
          limit: data.limit ?? pageSize,
          offset: data.offset ?? (page - 1) * pageSize,
          has_more: data.has_more ?? false,
        }, { variantKey: snapshotVariantKey });
      }
      setCachedViewMeta(null);
    } catch (unknownError) {
      if (requestId !== listRequestIdRef.current) return;
      const cached = await loadReservationsSnapshot("admin", { variantKey: snapshotVariantKey });
      if (cached?.data) {
        const cachedRows = cached.data.items ?? [];
        setItems(cachedRows);
        setCount(cached.data.count ?? cachedRows.length);
        setCachedViewMeta(`Using cached data from ${formatCachedAt(cached.cached_at)}`);
        setError(null);
      } else {
        setItems([]);
        setCount(0);
        setError(
          getApiErrorMessage(
            unknownError,
            "Failed to load reservations.",
            {
              unauthorized: "Sign in required.",
              forbidden: "Admin access required.",
            },
          ),
        );
        setCachedViewMeta(null);
      }
    } finally {
      if (requestId !== listRequestIdRef.current) return;
      setLoading(false);
    }
  }, [arrivalDateFilter, page, pageSize, paymentStatusFilter, quickFilter, reservationStatusFilter, searchValue, statQuickFilter, todayIso, token]);

  useEffect(() => {
    if (!token) {
      listRequestIdRef.current += 1;
      setItems([]);
      setCount(0);
      setCachedViewMeta(null);
      return;
    }
    void fetchList();
  }, [arrivalDateFilter, fetchList, page, paymentStatusFilter, quickFilter, reservationStatusFilter, searchValue, token]);

  const fetchQuickFilterCounts = useCallback(async () => {
    if (!token) return;
    try {
      const qs = new URLSearchParams();
      qs.set("limit", "1000");
      qs.set("offset", "0");
      qs.set("sort_by", "check_in_date");
      qs.set("sort_dir", "asc");
      if (reservationStatusFilter !== "all") {
        qs.set("status", reservationStatusFilter);
      }
      if (searchValue) {
        qs.set("search", searchValue);
      }
      const data = await apiFetch<ReservationsResponse>(
        `/v2/reservations?${qs.toString()}`,
        { method: "GET" },
        token,
        reservationListResponseSchema,
      );
      let rows = data.items ?? [];
      if (arrivalDateFilter) {
        rows = rows.filter((item) => item.check_in_date === arrivalDateFilter);
      }
      rows = rows.filter((item) => matchesPaymentFilter(item, paymentStatusFilter));
      rows = rows.filter((item) => matchesStatQuickFilter(item, statQuickFilter, todayIso));
      setQuickFilterCounts({
        all: rows.length,
        online: rows.filter((item) => getReservationSource(item) === "online").length,
        walk_in: rows.filter((item) => getReservationSource(item) === "walk_in").length,
      });
    } catch {
      // non-blocking: counts are secondary telemetry
    }
  }, [arrivalDateFilter, paymentStatusFilter, reservationStatusFilter, searchValue, statQuickFilter, todayIso, token]);

  useEffect(() => {
    if (!token) return;
    void fetchQuickFilterCounts();
  }, [fetchQuickFilterCounts, token]);

  const fetchQuickStats = useCallback(async () => {
    if (!token) return;
    try {
      const today = new Date().toISOString().slice(0, 10);
      const qs = new URLSearchParams();
      qs.set("limit", "1000");
      qs.set("offset", "0");
      qs.set("sort_by", "check_in_date");
      qs.set("sort_dir", "asc");
      const data = await apiFetch<ReservationsResponse>(
        `/v2/reservations?${qs.toString()}`,
        { method: "GET" },
        token,
        reservationListResponseSchema,
      );
      const rows = data.items ?? [];
      const todayRows = rows.filter((item) => item.check_in_date === today);
      const pendingPaymentCount = rows.filter((item) =>
        item.status === "pending_payment"
        || item.status === "for_verification"
        || getPaymentState(item) !== "settled",
      ).length;
      const walkInsToday = rows.filter((item) => {
        const createdDate = item.created_at ? item.created_at.slice(0, 10) : "";
        return getReservationSource(item) === "walk_in" && (item.check_in_date === today || createdDate === today);
      }).length;
      const readyForCheckIn = todayRows.filter((item) => {
        if (!["confirmed", "for_verification", "pending_payment"].includes(item.status)) return false;
        return getPaymentState(item) === "settled";
      }).length;
      setQuickStats({
        todayArrivals: todayRows.length,
        pendingPayment: pendingPaymentCount,
        walkInsToday,
        readyForCheckIn,
      });
    } catch {
      // silent: non-critical snapshot
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    void fetchQuickStats();
  }, [fetchQuickStats, token]);

  const openDetails = useCallback(
    async (reservationId: string, seedReservation?: ReservationItem | null) => {
      if (!token) return;
      setDetailsLoading(true);
      setDetailsError(null);
      setReservationPayments([]);
      setPaymentsError(null);
      if (seedReservation) {
        setDetails(seedReservation);
      }
      try {
        const data = await apiFetch<ReservationItem>(
          `/v2/reservations/${encodeURIComponent(reservationId)}`,
          { method: "GET" },
          token,
          reservationListItemSchema,
        );
        setDetails(data);

        setPaymentsLoading(true);
        try {
          const paymentsData = await apiFetch<AdminPaymentsResponse>(
            `/v2/payments/reservations/${encodeURIComponent(data.reservation_id)}?limit=50&offset=0`,
            { method: "GET" },
            token,
            adminPaymentsResponseSchema,
          );
          setReservationPayments(paymentsData.items ?? []);
        } catch (unknownError) {
          setPaymentsError(getApiErrorMessage(unknownError, "Failed to load payment submissions."));
        } finally {
          setPaymentsLoading(false);
        }
      } catch (unknownError) {
        setDetailsError(getApiErrorMessage(unknownError, "Failed to load reservation details."));
      } finally {
        setDetailsLoading(false);
      }
    },
    [token],
  );

  const refreshReservationPayments = useCallback(
    async (reservationId: string) => {
      if (!token) return;
      setPaymentsLoading(true);
      setPaymentsError(null);
      try {
        const paymentsData = await apiFetch<AdminPaymentsResponse>(
          `/v2/payments/reservations/${encodeURIComponent(reservationId)}?limit=50&offset=0`,
          { method: "GET" },
          token,
          adminPaymentsResponseSchema,
        );
        setReservationPayments(paymentsData.items ?? []);
      } catch (unknownError) {
        setPaymentsError(getApiErrorMessage(unknownError, "Failed to load payment submissions."));
      } finally {
        setPaymentsLoading(false);
      }
    },
    [token],
  );

  const verifyReservationPayment = useCallback(
    async (paymentId: string) => {
      if (!token || !details) return;
      setVerifyBusy((prev) => ({ ...prev, [paymentId]: true }));
      setPaymentsError(null);
      try {
        await apiFetch(
          `/v2/payments/${encodeURIComponent(paymentId)}/verify`,
          { method: "POST" },
          token,
          paymentVerifyResponseSchema,
        );
        await refreshReservationPayments(details.reservation_id);
        await openDetails(details.reservation_id);
        setNotice("Payment verified and reservation totals refreshed.");
        showToast({
          type: "success",
          title: "Payment verified",
          message: "Reservation totals were refreshed.",
        });
        await fetchQuickStats();
      } catch (unknownError) {
        setPaymentsError(getApiErrorMessage(unknownError, "Failed to verify payment."));
      } finally {
        setVerifyBusy((prev) => ({ ...prev, [paymentId]: false }));
      }
    },
    [details, fetchQuickStats, openDetails, refreshReservationPayments, showToast, token],
  );

  const openPaymentProof = useCallback(async (payment: AdminPaymentItem) => {
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
      setPaymentsError(getApiErrorMessage(unknownError, "Failed to open payment proof."));
    } finally {
      setProofBusy((prev) => ({ ...prev, [payment.payment_id]: false }));
    }
  }, []);

  useEffect(() => {
    if (!token || !initialOpenReservationId) return;
    if (autoOpenedReservationId === initialOpenReservationId) return;
    setAutoOpenedReservationId(initialOpenReservationId);
    void openDetails(initialOpenReservationId);
  }, [autoOpenedReservationId, initialOpenReservationId, openDetails, token]);

  const totalPages = Math.max(1, Math.ceil(count / pageSize));
  const canPrev = page > 1;
  const canNext = page < totalPages;

  const headerLabel = useMemo(() => {
    if (error === "Admin access required." || error?.includes("HTTP 403")) return "Admin access required";
    if (error === "Sign in required." || error?.includes("HTTP 401")) return "Sign in required";
    return null;
  }, [error]);

  const statQuickFilterLabel = useMemo(() => {
    if (statQuickFilter === "today_arrivals") return "Today arrivals";
    if (statQuickFilter === "pending_payment") return "Pending payment";
    if (statQuickFilter === "walk_ins_today") return "Walk-ins today";
    if (statQuickFilter === "ready_for_checkin") return "Ready for check-in";
    return null;
  }, [statQuickFilter]);

  if (!token) {
    return (
      <section className="mx-auto w-full max-w-6xl">
        <h1 className="text-3xl font-bold text-slate-900">Admin Reservations (V2)</h1>
        <p className="mt-3 text-sm text-slate-600">No active session found. Sign in as admin first.</p>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-6xl">
      <header className="mb-6 rounded-3xl border border-slate-200/70 bg-gradient-to-br from-white via-slate-50 to-blue-50 p-6 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="lg:min-w-[280px]">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Reservations Console</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">Admin Reservations</h1>
            <p className="mt-2 text-sm text-slate-600">
              Signed in as <strong>{sessionEmail ?? "user"}</strong>
            </p>
            <div className="mt-2">
              <DataFreshnessBadge />
            </div>
          </div>
          <div className="grid flex-1 gap-2 text-xs sm:grid-cols-2 lg:max-w-[520px]">
            {[
              {
                id: "today_arrivals" as StatQuickFilter,
                label: "Today arrivals",
                caption: "Arrivals due today",
                value: quickStats.todayArrivals,
              },
              {
                id: "pending_payment" as StatQuickFilter,
                label: "Pending payment",
                caption: "Needs payment action",
                value: quickStats.pendingPayment,
              },
              {
                id: "walk_ins_today" as StatQuickFilter,
                label: "Walk-ins today",
                caption: "Created or arriving today",
                value: quickStats.walkInsToday,
              },
              {
                id: "ready_for_checkin" as StatQuickFilter,
                label: "Ready for check-in",
                caption: "Eligible now",
                value: quickStats.readyForCheckIn,
              },
            ].map((card) => {
              const active = statQuickFilter === card.id;
              return (
                <button
                  key={card.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    const next = active ? "none" : card.id;
                    setStatQuickFilter(next);
                    setPage(1);
                  }}
                  className={`group rounded-xl border px-3 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 ${
                    active
                      ? "border-blue-300 bg-blue-50 text-slate-900"
                      : "border-slate-200 bg-white/90 text-slate-900 hover:border-slate-300 hover:bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">{card.label}</p>
                      <p className="mt-0.5 text-[11px] text-slate-600">{card.caption}</p>
                    </div>
                    <p className="text-lg font-bold text-slate-900">{card.value}</p>
                  </div>
                </button>
              );
            })}
          </div>
          <div className="flex lg:min-w-[220px] lg:justify-end">
            <Link
              href="/admin/walk-in"
              className="inline-flex h-10 items-center rounded-xl border border-slate-900 bg-slate-900 px-4 text-sm font-semibold text-white transition hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200"
            >
              New Walk-in Reservation
            </Link>
          </div>
        </div>
      </header>

      <div className="mb-4 rounded-2xl border border-slate-200/70 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3">
          {statQuickFilterLabel ? (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs text-blue-800">
              <span>
                Quick filter: <strong>{statQuickFilterLabel}</strong> (combined with source/status/date filters)
              </span>
              <button
                type="button"
                onClick={() => {
                  setStatQuickFilter("none");
                  setPage(1);
                }}
                className="rounded-md border border-blue-200 bg-white px-2 py-1 font-semibold text-blue-700 transition hover:bg-blue-100"
              >
                Reset quick filter
              </button>
            </div>
          ) : null}
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="grid grid-cols-3 gap-1 rounded-xl border border-slate-200 bg-slate-50 p-1 lg:min-w-[360px]">
              {QUICK_FILTERS.map((filter) => {
                const active = quickFilter === filter.id;
                return (
                  <button
                    key={filter.id}
                    type="button"
                    onClick={() => {
                      setQuickFilter(filter.id);
                      setPage(1);
                    }}
                    className={`inline-flex h-9 items-center justify-center rounded-lg px-2 text-xs font-semibold transition ${
                      active
                        ? "border border-slate-900 bg-white text-slate-900 shadow-sm"
                        : "text-slate-600 hover:bg-white hover:text-slate-900"
                    }`}
                  >
                    <span>{filter.label}</span>
                    <span
                      className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] ${
                        active ? "bg-slate-900 text-white" : "bg-slate-200 text-slate-700"
                      }`}
                    >
                      {quickFilterCounts[filter.id] ?? 0}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchInput}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search code, guest, unit, or phone"
                className="h-10 w-full rounded-lg border border-slate-300 pl-9 pr-9 text-sm outline-none ring-blue-200 focus:ring-2"
              />
              {searchInput ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearchInput("");
                    setSearchValue("");
                    setPage(1);
                  }}
                  className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <label className="grid gap-1 text-xs text-slate-600">
              Reservation status
              <select
                value={reservationStatusFilter}
                onChange={(event) => {
                  setReservationStatusFilter(event.target.value as ReservationStatus | "all");
                  setPage(1);
                }}
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm text-slate-700"
              >
                <option value="all">All statuses</option>
                <option value="pending_payment">Pending Payment</option>
                <option value="for_verification">For Verification</option>
                <option value="confirmed">Confirmed</option>
                <option value="checked_in">Checked In</option>
                <option value="checked_out">Checked Out</option>
                <option value="cancelled">Cancelled</option>
                <option value="no_show">No Show</option>
              </select>
            </label>

            <label className="grid gap-1 text-xs text-slate-600">
              Payment status
              <select
                value={paymentStatusFilter}
                onChange={(event) => {
                  setPaymentStatusFilter(event.target.value as PaymentStatusFilter);
                  setPage(1);
                }}
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm text-slate-700"
              >
                <option value="all">All payments</option>
                <option value="unpaid">Unpaid</option>
                <option value="partial">Partial</option>
                <option value="settled">Paid</option>
              </select>
            </label>

            <label className="grid gap-1 text-xs text-slate-600">
              Date
              <input
                type="date"
                value={arrivalDateFilter}
                onChange={(event) => {
                  setArrivalDateFilter(event.target.value);
                  setPage(1);
                }}
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm text-slate-700"
              />
            </label>

            <div className="flex items-end">
              <button
                type="button"
                onClick={() => {
                  setReservationStatusFilter("all");
                  setPaymentStatusFilter("all");
                  setArrivalDateFilter("");
                  setStatQuickFilter("none");
                  setSearchInput("");
                  setSearchValue("");
                  setPage(1);
                }}
                className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Clear filters
              </button>
            </div>
          </div>
        </div>
      </div>

      {headerLabel ? <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{headerLabel}</p> : null}
      {cachedViewMeta ? (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
          {cachedViewMeta}
        </p>
      ) : null}
      {error && !headerLabel ? <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {notice ? <p className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p> : null}
      {loading ? <p className="mb-3 text-sm text-slate-600">Loading reservations...</p> : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-600">
                <tr>
                  <th className="px-4 py-3 font-semibold">Code</th>
                  <th className="px-4 py-3 font-semibold">Source</th>
                  <th className="px-4 py-3 font-semibold">Guest</th>
                  <th className="px-4 py-3 font-semibold">Stay Dates</th>
                  <th className="px-4 py-3 font-semibold">Reservation Status</th>
                  <th className="px-4 py-3 font-semibold">Payment Status</th>
                  <th className="px-4 py-3 font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {items.map((reservation) => (
                  <tr
                    key={reservation.reservation_id}
                    role="button"
                    tabIndex={0}
                    onClick={() => void openDetails(reservation.reservation_id, reservation)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        void openDetails(reservation.reservation_id, reservation);
                      }
                    }}
                    className="cursor-pointer border-t border-slate-100 transition hover:bg-slate-50/90 focus-within:bg-slate-50/90"
                  >
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{reservation.reservation_code}</p>
                      <p className="text-xs text-slate-500">{formatDateTime(reservation.created_at)}</p>
                    </td>
                    <td className="px-4 py-3">
                      {(() => {
                        const source = getReservationSource(reservation);
                        return (
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                              source === "walk_in" ? "bg-emerald-100 text-emerald-800" : "bg-blue-100 text-blue-800"
                            }`}
                          >
                            {source === "walk_in" ? "Walk-in" : "Online"}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-800">{reservation.guest?.name || "-"}</p>
                      <p className="text-xs text-slate-500">{reservation.guest?.email || "-"}</p>
                    </td>
                  <td className="px-4 py-3">
                    <p className="text-sm text-slate-700">
                      {formatDate(reservation.check_in_date)} to {formatDate(reservation.check_out_date)}
                    </p>
                  </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide ${
                          STATUS_BADGE_CLASS[reservation.status] ?? "bg-slate-200 text-slate-700"
                        }`}
                    >
                      {reservation.status.replace(/_/g, " ").toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      {(() => {
                        const paymentMeta = getPaymentStateMeta(getPaymentState(reservation));
                        return (
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${paymentMeta.className}`}>
                            {paymentMeta.label}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-slate-900">{formatPeso(reservation.total_amount)}</p>
                      <p className="text-xs text-slate-500">Paid: {formatPeso(reservation.amount_paid_verified)}</p>
                    </td>
                </tr>
              ))}
              {!loading && items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-sm text-slate-600">
                    No reservations found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between">
        <p className="text-xs text-slate-500">
          Page {page} of {totalPages} • {count} total
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setPage((prev) => Math.max(1, prev - 1))}
            disabled={!canPrev}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
          >
            Previous
          </button>
          <button
            type="button"
            onClick={() => setPage((prev) => prev + 1)}
            disabled={!canNext}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"
          >
            Next
          </button>
        </div>
      </div>

      <ReservationDetailDrawer
        open={Boolean(detailsLoading || details || detailsError)}
        loading={detailsLoading}
        error={detailsError}
        reservation={details}
        payments={reservationPayments}
        paymentsLoading={paymentsLoading}
        paymentsError={paymentsError}
        proofBusy={proofBusy}
        verifyBusy={verifyBusy}
        onClose={() => {
          setDetails(null);
          setDetailsError(null);
        }}
        onRefreshPayments={() => {
          if (!details) return;
          void refreshReservationPayments(details.reservation_id);
        }}
        onOpenProof={(payment) => {
          void openPaymentProof(payment);
        }}
        onVerifyPayment={(paymentId) => {
          void verifyReservationPayment(paymentId);
        }}
      />
    </section>
  );
}



