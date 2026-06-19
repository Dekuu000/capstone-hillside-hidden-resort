"use client";

import { FormEvent, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { Calendar, CircleCheck, CircleX, CreditCard, Eye, Loader2, QrCode, Upload } from "lucide-react";
import type {
  MyBookingsCursor as Cursor,
  MyBookingsResponse as BookingsResponse,
  MyBookingsTab as TabKey,
  PaymentSubmissionResponse,
  QrToken,
  ReservationListItem as Booking,
  ReservationCancelResponse,
  ReservationPolicyOutcome,
} from "../../../packages/shared/src/types";
import { computeStayDepositPreview } from "../../../packages/shared/src/types";
import {
  paymentSubmissionResponseSchema,
  myBookingsResponseSchema,
  qrTokenSchema,
  reservationCancelResponseSchema,
  reservationListItemSchema,
} from "../../../packages/shared/src/schemas";
import { apiFetch } from "../../lib/apiClient";
import { getApiErrorMessage } from "../../lib/apiError";
import { formatCachedAt, formatDateWithWeekday, formatLocalDateTime } from "../../lib/dateDisplay";
import { formatPhpPeso as formatPeso } from "../../lib/formatCurrency";
import { getUnitLabel } from "../../lib/unitLabel";
import { parseJwtSub } from "../../lib/jwt";
import { loadLastIssuedQrToken, saveLastIssuedQrToken } from "../../lib/guestQrTokenCache";
import { useNetworkOnline } from "../../lib/hooks/useNetworkOnline";
import { syncAwareMutation } from "../../lib/offlineSync/mutation";
import { queuePaymentSubmissionWithFile } from "../../lib/offlineSync/paymentSubmission";
import { loadBookingsSnapshot, saveBookingsSnapshot } from "../../lib/offlineSync/store";
import { getReservationStatusMeta } from "../../lib/reservationStatus";
import { getSupabaseBrowserClient } from "../../lib/supabase";
import { compactQrTokenPayload } from "../../lib/qrPayload";
import { BookingStatusTabs } from "../guest/BookingStatusTabs";
import { GuestEmptyState } from "../guest/GuestEmptyState";
import { GuestHero } from "../guest/GuestHero";
import { GuestSearchBar } from "../guest/GuestSearchBar";
import { GuestSyncStatus } from "../guest/GuestSyncStatus";
import { StaySnapshotCard } from "../guest/StaySnapshotCard";
import { ImageLightbox } from "../shared/ImageLightbox";
import { GcashPaymentGuide } from "../shared/GcashPaymentGuide";
import { ModalDialog } from "../shared/ModalDialog";
import { SyncAlertBanner } from "../shared/SyncAlertBanner";
import { UnitImageGallery } from "../shared/UnitImageGallery";
import { normalizeUnitImageUrls, normalizeUnitThumbUrls } from "../../lib/unitMedia";

type MyBookingsClientProps = {
  initialToken?: string | null;
  initialSessionEmail?: string | null;
  initialTab?: TabKey;
  initialData?: BookingsResponse | null;
  initialFocusReservationId?: string | null;
  initialAutoOpenPay?: boolean;
};

const TAB_LABELS: Record<TabKey, string> = {
  upcoming: "Upcoming",
  pending_payment: "Payment",
  completed: "Completed",
  cancelled: "Cancelled",
};

const TAB_HINTS: Record<TabKey, string> = {
  upcoming: "Your upcoming reservations and actions that need attention.",
  pending_payment: "Bookings waiting for payment or payment verification.",
  completed: "Finished reservations for your records.",
  cancelled: "Cancelled reservations and policy outcomes.",
};

const TAB_CARD_ACCENT: Record<TabKey, { cardBorder: string; amountPanel: string; amountText: string }> = {
  upcoming: {
    cardBorder: "border-blue-200/70",
    amountPanel: "border-blue-200 bg-blue-50/60",
    amountText: "text-blue-700",
  },
  pending_payment: {
    cardBorder: "border-orange-200/70",
    amountPanel: "border-orange-200 bg-orange-50/60",
    amountText: "text-orange-700",
  },
  completed: {
    cardBorder: "border-emerald-200/70",
    amountPanel: "border-emerald-200 bg-emerald-50/60",
    amountText: "text-emerald-700",
  },
  cancelled: {
    cardBorder: "border-red-200/70",
    amountPanel: "border-red-200 bg-red-50/60",
    amountText: "text-red-700",
  },
};

const TAB_PAYMENT_PILL_CLASS: Record<TabKey, string> = {
  upcoming: "bg-blue-100 text-blue-800",
  pending_payment: "bg-orange-100 text-orange-800",
  completed: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-red-100 text-red-800",
};

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
  initialAutoOpenPay = false,
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
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestIdRef = useRef(0);
  const didUseInitialUpcomingDataRef = useRef(false);
  const autoOpenPayHandledRef = useRef(false);

  const [details, setDetails] = useState<Booking | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);

  const [submitFor, setSubmitFor] = useState<Booking | null>(null);
  const [submitAmount, setSubmitAmount] = useState("");
  const [submitReferenceNo, setSubmitReferenceNo] = useState("");
  const [submitProofMode, setSubmitProofMode] = useState<"file" | "url">("file");
  const [submitProofFile, setSubmitProofFile] = useState<File | null>(null);
  const [submitProofUrl, setSubmitProofUrl] = useState("");
  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitProgress, setSubmitProgress] = useState<string | null>(null);

  const [cancelFor, setCancelFor] = useState<Booking | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);

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
  const [detailGalleryImages, setDetailGalleryImages] = useState<string[]>([]);
  const [detailGalleryThumbs, setDetailGalleryThumbs] = useState<string[]>([]);
  const [detailGalleryTitle, setDetailGalleryTitle] = useState("Unit photos");
  const [detailGalleryIndex, setDetailGalleryIndex] = useState(0);
  const [detailGalleryOpen, setDetailGalleryOpen] = useState(false);
  const [detailLightboxOpen, setDetailLightboxOpen] = useState(false);
  const submitProofInputId = useId();

  const pushActionMessage = useCallback((message: string, withSyncCta = false) => {
    setActionMessage(message);
    setActionHasSyncCta(withSyncCta);
  }, []);

  const openPaymentSubmissionForBooking = useCallback((booking: Booking) => {
    setSubmitFor(booking);
    const bookingTotal = Number(booking.total_amount ?? 0);
    const bookingPaid = Number(booking.amount_paid_verified ?? 0);
    const remaining = Math.max(0, bookingTotal - bookingPaid);
    const depositRequired = Number(booking.deposit_required ?? 0);
    const expected = Number(booking.expected_pay_now ?? 0);
    const suggestedAmount = depositRequired > 0 && expected > 0 ? expected : remaining;
    setSubmitAmount(String(suggestedAmount));
    setSubmitReferenceNo("");
    setSubmitProofMode("file");
    setSubmitProofFile(null);
    setSubmitProofUrl("");
    setSubmitError(null);
    setSubmitProgress(null);
  }, []);

  useEffect(() => {
    const timeout = window.setTimeout(() => setSearchValue(searchInput.trim()), 300);
    return () => window.clearTimeout(timeout);
  }, [searchInput]);

  useEffect(() => {
    if (!submitFor) return;
    router.prefetch("/my-bookings?tab=upcoming");
  }, [router, submitFor]);


  useEffect(() => {
    if (autoOpenPayHandledRef.current) return;
    if (!initialAutoOpenPay || !initialFocusReservationId) return;
    if (tab !== "pending_payment") return;

    const targetBooking = items.find((booking) => booking.reservation_id === initialFocusReservationId);
    if (!targetBooking) return;

    autoOpenPayHandledRef.current = true;
    if (targetBooking.status === "pending_payment") {
      openPaymentSubmissionForBooking(targetBooking);
    }
    const cardElement = document.getElementById(`booking-card-${targetBooking.reservation_id}`);
    if (cardElement) {
      window.setTimeout(() => {
        cardElement.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 120);
    }
  }, [initialAutoOpenPay, initialFocusReservationId, items, openPaymentSubmissionForBooking, tab]);

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
      try {
        const data = await apiFetch<Booking>(
          `/v2/me/bookings/${encodeURIComponent(reservationId)}`,
          { method: "GET" },
          token,
          reservationListItemSchema,
        );
        setDetails(data);
      } catch (unknownError) {
        setDetailsError(getApiErrorMessage(unknownError, "Failed to load booking details."));
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
      setSubmitProgress("Preparing payment submission...");

      try {
        const paymentType = requiresDepositFlow
          ? (amount >= totalAmount ? "full" : "deposit")
          : "full";
        if (submitProofMode === "file" && submitProofFile && typeof navigator !== "undefined" && !navigator.onLine) {
          setSubmitProgress("Saving proof for offline sync...");
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
          setSubmitProgress("Opening your updated booking...");
          setTab("upcoming");
          router.replace("/my-bookings?tab=upcoming");
          return;
        }

        setSubmitProgress("Preparing payment record...");
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

        setSubmitProgress(submitProofMode === "file" ? "Uploading payment proof..." : "Checking proof link...");
        const proofPath = await uploadProofIfNeeded(submitFor.reservation_id);
        setSubmitProgress("Sending proof to admin...");
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
        setSubmitProgress("Opening your updated booking...");
        setTab("upcoming");
        router.replace("/my-bookings?tab=upcoming");
      } catch (unknownError) {
        const message = getApiErrorMessage(unknownError, "Failed to submit payment.");
        if (message.toLowerCase().includes("deposit is not required")) {
          setSubmitError(
            `This booking requires full payment. Update amount to ${formatPeso(Math.max(0, Number(submitFor.total_amount ?? 0) - Number(submitFor.amount_paid_verified ?? 0)))} and submit again.`,
          );
        } else {
          setSubmitError(message);
        }
      } finally {
        setSubmitBusy(false);
        setSubmitProgress(null);
      }
    },
    [
      router,
      submitAmount,
      submitFor,
      submitProofFile,
      submitProofMode,
      submitProofUrl,
      submitReferenceNo,
      token,
      uploadProofIfNeeded,
      pushActionMessage,
    ],
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
    setSubmitProgress(null);
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

  return (
    <section className="mx-auto flex w-full max-w-[1240px] flex-col gap-5 overflow-x-hidden lg:gap-5">
      <div className="lg:hidden">
        <GuestHero
          testId="guest-hero"
          dark
          eyebrow="Guest Portal"
          title="My Bookings"
          rightSlot={(
            <StaySnapshotCard
              nextStayDate={formatDateWithWeekday(summary.nextDate)}
              outstandingBalance={formatPeso(summary.outstanding)}
              qrStatus={summary.qrReady ? "QR ready" : "No QR yet"}
              dark
            />
          )}
        />
      </div>
      <div className="hidden lg:block">
        <GuestHero
          testId="guest-hero"
          dark
          eyebrow="Guest Portal"
          title="My Bookings"
          className="rounded-[2rem] shadow-sm lg:min-h-[198px]"
          contentClassName="lg:min-h-[174px] lg:p-6"
          rightSlot={(
            <StaySnapshotCard
              nextStayDate={formatDateWithWeekday(summary.nextDate)}
              outstandingBalance={formatPeso(summary.outstanding)}
              qrStatus={summary.qrReady ? "QR ready" : "No QR yet"}
              dark
            />
          )}
        />
      </div>

      <section className="rounded-[2rem] border border-[var(--color-border)] bg-white p-4 shadow-sm lg:p-5">
        <div className="lg:hidden" data-testid="guest-tabs">
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <button
              type="button"
              onClick={() => setTab("upcoming")}
              className={`inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-2xl px-4 text-[13px] font-bold leading-none transition ${
                tab === "upcoming"
                  ? "border border-[var(--color-secondary)] bg-teal-50 text-[var(--color-secondary)] shadow-sm"
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
                  ? "border border-[var(--color-secondary)] bg-teal-50 text-[var(--color-secondary)] shadow-sm"
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
                  ? "border border-[var(--color-secondary)] bg-teal-50 text-[var(--color-secondary)] shadow-sm"
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
                  ? "border border-[var(--color-secondary)] bg-teal-50 text-[var(--color-secondary)] shadow-sm"
                  : "text-[var(--color-muted)] hover:bg-[var(--color-background)]"
              }`}
            >
              <CircleX className="h-4 w-4 shrink-0" />
              <span>Cancelled</span>
            </button>
          </div>
        </div>

        <div className="hidden lg:flex lg:items-center lg:justify-between lg:gap-3">
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
            className="w-[390px]"
          />
        </div>
        <div className="mt-3 flex flex-col gap-3 lg:mt-4">
          <p className="text-sm text-[var(--color-muted)]">{TAB_HINTS[tab]}</p>
          <GuestSyncStatus compact />
        </div>
      </section>

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
          const canShowQr = canShowQrForBooking(booking.status);
          const reservationStatusLabel = toTitleCase(booking.status.replace(/_/g, " "));
          const flowHint = bookingFlowHint(booking.status);
          const showSecondaryActions = booking.status !== "pending_payment" && canCancel;
          const accent = TAB_CARD_ACCENT[tab];
          const paymentPillClass = tab === "pending_payment" ? paymentMeta.className : TAB_PAYMENT_PILL_CLASS[tab];

          return (
            <article
              key={booking.reservation_id}
              id={`booking-card-${booking.reservation_id}`}
              className={`rounded-2xl border bg-white p-4 shadow-sm lg:p-3.5 ${accent.cardBorder}`}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="min-w-0 truncate text-[1.5rem] font-bold leading-tight text-[var(--color-text)] lg:text-[1.35rem]">
                      {booking.reservation_code}
                    </h2>
                    {canShowQr ? (
                      <button
                        type="button"
                        onClick={() => {
                          setQrFor(booking);
                          setQrToken(null);
                          setQrError(null);
                          setQrSecondsLeft(0);
                        }}
                        className="guest-secondary-cta h-10 min-h-10 w-10 shrink-0 p-0 text-[var(--color-text)]"
                        aria-label="Show check-in QR"
                        title="Show QR"
                      >
                        <QrCode className="h-4 w-4 shrink-0 stroke-[2.2]" aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm font-medium text-[var(--color-text)]">{bookingTarget || `${bookingLabel} reservation`}</p>
                  <p className="text-xs text-[var(--color-muted)]">Booked on {formatLocalDateTime(booking.created_at)}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <span
                      className={`inline-flex max-w-fit items-center rounded-full px-2 py-1 text-[10px] font-semibold tracking-wide sm:px-2.5 sm:text-[11px] ${statusMeta.className}`}
                    >
                      {reservationStatusLabel}
                    </span>
                    <span
                      className={`inline-flex max-w-fit items-center rounded-full px-2 py-1 text-[10px] font-semibold sm:px-2.5 sm:text-[11px] ${paymentPillClass}`}
                    >
                      {paymentMeta.label}
                    </span>
                    <span className="ml-auto inline-flex items-center rounded-full bg-[var(--color-border)] px-2.5 py-1 text-[11px] font-semibold text-[var(--color-text)]">
                      {isTour ? "Tour booking" : "Stay booking"}
                    </span>
                  </div>
                </div>
                <div className={`rounded-xl border p-2.5 sm:min-w-[150px] ${accent.amountPanel}`}>
                  <p className="text-xs font-medium text-[var(--color-muted)]">{isPaymentTab ? "Amount due" : "Total amount"}</p>
                  <p className={`mt-1 text-[2rem] font-bold leading-tight lg:text-[1.8rem] ${isPaymentTab ? "text-orange-700" : accent.amountText}`}>
                    {formatPeso(isPaymentTab ? remaining : total)}
                  </p>
                  {isPaymentTab && minimumPayNow > 0 ? (
                    <p className="mt-1 text-[11px] font-medium text-[var(--color-muted)]">
                      Minimum pay now: <span className="font-semibold text-[var(--color-text)]">{formatPeso(minimumPayNow)}</span>
                    </p>
                  ) : null}
                </div>
              </div>
              {isPaymentTab ? (
                <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium leading-relaxed text-amber-800">
                  To keep this reservation active, pay at least the minimum deposit first and submit proof. If you cancel this booking, the minimum deposit is non-refundable.
                </p>
              ) : null}
              {flowHint ? (
                <p className="mt-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-xs font-medium leading-relaxed text-[var(--color-text)]">
                  {flowHint}
                </p>
              ) : null}

              <div className="relative mt-3 grid gap-2.5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-3.5 pr-14 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => void openDetails(booking.reservation_id)}
                  className="guest-secondary-cta absolute right-3 top-3 h-9 min-h-9 w-9 p-0 text-[var(--color-text)]"
                  aria-label="View booking details"
                  title="View details"
                >
                  <Eye className="h-4 w-4 shrink-0 stroke-[2.2]" aria-hidden="true" />
                </button>
                <div>
                  <span className="block text-xs text-[var(--color-muted)]">{isTour ? "Visit date" : "Stay dates"}</span>
                  <p className="text-sm font-medium text-[var(--color-text)]">
                    {isTour ? formatDateWithWeekday(visitDate) : `${formatDateWithWeekday(booking.check_in_date)} to ${formatDateWithWeekday(booking.check_out_date)}`}
                  </p>
                </div>
                <div>
                  <span className="block text-xs text-[var(--color-muted)]">Payment status</span>
                  <p className="text-sm font-semibold text-[var(--color-text)]">{paymentMeta.label}</p>
                </div>
                <div>
                  <span className="block text-xs text-[var(--color-muted)]">Amount paid</span>
                  <p className="text-sm font-semibold text-emerald-700">{formatPeso(paid)}</p>
                </div>
                <div>
                  <span className="block text-xs text-[var(--color-muted)]">Outstanding balance</span>
                  <p className={`text-sm font-semibold ${accent.amountText}`}>{formatPeso(remaining)}</p>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-2">
                <div className="hidden lg:ml-auto lg:flex lg:items-center lg:justify-end lg:gap-2">
                  {booking.status === "pending_payment" ? (
                    <>
                      <button
                        type="button"
                        className="guest-primary-cta min-h-10 h-10 w-[132px] px-3 text-xs"
                        onClick={() => openPaymentSubmissionForBooking(booking)}
                      >
                        Submit proof
                      </button>
                      {canCancel ? (
                        <button
                          type="button"
                          className="guest-danger-cta min-h-10 h-10 w-[132px] px-3 text-xs"
                          onClick={() => setCancelFor(booking)}
                        >
                          Cancel booking
                        </button>
                      ) : null}
                    </>
                  ) : null}

                  {showSecondaryActions ? (
                    <button
                      type="button"
                      className="guest-danger-cta min-h-10 h-10 w-[132px] px-3 text-xs"
                      onClick={() => setCancelFor(booking)}
                    >
                      Cancel booking
                    </button>
                  ) : null}
                </div>
              </div>

              <div className="mt-3 space-y-2 lg:hidden">
                {booking.status === "pending_payment" ? (
                  <div className={`grid w-full gap-2 ${canCancel ? "grid-cols-2" : "grid-cols-1"}`}>
                    <button
                      type="button"
                      className="guest-primary-cta min-h-12 w-full px-3 text-sm"
                      onClick={() => openPaymentSubmissionForBooking(booking)}
                    >
                      Submit proof
                    </button>
                    {canCancel ? (
                      <button
                        type="button"
                        className="guest-danger-cta min-h-12 w-full px-3 text-sm"
                        onClick={() => setCancelFor(booking)}
                      >
                        Cancel booking
                      </button>
                    ) : null}
                  </div>
                ) : null}
                {showSecondaryActions ? (
                  <div className="grid w-full grid-cols-1 gap-2">
                    <button
                      type="button"
                      className="guest-danger-cta min-h-11 w-full px-3 text-sm"
                      onClick={() => setCancelFor(booking)}
                    >
                      Cancel booking
                    </button>
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
              </div>
            ) : null}
        </ModalDialog>
      )}

      {submitFor ? (
        <ModalDialog
          titleId="payment-proof-title"
          title="Submit payment proof"
          zIndexClass="z-[70]"
          maxWidthClass="md:max-w-xl"
          panelClassName="max-h-[calc(100dvh-0.75rem)] border-[var(--color-border)] bg-white pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
          onClose={() => {
            if (!submitBusy) closeSubmitModal();
          }}
        >
            <p className="mb-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-3 text-xs text-[var(--color-muted)]">
              Next step after submit: payment status changes to <strong>For verification</strong> while admin reviews your proof. You will be returned to the <strong>Upcoming</strong> tab.
            </p>
            <p className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-medium leading-relaxed text-amber-800">
              Minimum deposit is required first. Guest-initiated cancellation forfeits this minimum deposit.
            </p>
            <div className="mb-3 rounded-xl border border-[var(--color-border)] bg-white p-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--color-muted)]">Payment summary</p>
              <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2">
                  <p className="text-xs text-[var(--color-muted)]">Total amount</p>
                  <p className="font-semibold text-[var(--color-text)]">{formatPeso(Number(submitFor.total_amount ?? 0))}</p>
                </div>
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2">
                  <p className="text-xs text-[var(--color-muted)]">Amount paid</p>
                  <p className="font-semibold text-emerald-700">{formatPeso(Number(submitFor.amount_paid_verified ?? 0))}</p>
                </div>
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2">
                  <p className="text-xs text-[var(--color-muted)]">Remaining balance</p>
                  <p className="font-semibold text-orange-700">
                    {formatPeso(Math.max(0, Number(submitFor.total_amount ?? 0) - Number(submitFor.amount_paid_verified ?? 0)))}
                  </p>
                </div>
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2">
                  <p className="text-xs text-[var(--color-muted)]">Minimum due now</p>
                  <p className="font-semibold text-[var(--color-text)]">
                    {formatPeso(Number(submitFor.expected_pay_now ?? submitFor.deposit_required ?? 0))}
                  </p>
                </div>
              </div>
            </div>
            <form className="grid gap-3" onSubmit={submitPayment}>
              <label className="guest-form-label">
                Amount
                <input
                  type="number"
                  min={1}
                  value={submitAmount ?? ""}
                  onChange={(event) => setSubmitAmount(event.target.value)}
                  required
                  className="guest-field-control"
                />
              </label>
              <p className="guest-surface-soft px-3 py-2 text-xs text-[var(--color-muted)]">
                Minimum payment now:{" "}
                <strong className="text-[var(--color-text)]">
                  {formatPeso(
                    Number(submitFor.expected_pay_now ?? submitFor.deposit_required ?? 0),
                  )}
                </strong>
                {submitFor.deposit_rule_applied ? (
                  <span className="ml-1 text-[var(--color-muted)]">({submitFor.deposit_rule_applied})</span>
                ) : null}
              </p>
              <label className="guest-form-label">
                Reference number
                <input
                  type="text"
                  value={submitReferenceNo ?? ""}
                  onChange={(event) => setSubmitReferenceNo(event.target.value)}
                  placeholder="Reference number (optional)"
                  className="guest-field-control"
                />
              </label>

              <GcashPaymentGuide compact onCopyMessage={(message) => pushActionMessage(message)} />

              <div className="grid gap-2">
                <p className="text-sm text-[var(--color-text)]">Payment proof</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSubmitProofMode("file")}
                    className="guest-toggle-pill"
                    data-active={submitProofMode === "file"}
                  >
                    Upload file
                  </button>
                  <button
                    type="button"
                    onClick={() => setSubmitProofMode("url")}
                    className="guest-toggle-pill"
                    data-active={submitProofMode === "url"}
                  >
                    Proof URL
                  </button>
                </div>

                {submitProofMode === "file" ? (
                  <div className="grid gap-2">
                    <label
                      htmlFor={submitProofInputId}
                      className="group inline-flex min-h-14 w-full cursor-pointer items-center justify-between gap-3 rounded-2xl border border-[var(--color-border)] bg-white px-4 py-3 transition hover:border-[var(--color-secondary)] hover:bg-teal-50/20"
                    >
                      <span className="min-w-0 text-sm font-semibold text-[var(--color-text)] transition group-hover:text-[var(--color-secondary)]">
                        <span className="block truncate">{submitProofFile ? "Change payment proof" : "Upload payment proof"}</span>
                        <span className="block text-xs font-medium text-[var(--color-muted)] transition group-hover:text-[var(--color-muted)]">
                          JPG, PNG, or PDF
                        </span>
                      </span>
                      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] text-[var(--color-muted)] transition group-hover:border-[var(--color-secondary)] group-hover:bg-teal-50 group-hover:text-[var(--color-secondary)]">
                        <Upload className="h-4 w-4" />
                      </span>
                    </label>
                    <input
                      id={submitProofInputId}
                      type="file"
                      accept="image/*,.pdf"
                      onChange={(event) => setSubmitProofFile(event.target.files?.[0] ?? null)}
                      className="sr-only"
                    />
                    {submitProofFile ? (
                      <div className="flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                        <span className="inline-flex min-w-0 items-center gap-2">
                          <CircleCheck className="h-4 w-4 shrink-0" />
                          <span className="truncate font-medium">{submitProofFile.name}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setSubmitProofFile(null);
                            const input = document.getElementById(submitProofInputId) as HTMLInputElement | null;
                            if (input) input.value = "";
                          }}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-semibold text-emerald-800 transition hover:bg-emerald-100"
                        >
                          <CircleX className="h-3.5 w-3.5" />
                          Remove
                        </button>
                      </div>
                    ) : (
                      <p className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-xs text-[var(--color-muted)]">
                        No file chosen
                      </p>
                    )}
                  </div>
                ) : (
                  <input
                    type="url"
                    value={submitProofUrl ?? ""}
                    onChange={(event) => setSubmitProofUrl(event.target.value)}
                    placeholder="https://..."
                    required={submitProofMode === "url"}
                    className="guest-field-control"
                  />
                )}
              </div>
              {submitBusy ? (
                <div
                  className="flex items-center gap-3 rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-semibold text-teal-800"
                  role="status"
                  aria-live="polite"
                >
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
                  <span>{submitProgress ?? "Submitting payment proof..."}</span>
                </div>
              ) : null}
              {submitError ? <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{submitError}</p> : null}
              <div className="sticky bottom-0 mt-1 flex justify-end gap-2 border-t border-[var(--color-border)] bg-white/95 pt-3 backdrop-blur">
                <button
                  type="button"
                  onClick={closeSubmitModal}
                  className="guest-secondary-cta min-h-10 px-3 text-sm"
                  disabled={submitBusy}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="guest-primary-cta min-h-10 px-3 text-sm"
                  disabled={submitBusy}
                >
                  {submitBusy ? "Submitting..." : "Submit"}
                </button>
              </div>
            </form>
        </ModalDialog>
      ) : null}

      {qrFor ? (
        <ModalDialog
          titleId="checkin-qr-title"
          title="Check-in QR Token"
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

            <p className="text-sm text-[var(--color-muted)]">
              Reservation: <strong>{qrFor.reservation_code}</strong>
            </p>
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              Token refreshes automatically near expiry. Share this payload with the admin scanner.
            </p>
            {!networkOnline ? (
              <p className="mt-1 text-xs font-semibold text-amber-700">
                Offline: new token issuance is unavailable. Last cached token is shown if present.
              </p>
            ) : null}

            {qrError ? <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">{qrError}</p> : null}
            {qrBusy ? <p className="mt-3 text-sm text-[var(--color-muted)]" role="status">Generating token...</p> : null}

            {qrToken ? (
              <>
                <div className="mt-3 grid gap-2 text-xs text-[var(--color-muted)] sm:grid-cols-2">
                  <p>
                    Expires: <strong>{formatLocalDateTime(qrToken.expires_at)}</strong>
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
                <div className="mt-3 flex justify-center rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-4">
                  <QRCodeSVG value={qrCodeValue} size={300} level="M" includeMargin />
                </div>

                <textarea
                  readOnly
                  value={qrPayload}
                  className="mt-3 min-h-[200px] w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] p-3 font-mono text-xs text-[var(--color-text)]"
                />
              </>
            ) : null}

            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => void issueCheckinQr(qrFor.reservation_id)}
                className="guest-secondary-cta min-h-10 px-3 text-sm"
                disabled={qrBusy || !networkOnline}
              >
                {networkOnline ? "Refresh now" : "Reconnect to refresh"}
              </button>
              <button
                type="button"
                onClick={() => void copyQrPayload()}
                className="guest-primary-cta min-h-10 px-3 text-sm"
                disabled={!qrToken}
              >
                Copy payload
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
          closeButtonClassName="h-10 w-10 rounded-full border-2 border-teal-200 bg-white text-[var(--color-muted)]"
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
