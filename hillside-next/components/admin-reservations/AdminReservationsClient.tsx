"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { CalendarCheck, CreditCard, PlusCircle, ScanLine, Search, UserPlus, X } from "lucide-react";
import type {
  AdminPaymentItem,
  AdminPaymentsResponse,
  ReservationListItem as ReservationItem,
  ReservationListResponse as ReservationsResponse,
  ReservationQuickStatsResponse,
  ReservationStatus,
} from "../../../packages/shared/src/types";
import {
  adminPaymentsResponseSchema,
  paymentVerifyResponseSchema,
  reservationListItemSchema,
  reservationListResponseSchema,
  reservationQuickStatsResponseSchema,
} from "../../../packages/shared/src/schemas";
import { apiFetch } from "../../lib/apiClient";
import { getApiErrorMessage } from "../../lib/apiError";
import { formatCachedAt, formatDateTime, formatDateWithYear } from "../../lib/dateDisplay";
import { todayPlusLocalIsoDate } from "../../lib/dateIso";
import { formatPhpPeso as formatPeso } from "../../lib/formatCurrency";
import { normalizePaymentProofPath } from "../../lib/paymentProof";
import { getReservationStatusMeta } from "../../lib/reservationStatus";
import { getReservationPaymentState, getReservationSource } from "../../lib/reservationView";
import { getSupabaseBrowserClient } from "../../lib/supabase";
import { ReservationDetailDrawer } from "./ReservationDetailDrawer";
import { AdminPageHeader } from "../layout/AdminPageHeader";
import { DataFreshnessBadge } from "../shared/DataFreshnessBadge";
import { KpiTile } from "../shared/KpiTile";
import { Pagination } from "../shared/Pagination";
import { Select } from "../shared/Select";
import { FancyDatePicker } from "../shared/FancyDatePicker";
import { useToast } from "../shared/ToastProvider";
import { loadReservationsSnapshot, saveReservationsSnapshot } from "../../lib/offlineSync/store";

