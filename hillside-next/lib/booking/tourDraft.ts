/**
 * Tour booking draft (sessionStorage) — mirrors lib/booking/draft.ts for the
 * Tours funnel. Carries a logged-out visitor's tour selection across the sign-in
 * redirect into /tours/reserve. No prices stored — totals are recomputed from
 * live service data (see lib/booking/pricing.ts).
 */

export type TourDraft = {
  serviceId: string;
  visitDate: string;
  adultQty: number;
  kidQty: number;
};

const DRAFT_KEY = "hillside-tour-draft-v1";

export function readTourDraft(): TourDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TourDraft>;
    if (!parsed || typeof parsed.serviceId !== "string" || !parsed.serviceId) return null;
    if (typeof parsed.visitDate !== "string") return null;
    const adultQty = Number(parsed.adultQty);
    const kidQty = Number(parsed.kidQty);
    return {
      serviceId: parsed.serviceId,
      visitDate: parsed.visitDate,
      adultQty: Number.isFinite(adultQty) && adultQty > 0 ? Math.floor(adultQty) : 1,
      kidQty: Number.isFinite(kidQty) && kidQty >= 0 ? Math.floor(kidQty) : 0,
    };
  } catch {
    return null;
  }
}

export function writeTourDraft(draft: TourDraft): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* ignore quota / disabled storage */
  }
}

export function clearTourDraft(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}
