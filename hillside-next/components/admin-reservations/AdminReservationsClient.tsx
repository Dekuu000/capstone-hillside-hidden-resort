"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  PricingRecommendation,
  ReservationListItem as ReservationItem,
  ReservationListResponse as ReservationsResponse,
  ReservationStatus,
} from "../../../packages/shared/src/types";
import {
  pricingRecommendationSchema,
  reservationListItemSchema,
  reservationListResponseSchema,
  reservationStatusUpdateResponseSchema,
} from "../../../packages/shared/src/schemas";
import { apiFetch } from "../../lib/apiClient";

type AdminReservationsClientProps = {
  initialToken?: string | null;
  initialSessionEmail?: string | null;
  initialData?: ReservationsResponse | null;
  initialOpenReservationId?: string | null;
};

const STATUS_OPTIONS: Array<{ value: "" | ReservationStatus; label: string }> = [
  { value: "", label: "All statuses" },
  { value: "pending_payment", label: "Pending Payment" },
  { value: "for_verification", label: "For Verification" },
  { value: "confirmed", label: "Confirmed" },
  { value: "checked_in", label: "Checked In" },
  { value: "checked_out", label: "Checked Out" },
  { value: "cancelled", label: "Cancelled" },
  { value: "no_show", label: "No Show" },
];

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

