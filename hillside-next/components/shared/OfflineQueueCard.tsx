import { CloudOff, RefreshCw, Trash2, Wifi, WifiOff } from "lucide-react";
import { StatusPill } from "./StatusPill";

export function OfflineQueueCard({
  queueCount,
  online,
  syncing,
  onSync,
  onClear,
  lastSyncedAt,
}: {
  queueCount: number;
  online: boolean;
  syncing?: boolean;
  onSync: () => void;
  onClear: () => void;
  lastSyncedAt?: string | null;
}) {
  return (
    <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--color-text)]">Offline Queue</p>
          <p className="text-xs text-[var(--color-muted)]">
            Offline scans are queued and will sync when online.
          </p>
        </div>
        <StatusPill
          label={online ? "Online" : "Offline"}
          tone={online ? "success" : "warn"}
          icon={online ? <Wifi className="h-3.5 w-3.5" aria-hidden="true" /> : <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />}
        />
      </div>

      <div className="mt-3 flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-slate-50 p-3">
        <div className="flex items-center gap-2">
          <CloudOff className="h-4 w-4 text-[var(--color-muted)]" aria-hidden="true" />
          <span className="text-sm text-[var(--color-text)]">{queueCount} queued token(s)</span>
        </div>
        {lastSyncedAt ? <span className="text-xs text-[var(--color-muted)]">Last sync {lastSyncedAt}</span> : null}
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <button
          type="button"
          onClick={onSync}
          disabled={!online || queueCount === 0 || syncing}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[var(--color-primary)] px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} aria-hidden="true" />
          {syncing ? "Syncing..." : "Sync now"}
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={queueCount === 0 || syncing}
          className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[var(--color-border)] bg-white px-3 text-sm font-semibold text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Trash2 className="h-4 w-4" aria-hidden="true" />
          Clear queue
        </button>
      </div>
    </section>
  );
}
