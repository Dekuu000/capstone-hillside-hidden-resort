"use client";

import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CalendarDays,
  CheckCircle2,
  Loader2,
  Moon,
  Search,
  ShieldCheck,
  Sparkles,
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
import { useNetworkOnline } from "../../lib/hooks/useNetworkOnline";
import { getSupabaseBrowserClient } from "../../lib/supabase";
import { FancyDatePicker } from "../shared/FancyDatePicker";
import { ImageLightbox } from "../shared/ImageLightbox";
import { ModalDialog } from "../shared/ModalDialog";
import { SyncAlertBanner } from "../shared/SyncAlertBanner";
import { UnitImageGallery } from "../shared/UnitImageGallery";
import { normalizeUnitImageUrls, normalizeUnitThumbUrls } from "../../lib/unitMedia";
import { syncAwareMutation } from "../../lib/offlineSync/mutation";

type AvailableUnit = AvailableUnitsResponse["items"][number];
type UnitTypeFilter = "all" | "room" | "cottage" | "amenity";

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

  const [units, setUnits] = useState<AvailableUnit[]>(initialUnitsData?.items ?? []);
  const [unitsLoading, setUnitsLoading] = useState(false);
  const [unitsError, setUnitsError] = useState<string | null>(null);
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);

  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [successHasSyncCta, setSuccessHasSyncCta] = useState(false);
  const [latestAiRecommendation, setLatestAiRecommendation] = useState<PricingRecommendation | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [galleryUnit, setGalleryUnit] = useState<AvailableUnit | null>(null);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const networkOnline = useNetworkOnline();

  const initialQueryKey = `${initialCheckInDate || tomorrow}|${initialCheckOutDate || defaultCheckout}|all`;
  const [skipInitialFetch, setSkipInitialFetch] = useState(Boolean(initialUnitsData && initialToken));

  useEffect(() => {
    if (initialToken) {
      return;
    }
    let mounted = true;
    const supabase = getSupabaseBrowserClient();
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setToken(data.session?.access_token ?? null);
      setSessionEmail(data.session?.user.email ?? null);
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
  const total = useMemo(() => selectedUnits.reduce((sum, unit) => sum + Number(unit.base_price || 0) * nights, 0), [nights, selectedUnits]);
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
        window.setTimeout(() => {
          router.push("/my-bookings");
        }, 900);
      } else {
        setSuccessMessage("Reservation saved offline. It will sync automatically when connection is restored.");
        setSuccessHasSyncCta(true);
        setLatestAiRecommendation(null);
      }
    } catch (unknownError) {
      setSubmitError(getApiErrorMessage(unknownError, "Failed to create reservation."));
    } finally {
      setSubmitBusy(false);
    }
  };

  if (sessionLoading) {
    return (
      <section className="mx-auto w-full max-w-7xl px-1">
        <div className="mb-6 grid gap-4 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-sm)]">
          <div className="skeleton h-5 w-36" />
          <div className="skeleton h-10 w-72" />
          <div className="skeleton h-4 w-60" />
        </div>
        <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
          <div className="surface p-6">
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
          <div className="surface p-6">
            <div className="skeleton h-6 w-40" />
            <div className="mt-4 space-y-3">
              <div className="skeleton h-14" />
              <div className="skeleton h-14" />
              <div className="skeleton h-14" />
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (!token) {
    return (
      <section className="mx-auto w-full max-w-6xl">
        <header className="mb-4 rounded-3xl border border-slate-200/70 bg-gradient-to-br from-white via-slate-50 to-blue-50 p-6 shadow-sm">
          <h1 className="text-3xl font-bold text-slate-900">Book Your Stay</h1>
          <p className="mt-2 text-sm text-slate-600">Choose dates and reserve your stay.</p>
        </header>
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          Please sign in first to create a booking.
        </p>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-7xl px-1">
      <header className="mb-8 overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-gradient-to-br from-[#ffffff] via-[#f3fbfb] to-[#eef4ff] p-6 shadow-[var(--shadow-md)]">
        <div className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="inline-flex items-center gap-2 rounded-full border border-[var(--color-border)] bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--color-muted)]">
              <Sparkles className="h-3.5 w-3.5 text-[var(--color-secondary)]" />
              Guest Booking
            </p>
            <h1 className="mt-3 text-3xl font-bold text-[var(--color-text)] md:text-4xl">Book Your Stay</h1>
            <p className="mt-2 text-sm text-[var(--color-muted)]">
              Signed in as <strong>{sessionEmail ?? "guest"}</strong>
            </p>
          </div>
          <div className="grid gap-2 rounded-[var(--radius-md)] border border-[var(--color-border)] bg-white/90 px-4 py-3 text-xs text-[var(--color-muted)]">
            <p className="font-semibold text-[var(--color-text)]">Secure 3-step flow</p>
            <p>Select dates • pick units • confirm booking</p>
            <p className="inline-flex items-center gap-1.5 text-[var(--color-primary)]">
              <ShieldCheck className="h-3.5 w-3.5" />
              Payment verification is required before check-in.
            </p>
          </div>
        </div>
      </header>

      {!networkOnline ? (
        <SyncAlertBanner
          className="mb-4"
          message="You are offline. New bookings will be saved locally and synced when internet returns."
          showSyncCta
        />
      ) : null}
      {successMessage ? (
        <SyncAlertBanner
          className="mb-4"
          message={successMessage}
          tone={successHasSyncCta ? "warning" : "success"}
          showSyncCta={successHasSyncCta}
          role="status"
        />
      ) : null}
      {submitError ? <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{submitError}</p> : null}
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <article className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-sm)]">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-[var(--color-text)]">
                <CalendarDays className="h-5 w-5 text-[var(--color-secondary)]" />
                Select Dates
              </h2>
              <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">Step 1</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <FancyDatePicker
                label="Check-in"
                value={checkInDate}
                min={tomorrow}
                onChange={(nextValue) => {
                  setCheckInDate(nextValue);
                  setSelectedUnitIds([]);
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
                }}
              />
              <label className="grid gap-1 text-sm text-slate-700">
                Room type
                <select
                  value={unitTypeFilter}
                  onChange={(event) => {
                    setUnitTypeFilter(event.target.value as UnitTypeFilter);
                    setSelectedUnitIds([]);
                  }}
                  className="h-11 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-slate-50 px-3 text-[var(--color-text)] outline-none ring-[var(--color-secondary)]/20 transition focus:ring-2"
                >
                  <option value="all">All types</option>
                  <option value="room">Room</option>
                  <option value="cottage">Cottage</option>
                  <option value="amenity">Amenity</option>
                </select>
              </label>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-4">
              <p className="rounded-[var(--radius-sm)] bg-blue-50 px-3 py-2 text-sm text-blue-800">
                <strong>{nights}</strong> night{nights === 1 ? "" : "s"} stay
              </p>
              <p className="inline-flex items-center gap-2 rounded-[var(--radius-sm)] bg-slate-50 px-3 py-2 text-sm text-slate-700">
                <Search className="h-4 w-4 text-[var(--color-secondary)]" />
                {unitCount} unit{unitCount === 1 ? "" : "s"} available
              </p>
              <label className="inline-flex items-center gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-slate-700">
                <Users className="h-4 w-4 text-[var(--color-secondary)]" />
                <span>Guests</span>
                <input
                  type="number"
                  min={1}
                  value={guestCount}
                  onChange={(event) => setGuestCount(Math.max(1, Number(event.target.value || 1)))}
                  className="w-16 rounded-md border border-[var(--color-border)] bg-slate-50 px-2 py-1 text-right text-sm text-[var(--color-text)] outline-none ring-[var(--color-secondary)]/20 transition focus:ring-2"
                />
              </label>
              <p className="inline-flex items-center gap-2 rounded-[var(--radius-sm)] bg-slate-50 px-3 py-2 text-sm text-slate-700">
                <Users className="h-4 w-4 text-[var(--color-secondary)]" />
                Capacity {selectedCapacity}
              </p>
            </div>
            {hasCapacityGap ? (
              <p className="mt-3 rounded-[var(--radius-sm)] border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                Selected units can host up to <strong>{selectedCapacity}</strong> guest(s). Increase capacity or reduce guest count.
              </p>
            ) : null}
          </article>

          <article className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-sm)]">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-[var(--color-text)]">
                <Moon className="h-5 w-5 text-[var(--color-secondary)]" />
                Available Units
              </h2>
              <div className="flex items-center gap-2">
                {selectedUnitIds.length > 0 ? (
                  <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                    {selectedUnitIds.length} selected
                  </span>
                ) : null}
                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">Step 2</span>
              </div>
            </div>
            {selectedUnitIds.length > 0 ? (
              <div className="mb-3 flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => setSelectedUnitIds([])}
                  className="inline-flex h-8 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-white px-3 text-xs font-semibold text-[var(--color-text)] transition-colors duration-150 hover:border-[var(--color-primary)]"
                >
                  Clear selection
                </button>
              </div>
            ) : null}
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
                <p className="font-medium text-[var(--color-text)]">No units available for selected dates.</p>
                <p className="mt-1">Try adjusting your check-in and check-out dates to see more options.</p>
              </div>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              {units.map((unit) => {
                const selected = selectedUnitIds.includes(unit.unit_id);
                const normalizedImages = normalizeUnitImageUrls(unit.image_urls, unit.image_url);
                const normalizedThumbs = normalizeUnitThumbUrls(normalizedImages, unit.image_thumb_urls ?? null);
                const previewImage = normalizedThumbs[0] || normalizedImages[0] || "";
                return (
                  <article
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
                    className={`w-full overflow-hidden rounded-[var(--radius-md)] border-2 text-left transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] ${
                      selected
                        ? "border-[var(--color-primary)] bg-blue-50/70"
                        : "border-[var(--color-border)] bg-white hover:border-slate-300"
                    }`}
                  >
                    {previewImage ? (
                      <Image
                        src={previewImage}
                        alt={unit.name}
                        width={640}
                        height={256}
                        sizes="(min-width: 1024px) 40vw, 100vw"
                        className="h-44 w-full object-cover"
                      />
                    ) : null}
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-semibold text-slate-900">{unit.name}</h3>
                          <p className="text-sm text-slate-500 capitalize">
                            {unit.type} • Up to {unit.capacity} guests
                          </p>
                          <p className="text-xs text-slate-500">
                            {unit.room_number ? `Room ${unit.room_number}` : unit.unit_code || "No unit code"}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-[var(--color-text)]">{toPeso(Number(unit.base_price || 0))}</p>
                          <p className="text-xs text-slate-500">per night</p>
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
                          {normalizedImages.length > 0 ? (
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
                          ) : null}
                          {selected ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : null}
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </article>
        </div>

        <aside className="lg:col-span-1">
          <div className="sticky top-24 rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-[var(--shadow-md)]">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="inline-flex items-center gap-2 text-lg font-semibold text-[var(--color-text)]">
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
                {selectedUnits.map((unit) => (
                  <div
                    key={unit.unit_id}
                    className="flex items-center justify-between rounded-[var(--radius-sm)] bg-slate-50 px-3 py-2"
                  >
                    <div>
                      <p className="text-sm font-medium text-[var(--color-text)]">{unit.name}</p>
                      <p className="text-xs text-slate-500">
                        {nights} night{nights === 1 ? "" : "s"}
                      </p>
                    </div>
                    <p className="text-sm font-semibold text-slate-900">{toPeso(Number(unit.base_price || 0) * nights)}</p>
                  </div>
                ))}
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
              type="button"
              onClick={() => void createReservation()}
              disabled={submitBusy || !canSubmitReservation}
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-[var(--radius-md)] bg-[var(--color-cta)] px-4 py-3 text-sm font-semibold text-white shadow-[var(--shadow-sm)] transition-colors duration-200 hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
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
              <p className="mt-2 text-center text-xs font-medium text-slate-600">{submitBlockerMessage}</p>
            ) : null}

            <p className="mt-3 text-center text-xs text-slate-500">
              Secure checkout is verified after payment submission. Wallet connection is optional.
            </p>
            <p className="mt-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-secondary-ghost)] px-3 py-2 text-xs text-[var(--color-muted)]">
              Minimum online payment now:{" "}
              <strong className="text-[var(--color-text)]">{toPeso(minimumPayNow)}</strong> (20% of total, clamped to PHP 500–1000).
            </p>
          </div>
        </aside>
      </div>
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
    </section>
  );
}











