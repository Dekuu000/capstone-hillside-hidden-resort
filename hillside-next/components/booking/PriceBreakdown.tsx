import { formatPhpPeso } from "../../lib/formatCurrency";
import { computeStayDepositPreview } from "../../../packages/shared/src/types";

type PriceBreakdownProps = {
  nightlyRate: number;
  nights: number;
  guests: number;
};

/**
 * Live price breakdown. Mirrors the real resort model: total = nightly × nights,
 * with a GCash deposit due now (computeStayDepositPreview) and the balance at check-in.
 * No cleaning/service fees — the resort doesn't charge them.
 */
export function PriceBreakdown({ nightlyRate, nights, guests }: PriceBreakdownProps) {
  const safeNights = Math.max(0, nights);
  const total = nightlyRate * safeNights;
  const deposit = computeStayDepositPreview(total);
  const balance = Math.max(0, total - deposit);

  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-center justify-between">
        <span className="muted-text">
          {formatPhpPeso(nightlyRate)} × {safeNights} {safeNights === 1 ? "night" : "nights"}
          <span className="muted-text"> · {guests} {guests === 1 ? "guest" : "guests"}</span>
        </span>
        <span>{formatPhpPeso(total)}</span>
      </div>
      <div className="flex items-center justify-between border-t border-[var(--color-border)] pt-2 font-semibold text-[var(--color-text)]">
        <span>Total</span>
        <span>{formatPhpPeso(total)}</span>
      </div>
      <div className="mt-2 space-y-1 rounded-xl bg-[color:color-mix(in_srgb,var(--color-secondary)_10%,white)] p-3">
        <div className="flex items-center justify-between">
          <span className="muted-text">Due now to reserve (deposit)</span>
          <span className="font-semibold text-[var(--color-text)]">{formatPhpPeso(deposit)}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="muted-text">Balance at check-in</span>
          <span>{formatPhpPeso(balance)}</span>
        </div>
      </div>
    </div>
  );
}
