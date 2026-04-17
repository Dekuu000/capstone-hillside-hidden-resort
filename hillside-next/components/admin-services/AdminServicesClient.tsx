"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ClipboardList,
  Loader2,
  Search,
  Sparkles,
  Wrench,
} from "lucide-react";
import type {
  ResortServiceRequestItem,
  ResortServiceRequestStatus,
} from "../../../packages/shared/src/types";
import {
  resortServiceRequestItemSchema,
  resortServiceRequestListResponseSchema,
} from "../../../packages/shared/src/schemas";
import { apiFetch } from "../../lib/apiClient";
import { syncAwareMutation } from "../../lib/offlineSync/mutation";
import { DetailDrawer } from "../shared/DetailDrawer";
import { EmptyState } from "../shared/EmptyState";
import { Skeleton } from "../shared/Skeleton";
import { Tabs } from "../shared/Tabs";
import { useToast } from "../shared/ToastProvider";

type Props = {
  accessToken: string | null;
};

const STATUS_TABS: Array<{ id: "all" | ResortServiceRequestStatus; label: string }> = [
  { id: "all", label: "All" },
  { id: "new", label: "New" },
  { id: "in_progress", label: "In Progress" },
  { id: "done", label: "Done" },
  { id: "cancelled", label: "Cancelled" },
];

const STATUS_STYLE: Record<string, string> = {
  new: "bg-blue-100 text-blue-800",
  in_progress: "bg-amber-100 text-amber-800",
  done: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-rose-100 text-rose-800",
};

function toPeso(value: number) {
  return new Intl.NumberFormat("en-PH", {
    style: "currency",
    currency: "PHP",
    maximumFractionDigits: 0,
  }).format(value);
}

