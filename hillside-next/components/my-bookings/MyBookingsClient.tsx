"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { Bell, Calendar, CircleCheck, CircleX, Clock, CreditCard, Eye, Loader2, MapPin, QrCode, Star } from "lucide-react";
import type {
  MyBookingsCursor as Cursor,
  MyBookingsResponse as BookingsResponse,
  MyBookingsTab as TabKey,
  MyReviewsResponse,
  QrToken,
  ReservationListItem as Booking,
  ReservationCancelResponse,
  ReservationFolio,
  ReservationPolicyOutcome,
} from "../../../packages/shared/src/types";
import { computeStayDepositPreview } from "../../../packages/shared/src/types";
import {
  myBookingsResponseSchema,
  myReviewsResponseSchema,
  qrTokenSchema,
  reservationCancelResponseSchema,
  reservationFolioResponseSchema,
  reservationListItemSchema,
  reviewItemSchema,
} from "../../../packages/shared/src/schemas";
import { apiFetch } from "../../lib/apiClient";
import { getApiErrorMessage } from "../../lib/apiError";
import { formatCachedAt, formatDateWithWeekday, formatLocalDateTime } from "../../lib/dateDisplay";
import { formatPhpPeso as formatPeso } from "../../lib/formatCurrency";
import { getUnitLabel } from "../../lib/unitLabel";
import { loadLastIssuedQrToken, saveLastIssuedQrToken } from "../../lib/guestQrTokenCache";
import { useNetworkOnline } from "../../lib/hooks/useNetworkOnline";
import { loadBookingsSnapshot, saveBookingsSnapshot } from "../../lib/offlineSync/store";
import { getReservationStatusMeta } from "../../lib/reservationStatus";
import { compactQrTokenPayload } from "../../lib/qrPayload";
import { BookingStatusTabs } from "../guest/BookingStatusTabs";
import { GuestEmptyState } from "../guest/GuestEmptyState";
import { GuestPageIntro } from "../guest/GuestPageIntro";
import { StaySnapshotCard } from "../guest/StaySnapshotCard";
import { GuestSearchBar } from "../guest/GuestSearchBar";
import { ImageLightbox } from "../shared/ImageLightbox";
import { ModalDialog } from "../shared/ModalDialog";
import { SyncAlertBanner } from "../shared/SyncAlertBanner";
import { DepositPolicyDialog } from "../booking/DepositPolicyDialog";
import { redirectToGcashOrPay } from "../../lib/booking/gcashCheckout";
import { UnitImageGallery } from "../shared/UnitImageGallery";
import { normalizeUnitImageUrls, normalizeUnitThumbUrls } from "../../lib/unitMedia";

type StaySnapshot = {
  nextStayDate: string;
  outstandingBalance: string;
  qrStatus: string;
};

type MyBookingsClientProps = {
  initialToken?: string | null;
  initialSessionEmail?: string | null;
  initialTab?: TabKey;
  initialData?: BookingsResponse | null;
  initialFocusReservationId?: string | null;
  staySnapshot?: StaySnapshot | null;
  activeStayId?: string | null;
  activeStayStatus?: string | null;
};

const TAB_LABELS: Record<TabKey, string> = {
  upcoming: "Upcoming",
  pending_payment: "Payment",
  completed: "Completed",
  cancelled: "Cancelled",
};

const TAB_HINTS: Record<TabKey, string> = {
  upcoming: "Upcoming stays and actions to take.",
  pending_payment: "Waiting for payment or verification.",
  completed: "Past stays, kept for your records.",
  cancelled: "Cancelled bookings.",
};

const STAY_BANNERS = [
  "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b",
  "https://images.unsplash.com/photo-1520250497591-112f2f40a3f4",
  "https://images.unsplash.com/photo-1505693416388-ac5ce068fe85",
];
const TOUR_BANNERS = [
  "https://images.unsplash.com/photo-1551632811-561732d1e306",
  "https://images.unsplash.com/photo-1533240332313-0db49b459ad6",
  "https://images.unsplash.com/photo-1465056836041-7f43ac27dcb5",
];

/** Photo-forward banner per booking: a real unit photo when present, else a
 *  stable per-type Unsplash image so each trip card looks distinct. */
