"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import {
  ClipboardList,
  Clock3,
  Loader2,
  Sparkles,
  UtensilsCrossed,
  Waves,
} from "lucide-react";
import type {
  MyBookingsResponse,
  ResortServiceCategory,
  ResortServiceItem,
  ResortServiceRequestCreateRequest,
  ResortServiceRequestItem,
} from "../../../packages/shared/src/types";
import {
  myBookingsResponseSchema,
  resortServiceListResponseSchema,
  resortServiceRequestListResponseSchema,
  resortServiceRequestItemSchema,
} from "../../../packages/shared/src/schemas";
import { apiFetch } from "../../lib/apiClient";
import { syncAwareMutation } from "../../lib/offlineSync/mutation";
import { EmptyState } from "../shared/EmptyState";
import { Skeleton } from "../shared/Skeleton";
import { Tabs } from "../shared/Tabs";
import { useToast } from "../shared/ToastProvider";

type Props = {
  accessToken: string | null;
};

const CATEGORY_TABS: Array<{ id: ResortServiceCategory; label: string }> = [
  { id: "room_service", label: "Room Service" },
  { id: "spa", label: "Spa" },
];

const STATUS_LABEL: Record<string, string> = {
  new: "New",
  in_progress: "In progress",
  done: "Done",
  cancelled: "Cancelled",
};

function toPeso(value: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(value);
}

