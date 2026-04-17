"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { Search, X } from "lucide-react";
import type {
  MyBookingsCursor as Cursor,
  MyBookingsResponse as BookingsResponse,
  MyBookingsTab as TabKey,
  PaymentSubmissionResponse,
  PricingRecommendation,
  QrToken,
  ReservationListItem as Booking,
} from "../../../packages/shared/src/types";
import {
  paymentSubmissionResponseSchema,
  myBookingsResponseSchema,
  pricingRecommendationSchema,
  qrTokenSchema,
  reservationCancelResponseSchema,
  reservationListItemSchema,
} from "../../../packages/shared/src/schemas";
import { apiFetch } from "../../lib/apiClient";
import { loadLastIssuedQrToken, saveLastIssuedQrToken } from "../../lib/guestQrTokenCache";
import { syncAwareMutation } from "../../lib/offlineSync/mutation";
import { queuePaymentSubmissionWithFile } from "../../lib/offlineSync/paymentSubmission";
import { loadBookingsSnapshot, saveBookingsSnapshot } from "../../lib/offlineSync/store";
import { getSupabaseBrowserClient } from "../../lib/supabase";
import { compactQrTokenPayload } from "../../lib/qrPayload";
import { AIPricingInsightCard } from "../ai/AIPricingInsightCard";
import { ImageLightbox } from "../shared/ImageLightbox";
import { GcashPaymentGuide } from "../shared/GcashPaymentGuide";
import { UnitImageGallery } from "../shared/UnitImageGallery";
import { normalizeUnitImageUrls, normalizeUnitThumbUrls } from "../../lib/unitMedia";

type MyBookingsClientProps = {
  initialToken?: string | null;
  initialSessionEmail?: string | null;
  initialData?: BookingsResponse | null;
};

