"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { PricingRecommendation, ReservationCreateResponse } from "../../../packages/shared/src/types";
import { reservationCreateResponseSchema } from "../../../packages/shared/src/schemas";
import { apiFetch } from "../../lib/apiClient";
import { getSupabaseBrowserClient } from "../../lib/supabase";

type AvailableUnit = {
  unit_id: string;
  name: string;
  type: string;
  description?: string | null;
  base_price: number;
  capacity: number;
  image_url?: string | null;
  image_urls?: string[] | null;
  amenities?: string[] | null;
};

type AvailableUnitsResponse = {
  items: AvailableUnit[];
  count: number;
  check_in_date: string;
  check_out_date: string;
};

type BookNowClientProps = {
  initialToken?: string | null;
  initialSessionEmail?: string | null;
  initialCheckInDate?: string;
  initialCheckOutDate?: string;
  initialUnitsData?: AvailableUnitsResponse | null;
};

function localIsoDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toPeso(value: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(value);
}

function getAiSource(recommendation: PricingRecommendation | null) {
  if (!recommendation) return null;
  const explains = recommendation.explanations.map((item) => item.toLowerCase());
  return explains.some((item) => item.includes("fallback"))
    ? "fallback"
    : "live";
}

export function BookNowClient({
  initialToken = null,
  initialSessionEmail = null,
  initialCheckInDate,
  initialCheckOutDate,
  initialUnitsData = null,
}: BookNowClientProps) {
  const router = useRouter();
  const tomorrow = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return localIsoDate(d);
  }, []);
  const defaultCheckout = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return localIsoDate(d);
  }, []);

  const [token, setToken] = useState<string | null>(initialToken);
  const [sessionLoading, setSessionLoading] = useState(!initialToken);
  const [sessionEmail, setSessionEmail] = useState<string | null>(initialSessionEmail);

  const [checkInDate, setCheckInDate] = useState(initialCheckInDate || tomorrow);
  const [checkOutDate, setCheckOutDate] = useState(initialCheckOutDate || defaultCheckout);

  const [units, setUnits] = useState<AvailableUnit[]>(initialUnitsData?.items ?? []);
  const [unitsLoading, setUnitsLoading] = useState(false);
  const [unitsError, setUnitsError] = useState<string | null>(null);
  const [selectedUnitIds, setSelectedUnitIds] = useState<string[]>([]);

  const [submitBusy, setSubmitBusy] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [latestAiRecommendation, setLatestAiRecommendation] = useState<PricingRecommendation | null>(null);

  const initialQueryKey = `${initialCheckInDate || tomorrow}|${initialCheckOutDate || defaultCheckout}`;
  const [skipInitialFetch, setSkipInitialFetch] = useState(
    Boolean(initialUnitsData && initialToken),
  );

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
    if (skipInitialFetch && `${checkInDate}|${checkOutDate}` === initialQueryKey) {
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
        const data = await apiFetch<AvailableUnitsResponse>(`/v2/catalog/units/available?${qs.toString()}`, { method: "GET" }, token);
        if (cancelled) return;
        setUnits(data.items ?? []);
        setSelectedUnitIds((prev) => prev.filter((id) => (data.items ?? []).some((u) => u.unit_id === id)));
      } catch (unknownError) {
        if (cancelled) return;
        setUnits([]);
        setSelectedUnitIds([]);
        setUnitsError(unknownError instanceof Error ? unknownError.message : "Failed to load available units.");
      } finally {
        if (!cancelled) setUnitsLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [checkInDate, checkOutDate, token, initialQueryKey, skipInitialFetch]);

  const nights = useMemo(() => {
    if (!checkInDate || !checkOutDate || checkOutDate <= checkInDate) return 0;
    const from = new Date(`${checkInDate}T00:00:00`);
    const to = new Date(`${checkOutDate}T00:00:00`);
    return Math.max(0, Math.round((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24)));
  }, [checkInDate, checkOutDate]);

  const selectedUnits = useMemo(() => units.filter((unit) => selectedUnitIds.includes(unit.unit_id)), [selectedUnitIds, units]);
  const total = useMemo(() => selectedUnits.reduce((sum, unit) => sum + Number(unit.base_price || 0) * nights, 0), [nights, selectedUnits]);

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
    setSubmitBusy(true);
    setSubmitError(null);
    setSuccessMessage(null);
    setLatestAiRecommendation(null);
    try {
      const payload = {
        check_in_date: checkInDate,
        check_out_date: checkOutDate,
        unit_ids: selectedUnitIds,
        idempotency_key: crypto.randomUUID(),
      };

      const created = await apiFetch<ReservationCreateResponse>(
        "/v2/reservations",
        { method: "POST", body: JSON.stringify(payload) },
        token,
        reservationCreateResponseSchema,
      );
      setSuccessMessage(`Reservation ${created.reservation_code} created.`);
      setLatestAiRecommendation(created.ai_recommendation ?? null);
      window.setTimeout(() => {
        router.push("/my-bookings");
      }, 900);
    } catch (unknownError) {
      setSubmitError(unknownError instanceof Error ? unknownError.message : "Failed to create reservation.");
    } finally {
      setSubmitBusy(false);
    }
  };

  if (sessionLoading) {
    return (
      <section className="mx-auto w-full max-w-5xl">
        <h1 className="text-3xl font-bold text-slate-900">Book Your Stay</h1>
        <p className="mt-2 text-sm text-slate-600">Checking session...</p>
      </section>
    );
  }

  if (!token) {
    return (
      <section className="mx-auto w-full max-w-5xl">
        <h1 className="text-3xl font-bold text-slate-900">Book Your Stay</h1>
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
          Please sign in first to create a booking.
        </p>
      </section>
    );
  }

  return (
    <section className="mx-auto w-full max-w-5xl">
      <header className="mb-6">
        <h1 className="text-3xl font-bold text-slate-900">Book Your Stay</h1>
        <p className="mt-1 text-sm text-slate-600">
          Signed in as <strong>{sessionEmail ?? "guest"}</strong>
        </p>
      </header>

      {successMessage ? <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{successMessage}</p> : null}
      {submitError ? <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{submitError}</p> : null}
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

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <article className="rounded-xl bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">Select Dates</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm text-slate-700">
                Check-in
                <input
                  type="date"
                  value={checkInDate}
                  min={tomorrow}
                  onChange={(event) => {
                    const nextValue = event.target.value;
                    setCheckInDate(nextValue);
                    if (checkOutDate <= nextValue) {
                      const d = new Date(`${nextValue}T00:00:00`);
                      d.setDate(d.getDate() + 1);
                      setCheckOutDate(localIsoDate(d));
                    }
                  }}
                  className="rounded-lg border border-slate-300 px-3 py-2 outline-none ring-blue-200 transition focus:ring-2"
                />
              </label>
              <label className="grid gap-1 text-sm text-slate-700">
                Check-out
                <input
                  type="date"
                  value={checkOutDate}
                  min={checkInDate || tomorrow}
                  onChange={(event) => setCheckOutDate(event.target.value)}
                  className="rounded-lg border border-slate-300 px-3 py-2 outline-none ring-blue-200 transition focus:ring-2"
                />
              </label>
            </div>
            <p className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
              <strong>{nights}</strong> night{nights === 1 ? "" : "s"} stay
            </p>
          </article>

          <article className="rounded-xl bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">Available Units</h2>
            {unitsError ? <p className="mb-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{unitsError}</p> : null}
            {unitsLoading ? <p className="text-sm text-slate-600">Loading available units...</p> : null}
            {!unitsLoading && units.length === 0 ? <p className="text-sm text-slate-600">No units available for selected dates.</p> : null}

            <div className="space-y-3">
              {units.map((unit) => {
                const selected = selectedUnitIds.includes(unit.unit_id);
                const previewImage = (unit.image_urls && unit.image_urls.length ? unit.image_urls[0] : unit.image_url) || "";
                return (
                  <button
                    key={unit.unit_id}
                    type="button"
                    onClick={() => toggleUnit(unit.unit_id)}
                    className={`w-full overflow-hidden rounded-lg border-2 text-left transition ${
                      selected ? "border-[#1e3a8a] bg-blue-50" : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                  >
                    {previewImage ? (
                      <img
                        src={previewImage}
                        alt={unit.name}
                        loading="lazy"
                        decoding="async"
                        className="h-40 w-full object-cover"
                      />
                    ) : null}
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="font-semibold text-slate-900">{unit.name}</h3>
                          <p className="text-sm text-slate-500 capitalize">
                            {unit.type} • Up to {unit.capacity} guests
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-slate-900">{toPeso(Number(unit.base_price || 0))}</p>
                          <p className="text-xs text-slate-500">per night</p>
                        </div>
                      </div>
                      {unit.description ? <p className="mt-2 text-sm text-slate-600">{unit.description}</p> : null}
                      {unit.amenities?.length ? (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {unit.amenities.slice(0, 5).map((amenity) => (
                            <span key={amenity} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                              {amenity}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>
          </article>
        </div>

        <aside className="lg:col-span-1">
          <div className="sticky top-24 rounded-xl bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-lg font-semibold text-slate-900">Booking Summary</h2>
            {selectedUnits.length === 0 ? (
              <p className="text-sm text-slate-600">Select units to see summary.</p>
            ) : (
              <div className="space-y-2">
                {selectedUnits.map((unit) => (
                  <div key={unit.unit_id} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
                    <div>
                      <p className="text-sm font-medium text-slate-900">{unit.name}</p>
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
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Total</span>
                <span className="text-xl font-bold text-[#1e3a8a]">{toPeso(total)}</span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => void createReservation()}
              disabled={submitBusy || selectedUnitIds.length === 0}
              className="mt-4 w-full rounded-lg bg-[#f97316] px-4 py-3 text-sm font-semibold text-white transition hover:-translate-y-0.5 hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitBusy ? "Creating..." : "Confirm Booking"}
            </button>

            <p className="mt-3 text-center text-xs text-slate-500">This flow is V2 API only.</p>
          </div>
        </aside>
      </div>
    </section>
  );
}
