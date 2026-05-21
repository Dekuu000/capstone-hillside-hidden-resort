"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCcw, WifiOff } from "lucide-react";
import { cn } from "../../lib/cn";
import { useSyncEngine } from "../shared/SyncEngineProvider";

type GuestSyncStatusProps = {
  status?: "synced" | "offline" | "queued" | "syncing" | "failed";
  queuedCount?: number;
  lastSyncedAt?: string | null;
  onRetry?: () => void;
  compact?: boolean;
  showSynced?: boolean;
  className?: string;
};

function deriveStatus(sync: ReturnType<typeof useSyncEngine>): "synced" | "offline" | "queued" | "syncing" | "failed" {
  if (!sync.online) return "offline";
  if (sync.failed > 0 || sync.conflicts > 0 || Boolean(sync.lastError)) return "failed";
  if (sync.syncing > 0) return "syncing";
  if (sync.queued > 0) return "queued";
  return "synced";
}

export function GuestSyncStatus({
  status,
  queuedCount,
  lastSyncedAt,
  onRetry,
  compact = false,
  showSynced = false,
  className,
}: GuestSyncStatusProps) {
  const sync = useSyncEngine();
  const effectiveStatus = status ?? deriveStatus(sync);
  const effectiveQueuedCount = queuedCount ?? sync.queued;
  const effectiveLastSyncedAt = lastSyncedAt ?? sync.lastSyncedAt;

  if (effectiveStatus === "synced" && !showSynced) {
    return null;
  }

  if (effectiveStatus === "synced" && showSynced) {
    return (
      <p
        data-testid="sync-center-card"
        role="status"
        aria-live="polite"
        className={cn(
          "inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700",
          className,
        )}
      >
        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
        All changes synced
      </p>
    );
  }

  const retryHandler = onRetry ?? (() => void sync.runNow());
  const containerClass = compact
    ? "rounded-xl border px-3 py-2.5"
    : "rounded-2xl border px-4 py-3";

  if (effectiveStatus === "offline") {
    return (
      <div
        data-testid="sync-center-card"
        role="status"
        aria-live="polite"
        className={cn(containerClass, "border-amber-200 bg-amber-50/80", className)}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="inline-flex items-center gap-2 text-sm font-medium text-amber-900">
            <WifiOff className="h-4 w-4" aria-hidden="true" />
            You&apos;re offline. Your changes are saved and will sync automatically.
          </p>
          <Link href="/guest/sync" className="text-xs font-semibold text-amber-900 underline underline-offset-2">
            Sync details
          </Link>
        </div>
      </div>
    );
  }

  if (effectiveStatus === "queued") {
    const label = `${effectiveQueuedCount} update${effectiveQueuedCount === 1 ? "" : "s"} waiting to sync`;
    return (
      <div
        data-testid="sync-center-card"
        role="status"
        aria-live="polite"
        className={cn(containerClass, "border-sky-200 bg-sky-50/80", className)}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="inline-flex items-center gap-2 text-sm font-medium text-sky-900">
            <RefreshCcw className="h-4 w-4" aria-hidden="true" />
            {label}
          </p>
          <Link href="/guest/sync" className="text-xs font-semibold text-sky-900 underline underline-offset-2">
            Sync details
          </Link>
        </div>
      </div>
    );
  }

  if (effectiveStatus === "syncing") {
    return (
      <div
        data-testid="sync-center-card"
        role="status"
        aria-live="polite"
        className={cn(containerClass, "border-slate-200 bg-slate-50/90", className)}
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Syncing your latest changes...
          </p>
          <Link href="/guest/sync" className="text-xs font-semibold text-slate-700 underline underline-offset-2">
            Sync details
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="sync-center-card"
      role="status"
      aria-live="polite"
      className={cn(containerClass, "border-red-200 bg-red-50/90", className)}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="inline-flex items-center gap-2 text-sm font-medium text-red-700">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          Some updates could not sync.
        </p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={retryHandler}
            className="inline-flex h-8 items-center rounded-full border border-red-300 bg-white px-3 text-xs font-semibold text-red-800"
          >
            Retry
          </button>
          <Link href="/guest/sync" className="text-xs font-semibold text-red-800 underline underline-offset-2">
            Sync details
          </Link>
        </div>
      </div>
      {effectiveLastSyncedAt ? (
        <p className="mt-2 text-xs text-red-700/90">Please retry now or open Sync details for more info.</p>
      ) : null}
    </div>
  );
}