const TAB_LABELS: Record<TabKey, string> = {
  upcoming: "Upcoming",
  pending_payment: "Payment Due",
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

function formatCachedAt(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString();
}

function toTitleCase(value: string) {
  return value.replace(/\b\w/g, (char) => char.toUpperCase());
}

function getPaymentStateMeta(totalAmount: number, amountPaid: number) {
  const remaining = Math.max(0, totalAmount - amountPaid);
  if (remaining <= 0 && totalAmount > 0) {
    return {
      label: "Paid",
      className: "bg-emerald-100 text-emerald-800",
    };
  }
  if (amountPaid > 0 && remaining > 0) {
    return {
      label: "Partial",
      className: "bg-amber-100 text-amber-800",
    };
  }
  return {
    label: "Payment Due",
    className: "bg-orange-100 text-orange-800",
  };
}

function canShowQrForBooking(status: string) {
  return ["pending_payment", "for_verification", "confirmed", "checked_in"].includes(status);
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
  const [qrFromCache, setQrFromCache] = useState(false);
  const [networkOnline, setNetworkOnline] = useState(true);

  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionHasSyncCta, setActionHasSyncCta] = useState(false);
  const [cachedViewMeta, setCachedViewMeta] = useState<string | null>(null);
  const [detailGalleryImages, setDetailGalleryImages] = useState<string[]>([]);
  const [detailGalleryThumbs, setDetailGalleryThumbs] = useState<string[]>([]);
  const [detailGalleryTitle, setDetailGalleryTitle] = useState("Unit photos");
  const [detailGalleryIndex, setDetailGalleryIndex] = useState(0);
  const [detailGalleryOpen, setDetailGalleryOpen] = useState(false);
  const [detailLightboxOpen, setDetailLightboxOpen] = useState(false);

  const pushActionMessage = useCallback((message: string, withSyncCta = false) => {
    setActionMessage(message);
    setActionHasSyncCta(withSyncCta);
  }, []);

  useEffect(() => {
    const sync = () => setNetworkOnline(window.navigator.onLine);
    sync();
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => setSearchValue(searchInput.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  const fetchBookings = useCallback(
    async (cursor: Cursor | null, mode: "replace" | "append") => {
      if (!token) return;
      const currentRequestId = ++requestIdRef.current;
      const snapshotVariantKey = `${tab}::${searchValue || "__all__"}`;
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
        if (mode === "replace") {
          setCachedViewMeta(null);
          await saveBookingsSnapshot("me", data, { variantKey: snapshotVariantKey });
        }
      } catch (unknownError) {
        if (requestIdRef.current !== currentRequestId) return;
        if (mode === "replace") {
          const cached = await loadBookingsSnapshot("me", { variantKey: snapshotVariantKey });
          if (cached?.data) {
            setItems(cached.data.items ?? []);
            setNextCursor(cached.data.nextCursor ?? null);
            setTotalCount(cached.data.totalCount ?? 0);
            setCachedViewMeta(`Using cached data from ${formatCachedAt(cached.cached_at)}`);
            setError(null);
          } else {
            setError(unknownError instanceof Error ? unknownError.message : "Failed to load bookings.");
            setCachedViewMeta(null);
          }
        } else {
          setError(unknownError instanceof Error ? unknownError.message : "Failed to load bookings.");
        }
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
      setCachedViewMeta(null);
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

  useEffect(() => {
    if (!token || !initialData) return;
    const snapshotVariantKey = "upcoming::__all__";
    void saveBookingsSnapshot("me", initialData, { variantKey: snapshotVariantKey });
  }, [initialData, token]);

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
      const totalAmount = Number(submitFor.total_amount ?? 0);
      const amountPaid = Number(submitFor.amount_paid_verified ?? 0);
      const remainingAmount = Math.max(0, totalAmount - amountPaid);
      const depositRequired = Number(submitFor.deposit_required ?? 0);
      const expectedPayNow = Number(submitFor.expected_pay_now ?? 0);
      const requiresDepositFlow = depositRequired > 0;
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
      if (!requiresDepositFlow && remainingAmount > 0 && amount !== remainingAmount) {
        setSubmitError(`This booking requires full payment. Please submit ${formatPeso(remainingAmount)}.`);
        return;
      }

      setSubmitBusy(true);
      setSubmitError(null);

      try {
        const paymentType = requiresDepositFlow
          ? (amount >= totalAmount ? "full" : "deposit")
          : "full";
        if (submitProofMode === "file" && submitProofFile && typeof navigator !== "undefined" && !navigator.onLine) {
          const userId = parseJwtSub(token);
          if (!userId) {
            throw new Error("Unable to identify current user for offline proof queue.");
          }
          await queuePaymentSubmissionWithFile({
            userId,
            reservationId: submitFor.reservation_id,
            amount,
            paymentType,
            method: "gcash",
            referenceNo: submitReferenceNo,
            file: submitProofFile,
          });
          pushActionMessage("Payment proof saved offline and queued for sync.", true);
          setSubmitFor(null);
          setSubmitAmount("");
          setSubmitReferenceNo("");
          setSubmitProofMode("file");
          setSubmitProofFile(null);
          setSubmitProofUrl("");
          return;
        }

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
        const payload = {
          reservation_id: submitFor.reservation_id,
          amount,
          payment_type: paymentType,
          method: "gcash",
          reference_no: submitReferenceNo.trim() || null,
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

        pushActionMessage(
          outcome.mode === "queued"
            ? "Payment saved offline and queued for verification sync."
            : "Payment submitted for verification.",
          outcome.mode === "queued",
        );
        setSubmitFor(null);
        setSubmitAmount("");
        setSubmitReferenceNo("");
        setSubmitProofMode("file");
        setSubmitProofFile(null);
        setSubmitProofUrl("");
        if (outcome.mode === "online") {
          await fetchBookings(null, "replace");
        }
      } catch (unknownError) {
        const rawMessage = unknownError instanceof Error ? unknownError.message : String(unknownError ?? "");
        const message = rawMessage || "Failed to submit payment.";
        if (rawMessage.toLowerCase().includes("deposit is not required")) {
          setSubmitError(
            `This booking requires full payment. Update amount to ${formatPeso(Math.max(0, Number(submitFor.total_amount ?? 0) - Number(submitFor.amount_paid_verified ?? 0)))} and submit again.`,
          );
        } else {
          setSubmitError(message);
        }
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
      pushActionMessage("Booking cancelled.");
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
        setQrFromCache(false);
        await saveLastIssuedQrToken({
          reservation_id: reservationId,
          reservation_code: qrFor?.reservation_code || "",
          token: data,
          cached_at: new Date().toISOString(),
        });
      } catch (unknownError) {
        setQrToken(null);
        setQrError(unknownError instanceof Error ? unknownError.message : "Failed to issue check-in QR token.");
      } finally {
        setQrBusy(false);
      }
    },
    [qrFor?.reservation_code, token],
  );

  const copyQrPayload = useCallback(async () => {
    if (!qrToken) return;
    try {
      await navigator.clipboard.writeText(JSON.stringify(compactQrTokenPayload(qrToken), null, 2));
      pushActionMessage("QR payload copied.");
    } catch {
      pushActionMessage("Unable to copy QR payload.");
    }
  }, [pushActionMessage, qrToken]);

  useEffect(() => {
    if (!qrFor?.reservation_id || !token) return;
    if (networkOnline) {
      void issueCheckinQr(qrFor.reservation_id);
      return;
    }
    void loadLastIssuedQrToken(qrFor.reservation_id).then((cached) => {
      if (!cached?.token) {
        setQrToken(null);
        setQrFromCache(false);
        setQrError("Offline: no cached token available yet. Connect once to load a token.");
        return;
      }
      setQrToken(cached.token);
      setQrFromCache(true);
      setQrError("Offline mode: showing last cached token. New token issuance requires internet.");
    });
  }, [issueCheckinQr, networkOnline, qrFor?.reservation_id, token]);

  useEffect(() => {
    if (!networkOnline || !qrFor?.reservation_id || !token || !qrToken?.expires_at) return;
    const expiresMs = new Date(qrToken.expires_at).getTime();
    const nowMs = Date.now();
    const refreshInMs = Math.max(5000, expiresMs - nowMs - 5000);
    const refreshTimer = window.setTimeout(() => {
      void issueCheckinQr(qrFor.reservation_id);
    }, refreshInMs);
    return () => window.clearTimeout(refreshTimer);
  }, [issueCheckinQr, networkOnline, qrFor?.reservation_id, qrToken?.expires_at, token]);

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
  const qrCodeValue = qrToken ? JSON.stringify(compactQrTokenPayload(qrToken)) : "";
  const qrPayload = qrToken ? JSON.stringify(compactQrTokenPayload(qrToken), null, 2) : "";
  const openUnitGallery = useCallback(
    (unit?: {
      name?: string | null;
      image_url?: string | null;
      image_urls?: string[] | null;
      image_thumb_urls?: string[] | null;
    } | null) => {
      const images = normalizeUnitImageUrls(unit?.image_urls, unit?.image_url);
      if (!images.length) return;
      setDetailGalleryImages(images);
      setDetailGalleryThumbs(normalizeUnitThumbUrls(images, unit?.image_thumb_urls ?? null));
      setDetailGalleryTitle(unit?.name || "Unit photos");
      setDetailGalleryIndex(0);
      setDetailGalleryOpen(true);
      setDetailLightboxOpen(false);
    },
    [],
  );

  const now = useMemo(() => {
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    return date;
  }, []);

  const summary = useMemo(() => {
    const upcomingCandidates = items
      .filter((booking) => !["checked_out", "cancelled", "no_show"].includes(booking.status))
      .sort((a, b) => {
        const left = new Date(`${a.check_in_date}T00:00:00`).getTime();
        const right = new Date(`${b.check_in_date}T00:00:00`).getTime();
        return left - right;
      });

    const nextBooking = upcomingCandidates[0] ?? null;
    const nextDate = nextBooking
      ? ((nextBooking.service_bookings?.[0]?.visit_date || nextBooking.check_in_date) ?? null)
      : null;
    const outstanding = upcomingCandidates.reduce((sum, booking) => {
      const paid = Number(booking.amount_paid_verified ?? 0);
      const total = Number(booking.total_amount ?? 0);
      return sum + Math.max(0, total - paid);
    }, 0);
    const qrReady = nextBooking ? canShowQrForBooking(nextBooking.status) : false;

    return {
      nextDate,
      outstanding,
      qrReady,
    };
  }, [items]);

  if (!token) {
    return (
      <section className="mx-auto w-full max-w-5xl">
        <header className="mb-4 rounded-3xl border border-slate-200/70 bg-gradient-to-br from-white via-slate-50 to-blue-50 p-6 shadow-sm">
          <h1 className="text-3xl font-bold text-slate-900">My Stay</h1>
          <p className="mt-2 text-sm text-slate-600">Track reservations, check-in QR, and payment status.</p>
        </header>
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          No active session found. Sign in first, then reopen this page.
        </p>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-5xl overflow-x-hidden">
      <header className="mb-6 rounded-3xl border border-slate-200/70 bg-gradient-to-br from-white via-slate-50 to-blue-50 p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Guest Portal</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">My Stay</h1>
            <p className="mt-2 text-sm text-slate-600">
              Signed in as <strong>{sessionEmail ?? "guest"}</strong>
            </p>
          </div>
          <div className="w-full rounded-xl border border-slate-200 bg-white/90 px-3 py-2.5 text-[11px] text-slate-600 sm:max-w-xs sm:rounded-2xl sm:px-4 sm:py-3 sm:text-xs">
            <p className="font-semibold text-slate-900">Stay snapshot</p>
            <div className="mt-1.5 grid gap-1.5 sm:mt-2">
              <p>
                Next stay date: <span className="font-semibold text-slate-900">{formatDate(summary.nextDate)}</span>
              </p>
              <p>
                Outstanding balance: <span className="font-semibold text-slate-900">{formatPeso(summary.outstanding)}</span>
              </p>
              <p>
                QR status:{" "}
                <span className={`font-semibold ${summary.qrReady ? "text-emerald-700" : "text-slate-700"}`}>
                  {summary.qrReady ? "QR ready" : "No QR yet"}
                </span>
              </p>
            </div>
          </div>
        </div>
      </header>

      <div className="mb-4 rounded-2xl border border-slate-200/70 bg-white p-2.5 shadow-sm sm:p-3">
        <div className="grid items-center gap-2 lg:grid-cols-[1fr_0.72fr]">
          <div className="min-w-0 self-center rounded-xl border border-slate-200/70 bg-slate-50 p-1 text-sm">
            <div
              className="no-scrollbar flex items-center gap-0.5 overflow-x-auto scroll-smooth sm:grid sm:grid-cols-4 sm:overflow-visible"
              role="tablist"
              aria-label="Booking status"
            >
              {(Object.keys(TAB_LABELS) as TabKey[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={tab === key}
                  className={`h-11 shrink-0 min-w-[132px] rounded-lg px-2.5 text-sm font-semibold leading-5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 sm:min-w-0 ${
                    tab === key
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-600 hover:bg-white/70 hover:text-slate-900"
                  }`}
                  onClick={() => setTab(key)}
                >
                  {TAB_LABELS[key]}
                </button>
              ))}
            </div>
          </div>
          <div className="min-w-0 self-center rounded-xl border border-slate-200/70 bg-slate-50 p-1">
            <label className="relative block">
              <span className="sr-only">Search bookings</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchInput ?? ""}
                onChange={(event) => setSearchInput(event.target.value)}
                placeholder="Search reservation code, unit, or date"
                className="h-11 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-10 text-sm text-slate-700 outline-none ring-blue-200 transition focus:ring-2"
              />
              {searchInput ? (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => {
                    setSearchInput("");
                    setSearchValue("");
                  }}
                  className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-200 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </label>
          </div>
        </div>
      </div>

      {actionMessage ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-sm text-emerald-700">{actionMessage}</p>
          {actionHasSyncCta ? (
            <Link
              href="/guest/sync"
              className="inline-flex h-8 items-center rounded-full border border-emerald-300 bg-white px-3 text-xs font-semibold text-emerald-800"
            >
              Open Sync Center
            </Link>
          ) : null}
        </div>
      ) : null}
      {cachedViewMeta ? (
        <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
          {cachedViewMeta}
        </p>
      ) : null}
      {error ? (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>
      ) : null}
      {loading ? <p className="text-sm text-slate-600">Loading bookings...</p> : null}

      {!loading && items.length === 0 ? (
        <div className="rounded-2xl border border-slate-200/70 bg-white p-6 text-center shadow-sm">
          <p className="text-sm font-semibold text-slate-900">No bookings found for this tab.</p>
          <p className="mt-2 text-sm text-slate-600">Try switching tabs or adjust your search.</p>
        </div>
      ) : null}

      <div className="grid gap-4">
        {items.map((booking) => {
          const paid = Number(booking.amount_paid_verified ?? 0);
          const total = Number(booking.total_amount ?? 0);
          const remaining = Math.max(0, total - paid);
          const paymentMeta = getPaymentStateMeta(total, paid);
          const statusClass = STATUS_BADGE_CLASS[booking.status] ?? STATUS_BADGE_CLASS.checked_out;
          const isTour = (booking.service_bookings?.length ?? 0) > 0;
          const bookingLabel = isTour ? "Tour" : "Stay";
          const bookingTarget = isTour
            ? booking.service_bookings?.map((item) => item.service?.service_name || "Tour service").join(", ")
            : booking.units?.map((item) => item.unit?.name || "Unit").join(", ");
          const visitDate = booking.service_bookings?.[0]?.visit_date ?? booking.check_in_date;
          const checkInDate = new Date(`${booking.check_in_date}T00:00:00`);
          const canCancel = ["pending_payment", "for_verification", "confirmed"].includes(booking.status) && checkInDate > now;
          const canShowQr = canShowQrForBooking(booking.status);
          const reservationStatusLabel = toTitleCase(booking.status.replace(/_/g, " "));

          return (
            <article key={booking.reservation_id} className="relative rounded-2xl border border-slate-200/70 bg-white p-5 shadow-sm">
              {canCancel ? (
                <button
                  type="button"
                  className="absolute right-4 top-4 rounded-full border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200"
                  onClick={() => setCancelFor(booking)}
                >
                  Cancel booking
                </button>
              ) : null}
              <div className="flex flex-col justify-between gap-4 sm:flex-row">
                <div className={canCancel ? "pr-28 md:pr-40" : undefined}>
                  <h2 className="text-xl font-semibold text-slate-900">{booking.reservation_code}</h2>
                  <p className="mt-1 text-sm font-medium text-slate-700">{bookingTarget || `${bookingLabel} reservation`}</p>
                  <p className="text-xs text-slate-500">Booked on {formatDateTime(booking.created_at)}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span
                      className={`inline-flex max-w-fit items-center rounded-full px-2 py-1 text-[10px] font-semibold tracking-wide sm:px-2.5 sm:text-[11px] ${statusClass}`}
                    >
                      {reservationStatusLabel}
                    </span>
                    <span
                      className={`inline-flex max-w-fit items-center rounded-full px-2 py-1 text-[10px] font-semibold sm:px-2.5 sm:text-[11px] ${paymentMeta.className}`}
                    >
                      {paymentMeta.label}
                    </span>
                  </div>
                </div>
                <div className={`flex flex-col gap-2 sm:items-end ${canCancel ? "sm:pt-10" : ""}`}>
                  <p className="text-2xl font-bold text-slate-900">{formatPeso(total)}</p>
                </div>
              </div>

              <div className="mt-4 grid gap-3 rounded-2xl border border-slate-200/70 bg-slate-50/60 p-4 sm:grid-cols-2">
                <div>
                  <span className="block text-xs text-slate-500">{isTour ? "Visit date" : "Stay dates"}</span>
                  <p className="text-sm font-medium text-slate-800">
                    {isTour ? formatDate(visitDate) : `${formatDate(booking.check_in_date)} to ${formatDate(booking.check_out_date)}`}
                  </p>
                </div>
                <div>
                  <span className="block text-xs text-slate-500">Payment status</span>
                  <p className="text-sm font-semibold text-slate-800">{paymentMeta.label}</p>
                </div>
                <div>
                  <span className="block text-xs text-slate-500">Amount paid</span>
                  <p className="text-sm font-semibold text-emerald-700">{formatPeso(paid)}</p>
                </div>
                <div>
                  <span className="block text-xs text-slate-500">Outstanding balance</span>
                  <p className="text-sm font-semibold text-orange-700">{formatPeso(remaining)}</p>
                </div>
              </div>

              <div className="mt-3">
                <span className="inline-flex items-center rounded-full bg-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-700">
                  {isTour ? "Tour booking" : "Stay booking"}
                </span>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
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
                    className="rounded-lg border border-blue-700 bg-blue-700 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800"
                    onClick={() => {
                      setSubmitFor(booking);
                      const total = Number(booking.total_amount ?? 0);
                      const paid = Number(booking.amount_paid_verified ?? 0);
                      const remaining = Math.max(0, total - paid);
                      const depositRequired = Number(booking.deposit_required ?? 0);
                      const expected = Number(booking.expected_pay_now ?? 0);
                      const suggestedAmount = depositRequired > 0 && expected > 0 ? expected : remaining;
                      setSubmitAmount(String(suggestedAmount));
                      setSubmitReferenceNo("");
                      setSubmitProofMode("file");
                      setSubmitProofFile(null);
                      setSubmitProofUrl("");
                      setSubmitError(null);
                    }}
                  >
                    Pay now
                  </button>
                ) : null}

                {canShowQr ? (
                  <button
                    type="button"
                    onClick={() => {
                      setQrFor(booking);
                      setQrToken(null);
                      setQrError(null);
                      setQrSecondsLeft(0);
                    }}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:border-blue-300 hover:text-blue-700"
                  >
                    Show QR
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
          <div className="max-h-[92vh] w-full overflow-auto rounded-t-2xl border border-slate-200/70 bg-white p-4 md:max-w-2xl md:rounded-2xl">
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
                <AIPricingInsightCard
                  recommendation={detailsAiRecommendation}
                  loading={detailsAiLoading}
                  error={detailsAiError}
                  title="AI Pricing Insight"
                />

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
                          {normalizeUnitImageUrls(row.unit?.image_urls, row.unit?.image_url).length ? (
                            <button
                              type="button"
                              onClick={() => openUnitGallery(row.unit ?? null)}
                              className="mt-2 inline-flex h-8 items-center rounded-md border border-[var(--color-border)] bg-white px-3 text-xs font-semibold text-[var(--color-text)]"
                            >
                              View photos
                            </button>
                          ) : null}
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
          <div className="max-h-[92vh] w-full overflow-auto rounded-t-2xl border border-slate-200/70 bg-white p-4 md:max-w-xl md:rounded-2xl">
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
                  className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 outline-none ring-blue-200 transition focus:ring-2"
                />
              </label>
              <label className="grid gap-1 text-sm text-slate-700">
                Reference number
                <input
                  type="text"
                  value={submitReferenceNo ?? ""}
                  onChange={(event) => setSubmitReferenceNo(event.target.value)}
                  placeholder="Reference number (optional)"
                  className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 outline-none ring-blue-200 transition focus:ring-2"
                />
              </label>

              <GcashPaymentGuide compact onCopyMessage={(message) => pushActionMessage(message)} />

              <div className="grid gap-2">
                <p className="text-sm text-slate-700">Payment proof</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSubmitProofMode("file")}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
                      submitProofMode === "file"
                        ? "border-slate-900 bg-slate-900 text-white"
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
                        ? "border-slate-900 bg-slate-900 text-white"
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
                    className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm"
                  />
                ) : (
                  <input
                    type="url"
                    value={submitProofUrl ?? ""}
                    onChange={(event) => setSubmitProofUrl(event.target.value)}
                    placeholder="https://..."
                    required={submitProofMode === "url"}
                    className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 outline-none ring-blue-200 transition focus:ring-2"
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
                  className="rounded-lg border border-blue-700 bg-blue-700 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-800 disabled:opacity-60"
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
          <div className="max-h-[92vh] w-full overflow-auto rounded-t-2xl border border-slate-200/70 bg-white p-4 md:max-w-2xl md:rounded-2xl">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="text-lg font-semibold text-slate-900">Check-in QR Token</h3>
              <button
                type="button"
                onClick={() => {
                  setQrFor(null);
                  setQrToken(null);
                  setQrError(null);
                  setQrSecondsLeft(0);
                  setQrFromCache(false);
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
              Token refreshes automatically near expiry. Share this payload with the admin scanner.
            </p>
            {!networkOnline ? (
              <p className="mt-1 text-xs font-semibold text-amber-700">
                Offline: new token issuance is unavailable. Last cached token is shown if present.
              </p>
            ) : null}

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
                {qrFromCache ? (
                  <p className="mt-2 text-xs font-semibold text-amber-700">
                    Cached token loaded for offline display.
                  </p>
                ) : null}
                <div className="mt-3 flex justify-center rounded-2xl border border-slate-200/70 bg-slate-50 p-4">
                  <QRCodeSVG value={qrCodeValue} size={300} level="M" includeMargin />
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
                disabled={qrBusy || !networkOnline}
              >
                {networkOnline ? "Refresh now" : "Reconnect to refresh"}
              </button>
              <button
                type="button"
                onClick={() => void copyQrPayload()}
                className="rounded-lg border border-slate-900 bg-slate-900 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 disabled:opacity-60"
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
          <div className="max-h-[92vh] w-full overflow-auto rounded-t-2xl border border-slate-200/70 bg-white p-4 md:max-w-md md:rounded-2xl">
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
      {detailGalleryOpen ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/55 p-0 md:items-center md:p-4">
          <div className="max-h-[92vh] w-full overflow-auto rounded-t-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 md:max-w-3xl md:rounded-2xl md:p-5">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-[var(--color-text)]">{detailGalleryTitle}</h3>
              <button
                type="button"
                onClick={() => {
                  setDetailGalleryOpen(false);
                  setDetailLightboxOpen(false);
                }}
                className="inline-flex h-10 items-center rounded-lg border border-[var(--color-border)] bg-white px-3 text-sm font-semibold text-[var(--color-text)]"
              >
                Close
              </button>
            </div>
            <UnitImageGallery
              images={detailGalleryImages}
              thumbs={detailGalleryThumbs}
              altBase={detailGalleryTitle}
              selectedIndex={detailGalleryIndex}
              onSelect={setDetailGalleryIndex}
              onOpenLightbox={(index) => {
                setDetailGalleryIndex(index);
                setDetailLightboxOpen(true);
              }}
              emptyText="No photos available for this unit."
            />
          </div>
        </div>
      ) : null}
      <ImageLightbox
        open={detailLightboxOpen}
        images={detailGalleryImages}
        altBase={detailGalleryTitle}
        initialIndex={detailGalleryIndex}
        onClose={() => setDetailLightboxOpen(false)}
      />
    </section>
  );
}
