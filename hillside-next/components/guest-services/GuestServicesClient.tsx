"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
import { getApiErrorMessage } from "../../lib/apiError";
import { useNetworkOnline } from "../../lib/hooks/useNetworkOnline";
import { syncAwareMutation } from "../../lib/offlineSync/mutation";
import { EmptyState } from "../shared/EmptyState";
import { InsetPanel } from "../shared/InsetPanel";
import { ModalDialog } from "../shared/ModalDialog";
import { Skeleton } from "../shared/Skeleton";
import { SyncAlertBanner } from "../shared/SyncAlertBanner";
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

const STATUS_BADGE_CLASS: Record<string, string> = {
  new: "bg-blue-100 text-blue-800",
  in_progress: "bg-amber-100 text-amber-800",
  done: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-slate-200 text-slate-700",
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
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionHasSyncCta, setActionHasSyncCta] = useState(false);
  const networkOnline = useNetworkOnline();
  const estimatedTotal = useMemo(
    () => (selectedService ? Number(selectedService.price || 0) * quantity : 0),
    [quantity, selectedService],
  );

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
        setServicesError(getApiErrorMessage(unknownError, "Failed to load services."));
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
      setRequestsError(getApiErrorMessage(unknownError, "Failed to load request history."));
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
    setActionMessage(null);
    setActionHasSyncCta(false);
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
        setActionMessage(`${selectedService.service_name} request queued for sync.`);
        setActionHasSyncCta(true);
        showToast({
          type: "warning",
          title: "Saved offline",
          message: `${selectedService.service_name} request queued for sync.`,
        });
        if (outcome.data) {
          setRequests((previous) => [outcome.data as ResortServiceRequestItem, ...previous]);
        }
      } else {
        setActionMessage(`${selectedService.service_name} request sent to front desk.`);
        setActionHasSyncCta(false);
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
        message: getApiErrorMessage(unknownError, "Unable to submit request."),
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
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-[var(--color-muted)]">
            Request services anytime. Online requests are sent instantly; offline requests queue for sync.
          </p>
          <Link
            href="/guest/sync"
            className="inline-flex h-8 items-center rounded-full border border-[var(--color-border)] bg-white px-3 text-xs font-semibold text-[var(--color-text)]"
          >
            Open Sync Center
          </Link>
        </div>
      </section>
      {!networkOnline ? (
        <SyncAlertBanner message="You are offline. Service requests will be queued and synced automatically when internet returns." />
      ) : null}
      {actionMessage ? (
        <SyncAlertBanner
          message={actionMessage}
          tone={actionHasSyncCta ? "warning" : "success"}
          showSyncCta={actionHasSyncCta}
          role="status"
        />
      ) : null}

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
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <p>{servicesError}</p>
              <button
                type="button"
                className="mt-2 inline-flex h-8 items-center rounded-lg border border-red-200 bg-white px-3 text-xs font-semibold text-red-700"
                onClick={() => void loadServices(category)}
              >
                Retry
              </button>
            </div>
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
              <InsetPanel key={service.service_item_id} tone="surface">
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
              </InsetPanel>
            ))}
          </div>
        </article>

        <article className="surface p-4">
          <h2 className="inline-flex items-center gap-2 text-base font-semibold text-[var(--color-text)]">
            <ClipboardList className="h-4 w-4 text-[var(--color-secondary)]" />
            Request Timeline
          </h2>
          <p className="mt-2 text-xs text-[var(--color-muted)]">
            Track each request from <strong>New</strong> to <strong>Done</strong>.
          </p>
          {requestsLoading ? (
            <div className="mt-3 space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : null}
          {requestsError ? (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              <p>{requestsError}</p>
              <button
                type="button"
                className="mt-2 inline-flex h-8 items-center rounded-lg border border-red-200 bg-white px-3 text-xs font-semibold text-red-700"
                onClick={() => void loadRequests()}
              >
                Retry
              </button>
            </div>
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
              <InsetPanel as="li" key={item.request_id}>
                <p className="text-sm font-semibold text-[var(--color-text)]">
                  {item.service_item?.service_name || "Service request"}
                </p>
                <p className="mt-1 text-xs text-[var(--color-muted)]">
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                      STATUS_BADGE_CLASS[item.status] || STATUS_BADGE_CLASS.cancelled
                    }`}
                  >
                    {STATUS_LABEL[item.status] || item.status}
                  </span>{" "}
                  | Qty {item.quantity}
                </p>
                <p className="mt-1 inline-flex items-center gap-1 text-xs text-[var(--color-muted)]">
                  <Clock3 className="h-3.5 w-3.5" />
                  {new Date(item.requested_at).toLocaleString()}
                </p>
              </InsetPanel>
            ))}
          </ul>
        </article>
      </section>

      {selectedService ? (
        <ModalDialog
          titleId="service-request-title"
          title={`Request ${selectedService.service_name}`}
          onClose={() => setSelectedService(null)}
          panelClassName="border-[var(--color-border)] bg-white"
          closeLabel="Close service request dialog"
          closeButtonClassName="border-[var(--color-border)] text-[var(--color-text)]"
        >
            <p className="mt-1 text-sm text-[var(--color-muted)]">{toPeso(Number(selectedService.price || 0))} per item</p>
            <p className="mt-2 rounded-lg border border-[var(--color-border)] bg-slate-50 px-3 py-2 text-xs text-[var(--color-muted)]">
              After submit: front desk receives this request immediately when online. If offline, it will auto-sync later.
            </p>
            <form className="mt-3 grid gap-3" onSubmit={submitRequest}>
              <label className="grid gap-1 text-sm text-[var(--color-text)]">
                Quantity
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--color-border)] bg-white text-lg font-semibold text-[var(--color-text)]"
                    aria-label="Decrease quantity"
                  >
                    -
                  </button>
                  <input
                    type="number"
                    min={1}
                    value={quantity}
                    onChange={(event) => setQuantity(Math.max(1, Number(event.target.value || 1)))}
                    className="h-11 w-24 rounded-lg border border-[var(--color-border)] bg-slate-50 px-3 text-center"
                  />
                  <button
                    type="button"
                    onClick={() => setQuantity((value) => value + 1)}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--color-border)] bg-white text-lg font-semibold text-[var(--color-text)]"
                    aria-label="Increase quantity"
                  >
                    +
                  </button>
                </div>
              </label>
              <p className="rounded-lg border border-[var(--color-border)] bg-slate-50 px-3 py-2 text-xs text-[var(--color-muted)]">
                Estimated total: <strong className="text-[var(--color-text)]">{toPeso(estimatedTotal)}</strong>
              </p>
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
                <span className="text-xs text-[var(--color-muted)]">Leave blank if you want the next available slot.</span>
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
        </ModalDialog>
      ) : null}
    </div>
  );
}

