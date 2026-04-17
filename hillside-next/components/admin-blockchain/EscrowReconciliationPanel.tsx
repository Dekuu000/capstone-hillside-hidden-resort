"use client";

import { RefreshCw } from "lucide-react";
import type { ChainKey, EscrowReconciliationResponse } from "../../../packages/shared/src/types";
import { AdminEscrowTableClient } from "../admin-escrow/AdminEscrowTableClient";
import { Button } from "../shared/Button";
import { StatCard } from "../shared/StatCard";

type Props = {
  data: EscrowReconciliationResponse | null;
  loading: boolean;
  error: string | null;
  chainKey: ChainKey;
  enabledChains: ChainKey[];
  onChangeChain: (value: ChainKey) => void;
  onRefresh: () => void;
  onPageChange: (offset: number) => void;
};

function formatDateTime(value?: string | null) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "--";
  return date.toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function EscrowReconciliationPanel({
  data,
  loading,
  error,
  chainKey,
  enabledChains,
  onChangeChain,
  onRefresh,
  onPageChange,
}: Props) {
  const defaultResultFilter =
    (data?.summary.mismatch ?? 0) > 0
      ? "mismatch"
      : (data?.summary.missing_onchain ?? 0) > 0
        ? "missing_onchain"
        : "all";
  const pageOffset = data?.offset ?? 0;
  const pageLimit = data?.limit ?? 10;
  const totalCount = data?.count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageLimit));
  const currentPage = Math.floor(pageOffset / pageLimit) + 1;
  const canGoPrevious = pageOffset > 0;
  const canGoNext = Boolean(data?.has_more);

  return (
    <section className="surface p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-[var(--color-text)]">Reconciliation</h2>
          <p className="text-sm text-[var(--color-muted)]">Exception-first view for escrow mismatches and missing on-chain rows.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="reconciliation-chain-key">Chain</label>
          <select
            id="reconciliation-chain-key"
            value={chainKey}
            onChange={(event) => onChangeChain(event.target.value as ChainKey)}
            className="h-11 min-w-[120px] rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm font-semibold text-[var(--color-text)]"
          >
            {enabledChains.map((chain) => (
              <option key={chain} value={chain}>
                {chain}
              </option>
            ))}
          </select>
          <Button variant="secondary" size="md" onClick={onRefresh} loading={loading} leftSlot={<RefreshCw className="h-4 w-4" />}>
            Refresh
          </Button>
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {data?.cached === false || data?.in_progress ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Reconciliation cache is warming up. Results may be partial while background processing finishes.
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <StatCard label="Total" value={String(data?.summary.total ?? 0)} hint={`As of ${formatDateTime(data?.last_reconciled_at)}`} tone="neutral" />
        <StatCard label="Mismatch" value={String(data?.summary.mismatch ?? 0)} hint="Needs review" tone={(data?.summary.mismatch ?? 0) > 0 ? "warn" : "neutral"} />
        <StatCard
          label="Missing On-chain"
          value={String(data?.summary.missing_onchain ?? 0)}
          hint="Potential chain/data gap"
          tone={(data?.summary.missing_onchain ?? 0) > 0 ? "warn" : "neutral"}
        />
        <StatCard label="Match" value={String(data?.summary.match ?? 0)} hint="Healthy rows" tone="success" />
        <StatCard label="Skipped" value={String(data?.summary.skipped ?? 0)} hint="Intentionally ignored" tone="info" />
      </div>

      <div className="mt-4">
        {loading && !data ? (
          <div className="space-y-2 rounded-xl border border-[var(--color-border)] bg-white p-4">
            <div className="skeleton h-10 w-full" />
            <div className="skeleton h-10 w-full" />
            <div className="skeleton h-10 w-full" />
          </div>
        ) : !data ? (
          <div className="rounded-xl border border-[var(--color-border)] bg-white px-4 py-6 text-sm text-[var(--color-muted)]">
            No reconciliation data available yet.
          </div>
        ) : (
          <>
            <AdminEscrowTableClient
              items={data.items}
              lastReconciledAt={data.last_reconciled_at}
              initialResultFilter={defaultResultFilter}
            />
            <div className="mt-4 flex items-center justify-between border-t border-[var(--color-border)] px-1 pt-3">
              <p className="text-xs text-[var(--color-muted)]">
                Page {currentPage} of {totalPages} | {totalCount} total
              </p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={!canGoPrevious || loading}
                  onClick={() => onPageChange(Math.max(0, pageOffset - pageLimit))}
                >
                  Previous
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={!canGoNext || loading}
                  onClick={() => onPageChange(pageOffset + pageLimit)}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
