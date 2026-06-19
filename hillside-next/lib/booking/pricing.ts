import type { AvailableUnitsResponse } from "../../../packages/shared/src/types";

/**
 * Single source of truth for nightly-rate math, shared across the booking funnel
 * (listing cards, listing detail, reservation summary). Mirrors the backend rule
 * in hillside-api reservations.py (PAX_BASED_STAY_UNIT_RULES) so the prices shown
 * to guests match what the server actually charges.
 */

export type PricedUnit = Pick<
  AvailableUnitsResponse["items"][number],
  "base_price" | "unit_code"
>;

export const PAX_BASED_UNIT_PRICING: Record<
  string,
  { includedPax: number; fallbackMinRate: number; extraPaxRate: number }
> = {
  "AMN-EVERGREEN-PAVILION": { includedPax: 30, fallbackMinRate: 8500, extraPaxRate: 250 },
  "AMN-PINECREST-EXCLUSIVE": { includedPax: 20, fallbackMinRate: 12000, extraPaxRate: 400 },
};

export function isPaxPricedUnit(unit: PricedUnit): boolean {
  const unitCode = String(unit.unit_code || "").toUpperCase();
  return Boolean(PAX_BASED_UNIT_PRICING[unitCode]);
}

export function getUnitNightlyRate(unit: PricedUnit, partySize: number): number {
  const baseRate = Number(unit.base_price || 0);
  const unitCode = String(unit.unit_code || "").toUpperCase();
  const dynamicRule = PAX_BASED_UNIT_PRICING[unitCode];
  if (!dynamicRule) return baseRate;
  const minRate = baseRate > 0 ? baseRate : dynamicRule.fallbackMinRate;
  const extraPax = Math.max(0, Math.max(1, Math.floor(partySize || 1)) - dynamicRule.includedPax);
  return minRate + extraPax * dynamicRule.extraPaxRate;
}

// --- Tour / day-pass pricing (mirrors ToursBookingClient) ---

export function tourTotal(
  service: { adult_rate?: number | null; kid_rate?: number | null },
  adultQty: number,
  kidQty: number,
): number {
  const adults = Math.max(0, Math.floor(adultQty || 0)) * Number(service.adult_rate || 0);
  const kids = Math.max(0, Math.floor(kidQty || 0)) * Number(service.kid_rate || 0);
  return adults + kids;
}

/** Minimum pay-now to reserve a tour: the full amount if ≤ ₱500, otherwise a ₱500 deposit. */
export function tourMinPayNow(total: number): number {
  return total <= 500 ? total : 500;
}
