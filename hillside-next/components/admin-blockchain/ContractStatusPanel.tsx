"use client";

import Link from "next/link";
import { ExternalLink, RefreshCw } from "lucide-react";
import type { ChainKey, ContractStatusResponse } from "../../../packages/shared/src/types";
import { Badge, statusToBadgeVariant } from "../shared/Badge";
import { Button } from "../shared/Button";
import { StatCard } from "../shared/StatCard";

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

function shortHash(hash: string) {
  if (!hash) return "--";
  if (hash.length <= 14) return hash;
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
}

function normalizeTxHash(value: string | null | undefined) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const exact = raw.match(/^0x[a-fA-F0-9]{64}$/);
  if (exact) return exact[0];
  const embedded = raw.match(/0x[a-fA-F0-9]{64}/);
  return embedded?.[0] ?? raw;
}

function buildExplorerTxHref(explorerBaseUrl: string, txHash: string | null | undefined) {
  const normalizedHash = normalizeTxHash(txHash);
  if (!normalizedHash) return null;
  const base = String(explorerBaseUrl || "").trim().replace(/\/+$/, "");
  if (!base) return null;
  const txIndex = base.indexOf("/tx/");
  if (txIndex >= 0) {
    return `${base.slice(0, txIndex)}/tx/${normalizedHash}`;
  }
  if (base.endsWith("/tx")) {
    return `${base}/${normalizedHash}`;
  }
  return `${base}/tx/${normalizedHash}`;
}

type Props = {
  data: ContractStatusResponse | null;
  loading: boolean;
  error: string | null;
  chainKey: ChainKey;
  windowDays: 7 | 14 | 30;
  onChangeChain: (value: ChainKey) => void;
  onChangeWindow: (value: 7 | 14 | 30) => void;
  contractLimit: 5 | 10 | 20;
  onChangeLimit: (value: 5 | 10 | 20) => void;
  onRefresh: () => void;
  onPageChange: (offset: number) => void;
};

