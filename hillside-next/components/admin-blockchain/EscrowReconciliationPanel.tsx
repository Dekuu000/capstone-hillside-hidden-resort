"use client";

import { Info, RefreshCw } from "lucide-react";
import type { ChainKey, EscrowReconciliationResponse } from "../../../packages/shared/src/types";
import { formatDateTime } from "../../lib/dateDisplay";
import { AdminEscrowTableClient } from "../admin-escrow/AdminEscrowTableClient";
import { Button } from "../shared/Button";
import { Pagination } from "../shared/Pagination";
import { Select } from "../shared/Select";
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
  const canGoPrevious = pageOffset > 0;
  const canGoNext = Boolean(data?.has_more);

  // Shadow mode: on-chain locking is disabled, so escrows are recorded off-chain
  // with placeholder "shadow-" tx hashes. "Missing on-chain" rows are expected,
  // not failures — detect it so we can present this calmly instead of as an alert.
  const mismatch = data?.summary.mismatch ?? 0;
  const missingOnchain = data?.summary.missing_onchain ?? 0;
  const isShadowMode =
    mismatch === 0 &&
    missingOnchain > 0 &&
    (data?.items ?? []).every(
      (item) =>
        item.result !== "missing_onchain" || !item.chain_tx_hash || item.chain_tx_hash.startsWith("shadow-"),
    );

  return (
    <section className="surface p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-[var(--color-text)]">Reconciliation</h2>
          <p className="text-sm text-[var(--color-muted)]">Exception-first view for escrow mismatches and missing on-chain rows.</p>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
          <div className="min-w-0 sm:min-w-[130px]">
            <Select
              ariaLabel="Chain"
              value={chainKey}
              onChange={(next) => onChangeChain(next as ChainKey)}
              options={enabledChains.map((chain) => ({ value: chain, label: chain }))}
            />
          </div>
          <Button
            variant="secondary"
            size="md"
            onClick={onRefresh}
            loading={loading}
            leftSlot={<RefreshCw className="h-4 w-4" />}
            className="w-full sm:w-auto"
          >
            Refresh
          </Button>
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {isShadowMode ? (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2.5 text-sm text-[var(--color-text)]">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-secondary)]" aria-hidden="true" />
          <p>
            <span className="font-semibold">Shadow mode is on.</span> On-chain locking is disabled, so escrows are recorded
            off-chain with placeholder references. The <span className="font-semibold">{missingOnchain}</span> “missing
            on-chain” {missingOnchain === 1 ? "row is" : "rows are"} expected here — not an error. Enable on-chain locking to
            settle them on the chain.
          </p>
        </div>
      ) : null}

      {data?.cached === false || data?.in_progress ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Reconciliation cache is warming up. Results may be partial while background processing finishes.
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Total"
          value={String(data?.summary.total ?? 0)}
          hint={`As of ${formatDateTime(data?.last_reconciled_at, {
            locale: "en-PH",
            formatOptions: {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            },
          })}`}
          tone="neutral"
        />
        <StatCard label="Mismatch" value={String(data?.summary.mismatch ?? 0)} hint="Needs review" tone={(data?.summary.mismatch ?? 0) > 0 ? "warn" : "neutral"} />
        <StatCard
          label="Missing On-chain"
          value={String(data?.summary.missing_onchain ?? 0)}
          hint={isShadowMode ? "Expected in shadow mode" : "Potential chain/data gap"}
          tone={isShadowMode ? "info" : missingOnchain > 0 ? "warn" : "neutral"}
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
            <div className="mt-4 border-t border-[var(--color-border)] px-1 pt-3">
              <Pagination
                page={Math.floor(pageOffset / pageLimit) + 1}
                totalPages={Math.max(1, Math.ceil(totalCount / Math.max(1, pageLimit)))}
                totalCount={totalCount}
                pageSize={pageLimit}
                hasPrev={canGoPrevious}
                hasNext={canGoNext}
                disabled={loading}
                onPageChange={(target) => onPageChange(Math.max(0, (target - 1) * pageLimit))}
              />
            </div>
          </>
        )}
      </div>
    </section>
  );
}
