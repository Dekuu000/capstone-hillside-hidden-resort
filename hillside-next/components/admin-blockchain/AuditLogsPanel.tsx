"use client";

import { useMemo, useState } from "react";
import { ExternalLink, RotateCcw, Search } from "lucide-react";
import type { AuditLogItem, AuditLogsResponse } from "../../../packages/shared/src/types";
import { Badge, statusToBadgeVariant } from "../shared/Badge";
import { Button } from "../shared/Button";
import { DetailDrawer } from "../shared/DetailDrawer";
import { FancyDatePicker } from "../shared/FancyDatePicker";

export type AuditFilterState = {
  search: string;
  action: string;
  from: string;
  to: string;
  page: number;
  entityType: "reservation";
};

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function toExplorerUrl(hash?: string | null) {
  if (!hash) return null;
  return `https://sepolia.etherscan.io/tx/${hash}`;
}

function shortValue(value?: string | null, size = 12) {
  if (!value) return "--";
  if (value.length <= size) return value;
  return `${value.slice(0, Math.max(6, Math.floor(size / 2)))}...${value.slice(-6)}`;
}

type Props = {
  data: AuditLogsResponse | null;
  loading: boolean;
  error: string | null;
  filters: AuditFilterState;
  onChangeFilters: (next: Partial<AuditFilterState>) => void;
  onApplyFilters: () => void;
  onResetFilters: () => void;
  onRefresh: () => void;
  onPageChange: (page: number) => void;
};

