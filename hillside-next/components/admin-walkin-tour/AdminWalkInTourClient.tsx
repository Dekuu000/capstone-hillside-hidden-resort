"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, CalendarCheck, CheckCircle2, Loader2, Phone, Tag, User } from "lucide-react";
import type {
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
import { formatTime12 } from "../../lib/catalog";
import { formatDateWithYear } from "../../lib/dateDisplay";
import { WalkInPaymentPanel, type WalkInPaymentResult } from "../admin-walkin/WalkInPaymentPanel";
import { Select } from "../shared/Select";
import { useToast } from "../shared/ToastProvider";

type AdminWalkInTourClientProps = {
  initialToken?: string | null;
  initialServicesData?: ServiceListResponse | null;
  embedded?: boolean;
};

export function AdminWalkInTourClient({
  initialToken = null,
  initialServicesData = null,
  embedded = false,
}: AdminWalkInTourClientProps) {
  const { showToast } = useToast();
  const token = initialToken;

  const [services, setServices] = useState<ServiceItem[]>(initialServicesData?.items ?? []);
  const [servicesLoading, setServicesLoading] = useState(false);
  const [servicesError, setServicesError] = useState<string | null>(null);

  const [serviceId, setServiceId] = useState("");
  // Walk-ins are same-day by definition — the visit date is locked to today
  // (guests use the online flow for advance tours), so it never changes.
  const [visitDate] = useState(todayPlusLocalIsoDate(0));
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
  const [created, setCreated] = useState<ReservationCreateResponse | null>(null);
  // Live payment progress for the just-created tour, seeded from the create
  // response's totals (no second fetch) and updated by the inline payment panel.
  const [payState, setPayState] = useState<{ balance: number; paid: number; status: string } | null>(null);
  const [createdSummary, setCreatedSummary] = useState<{
    tourName: string;
    visitDate: string;
    partySize: number;
    estimatedTotal: number;
  } | null>(null);

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
    setCreated(null);

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
        setCreated(null);
        setPayState(null);
        setGuestName("");
        setGuestPhone("");
        setNotes("");
        showToast({
          type: "info",
          title: "Walk-in tour saved offline",
          message: "Queued in Sync Center and will sync when connection is back.",
        });
        return;
      }
      const createdData = created.data;
      setCreated(createdData);
      setCreatedSummary({
        tourName: selectedService?.service_name ?? "Tour",
        visitDate,
        partySize: adults + kids,
        estimatedTotal: totalAmount,
      });
      // Seed live payment progress straight from the authoritative create response
      // (no second fetch) so the inline Take-payment panel prefills instantly.
      setPayState({
        balance: Math.max(0, Number(createdData.balance_due ?? createdData.total_amount ?? totalAmount)),
        paid: 0,
        status: String(createdData.status || "pending_payment"),
      });
      setGuestName("");
      setGuestPhone("");
      setNotes("");
      setPromoCode("");
      showToast({
        type: "success",
        title: `Walk-in tour ${createdData.reservation_code} created`,
        message: "Take payment below, then check the guest in.",
      });
    } catch (unknownError) {
      setSubmitError(getApiErrorMessage(unknownError, "Failed to create walk-in tour."));
    } finally {
      setSubmitBusy(false);
    }
  }

  const handlePaymentRecorded = (result: WalkInPaymentResult) => {
    setPayState((prev) => {
      const base = prev ?? { balance: 0, paid: 0, status: String(created?.status || "pending_payment") };
      return {
        balance: Math.max(0, base.balance - result.amount),
        paid: base.paid + result.amount,
        status: result.reservationStatus || base.status,
      };
    });
    showToast({
      type: "success",
      title: "Payment recorded",
      message: `${toPeso(result.amount)} recorded for ${created?.reservation_code ?? "this booking"}.`,
    });
  };

  const createdTotal = Number(created?.total_amount ?? createdSummary?.estimatedTotal ?? 0);
  const createdBalance = Math.max(0, Number(payState?.balance ?? createdTotal));
  const createdPaid = Number(payState?.paid ?? 0);
  const createdPaymentState: "unpaid" | "partial" | "paid" = createdBalance <= 0 && createdTotal > 0
    ? "paid"
    : createdPaid > 0
      ? "partial"
      : "unpaid";
  const liveStatus = String(payState?.status || created?.status || "");
  const canCheckInNow = createdPaymentState === "paid"
    && !["checked_in", "checked_out", "cancelled", "no_show"].includes(liveStatus);

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
            Create a same-day tour reservation, take payment, then check the guest in.
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
      {created ? (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-start gap-2 text-emerald-800">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="w-full">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold">Walk-in tour created: {created.reservation_code}</p>
                <span className="inline-flex rounded-full border border-emerald-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                  Same-day
                </span>
              </div>
              <p className="text-xs text-emerald-700">Take payment below, then check the guest in.</p>
            </div>
          </div>

          <div className="mt-3 grid gap-2 rounded-lg border border-emerald-200/80 bg-white p-3 text-xs text-[var(--color-text)] sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <p className="font-semibold text-[var(--color-muted)]">Reservation code</p>
              <p className="mt-0.5 text-sm font-semibold text-[var(--color-text)]">{created.reservation_code}</p>
            </div>
            <div>
              <p className="font-semibold text-[var(--color-muted)]">Tour</p>
              <p className="mt-0.5 text-sm font-semibold text-[var(--color-text)]">{createdSummary?.tourName || "-"}</p>
            </div>
            <div>
              <p className="font-semibold text-[var(--color-muted)]">Visit date</p>
              <p className="mt-0.5 text-sm font-semibold text-[var(--color-text)]">
                {createdSummary?.visitDate ? formatDateWithYear(createdSummary.visitDate) : "-"}
              </p>
            </div>
            <div>
              <p className="font-semibold text-[var(--color-muted)]">Payment status</p>
              <p className="mt-0.5 text-sm font-semibold text-[var(--color-text)] capitalize">{createdPaymentState}</p>
            </div>
            <div>
              <p className="font-semibold text-[var(--color-muted)]">Amount due</p>
              <p className="mt-0.5 text-sm font-semibold text-[var(--color-text)]">{toPeso(Math.max(0, createdBalance))}</p>
            </div>
          </div>

          {createdBalance > 0 ? (
            <WalkInPaymentPanel
              key={createdPaid}
              token={token}
              reservationId={created.reservation_id}
              reservationCode={created.reservation_code}
              balanceDue={createdBalance}
              walkInType="tour"
              onRecorded={handlePaymentRecorded}
            />
          ) : (
            <p className="mt-3 flex items-center gap-2 rounded-xl border border-emerald-200 bg-white px-3 py-2 text-xs font-semibold text-emerald-800">
              <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
              Paid in full — ready to check in.
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Link
              href={`/admin/check-in?mode=code&reservation_code=${encodeURIComponent(created.reservation_code)}`}
              aria-disabled={!canCheckInNow}
              tabIndex={canCheckInNow ? undefined : -1}
              className={
                canCheckInNow
                  ? "inline-flex h-9 items-center justify-center rounded-lg border border-[var(--color-primary)] bg-[var(--color-primary)] px-3 text-xs font-semibold text-white transition hover:brightness-110"
                  : "inline-flex h-9 items-center justify-center rounded-lg border border-[var(--color-border)] bg-[var(--color-background)] px-3 text-xs font-semibold text-[var(--color-muted)]"
              }
            >
              Check In Now
            </Link>
            <button
              type="button"
              onClick={() => {
                setCreated(null);
                setPayState(null);
                setCreatedSummary(null);
              }}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-[var(--color-border)] bg-white px-3 text-xs font-semibold text-[var(--color-text)]"
            >
              Create Another Walk-in
            </button>
            <Link
              href={`/admin/reservations?reservation_id=${encodeURIComponent(created.reservation_id)}`}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-[var(--color-border)] bg-white px-3 text-xs font-semibold text-[var(--color-text)]"
            >
              View in Reservations
            </Link>
          </div>
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
                  label: `${service.service_name} (${formatTime12(service.start_time) || "--"} – ${formatTime12(service.end_time) || "--"})`,
                }))}
              />
              {servicesLoading ? <span className="inline-flex items-center gap-1 text-xs text-[var(--color-muted)]"><Loader2 className="h-3 w-3 animate-spin" /> Loading active tours...</span> : null}
              {servicesError ? <span className="text-xs text-red-600">{servicesError}</span> : null}
            </label>

            <div className="grid gap-1 text-sm text-[var(--color-text)] sm:col-span-2">
              <span>Visit date</span>
              <div className="flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2">
                <CalendarCheck className="h-4 w-4 shrink-0 text-[var(--color-secondary)]" aria-hidden="true" />
                <span className="font-semibold">Today · {formatDateWithYear(visitDate)}</span>
                <span className="ml-auto rounded-full bg-[color:color-mix(in_srgb,var(--color-secondary)_12%,white)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-secondary)]">
                  Same-day walk-in
                </span>
              </div>
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
              After create, take payment right here — or open <Link href="/admin/payments" className="font-semibold text-[var(--color-secondary)] underline">Payments</Link> for split or corrected settlements.
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

