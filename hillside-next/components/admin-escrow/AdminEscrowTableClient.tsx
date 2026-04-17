"use client";

import { useMemo, useState } from "react";
import { ExternalLink } from "lucide-react";
import type { EscrowReconciliationItem } from "../../../packages/shared/src/types";
import { DetailDrawer } from "../shared/DetailDrawer";

function resultClass(value: EscrowReconciliationItem["result"]) {
  if (value === "match") return "bg-emerald-100 text-emerald-700";
  if (value === "mismatch") return "bg-amber-100 text-amber-800";
  if (value === "missing_onchain") return "bg-rose-100 text-rose-700";
  return "bg-slate-200 text-slate-700";
}

function explorerUrl(chainKey: string | null | undefined, txHash: string | null | undefined) {
  if (!txHash) return null;
  if ((chainKey || "").toLowerCase() === "amoy") return `https://amoy.polygonscan.com/tx/${txHash}`;
  return `https://sepolia.etherscan.io/tx/${txHash}`;
}

function shortTxHash(value: string, head = 10, tail = 9) {
  if (value.length <= head + tail + 3) return value;
  return `${value.slice(0, head)}...${value.slice(-tail)}`;
}

function formatDateTime(value?: string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleString("en-PH", {
    month: "numeric",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function AdminEscrowTableClient({
  items,
  lastReconciledAt,
  initialStateFilter = "all",
  initialResultFilter = "all",
}: {
  items: EscrowReconciliationItem[];
  lastReconciledAt?: string | null;
  initialStateFilter?: string;
  initialResultFilter?: string;
}) {
  const [selectedState, setSelectedState] = useState<string>(initialStateFilter);
  const [selectedResult, setSelectedResult] = useState<string>(initialResultFilter);
  const [selectedItem, setSelectedItem] = useState<EscrowReconciliationItem | null>(null);

  const filtered = useMemo(() => {
    return items.filter((item) => {
      const statePass = selectedState === "all" || item.db_escrow_state === selectedState;
      const resultPass = selectedResult === "all" || item.result === selectedResult;
      return statePass && resultPass;
    });
  }, [items, selectedState, selectedResult]);

  return (
    <>
      <div className="mb-4 grid gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm sm:grid-cols-2">
        <label className="grid gap-1 text-xs text-[var(--color-muted)]">
          State
          <select
            value={selectedState}
            onChange={(event) => setSelectedState(event.target.value)}
            className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text)]"
          >
            <option value="all">All</option>
            <option value="pending_lock">pending_lock</option>
            <option value="locked">locked</option>
            <option value="released">released</option>
            <option value="refunded">refunded</option>
            <option value="failed">failed</option>
          </select>
        </label>
        <label className="grid gap-1 text-xs text-[var(--color-muted)]">
          Result
          <select
            value={selectedResult}
            onChange={(event) => setSelectedResult(event.target.value)}
            className="rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm text-[var(--color-text)]"
          >
            <option value="all">All</option>
            <option value="match">match</option>
            <option value="mismatch">mismatch</option>
            <option value="missing_onchain">missing_onchain</option>
            <option value="skipped">skipped</option>
          </select>
        </label>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-sm text-[var(--color-muted)] shadow-sm">
          No escrow rows match the selected filters.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-slate-50 text-[var(--color-muted)]">
                <tr>
                  <th className="px-4 py-3 font-semibold">Reservation Code</th>
                  <th className="px-4 py-3 font-semibold">DB State</th>
                  <th className="px-4 py-3 font-semibold">On-chain State</th>
                  <th className="px-4 py-3 font-semibold">Result</th>
                  <th className="px-4 py-3 font-semibold">Lock Tx</th>
                  <th className="px-4 py-3 font-semibold">Release Tx</th>
                  <th className="px-4 py-3 font-semibold">Reservation Updated</th>
                  <th className="px-4 py-3 font-semibold">Reconciled At</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const lockHref = explorerUrl(item.chain_key, item.chain_tx_hash);
                  return (
                    <tr
                      key={item.reservation_id}
                      className="cursor-pointer border-t border-slate-100 hover:bg-slate-50"
                      onClick={() => setSelectedItem(item)}
                    >
                      <td className="px-4 py-3">
                        <p className="font-semibold text-[var(--color-text)]">{item.reservation_code}</p>
                        <p className="font-mono text-xs text-[var(--color-muted)]">{item.reservation_id}</p>
                      </td>
                      <td className="px-4 py-3">{item.db_escrow_state}</td>
                      <td className="px-4 py-3">{item.onchain_state || "-"}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${resultClass(item.result)}`}>{item.result}</span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">
                        {item.chain_tx_hash && lockHref ? (
                          <span className="relative inline-flex items-center">
                            <a
                              href={lockHref}
                              target="_blank"
                              rel="noreferrer"
                              onClick={(event) => event.stopPropagation()}
                              className="group inline-flex items-center gap-1 text-[var(--color-secondary)]"
                              aria-label={item.chain_tx_hash}
                            >
                              <span className="rounded border border-amber-300 bg-amber-100 px-1.5 py-0.5 font-mono text-xs text-blue-800">
                                {shortTxHash(item.chain_tx_hash)}
                              </span>
                              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                              <span className="pointer-events-none absolute bottom-full left-0 z-20 mb-1.5 hidden rounded-md bg-[#1e2b3f] px-2 py-1 font-mono text-[11px] text-slate-100 shadow-lg group-hover:block group-focus-visible:block">
                                {item.chain_tx_hash}
                              </span>
                            </a>
                          </span>
                        ) : (
                          "-"
                        )}
                      </td>
                      <td className="px-4 py-3 text-xs text-[var(--color-muted)]">
                        {/* TODO: API currently exposes a single chain_tx_hash field. Add release_tx_hash when backend payload supports it. */}
                        -
                      </td>
                      <td className="px-4 py-3 text-xs text-[var(--color-muted)]">
                        {formatDateTime(item.reservation_updated_at)}
                      </td>
                      <td className="px-4 py-3 text-xs text-[var(--color-muted)]">
                        {formatDateTime(lastReconciledAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <DetailDrawer
        open={Boolean(selectedItem)}
        title={selectedItem ? `Escrow Detail · ${selectedItem.reservation_code}` : "Escrow Detail"}
        subtitle={selectedItem?.reservation_id}
        onClose={() => setSelectedItem(null)}
        size="md"
      >
        {selectedItem ? (
          <dl className="grid gap-3 text-sm">
            <div className="rounded-lg border border-[var(--color-border)] p-3">
              <dt className="text-xs text-[var(--color-muted)]">DB State</dt>
              <dd className="font-semibold text-[var(--color-text)]">{selectedItem.db_escrow_state}</dd>
            </div>
            <div className="rounded-lg border border-[var(--color-border)] p-3">
              <dt className="text-xs text-[var(--color-muted)]">On-chain State</dt>
              <dd className="font-semibold text-[var(--color-text)]">{selectedItem.onchain_state || "-"}</dd>
            </div>
            <div className="rounded-lg border border-[var(--color-border)] p-3">
              <dt className="text-xs text-[var(--color-muted)]">Result</dt>
              <dd className="font-semibold text-[var(--color-text)]">{selectedItem.result}</dd>
            </div>
            <div className="rounded-lg border border-[var(--color-border)] p-3">
              <dt className="text-xs text-[var(--color-muted)]">Lock Tx Hash</dt>
              <dd className="font-mono text-xs text-[var(--color-text)] break-all">{selectedItem.chain_tx_hash || "-"}</dd>
            </div>
            <div className="rounded-lg border border-[var(--color-border)] p-3">
              <dt className="text-xs text-[var(--color-muted)]">On-chain Booking ID</dt>
              <dd className="font-mono text-xs text-[var(--color-text)] break-all">{selectedItem.onchain_booking_id || "-"}</dd>
            </div>
            <div className="rounded-lg border border-[var(--color-border)] p-3">
              <dt className="text-xs text-[var(--color-muted)]">Reason</dt>
              <dd className="text-[var(--color-text)]">{selectedItem.reason || "-"}</dd>
            </div>
          </dl>
        ) : null}
      </DetailDrawer>
    </>
  );
}