export function AuditLogsPanel({
  data,
  loading,
  error,
  filters,
  onChangeFilters,
  onApplyFilters,
  onResetFilters,
  onRefresh,
  onPageChange,
}: Props) {
  const [selectedLog, setSelectedLog] = useState<AuditLogItem | null>(null);
  const totalPages = useMemo(() => {
    if (!data) return 1;
    return Math.max(1, Math.ceil((data.count || 0) / (data.limit || 10)));
  }, [data]);
  const hasActiveFilter = Boolean(filters.search || filters.action);

  return (
    <section className="surface p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-[var(--color-text)]">Audit Logs</h2>
          <p className="text-sm text-[var(--color-muted)]">Reservation-first searchable log trail with hash references.</p>
        </div>
        <Button variant="secondary" size="md" onClick={onRefresh} loading={loading}>
          Refresh
        </Button>
      </div>

      <form
        className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-[var(--color-border)] bg-slate-50 p-3 sm:grid-cols-2 md:grid-cols-6 2xl:grid-cols-12"
        onSubmit={(event) => {
          event.preventDefault();
          onApplyFilters();
        }}
      >
        <label className="grid min-w-0 gap-1 text-xs text-[var(--color-muted)] sm:col-span-2 md:col-span-6 2xl:col-span-3">
          Search
          <span className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-muted)]" />
            <input
              type="text"
              value={filters.search}
              onChange={(event) => onChangeFilters({ search: event.target.value })}
              placeholder="reservation id or data hash"
              className="h-10 w-full rounded-xl border border-[var(--color-border)] bg-white pl-9 pr-3 text-sm text-[var(--color-text)]"
            />
          </span>
        </label>

        <label className="grid min-w-0 gap-1 text-xs text-[var(--color-muted)] md:col-span-2 2xl:col-span-2">
          Action
          <select
            value={filters.action}
            onChange={(event) => onChangeFilters({ action: event.target.value })}
            className="h-10 rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm text-[var(--color-text)]"
          >
            <option value="">All</option>
            <option value="create">create</option>
            <option value="update">update</option>
            <option value="cancel">cancel</option>
            <option value="checkin">checkin</option>
            <option value="checkout">checkout</option>
            <option value="verify">verify</option>
            <option value="reject">reject</option>
            <option value="override_checkin">override_checkin</option>
          </select>
        </label>

        <div className="min-w-0 md:col-span-2 2xl:col-span-2">
          <FancyDatePicker
            label="From"
            value={filters.from}
            onChange={(next) => onChangeFilters({ from: next })}
            max={filters.to || undefined}
          />
        </div>

        <div className="min-w-0 md:col-span-2 2xl:col-span-2">
          <FancyDatePicker
            label="To"
            value={filters.to}
            onChange={(next) => onChangeFilters({ to: next })}
            min={filters.from || undefined}
            popoverAlign="end"
          />
        </div>

        <div className="flex min-w-0 items-end gap-2 sm:col-span-2 md:col-span-6 2xl:col-span-3 2xl:justify-end">
          <Button type="submit" size="md" className="h-10 min-w-[84px] flex-1 2xl:flex-none">Apply</Button>
          <Button
            type="button"
            variant="secondary"
            size="md"
            onClick={onResetFilters}
            className="h-10 min-w-[84px] flex-1 px-2.5 2xl:flex-none"
            leftSlot={<RotateCcw className="h-4 w-4" />}
          >
            Reset
          </Button>
        </div>
      </form>

      {error ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <div className="mt-4 overflow-hidden rounded-xl border border-[var(--color-border)]">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50 text-[var(--color-muted)]">
              <tr>
                <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.08em]">Time</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.08em]">Actor</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.08em]">Action</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.08em]">Entity</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.08em]">Data Hash</th>
                <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.08em]">Tx Hash</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, index) => (
                  <tr key={`audit-skeleton-${index}`} className="border-t border-[var(--color-border)]">
                    <td className="px-3 py-2"><div className="skeleton h-4 w-24" /></td>
                    <td className="px-3 py-2"><div className="skeleton h-4 w-20" /></td>
                    <td className="px-3 py-2"><div className="skeleton h-4 w-16" /></td>
                    <td className="px-3 py-2"><div className="skeleton h-4 w-20" /></td>
                    <td className="px-3 py-2"><div className="skeleton h-4 w-32" /></td>
                    <td className="px-3 py-2"><div className="skeleton h-4 w-28" /></td>
                  </tr>
                ))
              ) : !data || data.items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-sm text-[var(--color-muted)]">
                    {hasActiveFilter ? "No logs matched the current filters." : "No audit logs found yet."}
                  </td>
                </tr>
              ) : (
                data.items.map((log) => (
                  <tr
                    key={log.audit_id}
                    tabIndex={0}
                    role="button"
                    className="cursor-pointer border-t border-[var(--color-border)] transition hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none"
                    onClick={() => setSelectedLog(log)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedLog(log);
                      }
                    }}
                  >
                    <td className="sticky left-0 z-[1] bg-white px-3 py-2 text-xs text-[var(--color-muted)]">{formatDateTime(log.timestamp)}</td>
                    <td className="px-3 py-2 text-xs text-[var(--color-text)]">
                      {log.performed_by?.name || log.performed_by?.email || shortValue(log.performed_by_user_id, 10)}
                    </td>
                    <td className="px-3 py-2"><Badge label={log.action} variant={statusToBadgeVariant(log.action)} /></td>
                    <td className="px-3 py-2 font-mono text-xs text-[var(--color-text)]">{shortValue(log.entity_id, 16)}</td>
                    <td className="px-3 py-2 font-mono text-xs text-[var(--color-text)]">{shortValue(log.data_hash, 20)}</td>
                    <td className="px-3 py-2 font-mono text-xs text-[var(--color-text)]">
                      {log.blockchain_tx_hash ? (
                        <a
                          href={toExplorerUrl(log.blockchain_tx_hash) || "#"}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 underline"
                          onClick={(event) => event.stopPropagation()}
                        >
                          {shortValue(log.blockchain_tx_hash, 18)}
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      ) : (
                        "--"
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {data ? (
          <div className="flex items-center justify-between border-t border-[var(--color-border)] bg-slate-50 px-3 py-3">
            <p className="text-xs text-[var(--color-muted)]">
              Page {filters.page} of {totalPages} | {data.count} total
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={filters.page <= 1 || loading}
                onClick={() => onPageChange(Math.max(1, filters.page - 1))}
              >
                Previous
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={filters.page >= totalPages || loading}
                onClick={() => onPageChange(Math.min(totalPages, filters.page + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <DetailDrawer
        open={Boolean(selectedLog)}
        onClose={() => setSelectedLog(null)}
        title={selectedLog ? `Audit ${selectedLog.action}` : "Audit details"}
        subtitle={selectedLog ? selectedLog.audit_id : undefined}
      >
        {selectedLog ? (
          <div className="space-y-3 text-sm">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Timestamp" value={formatDateTime(selectedLog.timestamp)} />
              <Field label="Actor" value={selectedLog.performed_by?.name || selectedLog.performed_by?.email || selectedLog.performed_by_user_id || "--"} />
              <Field label="Entity type" value={selectedLog.entity_type} />
              <Field label="Entity id" value={selectedLog.entity_id} mono />
              <Field label="Data hash" value={selectedLog.data_hash} mono />
              <Field label="Blockchain tx hash" value={selectedLog.blockchain_tx_hash || "--"} mono />
            </div>
            <div className="rounded-xl border border-[var(--color-border)] bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--color-muted)]">Metadata</p>
              <pre className="mt-2 overflow-x-auto text-xs text-[var(--color-text)]">
                {JSON.stringify(selectedLog.metadata || {}, null, 2)}
              </pre>
            </div>
          </div>
        ) : null}
      </DetailDrawer>
    </section>
  );
}

function Field({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-white p-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[var(--color-muted)]">{label}</p>
      <p className={`mt-1 text-sm text-[var(--color-text)] ${mono ? "font-mono text-xs break-all" : ""}`}>{value}</p>
    </div>
  );
}
