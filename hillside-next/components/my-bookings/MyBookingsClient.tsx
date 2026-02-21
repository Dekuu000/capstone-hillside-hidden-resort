"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import type {
  MyBookingsCursor as Cursor,
  MyBookingsResponse as BookingsResponse,
  MyBookingsTab as TabKey,
  PricingRecommendation,
  QrToken,
  ReservationListItem as Booking,
} from "../../../packages/shared/src/types";
import {
  myBookingsResponseSchema,
  pricingRecommendationSchema,
  qrTokenSchema,
  reservationCancelResponseSchema,
  reservationListItemSchema,
} from "../../../packages/shared/src/schemas";
import { apiFetch } from "../../lib/apiClient";
import { getSupabaseBrowserClient } from "../../lib/supabase";

type MyBookingsClientProps = {
  initialToken?: string | null;
  initialSessionEmail?: string | null;
  initialData?: BookingsResponse | null;
};

const TAB_LABELS: Record<TabKey, string> = {
  upcoming: "Upcoming",
  pending_payment: "Pending Payment",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATUS_BADGE_CLASS: Record<string, string> = {
  pending_payment: "bg-yellow-100 text-yellow-800",
  for_verification: "bg-blue-100 text-blue-800",
  confirmed: "bg-emerald-100 text-emerald-800",
  checked_in: "bg-indigo-100 text-indigo-800",
  checked_out: "bg-slate-200 text-slate-700",
  cancelled: "bg-red-100 text-red-800",
  no_show: "bg-red-100 text-red-800",
};

function formatPeso(value: number | null | undefined) {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function formatDate(value?: string | null) {
  if (!value) return "-";
  const date = new Date(`${value}T00:00:00`);
  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function parseJwtSub(token: string | null): string | null {
  if (!token) return null;
  try {
    const segment = token.split(".")[1];
    if (!segment) return null;
    const normalized = segment.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const payload = JSON.parse(atob(padded)) as { sub?: string };
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

function getAiSource(recommendation: PricingRecommendation | null) {
  if (!recommendation) return null;
  const explains = recommendation.explanations.map((item) => item.toLowerCase());
  return explains.some((item) => item.includes("fallback")) ? "fallback" : "live";
}

export function MyBookingsClient({
  initialToken = null,
  initialSessionEmail = null,
  initialData = null,
}: MyBookingsClientProps) {
  const token = initialToken;
  const sessionEmail = initialSessionEmail;

  const [tab, setTab] = useState<TabKey>("upcoming");
  const [searchInput, setSearchInput] = useState("");
  const [searchValue, setSearchValue] = useState("");

  const [items, setItems] = useState<Booking[]>(initialData?.items ?? []);
  const [nextCursor, setNextCursor] = useState<Cursor | null>(initialData?.nextCursor ?? null);
  const [totalCount, setTotalCount] = useState(initialData?.totalCount ?? 0);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const didUseInitialUpcomingDataRef = useRef(false);

  const [details, setDetails] = useState<Booking | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [detailsAiRecommendation, setDetailsAiRecommendation] = useState<PricingRecommendation | null>(null);
  const [detailsAiLoading, setDetailsAiLoading] = useState(false);
  const [detailsAiError, setDetailsAiError] = useState<string | null>(null);

  const [submitFor, setSubmitFor] = useState<Booking | null>(null);
  const [submitAmount, setSubmitAmount] = useState("");
  const [submitReferenceNo, setSubmitReferenceNo] = useState("");
  const [submitProofMode, setSubmitProofMode] = useState<"file" | "url">("file");
  const [submitProofFile, setSubmitProofFile] = useState<File | null>(null);
  const [submitProofUrl, setSubmitProofUrl] = useState("");
  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [cancelFor, setCancelFor] = useState<Booking | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  const [qrFor, setQrFor] = useState<Booking | null>(null);
  const [qrToken, setQrToken] = useState<QrToken | null>(null);
  const [qrBusy, setQrBusy] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [qrSecondsLeft, setQrSecondsLeft] = useState(0);

  const [actionMessage, setActionMessage] = useState<string | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => setSearchValue(searchInput.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  const fetchBookings = useCallback(
    async (cursor: Cursor | null, mode: "replace" | "append") => {
      if (!token) return;
      const currentRequestId = ++requestIdRef.current;
      if (mode === "replace") setLoading(true);
      if (mode === "append") setLoadingMore(true);
      setError(null);

      try {
        const qs = new URLSearchParams();
        qs.set("tab", tab);
        qs.set("limit", "10");
        if (searchValue) qs.set("search", searchValue);
        if (cursor) {
          qs.set("cursor_created_at", cursor.createdAt);
          qs.set("cursor_reservation_id", cursor.reservationId);
          if (cursor.checkInDate) qs.set("cursor_check_in_date", cursor.checkInDate);
        }

        const data = await apiFetch<BookingsResponse>(
          `/v2/me/bookings?${qs.toString()}`,
          { method: "GET" },
          token,
          myBookingsResponseSchema,
        );
        if (requestIdRef.current !== currentRequestId) return;

        setItems((prev) => (mode === "replace" ? (data.items ?? []) : [...prev, ...(data.items ?? [])]));
        setNextCursor(data.nextCursor ?? null);
        setTotalCount(data.totalCount ?? 0);
      } catch (unknownError) {
        if (requestIdRef.current !== currentRequestId) return;
        setError(unknownError instanceof Error ? unknownError.message : "Failed to load bookings.");
      } finally {
        if (requestIdRef.current === currentRequestId) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [searchValue, tab, token],
  );

  useEffect(() => {
    if (!token) {
      setItems([]);
      setNextCursor(null);
      setTotalCount(0);
      return;
    }
    // Skip one fetch on first render when SSR already provided upcoming data.
    // Subsequent tab switches should always fetch fresh data.
    if (!didUseInitialUpcomingDataRef.current && initialData && !searchValue && tab === "upcoming") {
      didUseInitialUpcomingDataRef.current = true;
      return;
    }
    void fetchBookings(null, "replace");
  }, [token, tab, searchValue, fetchBookings, initialData]);

  const openDetails = useCallback(
    async (reservationId: string) => {
      if (!token) return;
      setDetailsLoading(true);
      setDetailsError(null);
      setDetailsAiRecommendation(null);
      setDetailsAiError(null);
      setDetailsAiLoading(false);
      try {
        const data = await apiFetch<Booking>(
          `/v2/me/bookings/${encodeURIComponent(reservationId)}`,
          { method: "GET" },
          token,
          reservationListItemSchema,
        );
        setDetails(data);

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
        setDetailsError(unknownError instanceof Error ? unknownError.message : "Failed to load booking details.");
      } finally {
        setDetailsLoading(false);
      }
    },
    [token],
  );

  const uploadProofIfNeeded = useCallback(
    async (reservationId: string): Promise<string | null> => {
      if (submitProofMode === "url") {
        return submitProofUrl.trim() || null;
      }

      if (!submitProofFile) return null;

      const userId = parseJwtSub(token);
      if (!userId) {
        throw new Error("Unable to identify current user for proof upload.");
      }

      const ext = submitProofFile.name.split(".").pop()?.toLowerCase() || "jpg";
      const storagePath = `payments/${userId}/${reservationId}-${crypto.randomUUID()}.${ext}`;
      const supabase = getSupabaseBrowserClient();

      const { error } = await supabase.storage
        .from("payment-proofs")
        .upload(storagePath, submitProofFile, { upsert: false });
      if (error) {
        throw error;
      }

      return storagePath;
    },
    [submitProofFile, submitProofMode, submitProofUrl, token],
  );

  const submitPayment = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      if (!token || !submitFor) return;

      const amount = Number(submitAmount);
      if (!Number.isFinite(amount) || amount <= 0) {
        setSubmitError("Amount must be greater than zero.");
        return;
      }
      const hasProofUrl = submitProofMode === "url" && Boolean(submitProofUrl.trim());
      const hasProofFile = submitProofMode === "file" && Boolean(submitProofFile);

      if (submitProofMode === "url" && !hasProofUrl) {
        setSubmitError("Proof URL is required.");
        return;
      }
      if (submitProofMode === "file" && !hasProofFile) {
        setSubmitError("Payment proof file is required.");
        return;
      }

      setSubmitBusy(true);
      setSubmitError(null);

      try {
        await apiFetch(
          "/v2/payments/intent",
          {
            method: "POST",
            body: JSON.stringify({
              reservation_id: submitFor.reservation_id,
              amount,
            }),
          },
          token,
        );

        const proofPath = await uploadProofIfNeeded(submitFor.reservation_id);

        await apiFetch(
          "/v2/payments/submissions",
          {
            method: "POST",
            body: JSON.stringify({
              reservation_id: submitFor.reservation_id,
              amount,
              payment_type: amount >= (submitFor.total_amount ?? 0) ? "full" : "deposit",
              method: "gcash",
              reference_no: submitReferenceNo.trim() || null,
              proof_url: proofPath,
              idempotency_key: crypto.randomUUID(),
            }),
          },
          token,
        );

        setActionMessage("Payment submitted for verification.");
        setSubmitFor(null);
        setSubmitAmount("");
        setSubmitReferenceNo("");
        setSubmitProofMode("file");
        setSubmitProofFile(null);
        setSubmitProofUrl("");
        await fetchBookings(null, "replace");
      } catch (unknownError) {
        setSubmitError(unknownError instanceof Error ? unknownError.message : "Failed to submit payment.");
      } finally {
        setSubmitBusy(false);
      }
    },
    [
      fetchBookings,
      submitAmount,
      submitFor,
      submitProofFile,
      submitProofMode,
      submitProofUrl,
      submitReferenceNo,
      token,
      uploadProofIfNeeded,
    ],
  );

  const confirmCancel = useCallback(async () => {
    if (!token || !cancelFor) return;
    setCancelBusy(true);
    setCancelError(null);
    try {
      await apiFetch(
        `/v2/reservations/${encodeURIComponent(cancelFor.reservation_id)}/cancel`,
        {
          method: "POST",
          body: JSON.stringify({}),
        },
        token,
        reservationCancelResponseSchema,
      );
      setActionMessage("Booking cancelled.");
      setCancelFor(null);
      await fetchBookings(null, "replace");
    } catch (unknownError) {
      setCancelError(unknownError instanceof Error ? unknownError.message : "Failed to cancel booking.");
    } finally {
      setCancelBusy(false);
    }
  }, [cancelFor, fetchBookings, token]);

  const issueCheckinQr = useCallback(
    async (reservationId: string) => {
      if (!token) return;
      setQrBusy(true);
      setQrError(null);
      try {
        const data = await apiFetch<QrToken>(
          "/v2/qr/issue",
          {
            method: "POST",
            body: JSON.stringify({
              reservation_id: reservationId,
            }),
          },
          token,
          qrTokenSchema,
        );
        setQrToken(data);
      } catch (unknownError) {
        setQrToken(null);
        setQrError(unknownError instanceof Error ? unknownError.message : "Failed to issue check-in QR token.");
      } finally {
        setQrBusy(false);
      }
    },
    [token],
  );

  const copyQrPayload = useCallback(async () => {
    if (!qrToken) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(qrToken, null, 2));
      setActionMessage("QR payload copied.");
    } catch {
      setActionMessage("Unable to copy QR payload.");
    }
  }, [qrToken]);

  useEffect(() => {
    if (!qrFor?.reservation_id || !token) return;
    void issueCheckinQr(qrFor.reservation_id);

    const refreshInterval = window.setInterval(() => {
      void issueCheckinQr(qrFor.reservation_id);
    }, 20000);

    return () => window.clearInterval(refreshInterval);
  }, [issueCheckinQr, qrFor?.reservation_id, token]);

  useEffect(() => {
    if (!qrToken?.expires_at) {
      setQrSecondsLeft(0);
      return;
    }
    const update = () => {
      const diffMs = new Date(qrToken.expires_at).getTime() - Date.now();
      setQrSecondsLeft(Math.max(0, Math.ceil(diffMs / 1000)));
    };
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [qrToken?.expires_at]);

  const closeSubmitModal = useCallback(() => {
    setSubmitFor(null);
    setSubmitAmount("");
    setSubmitReferenceNo("");
    setSubmitProofMode("file");
    setSubmitProofFile(null);
    setSubmitProofUrl("");
    setSubmitError(null);
  }, []);

  const canLoadMore = Boolean(nextCursor) && !loadingMore;
  const detailUnits = details?.units ?? [];
  const detailTours = details?.service_bookings ?? [];
  const detailAiSource = getAiSource(detailsAiRecommendation);
  const detailAiAdjustment = Number(detailsAiRecommendation?.pricing_adjustment ?? 0);
  const detailAiConfidencePct = Math.round(Number(detailsAiRecommendation?.confidence ?? 0) * 100);
  const qrCodeValue = qrToken ? JSON.stringify(qrToken) : "";
  const qrPayload = qrToken ? JSON.stringify(qrToken, null, 2) : "";

  const now = useMemo(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }, []);

  if (!token) {
    return (
      <section className="mx-auto w-full max-w-5xl">
        <h1 className="text-3xl font-bold text-slate-900">My Bookings</h1>
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          No active session found. Sign in first, then reopen this page.
        </p>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-5xl">
      <div className="mb-5">
        <h1 className="text-3xl font-bold text-slate-900">My Bookings</h1>
        <p className="mt-1 text-sm text-slate-600">
          Signed in as <strong>{sessionEmail ?? "guest"}</strong>
        </p>
      </div>

      <div className="mb-3 flex flex-wrap gap-2">
        {(Object.keys(TAB_LABELS) as TabKey[]).map((key) => (
          <button
            key={key}
            type="button"
            className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
              tab === key
                ? "border-blue-700 bg-blue-700 text-white"
                : "border-slate-300 bg-white text-slate-700 hover:border-blue-300 hover:text-blue-700"
            }`}
            onClick={() => setTab(key)}
          >
            {TAB_LABELS[key]}
          </button>
        ))}
      </div>

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          type="text"
          value={searchInput ?? ""}
          onChange={(event) => setSearchInput(event.target.value)}
          placeholder="Search by reservation code, unit, or service"
          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-blue-200 transition focus:ring-2 sm:max-w-md"
        />
        <span className="text-xs text-slate-500">
          Showing {items.length} of {totalCount}
        </span>
      </div>

      {actionMessage ? (
        <p className="mb-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{actionMessage}</p>
      ) : null}
      {error ? (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>
      ) : null}
      {loading ? <p className="text-sm text-slate-600">Loading bookings...</p> : null}

      {!loading && items.length === 0 ? (
        <div className="rounded-xl border border-blue-100 bg-white p-4 shadow-sm">
          <p className="text-sm text-slate-700">No bookings found for this tab.</p>
        </div>
      ) : null}

      <div className="grid gap-4">
        {items.map((booking) => {
          const paid = Number(booking.amount_paid_verified ?? 0);
          const total = Number(booking.total_amount ?? 0);
          const remaining = Math.max(0, total - paid);
          const statusClass = STATUS_BADGE_CLASS[booking.status] ?? STATUS_BADGE_CLASS.checked_out;
          const isTour = (booking.service_bookings?.length ?? 0) > 0;
          const checkInDate = new Date(`${booking.check_in_date}T00:00:00`);
          const canCancel = ["pending_payment", "for_verification", "confirmed"].includes(booking.status) && checkInDate > now;
          const canShowQr = ["pending_payment", "for_verification", "confirmed", "checked_in"].includes(booking.status);

          return (
            <article key={booking.reservation_id} className="rounded-xl border border-blue-100 bg-white p-4 shadow-sm">
              <div className="flex flex-col justify-between gap-3 sm:flex-row">
                <div>
                  <h2 className="text-xl font-semibold text-slate-900">{booking.reservation_code}</h2>
                  <p className="text-xs text-slate-500">Booked on {formatDateTime(booking.created_at)}</p>
                </div>
                <div className="flex flex-col gap-2 sm:items-end">
                  <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold tracking-wide ${statusClass}`}>
                    {booking.status.replace(/_/g, " ").toUpperCase()}
                  </span>
                  <p className="text-2xl font-bold text-blue-900">{formatPeso(total)}</p>
                </div>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <span className="block text-xs text-slate-500">Check-in</span>
                  <p className="text-sm font-medium text-slate-800">{formatDate(booking.check_in_date)}</p>
                </div>
                <div>
                  <span className="block text-xs text-slate-500">Check-out</span>
                  <p className="text-sm font-medium text-slate-800">{formatDate(booking.check_out_date)}</p>
                </div>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div>
                  <span className="block text-xs text-slate-500">Amount Paid (Verified)</span>
                  <p className="text-sm font-semibold text-emerald-700">{formatPeso(paid)}</p>
                </div>
                <div>
                  <span className="block text-xs text-slate-500">Remaining Balance</span>
                  <p className="text-sm font-semibold text-orange-700">{formatPeso(remaining)}</p>
                </div>
              </div>

              <div className="mt-3">
                <span className="inline-flex items-center rounded-full bg-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                  {isTour ? "Tour Reservation" : "Room/Cottage Reservation"}
                </span>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {canShowQr ? (
                  <button
                    type="button"
                    onClick={() => {
                      setQrFor(booking);
                      setQrToken(null);
                      setQrError(null);
                      setQrSecondsLeft(0);
                    }}
                    className="rounded-lg border border-blue-700 bg-white px-3 py-2 text-sm font-semibold text-blue-700 transition hover:bg-blue-50"
                  >
                    Show check-in QR
                  </button>
                ) : null}

                <button
                  type="button"
                  onClick={() => void openDetails(booking.reservation_id)}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-blue-300 hover:text-blue-700"
                >
                  View details
                </button>

                {booking.status === "pending_payment" ? (
                  <button
                    type="button"
                    className="rounded-lg border border-blue-700 bg-blue-700 px-3 py-2 text-sm font-semibold text-white transition hover:bg-blue-800"
                    onClick={() => {
                      setSubmitFor(booking);
                      setSubmitAmount(String(booking.expected_pay_now ?? 0));
                      setSubmitReferenceNo("");
                      setSubmitProofMode("file");
                      setSubmitProofFile(null);
                      setSubmitProofUrl("");
                      setSubmitError(null);
                    }}
                  >
                    Submit payment
                  </button>
                ) : null}

                {canCancel ? (
                  <button
                    type="button"
                    className="rounded-lg border border-red-600 bg-red-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-red-700"
                    onClick={() => setCancelFor(booking)}
                  >
                    Cancel booking
                  </button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>

      {canLoadMore ? (
        <div className="mt-2 flex justify-center">
          <button
            type="button"
            onClick={() => void fetchBookings(nextCursor, "append")}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:border-blue-300 hover:text-blue-700 disabled:opacity-60"
            disabled={loadingMore}
          >
            {loadingMore ? "Loading..." : "Load more"}
          </button>
        </div>
      ) : null}

      {(detailsLoading || details) && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/50 p-0 md:items-center md:p-4">
          <div className="max-h-[92vh] w-full overflow-auto rounded-t-2xl border border-blue-100 bg-white p-4 md:max-w-2xl md:rounded-2xl">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-lg font-semibold text-slate-900">{details?.reservation_code ?? "Loading..."}</h3>
              <button
                type="button"
                onClick={() => {
                  setDetails(null);
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
            {detailsError ? <p className="mb-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{detailsError}</p> : null}

            {details ? (
              <div className="space-y-4">
                <p className="text-xs text-slate-500">Status: {details.status.replace(/_/g, " ")}</p>
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
                        {detailAiSource === "fallback" ? "fallback" : "live"}
                      </span>
                    </div>
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <p className="text-xs text-slate-700">
                        Suggested adjustment:{" "}
                        <strong>
                          {detailAiAdjustment > 0 ? "+" : ""}
                          {formatPeso(detailAiAdjustment)}
                        </strong>
                      </p>
                      <p className="text-xs text-slate-700">
                        Confidence: <strong>{detailAiConfidencePct}%</strong>
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

                {detailUnits.length > 0 ? (
                  <section>
                    <h4 className="mb-2 text-sm font-semibold text-slate-900">Units</h4>
                    {detailUnits.map((row) => (
                      <div key={row.reservation_unit_id} className="mb-2 rounded-lg border border-slate-200 p-3">
                        <div>
                          <strong>{row.unit?.name ?? "Unit"}</strong>
                          <p className="text-xs text-slate-500">
                            {row.quantity_or_nights} night(s) x {formatPeso(row.rate_snapshot)}
                          </p>
                          {row.unit?.amenities?.length ? <p className="text-xs text-slate-500">Amenities: {row.unit.amenities.join(", ")}</p> : null}
                        </div>
                        <p className="mt-2 text-sm font-semibold text-slate-800">{formatPeso(row.quantity_or_nights * row.rate_snapshot)}</p>
                      </div>
                    ))}
                  </section>
                ) : null}

                {detailTours.length > 0 ? (
                  <section>
                    <h4 className="mb-2 text-sm font-semibold text-slate-900">Tours</h4>
                    {detailTours.map((row) => (
                      <div key={row.service_booking_id} className="mb-2 rounded-lg border border-slate-200 p-3">
                        <div>
                          <strong>{row.service?.service_name ?? "Tour service"}</strong>
                          <p className="text-xs text-slate-500">Date: {formatDate(row.visit_date)}</p>
                        </div>
                        <p className="mt-2 text-sm font-semibold text-slate-800">{formatPeso(row.total_amount)}</p>
                      </div>
                    ))}
                  </section>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      )}

      {submitFor ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/50 p-0 md:items-center md:p-4">
          <div className="max-h-[92vh] w-full overflow-auto rounded-t-2xl border border-blue-100 bg-white p-4 md:max-w-xl md:rounded-2xl">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-lg font-semibold text-slate-900">Submit payment proof</h3>
              <button
                type="button"
                onClick={closeSubmitModal}
                aria-label="Close"
                className="h-8 w-8 rounded-lg border border-slate-300 text-slate-600"
              >
                x
              </button>
            </div>
            <form className="grid gap-3" onSubmit={submitPayment}>
              <label className="grid gap-1 text-sm text-slate-700">
                Amount
                <input
                  type="number"
                  min={1}
                  value={submitAmount ?? ""}
                  onChange={(event) => setSubmitAmount(event.target.value)}
                  required
                  className="rounded-lg border border-slate-300 px-3 py-2 outline-none ring-blue-200 transition focus:ring-2"
                />
              </label>
              <label className="grid gap-1 text-sm text-slate-700">
                Reference number
                <input
                  type="text"
                  value={submitReferenceNo ?? ""}
                  onChange={(event) => setSubmitReferenceNo(event.target.value)}
                  placeholder="Reference number (optional)"
                  className="rounded-lg border border-slate-300 px-3 py-2 outline-none ring-blue-200 transition focus:ring-2"
                />
              </label>

              <div className="grid gap-2">
                <p className="text-sm text-slate-700">Payment proof</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSubmitProofMode("file")}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
                      submitProofMode === "file"
                        ? "border-blue-700 bg-blue-700 text-white"
                        : "border-slate-300 bg-white text-slate-700"
                    }`}
                  >
                    Upload file
                  </button>
                  <button
                    type="button"
                    onClick={() => setSubmitProofMode("url")}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
                      submitProofMode === "url"
                        ? "border-blue-700 bg-blue-700 text-white"
                        : "border-slate-300 bg-white text-slate-700"
                    }`}
                  >
                    Proof URL
                  </button>
                </div>

                {submitProofMode === "file" ? (
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={(event) => setSubmitProofFile(event.target.files?.[0] ?? null)}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                  />
                ) : (
                  <input
                    type="url"
                    value={submitProofUrl ?? ""}
                    onChange={(event) => setSubmitProofUrl(event.target.value)}
                    placeholder="https://..."
                    required={submitProofMode === "url"}
                    className="rounded-lg border border-slate-300 px-3 py-2 outline-none ring-blue-200 transition focus:ring-2"
                  />
                )}
              </div>
              {submitError ? <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{submitError}</p> : null}
              <div className="mt-1 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={closeSubmitModal}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded-lg border border-blue-700 bg-blue-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  disabled={submitBusy}
                >
                  {submitBusy ? "Submitting..." : "Submit"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {qrFor ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/50 p-0 md:items-center md:p-4">
          <div className="max-h-[92vh] w-full overflow-auto rounded-t-2xl border border-blue-100 bg-white p-4 md:max-w-2xl md:rounded-2xl">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-lg font-semibold text-slate-900">Check-in QR Token</h3>
              <button
                type="button"
                onClick={() => {
                  setQrFor(null);
                  setQrToken(null);
                  setQrError(null);
                  setQrSecondsLeft(0);
                }}
                aria-label="Close"
                className="h-8 w-8 rounded-lg border border-slate-300 text-slate-600"
              >
                x
              </button>
            </div>

            <p className="text-sm text-slate-600">
              Reservation: <strong>{qrFor.reservation_code}</strong>
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Token rotates automatically every ~30 seconds. Share this payload with the admin scanner.
            </p>

            {qrError ? <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{qrError}</p> : null}
            {qrBusy ? <p className="mt-3 text-sm text-slate-600">Generating token...</p> : null}

            {qrToken ? (
              <>
                <div className="mt-3 grid gap-2 text-xs text-slate-600 sm:grid-cols-2">
                  <p>
                    Expires: <strong>{formatDateTime(qrToken.expires_at)}</strong>
                  </p>
                  <p>
                    Seconds left: <strong>{qrSecondsLeft}</strong>
                  </p>
                </div>
                <div className="mt-3 flex justify-center rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <QRCodeSVG value={qrCodeValue} size={220} level="M" includeMargin />
                </div>

                <textarea
                  readOnly
                  value={qrPayload}
                  className="mt-3 min-h-[200px] w-full rounded-lg border border-slate-300 bg-slate-50 p-3 font-mono text-xs text-slate-800"
                />
              </>
            ) : null}

            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => void issueCheckinQr(qrFor.reservation_id)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
                disabled={qrBusy}
              >
                Refresh now
              </button>
              <button
                type="button"
                onClick={() => void copyQrPayload()}
                className="rounded-lg border border-blue-700 bg-blue-700 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                disabled={!qrToken}
              >
                Copy payload
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {cancelFor ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/50 p-0 md:items-center md:p-4">
          <div className="max-h-[92vh] w-full overflow-auto rounded-t-2xl border border-blue-100 bg-white p-4 md:max-w-md md:rounded-2xl">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-lg font-semibold text-slate-900">Cancel booking?</h3>
              <button
                type="button"
                onClick={() => setCancelFor(null)}
                aria-label="Close"
                className="h-8 w-8 rounded-lg border border-slate-300 text-slate-600"
              >
                x
              </button>
            </div>
            <p className="text-sm text-slate-600">This booking will be cancelled and removed from active flow.</p>
            {cancelError ? <p className="mt-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{cancelError}</p> : null}
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setCancelFor(null)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700"
              >
                Keep booking
              </button>
              <button
                type="button"
                className="rounded-lg border border-red-600 bg-red-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                onClick={() => void confirmCancel()}
                disabled={cancelBusy}
              >
                {cancelBusy ? "Cancelling..." : "Cancel booking"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
