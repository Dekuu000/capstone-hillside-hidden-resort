import type { ReactNode } from "react";
import { cn } from "../../lib/cn";

export type StatusPillTone = "success" | "warn" | "error" | "info" | "neutral";

const toneClass: Record<StatusPillTone, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warn: "border-amber-200 bg-amber-50 text-amber-700",
  error: "border-red-200 bg-red-50 text-red-700",
  info: "border-sky-200 bg-sky-50 text-sky-700",
  neutral: "border-slate-200 bg-slate-50 text-slate-700",
};

export function StatusPill({
  label,
  tone = "neutral",
  icon,
  className,
}: {
  label: string;
  tone?: StatusPillTone;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold tracking-wide",
        toneClass[tone],
        className,
      )}
    >
      {icon ? <span className="inline-flex h-3.5 w-3.5 items-center justify-center">{icon}</span> : null}
      {label}
    </span>
  );
}
