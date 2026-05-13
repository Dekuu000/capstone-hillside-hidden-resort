export type ReservationPaymentState = "unpaid" | "partial" | "settled";

type ReservationSourceLike = {
  reservation_source?: string | null;
  notes?: string | null;
};

type ReservationPaymentLike = {
  total_amount?: number | null;
  amount_paid_verified?: number | null;
  balance_due?: number | null;
};

export function getReservationSource(reservation: ReservationSourceLike): "online" | "walk_in" {
  if (reservation.reservation_source === "online" || reservation.reservation_source === "walk_in") {
    return reservation.reservation_source;
  }
  const notes = String(reservation.notes || "").toLowerCase();
  const fromWalkInNotes = notes.includes("walk-in") || notes.includes("walk in");
  return fromWalkInNotes ? "walk_in" : "online";
}

export function getReservationPaymentState(reservation: ReservationPaymentLike): ReservationPaymentState {
  const total = Number(reservation.total_amount ?? 0);
  const paid = Number(reservation.amount_paid_verified ?? 0);
  const balance = Number(reservation.balance_due ?? Math.max(total - paid, 0));
  if (balance <= 0 && total > 0) return "settled";
  if (paid > 0 && balance > 0) return "partial";
  return "unpaid";
}