export function GuestServicesClient({ accessToken }: Props) {
  const { showToast } = useToast();
  const [category, setCategory] = useState<ResortServiceCategory>("room_service");
  const [services, setServices] = useState<ResortServiceItem[]>([]);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [servicesError, setServicesError] = useState<string | null>(null);

  const [requests, setRequests] = useState<ResortServiceRequestItem[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [requestsError, setRequestsError] = useState<string | null>(null);

  const [reservations, setReservations] = useState<Array<{ reservation_id: string; reservation_code: string }>>([]);

  const [selectedService, setSelectedService] = useState<ResortServiceItem | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [preferredTime, setPreferredTime] = useState("");
  const [reservationId, setReservationId] = useState("");
  const [notes, setNotes] = useState("");
  const [submitBusy, setSubmitBusy] = useState(false);

  const loadServices = useCallback(
    async (nextCategory: ResortServiceCategory) => {
      if (!accessToken) return;
      setServicesLoading(true);
      setServicesError(null);
      try {
        const query = new URLSearchParams({ category: nextCategory });
        const data = await apiFetch(
          `/v2/guest/services?${query.toString()}`,
          { method: "GET" },
          accessToken,
          resortServiceListResponseSchema,
        );
        setServices(data.items ?? []);
      } catch (unknownError) {
        setServices([]);
        setServicesError(unknownError instanceof Error ? unknownError.message : "Failed to load services.");
      } finally {
        setServicesLoading(false);
      }
    },
    [accessToken],
  );

  const loadRequests = useCallback(async () => {
    if (!accessToken) return;
    setRequestsLoading(true);
    setRequestsError(null);
    try {
      const data = await apiFetch(
        "/v2/guest/services/requests?limit=20&offset=0",
        { method: "GET" },
        accessToken,
        resortServiceRequestListResponseSchema,
      );
      setRequests(data.items ?? []);
    } catch (unknownError) {
      setRequests([]);
      setRequestsError(unknownError instanceof Error ? unknownError.message : "Failed to load request history.");
    } finally {
      setRequestsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadServices(category);
  }, [category, loadServices]);

  useEffect(() => {
    if (!accessToken) return;
    void loadRequests();
    void (async () => {
      try {
        const data = await apiFetch<MyBookingsResponse>(
          "/v2/me/bookings?tab=upcoming&limit=10",
          { method: "GET" },
          accessToken,
          myBookingsResponseSchema,
        );
        const nextReservations = (data.items ?? []).map((item) => ({
          reservation_id: item.reservation_id,
          reservation_code: item.reservation_code,
        }));
        setReservations(nextReservations);
      } catch {
        setReservations([]);
      }
    })();
  }, [accessToken, loadRequests]);

  const submitRequest = async (event: FormEvent) => {
    event.preventDefault();
    if (!accessToken || !selectedService) return;
    setSubmitBusy(true);
    try {
      const payload: ResortServiceRequestCreateRequest = {
        service_item_id: selectedService.service_item_id,
        quantity,
        reservation_id: reservationId || null,
        preferred_time: preferredTime ? new Date(preferredTime).toISOString() : null,
        notes: notes.trim() || null,
        idempotency_key: crypto.randomUUID(),
      };
      const outcome = await syncAwareMutation<ResortServiceRequestCreateRequest, ResortServiceRequestItem>({
        path: "/v2/guest/services/requests",
        method: "POST",
        payload,
        parser: resortServiceRequestItemSchema,
        accessToken,
        entityType: "service_request",
        action: "guest_services.requests.create",
        buildOptimisticResponse: () => ({
          request_id: `offline-${crypto.randomUUID()}`,
          guest_user_id: "offline",
          reservation_id: payload.reservation_id ?? null,
          service_item_id: payload.service_item_id,
          quantity: payload.quantity,
          preferred_time: payload.preferred_time ?? null,
          notes: payload.notes ?? null,
          status: "new",
          requested_at: new Date().toISOString(),
          processed_at: null,
          processed_by_user_id: null,
          updated_at: new Date().toISOString(),
          guest: null,
          reservation: null,
          service_item: selectedService,
        }),
      });
      if (outcome.mode === "queued") {
        showToast({
          type: "warning",
          title: "Saved offline",
          message: `${selectedService.service_name} request queued for sync.`,
        });
        if (outcome.data) {
          setRequests((previous) => [outcome.data as ResortServiceRequestItem, ...previous]);
        }
      } else {
        showToast({
          type: "success",
          title: "Request submitted",
          message: `${selectedService.service_name} request sent.`,
        });
      }
      setSelectedService(null);
      setQuantity(1);
      setPreferredTime("");
      setReservationId("");
      setNotes("");
      if (outcome.mode === "online") {
        await loadRequests();
      }
    } catch (unknownError) {
      showToast({
        type: "error",
        title: "Request failed",
        message: unknownError instanceof Error ? unknownError.message : "Unable to submit request.",
      });
    } finally {
      setSubmitBusy(false);
    }
  };

  const filteredRequests = useMemo(
    () => requests.filter((item) => item.service_item?.category === category),
    [category, requests],
  );

  return (
    <div className="space-y-4">
      <section className="surface p-4">
        <Tabs
          items={CATEGORY_TABS.map((tab) => ({ id: tab.id, label: tab.label }))}
          value={category}
          onChange={(id) => setCategory(id as ResortServiceCategory)}
          className="sm:grid-cols-2"
        />
        <p className="mt-3 text-sm text-[var(--color-muted)]">
          Request services anytime. Front desk sees requests instantly in the admin queue.
        </p>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        <article className="surface p-4">
          <h2 className="inline-flex items-center gap-2 text-base font-semibold text-[var(--color-text)]">
            {category === "room_service" ? (
              <UtensilsCrossed className="h-4 w-4 text-[var(--color-secondary)]" />
            ) : (
              <Waves className="h-4 w-4 text-[var(--color-secondary)]" />
            )}
            Digital Menu
          </h2>
          {servicesLoading ? (
            <div className="mt-3 space-y-2">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : null}
          {servicesError ? (
            <p className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{servicesError}</p>
          ) : null}
          {!servicesLoading && !servicesError && services.length === 0 ? (
            <div className="mt-3">
              <EmptyState
                title="No active services"
                description="This category has no active items yet."
                compact
              />
            </div>
          ) : null}

          <div className="mt-3 grid gap-3">
            {services.map((service) => (
              <div key={service.service_item_id} className="rounded-xl border border-[var(--color-border)] bg-white p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-[var(--color-text)]">{service.service_name}</p>
                    <p className="mt-1 text-sm text-[var(--color-muted)]">
                      {service.description || "No description provided."}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-[var(--color-text)]">{toPeso(Number(service.price || 0))}</p>
                    <p className="text-xs text-[var(--color-muted)]">ETA {service.eta_minutes ?? "-"} mins</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedService(service)}
                  className="mt-3 inline-flex h-10 items-center justify-center rounded-lg bg-[var(--color-primary)] px-3 text-sm font-semibold text-white"
                >
                  Request Service
                </button>
              </div>
            ))}
          </div>
        </article>

        <article className="surface p-4">
          <h2 className="inline-flex items-center gap-2 text-base font-semibold text-[var(--color-text)]">
            <ClipboardList className="h-4 w-4 text-[var(--color-secondary)]" />
            Request Timeline
          </h2>
          {requestsLoading ? (
            <div className="mt-3 space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : null}
          {requestsError ? (
            <p className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{requestsError}</p>
          ) : null}
          {!requestsLoading && !requestsError && filteredRequests.length === 0 ? (
            <div className="mt-3">
              <EmptyState
                title="No requests yet"
                description="Your submitted service requests will appear here."
                compact
              />
            </div>
          ) : null}
          <ul className="mt-3 space-y-2">
            {filteredRequests.map((item) => (
              <li key={item.request_id} className="rounded-xl border border-[var(--color-border)] bg-slate-50 p-3">
                <p className="text-sm font-semibold text-[var(--color-text)]">
                  {item.service_item?.service_name || "Service request"}
                </p>
                <p className="mt-1 text-xs text-[var(--color-muted)]">
                  {STATUS_LABEL[item.status] || item.status} | Qty {item.quantity}
                </p>
                <p className="mt-1 inline-flex items-center gap-1 text-xs text-[var(--color-muted)]">
                  <Clock3 className="h-3.5 w-3.5" />
                  {new Date(item.requested_at).toLocaleString()}
                </p>
              </li>
            ))}
          </ul>
        </article>
      </section>

      {selectedService ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-slate-900/50 p-0 md:items-center md:p-4">
          <div className="max-h-[92vh] w-full overflow-auto rounded-t-2xl border border-[var(--color-border)] bg-white p-4 md:max-w-xl md:rounded-2xl">
            <h3 className="text-lg font-semibold text-[var(--color-text)]">Request {selectedService.service_name}</h3>
            <p className="mt-1 text-sm text-[var(--color-muted)]">{toPeso(Number(selectedService.price || 0))} per item</p>
            <form className="mt-3 grid gap-3" onSubmit={submitRequest}>
              <label className="grid gap-1 text-sm text-[var(--color-text)]">
                Quantity
                <input
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(event) => setQuantity(Math.max(1, Number(event.target.value || 1)))}
                  className="h-11 rounded-lg border border-[var(--color-border)] bg-slate-50 px-3"
                />
              </label>
              <label className="grid gap-1 text-sm text-[var(--color-text)]">
                Attach reservation (optional)
                <select
                  value={reservationId}
                  onChange={(event) => setReservationId(event.target.value)}
                  className="h-11 rounded-lg border border-[var(--color-border)] bg-slate-50 px-3"
                >
                  <option value="">None</option>
                  {reservations.map((item) => (
                    <option key={item.reservation_id} value={item.reservation_id}>
                      {item.reservation_code}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-sm text-[var(--color-text)]">
                Preferred time (optional)
                <input
                  type="datetime-local"
                  value={preferredTime}
                  onChange={(event) => setPreferredTime(event.target.value)}
                  className="h-11 rounded-lg border border-[var(--color-border)] bg-slate-50 px-3"
                />
              </label>
              <label className="grid gap-1 text-sm text-[var(--color-text)]">
                Notes (optional)
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  rows={3}
                  className="rounded-lg border border-[var(--color-border)] bg-slate-50 px-3 py-2"
                />
              </label>
              <div className="mt-1 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setSelectedService(null)}
                  className="inline-flex h-10 items-center justify-center rounded-lg border border-[var(--color-border)] bg-white px-3 text-sm font-semibold text-[var(--color-text)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitBusy}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[var(--color-cta)] px-3 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {submitBusy ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Submit request
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
