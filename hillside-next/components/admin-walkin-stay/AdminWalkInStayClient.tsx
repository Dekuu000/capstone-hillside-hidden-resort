"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertCircle, BedDouble, CheckCircle2, Loader2, Phone, User, Wallet } from "lucide-react";
import type { AvailableUnitsResponse, ReservationCreateResponse, ReservationListItem } from "../../../packages/shared/src/types";
import { availableUnitsResponseSchema, reservationCreateResponseSchema, reservationListItemSchema } from "../../../packages/shared/src/schemas";
import { apiFetch } from "../../lib/apiClient";
import { syncAwareMutation } from "../../lib/offlineSync/mutation";
import { FancyDatePicker } from "../shared/FancyDatePicker";
import { useToast } from "../shared/ToastProvider";

type AdminWalkInStayClientProps = {
  initialToken?: string | null;
  embedded?: boolean;
};

function getTodayIso() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getTomorrowIso() {
  const now = new Date();
  now.setDate(now.getDate() + 1);
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toPeso(value: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(value || 0);
}

export function AdminWalkInStayClient({ initialToken = null, embedded = false }: AdminWalkInStayClientProps) {
  const { showToast } = useToast();
  const token = initialToken;

  const [checkInDate, setCheckInDate] = useState(getTodayIso());
  const [checkOutDate, setCheckOutDate] = useState(getTomorrowIso());
  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [expectedPayNow, setExpectedPayNow] = useState<string>("");

  const [unitsLoading, setUnitsLoading] = useState(false);
  const [unitsError, setUnitsError] = useState<string | null>(null);
  const [availableUnits, setAvailableUnits] = useState<AvailableUnitsResponse["items"]>([]);
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);

  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [queuedOperationId, setQueuedOperationId] = useState<string | null>(null);
  const [created, setCreated] = useState<ReservationCreateResponse | null>(null);
  const [createdReservation, setCreatedReservation] = useState<ReservationListItem | null>(null);
  const [createdReservationLoading, setCreatedReservationLoading] = useState(false);
  const [createdReservationError, setCreatedReservationError] = useState<string | null>(null);
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
        setUnitsError(unknownError instanceof Error ? unknownError.message : "Failed to load available units.");
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

  const estimatedTotal = useMemo(
    () => selectedUnits.reduce((sum, unit) => sum + Number(unit.base_price || 0) * nights, 0),
    [nights, selectedUnits],
  );

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
        guest_name: guestName.trim() || null,
        guest_phone: guestPhone.trim() || null,
        notes: notes.trim() || null,
        expected_pay_now: expected,
        reservation_source: "walk_in" as const,
      };
      const summarySnapshot = {
        checkInDate,
        checkOutDate,
        unitNames: selectedUnits.map((unit) => unit.name),
        sameDay: checkInDate === getTodayIso(),
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
        setCreatedReservation(null);
        setCreatedReservationError(null);
        setGuestName("");
        setGuestPhone("");
        setNotes("");
        setExpectedPayNow("");
        showToast({
          type: "info",
          title: "Walk-in stay saved offline",
          message: "Queued in Sync Center and will auto-sync when connection is back.",
        });
        return;
      }

      setCreated(response.data);
      setCreatedSummary(summarySnapshot);
      setCreatedReservation(null);
      setCreatedReservationError(null);
      setGuestName("");
      setGuestPhone("");
      setNotes("");
      setExpectedPayNow("");
      showToast({
        type: "success",
        title: `Walk-in stay ${response.data.reservation_code} created`,
        message: "Choose the next front-desk action below.",
      });
    } catch (unknownError) {
      setSubmitError(unknownError instanceof Error ? unknownError.message : "Failed to create walk-in stay.");
    } finally {
      setSubmitBusy(false);
    }
  }

  useEffect(() => {
    if (!token || !created?.reservation_id) return;
    let cancelled = false;
    const loadCreatedReservation = async () => {
      setCreatedReservationLoading(true);
      setCreatedReservationError(null);
      try {
        const reservation = await apiFetch<ReservationListItem>(
          `/v2/reservations/${encodeURIComponent(created.reservation_id)}`,
          { method: "GET" },
          token,
          reservationListItemSchema,
        );
        if (!cancelled) {
          setCreatedReservation(reservation);
        }
      } catch (unknownError) {
        if (!cancelled) {
          setCreatedReservationError(
            unknownError instanceof Error ? unknownError.message : "Failed to load latest reservation status.",
          );
        }
      } finally {
        if (!cancelled) setCreatedReservationLoading(false);
      }
    };
    void loadCreatedReservation();
    return () => {
      cancelled = true;
    };
  }, [created?.reservation_id, token]);

  const createdBalance = Number(
    createdReservation?.balance_due
    ?? Math.max(0, (createdReservation?.total_amount ?? createdSummary?.estimatedTotal ?? 0) - Number(createdReservation?.amount_paid_verified ?? 0)),
  );
  const createdTotal = Number(createdReservation?.total_amount ?? createdSummary?.estimatedTotal ?? 0);
  const createdPaid = Number(createdReservation?.amount_paid_verified ?? Math.max(0, createdTotal - createdBalance));
  const createdPaymentState: "unpaid" | "partial" | "paid" = createdBalance <= 0 && createdTotal > 0
    ? "paid"
    : createdPaid > 0
      ? "partial"
      : "unpaid";
  const createdCheckInDate = createdSummary?.checkInDate ?? createdReservation?.check_in_date ?? "";
  const isSameDayStay = Boolean(createdSummary?.sameDay || (createdCheckInDate && createdCheckInDate === getTodayIso()));
  const canCheckInNow = createdPaymentState === "paid"
    && createdCheckInDate === getTodayIso()
    && !["checked_in", "checked_out", "cancelled", "no_show"].includes(String(createdReservation?.status || ""));

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
    <section className={`mx-auto w-full ${embedded ? "max-w-none" : "max-w-6xl"}`}>
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

          <div className="mt-3 grid gap-2 rounded-lg border border-emerald-200/80 bg-white p-3 text-xs text-slate-700 sm:grid-cols-2 lg:grid-cols-5">
            <div>
              <p className="font-semibold text-slate-500">Reservation code</p>
              <p className="mt-0.5 text-sm font-semibold text-slate-900">{created.reservation_code}</p>
            </div>
            <div>
              <p className="font-semibold text-slate-500">Selected unit</p>
              <p className="mt-0.5 text-sm font-semibold text-slate-900">
                {createdSummary?.unitNames?.length ? createdSummary.unitNames.join(", ") : "-"}
              </p>
            </div>
            <div>
              <p className="font-semibold text-slate-500">Stay dates</p>
              <p className="mt-0.5 text-sm font-semibold text-slate-900">
                {createdSummary?.checkInDate || "-"} to {createdSummary?.checkOutDate || "-"}
              </p>
            </div>
            <div>
              <p className="font-semibold text-slate-500">Payment status</p>
              <p className="mt-0.5 text-sm font-semibold text-slate-900 capitalize">{createdPaymentState}</p>
            </div>
            <div>
              <p className="font-semibold text-slate-500">Amount due</p>
              <p className="mt-0.5 text-sm font-semibold text-slate-900">{toPeso(Math.max(0, createdBalance))}</p>
            </div>
          </div>

          {createdReservationLoading ? (
            <p className="mt-2 text-xs text-emerald-800">Refreshing reservation totals...</p>
          ) : null}
          {createdReservationError ? (
            <p className="mt-2 text-xs text-amber-700">{createdReservationError}</p>
          ) : null}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {canCheckInNow ? (
              <Link
                href={`/admin/check-in?mode=code&reservation_code=${encodeURIComponent(created.reservation_code)}`}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-900 bg-slate-900 px-3 text-xs font-semibold text-white"
              >
                Check In Now
              </Link>
            ) : (
              <Link
                href={`/admin/payments?source=walkin&walkin_type=stay&reservation_id=${encodeURIComponent(created.reservation_id)}&amount=${encodeURIComponent(
                  String(Math.max(1, Math.round(createdBalance || createdTotal || createdSummary?.estimatedTotal || 0))),
                )}&method=cash`}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-900 bg-slate-900 px-3 text-xs font-semibold text-white"
              >
                Record Payment
              </Link>
            )}

            <button
              type="button"
              onClick={() => {
                setCreated(null);
                setCreatedReservation(null);
                setCreatedReservationError(null);
                setCreatedSummary(null);
              }}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700"
            >
              Create Another Walk-in
            </button>
            <Link
              href={`/admin/reservations?reservation_id=${encodeURIComponent(created.reservation_id)}`}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700"
            >
              View in Reservations
            </Link>

            {!canCheckInNow ? (
              <Link
                href={`/admin/check-in?mode=code&reservation_code=${encodeURIComponent(created.reservation_code)}`}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-slate-100 px-3 text-xs font-semibold text-slate-500"
                aria-disabled
                tabIndex={-1}
              >
                Check In Now
              </Link>
            ) : null}
          </div>
          {!canCheckInNow ? (
            <p className="mt-2 text-xs text-slate-600">
              Check-in becomes primary after payment is fully settled and arrival date is today.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1.2fr_1fr]">
        <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-[var(--shadow-sm)]">
          <div className="mb-4 flex items-center gap-2">
            <BedDouble className="h-4 w-4 text-[var(--color-secondary)]" />
            <h2 className="text-lg font-semibold text-[var(--color-text)]">Available Units</h2>
          </div>

          <div className="mb-4 grid gap-3 sm:grid-cols-2">
            <FancyDatePicker label="Check-in" value={checkInDate} onChange={setCheckInDate} min={getTodayIso()} />
            <FancyDatePicker
              label="Check-out"
              value={checkOutDate}
              onChange={setCheckOutDate}
              min={checkInDate || getTodayIso()}
            />
          </div>
          <div className="mb-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setCheckInDate(getTodayIso());
                setCheckOutDate(getTomorrowIso());
              }}
              className="inline-flex h-8 items-center rounded-full border border-[var(--color-border)] bg-white px-3 text-xs font-semibold text-[var(--color-text)]"
            >
              Same-day stay
            </button>
          </div>

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
                return (
                  <label
                    key={unit.unit_id}
                    className={`flex cursor-pointer items-start justify-between gap-3 rounded-xl border p-3 transition ${
                      checked
                        ? "border-[var(--color-secondary)] bg-teal-50"
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
                        <span className="block text-sm font-semibold text-[var(--color-text)]">{unit.name}</span>
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
          <h2 className="mb-4 text-lg font-semibold text-[var(--color-text)]">Walk-in Details</h2>

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

          <div className="mt-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-4 text-sm">
            <p className="text-[var(--color-muted)]">Nights: <span className="font-semibold text-[var(--color-text)]">{nights}</span></p>
            <p className="text-[var(--color-muted)]">Selected units: <span className="font-semibold text-[var(--color-text)]">{selectedUnitIds.length}</span></p>
            <p className="mt-1 text-[var(--color-muted)]">
              Estimated total: <span className="text-base font-bold text-[var(--color-text)]">{toPeso(estimatedTotal)}</span>
            </p>
          </div>

          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={submitBusy || !selectedUnitIds.length || nights <= 0}
            className="mt-5 w-full rounded-xl bg-[var(--color-cta)] px-4 py-3 text-sm font-semibold text-white transition hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitBusy ? "Creating walk-in stay..." : "Create Walk-in Stay"}
          </button>

          <p className="mt-2 text-xs text-[var(--color-muted)]">
            On successful creation, proceed to <Link href="/admin/payments" className="font-semibold text-[var(--color-secondary)] underline">Payments</Link> to record or verify payment.
          </p>
        </div>
      </div>
    </section>
  );
}
