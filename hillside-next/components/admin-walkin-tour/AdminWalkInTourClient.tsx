"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, Phone, Ticket, User } from "lucide-react";
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
import { getApiErrorMessage } from "../../lib/apiError";
import { syncAwareMutation } from "../../lib/offlineSync/mutation";
import { FancyDatePicker } from "../shared/FancyDatePicker";
import { useToast } from "../shared/ToastProvider";

type AdminWalkInTourClientProps = {
  initialToken?: string | null;
  initialServicesData?: ServiceListResponse | null;
  embedded?: boolean;
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
  embedded = false,
}: AdminWalkInTourClientProps) {
  const { showToast } = useToast();
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
  const [queuedOperationId, setQueuedOperationId] = useState<string | null>(null);
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
        setServicesError(getApiErrorMessage(unknownError, "Failed to load tour services."));
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
    setQueuedOperationId(null);
    setLatestAiRecommendation(null);

    try {
      const payload = {
        service_id: serviceId,
        visit_date: visitDate,
        adult_qty: adultQty,
        kid_qty: kidQty,
        is_advance: false,
        notes: combinedNotes || null,
      };
      const created = await syncAwareMutation<typeof payload, ReservationCreateResponse>({
        path: "/v2/reservations/tours",
        method: "POST",
        payload,
        parser: reservationCreateResponseSchema,
        accessToken: token,
        entityType: "tour_reservation",
        action: "reservations.tours.create",
      });
      if (created.mode === "queued") {
        setQueuedOperationId(created.operationId);
        setGuestName("");
        setGuestPhone("");
        setNotes("");
        showToast({
          type: "info",
          title: "Walk-in tour saved offline",
          message: "Queued in Sync Center and will redirect to Payments after sync.",
        });
        return;
      }
      const createdData = created.data;
      setLatestAiRecommendation(createdData.ai_recommendation ?? null);
      showToast({
        type: "success",
        title: `Walk-in tour ${createdData.reservation_code} created`,
        message: "Redirecting to Payments for settlement.",
      });
      router.push(
        `/admin/payments?source=walkin&walkin_type=tour&reservation_id=${encodeURIComponent(createdData.reservation_id)}&amount=${encodeURIComponent(
          String(Math.max(1, Math.round(totalAmount))),
        )}&method=cash`,
      );
    } catch (unknownError) {
      setSubmitError(getApiErrorMessage(unknownError, "Failed to create walk-in tour."));
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
    <section className={`mx-auto w-full ${embedded ? "max-w-none" : "max-w-6xl"}`}>
      {!embedded ? (
        <header className="mb-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-sm)]">
          <h1 className="text-3xl font-bold text-[var(--color-text)]">Walk-in Tour</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Create on-site tour reservations, then continue to Payments to record settlement.
          </p>
        </header>
      ) : null}

      {submitError ? (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{submitError}</span>
        </div>
      ) : null}
      {queuedOperationId ? (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <p className="font-semibold">Walk-in tour saved offline</p>
          <p className="mt-1 text-xs text-amber-800">
            Operation {queuedOperationId.slice(0, 8)} is queued. Reconnect and run Sync to create this tour, then continue payment.
          </p>
        </div>
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

      <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-sm)]">
        <div className="mb-4 flex items-center gap-2">
          <Ticket className="h-4 w-4 text-[var(--color-secondary)]" />
          <h2 className="text-lg font-semibold text-[var(--color-text)]">Tour Reservation</h2>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <label className="grid gap-1 text-sm text-slate-700">
            Select Tour
            <select
              value={serviceId}
              onChange={(event) => setServiceId(event.target.value)}
              disabled={servicesLoading}
              className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 outline-none ring-[var(--color-secondary)]/20 transition focus:ring-2"
            >
              <option value="">Select a service</option>
              {services.map((service) => (
                <option key={service.service_id} value={service.service_id}>
                  {service.service_name} ({service.start_time || "--"}-{service.end_time || "--"})
                </option>
              ))}
            </select>
            {servicesLoading ? <span className="inline-flex items-center gap-1 text-xs text-[var(--color-muted)]"><Loader2 className="h-3 w-3 animate-spin" /> Loading active tours...</span> : null}
            {servicesError ? <span className="text-xs text-red-600">{servicesError}</span> : null}
          </label>

          <FancyDatePicker label="Visit Date" value={visitDate} onChange={setVisitDate} min={todayIso()} />

          <label className="grid gap-1 text-sm text-slate-700">
            Adults
            <input
              type="number"
              min={0}
              value={adultQty}
              onChange={(event) => setAdultQty(Math.max(0, Number(event.target.value || 0)))}
              className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 outline-none ring-[var(--color-secondary)]/20 transition focus:ring-2"
            />
          </label>

          <label className="grid gap-1 text-sm text-slate-700">
            Kids
            <input
              type="number"
              min={0}
              value={kidQty}
              onChange={(event) => setKidQty(Math.max(0, Number(event.target.value || 0)))}
              className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 outline-none ring-[var(--color-secondary)]/20 transition focus:ring-2"
            />
          </label>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <label className="grid gap-1 text-sm text-slate-700">
            Guest Name (optional)
            <div className="relative">
              <User className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted)]" />
              <input
                type="text"
                value={guestName}
                onChange={(event) => setGuestName(event.target.value)}
                placeholder="Walk-in guest"
                className="w-full rounded-xl border border-[var(--color-border)] bg-white py-2 pl-9 pr-3 outline-none ring-[var(--color-secondary)]/20 transition focus:ring-2"
              />
            </div>
          </label>

          <label className="grid gap-1 text-sm text-slate-700">
            Guest Phone (optional)
            <div className="relative">
              <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted)]" />
              <input
                type="text"
                value={guestPhone}
                onChange={(event) => setGuestPhone(event.target.value)}
                placeholder="09XX XXX XXXX"
                className="w-full rounded-xl border border-[var(--color-border)] bg-white py-2 pl-9 pr-3 outline-none ring-[var(--color-secondary)]/20 transition focus:ring-2"
              />
            </div>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setVisitDate(todayIso())}
            className="inline-flex h-8 items-center rounded-full border border-[var(--color-border)] bg-white px-3 text-xs font-semibold text-[var(--color-text)]"
          >
            Same-day tour
          </button>
        </div>

        <label className="mt-4 grid gap-1 text-sm text-slate-700">
          Notes (optional)
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 outline-none ring-[var(--color-secondary)]/20 transition focus:ring-2"
          />
        </label>

        <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-4">
          <p className="text-sm text-slate-600">
            Total: <strong className="text-slate-900">{toPeso(totalAmount)}</strong>
          </p>
          <p className="mt-1 text-xs text-slate-500">After create, you will be redirected to Payments for cashier recording.</p>
        </div>

        <button
          type="button"
          onClick={() => void submitWalkInTour()}
          disabled={submitBusy}
          className="mt-6 w-full rounded-xl bg-[var(--color-cta)] px-4 py-3 text-sm font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitBusy ? "Creating..." : "Create Walk-in Tour"}
        </button>

        <p className="mt-2 text-xs text-[var(--color-muted)]">
          You can also open <Link href="/admin/payments" className="font-semibold text-[var(--color-secondary)] underline">Payments</Link> directly.
        </p>
      </div>
    </section>
  );
}
