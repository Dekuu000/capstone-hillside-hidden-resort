import Link from "next/link";
import { cn } from "../../lib/cn";

type SyncAlertTone = "warning" | "success";

const toneClasses: Record<
  SyncAlertTone,
  { container: string; message: string; link: string }
> = {
  warning: {
    container: "border-amber-200 bg-amber-50",
    message: "text-amber-800",
    link: "border-amber-300 text-amber-900",
  },
  success: {
    container: "border-emerald-200 bg-emerald-50",
    message: "text-emerald-700",
    link: "border-emerald-300 text-emerald-900",
  },
};

type SyncAlertBannerProps = {
  message: string;
  tone?: SyncAlertTone;
  showSyncCta?: boolean;
  syncHref?: string;
  syncLabel?: string;
  role?: "status" | "alert";
  ariaLive?: "off" | "polite" | "assertive";
  className?: string;
  messageClassName?: string;
  syncLinkClassName?: string;
};

export function SyncAlertBanner({
  message,
  tone = "warning",
  showSyncCta = false,
  syncHref = "/guest/sync",
  syncLabel = "Open Sync Center",
  role,
  ariaLive,
  className,
  messageClassName,
  syncLinkClassName,
}: SyncAlertBannerProps) {
  const style = toneClasses[tone];

  return (
    <div
      role={role}
      aria-live={ariaLive}
      className={cn(
        "flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3",
        style.container,
        className,
      )}
    >
      <p className={cn("text-sm", style.message, messageClassName)}>{message}</p>
      {showSyncCta ? (
        <Link
          href={syncHref}
          className={cn(
            "inline-flex h-8 items-center rounded-full border bg-white px-3 text-xs font-semibold",
            style.link,
            syncLinkClassName,
          )}
        >
          {syncLabel}
        </Link>
      ) : null}
    </div>
  );
}
