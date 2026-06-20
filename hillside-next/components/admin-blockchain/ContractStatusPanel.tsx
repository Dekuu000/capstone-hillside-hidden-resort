"use client";

import Link from "next/link";
import { ExternalLink, RefreshCw } from "lucide-react";
import type { ChainKey, ContractStatusResponse } from "../../../packages/shared/src/types";
import { buildTxExplorerUrlFromBase, normalizeTxHash, shortHash } from "../../lib/chainExplorer";
import { formatDateTime } from "../../lib/dateDisplay";
import { Badge, statusToBadgeVariant } from "../shared/Badge";
import { Button } from "../shared/Button";
import { Select } from "../shared/Select";
import { StatCard } from "../shared/StatCard";

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
      ? `Cached snapshot - ${formatDateTime(gas.last_updated_at, {
          locale: "en-PH",
          formatOptions: {
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          },
          fallback: "--",
        })}`
      : gas?.source === "live"
        ? `Live RPC - ${formatDateTime(gas.last_updated_at, {
            locale: "en-PH",
            formatOptions: {
              month: "short",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit",
            },
            fallback: "--",
          })}`
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
          <div className="min-w-[130px]">
            <Select
              ariaLabel="Chain"
              value={chainKey}
              onChange={(next) => onChangeChain(next as ChainKey)}
              options={enabledChains.map((chain) => ({ value: chain, label: chain }))}
            />
          </div>
          <div className="min-w-[140px]">
            <Select
              ariaLabel="Window"
              value={String(windowDays)}
              onChange={(next) => onChangeWindow(Number(next) as 7 | 14 | 30)}
              options={[
                { value: "7", label: "Last 7 days" },
                { value: "14", label: "Last 14 days" },
                { value: "30", label: "Last 30 days" },
              ]}
            />
          </div>
          <div className="min-w-[110px]">
            <Select
              ariaLabel="Rows"
              value={String(contractLimit)}
              onChange={(next) => onChangeLimit(Number(next) as 5 | 10 | 20)}
              options={[
                { value: "5", label: "5 rows" },
                { value: "10", label: "10 rows" },
                { value: "20", label: "20 rows" },
              ]}
            />
          </div>
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
        <div className="flex flex-col gap-2 border-b border-[var(--color-border)] bg-[var(--color-background)] px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-[var(--color-text)]">Recent successful escrow transactions</p>
            <p className="text-xs text-[var(--color-muted)]">
              As of{" "}
              {formatDateTime(data?.as_of, {
                locale: "en-PH",
                formatOptions: {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                },
                fallback: "--",
              })}
            </p>
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
                    const explorerHref = buildTxExplorerUrlFromBase(data.explorer_base_url, row.chain_tx_hash);
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
                                  {shortHash(normalizedHash, 8, 6)}
                                </span>
                                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                                <span className="pointer-events-none absolute bottom-full left-0 z-20 mb-1.5 hidden rounded-md bg-[#1e2b3f] px-2 py-1 font-mono text-[11px] text-slate-100 shadow-lg group-hover:block group-focus-visible:block">
                                  {normalizedHash || row.chain_tx_hash}
                                </span>
                              </a>
                            </span>
                          ) : (
                            shortHash(normalizedHash || row.chain_tx_hash || "--", 8, 6)
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs text-[var(--color-muted)]">
                          {formatDateTime(row.updated_at, {
                            locale: "en-PH",
                            formatOptions: {
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            },
                            fallback: "--",
                          })}
                        </td>
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
