"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, CheckCircle2, ChevronDown, ChevronRight, CreditCard, ShieldCheck } from "lucide-react";
import type {
  PaymentSubmissionResponse,
  PricingRecommendation,
  ReservationCreateResponse,
  ServiceItem,
  ServiceListResponse,
} from "../../../packages/shared/src/types";
import {
  paymentSubmissionResponseSchema,
  reservationCreateResponseSchema,
  serviceListResponseSchema,
} from "../../../packages/shared/src/schemas";
import { apiFetch } from "../../lib/apiClient";
import { getAiSource } from "../../lib/aiPricing";
import { getApiErrorMessage } from "../../lib/apiError";
import { todayPlusLocalIsoDate } from "../../lib/dateIso";
import { formatPhpPeso as toPeso } from "../../lib/formatCurrency";
import { useNetworkOnline } from "../../lib/hooks/useNetworkOnline";
import { parseJwtSub } from "../../lib/jwt";
import { syncAwareMutation } from "../../lib/offlineSync/mutation";
import { queuePaymentSubmissionWithFile } from "../../lib/offlineSync/paymentSubmission";
import { getSupabaseBrowserClient } from "../../lib/supabase";
import { FancyDatePicker } from "../shared/FancyDatePicker";
import { GcashPaymentGuide } from "../shared/GcashPaymentGuide";
import { SyncAlertBanner } from "../shared/SyncAlertBanner";
import { GuestHero } from "../guest/GuestHero";
import { GuestPageShell } from "../guest/GuestPageShell";
import { GuestSectionCard } from "../guest/GuestSectionCard";
import { PaymentVerificationInfo } from "../guest/PaymentVerificationInfo";

type ToursBookingClientProps = {
  initialToken?: string | null;
  initialServicesData?: ServiceListResponse | null;
};

