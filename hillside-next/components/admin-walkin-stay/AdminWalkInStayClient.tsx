"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, CalendarCheck, CheckCircle2, Loader2, Phone, Tag, User, Users, Wallet } from "lucide-react";
import type { AvailableUnitsResponse, PromoValidationResult, ReservationCreateResponse } from "../../../packages/shared/src/types";
import { availableUnitsResponseSchema, promoValidationResultSchema, reservationCreateResponseSchema } from "../../../packages/shared/src/schemas";
import { apiFetch } from "../../lib/apiClient";
import { getApiErrorMessage } from "../../lib/apiError";
import { todayPlusLocalIsoDate } from "../../lib/dateIso";
import { formatPhpPeso as toPeso } from "../../lib/formatCurrency";
import { getUnitNightlyRate } from "../../lib/booking/pricing";
import { syncAwareMutation } from "../../lib/offlineSync/mutation";
import { getUnitLabel } from "../../lib/unitLabel";
import { formatDateWithYear } from "../../lib/dateDisplay";
import { FancyDatePicker } from "../shared/FancyDatePicker";
import { WalkInPaymentPanel, type WalkInPaymentResult } from "../admin-walkin/WalkInPaymentPanel";
import { useToast } from "../shared/ToastProvider";

type AdminWalkInStayClientProps = {
  initialToken?: string | null;
  embedded?: boolean;
};

