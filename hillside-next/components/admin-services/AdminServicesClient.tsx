"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  ConciergeBell,
  Hash,
  Loader2,
  NotebookText,
  OctagonX,
  Package,
  PlayCircle,
  ReceiptText,
  Search,
  Sparkles,
  UserRound,
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
import { getApiErrorMessage } from "../../lib/apiError";
import { formatDateTime } from "../../lib/dateDisplay";
import { formatPhpPeso as toPeso } from "../../lib/formatCurrency";
import { syncAwareMutation } from "../../lib/offlineSync/mutation";
import { DetailDrawer } from "../shared/DetailDrawer";
import { EmptyState } from "../shared/EmptyState";
import { Select } from "../shared/Select";
import { Skeleton } from "../shared/Skeleton";
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

function getCategoryAvatar(category?: string | null) {
  if (category === "spa") {
    return { Icon: Sparkles, className: "bg-purple-50 text-purple-600" };
  }
  if (category === "room_service") {
    return { Icon: ConciergeBell, className: "bg-[color:color-mix(in_srgb,var(--color-secondary)_14%,white)] text-[var(--color-secondary)]" };
  }
  return { Icon: Wrench, className: "bg-[var(--color-background)] text-[var(--color-muted)]" };
}

const QUEUE_TIME_FORMAT: Intl.DateTimeFormatOptions = {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
};

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
      setError(getApiErrorMessage(unknownError, "Failed to load service queue."));
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
        message: getApiErrorMessage(unknownError, "Unable to update request."),
      });
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <section className="surface p-3 sm:p-4">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-[minmax(0,190px)_minmax(0,190px)_minmax(0,1fr)]">
          <Select
            ariaLabel="Filter by status"
            value={statusFilter}
            onChange={(next) => setStatusFilter(next as "all" | ResortServiceRequestStatus)}
            options={STATUS_TABS.map((tab) => ({ value: tab.id, label: tab.id === "all" ? "All requests" : tab.label }))}
          />
          <Select
            ariaLabel="Filter by category"
            value={categoryFilter}
            onChange={(next) => setCategoryFilter(next as "all" | "room_service" | "spa")}
            options={[
              { value: "all", label: "All categories" },
              { value: "room_service", label: "Room Service" },
              { value: "spa", label: "Spa" },
            ]}
          />
          <label className="inline-flex h-11 items-center gap-2 rounded-xl border border-[var(--color-border)] bg-white px-3 sm:col-span-2 lg:col-span-1">
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
          {filteredRows.map((row) => {
            const avatar = getCategoryAvatar(row.service_item?.category);
            const requestedAt = formatDateTime(row.requested_at, {
              locale: "en-PH",
              formatOptions: QUEUE_TIME_FORMAT,
              fallback: "",
            });
            return (
              <button
                key={row.request_id}
                type="button"
                onClick={() => setActiveRow(row)}
                className="group flex w-full items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-white p-3 text-left transition-colors duration-200 hover:border-[color:color-mix(in_srgb,var(--color-secondary)_35%,white)] hover:bg-[var(--color-background)]"
              >
                <span className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${avatar.className}`}>
                  <avatar.Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate font-semibold text-[var(--color-text)]">
                      {row.service_item?.service_name || "Service request"}
                    </span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${STATUS_STYLE[row.status] || "bg-[var(--color-background)] text-[var(--color-text)]"}`}
                    >
                      {row.status.replaceAll("_", " ")}
                    </span>
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm text-[var(--color-muted)]">
                    <span className="truncate font-medium text-[var(--color-text)]">{row.guest?.name || row.guest?.email || "Guest"}</span>
                    <span aria-hidden="true">·</span>
                    <span>{row.reservation?.reservation_code || "No reservation"}</span>
                    <span aria-hidden="true">·</span>
                    <span>Qty {row.quantity}</span>
                    {requestedAt ? (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>{requestedAt}</span>
                      </>
                    ) : null}
                  </span>
                </span>
                <ChevronRight className="h-5 w-5 shrink-0 text-[var(--color-muted)] transition-transform duration-200 group-hover:translate-x-0.5" />
              </button>
            );
          })}
        </div>
      </section>

      <DetailDrawer
        open={Boolean(activeRow)}
        onClose={() => setActiveRow(null)}
        title={activeRow?.service_item?.service_name || "Service request"}
        subtitle={activeRow ? `Request ${activeRow.request_id.slice(0, 8)}...` : undefined}
        footer={
          activeRow ? (
            activeRow.status === "done" || activeRow.status === "cancelled" ? (
              <p className="text-center text-sm text-[var(--color-muted)]">
                This request is {activeRow.status === "done" ? "completed" : "cancelled"} — no further action needed.
              </p>
            ) : (
              // Valid transitions only: new → Start/Cancel, in_progress → Complete/Cancel.
              <div className="flex items-center gap-2">
                {activeRow.status === "new" ? (
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => void updateStatus(activeRow.request_id, "in_progress")}
                    className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] px-3 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-50"
                  >
                    {actionBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
                    Start
                  </button>
                ) : null}
                {activeRow.status === "in_progress" ? (
                  <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => void updateStatus(activeRow.request_id, "done")}
                    className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl bg-[var(--color-success)] px-3 text-sm font-semibold text-white shadow-sm transition hover:brightness-95 disabled:opacity-50"
                  >
                    {actionBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Complete
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={actionBusy}
                  onClick={() => void updateStatus(activeRow.request_id, "cancelled")}
                  className="inline-flex h-10 flex-1 items-center justify-center gap-2 rounded-xl border border-rose-300 bg-rose-50 px-3 text-sm font-semibold text-rose-700 shadow-sm transition hover:bg-rose-100 disabled:opacity-50"
                >
                  <OctagonX className="h-4 w-4" />
                  Cancel
                </button>
              </div>
            )
          ) : undefined
        }
      >
        {activeRow ? (
          <div className="space-y-4">
            <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] p-3 text-sm text-[var(--color-text)]">
              <div className="grid gap-2 sm:grid-cols-2">
                <div className="inline-flex items-start gap-2">
                  <UserRound className="mt-0.5 h-4 w-4 text-[var(--color-muted)]" />
                  <p><strong>Guest:</strong> {activeRow.guest?.name || activeRow.guest?.email || "-"}</p>
                </div>
                <div className="inline-flex items-start gap-2">
                  <Hash className="mt-0.5 h-4 w-4 text-[var(--color-muted)]" />
                  <p><strong>Reservation:</strong> {activeRow.reservation?.reservation_code || "-"}</p>
                </div>
                <div className="inline-flex items-start gap-2">
                  <Package className="mt-0.5 h-4 w-4 text-[var(--color-muted)]" />
                  <p><strong>Quantity:</strong> {activeRow.quantity}</p>
                </div>
                <div className="inline-flex items-start gap-2">
                  <ReceiptText className="mt-0.5 h-4 w-4 text-[var(--color-muted)]" />
                  <p><strong>Price:</strong> {toPeso(Number(activeRow.service_item?.price || 0))}</p>
                </div>
                <div className="inline-flex items-start gap-2 sm:col-span-2">
                  <CalendarClock className="mt-0.5 h-4 w-4 text-[var(--color-muted)]" />
                  <p><strong>Requested:</strong> {formatDateTime(activeRow.requested_at)}</p>
                </div>
                <div className="inline-flex items-start gap-2 sm:col-span-2">
                  <Wrench className="mt-0.5 h-4 w-4 text-[var(--color-muted)]" />
                  <p>
                    <strong>Preferred time:</strong>{" "}
                    {activeRow.preferred_time ? formatDateTime(activeRow.preferred_time) : "-"}
                  </p>
                </div>
              </div>
            </section>
            {activeRow.notes ? (
              <section className="rounded-xl border border-[var(--color-border)] bg-white p-3">
                <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--color-muted)]">
                  <NotebookText className="h-3.5 w-3.5" />
                  Notes
                </p>
                <p className="mt-1 text-sm text-[var(--color-text)]">{activeRow.notes}</p>
              </section>
            ) : null}
          </div>
        ) : null}
      </DetailDrawer>
    </div>
  );
}
