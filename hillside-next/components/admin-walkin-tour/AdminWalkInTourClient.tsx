"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type {
  PricingRecommendation,
  ReservationCreateResponse,
  ServiceItem,
  ServiceListResponse,
} from "../../../packages/shared/src/types";
import {
  reservationCreateResponseSchema,
  serviceListResponseSchema,
} from "../../../packages/shared/src/schemas";
import { apiFetch } from "../../lib/apiClient";

type AdminWalkInTourClientProps = {
  initialToken?: string | null;
  initialServicesData?: ServiceListResponse | null;
};

function toPeso(value: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

function todayIso() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getAiSource(recommendation: PricingRecommendation | null) {
  if (!recommendation) return null;
  const explains = recommendation.explanations.map((item) => item.toLowerCase());
  return explains.some((item) => item.includes("fallback")) ? "fallback" : "live";
}

export function AdminWalkInTourClient({
  initialToken = null,
  initialServicesData = null,
}: AdminWalkInTourClientProps) {
  const router = useRouter();
  const token = initialToken;

  const [services, setServices] = useState<ServiceItem[]>(initialServicesData?.items ?? []);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [servicesError, setServicesError] = useState<string | null>(null);

  const [serviceId, setServiceId] = useState("");
  const [visitDate, setVisitDate] = useState(todayIso());
  const [adultQty, setAdultQty] = useState(1);
  const [kidQty, setKidQty] = useState(0);
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [notes, setNotes] = useState("");

  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [latestAiRecommendation, setLatestAiRecommendation] = useState<PricingRecommendation | null>(null);

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
        setServicesError(unknownError instanceof Error ? unknownError.message : "Failed to load tour services.");
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

  const selectedService = services.find((service) => service.service_id === serviceId);
  const totalAmount = useMemo(() => {
    if (!selectedService) return 0;
    return adultQty * Number(selectedService.adult_rate || 0) + kidQty * Number(selectedService.kid_rate || 0);
  }, [adultQty, kidQty, selectedService]);

  async function submitWalkInTour() {
    if (!token) return;
    if (!serviceId) {
      setSubmitError("Please select a tour service.");
      return;
    }
    if (!visitDate) {
      setSubmitError("Visit date is required.");
      return;
    }
    if (adultQty + kidQty <= 0) {
      setSubmitError("At least one guest is required.");
      return;
    }
    if (totalAmount <= 0) {
      setSubmitError("Computed total must be greater than zero.");
      return;
    }

    const combinedNotes = [
      guestName.trim() ? `Walk-in: ${guestName.trim()}` : null,
      guestPhone.trim() ? `Phone: ${guestPhone.trim()}` : null,
      notes.trim() ? `Notes: ${notes.trim()}` : null,
    ]
      .filter(Boolean)
      .join(" | ");

    setSubmitBusy(true);
    setSubmitError(null);
    setSuccessMessage(null);
    setLatestAiRecommendation(null);

    try {
      const created = await apiFetch<ReservationCreateResponse>(
        "/v2/reservations/tours",
        {
          method: "POST",
          body: JSON.stringify({
            service_id: serviceId,
            visit_date: visitDate,
            adult_qty: adultQty,
            kid_qty: kidQty,
            is_advance: false,
            notes: combinedNotes || null,
          }),
        },
        token,
        reservationCreateResponseSchema,
      );
      setLatestAiRecommendation(created.ai_recommendation ?? null);

      setSuccessMessage(`Walk-in tour ${created.reservation_code} created successfully.`);
      window.setTimeout(() => router.push("/admin/reservations"), 800);
    } catch (unknownError) {
      setSubmitError(unknownError instanceof Error ? unknownError.message : "Failed to create walk-in tour.");
    } finally {
      setSubmitBusy(false);
    }
  }

  if (!token) {
    return (
      <section className="mx-auto w-full max-w-3xl">
        <h1 className="text-3xl font-bold text-slate-900">Walk-in Tour</h1>
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          No active admin session found. Sign in first.
        </p>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-3xl">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-slate-900">Walk-in Tour</h1>
        <p className="mt-1 text-sm text-slate-600">Create on-site tour reservations through the V2 API.</p>
      </header>

      {successMessage ? (
        <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{successMessage}</p>
      ) : null}
      {submitError ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{submitError}</p>
      ) : null}
      {latestAiRecommendation ? (
        <div className="mb-4 rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900">
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

      <div className="rounded-xl border border-blue-100 bg-white p-6 shadow-sm">
        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-1 text-sm text-slate-700">
            Select Tour
            <select
              value={serviceId}
              onChange={(event) => setServiceId(event.target.value)}
              disabled={servicesLoading}
              className="rounded-lg border border-slate-300 px-3 py-2 outline-none ring-blue-200 transition focus:ring-2"
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

          <label className="grid gap-1 text-sm text-slate-700">
            Visit Date
            <input
              type="date"
              min={todayIso()}
              value={visitDate}
              onChange={(event) => setVisitDate(event.target.value)}
              className="rounded-lg border border-slate-300 px-3 py-2 outline-none ring-blue-200 transition focus:ring-2"
            />
          </label>

          <label className="grid gap-1 text-sm text-slate-700">
            Adults
            <input
              type="number"
              min={0}
              value={adultQty}
              onChange={(event) => setAdultQty(Math.max(0, Number(event.target.value || 0)))}
              className="rounded-lg border border-slate-300 px-3 py-2 outline-none ring-blue-200 transition focus:ring-2"
            />
          </label>

          <label className="grid gap-1 text-sm text-slate-700">
            Kids
            <input
              type="number"
              min={0}
              value={kidQty}
              onChange={(event) => setKidQty(Math.max(0, Number(event.target.value || 0)))}
              className="rounded-lg border border-slate-300 px-3 py-2 outline-none ring-blue-200 transition focus:ring-2"
            />
          </label>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="grid gap-1 text-sm text-slate-700">
            Guest Name (optional)
            <input
              type="text"
              value={guestName}
              onChange={(event) => setGuestName(event.target.value)}
              placeholder="Walk-in guest"
              className="rounded-lg border border-slate-300 px-3 py-2 outline-none ring-blue-200 transition focus:ring-2"
            />
          </label>

          <label className="grid gap-1 text-sm text-slate-700">
            Guest Phone (optional)
            <input
              type="text"
              value={guestPhone}
              onChange={(event) => setGuestPhone(event.target.value)}
              placeholder="09XX XXX XXXX"
              className="rounded-lg border border-slate-300 px-3 py-2 outline-none ring-blue-200 transition focus:ring-2"
            />
          </label>
        </div>

        <label className="mt-4 grid gap-1 text-sm text-slate-700">
          Notes (optional)
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            className="rounded-lg border border-slate-300 px-3 py-2 outline-none ring-blue-200 transition focus:ring-2"
          />
        </label>

        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
          <p className="text-sm text-slate-600">
            Total: <strong className="text-slate-900">{toPeso(totalAmount)}</strong>
          </p>
          <p className="mt-1 text-xs text-slate-500">Walk-in tours are created as on-site payment reservations.</p>
        </div>

        <button
          type="button"
          onClick={() => void submitWalkInTour()}
          disabled={submitBusy}
          className="mt-6 w-full rounded-lg bg-[#f97316] px-4 py-3 text-sm font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitBusy ? "Creating..." : "Create Walk-in Tour"}
        </button>
      </div>
    </section>
  );
}
