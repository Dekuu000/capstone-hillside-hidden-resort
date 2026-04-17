import { syncPushResultSchema, syncStateSnapshotSchema, syncUploadsCommitResponseSchema } from "../../../packages/shared/src/schemas";
import type { OfflineOperation, SyncPushResult, SyncStateSnapshot } from "../../../packages/shared/src/types";
import { apiFetch } from "../apiClient";
import { env } from "../env";
import { getSupabaseBrowserClient } from "../supabase";
import {
  addConflict,
  applyPullEvents,
  deleteUploadBlob,
  getUploadBlob,
  getSyncState,
  listReadyOutbox,
  listUploadQueue,
  markOutboxApplied,
  markOutboxFailed,
  markOutboxSyncing,
  queueOfflineOperation,
  setSyncState,
  type SyncScope,
  updateUploadQueueItem,
} from "./store";

const SYNC_EVENT = "hillside:sync-updated";
const MAX_RETRY_DELAY_MS = 5 * 60 * 1000;

export function emitSyncEvent() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SYNC_EVENT));
}

export function onSyncEvent(handler: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;
  const listener = () => handler();
  window.addEventListener(SYNC_EVENT, listener);
  return () => window.removeEventListener(SYNC_EVENT, listener);
}

export async function enqueueOfflineOperation(
  operation: Omit<OfflineOperation, "operation_id" | "created_at" | "retry_count"> & { operation_id?: string },
): Promise<OfflineOperation> {
  const operationId = operation.operation_id || crypto.randomUUID();
  const next: OfflineOperation = {
    operation_id: operationId,
    idempotency_key: operation.idempotency_key,
    entity_type: operation.entity_type,
    action: operation.action,
    entity_id: operation.entity_id ?? null,
    payload: operation.payload,
    created_at: new Date().toISOString(),
    retry_count: 0,
  };
  await queueOfflineOperation(next);
  emitSyncEvent();
  return next;
}