function formatPeso(value: number | null | undefined) {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function getAiSource(recommendation: PricingRecommendation | null) {
  if (!recommendation) return null;
  const explanations = recommendation.explanations.map((item) => item.toLowerCase());
  return explanations.some((item) => item.includes("fallback")) ? "fallback" : "live";
}

export function AdminReservationsClient({
  initialToken = null,
  initialSessionEmail = null,
  initialData = null,
  initialOpenReservationId = null,
}: AdminReservationsClientProps) {
  const token = initialToken;
  const sessionEmail = initialSessionEmail;

  const [statusFilter, setStatusFilter] = useState<"" | ReservationStatus>("");
  const [searchInput, setSearchInput] = useState("");
  const [searchValue, setSearchValue] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize] = useState(10);

  const [items, setItems] = useState<ReservationItem[]>(initialData?.items ?? []);
  const [count, setCount] = useState(initialData?.count ?? 0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [details, setDetails] = useState<ReservationItem | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [detailsAiRecommendation, setDetailsAiRecommendation] = useState<PricingRecommendation | null>(null);
  const [detailsAiLoading, setDetailsAiLoading] = useState(false);
  const [detailsAiError, setDetailsAiError] = useState<string | null>(null);
  const [autoOpenedReservationId, setAutoOpenedReservationId] = useState<string | null>(null);
  const [statusPatchValue, setStatusPatchValue] = useState<ReservationStatus>("confirmed");
  const [statusPatchNotes, setStatusPatchNotes] = useState("");
  const [statusPatchBusy, setStatusPatchBusy] = useState(false);

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
    setNotice(null);
    try {
      const offset = (page - 1) * pageSize;
      const qs = new URLSearchParams();
      qs.set("limit", String(pageSize));
      qs.set("offset", String(offset));
      qs.set("sort_by", "created_at");
      qs.set("sort_dir", "desc");
      if (statusFilter) qs.set("status", statusFilter);
      if (searchValue) qs.set("search", searchValue);

      const data = await apiFetch<ReservationsResponse>(
        `/v2/reservations?${qs.toString()}`,
        { method: "GET" },
        token,
        reservationListResponseSchema,
      );
      setItems(data.items ?? []);
      setCount(data.count ?? 0);
    } catch (unknownError) {
      setItems([]);
      setCount(0);
      setError(unknownError instanceof Error ? unknownError.message : "Failed to load reservations.");
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, searchValue, statusFilter, token]);

  useEffect(() => {
    if (!token) {
      setItems([]);
      setCount(0);
      return;
    }
    if (initialData && page === 1 && !statusFilter && !searchValue) {
      return;
    }
    void fetchList();
  }, [fetchList, token, initialData, page, statusFilter, searchValue]);

  const openDetails = useCallback(
    async (reservationId: string) => {
      if (!token) return;
      setDetailsLoading(true);
      setDetailsError(null);
      setDetailsAiRecommendation(null);
      setDetailsAiError(null);
      setDetailsAiLoading(false);
      try {
        const data = await apiFetch<ReservationItem>(
          `/v2/reservations/${encodeURIComponent(reservationId)}`,
          { method: "GET" },
          token,
          reservationListItemSchema,
        );
        setDetails(data);
        setStatusPatchValue(data.status);
        setStatusPatchNotes(data.notes || "");

        setDetailsAiLoading(true);
        const serviceBookings = data.service_bookings ?? [];
        const firstTour = serviceBookings[0];
        const isTour = serviceBookings.length > 0;
        const partySize = isTour
          ? serviceBookings.reduce((sum, item) => sum + Number(item.adult_qty ?? 0) + Number(item.kid_qty ?? 0), 0)
          : Math.max(1, data.units?.length ?? 1);

        try {
          const aiData = await apiFetch<PricingRecommendation>(
            "/v2/ai/pricing/recommendation",
            {
              method: "POST",
              body: JSON.stringify({
                reservation_id: data.reservation_id,
                check_in_date: data.check_in_date,
                check_out_date: data.check_out_date,
                visit_date: firstTour?.visit_date ?? null,
                total_amount: data.total_amount ?? 0,
                party_size: partySize,
                unit_count: Math.max(1, data.units?.length ?? 1),
                is_tour: isTour,
                occupancy_context: {},
              }),
            },
            token,
            pricingRecommendationSchema,
          );
          setDetailsAiRecommendation(aiData);
        } catch (unknownError) {
          setDetailsAiError(
            unknownError instanceof Error ? unknownError.message : "Failed to load AI recommendation.",
          );
        } finally {
          setDetailsAiLoading(false);
        }
      } catch (unknownError) {
        setDetailsError(unknownError instanceof Error ? unknownError.message : "Failed to load reservation details.");
      } finally {
        setDetailsLoading(false);
      }
    },
    [token],
  );

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
    if (error?.includes("HTTP 403")) return "Admin access required";
    if (error?.includes("HTTP 401")) return "Sign in required";
    return null;
  }, [error]);

  if (!token) {
    return (
      <section className="mx-auto w-full max-w-6xl">
        <h1 className="text-3xl font-bold text-slate-900">Admin Reservations (V2)</h1>
        <p className="mt-3 text-sm text-slate-600">No active session found. Sign in as admin first.</p>
      </section>
    );
  }

  const patchReservationStatus = useCallback(async () => {
    if (!token || !details) return;
    setStatusPatchBusy(true);
    setError(null);
    setDetailsError(null);
    try {
      const updated = await apiFetch<{ ok: true; reservation: ReservationItem }>(
        `/v2/reservations/${encodeURIComponent(details.reservation_id)}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({
            status: statusPatchValue,
            notes: statusPatchNotes.trim() || null,
          }),
        },
        token,
        reservationStatusUpdateResponseSchema,
      );
      setDetails(updated.reservation);
      setStatusPatchValue(updated.reservation.status);
      setStatusPatchNotes(updated.reservation.notes || "");
      setNotice(`Reservation status updated to ${updated.reservation.status}.`);
      await fetchList();
    } catch (unknownError) {
      setDetailsError(
        unknownError instanceof Error ? unknownError.message : "Failed to update reservation status.",
      );
    } finally {
      setStatusPatchBusy(false);
    }
  }, [details, fetchList, statusPatchNotes, statusPatchValue, token]);

  return (
    <section className="mx-auto w-full max-w-6xl">
      <div className="mb-5">
        <h1 className="text-3xl font-bold text-slate-900">Admin Reservations (V2)</h1>
        <p className="mt-1 text-sm text-slate-600">
          Signed in as <strong>{sessionEmail ?? "user"}</strong>
        </p>
      </div>

      <div className="mb-4 grid gap-3 rounded-xl border border-blue-100 bg-white p-4 shadow-sm md:grid-cols-[220px_1fr]">
        <select
          value={statusFilter}
          onChange={(event) => {
            setStatusFilter(event.target.value as "" | ReservationStatus);
            setPage(1);
          }}
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-200 focus:ring-2"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value || "all"} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <input
          type="text"
          value={searchInput}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Search reservation code or guest"
          className="rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none ring-blue-200 focus:ring-2"
        />
      </div>

      {headerLabel ? <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{headerLabel}</p> : null}
      {error && !headerLabel ? <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p> : null}
      {notice ? <p className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{notice}</p> : null}
      {loading ? <p className="mb-3 text-sm text-slate-600">Loading reservations...</p> : null}

      <div className="overflow-hidden rounded-xl border border-blue-100 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-4 py-3 font-semibold">Code</th>
                <th className="px-4 py-3 font-semibold">Guest</th>
                <th className="px-4 py-3 font-semibold">Stay Dates</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Amount</th>
                <th className="px-4 py-3 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((reservation) => (
                <tr key={reservation.reservation_id} className="border-t border-slate-100">
                  <td className="px-4 py-3">
                    <p className="font-semibold text-slate-900">{reservation.reservation_code}</p>
                    <p className="text-xs text-slate-500">{formatDateTime(reservation.created_at)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="font-medium text-slate-800">{reservation.guest?.name || "-"}</p>
                    <p className="text-xs text-slate-500">{reservation.guest?.email || "-"}</p>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    <p>{formatDate(reservation.check_in_date)}</p>
                    <p className="text-xs text-slate-500">to {formatDate(reservation.check_out_date)}</p>
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
                    <p className="font-semibold text-slate-900">{formatPeso(reservation.total_amount)}</p>
                    <p className="text-xs text-slate-500">Paid: {formatPeso(reservation.amount_paid_verified)}</p>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => void openDetails(reservation.reservation_id)}
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition hover:border-blue-300 hover:text-blue-700"
                    >
                      View details
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-600">
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

      {(detailsLoading || details || detailsError) && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/50 p-0 md:items-center md:p-4">
          <div className="max-h-[92vh] w-full overflow-auto rounded-t-2xl border border-blue-100 bg-white p-4 md:max-w-3xl md:rounded-2xl">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-lg font-semibold text-slate-900">{details?.reservation_code ?? "Reservation details"}</h3>
              <button
                type="button"
                onClick={() => {
                  setDetails(null);
                  setDetailsError(null);
                  setDetailsAiRecommendation(null);
                  setDetailsAiError(null);
                  setDetailsAiLoading(false);
                }}
                aria-label="Close"
                className="h-8 w-8 rounded-lg border border-slate-300 text-slate-600"
              >
                x
              </button>
            </div>

            {detailsLoading ? <p className="text-sm text-slate-600">Loading details...</p> : null}
            {detailsError ? <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{detailsError}</p> : null}

            {details ? (
              <div className="space-y-4">
                <section className="rounded-xl border border-blue-100 bg-blue-50/40 p-3">
                  <h4 className="text-sm font-semibold text-slate-900">Admin status patch</h4>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <label className="grid gap-1 text-xs text-slate-600">
                      Status
                      <select
                        value={statusPatchValue}
                        onChange={(event) => setStatusPatchValue(event.target.value as ReservationStatus)}
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      >
                        <option value="draft">draft</option>
                        <option value="pending_payment">pending_payment</option>
                        <option value="escrow_locked">escrow_locked</option>
                        <option value="for_verification">for_verification</option>
                        <option value="confirmed">confirmed</option>
                        <option value="checked_in">checked_in</option>
                        <option value="checked_out">checked_out</option>
                        <option value="cancelled">cancelled</option>
                        <option value="no_show">no_show</option>
                      </select>
                    </label>
                    <label className="grid gap-1 text-xs text-slate-600">
                      Notes
                      <input
                        type="text"
                        value={statusPatchNotes}
                        onChange={(event) => setStatusPatchNotes(event.target.value)}
                        placeholder="Optional notes"
                        className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                      />
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={() => void patchReservationStatus()}
                    disabled={statusPatchBusy}
                    className="mt-3 rounded-lg border border-blue-700 bg-blue-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {statusPatchBusy ? "Updating..." : "Update status"}
                  </button>
                </section>

                {detailsAiLoading ? <p className="text-sm text-slate-600">Loading AI pricing insight...</p> : null}
                {detailsAiError ? (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                    AI pricing insight unavailable: {detailsAiError}
                  </p>
                ) : null}
                {detailsAiRecommendation ? (
                  <section className="rounded-xl border border-blue-100 bg-blue-50/40 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-sm font-semibold text-blue-900">AI Pricing Insight</h4>
                      <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-800">
                        {getAiSource(detailsAiRecommendation) === "fallback" ? "fallback" : "live"}
                      </span>
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <p className="text-xs text-slate-700">
                        Suggested adjustment:{" "}
                        <strong>
                          {Number(detailsAiRecommendation.pricing_adjustment) > 0 ? "+" : ""}
                          {formatPeso(detailsAiRecommendation.pricing_adjustment)}
                        </strong>
                      </p>
                      <p className="text-xs text-slate-700">
                        Confidence: <strong>{Math.round(Number(detailsAiRecommendation.confidence) * 100)}%</strong>
                      </p>
                    </div>
                    {detailsAiRecommendation.explanations.length > 0 ? (
                      <ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-slate-600">
                        {detailsAiRecommendation.explanations.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    ) : null}
                  </section>
                ) : null}

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="text-xs text-slate-500">Guest</p>
                    <p className="font-medium text-slate-900">{details.guest?.name || "-"}</p>
                    <p className="text-sm text-slate-600">{details.guest?.email || "-"}</p>
                    <p className="text-sm text-slate-600">{details.guest?.phone || "-"}</p>
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="text-xs text-slate-500">Stay</p>
                    <p className="font-medium text-slate-900">
                      {formatDate(details.check_in_date)} to {formatDate(details.check_out_date)}
                    </p>
                    <p className="text-sm text-slate-600">Total: {formatPeso(details.total_amount)}</p>
                    <p className="text-sm text-slate-600">Balance: {formatPeso(details.balance_due)}</p>
                  </div>
                </div>

                {details.units && details.units.length > 0 ? (
                  <section>
                    <h4 className="mb-2 text-sm font-semibold text-slate-900">Units</h4>
                    <div className="space-y-2">
                      {details.units.map((unitRow) => (
                        <div key={unitRow.reservation_unit_id} className="rounded-lg border border-slate-200 p-3">
                          <p className="font-medium text-slate-900">{unitRow.unit?.name || "Unit"}</p>
                          <p className="text-sm text-slate-600">
                            {unitRow.quantity_or_nights} night(s) × {formatPeso(unitRow.rate_snapshot)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}

                {details.service_bookings && details.service_bookings.length > 0 ? (
                  <section>
                    <h4 className="mb-2 text-sm font-semibold text-slate-900">Tours</h4>
                    <div className="space-y-2">
                      {details.service_bookings.map((tourRow) => (
                        <div key={tourRow.service_booking_id} className="rounded-lg border border-slate-200 p-3">
                          <p className="font-medium text-slate-900">{tourRow.service?.service_name || "Tour service"}</p>
                          <p className="text-sm text-slate-600">
                            {formatDate(tourRow.visit_date)} • Adults {tourRow.adult_qty} • Kids {tourRow.kid_qty}
                          </p>
                          <p className="text-sm font-semibold text-slate-800">{formatPeso(tourRow.total_amount)}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                ) : null}

                {details.notes ? (
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="text-xs text-slate-500">Notes</p>
                    <p className="text-sm text-slate-700">{details.notes}</p>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
