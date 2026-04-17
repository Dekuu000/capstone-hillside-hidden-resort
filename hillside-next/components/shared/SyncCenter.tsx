"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCcw, TriangleAlert, Wifi, WifiOff } from "lucide-react";
import { useSyncEngine } from "./SyncEngineProvider";
import { useToast } from "./ToastProvider";
import { env } from "../../lib/env";
import { enqueueOfflineOperation } from "../../lib/offlineSync/engine";
import {
  addConflict,
  discardOperation,
  getUploadBlob,
  listConflicts,
  listOutboxRecords,
  listUploadQueue,
  queueUploadItem,
  removeConflict,
  retryOutboxOperation,
  updateUploadQueueItem,
  type ConflictRecord,
} from "../../lib/offlineSync/store";
import type { UploadQueueItem } from "../../../packages/shared/src/types";

type SyncCenterProps = {
  title: string;
  description: string;
  scope: "me" | "admin";
};

type OutboxView = {
  operation_id: string;
  entity_type: string;
  action: string;
  status: string;
  created_at: string;
  updated_at: string;
  retry_count: number;
  last_error?: string | null;
};

function formatDateTime(value: string | null | undefined) {
  if (!value) return "--";
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString();
}

export function SyncCenter({ title, description, scope }: SyncCenterProps) {
  const sync = useSyncEngine();
  const { showToast } = useToast();
  const harnessEnabled = env.syncHarnessEnabled;
  const [busy, setBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [outboxRows, setOutboxRows] = useState<OutboxView[]>([]);
  const [conflicts, setConflicts] = useState<ConflictRecord[]>([]);
  const [uploadRows, setUploadRows] = useState<UploadQueueItem[]>([]);
  const [uploadCounts, setUploadCounts] = useState({ queued: 0, uploaded: 0, committed: 0, failed: 0 });

  const refreshDetails = async () => {
    const [outbox, conflictRows, uploads] = await Promise.all([
      listOutboxRecords(100),
      listConflicts(20),
      listUploadQueue(),
    ]);
    setOutboxRows(
      outbox.map((row) => ({
        operation_id: row.operation_id,
        entity_type: row.entity_type,
        action: row.action,
        status: row.status,
        created_at: row.created_at,
        updated_at: row.updated_at,
        retry_count: row.retry_count,
        last_error: row.last_error || null,
      })),
    );
    setConflicts(conflictRows);
    setUploadCounts(
      uploads.reduce(
        (acc, item) => {
          if (item.status === "queued") acc.queued += 1;
          if (item.status === "uploaded") acc.uploaded += 1;
          if (item.status === "committed") acc.committed += 1;
          if (item.status === "failed") acc.failed += 1;
          return acc;
        },
        { queued: 0, uploaded: 0, committed: 0, failed: 0 },
      ),
    );
    setUploadRows(
      [...uploads].sort((a, b) => {
        const rank = (status: UploadQueueItem["status"]) => {
          if (status === "failed") return 0;
          if (status === "queued") return 1;
          if (status === "uploaded") return 2;
          return 3;
        };
        return rank(a.status) - rank(b.status);
      }),
    );
  };

  useEffect(() => {
    void refreshDetails();
  }, [sync.queued, sync.syncing, sync.failed, sync.conflicts, sync.lastSyncedAt, scope]);

  const primaryStatus = useMemo(() => {
    if (!sync.online) return { label: "Offline", tone: "text-amber-700" };
    if (sync.failed > 0 || sync.conflicts > 0) return { label: "Needs attention", tone: "text-red-700" };
    if (sync.queued > 0 || sync.syncing > 0) return { label: "Syncing", tone: "text-sky-700" };
    return { label: "Healthy", tone: "text-emerald-700" };
  }, [sync.conflicts, sync.failed, sync.online, sync.queued, sync.syncing]);

  const handleRunNow = async () => {
    setBusy(true);
    try {
      await sync.runNow();
      await refreshDetails();
    } finally {
      setBusy(false);
    }
  };

  const handleRetry = async (operationId: string) => {
    setActionBusy(`retry:${operationId}`);
    try {
      await retryOutboxOperation(operationId);
      await removeConflict(operationId);
      await sync.runNow();
      await refreshDetails();
    } finally {
      setActionBusy(null);
    }
  };

  const handleDismissConflict = async (operationId: string) => {
    setActionBusy(`dismiss:${operationId}`);
    try {
      await removeConflict(operationId);
      await refreshDetails();
    } finally {
      setActionBusy(null);
    }
  };

  const handleDiscardLocal = async (operationId: string) => {
    setActionBusy(`discard:${operationId}`);
    try {
      await discardOperation(operationId);
      await refreshDetails();
    } finally {
      setActionBusy(null);
    }
  };

  const handleRetryUpload = async (uploadId: string) => {
    setActionBusy(`upload-retry:${uploadId}`);
    try {
      const blob = await getUploadBlob(uploadId);
      if (!blob?.blob) {
        await updateUploadQueueItem(uploadId, {
          status: "failed",
          failure_reason: "Missing local file payload. Please re-upload payment proof from booking details.",
        });
        showToast({
          type: "warning",
          title: "Upload payload missing",
          message: "Re-upload payment proof from booking details before syncing.",
        });
        await refreshDetails();
        return;
      }
      await updateUploadQueueItem(uploadId, { status: "queued", failure_reason: null });
      await sync.runNow();
      await refreshDetails();
      showToast({
        type: "success",
        title: "Upload retry started",
        message: "Queued file upload will be retried in this sync cycle.",
      });
    } finally {
      setActionBusy(null);
    }
  };

  const handleInjectFailedCheckin = async () => {
    setActionBusy("harness:failed-checkin");
    try {
      await enqueueOfflineOperation({
        idempotency_key: crypto.randomUUID(),
        entity_type: "checkin",
        action: "checkin.perform",
        entity_id: null,
        payload: {
          scanner_id: "sync-harness",
          override_reason: null,
        },
      });
      await sync.runNow();
      await refreshDetails();
      showToast({
        type: "info",
        title: "Injected failed operation",
        message: "Invalid check-in operation queued and processed for failure-path testing.",
      });
    } finally {
      setActionBusy(null);
    }
  };

  const handleInjectConflict = async () => {
    setActionBusy("harness:conflict");
    try {
      const operationId = `harness-conflict-${crypto.randomUUID()}`;
      await addConflict({
        operation_id: operationId,
        entity_type: "reservation",
        action: "checkin.perform",
        reason: "Synthetic server conflict for UI testing.",
        server_version: 999,
        resolution_hint: "server_wins_refresh_required",
        payload: {},
        created_at: new Date().toISOString(),
      });
      await refreshDetails();
      showToast({
        type: "info",
        title: "Conflict injected",
        message: "Synthetic conflict added to validate conflict UI behavior.",
      });
    } finally {
      setActionBusy(null);
    }
  };

  const handleInjectFailedUpload = async () => {
    setActionBusy("harness:failed-upload");
    try {
      const uploadId = `harness-upload-${crypto.randomUUID()}`;
      await queueUploadItem({
        upload_id: uploadId,
        operation_id: `harness-op-${crypto.randomUUID()}`,
        entity_type: "payment_submission",
        entity_id: "harness-reservation",
        field_name: "proof_url",
        storage_bucket: "payment-proofs",
        storage_path: `payments/harness/${uploadId}.jpg`,
        mime_type: "image/jpeg",
        size_bytes: 12345,
        checksum_sha256: null,
        status: "failed",
        failure_reason: "Synthetic missing blob payload for retry-path testing.",
        metadata: { file_name: "harness-proof.jpg" },
      });
      await refreshDetails();
      showToast({
        type: "info",
        title: "Failed upload injected",
        message: "Synthetic failed upload added to test upload retry UX.",
      });
    } finally {
      setActionBusy(null);
    }
  };

  return (
    <section className="space-y-4">
      <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-white p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--color-muted)]">Sync Center</p>
            <h1 className="mt-1 text-2xl font-bold text-[var(--color-text)]">{title}</h1>
            <p className="mt-1 text-sm text-[var(--color-muted)]">{description}</p>
          </div>
          <button
            type="button"
            onClick={() => void handleRunNow()}
            disabled={!sync.enabled || busy}
            className="inline-flex h-11 items-center gap-2 rounded-full border border-[var(--color-border)] px-4 text-sm font-semibold text-[var(--color-text)] transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            <RefreshCcw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
            {busy ? "Syncing..." : "Run sync now"}
          </button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-[0.12em] text-[var(--color-muted)]">Status</p>
            <p className={`mt-1 text-base font-semibold ${primaryStatus.tone}`}>
              {sync.online ? <Wifi className="mr-1 inline-block h-4 w-4" /> : <WifiOff className="mr-1 inline-block h-4 w-4" />}
              {primaryStatus.label}
            </p>
            <p className="mt-1 text-xs text-[var(--color-muted)]">Last sync: {formatDateTime(sync.lastSyncedAt)}</p>
          </div>
          <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-[0.12em] text-[var(--color-muted)]">Outbox</p>
            <p className="mt-1 text-xl font-semibold text-[var(--color-text)]">{sync.queued + sync.syncing + sync.failed}</p>
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              queued {sync.queued} | syncing {sync.syncing} | failed {sync.failed}
            </p>
          </div>
          <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-[0.12em] text-[var(--color-muted)]">Upload Queue</p>
            <p className="mt-1 text-xl font-semibold text-[var(--color-text)]">{uploadCounts.queued + uploadCounts.uploaded + uploadCounts.failed}</p>
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              queued {uploadCounts.queued} | uploaded {uploadCounts.uploaded} | failed {uploadCounts.failed}
            </p>
          </div>
          <div className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-slate-50 p-3">
            <p className="text-xs uppercase tracking-[0.12em] text-[var(--color-muted)]">Conflicts</p>
            <p className="mt-1 text-xl font-semibold text-[var(--color-text)]">{sync.conflicts}</p>
            <p className="mt-1 text-xs text-[var(--color-muted)]">Server-wins conflicts requiring refresh.</p>
          </div>
        </div>
        {sync.lastError ? (
          <div className="mt-4 flex items-start gap-2 rounded-[var(--radius-md)] border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{sync.lastError}</span>
          </div>
        ) : null}
      </div>

      <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-white">
        <div className="border-b border-[var(--color-border)] px-4 py-3">
          <h2 className="text-base font-semibold text-[var(--color-text)]">Pending operations</h2>
          <p className="text-xs text-[var(--color-muted)]">Outbox replay queue and retry status.</p>
        </div>
        {outboxRows.length === 0 ? (
          <p className="px-4 py-5 text-sm text-[var(--color-muted)]">No pending operations.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[var(--color-border)] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.12em] text-[var(--color-muted)]">
                <tr>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Retry</th>
                  <th className="px-4 py-3">Updated</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {outboxRows.map((row) => (
                  <tr key={row.operation_id}>
                    <td className="px-4 py-3 font-medium text-[var(--color-text)]">{row.entity_type}</td>
                    <td className="px-4 py-3 text-[var(--color-muted)]">{row.action}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full border border-[var(--color-border)] px-2 py-1 text-xs font-semibold text-[var(--color-text)]">
                        {row.status}
                      </span>
                      {row.last_error ? <p className="mt-1 text-xs text-red-600">{row.last_error}</p> : null}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted)]">{row.retry_count}</td>
                    <td className="px-4 py-3 text-[var(--color-muted)]">{formatDateTime(row.updated_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => void handleRetry(row.operation_id)}
                          disabled={row.status === "syncing" || actionBusy === `retry:${row.operation_id}`}
                          className="rounded-full border border-[var(--color-border)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Retry
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDiscardLocal(row.operation_id)}
                          disabled={actionBusy === `discard:${row.operation_id}`}
                          className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Discard local
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-white">
        <div className="border-b border-[var(--color-border)] px-4 py-3">
          <h2 className="text-base font-semibold text-[var(--color-text)]">Queued uploads</h2>
          <p className="text-xs text-[var(--color-muted)]">Payment proof and media uploads pending cloud commit.</p>
        </div>
        {uploadRows.length === 0 ? (
          <p className="px-4 py-5 text-sm text-[var(--color-muted)]">No queued uploads.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-[var(--color-border)] text-sm">
              <thead className="bg-slate-50 text-left text-xs uppercase tracking-[0.12em] text-[var(--color-muted)]">
                <tr>
                  <th className="px-4 py-3">File</th>
                  <th className="px-4 py-3">Entity</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Reason</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {uploadRows.map((row) => (
                  <tr key={row.upload_id}>
                    <td className="px-4 py-3 text-[var(--color-text)]">
                      <p className="font-medium">
                        {typeof row.metadata?.file_name === "string" ? row.metadata.file_name : row.storage_path.split("/").at(-1) || row.upload_id}
                      </p>
                      <p className="text-xs text-[var(--color-muted)]">{row.storage_bucket}</p>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-muted)]">{row.entity_type}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full border border-[var(--color-border)] px-2 py-1 text-xs font-semibold text-[var(--color-text)]">
                        {row.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--color-muted)]">{row.failure_reason || "--"}</td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => void handleRetryUpload(row.upload_id)}
                        disabled={row.status !== "failed" || actionBusy === `upload-retry:${row.upload_id}`}
                        className="rounded-full border border-[var(--color-border)] bg-white px-2.5 py-1 text-xs font-semibold text-[var(--color-text)] disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Retry upload
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {harnessEnabled ? (
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-white">
          <div className="border-b border-[var(--color-border)] px-4 py-3">
            <h2 className="text-base font-semibold text-[var(--color-text)]">Sync Harness (Dev)</h2>
            <p className="text-xs text-[var(--color-muted)]">Failure-injection tools for offline sync validation.</p>
          </div>
          <div className="flex flex-wrap gap-2 px-4 py-4">
            <button
              type="button"
              onClick={() => void handleInjectFailedCheckin()}
              disabled={actionBusy === "harness:failed-checkin"}
              className="rounded-full border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--color-text)] disabled:opacity-60"
            >
              Queue invalid check-in + run sync
            </button>
            <button
              type="button"
              onClick={() => void handleInjectConflict()}
              disabled={actionBusy === "harness:conflict"}
              className="rounded-full border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--color-text)] disabled:opacity-60"
            >
              Inject synthetic conflict
            </button>
            <button
              type="button"
              onClick={() => void handleInjectFailedUpload()}
              disabled={actionBusy === "harness:failed-upload"}
              className="rounded-full border border-[var(--color-border)] bg-white px-3 py-1.5 text-xs font-semibold text-[var(--color-text)] disabled:opacity-60"
            >
              Inject failed upload
            </button>
          </div>
        </div>
      ) : null}

      <div className="rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-white">
        <div className="border-b border-[var(--color-border)] px-4 py-3">
          <h2 className="text-base font-semibold text-[var(--color-text)]">Conflicts</h2>
          <p className="text-xs text-[var(--color-muted)]">Conflicted operations kept for manual review.</p>
        </div>
        {conflicts.length === 0 ? (
          <p className="px-4 py-5 text-sm text-[var(--color-muted)]">No conflicts.</p>
        ) : (
          <ul className="space-y-3 px-4 py-4">
            {conflicts.map((item) => (
              <li key={item.operation_id} className="rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 p-3 text-sm">
                <p className="font-semibold text-amber-800">{item.entity_type} | {item.action}</p>
                <p className="mt-1 text-amber-700">{item.reason}</p>
                {item.resolution_hint ? <p className="mt-1 text-xs text-amber-700">Hint: {item.resolution_hint}</p> : null}
                <p className="mt-1 text-xs text-amber-700">Recorded: {formatDateTime(item.created_at)}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => void handleRetry(item.operation_id)}
                    disabled={actionBusy === `retry:${item.operation_id}`}
                    className="rounded-full border border-amber-300 bg-white px-2.5 py-1 text-xs font-semibold text-amber-800 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Retry now
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDismissConflict(item.operation_id)}
                    disabled={actionBusy === `dismiss:${item.operation_id}`}
                    className="rounded-full border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Dismiss
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleDiscardLocal(item.operation_id)}
                    disabled={actionBusy === `discard:${item.operation_id}`}
                    className="rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Discard local
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
