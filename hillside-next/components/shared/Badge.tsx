import { cn } from "../../lib/cn";

type BadgeVariant = "success" | "warn" | "error" | "info" | "neutral";

const variantClass: Record<BadgeVariant, string> = {
  success: "bg-emerald-100 text-emerald-700",
  warn: "bg-amber-100 text-amber-700",
  error: "bg-red-100 text-red-700",
  info: "bg-sky-100 text-sky-700",
  neutral: "bg-slate-100 text-slate-700",
};

const reservationMap: Record<string, BadgeVariant> = {
  confirmed: "success",
  checked_in: "success",
  verified: "success",
  pending_payment: "warn",
  for_verification: "warn",
  cancelled: "error",
  rejected: "error",
  no_show: "error",
  created: "info",
  draft: "info",
};

export function statusToBadgeVariant(status?: string | null): BadgeVariant {
  if (!status) return "neutral";
  return reservationMap[status.toLowerCase()] || "neutral";
}

export function Badge({
  label,
  variant = "neutral",
  className,
}: {
  label: string;
  variant?: BadgeVariant;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold",
        variantClass[variant],
        className,
      )}
    >
      {label}
    </span>
  );
}