export function AdminWalkInStayClient({ initialToken = null, embedded = false }: AdminWalkInStayClientProps) {
  const { showToast } = useToast();
  const token = initialToken;

  // Walk-ins are same-day by definition — check-in is locked to today (guests use
  // the online flow for advance stays), so it never changes; only check-out is picked.
  const [checkInDate] = useState(todayPlusLocalIsoDate(0));
  const [checkOutDate, setCheckOutDate] = useState(todayPlusLocalIsoDate(1));
  // Party size — drives pax-based pricing for event spaces (Evergreen/Pinecrest)
  // exactly like the online guest flow. Held as a string so the field is clearable.
  const [guests, setGuests] = useState("2");
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [expectedPayNow, setExpectedPayNow] = useState<string>("");
  const [promoCode, setPromoCode] = useState("");
  const [promo, setPromo] = useState<PromoValidationResult | null>(null);
  const [promoBusy, setPromoBusy] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);

  const [unitsLoading, setUnitsLoading] = useState(false);
  const [unitsError, setUnitsError] = useState<string | null>(null);
  const [availableUnits, setAvailableUnits] = useState<AvailableUnitsResponse["items"]>([]);
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);

  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [queuedOperationId, setQueuedOperationId] = useState<string | null>(null);
  const [created, setCreated] = useState<ReservationCreateResponse | null>(null);
  // Live payment progress for the just-created booking, seeded from the create
  // response's totals (no second fetch) and updated by the inline Take-payment panel.
  const [payState, setPayState] = useState<{ balance: number; paid: number; status: string } | null>(null);
  const [createdSummary, setCreatedSummary] = useState<{
    checkInDate: string;
    checkOutDate: string;
    unitNames: string[];
    sameDay: boolean;
    estimatedTotal: number;
  } | null>(null);

  useEffect(() => {
    if (!token) return;
    if (!checkInDate || !checkOutDate || checkOutDate <= checkInDate) {
      setAvailableUnits([]);
      setSelectedUnitIds([]);
      return;
    }

    let cancelled = false;
    const load = async () => {
      setUnitsLoading(true);
      setUnitsError(null);
      try {
        const data = await apiFetch<AvailableUnitsResponse>(
          `/v2/catalog/units/available?check_in_date=${encodeURIComponent(checkInDate)}&check_out_date=${encodeURIComponent(checkOutDate)}`,
          { method: "GET" },
          token,
          availableUnitsResponseSchema,
        );
        if (cancelled) return;
        setAvailableUnits(data.items ?? []);
        setSelectedUnitIds((prev) => prev.filter((unitId) => data.items.some((item) => item.unit_id === unitId)));
      } catch (unknownError) {
        if (cancelled) return;
        setAvailableUnits([]);
        setSelectedUnitIds([]);
        setUnitsError(getApiErrorMessage(unknownError, "Failed to load available units."));
      } finally {
        if (!cancelled) {
          setUnitsLoading(false);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [checkInDate, checkOutDate, token]);

  const nights = useMemo(() => {
    if (!checkInDate || !checkOutDate) return 0;
    const start = new Date(`${checkInDate}T00:00:00`);
    const end = new Date(`${checkOutDate}T00:00:00`);
    const diffMs = end.getTime() - start.getTime();
    if (Number.isNaN(diffMs) || diffMs <= 0) return 0;
    return Math.floor(diffMs / (24 * 60 * 60 * 1000));
  }, [checkInDate, checkOutDate]);

  const selectedUnits = useMemo(
    () => availableUnits.filter((unit) => selectedUnitIds.includes(unit.unit_id)),
    [availableUnits, selectedUnitIds],
  );

  const guestCount = useMemo(() => Math.max(1, Math.trunc(Number(guests) || 1)), [guests]);

  // Mirror the online guest estimate: pax-based nightly rate per unit (shared
  // pricing lib) so the cashier sees the same total the backend will charge.
  const grossTotal = useMemo(
    () => selectedUnits.reduce((sum, unit) => sum + getUnitNightlyRate(unit, guestCount) * nights, 0),
    [nights, selectedUnits, guestCount],
  );
  const discount = promo?.valid ? promo.discount_amount : 0;
  const estimatedTotal = Math.max(0, grossTotal - discount);

  // Keep the displayed promo in sync with the inputs:
  //  • a TYPED code must be explicitly Applied — clear any prior result while editing;
  //  • with NO code, preview the active auto-apply promo for the current total
  //    (mirrors the online guest flow) so the cashier sees the discounted total.
  useEffect(() => {
    setPromoError(null);
    if (promoCode.trim()) {
      setPromo(null);
      return;
    }
    if (!token || grossTotal <= 0) {
      setPromo(null);
      return;
    }
    let active = true;
    void (async () => {
      try {
        const auto = await apiFetch(
          "/v2/promos/validate",
          { method: "POST", body: JSON.stringify({ code: "", total: grossTotal, kind: "stays" }) },
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
  }, [promoCode, grossTotal, token]);

  const applyPromo = async () => {
    const code = promoCode.trim();
    if (!code || !token) return;
    setPromoBusy(true);
    setPromoError(null);
    try {
      const result = await apiFetch(
        "/v2/promos/validate",
        { method: "POST", body: JSON.stringify({ code, total: grossTotal, kind: "stays" }) },
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

  function toggleUnit(unitId: string) {
    setSelectedUnitIds((prev) => {
      if (prev.includes(unitId)) return prev.filter((id) => id !== unitId);
      return [...prev, unitId];
    });
  }

  async function handleCreate() {
    if (!token) return;
    setSubmitError(null);
    setQueuedOperationId(null);
    setCreated(null);

    if (checkOutDate <= checkInDate) {
      setSubmitError("Check-out must be after check-in.");
      return;
    }
    if (!selectedUnitIds.length) {
      setSubmitError("Select at least one unit.");
      return;
    }

    const expected = expectedPayNow.trim() ? Number(expectedPayNow) : null;
    if (expectedPayNow.trim() && (!Number.isFinite(expected) || Number(expected) < 0)) {
      setSubmitError("Expected pay now must be zero or greater.");
      return;
    }

    setSubmitBusy(true);
    try {
      const payload = {
        check_in_date: checkInDate,
        check_out_date: checkOutDate,
        unit_ids: selectedUnitIds,
        guest_count: guestCount,
        guest_name: guestName.trim() || null,
        guest_phone: guestPhone.trim() || null,
        notes: notes.trim() || null,
        expected_pay_now: expected,
        promo_code: promoCode.trim() || null,
        reservation_source: "walk_in" as const,
      };
      const summarySnapshot = {
        checkInDate,
        checkOutDate,
        unitNames: selectedUnits.map((unit) => {
          const label = getUnitLabel(unit.name);
          return label.subtitle ? `${label.title} (${label.subtitle})` : label.title;
        }),
        sameDay: checkInDate === todayPlusLocalIsoDate(0),
        estimatedTotal,
      };
      const response = await syncAwareMutation<typeof payload, ReservationCreateResponse>(
        {
          path: "/v2/reservations/walk-in",
          method: "POST",
          payload,
          parser: reservationCreateResponseSchema,
          accessToken: token,
          entityType: "reservation",
          action: "reservations.walk_in.create",
        },
      );
      if (response.mode === "queued") {
        setCreated(null);
        setQueuedOperationId(response.operationId);
        setCreatedSummary(summarySnapshot);
        setPayState(null);
        setGuestName("");
        setGuestPhone("");
        setNotes("");
        setExpectedPayNow("");
        setPromoCode("");
        showToast({
          type: "info",
          title: "Walk-in stay saved offline",
          message: "Queued in Sync Center and will auto-sync when connection is back.",
        });
        return;
      }

      setCreated(response.data);
      setCreatedSummary(summarySnapshot);
      // Seed live payment progress straight from the authoritative create response
      // (no second fetch) so the inline Take-payment panel prefills instantly.
      setPayState({
        balance: Math.max(0, Number(response.data.balance_due ?? response.data.total_amount ?? summarySnapshot.estimatedTotal ?? 0)),
        paid: 0,
        status: String(response.data.status || "pending_payment"),
      });
      setGuestName("");
      setGuestPhone("");
      setNotes("");
      setExpectedPayNow("");
      setPromoCode("");
      showToast({
        type: "success",
        title: `Walk-in stay ${response.data.reservation_code} created`,
        message: "Take payment below, then check the guest in.",
      });
    } catch (unknownError) {
      setSubmitError(getApiErrorMessage(unknownError, "Failed to create walk-in stay."));
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
  const createdCheckInDate = createdSummary?.checkInDate ?? todayPlusLocalIsoDate(0);
  const isSameDayStay = Boolean(createdSummary?.sameDay || (createdCheckInDate && createdCheckInDate === todayPlusLocalIsoDate(0)));
  const liveStatus = String(payState?.status || created?.status || "");
  const canCheckInNow = createdPaymentState === "paid"
    && createdCheckInDate === todayPlusLocalIsoDate(0)
    && !["checked_in", "checked_out", "cancelled", "no_show"].includes(liveStatus);

  if (!token) {
    return (
      <section className="mx-auto w-full max-w-5xl">
        <h1 className="text-3xl font-bold text-[var(--color-text)]">Walk-in Stay</h1>
        <p className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          No active admin session found. Sign in first.
        </p>
      </section>
    );
  }

  return (
    <section className={`mx-auto w-full ${embedded ? "max-w-none" : "max-w-[1600px]"}`}>
      {!embedded ? (
        <header className="mb-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-sm)]">
          <h1 className="text-3xl font-bold text-[var(--color-text)]">Walk-in Stay</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Create on-site room or cottage reservations, then record payment in the Payments tab.
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
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900">
          <div className="flex items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="w-full">
              <p className="text-sm font-semibold">Walk-in stay saved offline</p>
              <p className="mt-0.5 text-xs text-amber-800">
                Operation {queuedOperationId.slice(0, 8)} is queued. Reconnect and open Sync Center to push it.
              </p>
              <p className="mt-1 text-xs text-amber-700">
                Payments and check-in actions will be available once this queued reservation is synced.
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {created ? (
        <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-start gap-2 text-emerald-800">
            <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="w-full">
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-sm font-semibold">Walk-in stay created: {created.reservation_code}</p>
                {isSameDayStay ? (
                  <span className="inline-flex rounded-full border border-emerald-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                    Same-day
                  </span>
                ) : null}
              </div>
              <p className="text-xs text-emerald-700">Next step is selected for front desk below.</p>
            </div>
          </div>

          <div className="mt-3 grid gap-2 rounded-lg border border-emerald-200/80 bg-white p-3 text-xs text-[var(--color-text)] sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <p className="font-semibold text-[var(--color-muted)]">Reservation code</p>
              <p className="mt-0.5 text-sm font-semibold text-[var(--color-text)]">{created.reservation_code}</p>
            </div>
            <div>
              <p className="font-semibold text-[var(--color-muted)]">Selected unit</p>
              <p className="mt-0.5 text-sm font-semibold text-[var(--color-text)]">
                {createdSummary?.unitNames?.length ? createdSummary.unitNames.join(", ") : "-"}
              </p>
            </div>
            <div>
              <p className="font-semibold text-[var(--color-muted)]">Stay dates</p>
              <p className="mt-0.5 text-sm font-semibold text-[var(--color-text)]">
                {createdSummary?.checkInDate || "-"} to {createdSummary?.checkOutDate || "-"}
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
              walkInType="stay"
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
          {!canCheckInNow ? (
            <p className="mt-2 text-xs text-[var(--color-muted)]">
              {createdBalance > 0
                ? "Take the payment above — Check-in unlocks once the balance is settled (same-day arrival)."
                : "Check-in becomes primary after payment is fully settled and arrival date is today."}
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-sm)]">
          <div className="mb-4 flex items-center gap-3">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary)] text-xs font-bold text-white">1</span>
            <div>
              <h2 className="text-lg font-semibold text-[var(--color-text)]">Dates &amp; room</h2>
              <p className="text-xs text-[var(--color-muted)]">Check-in is today — pick the check-out date, then choose a room.</p>
            </div>
          </div>

          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <div className="grid gap-1 text-sm text-[var(--color-text)]">
              <span>Check-in</span>
              <div className="flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2">
                <CalendarCheck className="h-4 w-4 shrink-0 text-[var(--color-secondary)]" aria-hidden="true" />
                <span className="font-semibold">Today · {formatDateWithYear(checkInDate)}</span>
                <span className="ml-auto rounded-full bg-[color:color-mix(in_srgb,var(--color-secondary)_12%,white)] px-2 py-0.5 text-[11px] font-semibold text-[var(--color-secondary)]">
                  Same-day walk-in
                </span>
              </div>
            </div>
            <FancyDatePicker
              label="Check-out"
              value={checkOutDate}
              onChange={setCheckOutDate}
              min={checkInDate || todayPlusLocalIsoDate(0)}
            />
          </div>

          <label className="mb-4 grid gap-1 text-sm text-[var(--color-text)]">
            Guests
            <div className="relative">
              <Users className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted)]" />
              <input
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={guests}
                onFocus={(event) => event.target.select()}
                onChange={(event) => setGuests(event.target.value.replace(/[^0-9]/g, "").replace(/^0+(?=\d)/, ""))}
                onBlur={(event) => setGuests(event.target.value === "" ? "1" : String(Math.max(1, Math.trunc(Number(event.target.value) || 1))))}
                className="w-full rounded-xl border border-[var(--color-border)] bg-white py-2 pl-9 pr-3 text-sm text-[var(--color-text)] outline-none ring-[var(--color-secondary)]/20 transition focus:ring-2"
              />
            </div>
            <span className="text-xs text-[var(--color-muted)]">Prices event spaces (Evergreen, Pinecrest) by headcount — same as online booking.</span>
          </label>

          {unitsLoading ? (
            <div className="flex items-center gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-4 text-sm text-[var(--color-muted)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading available units...
            </div>
          ) : null}

          {!unitsLoading && unitsError ? (
            <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{unitsError}</p>
          ) : null}

          {!unitsLoading && !unitsError && !availableUnits.length ? (
            <p className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-4 text-sm text-[var(--color-muted)]">
              No active units available for selected dates.
            </p>
          ) : null}

          {!unitsLoading && !unitsError && availableUnits.length ? (
            <div className="space-y-2">
              {availableUnits.map((unit) => {
                const checked = selectedUnitIds.includes(unit.unit_id);
                const label = getUnitLabel(unit.name);
                return (
                  <label
                    key={unit.unit_id}
                    className={`flex cursor-pointer items-start justify-between gap-3 rounded-xl border p-3 transition ${
                      checked
                        ? "border-[var(--color-secondary)] bg-[color:color-mix(in_srgb,var(--color-secondary)_12%,white)]"
                        : "border-[var(--color-border)] bg-white hover:border-[var(--color-secondary)]/45"
                    }`}
                  >
                    <span className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleUnit(unit.unit_id)}
                        className="mt-0.5 h-4 w-4 rounded border-[var(--color-border)] text-[var(--color-secondary)] focus:ring-[var(--color-secondary)]"
                      />
                      <span>
                        <span className="block text-sm font-semibold text-[var(--color-text)]">
                          {label.title}
                          {label.subtitle ? <span className="ml-1 font-medium text-[var(--color-muted)]">({label.subtitle})</span> : null}
                        </span>
                        <span className="block text-xs text-[var(--color-muted)]">
                          {unit.type} • Capacity {unit.capacity}
                        </span>
                      </span>
                    </span>
                    <span className="text-sm font-semibold text-[var(--color-text)]">{toPeso(Number(unit.base_price || 0))}/night</span>
                  </label>
                );
              })}
            </div>
          ) : null}
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
                  className="w-full rounded-xl border border-[var(--color-border)] bg-white py-2 pl-9 pr-3 text-sm text-[var(--color-text)] outline-none ring-[var(--color-secondary)]/20 transition focus:ring-2"
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
                  className="w-full rounded-xl border border-[var(--color-border)] bg-white py-2 pl-9 pr-3 text-sm text-[var(--color-text)] outline-none ring-[var(--color-secondary)]/20 transition focus:ring-2"
                />
              </div>
            </label>

            <label className="grid gap-1 text-sm text-[var(--color-text)]">
              Expected pay now (optional)
              <div className="relative">
                <Wallet className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted)]" />
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={expectedPayNow}
                  onChange={(event) => setExpectedPayNow(event.target.value)}
                  placeholder="Leave empty to use default deposit rules"
                  className="w-full rounded-xl border border-[var(--color-border)] bg-white py-2 pl-9 pr-3 text-sm text-[var(--color-text)] outline-none ring-[var(--color-secondary)]/20 transition focus:ring-2"
                />
              </div>
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
                  disabled={promoBusy || !promoCode.trim() || grossTotal <= 0}
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

            <label className="grid gap-1 text-sm text-[var(--color-text)]">
              Notes (optional)
              <textarea
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                rows={3}
                placeholder="Front desk notes"
                className="w-full rounded-xl border border-[var(--color-border)] bg-white px-3 py-2 text-sm text-[var(--color-text)] outline-none ring-[var(--color-secondary)]/20 transition focus:ring-2"
              />
            </label>
          </div>

          <div className="mt-4 rounded-2xl border border-[var(--color-border)] bg-[var(--color-background)] p-4">
            <p className="text-sm text-[var(--color-muted)]">
              {nights} night{nights === 1 ? "" : "s"} · {selectedUnitIds.length} room{selectedUnitIds.length === 1 ? "" : "s"} · {guestCount} guest{guestCount === 1 ? "" : "s"}
            </p>
            {discount > 0 ? (
              <>
                <div className="mt-2 flex items-baseline justify-between text-sm text-[var(--color-muted)]">
                  <span>Subtotal</span>
                  <span>{toPeso(grossTotal)}</span>
                </div>
                <div className="mt-1 flex items-baseline justify-between text-sm text-emerald-700">
                  <span>Promo discount</span>
                  <span>-{toPeso(discount)}</span>
                </div>
              </>
            ) : null}
            <div className="mt-1 flex items-baseline justify-between">
              <span className="text-sm text-[var(--color-muted)]">Estimated total</span>
              <span className="text-xl font-bold text-[var(--color-text)]">{toPeso(estimatedTotal)}</span>
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-[var(--color-muted)]">
              On successful creation, proceed to <Link href="/admin/payments" className="font-semibold text-[var(--color-secondary)] underline">Payments</Link> to record or verify payment.
            </p>
            <button
              type="button"
              onClick={() => void handleCreate()}
              disabled={submitBusy || !selectedUnitIds.length || nights <= 0}
              className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-[var(--color-cta)] px-5 text-sm font-semibold text-white shadow-sm transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:min-w-[220px]"
            >
              {submitBusy ? "Creating..." : "Create Walk-in Stay"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