function bookingBannerUrl(booking: Booking, isTour: boolean): string {
  // Prefer the real uploaded photo of the booked tour/unit; only fall back to a
  // deterministic placeholder when the listing has no image yet.
  if (isTour) {
    const service = booking.service_bookings?.find((entry) => entry.service)?.service;
    const real = (service?.image_urls || []).find((url) => /^https?:\/\//i.test(url)) || "";
    if (/^https?:\/\//i.test(real)) return real;
  } else {
    const unit = booking.units?.find((entry) => entry.unit)?.unit;
    const real = (unit?.image_urls || []).find((url) => /^https?:\/\//i.test(url)) || unit?.image_url || "";
    if (/^https?:\/\//i.test(real)) return real;
  }
  const pool = isTour ? TOUR_BANNERS : STAY_BANNERS;
  const key = booking.reservation_code || booking.reservation_id || "";
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  return `${pool[hash % pool.length]}?auto=format&fit=crop&w=900&q=60`;
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

function canShowQrForBooking(booking: { status: string; escrow_state?: string | null }) {
  // The check-in pass only appears once the deposit is paid (status reaches
  // confirmed/checked_in) and the escrow is healthy. "none" = non-escrow booking
  // (walk-in/manual), "pending_lock"/"locked" = secured; all stay visible.
  // A terminal/broken escrow (released after cancel, refunded, failed lock) hides it.
  if (!["confirmed", "checked_in"].includes(booking.status)) return false;
  const escrow = String(booking.escrow_state ?? "none").toLowerCase();
  return !["released", "refunded", "failed"].includes(escrow);
}

/** "Check-in opens in 1d 3h" for a confirmed upcoming booking (8am local), else null. */
function formatCheckInCountdown(targetDate: string, now: Date): string | null {
  const target = new Date(`${targetDate}T08:00:00+08:00`).getTime();
  const diff = target - now.getTime();
  if (!Number.isFinite(diff)) return null;
  if (diff <= 0) return "Check-in is open now";
  const totalMinutes = Math.floor(diff / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  const span = days > 0 ? `${days}d ${hours}h` : hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  return `Check-in opens in ${span}`;
}

function cancellationConsequenceText(booking: Booking | null) {
  if (!booking) return null;
  const minimumDeposit = Number(booking.deposit_required ?? 0);
  if (minimumDeposit > 0) {
    return `Guest-initiated cancellation forfeits the minimum deposit (${formatPeso(minimumDeposit)}).`;
  }
  const estimatedDeposit = computeStayDepositPreview(Number(booking.total_amount ?? 0));
  if (estimatedDeposit > 0) {
    return `Guest-initiated cancellation may forfeit the minimum deposit (estimated ${formatPeso(estimatedDeposit)}).`;
  }
  return "Guest-initiated cancellation may forfeit previously paid minimum deposit based on booking policy.";
}

function cancellationResultMessage(outcome: ReservationPolicyOutcome | null | undefined) {
  if (outcome === "forfeited") {
    return "Booking cancelled. Minimum deposit was marked as forfeited by policy.";
  }
  if (outcome === "refunded") {
    return "Booking cancelled. Refund flow was triggered by policy.";
  }
  return "Booking cancelled.";
}

function getReservationStatusTone(status: string) {
  const normalized = status.toLowerCase();
  if (["confirmed", "checked_in", "checked_out", "completed"].includes(normalized)) {
    return {
      dotClassName: "bg-emerald-500",
      panelClassName: "border-emerald-200 bg-emerald-50 text-emerald-800",
      helper:
        normalized === "confirmed"
          ? "Approved by admin. Keep your QR ready for check-in."
          : "This reservation is active or already completed.",
    };
  }
  if (normalized === "for_verification") {
    return {
      dotClassName: "bg-blue-500",
      panelClassName: "border-blue-200 bg-blue-50 text-blue-800",
      helper: "Payment proof is waiting for admin review.",
    };
  }
  if (normalized === "pending_payment") {
    return {
      dotClassName: "bg-orange-500",
      panelClassName: "border-orange-200 bg-orange-50 text-orange-800",
      helper: "Submit your payment proof so admin can verify this booking.",
    };
  }
  if (["cancelled", "rejected", "no_show"].includes(normalized)) {
    return {
      dotClassName: "bg-red-500",
      panelClassName: "border-red-200 bg-red-50 text-red-800",
      helper: "This reservation is no longer active.",
    };
  }
  return {
    dotClassName: "bg-[var(--color-muted)]",
    panelClassName: "border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-text)]",
    helper: "Check the booking details below for the latest state.",
  };
}

function bookingFlowHint(status: string) {
  if (status === "pending_payment") {
    return "Next step: pay the minimum deposit and submit proof so admin can verify your booking.";
  }
  if (status === "for_verification") {
    return "Payment proof submitted. Waiting for admin verification.";
  }
  if (status === "confirmed") {
    return "Booking confirmed. Keep this reservation or cancel before check-in date if needed.";
  }
  return null;
}

export function MyBookingsClient({
  initialToken = null,
  initialSessionEmail = null,
  initialTab = "upcoming",
  initialData = null,
  initialFocusReservationId = null,
  staySnapshot = null,
  activeStayId = null,
  activeStayStatus = null,
}: MyBookingsClientProps) {
  const router = useRouter();
  const token = initialToken;
  const sessionEmail = initialSessionEmail;

  const [tab, setTab] = useState<TabKey>(initialTab);
  const [searchInput, setSearchInput] = useState("");
  const [searchValue, setSearchValue] = useState("");

  const [items, setItems] = useState<Booking[]>(initialData?.items ?? []);
  const [nextCursor, setNextCursor] = useState<Cursor | null>(initialData?.nextCursor ?? null);
  const [totalCount, setTotalCount] = useState(initialData?.totalCount ?? 0);
  // Start in the loading state when there's no SSR data, so the skeleton (not the
  // empty state) shows for the brief moment before the cached snapshot paints.
  const [loading, setLoading] = useState(!initialData);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const autoOpenPayHandledRef = useRef(false);

  const [details, setDetails] = useState<Booking | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  // Running stay charges (add-ons requested during the stay + any room balance),
  // collected at check-out. Room stays only.
  const [folio, setFolio] = useState<ReservationFolio | null>(null);
  const [folioLoading, setFolioLoading] = useState(false);
  // Folio for the guest's in-progress (checked-in) stay, shown at the top of My
  // Trips so they can watch add-ons accrue toward what they settle at check-out.
  const [activeFolio, setActiveFolio] = useState<ReservationFolio | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!token || !activeStayId || activeStayStatus !== "checked_in") {
      setActiveFolio(null);
      return;
    }
    void apiFetch(
      `/v2/reservations/${encodeURIComponent(activeStayId)}/folio`,
      { method: "GET" },
      token,
      reservationFolioResponseSchema,
    )
      .then((data) => {
        if (!cancelled) setActiveFolio(data);
      })
      .catch(() => {
        if (!cancelled) setActiveFolio(null);
      });
    return () => {
      cancelled = true;
    };
  }, [token, activeStayId, activeStayStatus]);

  const [cancelFor, setCancelFor] = useState<Booking | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

  // Automated GCash checkout (PayMongo) for a pending booking. The deposit-policy
  // dialog gates it, then we redirect to the hosted checkout — falling back to the
  // manual pay page if the gateway is unavailable so the guest is never dead-ended.
  const [gcashFor, setGcashFor] = useState<Booking | null>(null);
  const [gcashBusy, setGcashBusy] = useState(false);
  const startGcashCheckout = useCallback(async () => {
    if (!gcashFor) return;
    const reservationId = gcashFor.reservation_id;
    const goToPayPage = (rid: string) => router.push(`/reserve/${encodeURIComponent(rid)}/pay`);
    setGcashBusy(true);
    if (!token) {
      goToPayPage(reservationId);
      return;
    }
    await redirectToGcashOrPay(reservationId, token, goToPayPage);
    // On success the browser is already navigating to GCash; on fallback we've
    // pushed the pay page. Reset so the dialog isn't stuck if we stayed put.
    setGcashBusy(false);
    setGcashFor(null);
  }, [gcashFor, token, router]);

  const [qrFor, setQrFor] = useState<Booking | null>(null);
  const [qrToken, setQrToken] = useState<QrToken | null>(null);
  const [qrBusy, setQrBusy] = useState(false);
  const [qrError, setQrError] = useState<string | null>(null);
  const [qrSecondsLeft, setQrSecondsLeft] = useState(0);
  const [qrFromCache, setQrFromCache] = useState(false);
  const networkOnline = useNetworkOnline();

  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionHasSyncCta, setActionHasSyncCta] = useState(false);
  const [cachedViewMeta, setCachedViewMeta] = useState<string | null>(null);
  // Reviews: which reservations the guest has already rated, and the in-flight
  // review form.
  const [reviewedByReservation, setReviewedByReservation] = useState<Map<string, number>>(new Map());
  const [reviewFor, setReviewFor] = useState<Booking | null>(null);
  const [reviewRating, setReviewRating] = useState(5);
  const [reviewComment, setReviewComment] = useState("");
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState<string | null>(null);
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
    const timeout = window.setTimeout(() => setSearchValue(searchInput.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  // Scroll a focused booking card into view (e.g. arriving from a deep link).
  useEffect(() => {
    if (autoOpenPayHandledRef.current) return;
    if (!initialFocusReservationId) return;
    const targetBooking = items.find((booking) => booking.reservation_id === initialFocusReservationId);
    if (!targetBooking) return;
    autoOpenPayHandledRef.current = true;
    const cardElement = document.getElementById(`booking-card-${targetBooking.reservation_id}`);
    if (cardElement) {
      window.setTimeout(() => {
        cardElement.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 120);
    }
  }, [initialFocusReservationId, items]);

  const fetchBookings = useCallback(
    async (cursor: Cursor | null, mode: "replace" | "append", opts: { silent?: boolean } = {}) => {
      if (!token) return;
      const currentRequestId = ++requestIdRef.current;
      const snapshotVariantKey = `${tab}::${searchValue || "__all__"}`;
      // `silent` = a stale-while-revalidate background refresh: keep the cached
      // list on screen instead of flashing the skeleton.
      if (mode === "replace" && !opts.silent) setLoading(true);
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
            setError(getApiErrorMessage(unknownError, "Failed to load bookings."));
            setCachedViewMeta(null);
          }
        } else {
          setError(getApiErrorMessage(unknownError, "Failed to load bookings."));
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
      setLoading(false);
      return;
    }
    // Show the skeleton (not the empty state) until the cache or first fetch
    // resolves for this tab/search.
    setLoading(true);
    let cancelled = false;
    void (async () => {
      // Stale-while-revalidate: paint the cached snapshot instantly, then refresh
      // in the background (silently, so the cached list isn't replaced by a
      // skeleton). On the very first visit there is no cache, so the skeleton
      // stays up while the first fetch runs.
      let paintedFromCache = false;
      const cached = await loadBookingsSnapshot("me", {
        variantKey: `${tab}::${searchValue || "__all__"}`,
      });
      if (!cancelled && cached?.data?.items?.length) {
        setItems(cached.data.items);
        setNextCursor(cached.data.nextCursor ?? null);
        setTotalCount(cached.data.totalCount ?? 0);
        setLoading(false);
        paintedFromCache = true;
      }
      if (!cancelled) void fetchBookings(null, "replace", { silent: paintedFromCache });
    })();
    return () => {
      cancelled = true;
    };
  }, [token, tab, searchValue, fetchBookings]);

  const openDetails = useCallback(
    async (reservationId: string) => {
      if (!token) return;
      setDetailsLoading(true);
      setDetailsError(null);
      try {
        const data = await apiFetch<Booking>(
          `/v2/me/bookings/${encodeURIComponent(reservationId)}`,
          { method: "GET" },
          token,
          reservationListItemSchema,
        );
        setDetails(data);
        // Pull the running stay charges for an in-progress/just-finished room stay so the
        // guest can see add-ons accruing toward what they settle at check-out.
        const isTour = (data.service_bookings?.length ?? 0) > 0;
        if (!isTour && ["confirmed", "checked_in", "checked_out"].includes(data.status)) {
          setFolioLoading(true);
          try {
            const stayFolio = await apiFetch(
              `/v2/reservations/${encodeURIComponent(reservationId)}/folio`,
              { method: "GET" },
              token,
              reservationFolioResponseSchema,
            );
            setFolio(stayFolio);
          } catch {
            setFolio(null);
          } finally {
            setFolioLoading(false);
          }
        } else {
          setFolio(null);
        }
      } catch (unknownError) {
        setDetailsError(getApiErrorMessage(unknownError, "Failed to load booking details."));
      } finally {
        setDetailsLoading(false);
      }
    },
    [token],
  );

  const confirmCancel = useCallback(async () => {
    if (!token || !cancelFor) return;
    setCancelBusy(true);
    setCancelError(null);
    try {
      const result = await apiFetch<ReservationCancelResponse>(
        `/v2/reservations/${encodeURIComponent(cancelFor.reservation_id)}/cancel`,
        {
          method: "POST",
          body: JSON.stringify({}),
        },
        token,
        reservationCancelResponseSchema,
      );
      pushActionMessage(cancellationResultMessage(result.policy_outcome));
      setCancelFor(null);
      await fetchBookings(null, "replace");
    } catch (unknownError) {
      setCancelError(getApiErrorMessage(unknownError, "Failed to cancel booking."));
    } finally {
      setCancelBusy(false);
    }
  }, [cancelFor, fetchBookings, token, pushActionMessage]);

  // Load the guest's existing reviews so completed bookings show "Leave a review"
  // vs "You rated …". Silent on failure (table not provisioned / offline).
  useEffect(() => {
    if (!token) {
      setReviewedByReservation(new Map());
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const data = await apiFetch<MyReviewsResponse>(
          "/v2/reviews/mine",
          { method: "GET" },
          token,
          myReviewsResponseSchema,
        );
        if (cancelled) return;
        const map = new Map<string, number>();
        data.items.forEach((review) => map.set(review.reservation_id, review.rating));
        setReviewedByReservation(map);
      } catch {
        /* no reviews available */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const openReview = useCallback((booking: Booking) => {
    setReviewFor(booking);
    setReviewRating(5);
    setReviewComment("");
    setReviewError(null);
  }, []);

  const submitReview = useCallback(async () => {
    if (!token || !reviewFor) return;
    setReviewBusy(true);
    setReviewError(null);
    try {
      await apiFetch(
        "/v2/reviews",
        {
          method: "POST",
          body: JSON.stringify({
            reservation_id: reviewFor.reservation_id,
            rating: reviewRating,
            comment: reviewComment.trim() || null,
          }),
        },
        token,
        reviewItemSchema,
      );
      setReviewedByReservation((prev) => new Map(prev).set(reviewFor.reservation_id, reviewRating));
      setReviewFor(null);
      pushActionMessage("Thanks for your review!");
    } catch (unknownError) {
      setReviewError(getApiErrorMessage(unknownError, "Couldn't submit your review."));
    } finally {
      setReviewBusy(false);
    }
  }, [pushActionMessage, reviewComment, reviewFor, reviewRating, token]);

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
        setQrError(getApiErrorMessage(unknownError, "Failed to issue check-in QR token."));
      } finally {
        setQrBusy(false);
      }
    },
    [qrFor?.reservation_code, token],
  );


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

  const canLoadMore = Boolean(nextCursor) && !loadingMore;
  const detailUnits = details?.units ?? [];
  const detailTours = details?.service_bookings ?? [];
  const qrCodeValue = qrToken ? JSON.stringify(compactQrTokenPayload(qrToken)) : "";
  const openUnitGallery = useCallback(
    (unit?: {
      name?: string | null;
      image_url?: string | null;
      image_urls?: string[] | null;
      image_thumb_urls?: string[] | null;
    } | null) => {
      const images = normalizeUnitImageUrls(unit?.image_urls, unit?.image_url);
      if (!images.length) return;
      const label = getUnitLabel(unit?.name || "Unit");
      setDetailGalleryImages(images);
      setDetailGalleryThumbs(normalizeUnitThumbUrls(images, unit?.image_thumb_urls ?? null));
      setDetailGalleryTitle(label.subtitle ? `${label.title} (${label.subtitle})` : label.title || "Unit photos");
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

  if (!token) {
    return (
      <section className="mx-auto w-full max-w-5xl">
        <header className="mb-5 rounded-3xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-sm">
          <h1 className="text-3xl font-bold text-[var(--color-text)]">My Stay</h1>
          <p className="mt-2 text-sm text-[var(--color-muted)]">Track reservations, check-in QR, and payment status.</p>
        </header>
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          No active session found. Sign in first, then reopen this page.
        </p>
      </section>
    );
  }

  const guestIntro = (
    <GuestPageIntro
      testId="guest-hero"
      title="My trips"
      subtitle="Your bookings, payments, and check-in passes."
    />
  );
  const quickActions = (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Link
        href="/stays"
        className="group flex items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 transition hover:shadow-[var(--shadow-md)]"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[color:color-mix(in_srgb,var(--color-secondary)_14%,white)] text-[var(--color-secondary)]">
          <Calendar className="h-4 w-4" />
        </span>
        <span className="text-sm font-semibold text-[var(--color-text)] group-hover:underline">Book a stay</span>
      </Link>
      <Link
        href="/tours"
        className="group flex items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 transition hover:shadow-[var(--shadow-md)]"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[color:color-mix(in_srgb,var(--color-secondary)_14%,white)] text-[var(--color-secondary)]">
          <Calendar className="h-4 w-4" />
        </span>
        <span className="text-sm font-semibold text-[var(--color-text)] group-hover:underline">Tours</span>
      </Link>
      <Link
        href="/guest/map"
        className="group flex items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 transition hover:shadow-[var(--shadow-md)]"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[color:color-mix(in_srgb,var(--color-secondary)_14%,white)] text-[var(--color-secondary)]">
          <MapPin className="h-4 w-4" />
        </span>
        <span className="text-sm font-semibold text-[var(--color-text)] group-hover:underline">Resort map</span>
      </Link>
      <Link
        href="/guest/services"
        className="group flex items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3 transition hover:shadow-[var(--shadow-md)]"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[color:color-mix(in_srgb,var(--color-secondary)_14%,white)] text-[var(--color-secondary)]">
          <Bell className="h-4 w-4" />
        </span>
        <span className="text-sm font-semibold text-[var(--color-text)] group-hover:underline">Services</span>
      </Link>
    </div>
  );
  const stayCard = staySnapshot ? (
    <StaySnapshotCard
      nextStayDate={staySnapshot.nextStayDate}
      outstandingBalance={staySnapshot.outstandingBalance}
      qrStatus={staySnapshot.qrStatus}
      stayChargesTotal={
        activeFolio && activeFolio.addons.length > 0 ? formatPeso(activeFolio.grand_total_due) : null
      }
      stayChargeLines={
        activeFolio
          ? activeFolio.addons.map((line) => ({
              id: line.request_id,
              label: line.quantity > 1 ? `${line.service_name} ×${line.quantity}` : line.service_name,
              amount: formatPeso(line.line_total),
            }))
          : []
      }
    />
  ) : null;

  return (
    <section className="mx-auto flex w-full max-w-[1240px] flex-col gap-5 overflow-x-hidden lg:gap-5">
      {guestIntro}
      {/* Desktop: the "Your stay" card is a right rail that spans the quick actions
          and the tabs/search block; the title sits full-width above. Mobile: title,
          card, quick actions, tabs (DOM order keeps the card right under the title). */}
      <div className={stayCard ? "lg:grid lg:grid-cols-[minmax(0,1fr)_380px] lg:items-start lg:gap-6" : undefined}>
        {stayCard ? (
          <div className="mb-5 w-full lg:col-start-2 lg:row-start-1 lg:mb-0 lg:w-[380px]">{stayCard}</div>
        ) : null}
        <div className="flex min-w-0 flex-col gap-5 lg:col-start-1 lg:row-start-1">
          {quickActions}

      <section className="rounded-[2rem] border border-[var(--color-border)] bg-white p-4 shadow-sm lg:p-5">
        <div className="lg:hidden" data-testid="guest-tabs">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button
              type="button"
              onClick={() => setTab("upcoming")}
              className={`inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-2xl px-4 text-[13px] font-bold leading-none transition ${
                tab === "upcoming"
                  ? "border border-[var(--color-secondary)] bg-[color:color-mix(in_srgb,var(--color-secondary)_12%,white)] text-[var(--color-secondary)] shadow-sm"
                  : "text-[var(--color-muted)] hover:bg-[var(--color-background)]"
              }`}
            >
              <Calendar className="h-4 w-4 shrink-0" />
              <span>Upcoming</span>
            </button>
            <button
              type="button"
              onClick={() => setTab("pending_payment")}
              className={`inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-2xl px-4 text-[13px] font-bold leading-none transition ${
                tab === "pending_payment"
                  ? "border border-[var(--color-secondary)] bg-[color:color-mix(in_srgb,var(--color-secondary)_12%,white)] text-[var(--color-secondary)] shadow-sm"
                  : "text-[var(--color-muted)] hover:bg-[var(--color-background)]"
              }`}
            >
              <CreditCard className="h-4 w-4 shrink-0" />
              <span>Payment</span>
            </button>
            <button
              type="button"
              onClick={() => setTab("completed")}
              className={`inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-2xl px-4 text-[13px] font-bold leading-none transition ${
                tab === "completed"
                  ? "border border-[var(--color-secondary)] bg-[color:color-mix(in_srgb,var(--color-secondary)_12%,white)] text-[var(--color-secondary)] shadow-sm"
                  : "text-[var(--color-muted)] hover:bg-[var(--color-background)]"
              }`}
            >
              <CircleCheck className="h-4 w-4 shrink-0" />
              <span>Completed</span>
            </button>
            <button
              type="button"
              onClick={() => setTab("cancelled")}
              className={`inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-2xl px-4 text-[13px] font-bold leading-none transition ${
                tab === "cancelled"
                  ? "border border-[var(--color-secondary)] bg-[color:color-mix(in_srgb,var(--color-secondary)_12%,white)] text-[var(--color-secondary)] shadow-sm"
                  : "text-[var(--color-muted)] hover:bg-[var(--color-background)]"
              }`}
            >
              <CircleX className="h-4 w-4 shrink-0" />
              <span>Cancelled</span>
            </button>
          </div>
        </div>

        <div className="hidden lg:flex lg:flex-col lg:gap-3">
          <BookingStatusTabs
            items={(Object.keys(TAB_LABELS) as TabKey[]).map((key) => ({
              id: key,
              label: TAB_LABELS[key],
              shortLabel:
                key === "pending_payment"
                  ? "Payment"
                  : key === "completed"
                    ? "Completed"
                    : key === "cancelled"
                      ? "Cancelled"
                      : "Upcoming",
              icon:
                key === "upcoming"
                  ? <Calendar className="h-4 w-4 shrink-0" />
                  : key === "pending_payment"
                    ? <CreditCard className="h-4 w-4" />
                    : key === "completed"
                      ? <CircleCheck className="h-4 w-4" />
                      : <CircleX className="h-4 w-4" />,
            }))}
            value={tab}
            onChange={(next) => setTab(next as TabKey)}
          />
          <GuestSearchBar
            value={searchInput ?? ""}
            onChange={setSearchInput}
            onClear={() => {
              setSearchInput("");
              setSearchValue("");
            }}
            placeholder="Search booking, unit, date"
            className="w-full"
          />
        </div>
        <div className="mt-3 lg:mt-4">
          <p className="truncate text-sm text-[var(--color-muted)]">{TAB_HINTS[tab]}</p>
        </div>
      </section>
        </div>
      </div>

      {error || actionMessage || cachedViewMeta ? (
        <div className="mb-1">
          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</p>
          ) : null}
          {!error && actionMessage ? (
            <SyncAlertBanner
              message={actionMessage}
              tone={actionHasSyncCta ? "warning" : "success"}
              showSyncCta={actionHasSyncCta}
              role="status"
            />
          ) : null}
          {!error && !actionMessage && cachedViewMeta ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
              {cachedViewMeta}
            </p>
          ) : null}
        </div>
      ) : null}
      <div className={loading ? "min-h-[16rem] lg:min-h-[14rem]" : ""} aria-busy={loading}>
        {loading ? (
          <div className="grid gap-3">
            {Array.from({ length: 3 }).map((_, idx) => (
              <div key={`booking-skeleton-${idx}`} className="rounded-2xl border border-[var(--color-border)] bg-white p-5 shadow-sm">
                <div className="skeleton h-6 w-48" />
                <div className="mt-2 skeleton h-4 w-64" />
                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  <div className="skeleton h-8" />
                  <div className="skeleton h-8" />
                  <div className="skeleton h-8" />
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {!loading && items.length === 0 ? (
          <GuestEmptyState
            testId="guest-empty-state"
            title="No bookings found for this tab."
            message="Try switching tabs, adjusting your search, or create a new reservation."
            className="min-h-[300px] md:min-h-[280px] lg:min-h-[clamp(220px,31vh,280px)] lg:py-7"
          />
        ) : null}

        <div className="grid gap-4">
          {items.map((booking) => {
          const paid = Number(booking.amount_paid_verified ?? 0);
          const total = Number(booking.total_amount ?? 0);
          const remaining = Math.max(0, total - paid);
          const expectedPayNow = Number(booking.expected_pay_now ?? 0);
          const minimumPayNow = expectedPayNow > 0 ? expectedPayNow : remaining;
          const paymentMeta = getPaymentStateMeta(total, paid);
          const statusMeta = getReservationStatusMeta(booking.status);
          const isTour = (booking.service_bookings?.length ?? 0) > 0;
          const isPaymentTab = tab === "pending_payment";
          const bookingLabel = isTour ? "Tour" : "Stay";
          const bookingTarget = isTour
            ? booking.service_bookings?.map((item) => item.service?.service_name || "Tour service").join(", ")
            : booking.units?.map((item) => {
                const label = getUnitLabel(item.unit?.name || "Unit");
                return label.subtitle ? `${label.title} (${label.subtitle})` : label.title;
              }).join(", ");
          const visitDate = booking.service_bookings?.[0]?.visit_date ?? booking.check_in_date;
          const checkInDate = new Date(`${booking.check_in_date}T00:00:00`);
          const canCancel = ["pending_payment", "for_verification", "confirmed"].includes(booking.status) && checkInDate > now;
          const canShowQr = canShowQrForBooking(booking);
          const reservationStatusLabel = toTitleCase(booking.status.replace(/_/g, " "));
          const flowHint = bookingFlowHint(booking.status);
          const showSecondaryActions = booking.status !== "pending_payment" && canCancel;
          const banner = bookingBannerUrl(booking, isTour);

          return (
            <article
              key={booking.reservation_id}
              id={`booking-card-${booking.reservation_id}`}
              className="overflow-hidden rounded-3xl border border-[var(--color-border)] bg-white shadow-sm"
            >
              <div
                className="relative h-36 w-full bg-[var(--color-border)] bg-cover bg-center sm:h-44"
                style={{ backgroundImage: `url('${banner}')` }}
                role="img"
                aria-label={bookingTarget || `${bookingLabel} reservation`}
              >
                <span className="absolute left-3 top-3 inline-flex items-center rounded-full bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-[var(--color-text)] shadow-sm">
                  {isTour ? "Tour" : "Stay"}
                </span>
                <span className={`absolute right-3 top-3 inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold shadow-sm ${statusMeta.className}`}>
                  {reservationStatusLabel}
                </span>
                {canShowQr ? (
                  <button
                    type="button"
                    onClick={() => {
                      setQrFor(booking);
                      setQrToken(null);
                      setQrError(null);
                      setQrSecondsLeft(0);
                    }}
                    className="absolute bottom-3 right-3 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white text-[var(--color-text)] shadow-[var(--shadow-md)] transition hover:scale-105"
                    aria-label="Show check-in QR"
                    title="Show QR"
                  >
                    <QrCode className="h-4 w-4 shrink-0 stroke-[2.2]" aria-hidden="true" />
                  </button>
                ) : null}
              </div>

              <div className="p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-semibold leading-tight text-[var(--color-text)]">
                      {bookingTarget || `${bookingLabel} reservation`}
                    </h2>
                    <p className="mt-0.5 text-sm text-[var(--color-muted)]">
                      {isTour
                        ? formatDateWithWeekday(visitDate)
                        : `${formatDateWithWeekday(booking.check_in_date)} – ${formatDateWithWeekday(booking.check_out_date)}`}
                    </p>
                    {tab === "upcoming" && booking.status === "confirmed"
                      ? (() => {
                          const countdown = formatCheckInCountdown(visitDate, now);
                          return countdown ? (
                            <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-[color:color-mix(in_srgb,var(--color-secondary)_12%,white)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--color-secondary)]">
                              <Clock className="h-3.5 w-3.5" />
                              {countdown}
                            </p>
                          ) : null;
                        })()
                      : null}
                    <p className="mt-0.5 truncate text-xs text-[var(--color-muted)]">
                      {booking.reservation_code} · Booked {formatLocalDateTime(booking.created_at)}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-[var(--color-muted)]">{isPaymentTab ? "Amount due" : "Total"}</p>
                    <p className="text-lg font-bold leading-tight text-[var(--color-text)]">
                      {formatPeso(isPaymentTab ? remaining : total)}
                    </p>
                    {!isPaymentTab && Number(booking.discount_amount ?? 0) > 0 ? (
                      <p className="mt-0.5 text-[11px] font-semibold text-[var(--color-secondary)]">
                        {booking.promo_code ? `${booking.promo_code} · ` : ""}−{formatPeso(Number(booking.discount_amount))} off
                      </p>
                    ) : null}
                    {isPaymentTab && minimumPayNow > 0 ? (
                      <p className="mt-0.5 text-[11px] text-[var(--color-muted)]">Min. now {formatPeso(minimumPayNow)}</p>
                    ) : null}
                  </div>
                </div>

                {isPaymentTab ? (
                  <p className="mt-3 rounded-2xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium leading-relaxed text-amber-800">
                    Pay the deposit with GCash to hold this booking. The deposit is non-refundable if you cancel.
                  </p>
                ) : flowHint ? (
                  <p className="mt-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-xs font-medium leading-relaxed text-[var(--color-text)]">
                    {flowHint}
                  </p>
                ) : null}

                <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm">
                  <span className="text-[var(--color-muted)]">
                    Payment <span className="font-semibold text-[var(--color-text)]">{paymentMeta.label}</span>
                  </span>
                  <span className="text-[var(--color-muted)]">
                    Paid <span className="font-semibold text-[var(--color-text)]">{formatPeso(paid)}</span>
                  </span>
                  {remaining > 0 ? (
                    <span className="text-[var(--color-muted)]">
                      Balance <span className="font-semibold text-[var(--color-secondary)]">{formatPeso(remaining)}</span>
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void openDetails(booking.reservation_id)}
                    className="ml-auto inline-flex items-center gap-1 font-semibold text-[var(--color-secondary)] hover:underline"
                  >
                    <Eye className="h-4 w-4 shrink-0 stroke-[2.2]" aria-hidden="true" />
                    View details
                  </button>
                </div>

                {booking.status === "pending_payment" || showSecondaryActions ? (
                  <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
                    {booking.status === "pending_payment" ? (
                      <button
                        type="button"
                        className="guest-primary-cta min-h-11 px-4 text-sm"
                        onClick={() => setGcashFor(booking)}
                      >
                        Pay {formatPeso(minimumPayNow)} with GCash
                      </button>
                    ) : null}
                    {canCancel ? (
                      <button
                        type="button"
                        className="guest-danger-ghost min-h-11 px-4 text-sm"
                        onClick={() => setCancelFor(booking)}
                      >
                        Cancel booking
                      </button>
                    ) : null}
                  </div>
                ) : null}

                {booking.status === "checked_out" ? (
                  <div className="mt-4 flex flex-col gap-2 border-t border-[var(--color-border)] pt-3 sm:flex-row sm:items-center sm:justify-between">
                    {reviewedByReservation.has(booking.reservation_id) ? (
                      <span className="inline-flex items-center gap-1.5 text-sm text-[var(--color-muted)]">
                        <Star className="h-4 w-4 fill-[var(--color-cta)] text-[var(--color-cta)]" aria-hidden="true" />
                        You rated this stay {reviewedByReservation.get(booking.reservation_id)}/5
                      </span>
                    ) : (
                      <>
                        <span className="text-sm text-[var(--color-muted)]">How was your stay?</span>
                        <button
                          type="button"
                          className="guest-secondary-cta min-h-11 px-4 text-sm"
                          onClick={() => openReview(booking)}
                        >
                          Leave a review
                        </button>
                      </>
                    )}
                  </div>
                ) : null}
              </div>
            </article>
          );
          })}
        </div>
      </div>

      {canLoadMore ? (
        <div className="mt-2 flex justify-center">
          <button
            type="button"
            onClick={() => void fetchBookings(nextCursor, "append")}
            className="guest-secondary-cta px-4 text-sm"
            disabled={loadingMore}
          >
            {loadingMore ? "Loading..." : "Load more"}
          </button>
        </div>
      ) : null}

      {(detailsLoading || details) && (
        <ModalDialog
          titleId="booking-details-title"
          title={details?.reservation_code ?? "Loading..."}
          zIndexClass="z-[70]"
          maxWidthClass="md:max-w-2xl"
          panelClassName="max-h-[calc(100dvh-0.9rem)] border-[var(--color-border)] bg-white pb-[calc(1rem+env(safe-area-inset-bottom))]"
          onClose={() => {
            setDetails(null);
            setFolio(null);
          }}
        >
            {detailsLoading ? <p className="text-sm text-[var(--color-muted)]" role="status">Loading details...</p> : null}
            {detailsError ? <p className="mb-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{detailsError}</p> : null}

            {details ? (
              <div className="space-y-4">
                {(() => {
                  const statusMeta = getReservationStatusMeta(details.status);
                  const statusTone = getReservationStatusTone(details.status);
                  return (
                    <section className={`rounded-2xl border px-4 py-3 ${statusTone.panelClassName}`} aria-label="Reservation status">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] opacity-80">Reservation status</p>
                          <div className="mt-2 flex items-center gap-2">
                            <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${statusTone.dotClassName}`} aria-hidden="true" />
                            <p className="text-base font-bold">{statusMeta.label}</p>
                          </div>
                          <p className="mt-1 text-xs leading-relaxed opacity-90">{statusTone.helper}</p>
                        </div>
                        <span className="rounded-full border border-current/15 bg-white/55 px-3 py-1 text-xs font-bold">
                          {details.status.replace(/_/g, " ")}
                        </span>
                      </div>
                    </section>
                  );
                })()}

                {detailUnits.length > 0 ? (
                  <section>
                    <h4 className="mb-2 text-sm font-semibold text-[var(--color-text)]">Units</h4>
                    {detailUnits.map((row) => (
                      <div key={row.reservation_unit_id} className="mb-2 rounded-lg border border-[var(--color-border)] p-3">
                        <div>
                          <strong>
                            {(() => {
                              const label = getUnitLabel(row.unit?.name || "Unit");
                              return label.subtitle ? `${label.title} (${label.subtitle})` : label.title;
                            })()}
                          </strong>
                          <p className="text-xs text-[var(--color-muted)]">
                            {row.quantity_or_nights} night(s) x {formatPeso(row.rate_snapshot)}
                          </p>
                          {row.unit?.amenities?.length ? <p className="text-xs text-[var(--color-muted)]">Amenities: {row.unit.amenities.join(", ")}</p> : null}
                          {normalizeUnitImageUrls(row.unit?.image_urls, row.unit?.image_url).length ? (
                            <button
                              type="button"
                              onClick={() => openUnitGallery(row.unit ?? null)}
                              className="guest-secondary-cta guest-secondary-cta-sm mt-2 rounded-md"
                            >
                              View photos
                            </button>
                          ) : null}
                        </div>
                        <p className="mt-2 text-sm font-semibold text-[var(--color-text)]">{formatPeso(row.quantity_or_nights * row.rate_snapshot)}</p>
                      </div>
                    ))}
                  </section>
                ) : null}

                {detailTours.length > 0 ? (
                  <section>
                    <h4 className="mb-2 text-sm font-semibold text-[var(--color-text)]">Tours</h4>
                    {detailTours.map((row) => (
                      <div key={row.service_booking_id} className="mb-2 rounded-lg border border-[var(--color-border)] p-3">
                        <div>
                          <strong>{row.service?.service_name ?? "Tour service"}</strong>
                          <p className="text-xs text-[var(--color-muted)]">Date: {formatDateWithWeekday(row.visit_date)}</p>
                        </div>
                        <p className="mt-2 text-sm font-semibold text-[var(--color-text)]">{formatPeso(row.total_amount)}</p>
                      </div>
                    ))}
                  </section>
                ) : null}

                {(() => {
                  const discount = Number(details.discount_amount ?? 0);
                  const total = Number(details.total_amount ?? 0);
                  const subtotal = total + discount;
                  const paid = Number(details.amount_paid_verified ?? 0);
                  const balance = Math.max(0, total - paid);
                  return (
                    <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-4">
                      <h4 className="mb-2 text-sm font-semibold text-[var(--color-text)]">Payment</h4>
                      <dl className="space-y-1.5 text-sm">
                        {discount > 0 ? (
                          <>
                            <div className="flex justify-between">
                              <dt className="text-[var(--color-muted)]">Subtotal</dt>
                              <dd className="text-[var(--color-text)]">{formatPeso(subtotal)}</dd>
                            </div>
                            <div className="flex justify-between text-[var(--color-secondary)]">
                              <dt>{details.promo_code ? `Promo · ${details.promo_code}` : "Promo"}</dt>
                              <dd>−{formatPeso(discount)}</dd>
                            </div>
                          </>
                        ) : null}
                        <div className="flex justify-between border-t border-[var(--color-border)] pt-1.5 font-semibold text-[var(--color-text)]">
                          <dt>Total</dt>
                          <dd>{formatPeso(total)}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-[var(--color-muted)]">Paid</dt>
                          <dd className="font-semibold text-[var(--color-text)]">{formatPeso(paid)}</dd>
                        </div>
                        {balance > 0 ? (
                          <div className="flex justify-between">
                            <dt className="text-[var(--color-muted)]">Balance due</dt>
                            <dd className="font-semibold text-[var(--color-text)]">{formatPeso(balance)}</dd>
                          </div>
                        ) : null}
                      </dl>
                    </section>
                  );
                })()}

                {folio && folio.addons.length > 0 ? (
                  <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-4" aria-label="Stay charges">
                    <h4 className="text-sm font-semibold text-[var(--color-text)]">Your stay charges</h4>
                    <p className="mt-0.5 text-xs text-[var(--color-muted)]">
                      Services you requested during your stay. These are added to your bill and settled at check-out.
                    </p>
                    <ul className="mt-3 space-y-1.5 text-sm">
                      {folio.addons.map((line) => (
                        <li key={line.request_id} className="flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate text-[var(--color-text)]">
                            {line.service_name}
                            {line.quantity > 1 ? <span className="text-[var(--color-muted)]"> ×{line.quantity}</span> : null}
                          </span>
                          <span className="shrink-0 font-medium text-[var(--color-text)]">{formatPeso(line.line_total)}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-2 flex items-center justify-between border-t border-[var(--color-border)] pt-2">
                      <span className="text-[13px] font-semibold text-[var(--color-text)]">Total to settle at check-out</span>
                      <span className="text-lg font-bold text-[var(--color-text)]">{formatPeso(folio.grand_total_due)}</span>
                    </div>
                  </section>
                ) : folioLoading ? (
                  <p className="text-xs text-[var(--color-muted)]" role="status">Loading your stay charges…</p>
                ) : null}
              </div>
            ) : null}
        </ModalDialog>
      )}

      {gcashFor
        ? (() => {
            const gTotal = Number(gcashFor.total_amount ?? 0);
            const gPaid = Number(gcashFor.amount_paid_verified ?? 0);
            const gRemaining = Math.max(0, gTotal - gPaid);
            const gExpected = Number(gcashFor.expected_pay_now ?? 0);
            const gPayNow = gExpected > 0 ? gExpected : gRemaining;
            const gBalanceDue = Math.max(0, gRemaining - gPayNow);
            return (
              <DepositPolicyDialog
                open
                payNow={gPayNow}
                balanceDue={gBalanceDue}
                busy={gcashBusy}
                onConfirm={() => void startGcashCheckout()}
                onClose={() => setGcashFor(null)}
              />
            );
          })()
        : null}

      {qrFor ? (
        <ModalDialog
          titleId="checkin-qr-title"
          title="Your check-in pass"
          zIndexClass="z-[70]"
          maxWidthClass="md:max-w-2xl"
          panelClassName="max-h-[calc(100dvh-0.9rem)] border-[var(--color-border)] bg-white pb-[calc(1rem+env(safe-area-inset-bottom))]"
          onClose={() => {
            setQrFor(null);
            setQrToken(null);
            setQrError(null);
            setQrSecondsLeft(0);
            setQrFromCache(false);
          }}
        >

            <div className="text-center">
              <p className="text-sm text-[var(--color-muted)]">
                Show this code at the front desk to check in.
              </p>
              <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[var(--color-background)] px-3 py-1 text-xs font-semibold text-[var(--color-text)]">
                Booking {qrFor.reservation_code}
              </span>

              {!networkOnline ? (
                <p className="mx-auto mt-3 max-w-sm rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs font-semibold text-amber-800">
                  You&rsquo;re offline — showing your last saved pass. Reconnect to refresh it.
                </p>
              ) : null}

              {qrError ? <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{qrError}</p> : null}
              {qrBusy && !qrToken ? <p className="mt-3 text-sm text-[var(--color-muted)]" role="status">Preparing your pass…</p> : null}

              {qrToken ? (
                <>
                  <div className="mt-4 flex justify-center">
                    <div className="rounded-3xl border border-[var(--color-border)] bg-white p-4 shadow-sm">
                      <QRCodeSVG value={qrCodeValue} size={256} level="M" includeMargin />
                    </div>
                  </div>
                  <p className="mt-3 inline-flex items-center gap-2 text-xs text-[var(--color-muted)]">
                    <span className="relative flex h-2 w-2" aria-hidden="true">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
                    </span>
                    Auto-refreshes to stay valid{qrSecondsLeft > 0 ? ` · ${qrSecondsLeft}s` : ""}
                  </p>
                  {qrFromCache ? (
                    <p className="mt-1.5 text-xs font-semibold text-amber-700">Saved pass shown for offline use.</p>
                  ) : null}
                </>
              ) : null}

              <div className="mt-5 flex justify-center">
                <button
                  type="button"
                  onClick={() => void issueCheckinQr(qrFor.reservation_id)}
                  className="guest-secondary-cta min-h-10 px-4 text-sm"
                  disabled={qrBusy || !networkOnline}
                >
                  {networkOnline ? "Refresh now" : "Reconnect to refresh"}
                </button>
              </div>
            </div>
        </ModalDialog>
      ) : null}

      {reviewFor ? (
        <ModalDialog
          titleId="leave-review-title"
          title="Leave a review"
          zIndexClass="z-[70]"
          maxWidthClass="md:max-w-md"
          panelClassName="max-h-[calc(100dvh-0.75rem)] border-[var(--color-border)] bg-white pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
          onClose={() => setReviewFor(null)}
        >
          <p className="text-sm text-[var(--color-muted)]">
            How was your stay at <strong className="text-[var(--color-text)]">{reviewFor.reservation_code}</strong>?
          </p>

          <div className="mt-4 flex items-center justify-center gap-2" role="radiogroup" aria-label="Rating">
            {[1, 2, 3, 4, 5].map((value) => (
              <button
                key={`star-${value}`}
                type="button"
                role="radio"
                aria-checked={reviewRating === value}
                aria-label={`${value} star${value === 1 ? "" : "s"}`}
                onClick={() => setReviewRating(value)}
                className="rounded-full p-1 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--color-secondary)_30%,white)]"
              >
                <Star
                  className={`h-9 w-9 ${value <= reviewRating ? "fill-[var(--color-cta)] text-[var(--color-cta)]" : "fill-transparent text-[var(--color-border)]"}`}
                  aria-hidden="true"
                />
              </button>
            ))}
          </div>

          <textarea
            value={reviewComment}
            onChange={(event) => setReviewComment(event.target.value)}
            maxLength={1000}
            rows={4}
            placeholder="Share what you loved or what could be better (optional)."
            className="mt-4 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-3 text-sm text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:color-mix(in_srgb,var(--color-secondary)_30%,white)]"
          />

          {reviewError ? (
            <p className="mt-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
              {reviewError}
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => setReviewFor(null)}
              className="guest-secondary-cta min-h-10 min-w-[120px] px-3 text-sm"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void submitReview()}
              disabled={reviewBusy}
              className="guest-primary-cta min-h-10 min-w-[140px] px-3 text-sm"
            >
              {reviewBusy ? "Submitting…" : "Submit review"}
            </button>
          </div>
        </ModalDialog>
      ) : null}

      {cancelFor ? (
        <ModalDialog
          titleId="cancel-booking-title"
          title="Cancel booking?"
          zIndexClass="z-[70]"
          overlayClassName="bg-slate-900/55"
          maxWidthClass="md:max-w-md"
          panelClassName="max-h-[calc(100dvh-0.75rem)] border-[var(--color-border)] bg-white pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
          closeLabel="Close cancel booking dialog"
          closeButtonClassName="h-10 w-10 rounded-full border-2 border-[color:color-mix(in_srgb,var(--color-secondary)_30%,white)] bg-white text-[var(--color-muted)]"
          onClose={() => setCancelFor(null)}
        >
            <p className="text-sm text-[var(--color-muted)]">This booking will be cancelled and removed from active flow.</p>
            <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              {cancellationConsequenceText(cancelFor)}
            </p>
            {cancelError ? <p className="mt-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{cancelError}</p> : null}
            <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => setCancelFor(null)}
                className="guest-secondary-cta min-h-10 min-w-[140px] px-3 text-sm"
              >
                Keep booking
              </button>
              <button
                type="button"
                className="guest-danger-cta min-h-10 min-w-[140px] px-3 text-sm"
                onClick={() => void confirmCancel()}
                disabled={cancelBusy}
              >
                {cancelBusy ? "Cancelling..." : "Cancel booking"}
              </button>
            </div>
        </ModalDialog>
      ) : null}
      {detailGalleryOpen ? (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/55 p-3 md:p-4" role="presentation">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="unit-gallery-title"
            className="max-h-[92vh] w-full overflow-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 md:max-w-3xl md:p-5"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 id="unit-gallery-title" className="text-lg font-semibold text-[var(--color-text)]">{detailGalleryTitle}</h3>
              <button
                type="button"
                onClick={() => {
                  setDetailGalleryOpen(false);
                  setDetailLightboxOpen(false);
                }}
                className="guest-secondary-cta min-h-10 px-3 text-sm"
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
