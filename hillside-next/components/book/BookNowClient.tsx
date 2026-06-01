"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BedDouble,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleCheckBig,
  Loader2,
  ShieldCheck,
  Users,
} from "lucide-react";
import type {
  AvailableUnitsResponse,
  PricingRecommendation,
  ReservationCreateResponse,
} from "../../../packages/shared/src/types";
import { computeStayDepositPreview } from "../../../packages/shared/src/types";
import {
  availableUnitsResponseSchema,
  reservationCreateResponseSchema,
} from "../../../packages/shared/src/schemas";
import { apiFetch } from "../../lib/apiClient";
import { getAiSource } from "../../lib/aiPricing";
import { getApiErrorMessage } from "../../lib/apiError";
import { addDaysToIsoDate, todayPlusLocalIsoDate } from "../../lib/dateIso";
import { formatPhpPeso as toPeso } from "../../lib/formatCurrency";
import { getUnitLabel } from "../../lib/unitLabel";
import { useNetworkOnline } from "../../lib/hooks/useNetworkOnline";
import { getSupabaseBrowserClient, safeGetSession } from "../../lib/supabase";
import { FancyDatePicker } from "../shared/FancyDatePicker";
import { ImageLightbox } from "../shared/ImageLightbox";
import { ModalDialog } from "../shared/ModalDialog";
import { SyncAlertBanner } from "../shared/SyncAlertBanner";
import { UnitImageGallery } from "../shared/UnitImageGallery";
import { normalizeUnitImageUrls, normalizeUnitThumbUrls } from "../../lib/unitMedia";
import { syncAwareMutation } from "../../lib/offlineSync/mutation";
import { BookingStepper } from "../guest/BookingStepper";
import { GuestHero } from "../guest/GuestHero";
import { GuestPageShell } from "../guest/GuestPageShell";
import { GuestSectionCard } from "../guest/GuestSectionCard";
import { PaymentVerificationInfo } from "../guest/PaymentVerificationInfo";

type AvailableUnit = AvailableUnitsResponse["items"][number];
type UnitTypeFilter = "all" | "room" | "cottage" | "amenity";

const UNIT_TYPE_LABEL: Record<UnitTypeFilter, string> = {
  all: "units",
  room: "rooms",
  cottage: "cottages",
  amenity: "amenities",
};

const PAX_BASED_UNIT_PRICING: Record<string, { includedPax: number; fallbackMinRate: number; extraPaxRate: number }> = {
  "AMN-EVERGREEN-PAVILION": { includedPax: 30, fallbackMinRate: 8500, extraPaxRate: 250 },
  "AMN-PINECREST-EXCLUSIVE": { includedPax: 20, fallbackMinRate: 12000, extraPaxRate: 400 },
};

function getUnitNightlyRate(unit: AvailableUnit, partySize: number): number {
  const baseRate = Number(unit.base_price || 0);
  const unitCode = String(unit.unit_code || "").toUpperCase();
  const dynamicRule = PAX_BASED_UNIT_PRICING[unitCode];
  if (!dynamicRule) return baseRate;
  const includedPax = dynamicRule.includedPax;
  const minRate = baseRate > 0 ? baseRate : dynamicRule.fallbackMinRate;
  const extraPax = Math.max(0, Math.max(1, Math.floor(partySize || 1)) - includedPax);
  return minRate + extraPax * dynamicRule.extraPaxRate;
}

function isPaxPricedUnit(unit: AvailableUnit): boolean {
  const unitCode = String(unit.unit_code || "").toUpperCase();
  return Boolean(PAX_BASED_UNIT_PRICING[unitCode]);
}

type BookNowClientProps = {
  initialToken?: string | null;
  initialSessionEmail?: string | null;
  initialCheckInDate?: string;
  initialCheckOutDate?: string;
  initialUnitsData?: AvailableUnitsResponse | null;
};

