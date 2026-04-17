"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { syncAwareMutation } from "../../lib/offlineSync/mutation";
import { queuePaymentSubmissionWithFile } from "../../lib/offlineSync/paymentSubmission";
import { getSupabaseBrowserClient } from "../../lib/supabase";
import { FancyDatePicker } from "../shared/FancyDatePicker";
import { GcashPaymentGuide } from "../shared/GcashPaymentGuide";

type ToursBookingClientProps = {
  initialToken?: string | null;
  initialSessionEmail?: string | null;
  initialServicesData?: ServiceListResponse | null;
};

function toPeso(value: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(value);
}

function todayPlus(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
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

export function ToursBookingClient({
  initialToken = null,
  initialSessionEmail = null,
  initialServicesData = null,
}: ToursBookingClientProps) {
  const router = useRouter();
  const token = initialToken;
  const sessionEmail = initialSessionEmail;

  const [services, setServices] = useState<ServiceItem[]>(initialServicesData?.items ?? []);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [servicesError, setServicesError] = useState<string | null>(null);

  const [serviceId, setServiceId] = useState("");
  const [visitDate, setVisitDate] = useState(todayPlus(1));
  const [adultQty, setAdultQty] = useState(1);
  const [kidQty, setKidQty] = useState(0);
  const [payNow, setPayNow] = useState(0);

  const [proofMode, setProofMode] = useState<"file" | "url">("file");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofUrl, setProofUrl] = useState("");
  const [referenceNo, setReferenceNo] = useState("");

  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [successHasSyncCta, setSuccessHasSyncCta] = useState(false);
  const [latestAiRecommendation, setLatestAiRecommendation] = useState<PricingRecommendation | null>(null);

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
        setServicesError(unknownError instanceof Error ? unknownError.message : "Failed to load active tours.");
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
  const totalAmount = useMemo(() => {
    if (!selectedService) return 0;
    return adultQty * Number(selectedService.adult_rate || 0) + kidQty * Number(selectedService.kid_rate || 0);
  }, [adultQty, kidQty, selectedService]);
  const minRequired = useMemo(() => {
    if (totalAmount <= 0) return 0;
    return totalAmount <= 500 ? totalAmount : 500;
  }, [totalAmount]);

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
      setSubmitError(unknownError instanceof Error ? unknownError.message : "Failed to create tour booking.");
    } finally {
      setSubmitBusy(false);
    }
  }

  if (!token) {
    return (
      <section className="mx-auto w-full max-w-4xl">
        <header className="mb-4 rounded-3xl border border-slate-200/70 bg-gradient-to-br from-white via-slate-50 to-blue-50 p-6 shadow-sm">
          <h1 className="text-3xl font-bold text-slate-900">Book a Tour</h1>
          <p className="mt-2 text-sm text-slate-600">Reserve a guided experience and secure your slot.</p>
        </header>
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          Please sign in first to reserve a tour.
        </p>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-4xl">
      <header className="mb-6 rounded-3xl border border-slate-200/70 bg-gradient-to-br from-white via-slate-50 to-blue-50 p-6 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-500">Experiences</p>
            <h1 className="mt-2 text-3xl font-bold text-slate-900">Book a Tour</h1>
            <p className="mt-2 text-sm text-slate-600">
              Signed in as <strong>{sessionEmail ?? "guest"}</strong>
            </p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white/90 px-4 py-3 text-xs text-slate-600">
            <p className="font-semibold text-slate-900">Quick tip</p>
            <p className="mt-1">Advance tours require payment proof.</p>
          </div>
        </div>
      </header>

      {successMessage ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
          <p className="text-sm text-emerald-700">{successMessage}</p>
          {successHasSyncCta ? (
            <Link
              href="/guest/sync"
              className="inline-flex h-8 items-center rounded-full border border-emerald-300 bg-white px-3 text-xs font-semibold text-emerald-800"
            >
              Open Sync Center
            </Link>
          ) : null}
        </div>
      ) : null}
      {submitError ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{submitError}</p>
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

      <div className="rounded-2xl border border-slate-200/70 bg-white p-6 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-1 text-sm text-slate-700">
            Select Tour
            <select
              value={serviceId}
              onChange={(event) => {
                setServiceId(event.target.value);
                setPayNow(0);
              }}
              disabled={servicesLoading}
              className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 outline-none ring-blue-200 transition focus:ring-2"
            >
              <option value="">Select a service</option>
              {services.map((service) => (
                <option key={service.service_id} value={service.service_id}>
                  {service.service_name} ({service.start_time || "--"}-{service.end_time || "--"})
                </option>
              ))}
            </select>
            {servicesLoading ? <span className="text-xs text-slate-500">Loading active tours...</span> : null}
            {servicesError ? <span className="text-xs text-red-600">{servicesError}</span> : null}
          </label>

          <FancyDatePicker
            label="Visit Date"
            value={visitDate}
            min={todayPlus(1)}
            onChange={setVisitDate}
          />

          <label className="grid gap-1 text-sm text-slate-700">
            Adults
            <input
              type="number"
              min={0}
              value={adultQty}
              onChange={(event) => setAdultQty(Math.max(0, Number(event.target.value || 0)))}
              className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 outline-none ring-blue-200 transition focus:ring-2"
            />
          </label>

          <label className="grid gap-1 text-sm text-slate-700">
            Kids
            <input
              type="number"
              min={0}
              value={kidQty}
              onChange={(event) => setKidQty(Math.max(0, Number(event.target.value || 0)))}
              className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 outline-none ring-blue-200 transition focus:ring-2"
            />
          </label>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200/70 bg-slate-50 p-4">
          <p className="text-sm text-slate-600">
            Total: <strong className="text-slate-900">{toPeso(totalAmount)}</strong>
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Minimum online payment now: {toPeso(minRequired)} (full if total {"<="} PHP 500, else PHP 500 minimum).
          </p>
        </div>

        <GcashPaymentGuide className="mt-4" />

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="grid gap-1 text-sm text-slate-700">
            Pay Now Amount
            <input
              type="number"
              min={minRequired}
              max={totalAmount || undefined}
              value={payNow}
              onChange={(event) => setPayNow(Math.max(0, Number(event.target.value || 0)))}
              className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 outline-none ring-blue-200 transition focus:ring-2"
            />
          </label>

          <label className="grid gap-1 text-sm text-slate-700">
            Reference Number (optional)
            <input
              type="text"
              value={referenceNo}
              onChange={(event) => setReferenceNo(event.target.value)}
              className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 outline-none ring-blue-200 transition focus:ring-2"
            />
          </label>
        </div>

        <div className="mt-4 grid gap-2">
          <p className="text-sm font-semibold text-slate-900">Payment proof</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setProofMode("file")}
              className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
                proofMode === "file" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"
              }`}
            >
              Upload file
            </button>
            <button
              type="button"
              onClick={() => setProofMode("url")}
              className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
                proofMode === "url" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-300 bg-white text-slate-700"
              }`}
            >
              Proof URL
            </button>
          </div>
          {proofMode === "file" ? (
            <input
              type="file"
              accept="image/*,.pdf"
              onChange={(event) => setProofFile(event.target.files?.[0] ?? null)}
              className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm"
            />
          ) : (
            <input
              type="url"
              value={proofUrl}
              onChange={(event) => setProofUrl(event.target.value)}
              placeholder="https://..."
              className="rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 outline-none ring-blue-200 transition focus:ring-2"
            />
          )}
        </div>

        <button
          type="button"
          onClick={() => void submitTourBooking()}
          disabled={submitBusy}
          className="mt-6 w-full rounded-lg bg-[var(--color-cta)] px-4 py-3 text-sm font-semibold text-white shadow-sm transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitBusy ? "Creating..." : "Reserve Tour"}
        </button>
      </div>
    </section>
  );
}

