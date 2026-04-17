import type { ReactNode } from "react";
import { AlertCircle, CheckCircle2, Clock3, WifiOff } from "lucide-react";
import { cn } from "../../lib/cn";
import { StatusPill, type StatusPillTone } from "./StatusPill";

type BannerTone = "valid" | "invalid" | "offline" | "info";

const toneMap: Record<
  BannerTone,
  { tone: StatusPillTone; bgClass: string; title: string; icon: ReactNode }
> = {
  valid: {
    tone: "success",
    bgClass: "border-emerald-200 bg-emerald-50/70",
    title: "VALID",
    icon: <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />,
  },
  invalid: {
    tone: "error",
    bgClass: "border-red-200 bg-red-50/70",
    title: "INVALID",
    icon: <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />,
  },
  offline: {
    tone: "warn",
    bgClass: "border-amber-200 bg-amber-50/70",
    title: "OFFLINE-QUEUED",
    icon: <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />,
  },
  info: {
    tone: "info",
    bgClass: "border-sky-200 bg-sky-50/70",
    title: "SCANNING",
    icon: <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />,
  },
};

export function ResultBanner({
  tone,
  message,
  detail,
  actionLabel,
  onAction,
  className,
}: {
  tone: BannerTone;
  message: string;
  detail?: string | null;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}) {
  const config = toneMap[tone];
  return (
    <section className={cn("rounded-xl border p-3", config.bgClass, className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <StatusPill label={config.title} tone={config.tone} icon={config.icon} />
          <p className="text-sm font-semibold text-[var(--color-text)]">{message}</p>
          {detail ? <p className="text-xs text-[var(--color-muted)]">{detail}</p> : null}
        </div>
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="rounded-lg border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--color-text)] transition hover:bg-slate-50"
          >
            {actionLabel}
          </button>
        ) : null}
      </div>
    </section>
  );
}
