import { formatPhpPeso } from "../../lib/formatCurrency";
import { computeStayDepositPreview } from "../../../packages/shared/src/types";

type PriceBreakdownProps = {
  nightlyRate: number;
  nights: number;
  guests: number;
  /** Peso discount from an applied promo code (default 0). */
  discount?: number;
  /** Applied promo code, for the discount line label. */
  promoCode?: string | null;
};

/**
 * Live price breakdown. Mirrors the real resort model: total = nightly × nights,
 * with a deposit due now (computeStayDepositPreview, on the discounted total) and
 * the balance at check-in. An applied promo code subtracts before the deposit.
 */
export function PriceBreakdown({ nightlyRate, nights, guests, discount = 0, promoCode }: PriceBreakdownProps) {
  const safeNights = Math.max(0, nights);
  const gross = nightlyRate * safeNights;
  const safeDiscount = Math.min(Math.max(0, discount), gross);
  const total = gross - safeDiscount;
  const deposit = computeStayDepositPreview(total);
  const balance = Math.max(0, total - deposit);

  return (
    <div className="space-y-2 text-sm">
      <div className="flex items-center justify-between">
        <span className="muted-text">
          {formatPhpPeso(nightlyRate)} × {safeNights} {safeNights === 1 ? "night" : "nights"}
          <span className="muted-text"> · {guests} {guests === 1 ? "guest" : "guests"}</span>
        </span>
        <span>{formatPhpPeso(gross)}</span>
      </div>
      {safeDiscount > 0 ? (
        <div className="flex items-center justify-between text-[var(--color-secondary)]">
          <span className="font-semibold">Promo{promoCode ? ` (${promoCode})` : ""}</span>
          <span className="font-semibold">−{formatPhpPeso(safeDiscount)}</span>
        </div>
      ) : null}
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