export function AdminServicesClient({ accessToken }: Props) {
  const { showToast } = useToast();
  const [statusFilter, setStatusFilter] = useState<"all" | ResortServiceRequestStatus>("all");
  const [categoryFilter, setCategoryFilter] = useState<"all" | "room_service" | "spa">("all");
  const [search, setSearch] = useState("");

  const [rows, setRows] = useState<ResortServiceRequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [activeRow, setActiveRow] = useState<ResortServiceRequestItem | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const loadQueue = async () => {
    if (!accessToken) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ limit: "100", offset: "0" });
      if (statusFilter !== "all") qs.set("status", statusFilter);
      if (categoryFilter !== "all") qs.set("category", categoryFilter);
      if (search.trim()) qs.set("search", search.trim());
      const data = await apiFetch(
        `/v2/admin/services/requests?${qs.toString()}`,
        { method: "GET" },
        accessToken,
        resortServiceRequestListResponseSchema,
      );
      setRows(data.items ?? []);
    } catch (unknownError) {
      setRows([]);
      setError(unknownError instanceof Error ? unknownError.message : "Failed to load service queue.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadQueue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken, statusFilter, categoryFilter]);

  const filteredRows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((item) => {
      const guest = item.guest?.name || item.guest?.email || "";
      const reservationCode = item.reservation?.reservation_code || "";
      const serviceName = item.service_item?.service_name || "";
      return `${guest} ${reservationCode} ${serviceName}`.toLowerCase().includes(term);
    });
  }, [rows, search]);

  const updateStatus = async (
    requestId: string,
    nextStatus: ResortServiceRequestStatus,
    notes?: string,
  ) => {
    if (!accessToken) return;
    setActionBusy(true);
    try {
      const payload = { request_id: requestId, status: nextStatus, notes: notes || null };
      const outcome = await syncAwareMutation<typeof payload, ResortServiceRequestItem>({
        path: `/v2/admin/services/requests/${encodeURIComponent(requestId)}`,
        method: "PATCH",
        payload,
        parser: resortServiceRequestItemSchema,
        accessToken,
        entityType: "service_request",
        action: "admin.services.requests.update_status",
        entityId: requestId,
        buildOptimisticResponse: (queuedPayload) => {
          const current = rows.find((item) => item.request_id === requestId) ?? activeRow;
          if (!current) {
            return {
              request_id: requestId,
              guest_user_id: "",
              reservation_id: null,
              service_item_id: "",
              quantity: 1,
              preferred_time: null,
              notes: queuedPayload.notes || null,
              status: queuedPayload.status as ResortServiceRequestStatus,
              requested_at: new Date().toISOString(),
              processed_at: null,
              processed_by_user_id: null,
              updated_at: new Date().toISOString(),
            };
          }
          return {
            ...current,
            status: queuedPayload.status as ResortServiceRequestStatus,
            notes: (queuedPayload.notes as string | null) ?? current.notes ?? null,
            updated_at: new Date().toISOString(),
          };
        },
      });
      const nextData = outcome.data;
      if (nextData) {
        setRows((prev) => prev.map((item) => (item.request_id === requestId ? nextData : item)));
        setActiveRow(nextData);
      }
      showToast(
        outcome.mode === "online"
          ? {
              type: "success",
              title: "Request updated",
              message: `Status changed to ${nextStatus.replaceAll("_", " ")}.`,
            }
          : {
              type: "info",
              title: "Saved offline",
              message: "Status change queued and will sync when internet is available.",
            },
      );
    } catch (unknownError) {
      showToast({
        type: "error",
        title: "Update failed",
        message: unknownError instanceof Error ? unknownError.message : "Unable to update request.",
      });
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="surface p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto]">
          <Tabs
            items={STATUS_TABS.map((tab) => ({ id: tab.id, label: tab.label }))}
            value={statusFilter}
            onChange={(nextTab) => setStatusFilter(nextTab as "all" | ResortServiceRequestStatus)}
            className="sm:grid-cols-5"
          />
          <select
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value as "all" | "room_service" | "spa")}
            className="h-11 rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm text-[var(--color-text)]"
          >
            <option value="all">All categories</option>
            <option value="room_service">Room Service</option>
            <option value="spa">Spa</option>
          </select>
          <label className="inline-flex h-11 min-w-[240px] items-center gap-2 rounded-xl border border-[var(--color-border)] bg-white px-3">
            <Search className="h-4 w-4 text-[var(--color-muted)]" />
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search guest, reservation, service"
              className="w-full bg-transparent text-sm text-[var(--color-text)] outline-none"
            />
          </label>
        </div>
      </section>

      <section className="surface p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="inline-flex items-center gap-2 text-base font-semibold text-[var(--color-text)]">
            <ClipboardList className="h-4 w-4 text-[var(--color-secondary)]" />
            Service Requests Queue
          </h2>
          <button
            type="button"
            onClick={() => void loadQueue()}
            className="inline-flex h-10 items-center justify-center rounded-lg border border-[var(--color-border)] bg-white px-3 text-sm font-semibold text-[var(--color-text)]"
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : null}
        {error ? (
          <p className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
        ) : null}
        {!loading && !error && filteredRows.length === 0 ? (
          <EmptyState
            title="No service requests"
            description="Requests from guest portal will appear here."
            compact
          />
        ) : null}

        <div className="space-y-2">
          {filteredRows.map((row) => (
            <button
              key={row.request_id}
              type="button"
              onClick={() => setActiveRow(row)}
              className="w-full rounded-xl border border-[var(--color-border)] bg-white p-3 text-left"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-[var(--color-text)]">
                  {row.service_item?.service_name || "Service request"}
                </p>
                <span
                  className={`rounded-full px-2 py-1 text-xs font-semibold ${STATUS_STYLE[row.status] || "bg-slate-100 text-slate-700"}`}
                >
                  {row.status.replaceAll("_", " ")}
                </span>
              </div>
              <div className="mt-1 text-sm text-[var(--color-muted)]">
                <span>{row.guest?.name || row.guest?.email || "Guest"}</span>
                <span className="mx-1">|</span>
                <span>{row.reservation?.reservation_code || "No reservation linked"}</span>
                <span className="mx-1">|</span>
                <span>Qty {row.quantity}</span>
              </div>
            </button>
          ))}
        </div>
      </section>

      <DetailDrawer
        open={Boolean(activeRow)}
        onClose={() => setActiveRow(null)}
        title={activeRow?.service_item?.service_name || "Service request"}
        subtitle={activeRow ? `Request ${activeRow.request_id.slice(0, 8)}...` : undefined}
      >
        {activeRow ? (
          <div className="space-y-4">
            <section className="rounded-xl border border-[var(--color-border)] bg-slate-50 p-3 text-sm text-[var(--color-text)]">
              <p><strong>Guest:</strong> {activeRow.guest?.name || activeRow.guest?.email || "-"}</p>
              <p><strong>Reservation:</strong> {activeRow.reservation?.reservation_code || "-"}</p>
              <p><strong>Quantity:</strong> {activeRow.quantity}</p>
              <p><strong>Price:</strong> {toPeso(Number(activeRow.service_item?.price || 0))}</p>
              <p><strong>Requested:</strong> {new Date(activeRow.requested_at).toLocaleString()}</p>
              <p>
                <strong>Preferred time:</strong>{" "}
                {activeRow.preferred_time ? new Date(activeRow.preferred_time).toLocaleString() : "-"}
              </p>
            </section>
            {activeRow.notes ? (
              <section className="rounded-xl border border-[var(--color-border)] bg-white p-3">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">Notes</p>
                <p className="mt-1 text-sm text-[var(--color-text)]">{activeRow.notes}</p>
              </section>
            ) : null}
            <section className="grid grid-cols-1 gap-2">
              <button
                type="button"
                disabled={actionBusy || activeRow.status === "in_progress"}
                onClick={() => void updateStatus(activeRow.request_id, "in_progress")}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-[var(--color-border)] bg-white px-3 text-sm font-semibold text-[var(--color-text)] disabled:opacity-50"
              >
                <Wrench className="h-4 w-4" />
                Start
              </button>
              <button
                type="button"
                disabled={actionBusy || activeRow.status === "done"}
                onClick={() => void updateStatus(activeRow.request_id, "done")}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[var(--color-success)] px-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                {actionBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Complete
              </button>
              <button
                type="button"
                disabled={actionBusy || activeRow.status === "cancelled"}
                onClick={() => void updateStatus(activeRow.request_id, "cancelled")}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-rose-300 bg-rose-50 px-3 text-sm font-semibold text-rose-700 disabled:opacity-50"
              >
                Cancel
              </button>
            </section>
          </div>
        ) : null}
      </DetailDrawer>
    </div>
  );
}
