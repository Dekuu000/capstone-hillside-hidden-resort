import Link from "next/link";
import { ExternalLink } from "lucide-react";
import type { ContractStatusResponse } from "../../../packages/shared/src/types";
import { buildTxExplorerUrlFromBase, normalizeTxHash, shortHash } from "../../lib/chainExplorer";
import { formatDateTime } from "../../lib/dateDisplay";
import { Badge, statusToBadgeVariant } from "../shared/Badge";

export function LedgerExplorerPanel({
  contractStatus,
  error,
}: {
  contractStatus: ContractStatusResponse | null;
  error?: string | null;
}) {
  const items = contractStatus?.recent_successful_txs ?? [];

  return (
    <section className="surface p-4 shadow-[0_10px_24px_rgba(15,23,42,0.08)] transition-[box-shadow,border-color] duration-200 hover:shadow-[0_14px_30px_rgba(15,23,42,0.12)] sm:p-5 lg:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-muted)]">Ledger Explorer</p>
          <h2 className="mt-2 text-xl font-bold text-[var(--color-text)] lg:text-2xl">Blockchain transaction summary</h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">Simplified ledger feed for accounting verification and settlement tracking.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-1 text-xs font-semibold text-[var(--color-text)]">
            {contractStatus ? `${contractStatus.successful_tx_count} successful (7d)` : "No data"}
          </span>
          <Link
            href="/admin/blockchain"
            className="inline-flex h-10 items-center justify-center rounded-lg border border-[var(--color-border)] bg-white px-3 text-sm font-semibold text-[var(--color-text)]"
          >
            Open Blockchain page
          </Link>
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">{error}</div>
      ) : null}

      <div className="mt-4 overflow-hidden rounded-xl border border-[var(--color-border)]">
        {items.length === 0 ? (
          <div className="px-4 py-6 text-sm text-[var(--color-muted)]">No escrow transactions available in the selected window.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-[var(--color-background)] text-[var(--color-muted)]">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.08em]">Reservation</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.08em]">State</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.08em]">Tx Hash</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.08em]">Updated</th>
                </tr>
              </thead>
              <tbody>
                {items.slice(0, 6).map((row) => {
                  const explorerHref = buildTxExplorerUrlFromBase(contractStatus?.explorer_base_url, row.chain_tx_hash);
                  const normalizedHash = normalizeTxHash(row.chain_tx_hash);
                  return (
                    <tr key={`${row.reservation_id}-${row.chain_tx_hash}`} className="border-t border-[var(--color-border)] bg-white">
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
                              <span className="rounded border border-[var(--color-border)] bg-[var(--color-background)] px-1.5 py-0.5 font-mono text-xs text-[var(--color-text)]">
                                {shortHash(normalizedHash || row.chain_tx_hash || "--")}
                              </span>
                              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                              <span className="pointer-events-none absolute bottom-full left-0 z-20 mb-1.5 hidden rounded-md bg-[#1e2b3f] px-2 py-1 font-mono text-[11px] text-slate-100 shadow-lg group-hover:block group-focus-visible:block">
                                {normalizedHash || row.chain_tx_hash}
                              </span>
                            </a>
                          </span>
                        ) : (
                          shortHash(normalizedHash || row.chain_tx_hash || "--")
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
        )}
      </div>
    </section>
  );
}


