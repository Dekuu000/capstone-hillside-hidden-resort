import type { EscrowLedgerItem } from "../../../packages/shared/src/types";
import { formatPhpPeso as formatPeso } from "../../lib/formatCurrency";
import { formatDateTime } from "../../lib/dateDisplay";

const EVENT_STYLE: Record<string, { label: string; className: string }> = {
  lock: { label: "Locked", className: "border-slate-200 bg-slate-50 text-slate-700" },
  release: { label: "Released", className: "border-emerald-200 bg-emerald-50 text-emerald-800" },
  refund: { label: "Refunded", className: "border-sky-200 bg-sky-50 text-sky-800" },
  forfeit: { label: "Forfeited", className: "border-amber-200 bg-amber-50 text-amber-900" },
};

function prettyReason(reason: string | null | undefined): string {
  if (!reason) return "—";
  return reason.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Read-only feed of escrow money movements (release / refund / forfeit), newest
 * first. Append-only audit trail — see the escrow_ledger table. Server-rendered.
 */
export function EscrowLedgerPanel({ items }: { items: EscrowLedgerItem[] }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-white shadow-sm">
      <div className="border-b border-[var(--color-border)] px-4 py-3">
        <h2 className="text-sm font-semibold text-[var(--color-text)]">Escrow ledger — recent movements</h2>
        <p className="mt-0.5 text-xs text-[var(--color-muted)]">
          Append-only audit trail of deposit releases, refunds, and forfeits (no-shows / cancellations).
        </p>
      </div>

      {items.length === 0 ? (
        <p className="px-4 py-6 text-sm text-[var(--color-muted)]">No escrow movements recorded yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-[var(--color-border)] text-left text-xs uppercase tracking-wide text-[var(--color-muted)]">
                <th className="px-4 py-2 font-semibold">When</th>
                <th className="px-4 py-2 font-semibold">Reservation</th>
                <th className="px-4 py-2 font-semibold">Event</th>
                <th className="px-4 py-2 text-right font-semibold">Amount</th>
                <th className="px-4 py-2 font-semibold">Reason</th>
                <th className="px-4 py-2 font-semibold">By</th>
              </tr>
            </thead>
            <tbody>
              {items.map((row) => {
                const style = EVENT_STYLE[row.event] ?? EVENT_STYLE.lock;
                return (
                  <tr key={row.ledger_id} className="border-b border-[var(--color-border)] last:border-0">
                    <td className="whitespace-nowrap px-4 py-2.5 text-[var(--color-muted)]">
                      {formatDateTime(row.created_at ?? "", { fallback: "—" })}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 font-semibold text-[var(--color-text)]">
                      {row.reservation_code || "—"}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${style.className}`}>
                        {style.label}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-right font-semibold tabular-nums text-[var(--color-text)]">
                      {row.amount != null ? formatPeso(row.amount) : "—"}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-[var(--color-text)]">{prettyReason(row.reason)}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 capitalize text-[var(--color-muted)]">
                      {row.actor_role || "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