export function ContractStatusPanel({
  data,
  loading,
  error,
  chainKey,
  windowDays,
  onChangeChain,
  onChangeWindow,
  contractLimit,
  onChangeLimit,
  onRefresh,
  onPageChange,
}: Props) {
  const enabledChains = data?.enabled_chain_keys?.length
    ? data.enabled_chain_keys
    : ([chainKey] as ChainKey[]);
  const gas = data?.gas;
  const gasValue =
    gas?.base_fee_gwei != null || gas?.priority_fee_gwei != null
      ? `${gas.base_fee_gwei ?? 0} / ${gas.priority_fee_gwei ?? 0} gwei`
      : "Unavailable";
  const gasHint =
    gas?.source === "cached"
      ? `Cached snapshot - ${formatDateTime(gas.last_updated_at)}`
      : gas?.source === "live"
        ? `Live RPC - ${formatDateTime(gas.last_updated_at)}`
        : gas?.note || "RPC unavailable";

  const rowsCount = data?.recent_successful_txs.length ?? 0;
  const pageOffset = data?.offset ?? 0;
  const pageLimit = data?.limit ?? 10;
  const totalCount = (data?.count ?? 0) > 0 ? (data?.count ?? 0) : rowsCount;
  const hasMore = data?.has_more ?? false;
  const pageStart = totalCount === 0 ? 0 : pageOffset + 1;
  const pageEnd = totalCount === 0 ? 0 : Math.min(pageOffset + (data?.recent_successful_txs.length ?? 0), totalCount);
  const canGoPrevious = pageOffset > 0;
  const canGoNext = hasMore;

  return (
    <section className="surface p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-[var(--color-text)]">Contract Status</h2>
          <p className="text-sm text-[var(--color-muted)]">Escrow chain health and recent successful on-chain settlements.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="sr-only" htmlFor="contract-chain-key">Chain</label>
          <select
            id="contract-chain-key"
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
          <label className="sr-only" htmlFor="contract-window-days">Window</label>
          <select
            id="contract-window-days"
            value={windowDays}
            onChange={(event) => onChangeWindow(Number(event.target.value) as 7 | 14 | 30)}
            className="h-11 min-w-[120px] rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm font-semibold text-[var(--color-text)]"
          >
            <option value={7}>Last 7 days</option>
            <option value={14}>Last 14 days</option>
            <option value={30}>Last 30 days</option>
          </select>
          <label className="sr-only" htmlFor="contract-page-size">Rows</label>
          <select
            id="contract-page-size"
            value={contractLimit}
            onChange={(event) => onChangeLimit(Number(event.target.value) as 5 | 10 | 20)}
            className="h-11 min-w-[96px] rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm font-semibold text-[var(--color-text)]"
          >
            <option value={5}>5 rows</option>
            <option value={10}>10 rows</option>
            <option value={20}>20 rows</option>
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

      {gas?.source === "unavailable" ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          Live gas snapshot unavailable. Transaction metrics still reflect database state.
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        <StatCard
          label="Gas Fees (base / priority)"
          value={gasValue}
          hint={gasHint}
          tone={gas?.source === "unavailable" ? "warn" : gas?.source === "cached" ? "info" : "neutral"}
        />
        <StatCard
          label="Successful Transactions"
          value={String(data?.successful_tx_count ?? 0)}
          hint={`Escrow-only in ${windowDays}-day window`}
          tone="success"
        />
        <StatCard
          label="Pending Escrows"
          value={String(data?.pending_escrows_count ?? 0)}
          hint="State: pending_lock"
          tone={data && data.pending_escrows_count > 0 ? "warn" : "neutral"}
        />
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-[var(--color-border)]">
        <div className="flex flex-col gap-2 border-b border-[var(--color-border)] bg-slate-50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-[var(--color-text)]">Recent successful escrow transactions</p>
            <p className="text-xs text-[var(--color-muted)]">As of {formatDateTime(data?.as_of)}</p>
          </div>
          <Link
            href="/admin/blockchain?tab=reconciliation"
            className="inline-flex h-10 items-center justify-center rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm font-semibold text-[var(--color-text)]"
          >
            Open reconciliation
          </Link>
        </div>

        {loading ? (
          <div className="space-y-2 p-3">
            <div className="skeleton h-10 w-full" />
            <div className="skeleton h-10 w-full" />
            <div className="skeleton h-10 w-full" />
          </div>
        ) : !data || data.recent_successful_txs.length === 0 ? (
          <div className="px-4 py-6 text-sm text-[var(--color-muted)]">No escrow transactions in the selected window.</div>
        ) : (
          <div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-white text-[var(--color-muted)]">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.08em]">Reservation</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.08em]">State</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.08em]">Tx Hash</th>
                    <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.08em]">Updated</th>
                  </tr>
                </thead>
                <tbody>
                {data.recent_successful_txs.map((row) => {
                    const normalizedHash = normalizeTxHash(row.chain_tx_hash);
                    const explorerHref = buildExplorerTxHref(data.explorer_base_url, row.chain_tx_hash);
                    return (
                      <tr key={`${row.reservation_id}-${row.chain_tx_hash}`} className="border-t border-[var(--color-border)]">
                        <td className="px-3 py-2 font-semibold text-[var(--color-text)]">{row.reservation_code}</td>
                        <td className="px-3 py-2">
                          <Badge label={row.escrow_state} variant={statusToBadgeVariant(row.escrow_state)} />
                        </td>
                        <td className="px-3 py-2 font-mono text-xs text-[var(--color-text)]">
                          {explorerHref ? (
                            <span className="relative inline-flex items-center">
                              <a
                                href={explorerHref}
                                target="_blank"
                                rel="noreferrer"
                                className="group inline-flex items-center gap-1 text-[var(--color-secondary)]"
                                aria-label={normalizedHash || row.chain_tx_hash}
                              >
                                <span className="rounded border border-amber-300 bg-amber-100 px-1.5 py-0.5 font-mono text-xs text-blue-800">
                                  {shortHash(normalizedHash)}
                                </span>
                                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                                <span className="pointer-events-none absolute bottom-full left-0 z-20 mb-1.5 hidden rounded-md bg-[#1e2b3f] px-2 py-1 font-mono text-[11px] text-slate-100 shadow-lg group-hover:block group-focus-visible:block">
                                  {normalizedHash || row.chain_tx_hash}
                                </span>
                              </a>
                            </span>
                          ) : (
                            shortHash(normalizedHash || row.chain_tx_hash)
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-[var(--color-muted)]">{formatDateTime(row.updated_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col gap-2 border-t border-[var(--color-border)] px-3 py-3 text-xs text-[var(--color-muted)] sm:flex-row sm:items-center sm:justify-between">
              <p>
                Showing {pageStart}-{pageEnd} of {totalCount}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!canGoPrevious || loading}
                  onClick={() => onPageChange(Math.max(0, pageOffset - pageLimit))}
                >
                  Previous
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!canGoNext || loading}
                  onClick={() => onPageChange(pageOffset + pageLimit)}
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