type AdminReservationsClientProps = {
  initialToken?: string | null;
  initialSessionEmail?: string | null;
  initialData?: ReservationsResponse | null;
  initialOpenReservationId?: string | null;
  role?: string | null;
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

function getPaymentStateMeta(state: "unpaid" | "partial" | "settled") {
  if (state === "settled") {
    return { label: "Paid in Full", className: "bg-emerald-100 text-emerald-800" };
  }
  if (state === "partial") {
    return { label: "Partially Paid", className: "bg-amber-100 text-amber-800" };
  }
  return { label: "Unpaid", className: "bg-[var(--color-border)] text-[var(--color-text)]" };
}

function matchesPaymentFilter(reservation: ReservationItem, filter: PaymentStatusFilter) {
  if (filter === "all") return true;
  const state = getReservationPaymentState(reservation);
  if (filter === "unpaid") return state === "unpaid";
  if (filter === "partial") return state === "partial";
  return state === "settled";
}

function needsActivePaymentAction(reservation: ReservationItem) {
  if (["cancelled", "checked_out", "no_show"].includes(reservation.status)) {
    return false;
  }

  return (
    reservation.status === "pending_payment"
    || reservation.status === "for_verification"
    || getReservationPaymentState(reservation) !== "settled"
  );
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
  if (statFilter === "today_arrivals") {
    // Mirror the server tile: real arrivals only — drop cancelled/no-show/checked-out.
    return (
      reservation.check_in_date === today
      && !["cancelled", "no_show", "checked_out"].includes(reservation.status)
    );
  }
  if (statFilter === "pending_payment") {
    return needsActivePaymentAction(reservation);
  }
  if (statFilter === "walk_ins_today") {
    return isWalkInToday;
  }
  // ready_for_checkin — mirror the server tile: today's CONFIRMED arrivals (deposit
  // verified) with a real total. A confirmed booking is ready to check in even with
  // a balance due — the balance is collected at the desk — so do NOT require it to be
  // fully settled (that was the old definition and undercounted vs the tile).
  return (
    reservation.check_in_date === today
    && reservation.status === "confirmed"
    && Number(reservation.total_amount ?? 0) > 0
  );
}

export function AdminReservationsClient({
  initialToken = null,
  initialData = null,
  initialOpenReservationId = null,
  role = null,
}: AdminReservationsClientProps) {
  const token = initialToken;
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
  const todayIso = useMemo(() => todayPlusLocalIsoDate(0), []);

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
      const today = todayPlusLocalIsoDate(0);
      // Counts are computed server-side (cheap COUNT queries) so the tiles stay
      // correct no matter how many reservations exist — instead of shipping up
      // to N reservation rows to the browser just to count them here.
      const qs = new URLSearchParams();
      qs.set("today", today);
      const data = await apiFetch<ReservationQuickStatsResponse>(
        `/v2/reservations/stats?${qs.toString()}`,
        { method: "GET" },
        token,
        reservationQuickStatsResponseSchema,
      );
      setQuickStats({
        todayArrivals: data.today_arrivals,
        pendingPayment: data.pending_payment,
        walkInsToday: data.walk_ins_today,
        readyForCheckIn: data.ready_for_check_in,
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
    const normalizedPath = normalizePaymentProofPath(raw);
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

  const headerLabel = useMemo(() => {
    if (error === "Admin access required." || error?.includes("HTTP 403")) return "Admin access required";
    if (error === "Sign in required." || error?.includes("HTTP 401")) return "Sign in required";
    return null;
  }, [error]);

  const statQuickFilterLabel = useMemo(() => {
    if (statQuickFilter === "today_arrivals") return "Today arrivals";
    if (statQuickFilter === "pending_payment") return "Awaiting payment";
    if (statQuickFilter === "walk_ins_today") return "Walk-ins today";
    if (statQuickFilter === "ready_for_checkin") return "Ready for check-in";
    return null;
  }, [statQuickFilter]);

  if (!token) {
    return (
      <section className="mx-auto w-full max-w-[1600px]">
        <h1 className="text-3xl font-bold text-[var(--color-text)]">Admin Reservations (V2)</h1>
        <p className="mt-3 text-sm text-[var(--color-muted)]">No active session found. Sign in as admin first.</p>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-[1600px]">
      <div className="mb-5 space-y-4">
        <AdminPageHeader
          eyebrow="Operations"
          title="Admin Reservations"
          subtitle="Manage arrivals, payment state, and walk-ins from one queue."
          cornerSlot={<DataFreshnessBadge variant="plain" />}
          action={
            <Link
              href="/admin/walk-in"
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[var(--color-primary)] bg-[var(--color-primary)] px-4 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--color-secondary)_30%,white)]"
            >
              <PlusCircle className="h-4 w-4" />
              <span>Walk-in Reservation</span>
            </Link>
          }
        />
        <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
          {[
            { id: "today_arrivals" as StatQuickFilter, label: "Today arrivals", value: quickStats.todayArrivals, icon: CalendarCheck, tone: "teal" as const },
            { id: "pending_payment" as StatQuickFilter, label: "Awaiting payment", value: quickStats.pendingPayment, icon: CreditCard, tone: "amber" as const },
            { id: "walk_ins_today" as StatQuickFilter, label: "Walk-ins today", value: quickStats.walkInsToday, icon: UserPlus, tone: "primary" as const },
            { id: "ready_for_checkin" as StatQuickFilter, label: "Ready for check-in", value: quickStats.readyForCheckIn, icon: ScanLine, tone: "emerald" as const },
          ].map((card) => {
            const active = statQuickFilter === card.id;
            return (
              <KpiTile
                key={card.id}
                icon={card.icon}
                tone={card.tone}
                label={card.label}
                value={card.value}
                active={active}
                onClick={() => {
                  const next = active ? "none" : card.id;
                  setStatQuickFilter(next);
                  setPage(1);
                }}
              />
            );
          })}
        </div>
      </div>

      <div className="mb-5 rounded-2xl border border-[var(--color-border)] bg-white p-3 shadow-[var(--shadow-card)] lg:p-3.5">
        <div className="flex flex-col gap-2">
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
                className="rounded-md border border-[var(--color-border)] bg-white px-2 py-1 font-semibold text-[var(--color-text)] transition hover:bg-[var(--color-background)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--color-secondary)_30%,white)]"
              >
                Reset quick filter
              </button>
            </div>
          ) : null}
          <div className="grid gap-2 lg:grid-cols-[420px_minmax(0,1fr)] lg:items-center">
            <div className="grid grid-cols-3 gap-1 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-1">
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
                        ? "border border-[var(--color-primary)] bg-white text-[var(--color-text)] shadow-sm"
                        : "text-[var(--color-muted)] hover:bg-white hover:text-[var(--color-text)]"
                    }`}
                  >
                    <span>{filter.label}</span>
                    <span
                      className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] ${
                        active ? "bg-[var(--color-primary)] text-white" : "bg-[var(--color-border)] text-[var(--color-text)]"
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
                className="h-9 w-full rounded-lg border border-[var(--color-border)] pl-9 pr-9 text-sm outline-none ring-[color:color-mix(in_srgb,var(--color-secondary)_30%,white)] focus:ring-2"
              />
              {searchInput ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearchInput("");
                    setSearchValue("");
                    setPage(1);
                  }}
                  className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-[var(--color-muted)] transition hover:bg-[var(--color-background)] hover:text-[var(--color-text)]"
                  aria-label="Clear search"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[1.1fr_1fr_0.9fr_0.8fr]">
            <label className="grid gap-1 text-xs text-[var(--color-muted)]">
              Reservation status
              <Select
                ariaLabel="Reservation status"
                value={reservationStatusFilter}
                onChange={(next) => {
                  setReservationStatusFilter(next as ReservationStatus | "all");
                  setPage(1);
                }}
                options={[
                  { value: "all", label: "All statuses" },
                  { value: "pending_payment", label: "Pending Payment" },
                  { value: "for_verification", label: "For Verification" },
                  { value: "confirmed", label: "Confirmed" },
                  { value: "checked_in", label: "Checked In" },
                  { value: "checked_out", label: "Checked Out" },
                  { value: "cancelled", label: "Cancelled" },
                  { value: "no_show", label: "No Show" },
                ]}
              />
            </label>

            <label className="grid gap-1 text-xs text-[var(--color-muted)]">
              Payment status
              <Select
                ariaLabel="Payment status"
                value={paymentStatusFilter}
                onChange={(next) => {
                  setPaymentStatusFilter(next as PaymentStatusFilter);
                  setPage(1);
                }}
                options={[
                  { value: "all", label: "All payments" },
                  { value: "unpaid", label: "Unpaid" },
                  { value: "partial", label: "Partial" },
                  { value: "settled", label: "Paid" },
                ]}
              />
            </label>

            <div className="grid gap-1 text-xs text-[var(--color-muted)]">
              <FancyDatePicker
                label="Date"
                value={arrivalDateFilter}
                onChange={(next) => {
                  setArrivalDateFilter(next);
                  setPage(1);
                }}
                allowClear
                popoverAlign="end"
                labelClassName="text-xs text-[var(--color-muted)]"
              />
            </div>

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
                className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-[var(--color-border)] bg-white px-3 text-sm font-semibold text-[var(--color-text)] transition hover:bg-[var(--color-background)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--color-secondary)_30%,white)]"
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
      {loading ? <p className="mb-3 text-sm text-[var(--color-muted)]">Loading reservations...</p> : null}

      <div className="space-y-3">
        {/* Mobile: tappable reservation cards (the table overflows on small screens) */}
        <div className="space-y-2 md:hidden">
          {items.map((reservation) => {
            const source = getReservationSource(reservation);
            const statusMeta = getReservationStatusMeta(reservation.status);
            return (
              <button
                key={reservation.reservation_id}
                type="button"
                onClick={() => void openDetails(reservation.reservation_id, reservation)}
                className="flex w-full flex-col gap-2 rounded-2xl border border-[var(--color-border)] bg-white p-3 text-left shadow-[var(--shadow-card)] transition-colors hover:border-[color:color-mix(in_srgb,var(--color-secondary)_35%,white)]"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate font-semibold text-[var(--color-text)]">{reservation.reservation_code}</p>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-semibold tracking-wide ${statusMeta.className}`}>
                    {statusMeta.label.toUpperCase()}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate text-[var(--color-text)]">{reservation.guest?.name || "Guest"}</span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${source === "walk_in" ? "bg-emerald-100 text-emerald-800" : "bg-blue-100 text-blue-800"}`}>
                    {source === "walk_in" ? "Walk-in" : "Online"}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2 text-xs text-[var(--color-muted)]">
                  <span className="truncate">{formatDateWithYear(reservation.check_in_date)} – {formatDateWithYear(reservation.check_out_date)}</span>
                  <span className="shrink-0 font-semibold text-[var(--color-text)]">{formatPeso(reservation.total_amount)}</span>
                </div>
              </button>
            );
          })}
          {!loading && items.length === 0 ? (
            <p className="rounded-2xl border border-[var(--color-border)] bg-white p-6 text-center text-sm text-[var(--color-muted)]">No reservations found.</p>
          ) : null}
        </div>

        {/* Desktop: full table */}
        <div className="hidden overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white shadow-[var(--shadow-card)] md:block">
          <div className="overflow-x-auto">
          <table className="min-w-full text-left text-[13px] leading-5">
              <thead className="bg-[var(--color-background)] text-[var(--color-muted)]">
                <tr>
                  <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em]">Code</th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em]">Source</th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em]">Guest</th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em]">Stay Dates</th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em]">Reservation Status</th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em]">Payment Status</th>
                  <th className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-[0.12em]">Amount</th>
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
                    className="cursor-pointer border-t border-[var(--color-border)] transition hover:bg-[var(--color-background)] focus-within:bg-[var(--color-background)] even:bg-[var(--color-background)]"
                  >
                    <td className="px-3 py-2.5 align-top">
                      <p className="font-semibold text-[var(--color-text)]">{reservation.reservation_code}</p>
                      <p className="text-xs text-[var(--color-muted)]">{formatDateTime(reservation.created_at)}</p>
                    </td>
                    <td className="px-3 py-2.5 align-top">
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
                    <td className="px-3 py-2.5 align-top">
                      <p className="font-medium text-[var(--color-text)]">{reservation.guest?.name || "-"}</p>
                      <p className="text-xs text-[var(--color-muted)]">{reservation.guest?.email || "-"}</p>
                    </td>
                  <td className="px-3 py-2.5 align-top">
                    <p className="text-sm text-[var(--color-text)]">
                      {formatDateWithYear(reservation.check_in_date)} to {formatDateWithYear(reservation.check_out_date)}
                    </p>
                  </td>
                    <td className="px-3 py-2.5 align-top">
                      {(() => {
                        const statusMeta = getReservationStatusMeta(reservation.status);
                        return (
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide ${statusMeta.className}`}
                          >
                            {statusMeta.label.toUpperCase()}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      {(() => {
                        const paymentMeta = getPaymentStateMeta(getReservationPaymentState(reservation));
                        return (
                          <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${paymentMeta.className}`}>
                            {paymentMeta.label}
                          </span>
                        );
                      })()}
                    </td>
                    <td className="px-3 py-2.5 align-top">
                      <p className="font-semibold text-[var(--color-text)]">{formatPeso(reservation.total_amount)}</p>
                      <p className="text-xs text-[var(--color-muted)]">Paid: {formatPeso(reservation.amount_paid_verified)}</p>
                    </td>
                </tr>
              ))}
              {!loading && items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-6 text-center text-sm text-[var(--color-muted)]">
                    No reservations found.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--color-border)] bg-white px-3 py-2.5 shadow-[var(--shadow-card)]">
          <Pagination
            page={page}
            totalPages={totalPages}
            totalCount={count}
            pageSize={pageSize}
            onPageChange={(target) => setPage(Math.min(totalPages, Math.max(1, target)))}
          />
        </div>
      </div>

      <ReservationDetailDrawer
        role={role}
        token={token}
        onStatusChanged={() => {
          void fetchList();
          setDetails(null);
          setDetailsError(null);
        }}
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