async function pushOutbox(accessToken: string, scope: SyncScope): Promise<void> {
  const ready = await listReadyOutbox(env.syncPushBatchSize);
  if (ready.length === 0) return;
  const uploadRows = await listUploadQueue();
  const uploadById = new Map(uploadRows.map((row) => [row.upload_id, row]));
  const actionable = ready
    .map((item) => {
      const uploadId = typeof item.payload.proof_upload_id === "string" ? item.payload.proof_upload_id : null;
      if (!uploadId) return item;
      const upload = uploadById.get(uploadId);
      if (!upload || (upload.status !== "uploaded" && upload.status !== "committed")) {
        return null;
      }
      return {
        ...item,
        payload: {
          ...item.payload,
          proof_url: upload.storage_path,
        },
      };
    })
    .filter((item): item is (typeof ready)[number] => Boolean(item));
  if (actionable.length === 0) return;

  const operationIds = actionable.map((item) => item.operation_id);
  await markOutboxSyncing(operationIds);
  emitSyncEvent();

  const pushPayload = {
    scope,
    operations: actionable.map((item) => ({
      operation_id: item.operation_id,
      idempotency_key: item.idempotency_key,
      entity_type: item.entity_type,
      action: item.action,
      entity_id: item.entity_id ?? null,
      payload: item.payload,
      created_at: item.created_at,
      retry_count: item.retry_count,
    })),
  };

  let pushResult: SyncPushResult;
  try {
    pushResult = await apiFetch<SyncPushResult>(
      "/v2/sync/push",
      { method: "POST", body: JSON.stringify(pushPayload) },
      accessToken,
      syncPushResultSchema,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Push failed.";
    for (const row of actionable) {
      await markOutboxFailed(row.operation_id, message, row.retry_count + 1, MAX_RETRY_DELAY_MS);
    }
    throw error;
  }

  for (const result of pushResult.results) {
    const current = actionable.find((row) => row.operation_id === result.operation_id);
    const retryCount = current?.retry_count ?? 0;
    if (result.status === "applied" || result.status === "noop") {
      await markOutboxApplied(result.operation_id);
      continue;
    }
    if (result.status === "conflict") {
      await addConflict({
        operation_id: result.operation_id,
        entity_type: result.entity_type,
        action: result.action,
        reason: result.error_message || "Conflict detected during sync replay.",
        server_version: result.conflict?.server_version ?? null,
        resolution_hint: result.conflict?.resolution_hint ?? null,
        payload: result.response_payload || {},
        created_at: new Date().toISOString(),
      });
    }
    await markOutboxFailed(
      result.operation_id,
      result.error_message || "Sync failed.",
      retryCount + 1,
      MAX_RETRY_DELAY_MS,
    );
  }
  emitSyncEvent();
}

async function processQueuedUploads(): Promise<void> {
  const queued = await listUploadQueue("queued");
  if (queued.length === 0) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;

  const supabase = getSupabaseBrowserClient();

  for (const item of queued) {
    const blobRecord = await getUploadBlob(item.upload_id);
    if (!blobRecord?.blob) {
      await updateUploadQueueItem(item.upload_id, {
        status: "failed",
        failure_reason: "Missing local file payload for upload.",
      });
      continue;
    }

    const { error } = await supabase.storage
      .from(item.storage_bucket)
      .upload(item.storage_path, blobRecord.blob, {
        upsert: false,
        contentType: item.mime_type || blobRecord.blob.type || undefined,
      });
    if (error) {
      await updateUploadQueueItem(item.upload_id, {
        status: "failed",
        failure_reason: error.message || "Upload failed.",
      });
      continue;
    }

    await updateUploadQueueItem(item.upload_id, {
      status: "uploaded",
      failure_reason: null,
    });
    await deleteUploadBlob(item.upload_id);
  }
  emitSyncEvent();
}

async function commitUploads(accessToken: string): Promise<void> {
  const uploaded = await listUploadQueue("uploaded");
  if (uploaded.length === 0) return;
  const response = await apiFetch(
    "/v2/sync/uploads/commit",
    {
      method: "POST",
      body: JSON.stringify({ items: uploaded }),
    },
    accessToken,
    syncUploadsCommitResponseSchema,
  );
  for (const item of response.items) {
    await updateUploadQueueItem(item.upload_id, {
      status: item.status,
      failure_reason: item.failure_reason ?? null,
    });
  }
}

async function pullDeltas(accessToken: string, scope: SyncScope): Promise<SyncStateSnapshot> {
  const state = await getSyncState(scope);
  const cursor = state.next_cursor || state.cursor || 0;
  const pull = await apiFetch<SyncStateSnapshot>(
    `/v2/sync/pull?cursor=${cursor}&scope=${scope}&limit=${env.syncPullLimit}`,
    { method: "GET" },
    accessToken,
    syncStateSnapshotSchema,
  );
  if (pull.items.length > 0) {
    await applyPullEvents(pull.items);
  }
  await setSyncState(scope, {
    cursor: pull.cursor,
    next_cursor: pull.next_cursor,
    last_synced_at: pull.as_of,
    last_error: null,
  });
  return pull;
}

let running = false;

export async function runSyncCycle(accessToken: string, scope: SyncScope): Promise<void> {
  if (!env.syncEnabled || !accessToken) return;
  if (running) return;
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  running = true;
  try {
    await processQueuedUploads();
    await commitUploads(accessToken);
    await pushOutbox(accessToken, scope);
    await pullDeltas(accessToken, scope);
    emitSyncEvent();
  } catch (error) {
    await setSyncState(scope, {
      last_error: error instanceof Error ? error.message : "Sync cycle failed.",
    });
    emitSyncEvent();
    throw error;
  } finally {
    running = false;
  }
}

export function startSyncLoop(params: {
  getAccessToken: () => Promise<string | null> | string | null;
  getScope: () => SyncScope;
  onError?: (error: Error) => void;
}): () => void {
  if (!env.syncEnabled || typeof window === "undefined") return () => undefined;

  let cancelled = false;
  let timer: number | null = null;

  const tick = async () => {
    if (cancelled) return;
    const token = await params.getAccessToken();
    if (!token) return;
    try {
      await runSyncCycle(token, params.getScope());
    } catch (error) {
      if (params.onError && error instanceof Error) {
        params.onError(error);
      }
    }
  };

  const handleOnline = () => {
    void tick();
  };

  window.addEventListener("online", handleOnline);
  timer = window.setInterval(() => {
    void tick();
  }, env.syncIntervalMs);
  void tick();

  return () => {
    cancelled = true;
    window.removeEventListener("online", handleOnline);
    if (timer !== null) {
      window.clearInterval(timer);
    }
  };
}