export function BookNowClient({
  initialToken = null,
  initialSessionEmail = null,
  initialCheckInDate,
  initialCheckOutDate,
  initialUnitsData = null,
}: BookNowClientProps) {
  const router = useRouter();
  const tomorrow = useMemo(() => todayPlusLocalIsoDate(1), []);
  const defaultCheckout = useMemo(() => todayPlusLocalIsoDate(3), []);

  const [token, setToken] = useState<string | null>(initialToken);
  const [sessionLoading, setSessionLoading] = useState(!initialToken);
  const [sessionEmail, setSessionEmail] = useState<string | null>(initialSessionEmail);

  const [checkInDate, setCheckInDate] = useState(initialCheckInDate || tomorrow);
  const [checkOutDate, setCheckOutDate] = useState(initialCheckOutDate || defaultCheckout);
  const [unitTypeFilter, setUnitTypeFilter] = useState<UnitTypeFilter>("all");
  const [guestCount, setGuestCount] = useState(1);
  const [guestCountInput, setGuestCountInput] = useState("1");

  const [units, setUnits] = useState<AvailableUnit[]>(initialUnitsData?.items ?? []);
  const [unitsLoading, setUnitsLoading] = useState(false);
  const [unitsError, setUnitsError] = useState<string | null>(null);
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);

  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [unitAvailabilityAlert, setUnitAvailabilityAlert] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [successHasSyncCta, setSuccessHasSyncCta] = useState(false);
  const [latestAiRecommendation, setLatestAiRecommendation] = useState<PricingRecommendation | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [galleryUnit, setGalleryUnit] = useState<AvailableUnit | null>(null);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const networkOnline = useNetworkOnline();

  const applyGuestCount = (next: number) => {
    const safe = Math.max(1, next);
    setGuestCount(safe);
    setGuestCountInput(String(safe));
  };

  const initialQueryKey = `${initialCheckInDate || tomorrow}|${initialCheckOutDate || defaultCheckout}|all`;
  const [skipInitialFetch, setSkipInitialFetch] = useState(Boolean(initialUnitsData && initialToken));

  useEffect(() => {
    if (initialToken) {
      return;
    }
    let mounted = true;
    const supabase = getSupabaseBrowserClient();
    void safeGetSession().then(({ session }) => {
      if (!mounted) return;
      setToken(session?.access_token ?? null);
      setSessionEmail(session?.user.email ?? null);
      setSessionLoading(false);
    });
    const { data: authSub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setToken(session?.access_token ?? null);
      setSessionEmail(session?.user.email ?? null);
    });
    return () => {
      mounted = false;
      authSub.subscription.unsubscribe();
    };
  }, [initialToken]);

  useEffect(() => {
    if (!token) return;
    if (!checkInDate || !checkOutDate) return;
    if (checkOutDate <= checkInDate) return;
    if (skipInitialFetch && `${checkInDate}|${checkOutDate}|${unitTypeFilter}` === initialQueryKey) {
      setSkipInitialFetch(false);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setUnitsLoading(true);
      setUnitsError(null);
      try {
        const qs = new URLSearchParams({
          check_in_date: checkInDate,
          check_out_date: checkOutDate,
        });
        if (unitTypeFilter !== "all") {
          qs.set("unit_type", unitTypeFilter);
        }
        const data = await apiFetch<AvailableUnitsResponse>(
          `/v2/catalog/units/available?${qs.toString()}`,
          { method: "GET" },
          token,
          availableUnitsResponseSchema,
        );
        if (cancelled) return;
        setUnits(data.items ?? []);
        setSelectedUnitIds((prev) => prev.filter((id) => (data.items ?? []).some((u) => u.unit_id === id)));
      } catch (unknownError) {
        if (cancelled) return;
        setUnits([]);
        setSelectedUnitIds([]);
        setUnitsError(getApiErrorMessage(unknownError, "Failed to load available units."));
      } finally {
        if (!cancelled) setUnitsLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [checkInDate, checkOutDate, token, initialQueryKey, skipInitialFetch, refreshNonce, unitTypeFilter]);

  const nights = useMemo(() => {
    if (!checkInDate || !checkOutDate || checkOutDate <= checkInDate) return 0;
    const from = new Date(`${checkInDate}T00:00:00`);
    const to = new Date(`${checkOutDate}T00:00:00`);
    return Math.max(0, Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)));
  }, [checkInDate, checkOutDate]);

  const selectedUnits = useMemo(() => units.filter((unit) => selectedUnitIds.includes(unit.unit_id)), [selectedUnitIds, units]);
  const total = useMemo(
    () => selectedUnits.reduce((sum, unit) => sum + getUnitNightlyRate(unit, guestCount) * nights, 0),
    [guestCount, nights, selectedUnits],
  );
  const minimumPayNow = useMemo(() => computeStayDepositPreview(total), [total]);
  const unitCount = units.length;
  const selectedCapacity = useMemo(
    () => selectedUnits.reduce((sum, unit) => sum + Number(unit.capacity || 0), 0),
    [selectedUnits],
  );
  const hasCapacityGap = selectedUnitIds.length > 0 && selectedCapacity < guestCount;
  const submitBlockerMessage = useMemo(() => {
    if (selectedUnitIds.length === 0) return "Select at least one unit to continue.";
    if (nights <= 0) return "Choose a valid check-in and check-out date.";
    if (guestCount <= 0) return "Guest count must be at least 1.";
    if (hasCapacityGap) return `Selected units can host up to ${selectedCapacity} guest(s).`;
    return null;
  }, [guestCount, hasCapacityGap, nights, selectedCapacity, selectedUnitIds.length]);
  const canSubmitReservation = submitBlockerMessage === null;
  const bookingStep = useMemo(() => {
    if (!checkInDate || !checkOutDate || nights <= 0) return 1;
    if (selectedUnitIds.length === 0) return 2;
    if (!canSubmitReservation) return 3;
    return 4;
  }, [canSubmitReservation, checkInDate, checkOutDate, nights, selectedUnitIds.length]);
  const desktopStepperStep = useMemo(() => {
    if (!checkInDate || !checkOutDate || nights <= 0 || guestCount <= 0) return 1;
    if (selectedUnitIds.length === 0) return 2;
    return 3;
  }, [checkInDate, checkOutDate, guestCount, nights, selectedUnitIds.length]);
  const [mobileStep, setMobileStep] = useState(1);

  const galleryImages = useMemo(
    () => normalizeUnitImageUrls(galleryUnit?.image_urls, galleryUnit?.image_url),
    [galleryUnit],
  );
  const galleryThumbs = useMemo(
    () => normalizeUnitThumbUrls(galleryImages, galleryUnit?.image_thumb_urls ?? null),
    [galleryImages, galleryUnit],
  );
  const closeGalleryModal = () => {
    setGalleryUnit(null);
    setLightboxOpen(false);
    setGalleryIndex(0);
  };

  const toggleUnit = (unitId: string) => {
    if (unitAvailabilityAlert) {
      setUnitAvailabilityAlert(null);
    }
    setSelectedUnitIds((prev) => (prev.includes(unitId) ? prev.filter((id) => id !== unitId) : [...prev, unitId]));
  };

  const createReservation = async () => {
    if (!token) return;
    if (!selectedUnitIds.length) {
      setSubmitError("Select at least one unit.");
      return;
    }
    if (!checkInDate || !checkOutDate || checkOutDate <= checkInDate) {
      setSubmitError("Select a valid check-in and check-out date.");
      return;
    }
    if (guestCount <= 0) {
      setSubmitError("Guest count must be greater than zero.");
      return;
    }
    if (hasCapacityGap) {
      setSubmitError(`Selected units can host up to ${selectedCapacity} guest(s).`);
      return;
    }
    setSubmitBusy(true);
    setSubmitError(null);
    setUnitAvailabilityAlert(null);
    setSuccessMessage(null);
    setSuccessHasSyncCta(false);
    setLatestAiRecommendation(null);
    try {
      const payload = {
        check_in_date: checkInDate,
        check_out_date: checkOutDate,
        unit_ids: selectedUnitIds,
        guest_count: guestCount,
        idempotency_key: crypto.randomUUID(),
      };

      const outcome = await syncAwareMutation<typeof payload, ReservationCreateResponse>({
        path: "/v2/reservations",
        method: "POST",
        payload,
        parser: reservationCreateResponseSchema,
        accessToken: token,
        entityType: "reservation",
        action: "reservations.create",
        buildOptimisticResponse: () => ({
          reservation_id: `offline-${crypto.randomUUID()}`,
          reservation_code: "OFFLINE-QUEUED",
          status: "pending_payment",
          escrow_ref: null,
          ai_recommendation: null,
        }),
      });
      if (outcome.mode === "online") {
        setSuccessMessage(`Reservation ${outcome.data.reservation_code} created.`);
        setSuccessHasSyncCta(false);
        setLatestAiRecommendation(outcome.data.ai_recommendation ?? null);
        const createdReservationId = String(outcome.data.reservation_id || "").trim();
        const redirectUrl = createdReservationId
          ? `/my-bookings?tab=pending_payment&focus=${encodeURIComponent(createdReservationId)}&pay=1`
          : "/my-bookings?tab=pending_payment";
        window.setTimeout(() => {
          router.push(redirectUrl);
        }, 900);
      } else {
        setSuccessMessage("Reservation saved offline. It will sync automatically when connection is restored.");
        setSuccessHasSyncCta(true);
        setLatestAiRecommendation(null);
      }
    } catch (unknownError) {
      const errorMessage = getApiErrorMessage(unknownError, "Failed to create reservation.");
      if (/(unavailable|not available|fully booked|already booked)/i.test(errorMessage)) {
        setUnitAvailabilityAlert(
          "One or more selected units are no longer available for your dates. Please choose another available unit.",
        );
        setSubmitError(null);
        setMobileStep(2);
        setRefreshNonce((value) => value + 1);
      } else {
        setSubmitError(errorMessage);
      }
    } finally {
      setSubmitBusy(false);
    }
  };

  const openConfirmDialog = () => {
    if (!canSubmitReservation) {
      setSubmitError(submitBlockerMessage || "Complete the booking details before confirming.");
      if (selectedUnitIds.length === 0) {
        setMobileStep(2);
      } else if (hasCapacityGap || nights <= 0 || guestCount <= 0) {
        setMobileStep(1);
      }
      return;
    }
    setSubmitError(null);
    setConfirmDialogOpen(true);
  };

  if (sessionLoading) {
    return (
      <GuestPageShell className="max-w-[1280px] px-0">
        <div className="mb-5 grid gap-4 rounded-[2rem] border border-slate-200/80 bg-[var(--color-surface)] p-5 shadow-sm md:p-6">
          <div className="skeleton h-5 w-36" />
          <div className="skeleton h-10 w-72" />
          <div className="skeleton h-4 w-60" />
        </div>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-6">
          <div className="surface rounded-[2rem] border-slate-200/80 p-5 md:p-6">
            <div className="skeleton h-6 w-48" />
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="skeleton h-14" />
              <div className="skeleton h-14" />
            </div>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <div className="skeleton h-56" />
              <div className="skeleton h-56" />
            </div>
          </div>
          <div className="surface rounded-[2rem] border-slate-200/80 p-5 md:p-6">
            <div className="skeleton h-6 w-40" />
            <div className="mt-4 space-y-3">
              <div className="skeleton h-14" />
              <div className="skeleton h-14" />
              <div className="skeleton h-14" />
            </div>
          </div>
        </div>
      </GuestPageShell>
    );
  }

  if (!token) {
    return (
      <GuestPageShell className="max-w-[1280px] px-0">
        <GuestHero
          testId="booking-header"
          dark
          eyebrow="Guest Portal"
          title="Book Your Stay"
          subtitle="Choose your dates, select a unit, and submit your booking request."
          contentClassName="lg:min-h-[174px] lg:p-6"
          rightSlot={(
            <div className="rounded-3xl border border-white/15 bg-white/10 p-4 text-white/90 backdrop-blur">
              <div className="flex items-center gap-2 text-base font-semibold text-white">
                <ShieldCheck className="h-4 w-4 text-teal-300" aria-hidden="true" />
                Secure booking
              </div>
              <p className="mt-2 text-sm text-white/75">
                Availability and booking status update automatically after confirmation.
              </p>
            </div>
          )}
        />
        <div className="mt-5 rounded-[2rem] border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 shadow-sm">
          <p className="font-semibold">Sign in required to continue.</p>
          <p className="mt-1">Please sign in to check availability, save selections, and confirm booking.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/login?next=/book"
              className="inline-flex h-11 items-center justify-center rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white"
            >
              Sign in and continue
            </Link>
            <Link
              href="/tours"
              className="inline-flex h-11 items-center justify-center rounded-xl border border-[var(--color-border)] bg-white px-4 text-sm font-semibold text-[var(--color-text)]"
            >
              Explore tours first
            </Link>
          </div>
        </div>
      </GuestPageShell>
    );
  }

  return (
    <GuestPageShell className="max-w-[1280px] px-0 pb-28 md:pb-0" >
      <section data-testid="booking-page" className="mb-5">
        <GuestHero
          testId="booking-header"
          dark
          eyebrow="Guest Portal"
          title="Book Your Stay"
          subtitle="Choose your dates, select a unit, and submit your booking request."
          contentClassName="lg:min-h-[174px] lg:p-6"
          rightSlot={(
            <div className="rounded-3xl border border-white/15 bg-white/10 p-4 text-white/90 backdrop-blur">
              <div className="flex items-center gap-2 text-base font-semibold text-white">
                <ShieldCheck className="h-4 w-4 text-teal-300" aria-hidden="true" />
                Secure booking
              </div>
              <p className="mt-2 text-sm text-white/75">
                Availability and booking status update automatically after confirmation.
              </p>
            </div>
          )}
        />
      </section>

      <div className="mb-5 hidden lg:block lg:max-w-md">
        <BookingStepper
          currentStep={desktopStepperStep}
          steps={["Dates", "Units", "Confirm"]}
        />
      </div>
      <div className="mb-5 grid w-full grid-cols-3 gap-2 text-center lg:hidden" data-testid="booking-stepper" aria-label="Booking progress">
        {[
          { step: 1, label: "Dates" },
          { step: 2, label: "Units" },
          { step: 3, label: "Confirm" },
        ].map((entry) => (
          <button
            key={entry.step}
            type="button"
            onClick={() => {
              if (entry.step === 3 && selectedUnitIds.length === 0) {
                setSubmitError("Select at least one unit before reviewing payment.");
                setMobileStep(2);
                return;
              }
              setMobileStep(entry.step);
            }}
            className={`inline-flex h-10 w-full items-center justify-center gap-2 rounded-2xl px-2 text-xs font-semibold ${
              mobileStep === entry.step
                ? "bg-[var(--color-primary)] text-white"
                  : "border border-slate-200 bg-white text-slate-500"
            }`}
          >
            <span
              className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${
                mobileStep === entry.step
                  ? "bg-white/20 text-white"
                  : "bg-slate-100 text-slate-500"
              }`}
            >
              {entry.step}
            </span>
            {entry.label}
          </button>
        ))}
      </div>

      {submitError && !unitAvailabilityAlert ? (
        <div className="mb-3">
          <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{submitError}</p>
        </div>
      ) : null}
      {!submitError && successMessage ? (
        <div className="mb-3">
          <SyncAlertBanner
            message={successMessage}
            tone={successHasSyncCta ? "warning" : "success"}
            showSyncCta={successHasSyncCta}
            role="status"
          />
        </div>
      ) : null}
      {!submitError && !successMessage && !networkOnline ? (
        <div className="mb-3">
          <SyncAlertBanner
            message="You are offline. New bookings will be saved locally and synced when internet returns."
            showSyncCta
          />
        </div>
      ) : null}
      {latestAiRecommendation ? (
        <div className="mb-5 rounded-[var(--radius-md)] border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 shadow-[var(--shadow-sm)]">
          <p className="font-semibold">
            AI pricing signal: {toPeso(latestAiRecommendation.pricing_adjustment)} ({getAiSource(latestAiRecommendation)})
          </p>
          <p className="text-xs text-indigo-700">Confidence: {(latestAiRecommendation.confidence * 100).toFixed(0)}%</p>
          {latestAiRecommendation.explanations.length ? (
            <ul className="mt-1 list-disc pl-5 text-xs text-indigo-800">
              {latestAiRecommendation.explanations.map((explanation) => (
                <li key={explanation}>{explanation}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="space-y-6">
          <GuestSectionCard data-testid="booking-step-dates" className="rounded-[2rem] border-slate-200/80 p-5 md:p-6">
            <div className="mb-4 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setMobileStep((prev) => (prev === 1 ? 0 : 1))}
                className="inline-flex items-center gap-2 text-left md:pointer-events-none"
                aria-expanded={mobileStep === 1}
              >
                <h2 className="inline-flex items-center gap-2 text-xl font-semibold tracking-tight text-[var(--color-text)]">
                  <CalendarDays className="h-5 w-5 text-[var(--color-secondary)]" />
                  Dates & Guests
                </h2>
                <span className="md:hidden">
                  {mobileStep === 1 ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}
                </span>
              </button>
              <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">Step 1</span>
            </div>
            <div className={`${mobileStep === 1 ? "block" : "hidden"} md:block`}>
            <div className="grid gap-3 sm:grid-cols-2">
              <FancyDatePicker
                label="Check-in"
                value={checkInDate}
                min={tomorrow}
                onChange={(nextValue) => {
                  setCheckInDate(nextValue);
                  setSelectedUnitIds([]);
                  setUnitAvailabilityAlert(null);
                  if (checkOutDate <= nextValue) {
                    setCheckOutDate(addDaysToIsoDate(nextValue, 1));
                  }
                }}
              />
              <FancyDatePicker
                label="Check-out"
                value={checkOutDate}
                min={checkInDate || tomorrow}
                onChange={(nextValue) => {
                  setCheckOutDate(nextValue);
                  setSelectedUnitIds([]);
                  setUnitAvailabilityAlert(null);
                }}
              />
              <label className="guest-form-label">
                Room type
                <select
                  value={unitTypeFilter}
                  onChange={(event) => {
                    setUnitTypeFilter(event.target.value as UnitTypeFilter);
                    setSelectedUnitIds([]);
                    setUnitAvailabilityAlert(null);
                  }}
                  className="guest-field-control"
                >
                  <option value="all">All types</option>
                  <option value="room">Room</option>
                  <option value="cottage">Cottage</option>
                  <option value="amenity">Amenity</option>
                </select>
              </label>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <p className="rounded-xl bg-blue-50 px-3 py-2 text-sm text-blue-800">
                <strong>{nights}</strong> night{nights === 1 ? "" : "s"} stay
              </p>
              <label className="inline-flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-slate-700">
                <Users className="h-4 w-4 text-[var(--color-secondary)]" />
                <span>Guests</span>
                <input
                  type="number"
                  min={1}
                  value={guestCountInput}
                  onFocus={() => {
                    if ((guestCountInput ?? "").trim() === "0" || (guestCountInput ?? "").trim() === "1") {
                      setGuestCountInput("");
                    }
                  }}
                  onChange={(event) => {
                    const rawValue = event.target.value;
                    if (rawValue.trim() === "") {
                      setGuestCountInput("");
                      setGuestCount(0);
                      return;
                    }
                    const parsed = Number(rawValue);
                    if (Number.isNaN(parsed)) return;
                    const normalized = String(Math.max(0, parsed));
                    setGuestCountInput(normalized);
                    setGuestCount(Math.max(0, parsed));
                  }}
                  onBlur={() => {
                    if ((guestCountInput ?? "").trim() === "") {
                      applyGuestCount(1);
                      return;
                    }
                    const parsed = Number(guestCountInput);
                    if (!Number.isFinite(parsed) || parsed < 1) {
                      applyGuestCount(1);
                      return;
                    }
                    applyGuestCount(parsed);
                  }}
                  className="guest-field-control guest-field-control-sm w-16 text-right text-sm"
                />
              </label>
              <p className="inline-flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">
                <Users className="h-4 w-4 text-[var(--color-secondary)]" />
                Capacity {selectedCapacity}
              </p>
            </div>
            {hasCapacityGap ? (
              <p className="mt-3 rounded-[var(--radius-sm)] border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Selected units can host up to <strong>{selectedCapacity}</strong> guest(s). Increase capacity or reduce guest count.
              </p>
            ) : null}
            <div className="mt-4 md:hidden">
              <button
                type="button"
                onClick={() => setMobileStep(2)}
                className="inline-flex h-11 w-full items-center justify-center rounded-2xl bg-[var(--color-primary)] px-4 text-sm font-semibold text-white"
              >
                Continue to units
              </button>
            </div>
            </div>
          </GuestSectionCard>

          <GuestSectionCard
            data-testid="booking-step-units"
            className="rounded-[2rem] border-slate-200/80 p-5 md:p-6"
            aria-busy={unitsLoading}
          >
            <div className="mb-4 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setMobileStep((prev) => (prev === 2 ? 0 : 2))}
                className="inline-flex items-center gap-2 text-left md:pointer-events-none"
                aria-expanded={mobileStep === 2}
              >
                <h2 className="inline-flex items-center gap-2 text-xl font-semibold tracking-tight text-[var(--color-text)]">
                  <BedDouble className="h-5 w-5 text-[var(--color-secondary)]" />
                  Choose Unit
                </h2>
                <span className="md:hidden">
                  {mobileStep === 2 ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}
                </span>
              </button>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">Step 2</span>
              </div>
            </div>
            <div className={`${mobileStep === 2 ? "block" : "hidden"} md:block`}>
            {unitAvailabilityAlert ? (
              <div className="sticky top-[7.75rem] z-20 mb-3 rounded-xl border border-red-200 bg-red-50/95 px-3 py-2 text-sm text-red-700 shadow-sm backdrop-blur md:top-24">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium leading-relaxed">{unitAvailabilityAlert}</p>
                  <button
                    type="button"
                    onClick={() => setUnitAvailabilityAlert(null)}
                    className="inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-red-200 bg-white px-1 text-xs font-semibold text-red-700"
                    aria-label="Dismiss unit availability alert"
                  >
                    ×
                  </button>
                </div>
              </div>
            ) : null}
            <p className="mb-3 text-xs font-medium text-slate-600 md:hidden">
              You can select multiple units. Tap cards to add or remove.
            </p>
            <div className="mb-3 flex items-center justify-between gap-2">
              {selectedUnitIds.length > 0 ? (
                <>
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                    {selectedUnitIds.length} selected
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedUnitIds([]);
                      setUnitAvailabilityAlert(null);
                    }}
                    className="inline-flex h-8 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-white px-3 text-xs font-semibold text-[var(--color-text)] transition-colors duration-150 hover:border-[var(--color-primary)]"
                  >
                    Clear selection
                  </button>
                </>
              ) : null}
            </div>
            {unitsError ? (
              <div className="mb-3 rounded-[var(--radius-sm)] border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <p>{unitsError}</p>
                <button
                  type="button"
                  className="mt-2 rounded-[var(--radius-sm)] border border-red-200 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-50"
                  onClick={() => setRefreshNonce((value) => value + 1)}
                >
                  Retry
                </button>
              </div>
            ) : null}
            <div className="min-h-[18rem]">
              {unitsLoading ? (
                <div className="mb-2 grid gap-3 md:grid-cols-2">
                  {Array.from({ length: 4 }).map((_, idx) => (
                    <div key={`loading-unit-${idx}`} className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white p-4">
                      <div className="skeleton h-36 w-full rounded-[var(--radius-sm)]" />
                      <div className="mt-3 skeleton h-5 w-40" />
                      <div className="mt-2 skeleton h-4 w-28" />
                      <div className="mt-3 skeleton h-4 w-full" />
                    </div>
                  ))}
                </div>
              ) : null}
              {!unitsLoading && units.length === 0 ? (
                <div className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-slate-50 p-4 text-sm text-[var(--color-muted)]">
                  <p className="font-medium text-[var(--color-text)]">
                    {unitTypeFilter === "all"
                      ? "No units are available for these dates."
                      : `${UNIT_TYPE_LABEL[unitTypeFilter].charAt(0).toUpperCase()}${UNIT_TYPE_LABEL[unitTypeFilter].slice(1)} are fully booked for these dates.`}
                  </p>
                  <p className="mt-1">
                    {networkOnline
                      ? "Try different dates or switch unit type to see available options."
                      : "You appear to be offline. Reconnect to refresh live availability."}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setUnitTypeFilter("all");
                        setSelectedUnitIds([]);
                        setUnitAvailabilityAlert(null);
                      }}
                      className="inline-flex h-9 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-white px-3 text-xs font-semibold text-[var(--color-text)]"
                    >
                      Reset room type filter
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const nextCheckIn = addDaysToIsoDate(checkInDate, 1);
                        setCheckInDate(nextCheckIn);
                        setCheckOutDate(addDaysToIsoDate(nextCheckIn, Math.max(1, nights || 2)));
                        setSelectedUnitIds([]);
                        setUnitAvailabilityAlert(null);
                      }}
                      className="inline-flex h-9 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-white px-3 text-xs font-semibold text-[var(--color-text)]"
                    >
                      Shift dates +1 day
                    </button>
                    <Link
                      href="/tours"
                      className="inline-flex h-9 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-white px-3 text-xs font-semibold text-[var(--color-text)]"
                    >
                      View tour options
                    </Link>
                  </div>
                </div>
              ) : null}
              <div className="grid gap-4 md:grid-cols-2">
                {units.map((unit) => {
                  const selected = selectedUnitIds.includes(unit.unit_id);
                  const label = getUnitLabel(unit.name);
                  const normalizedImages = normalizeUnitImageUrls(unit.image_urls, unit.image_url);
                  const normalizedThumbs = normalizeUnitThumbUrls(normalizedImages, unit.image_thumb_urls ?? null);
                  const previewImage = normalizedThumbs[0] || normalizedImages[0] || "";
                  return (
                    <article
                      data-testid="unit-card"
                      key={unit.unit_id}
                      onClick={() => toggleUnit(unit.unit_id)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          toggleUnit(unit.unit_id);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      className={`w-full overflow-hidden rounded-2xl border-2 text-left transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] ${
                        selected
                          ? "border-[var(--color-primary)] bg-blue-50/70"
                          : "border-[var(--color-border)] bg-white hover:border-slate-300"
                      }`}
                    >
                      {previewImage ? (
                        <Image
                          src={previewImage}
                          alt={label.subtitle ? `${label.title} (${label.subtitle})` : label.title}
                          width={640}
                          height={256}
                          sizes="(min-width: 1024px) 40vw, 100vw"
                          className="h-40 w-full object-cover"
                        />
                      ) : null}
                      <div className="p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="font-semibold text-slate-900">{label.title}</h3>
                            <p className="text-sm text-slate-500 capitalize">
                              {label.subtitle ? `${label.subtitle} • ` : ""}
                              {unit.type} • Up to {unit.capacity} guests
                            </p>
                            <p className="text-xs text-slate-500">
                              {unit.room_number ? `Room ${unit.room_number}` : unit.unit_code || "No unit code"}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold text-[var(--color-text)]">{toPeso(getUnitNightlyRate(unit, guestCount))}</p>
                            <p className="text-xs text-slate-500">
                              {isPaxPricedUnit(unit) ? `for ${guestCount} guest${guestCount === 1 ? "" : "s"}` : "per night"}
                            </p>
                          </div>
                        </div>
                        {unit.description ? <p className="mt-2 text-sm text-slate-600">{unit.description}</p> : null}
                        {unit.amenities?.length ? (
                          <div className="mt-2 flex flex-wrap gap-1">
                            {unit.amenities.slice(0, 5).map((amenity) => (
                              <span
                                key={amenity}
                                className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                              >
                                {amenity}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        <div className="mt-3 flex items-center justify-between gap-2">
                          <span className="text-xs text-slate-500">{selected ? "Selected (tap to remove)" : "Tap to select"}</span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                setGalleryUnit(unit);
                                setGalleryIndex(0);
                              }}
                              className="inline-flex h-9 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-white px-3 text-xs font-semibold text-[var(--color-text)] transition-colors duration-150 hover:border-[var(--color-primary)]"
                            >
                              View photos
                            </button>
                            {selected ? (
                              <span
                                data-testid="selected-unit-badge"
                                className="inline-flex items-center gap-1 rounded-full border border-teal-200 bg-teal-50 px-2 py-1 text-[11px] font-semibold text-teal-700"
                              >
                                <CheckCircle2 className="h-3.5 w-3.5" />
                                Selected
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
            <div className="mt-4 md:hidden">
              <div className="sticky bottom-[calc(10.65rem+env(safe-area-inset-bottom))] z-10 mx-auto w-full max-w-[380px] rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-sm backdrop-blur">
                <div className="mb-2 flex items-center justify-between px-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-slate-500">Selected units</p>
                  <p className="text-sm font-bold text-[var(--color-primary)]">{selectedUnitIds.length}</p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (selectedUnitIds.length === 0) {
                      setSubmitError("Select at least one unit before reviewing payment.");
                      return;
                    }
                    setMobileStep(3);
                  }}
                  disabled={selectedUnitIds.length === 0}
                  className="inline-flex h-11 w-full items-center justify-center rounded-2xl bg-[var(--color-primary)] px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-45"
                >
                  Continue to review
                </button>
              </div>
            </div>
            </div>
          </GuestSectionCard>

          <GuestSectionCard data-testid="booking-step-payment" className="rounded-[2rem] border-slate-200/80 p-5 md:p-6 lg:hidden">
            <div className="mb-4 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setMobileStep((prev) => (prev === 3 ? 0 : 3))}
                className="inline-flex items-center gap-2 text-left"
                aria-expanded={mobileStep === 3}
              >
                <h2 className="inline-flex items-center gap-2 text-xl font-semibold tracking-tight text-[var(--color-text)]">
                  <CircleCheckBig className="h-5 w-5 text-[var(--color-secondary)]" />
                  Review & Continue
                </h2>
                {mobileStep === 3 ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}
              </button>
              <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">Step 3</span>
            </div>
            <div className={`${mobileStep === 3 ? "block" : "hidden"}`}>
              <p className="mb-2 text-xs font-medium text-slate-600">
                Selected unit{selectedUnitIds.length === 1 ? "" : "s"}: <span className="font-semibold text-[var(--color-primary)]">{selectedUnitIds.length}</span>
              </p>
              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                <div className="flex items-center justify-between"><span>Guest count</span><span className="font-semibold text-[var(--color-text)]">{guestCount}</span></div>
                <div className="flex items-center justify-between"><span>Selected capacity</span><span className="font-semibold text-[var(--color-text)]">{selectedCapacity}</span></div>
                <div className="flex items-center justify-between"><span>Total</span><span className="text-base font-bold text-[var(--color-text)]">{toPeso(total)}</span></div>
                <div className="flex items-center justify-between"><span>Minimum online payment</span><span className="font-semibold text-[var(--color-text)]">{toPeso(minimumPayNow)}</span></div>
              </div>
              <p className="mt-3 text-sm text-slate-600">Payment proof is reviewed by admin before check-in.</p>
              <p className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium leading-relaxed text-amber-800">
                You must pay at least the minimum online payment first. Guest-initiated cancellation forfeits this minimum deposit.
              </p>
              <details className="mt-3 rounded-xl border border-slate-200 bg-white p-3 text-sm">
                <summary className="cursor-pointer font-semibold text-[var(--color-primary)]">How payment works</summary>
                <ol className="mt-2 list-decimal space-y-1 pl-4 text-slate-600">
                  <li>Submit reservation details</li>
                  <li>Pay minimum online deposit</li>
                  <li>Upload payment proof</li>
                  <li>Admin verifies payment</li>
                  <li>Reservation is confirmed and ready for check-in</li>
                </ol>
              </details>
              <p className="mt-3 text-xs font-medium text-slate-500">Final step: use the Booking Summary bar below to confirm.</p>
            </div>
          </GuestSectionCard>
        </div>

        <aside className="hidden lg:col-span-1 lg:block">
          <div data-testid="booking-summary" className="sticky top-24 rounded-[2rem] border border-slate-200/80 bg-[var(--color-surface)] p-5 shadow-sm md:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="inline-flex items-center gap-2 text-xl font-semibold tracking-tight text-[var(--color-text)]">
                <ShieldCheck className="h-5 w-5 text-[var(--color-secondary)]" />
                Booking Summary
              </h2>
              <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">Step 3</span>
            </div>
            {selectedUnits.length === 0 ? (
              <div className="rounded-[var(--radius-sm)] bg-slate-50 p-3 text-sm text-[var(--color-muted)]">
                Select units to see booking summary.
              </div>
            ) : (
              <div className="space-y-2">
                {selectedUnits.map((unit) => {
                  const label = getUnitLabel(unit.name);
                  return (
                    <div key={unit.unit_id} className="flex items-center justify-between rounded-[var(--radius-sm)] bg-slate-50 px-3 py-2">
                      <div>
                        <p className="text-sm font-medium text-[var(--color-text)]">{label.title}</p>
                        <p className="text-xs text-slate-500">
                          {label.subtitle ? `${label.subtitle} • ` : ""}
                          {nights} night{nights === 1 ? "" : "s"}
                        </p>
                      </div>
                      <p className="text-sm font-semibold text-slate-900">{toPeso(getUnitNightlyRate(unit, guestCount) * nights)}</p>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-4 border-t border-slate-200 pt-3">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-slate-600">Guest count</span>
                <span className="font-semibold text-[var(--color-text)]">{guestCount}</span>
              </div>
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="text-slate-600">Selected capacity</span>
                <span className={`font-semibold ${hasCapacityGap ? "text-amber-700" : "text-[var(--color-text)]"}`}>{selectedCapacity}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Total</span>
                <span className="text-xl font-bold text-[var(--color-text)]">{toPeso(total)}</span>
              </div>
            </div>

            <button
              data-testid="confirm-booking-cta"
              type="button"
              onClick={openConfirmDialog}
              disabled={submitBusy || !canSubmitReservation}
              className="guest-primary-cta mt-4 h-12 w-full rounded-2xl shadow-sm"
            >
              {submitBusy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                "Confirm Booking"
              )}
            </button>
            {hasCapacityGap ? (
              <p className="mt-2 text-center text-xs font-medium text-amber-700">
                Increase selected capacity to continue.
              </p>
            ) : null}
            {submitBlockerMessage && !hasCapacityGap ? (
              <p data-testid="booking-cta-reason" className="mt-2 text-center text-xs font-medium text-slate-600">{submitBlockerMessage}</p>
            ) : null}

            <p className="mt-3 text-center text-xs text-slate-500">
              Secure checkout is verified after payment submission. Wallet connection is optional.
            </p>
            <p className="mt-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-secondary-ghost)] px-3 py-2 text-xs text-[var(--color-muted)]">
              Minimum online payment now:{" "}
              <strong className="text-[var(--color-text)]">{toPeso(minimumPayNow)}</strong> (20% of total, clamped to PHP 500–1000).
            </p>
            <p className="mt-2 rounded-[var(--radius-sm)] border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">
              Reservation policy: minimum deposit must be paid first. If you cancel the booking, the minimum deposit is non-refundable.
            </p>
            <div className="mt-3">
              <PaymentVerificationInfo />
            </div>
          </div>
        </aside>
      </div>
      <div className="sticky bottom-[calc(5.6rem+env(safe-area-inset-bottom))] z-20 mt-4 px-3 md:hidden">
        <div
          data-testid="booking-mini-summary"
          className="mx-auto flex max-w-[430px] items-center justify-between rounded-2xl border border-[var(--color-border)] bg-white px-3 py-2 shadow-[var(--shadow-md)]"
        >
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-muted)]">Booking summary</p>
            <p className="text-sm font-bold text-[var(--color-text)]">{toPeso(total)}</p>
          </div>
          <button
            data-testid="confirm-booking-cta"
            type="button"
            onClick={openConfirmDialog}
            disabled={submitBusy || !canSubmitReservation}
            className="guest-primary-cta min-h-11 px-4 text-sm"
          >
            {submitBusy ? "Creating..." : "Confirm"}
          </button>
        </div>
      </div>
      {confirmDialogOpen ? (
        <ModalDialog
          titleId="book-confirm-dialog-title"
          title="Confirm booking request"
          onClose={() => setConfirmDialogOpen(false)}
          zIndexClass="z-[70]"
          maxWidthClass="sm:max-w-md"
          panelClassName="max-h-[calc(100dvh-0.75rem)] border-[var(--color-border)] bg-[var(--color-surface)] pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
          closeLabel="Close booking confirmation"
          closeButtonClassName="h-10 w-auto border-[var(--color-border)] bg-white px-3 text-sm font-semibold text-[var(--color-text)]"
        >
          <div className="space-y-3 text-sm text-slate-700">
            <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
              You are booking <strong>{selectedUnitIds.length}</strong> unit{selectedUnitIds.length === 1 ? "" : "s"} for{" "}
              <strong>{nights}</strong> night{nights === 1 ? "" : "s"}.
            </p>
            <div className="space-y-1 rounded-xl border border-slate-200 bg-white px-3 py-2">
              <div className="flex items-center justify-between">
                <span>Total</span>
                <span className="font-bold text-[var(--color-primary)]">{toPeso(total)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Minimum online payment</span>
                <span className="font-semibold text-[var(--color-primary)]">{toPeso(minimumPayNow)}</span>
              </div>
            </div>
            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium leading-relaxed text-amber-800">
              Minimum online deposit is required first. Guest-initiated cancellation forfeits this minimum deposit.
            </p>
            <p className="text-xs text-slate-500">After submission, you will continue to payment proof instructions.</p>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setConfirmDialogOpen(false)}
                className="inline-flex h-11 flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700"
              >
                Back
              </button>
              <button
                type="button"
                onClick={() => {
                  setConfirmDialogOpen(false);
                  void createReservation();
                }}
                disabled={submitBusy}
                className="guest-primary-cta h-11 flex-1 rounded-xl px-4 text-sm"
              >
                {submitBusy ? "Submitting..." : "Confirm booking"}
              </button>
            </div>
          </div>
        </ModalDialog>
      ) : null}
      {galleryUnit ? (
        <ModalDialog
          titleId="book-unit-gallery-title"
          title={galleryUnit.name}
          onClose={closeGalleryModal}
          zIndexClass="z-50"
          overlayClassName="bg-slate-950/55"
          maxWidthClass="md:max-w-3xl"
          panelClassName="border-[var(--color-border)] bg-[var(--color-surface)] md:p-5"
          closeLabel="Close unit photo gallery"
          closeButtonClassName="h-10 w-auto border-[var(--color-border)] bg-white px-3 text-sm font-semibold text-[var(--color-text)]"
        >
          <p className="mb-3 text-xs text-[var(--color-muted)]">Unit photos</p>
            <UnitImageGallery
              images={galleryImages}
              thumbs={galleryThumbs}
              altBase={galleryUnit.name}
              selectedIndex={galleryIndex}
              onSelect={setGalleryIndex}
              onOpenLightbox={(index) => {
                setGalleryIndex(index);
                setLightboxOpen(true);
              }}
              emptyText="No photos available yet for this unit."
            />
        </ModalDialog>
      ) : null}
      <ImageLightbox
        open={lightboxOpen}
        images={galleryImages}
        altBase={galleryUnit?.name ?? "Unit"}
        initialIndex={galleryIndex}
        onClose={() => setLightboxOpen(false)}
      />
    </GuestPageShell>
  );
}











