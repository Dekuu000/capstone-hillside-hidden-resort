"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, Loader2, Phone, Tag, User } from "lucide-react";
import type {
  PricingRecommendation,
  PromoValidationResult,
  ReservationCreateResponse,
  ServiceItem,
  ServiceListResponse,
} from "../../../packages/shared/src/types";
import {
  promoValidationResultSchema,
  reservationCreateResponseSchema,
  serviceListResponseSchema,
} from "../../../packages/shared/src/schemas";
import { apiFetch } from "../../lib/apiClient";
import { getApiErrorMessage } from "../../lib/apiError";
import { todayPlusLocalIsoDate } from "../../lib/dateIso";
import { formatPhpPeso as toPeso } from "../../lib/formatCurrency";
import { tourMinPayNow, tourTotal } from "../../lib/booking/pricing";
import { syncAwareMutation } from "../../lib/offlineSync/mutation";
import { FancyDatePicker } from "../shared/FancyDatePicker";
import { Select } from "../shared/Select";
import { useToast } from "../shared/ToastProvider";

type AdminWalkInTourClientProps = {
  initialToken?: string | null;
  initialServicesData?: ServiceListResponse | null;
  embedded?: boolean;
};

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
  const [visitDate, setVisitDate] = useState(todayPlusLocalIsoDate(0));
  // Held as strings so the fields can be cleared (empty) on delete and so a
  // typed digit replaces the value instead of appending to a stuck "0".
  const [adultQty, setAdultQty] = useState("1");
  const [kidQty, setKidQty] = useState("0");
  const adults = Math.max(0, Math.trunc(Number(adultQty) || 0));
  const kids = Math.max(0, Math.trunc(Number(kidQty) || 0));
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [promoCode, setPromoCode] = useState("");
  const [promo, setPromo] = useState<PromoValidationResult | null>(null);
  const [promoBusy, setPromoBusy] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);

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
  // Shared tour pricing (same helper the guest funnel uses) minus any validated promo.
  const grossAmount = useMemo(
    () => (selectedService ? tourTotal(selectedService, adults, kids) : 0),
    [adults, kids, selectedService],
  );
  const discount = promo?.valid ? promo.discount_amount : 0;
  const totalAmount = Math.max(0, grossAmount - discount);
  const minPayNow = tourMinPayNow(totalAmount);

  // A TYPED code must be explicitly Applied; with NO code, preview the active
  // auto-apply promo for the current total (mirrors the online guest tour flow).
  useEffect(() => {
    setPromoError(null);
    if (promoCode.trim()) {
      setPromo(null);
      return;
    }
    if (!token || grossAmount <= 0) {
      setPromo(null);
      return;
    }
    let active = true;
    void (async () => {
      try {
        const auto = await apiFetch(
          "/v2/promos/validate",
          { method: "POST", body: JSON.stringify({ code: "", total: grossAmount, kind: "tours" }) },
          token,
          promoValidationResultSchema,
        );
        if (active) setPromo(auto.valid && auto.discount_amount > 0 ? auto : null);
      } catch {
        if (active) setPromo(null);
      }
    })();
    return () => {
      active = false;
    };
  }, [promoCode, grossAmount, token]);

  const applyPromo = async () => {
    const code = promoCode.trim();
    if (!code || !token) return;
    setPromoBusy(true);
    setPromoError(null);
    try {
      const result = await apiFetch(
        "/v2/promos/validate",
        { method: "POST", body: JSON.stringify({ code, total: grossAmount, kind: "tours" }) },
        token,
        promoValidationResultSchema,
      );
      if (result.valid) {
        setPromo(result);
      } else {
        setPromo(null);
        setPromoError(result.message || "This promo code is not valid.");
      }
    } catch (unknownError) {
      setPromo(null);
      setPromoError(getApiErrorMessage(unknownError, "Could not validate promo code."));
    } finally {
      setPromoBusy(false);
    }
  };

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
    if (adults + kids <= 0) {
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
        adult_qty: adults,
        kid_qty: kids,
        is_advance: false,
        notes: combinedNotes || null,
        promo_code: promoCode.trim() || null,
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
        <h1 className="text-3xl font-bold text-[var(--color-text)]">Walk-in Tour</h1>
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          No active admin session found. Sign in first.
        </p>
      </section>
    );
  }

  return (
    <section className={`mx-auto w-full ${embedded ? "max-w-none" : "max-w-[1600px]"}`}>
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

      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-sm)]">
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-xs font-bold text-white">1</span>
            <div>
              <h2 className="text-lg font-semibold text-[var(--color-text)]">Tour &amp; date</h2>
              <p className="text-xs text-[var(--color-muted)]">Pick the tour, date, and group size.</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="grid gap-1 text-sm text-[var(--color-text)] sm:col-span-2">
              Select tour
              <Select
                ariaLabel="Select tour"
                value={serviceId}
                onChange={(next) => setServiceId(next)}
                disabled={servicesLoading}
                placeholder="Select a service"
                options={services.map((service) => ({
                  value: service.service_id,
                  label: `${service.service_name} (${service.start_time || "--"}-${service.end_time || "--"})`,
                }))}
              />
              {servicesLoading ? <span className="inline-flex items-center gap-1 text-xs text-[var(--color-muted)]"><Loader2 className="h-3 w-3 animate-spin" /> Loading active tours...</span> : null}
              {servicesError ? <span className="text-xs text-red-600">{servicesError}</span> : null}
            </label>

            <div className="sm:col-span-2">
              <FancyDatePicker label="Visit date" value={visitDate} onChange={setVisitDate} min={todayPlusLocalIsoDate(0)} />
            </div>

            <label className="grid gap-1 text-sm text-[var(--color-text)]">
              Adults
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={adultQty}
                onFocus={(event) => event.target.select()}
                onChange={(event) => setAdultQty(event.target.value.replace(/[^0-9]/g, "").replace(/^0+(?=\d)/, ""))}
                onBlur={(event) => setAdultQty(event.target.value === "" ? "" : String(Math.max(0, Math.trunc(Number(event.target.value) || 0))))}
                className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 outline-none ring-[var(--color-secondary)]/20 transition focus:ring-2"
              />
            </label>

            <label className="grid gap-1 text-sm text-[var(--color-text)]">
              Kids
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={kidQty}
                onFocus={(event) => event.target.select()}
                onChange={(event) => setKidQty(event.target.value.replace(/[^0-9]/g, "").replace(/^0+(?=\d)/, ""))}
                onBlur={(event) => setKidQty(event.target.value === "" ? "" : String(Math.max(0, Math.trunc(Number(event.target.value) || 0))))}
                className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 outline-none ring-[var(--color-secondary)]/20 transition focus:ring-2"
              />
            </label>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setVisitDate(todayPlusLocalIsoDate(0))}
              className="inline-flex h-8 items-center rounded-full border border-[var(--color-border)] bg-white px-3 text-xs font-semibold text-[var(--color-text)]"
            >
              Same-day tour
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-sm)]">
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-xs font-bold text-white">2</span>
            <div>
              <h2 className="text-lg font-semibold text-[var(--color-text)]">Guest &amp; checkout</h2>
              <p className="text-xs text-[var(--color-muted)]">Guest info is optional — then create the booking.</p>
            </div>
          </div>

          <div className="grid gap-3">
            <label className="grid gap-1 text-sm text-[var(--color-text)]">
              Guest name (optional)
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

            <label className="grid gap-1 text-sm text-[var(--color-text)]">
              Phone (optional)
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

            <label className="grid gap-1 text-sm text-[var(--color-text)]">
              Notes (optional)
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={3}
                placeholder="Front desk notes"
                className="rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 outline-none ring-[var(--color-secondary)]/20 transition focus:ring-2"
              />
            </label>

            <div className="grid gap-1 text-sm text-[var(--color-text)]">
              <span>Promo code (optional)</span>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Tag className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted)]" />
                  <input
                    type="text"
                    value={promoCode}
                    onChange={(event) => setPromoCode(event.target.value.toUpperCase())}
                    placeholder="e.g. SUMMER20"
                    className="w-full rounded-xl border border-[var(--color-border)] bg-white py-2 pl-9 pr-3 text-sm font-semibold uppercase tracking-wide text-[var(--color-text)] outline-none ring-[var(--color-secondary)]/20 transition focus:ring-2"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void applyPromo()}
                  disabled={promoBusy || !promoCode.trim() || grossAmount <= 0}
                  className="shrink-0 rounded-xl border border-[var(--color-border)] bg-white px-4 text-sm font-semibold text-[var(--color-text)] transition hover:bg-[var(--color-background)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {promoBusy ? "Checking…" : "Apply"}
                </button>
              </div>
              {promo?.valid ? (
                <span className="text-xs font-semibold text-emerald-700">Promo applied — {toPeso(promo.discount_amount)} off.</span>
              ) : promoError ? (
                <span className="text-xs font-semibold text-rose-600">{promoError}</span>
              ) : (
                <span className="text-xs text-[var(--color-muted)]">Optional — validated on Apply; re-checked on the server when created.</span>
              )}
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-4">
            <p className="text-sm text-[var(--color-muted)]">{adults} adult{adults === 1 ? "" : "s"}{kids > 0 ? ` · ${kids} kid${kids === 1 ? "" : "s"}` : ""}</p>
            {discount > 0 ? (
              <>
                <div className="mt-2 flex items-baseline justify-between text-sm text-[var(--color-muted)]">
                  <span>Subtotal</span>
                  <span>{toPeso(grossAmount)}</span>
                </div>
                <div className="mt-1 flex items-baseline justify-between text-sm text-emerald-700">
                  <span>Promo discount</span>
                  <span>-{toPeso(discount)}</span>
                </div>
              </>
            ) : null}
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-sm text-[var(--color-muted)]">Total</span>
              <span className="text-xl font-bold text-[var(--color-text)]">{toPeso(totalAmount)}</span>
            </div>
            {totalAmount > 0 ? (
              <div className="mt-1 flex items-baseline justify-between text-xs text-[var(--color-muted)]">
                <span>Minimum to reserve now</span>
                <span className="font-semibold text-[var(--color-text)]">{toPeso(minPayNow)}</span>
              </div>
            ) : null}
          </div>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-[var(--color-muted)]">
              After create, proceed to <Link href="/admin/payments" className="font-semibold text-[var(--color-secondary)] underline">Payments</Link> for cashier recording.
            </p>
            <button
              type="button"
              onClick={() => void submitWalkInTour()}
              disabled={submitBusy}
              className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-[var(--color-cta)] px-5 text-sm font-semibold text-white shadow-sm transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:min-w-[220px]"
            >
              {submitBusy ? "Creating..." : "Create Walk-in Tour"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

