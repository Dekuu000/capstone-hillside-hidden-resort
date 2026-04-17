import Link from "next/link";
import { ExternalLink } from "lucide-react";
import type { ContractStatusResponse } from "../../../packages/shared/src/types";
import { Badge, statusToBadgeVariant } from "../shared/Badge";

function shortHash(value: string) {
  if (!value) return "--";
  if (value.length <= 22) return value;
  return `${value.slice(0, 10)}...${value.slice(-8)}`;
}

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

function normalizeTxHash(value: string | null | undefined) {
  const raw = String(value || "").trim();
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
  if (txIndex >= 0) return `${base.slice(0, txIndex)}/tx/${normalizedHash}`;
  if (base.endsWith("/tx")) return `${base}/${normalizedHash}`;
  return `${base}/tx/${normalizedHash}`;
}

export function LedgerExplorerPanel({
  contractStatus,
  error,
}: {
  contractStatus: ContractStatusResponse | null;
  error?: string | null;
}) {
  const items = contractStatus?.recent_successful_txs ?? [];

  return (
    <section className="surface p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-[var(--color-muted)]">Ledger Explorer</p>
          <h2 className="mt-2 text-xl font-bold text-[var(--color-text)]">Blockchain transaction summary</h2>
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
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {error}
        </div>
      ) : null}

      <div className="mt-4 overflow-hidden rounded-xl border border-[var(--color-border)]">
        {items.length === 0 ? (
          <div className="px-4 py-6 text-sm text-[var(--color-muted)]">No escrow transactions available in the selected window.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 text-[var(--color-muted)]">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.08em]">Reservation</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.08em]">State</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.08em]">Tx Hash</th>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.08em]">Updated</th>
                </tr>
              </thead>
              <tbody>
                {items.slice(0, 6).map((row) => {
                  const explorerHref = buildExplorerTxHref(contractStatus?.explorer_base_url || "", row.chain_tx_hash);
                  const normalizedHash = normalizeTxHash(row.chain_tx_hash);
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
        )}
      </div>
    </section>
  );
}