export function ToursBookingClient({
  initialToken = null,
  initialServicesData = null,
}: ToursBookingClientProps) {
  const router = useRouter();
  const token = initialToken;
  const minVisitDate = useMemo(() => todayPlusLocalIsoDate(1), []);

  const [services, setServices] = useState<ServiceItem[]>(initialServicesData?.items ?? []);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [servicesError, setServicesError] = useState<string | null>(null);

  const [serviceId, setServiceId] = useState("");
  const [visitDate, setVisitDate] = useState(minVisitDate);
  const [adultQty, setAdultQty] = useState(1);
  const [adultQtyInput, setAdultQtyInput] = useState("1");
  const [kidQty, setKidQty] = useState(0);
  const [kidQtyInput, setKidQtyInput] = useState("0");
  const [payNow, setPayNow] = useState(0);
  const [payNowInput, setPayNowInput] = useState("0");

  const [proofMode, setProofMode] = useState<"file" | "url">("file");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofUrl, setProofUrl] = useState("");
  const [referenceNo, setReferenceNo] = useState("");

  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [successHasSyncCta, setSuccessHasSyncCta] = useState(false);
  const [latestAiRecommendation, setLatestAiRecommendation] = useState<PricingRecommendation | null>(null);
  const networkOnline = useNetworkOnline();

  const applyAdultQty = (next: number) => {
    const safe = Math.max(0, next);
    setAdultQty(safe);
    setAdultQtyInput(String(safe));
  };

  const applyKidQty = (next: number) => {
    const safe = Math.max(0, next);
    setKidQty(safe);
    setKidQtyInput(String(safe));
  };

  const setSuccessNotice = (message: string | null, withSyncCta = false) => {
    setSuccessMessage(message);
    setSuccessHasSyncCta(withSyncCta);
  };

  useEffect(() => {
    if (!token) return;
    if (initialServicesData?.items?.length) return;

    let cancelled = false;
    const load = async () => {
      setServicesLoading(true);
      setServicesError(null);
      try {
        const data = await apiFetch<ServiceListResponse>(
          "/v2/catalog/services",
          { method: "GET" },
          token,
          serviceListResponseSchema,
        );
        if (cancelled) return;
        setServices(data.items ?? []);
      } catch (unknownError) {
        if (cancelled) return;
        setServices([]);
        setServicesError(getApiErrorMessage(unknownError, "Failed to load active tours."));
      } finally {
        if (!cancelled) {
          setServicesLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [initialServicesData?.items, token]);

  const selectedService = services.find((service) => service.service_id === serviceId) as ServiceItem | undefined;
  const formatTourOptionLabel = (service: ServiceItem) =>
    `${service.service_name} · ${service.start_time || "--:--"}-${service.end_time || "--:--"}`;
  const totalAmount = useMemo(() => {
    if (!selectedService) return 0;
    return adultQty * Number(selectedService.adult_rate || 0) + kidQty * Number(selectedService.kid_rate || 0);
  }, [adultQty, kidQty, selectedService]);
  const minRequired = useMemo(() => {
    if (totalAmount <= 0) return 0;
    return totalAmount <= 500 ? totalAmount : 500;
  }, [totalAmount]);
  const submitBlockerMessage = useMemo(() => {
    if (!serviceId) return "Select a tour service first.";
    if (adultQty + kidQty <= 0) return "At least one guest is required.";
    if (!visitDate) return "Visit date is required.";
    if (totalAmount <= 0) return "Computed total must be greater than zero.";
    if (payNow < minRequired || payNow > totalAmount) {
      return `Pay now must be between ${toPeso(minRequired)} and ${toPeso(totalAmount)}.`;
    }
    if (proofMode === "url" && !proofUrl.trim()) return "Provide a proof URL.";
    if (proofMode === "file" && !proofFile) return "Upload a payment proof file.";
    return null;
  }, [adultQty, kidQty, minRequired, payNow, proofFile, proofMode, proofUrl, serviceId, totalAmount, visitDate]);
  const canSubmitTour = submitBlockerMessage === null && !submitBusy;
  const activeGuestCount = adultQty + kidQty;
  const [mobileStep, setMobileStep] = useState(1);

  async function uploadProofIfNeeded(reservationId: string): Promise<string | null> {
    if (proofMode === "url") {
      return proofUrl.trim() || null;
    }
    if (!proofFile) return null;

    const uid = parseJwtSub(token);
    if (!uid) throw new Error("Unable to determine session user for proof upload.");

    const ext = proofFile.name.split(".").pop()?.toLowerCase() || "jpg";
    const storagePath = `payments/${uid}/${reservationId}-${crypto.randomUUID()}.${ext}`;

    const supabase = getSupabaseBrowserClient();
    const { error: uploadError } = await supabase.storage
      .from("payment-proofs")
      .upload(storagePath, proofFile, { upsert: false });

    if (uploadError) throw uploadError;
    return storagePath;
  }

  async function submitTourBooking() {
    if (!token) return;
    if (!serviceId) {
      setSubmitError("Please select a tour service.");
      return;
    }
    if (adultQty + kidQty <= 0) {
      setSubmitError("At least one guest is required.");
      return;
    }
    if (!visitDate) {
      setSubmitError("Visit date is required.");
      return;
    }
    if (totalAmount <= 0) {
      setSubmitError("Computed total must be greater than zero.");
      return;
    }
    if (payNow < minRequired || payNow > totalAmount) {
      setSubmitError(`Pay now must be between ${toPeso(minRequired)} and ${toPeso(totalAmount)}.`);
      return;
    }

    if (proofMode === "url" && !proofUrl.trim()) {
      setSubmitError("Proof URL is required.");
      return;
    }
    if (proofMode === "file" && !proofFile) {
      setSubmitError("Payment proof file is required.");
      return;
    }

    setSubmitBusy(true);
    setSubmitError(null);
    setSuccessNotice(null);
    setLatestAiRecommendation(null);
    try {
      const createPayload = {
        service_id: serviceId,
        visit_date: visitDate,
        adult_qty: adultQty,
        kid_qty: kidQty,
        is_advance: true,
        expected_pay_now: payNow,
        notes: null,
        idempotency_key: crypto.randomUUID(),
      };

      const reservationOutcome = await syncAwareMutation<typeof createPayload, ReservationCreateResponse>({
        path: "/v2/reservations/tours",
        method: "POST",
        payload: createPayload,
        parser: reservationCreateResponseSchema,
        accessToken: token,
        entityType: "tour_reservation",
        action: "reservations.tours.create",
        buildOptimisticResponse: () => ({
          reservation_id: `offline-${crypto.randomUUID()}`,
          reservation_code: "OFFLINE-QUEUED",
          status: "pending_payment",
          escrow_ref: null,
          ai_recommendation: null,
        }),
      });

      const created = reservationOutcome.data;
      if (!created) {
        throw new Error("Reservation queued without local payload.");
      }
      setLatestAiRecommendation(created.ai_recommendation ?? null);
      const paymentPayload = {
        reservation_id: created.reservation_id,
        amount: payNow,
        payment_type: payNow >= totalAmount ? "full" : "deposit",
        method: "gcash",
        reference_no: referenceNo.trim() || null,
        proof_url: null as string | null,
        idempotency_key: crypto.randomUUID(),
      };

      if (proofMode === "file" && proofFile && typeof navigator !== "undefined" && !navigator.onLine) {
        if (reservationOutcome.mode === "queued") {
          setSuccessNotice("Tour booking saved offline. Submit payment proof after sync completes.", true);
          return;
        }
        const userId = parseJwtSub(token);
        if (!userId) {
          throw new Error("Unable to identify current user for offline proof queue.");
        }
        await queuePaymentSubmissionWithFile({
          userId,
          reservationId: created.reservation_id,
          amount: payNow,
          paymentType: paymentPayload.payment_type,
          method: paymentPayload.method,
          referenceNo: paymentPayload.reference_no,
          file: proofFile,
        });
        setSuccessNotice("Tour booking saved offline with proof file. It will sync when internet is back.", true);
        return;
      }

      paymentPayload.proof_url = await uploadProofIfNeeded(created.reservation_id);

      const paymentOutcome = await syncAwareMutation<typeof paymentPayload, PaymentSubmissionResponse>({
        path: "/v2/payments/submissions",
        method: "POST",
        payload: paymentPayload,
        parser: paymentSubmissionResponseSchema,
        accessToken: token,
        entityType: "payment_submission",
        action: "payments.submissions.create",
      });

      if (reservationOutcome.mode === "queued" || paymentOutcome.mode === "queued") {
        setSuccessNotice("Tour booking saved offline. Sync will finish automatically when internet is back.", true);
      } else {
        setSuccessNotice(`Tour reservation ${created.reservation_code} created and payment submitted.`);
        window.setTimeout(() => router.push("/my-bookings"), 900);
      }
    } catch (unknownError) {
      setSubmitError(getApiErrorMessage(unknownError, "Failed to create tour booking."));
    } finally {
      setSubmitBusy(false);
    }
  }

  if (!token) {
    return (
      <GuestPageShell className="max-w-[1240px]">
        <GuestHero
          testId="booking-header"
          dark
          eyebrow="Guest Portal"
          title="Book a Tour"
          subtitle="Reserve your slot and submit payment proof to confirm availability."
          contentClassName="lg:min-h-[174px] lg:p-6"
          rightSlot={(
            <div className="rounded-3xl border border-white/15 bg-white/10 p-4 text-white/90 backdrop-blur">
              <div className="flex items-center gap-2 text-base font-semibold text-white">
                <ShieldCheck className="h-4 w-4 text-teal-300" aria-hidden="true" />
                Secure booking
              </div>
              <p className="mt-2 text-sm text-white/75">
                Online and offline submissions are protected and auto-synced.
              </p>
            </div>
          )}
        />
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">Sign in required to reserve a tour.</p>
          <p className="mt-1">Sign in so we can attach your booking, payment proof, and itinerary updates to your account.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/login?next=/tours"
              className="inline-flex h-10 items-center justify-center rounded-[var(--radius-sm)] bg-slate-900 px-4 text-sm font-semibold text-white"
            >
              Sign in and continue
            </Link>
            <Link
              href="/book"
              className="inline-flex h-10 items-center justify-center rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-white px-4 text-sm font-semibold text-[var(--color-text)]"
            >
              Book a stay instead
            </Link>
          </div>
        </div>
      </GuestPageShell>
    );
  }

  return (
    <GuestPageShell className="max-w-[1240px] pb-40 md:pb-10">
      <section data-testid="booking-page" className="mb-5">
        <GuestHero
          testId="booking-header"
          dark
          eyebrow="Guest Portal"
          title="Book a Tour"
          subtitle="Simple flow: choose a tour, select your date, then submit payment proof."
          contentClassName="lg:min-h-[174px] lg:p-6"
          rightSlot={(
            <div className="rounded-3xl border border-white/15 bg-white/10 p-4 text-white/90 backdrop-blur">
              <div className="flex items-center gap-2 text-base font-semibold text-white">
                <ShieldCheck className="h-4 w-4 text-teal-300" aria-hidden="true" />
                Secure booking
              </div>
              <p className="mt-2 text-sm text-white/75">
                Payment proof is reviewed before check-in confirmation.
              </p>
            </div>
          )}
        />
      </section>
      <div className="mb-5 grid w-full grid-cols-3 gap-2 text-center lg:max-w-md">
          <button
            type="button"
            onClick={() => setMobileStep(1)}
            className={`flex h-10 w-full items-center justify-center gap-2 whitespace-nowrap rounded-2xl px-2 text-xs font-bold ${
              mobileStep === 1 ? "bg-[var(--color-primary)] text-white" : "border border-slate-200 bg-white text-slate-500"
            }`}
          >
            <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${mobileStep === 1 ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"}`}>1</span>
            Tour
          </button>
          <button
            type="button"
            onClick={() => {
              if (!serviceId) {
                setSubmitError("Select a tour service first.");
                setMobileStep(1);
                return;
              }
              setMobileStep(2);
            }}
            className={`flex h-10 w-full items-center justify-center gap-2 whitespace-nowrap rounded-2xl px-2 text-xs font-bold ${
              mobileStep === 2 ? "bg-[var(--color-primary)] text-white" : "border border-slate-200 bg-white text-slate-500"
            }`}
          >
            <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${mobileStep === 2 ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"}`}>2</span>
            Payment
          </button>
          <button
            type="button"
            onClick={() => {
              if (!serviceId) {
                setSubmitError("Select a tour service first.");
                setMobileStep(1);
                return;
              }
              setMobileStep(3);
            }}
            className={`flex h-10 w-full items-center justify-center gap-2 whitespace-nowrap rounded-2xl px-2 text-xs font-bold ${
              mobileStep === 3 ? "bg-[var(--color-primary)] text-white" : "border border-slate-200 bg-white text-slate-500"
            }`}
          >
            <span className={`inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] ${mobileStep === 3 ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"}`}>3</span>
            Confirm
          </button>
      </div>
      {!networkOnline ? (
        <SyncAlertBanner
          className="mb-4"
          message="You are offline. Tour booking and payment actions will queue for sync."
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
          aria-live="polite"
        />
      ) : null}
      {submitError ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" role="alert">
          {submitError}
        </p>
      ) : null}
      {latestAiRecommendation ? (
        <div className="mb-4 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-900 shadow-sm">
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

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="space-y-5">
          <GuestSectionCard className="rounded-[2rem] border-slate-200/80 p-5 shadow-sm md:p-6">
            <div className="mb-4 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setMobileStep((prev) => (prev === 1 ? 0 : 1))}
                className="inline-flex items-center gap-2 text-left lg:hidden"
                aria-expanded={mobileStep === 1}
              >
                <h2 className="inline-flex items-center gap-2 text-xl font-bold text-[var(--color-primary)]">
                  <CalendarDays className="h-5 w-5 text-[var(--color-secondary)]" />
                  Select tour details
                </h2>
                {mobileStep === 1 ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}
              </button>
              <h2 className="hidden items-center gap-2 text-xl font-bold text-[var(--color-primary)] lg:inline-flex">
                <CalendarDays className="h-5 w-5 text-[var(--color-secondary)]" />
                Select tour details
              </h2>
              <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">Step 1</span>
            </div>
            <div className={`${mobileStep === 1 ? "grid" : "hidden lg:grid"} gap-4 md:grid-cols-2`}>
              <label className="guest-form-label relative md:col-span-2">
                Select Tour
                <select
                  value={serviceId}
                  onChange={(event) => {
                    setServiceId(event.target.value);
                    setPayNow(0);
                    setPayNowInput("0");
                    setMobileStep(2);
                  }}
                  disabled={servicesLoading}
                  className="guest-field-control appearance-none pr-10"
                >
                  <option value="">Select a service</option>
                  {services.map((service) => (
                    <option key={service.service_id} value={service.service_id}>
                      {formatTourOptionLabel(service)}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-3 top-[43px] h-4 w-4 text-slate-500" aria-hidden="true" />
                {servicesLoading ? <span className="text-xs text-slate-500">Loading active tours...</span> : null}
                {servicesError ? (
                  <span className="mt-1 inline-flex flex-wrap items-center gap-2 text-xs text-red-600">
                    <span>{servicesError}</span>
                    <button
                      type="button"
                      onClick={() => {
                        setServicesError(null);
                        setServicesLoading(true);
                        void apiFetch<ServiceListResponse>(
                          "/v2/catalog/services",
                          { method: "GET" },
                          token,
                          serviceListResponseSchema,
                        )
                          .then((data) => setServices(data.items ?? []))
                          .catch((error) => setServicesError(getApiErrorMessage(error, "Failed to load active tours.")))
                          .finally(() => setServicesLoading(false));
                      }}
                      className="inline-flex h-7 items-center rounded-md border border-red-200 bg-white px-2.5 font-semibold text-red-700"
                    >
                      Retry
                    </button>
                  </span>
                ) : null}
                {!servicesLoading && !servicesError && services.length === 0 ? (
                  <span className="mt-1 inline-flex flex-col gap-2 rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-slate-50 p-3 text-xs text-[var(--color-muted)]">
                    <span className="font-semibold text-[var(--color-text)]">No active tours are available right now.</span>
                    <span>Try again in a moment or continue with a room booking.</span>
                    <span className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setServicesLoading(true);
                          setServicesError(null);
                          void apiFetch<ServiceListResponse>(
                            "/v2/catalog/services",
                            { method: "GET" },
                            token,
                            serviceListResponseSchema,
                          )
                            .then((data) => setServices(data.items ?? []))
                            .catch((error) => setServicesError(getApiErrorMessage(error, "Failed to load active tours.")))
                            .finally(() => setServicesLoading(false));
                        }}
                        className="inline-flex h-7 items-center rounded-md border border-[var(--color-border)] bg-white px-2.5 font-semibold text-[var(--color-text)]"
                      >
                        Retry services
                      </button>
                      <Link
                        href="/book"
                        className="inline-flex h-7 items-center rounded-md border border-[var(--color-border)] bg-white px-2.5 font-semibold text-[var(--color-text)]"
                      >
                        Go to stay booking
                      </Link>
                    </span>
                  </span>
                ) : null}
              </label>

              <FancyDatePicker
                label="Visit Date"
                value={visitDate}
                min={minVisitDate}
                onChange={setVisitDate}
              />

              <label className="guest-form-label">
                Guests
                <div className="grid gap-2 rounded-xl border border-[var(--color-border)] bg-slate-50 p-2 sm:grid-cols-2">
                  <div className="flex items-center gap-2">
                    <span className="min-w-[56px] rounded-md bg-white px-2 py-1 text-xs font-semibold text-slate-600">Adults</span>
                    <button
                      type="button"
                      onClick={() => applyAdultQty(adultQty - 1)}
                      className="guest-stepper-btn guest-field-control-sm"
                      aria-label="Decrease adult guests"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min={0}
                      value={adultQtyInput}
                      onFocus={() => {
                        if ((adultQtyInput ?? "").trim() === "0") {
                          setAdultQtyInput("");
                        }
                      }}
                      onChange={(event) => {
                        const rawValue = event.target.value;
                        if (rawValue.trim() === "") {
                          setAdultQtyInput("");
                          setAdultQty(0);
                          return;
                        }
                        const parsed = Number(rawValue);
                        if (Number.isNaN(parsed)) return;
                        const normalized = String(Math.max(0, parsed));
                        setAdultQtyInput(normalized);
                        setAdultQty(Math.max(0, parsed));
                      }}
                      onBlur={() => {
                        if ((adultQtyInput ?? "").trim() === "") {
                          setAdultQtyInput("0");
                          setAdultQty(0);
                        }
                      }}
                      className="guest-field-control guest-field-control-sm w-14 text-center"
                    />
                    <button
                      type="button"
                      onClick={() => applyAdultQty(adultQty + 1)}
                      className="guest-stepper-btn guest-field-control-sm"
                      aria-label="Increase adult guests"
                    >
                      +
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="min-w-[56px] rounded-md bg-white px-2 py-1 text-xs font-semibold text-slate-600">Kids</span>
                    <button
                      type="button"
                      onClick={() => applyKidQty(kidQty - 1)}
                      className="guest-stepper-btn guest-field-control-sm"
                      aria-label="Decrease kid guests"
                    >
                      -
                    </button>
                    <input
                      type="number"
                      min={0}
                      value={kidQtyInput}
                      onFocus={() => {
                        if ((kidQtyInput ?? "").trim() === "0") {
                          setKidQtyInput("");
                        }
                      }}
                      onChange={(event) => {
                        const rawValue = event.target.value;
                        if (rawValue.trim() === "") {
                          setKidQtyInput("");
                          setKidQty(0);
                          return;
                        }
                        const parsed = Number(rawValue);
                        if (Number.isNaN(parsed)) return;
                        const normalized = String(Math.max(0, parsed));
                        setKidQtyInput(normalized);
                        setKidQty(Math.max(0, parsed));
                      }}
                      onBlur={() => {
                        if ((kidQtyInput ?? "").trim() === "") {
                          setKidQtyInput("0");
                          setKidQty(0);
                        }
                      }}
                      className="guest-field-control guest-field-control-sm w-14 text-center"
                    />
                    <button
                      type="button"
                      onClick={() => applyKidQty(kidQty + 1)}
                      className="guest-stepper-btn guest-field-control-sm"
                      aria-label="Increase kid guests"
                    >
                      +
                    </button>
                  </div>
                </div>
              </label>
            </div>
            {!selectedService ? (
              <div data-testid="tour-empty-state" className="mt-4 rounded-2xl border border-dashed border-[var(--color-border)] bg-slate-50 p-4 text-sm text-[var(--color-muted)]">
                <p className="font-semibold text-[var(--color-text)]">Select a tour to continue.</p>
                <p className="mt-1">Payment details will appear after selection.</p>
              </div>
            ) : null}
          </GuestSectionCard>

          <GuestSectionCard className="rounded-[2rem] border-slate-200/80 p-5 shadow-sm md:p-6">
              <div className="mb-4 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => {
                    if (!serviceId) {
                      setSubmitError("Select a tour service first.");
                      setMobileStep(1);
                      return;
                    }
                    setMobileStep((prev) => (prev === 2 ? 0 : 2));
                  }}
                  className="inline-flex items-center gap-2 text-left lg:hidden"
                  aria-expanded={mobileStep === 2}
                >
                  <h2 className="inline-flex items-center gap-2 text-xl font-bold text-[var(--color-primary)]">
                    <CreditCard className="h-5 w-5 text-[var(--color-secondary)]" />
                    Payment details
                  </h2>
                  {mobileStep === 2 ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}
                </button>
                <h2 className="hidden items-center gap-2 text-xl font-bold text-[var(--color-primary)] lg:inline-flex">
                  <CreditCard className="h-5 w-5 text-[var(--color-secondary)]" />
                  Payment details
                </h2>
                <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">Step 2</span>
              </div>
              {selectedService ? (
              <div className={`${mobileStep === 2 ? "grid" : "hidden lg:grid"} gap-4 md:grid-cols-2`}>
                <label className="guest-form-label">
                  Pay Now Amount
                  <input
                    type="number"
                    min={minRequired}
                    max={totalAmount || undefined}
                    value={payNowInput}
                    onFocus={() => {
                      if ((payNowInput ?? "").trim() === "0") {
                        setPayNowInput("");
                      }
                    }}
                    onChange={(event) => {
                      const rawValue = event.target.value;
                      setPayNowInput(rawValue);
                      const parsed = Number(rawValue);
                      if (rawValue.trim() === "" || Number.isNaN(parsed)) {
                        setPayNow(0);
                        return;
                      }
                      setPayNow(Math.max(0, parsed));
                    }}
                    onBlur={() => {
                      if ((payNowInput ?? "").trim() === "") {
                        setPayNowInput("0");
                        setPayNow(0);
                      }
                    }}
                    className="guest-field-control"
                  />
                </label>

                <label className="guest-form-label">
                  Reference Number (optional)
                  <input
                    type="text"
                    value={referenceNo}
                    onChange={(event) => setReferenceNo(event.target.value)}
                    className="guest-field-control"
                  />
                </label>
              </div>
              ) : (
                <div className={`${mobileStep === 2 ? "block" : "hidden lg:block"} rounded-2xl border border-dashed border-[var(--color-border)] bg-slate-50 p-4 text-sm text-[var(--color-muted)]`}>
                  <p className="font-semibold text-[var(--color-text)]">Select a tour to unlock payment details.</p>
                  <p className="mt-1">Step 2 appears after choosing your tour in Step 1.</p>
                </div>
              )}
              {selectedService ? (
                <>
                  <div className={`${mobileStep === 2 ? "mt-4 grid" : "hidden lg:grid lg:mt-4"} gap-2`}>
                    <p className="text-sm font-semibold text-slate-900">Payment proof</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setProofMode("file")}
                        data-active={proofMode === "file"}
                        className="guest-toggle-pill"
                      >
                        Upload file
                      </button>
                      <button
                        type="button"
                        onClick={() => setProofMode("url")}
                        data-active={proofMode === "url"}
                        className="guest-toggle-pill"
                      >
                        Proof URL
                      </button>
                    </div>
                    {proofMode === "file" ? (
                      <input
                        type="file"
                        accept="image/*,.pdf"
                        onChange={(event) => setProofFile(event.target.files?.[0] ?? null)}
                        className="guest-field-control guest-field-control-file text-sm"
                      />
                    ) : (
                      <input
                        type="url"
                        value={proofUrl}
                        onChange={(event) => setProofUrl(event.target.value)}
                        placeholder="https://..."
                        className="guest-field-control"
                      />
                    )}
                  </div>
                  <details className={`${mobileStep === 2 ? "mt-4 block" : "hidden lg:block lg:mt-4"} rounded-xl border border-slate-200 bg-slate-50 p-3`}>
                    <summary className="cursor-pointer text-sm font-semibold text-slate-700">How payment verification works</summary>
                    <div className="mt-3 space-y-3">
                      <PaymentVerificationInfo />
                      <GcashPaymentGuide compact />
                    </div>
                  </details>
                </>
              ) : null}
            </GuestSectionCard>

          <GuestSectionCard className="rounded-[2rem] border-slate-200/80 p-5 shadow-sm lg:hidden">
            <div className="mb-4 flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  if (!serviceId) {
                    setSubmitError("Select a tour service first.");
                    setMobileStep(1);
                    return;
                  }
                  setMobileStep((prev) => (prev === 3 ? 0 : 3));
                }}
                className="inline-flex items-center gap-2 text-left"
                aria-expanded={mobileStep === 3}
              >
                <h2 className="text-xl font-bold text-[var(--color-primary)]">Review & confirm</h2>
                {mobileStep === 3 ? <ChevronDown className="h-4 w-4 text-slate-500" /> : <ChevronRight className="h-4 w-4 text-slate-500" />}
              </button>
              <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">Step 3</span>
            </div>
            <div className={`${mobileStep === 3 ? "block" : "hidden"}`}>
              <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
                <div className="flex items-center justify-between text-slate-600">
                  <span>Guests</span>
                  <span className="font-semibold text-slate-900">{activeGuestCount}</span>
                </div>
                <div className="flex items-center justify-between text-slate-600">
                  <span>Total</span>
                  <span className="font-bold text-slate-900">{toPeso(totalAmount)}</span>
                </div>
                <div className="flex items-center justify-between text-slate-600">
                  <span>Minimum pay now</span>
                  <span className="font-semibold text-slate-900">{toPeso(minRequired)}</span>
                </div>
              </div>
              <p className="mt-3 text-xs text-slate-500">Payment proof is reviewed by admin before check-in.</p>
            </div>
          </GuestSectionCard>
        </div>

        <aside className="hidden lg:sticky lg:top-24 lg:block">
          <GuestSectionCard className="rounded-[2rem] border-slate-200/80 p-5 shadow-sm">
            <h3 className="inline-flex items-center gap-2 text-lg font-bold text-[var(--color-primary)]">
              <CheckCircle2 className="h-5 w-5 text-[var(--color-secondary)]" />
              Review & confirm
            </h3>
            <div className="mt-4 space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm">
              <div className="flex items-center justify-between text-slate-600">
                <span>Guests</span>
                <span className="font-semibold text-slate-900">{activeGuestCount}</span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Total</span>
                <span className="font-bold text-slate-900">{toPeso(totalAmount)}</span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Minimum pay now</span>
                <span className="font-semibold text-slate-900">{toPeso(minRequired)}</span>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-500">Payment proof is reviewed by admin before check-in.</p>

            <button
              type="button"
              onClick={() => void submitTourBooking()}
              disabled={!canSubmitTour}
              className="guest-primary-cta mt-4 h-12 w-full"
            >
              {submitBusy ? "Creating..." : "Reserve Tour"}
            </button>
            {submitBlockerMessage ? (
              <p className="mt-2 text-center text-xs font-medium text-slate-600">{submitBlockerMessage}</p>
            ) : null}
          </GuestSectionCard>
        </aside>
      </div>
      <div className="sticky bottom-[calc(5.6rem+env(safe-area-inset-bottom))] z-20 mt-4 px-3 md:hidden">
        <div className="mx-auto flex max-w-[430px] items-center justify-between rounded-2xl border border-[var(--color-border)] bg-white px-3 py-2 shadow-[var(--shadow-md)]">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--color-muted)]">Tour summary</p>
            <p className="text-sm font-bold text-[var(--color-text)]">{toPeso(totalAmount)}</p>
          </div>
          <button
            type="button"
            onClick={() => void submitTourBooking()}
            disabled={!canSubmitTour}
            className="guest-primary-cta min-h-11 px-4 text-sm"
          >
            {submitBusy ? "Creating..." : "Reserve Tour"}
          </button>
        </div>
        {submitBlockerMessage ? (
          <p className="mx-auto mt-2 max-w-[430px] text-center text-xs font-medium text-slate-600">{submitBlockerMessage}</p>
        ) : null}
      </div>
    </GuestPageShell>
  );
}

