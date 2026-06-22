/**
 * Booking draft persistence (sessionStorage).
 *
 * Carries a logged-out visitor's selection (unit + dates + guests) across the
 * sign-in redirect into /reserve. Intentionally stores NO prices — totals are
 * always recomputed from live unit data (see lib/booking/pricing.ts) so a stale
 * draft can never produce a wrong total. Once a reservation is created, the draft
 * is cleared and the reservation_id becomes the source of truth.
 */

export type BookingDraft = {
  unitId: string;
  checkInDate: string;
  checkOutDate: string;
  guestCount: number;
};

const DRAFT_KEY = "hillside-booking-draft-v1";

export function readBookingDraft(): BookingDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BookingDraft>;
    if (!parsed || typeof parsed.unitId !== "string" || !parsed.unitId) return null;
    if (typeof parsed.checkInDate !== "string" || typeof parsed.checkOutDate !== "string") {
      return null;
    }
    const guestCount = Number(parsed.guestCount);
    return {
      unitId: parsed.unitId,
      checkInDate: parsed.checkInDate,
      checkOutDate: parsed.checkOutDate,
      guestCount: Number.isFinite(guestCount) && guestCount > 0 ? Math.floor(guestCount) : 1,
    };
  } catch {
    return null;
  }
}

export function writeBookingDraft(draft: BookingDraft): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* ignore quota / disabled storage */
  }
}

export function clearBookingDraft(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}
