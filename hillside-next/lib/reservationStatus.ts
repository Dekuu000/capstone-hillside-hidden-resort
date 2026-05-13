import type { ReservationStatus } from "../../packages/shared/src/types";

type ReservationStatusMeta = {
  label: string;
  className: string;
};

type ReservationStatusVariant = "default" | "payments";

const DEFAULT_META: Partial<Record<ReservationStatus, ReservationStatusMeta>> = {
  pending_payment: { label: "Pending Payment", className: "bg-yellow-100 text-yellow-800" },
  for_verification: { label: "For Verification", className: "bg-blue-100 text-blue-800" },
  confirmed: { label: "Confirmed", className: "bg-emerald-100 text-emerald-800" },
  checked_in: { label: "Checked In", className: "bg-indigo-100 text-indigo-800" },
  checked_out: { label: "Checked Out", className: "bg-slate-200 text-slate-700" },
  cancelled: { label: "Cancelled", className: "bg-red-100 text-red-800" },
  no_show: { label: "No Show", className: "bg-red-100 text-red-800" },
};

const PAYMENTS_META: Partial<Record<ReservationStatus, ReservationStatusMeta>> = {
  ...DEFAULT_META,
  for_verification: { label: "For Verification", className: "bg-orange-100 text-orange-800" },
  confirmed: { label: "Confirmed", className: "bg-green-100 text-green-800" },
};

function humanizeReservationStatus(value: string) {
  return value.replaceAll("_", " ");
}

export function getReservationStatusMeta(
  status: ReservationStatus | string | null | undefined,
  variant: ReservationStatusVariant = "default",
): ReservationStatusMeta {
  if (!status) return { label: "Unknown", className: "bg-slate-100 text-slate-700" };
  const normalized = String(status).toLowerCase();
  const source = variant === "payments" ? PAYMENTS_META : DEFAULT_META;
  const mapped = source[normalized as ReservationStatus];
  if (mapped) return mapped;
  return { label: humanizeReservationStatus(normalized), className: "bg-slate-100 text-slate-700" };
}
