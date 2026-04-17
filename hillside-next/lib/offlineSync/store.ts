import type {
  AdminPaymentsResponse,
  DashboardSummaryResponse,
  MyBookingsResponse,
  OfflineOperation,
  ReservationListResponse,
  SyncPullEvent,
  UploadQueueItem,
} from "../../../packages/shared/src/types";
import { decryptJson, encryptJson } from "./crypto";

const DB_NAME = "hillside-offline-sync-v1";
const DB_VERSION = 2;

const STORES = {
  entities: "entities",
  outbox: "outbox",
  uploadQueue: "upload_queue",
  uploadBlobs: "upload_blobs",
  syncState: "sync_state",
  conflicts: "conflicts",
  snapshots: "snapshots",
} as const;

export type SyncScope = "me" | "admin";
export type OutboxStatus = "queued" | "syncing" | "failed" | "applied";
export type SnapshotKey =
  | "bookings_snapshot"
  | "reservations_snapshot"
  | "dashboard_snapshot"
  | "map_snapshot"
  | "payments_snapshot";

type OfflineSnapshotEnvelope<T> = {
  data: T;
  cached_at: string;
  scope: SyncScope;
  source_cursor?: number | null;
  expires_at?: string | null;
};

type SnapshotRecord<T = Record<string, unknown>> = {
  snapshot_pk: string;
  snapshot_key: SnapshotKey;
  scope: SyncScope;
  variant_key: string;
  payload: OfflineSnapshotEnvelope<T>;
  updated_at: string;
};

type MapSnapshotAmenity = {
  id: string;
  name: string;
  description: string;
  x: number;
  y: number;
  kind: "trail" | "facility";
};

type EntityRecord = {
  pk: string;
  entity_type: string;
  entity_id: string;
  payload: Record<string, unknown>;
  version: number;
  changed_at: string;
  updated_at: string;
};

type OutboxRecord = OfflineOperation & {
  status: OutboxStatus;
  payload: Record<string, unknown>;
  encrypted_payload?: string | null;
  is_sensitive: boolean;
  last_error?: string | null;
  next_retry_at?: string | null;
  updated_at: string;
};

type SyncStateRecord = {
  scope: SyncScope;
  cursor: number;
  next_cursor: number;
  last_synced_at: string | null;
  last_error: string | null;
};

export type ConflictRecord = {
  operation_id: string;
  entity_type: string;
  action: string;
  reason: string;
  server_version?: number | null;
  resolution_hint?: string | null;
  payload: Record<string, unknown>;
  created_at: string;
};

type UploadBlobRecord = {
  upload_id: string;
  file_name: string | null;
  blob: Blob;
  created_at: string;
  updated_at: string;
};

function isBrowser(): boolean {
  return typeof window !== "undefined" && typeof indexedDB !== "undefined";
}

function requestToPromise<T = unknown>(request: IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed."));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("IndexedDB transaction failed."));
    tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted."));
  });
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (!isBrowser()) {
    return Promise.reject(new Error("Offline store is only available in browser context."));
  }
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORES.entities)) {
        const store = db.createObjectStore(STORES.entities, { keyPath: "pk" });
        store.createIndex("by_entity_type", "entity_type", { unique: false });
        store.createIndex("by_updated_at", "updated_at", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.outbox)) {
        const store = db.createObjectStore(STORES.outbox, { keyPath: "operation_id" });
        store.createIndex("by_status", "status", { unique: false });
        store.createIndex("by_created_at", "created_at", { unique: false });
        store.createIndex("by_next_retry_at", "next_retry_at", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.uploadQueue)) {
        const store = db.createObjectStore(STORES.uploadQueue, { keyPath: "upload_id" });
        store.createIndex("by_status", "status", { unique: false });
        store.createIndex("by_operation_id", "operation_id", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.uploadBlobs)) {
        db.createObjectStore(STORES.uploadBlobs, { keyPath: "upload_id" });
      }
      if (!db.objectStoreNames.contains(STORES.syncState)) {
        db.createObjectStore(STORES.syncState, { keyPath: "scope" });
      }
      if (!db.objectStoreNames.contains(STORES.conflicts)) {
        const store = db.createObjectStore(STORES.conflicts, { keyPath: "operation_id" });
        store.createIndex("by_created_at", "created_at", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.snapshots)) {
        const store = db.createObjectStore(STORES.snapshots, { keyPath: "snapshot_pk" });
        store.createIndex("by_scope", "scope", { unique: false });
        store.createIndex("by_updated_at", "updated_at", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Failed to open offline sync database."));
  });
  return dbPromise;
}

function isSensitiveOperation(op: OfflineOperation): boolean {
  return op.entity_type === "payment_submission" || op.entity_type === "checkin" || op.entity_type === "checkout";
}

export async function queueOfflineOperation(operation: OfflineOperation): Promise<void> {
  if (!isBrowser()) return;
  const db = await openDb();
  const nowIso = new Date().toISOString();
  const sensitive = isSensitiveOperation(operation);
  const encryptedPayload = sensitive ? await encryptJson(operation.payload) : null;
  const record: OutboxRecord = {
    ...operation,
    payload: sensitive ? {} : operation.payload,
    encrypted_payload: encryptedPayload,
    is_sensitive: sensitive,
    status: "queued",
    last_error: null,
    next_retry_at: null,
    updated_at: nowIso,
  };
  const tx = db.transaction(STORES.outbox, "readwrite");
  tx.objectStore(STORES.outbox).put(record);
  await txDone(tx);
}

async function decodeOutboxRecord(record: OutboxRecord): Promise<OutboxRecord> {
  if (!record.is_sensitive) return record;
  const decrypted = await decryptJson<Record<string, unknown>>(record.encrypted_payload || null);
  return {
    ...record,
    payload: decrypted || {},
  };
}

export async function listReadyOutbox(limit: number): Promise<OutboxRecord[]> {
  if (!isBrowser()) return [];
  const db = await openDb();
  const tx = db.transaction(STORES.outbox, "readonly");
  const store = tx.objectStore(STORES.outbox);
  const all = (await requestToPromise<OutboxRecord[]>(store.getAll())) || [];
  await txDone(tx);
  const nowMs = Date.now();
  const ready = all
    .filter((item) => item.status === "queued" || item.status === "failed")
    .filter((item) => {
      if (!item.next_retry_at) return true;
      const retryMs = Date.parse(item.next_retry_at);
      return Number.isNaN(retryMs) || retryMs <= nowMs;
    })
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
    .slice(0, Math.max(1, limit));
  const decoded: OutboxRecord[] = [];
  for (const item of ready) {
    decoded.push(await decodeOutboxRecord(item));
  }
  return decoded;
}

export async function markOutboxSyncing(operationIds: string[]): Promise<void> {
  if (!isBrowser() || operationIds.length === 0) return;
  const db = await openDb();
  const tx = db.transaction(STORES.outbox, "readwrite");
  const store = tx.objectStore(STORES.outbox);
  for (const operationId of operationIds) {
    const row = (await requestToPromise<OutboxRecord | undefined>(store.get(operationId))) || undefined;
    if (!row) continue;
    row.status = "syncing";
    row.updated_at = new Date().toISOString();
    store.put(row);
  }
  await txDone(tx);
}

export async function markOutboxApplied(operationId: string): Promise<void> {
  if (!isBrowser()) return;
  const db = await openDb();
  const tx = db.transaction(STORES.outbox, "readwrite");
  const store = tx.objectStore(STORES.outbox);
  const row = (await requestToPromise<OutboxRecord | undefined>(store.get(operationId))) || undefined;
  if (row) {
    row.status = "applied";
    row.updated_at = new Date().toISOString();
    row.last_error = null;
    row.next_retry_at = null;
    store.put(row);
  }
  await txDone(tx);
}

export async function markOutboxFailed(
  operationId: string,
  errorMessage: string,
  retryCount: number,
  maxRetryDelayMs: number,
): Promise<void> {
  if (!isBrowser()) return;
  const db = await openDb();
  const tx = db.transaction(STORES.outbox, "readwrite");
  const store = tx.objectStore(STORES.outbox);
  const row = (await requestToPromise<OutboxRecord | undefined>(store.get(operationId))) || undefined;
  if (row) {
    const safeRetry = Math.max(0, retryCount);
    const delayMs = Math.min(maxRetryDelayMs, 1000 * Math.pow(2, safeRetry + 1));
    row.retry_count = safeRetry;
    row.status = "failed";
    row.last_error = errorMessage;
    row.next_retry_at = new Date(Date.now() + delayMs).toISOString();
    row.updated_at = new Date().toISOString();
    store.put(row);
  }
  await txDone(tx);
}

export async function addConflict(conflict: ConflictRecord): Promise<void> {
  if (!isBrowser()) return;
  const db = await openDb();
  const tx = db.transaction(STORES.conflicts, "readwrite");
  tx.objectStore(STORES.conflicts).put(conflict);
  await txDone(tx);
}

export async function removeConflict(operationId: string): Promise<void> {
  if (!isBrowser()) return;
  const db = await openDb();
  const tx = db.transaction(STORES.conflicts, "readwrite");
  tx.objectStore(STORES.conflicts).delete(operationId);
  await txDone(tx);
}

export async function clearConflicts(): Promise<void> {
  if (!isBrowser()) return;
  const db = await openDb();
  const tx = db.transaction(STORES.conflicts, "readwrite");
  tx.objectStore(STORES.conflicts).clear();
  await txDone(tx);
}

export async function listConflicts(limit = 50): Promise<ConflictRecord[]> {
  if (!isBrowser()) return [];
  const db = await openDb();
  const tx = db.transaction(STORES.conflicts, "readonly");
  const rows = (await requestToPromise<ConflictRecord[]>(tx.objectStore(STORES.conflicts).getAll())) || [];
  await txDone(tx);
  return rows
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
    .slice(0, Math.max(1, limit));
}

export async function applyPullEvents(events: SyncPullEvent[]): Promise<void> {
  if (!isBrowser() || events.length === 0) return;
  const db = await openDb();
  const tx = db.transaction(STORES.entities, "readwrite");
  const store = tx.objectStore(STORES.entities);
  for (const event of events) {
    const pk = `${event.entity_type}:${event.entity_id}`;
    if (event.action === "delete") {
      store.delete(pk);
      continue;
    }
    const record: EntityRecord = {
      pk,
      entity_type: event.entity_type,
      entity_id: event.entity_id,
      payload: event.payload,
      version: event.version,
      changed_at: event.changed_at,
      updated_at: new Date().toISOString(),
    };
    store.put(record);
  }
  await txDone(tx);
}

export async function getSyncState(scope: SyncScope): Promise<SyncStateRecord> {
  if (!isBrowser()) {
    return {
      scope,
      cursor: 0,
      next_cursor: 0,
      last_synced_at: null,
      last_error: null,
    };
  }
  const db = await openDb();
  const tx = db.transaction(STORES.syncState, "readonly");
  const existing = (await requestToPromise<SyncStateRecord | undefined>(tx.objectStore(STORES.syncState).get(scope))) || undefined;
  await txDone(tx);
  if (existing) return existing;
  return {
    scope,
    cursor: 0,
    next_cursor: 0,
    last_synced_at: null,
    last_error: null,
  };
}

export async function setSyncState(
  scope: SyncScope,
  patch: Partial<SyncStateRecord>,
): Promise<SyncStateRecord> {
  if (!isBrowser()) {
    return {
      scope,
      cursor: patch.cursor ?? 0,
      next_cursor: patch.next_cursor ?? 0,
      last_synced_at: patch.last_synced_at ?? null,
      last_error: patch.last_error ?? null,
    };
  }
  const existing = await getSyncState(scope);
  const next: SyncStateRecord = {
    ...existing,
    ...patch,
    scope,
  };
  const db = await openDb();
  const tx = db.transaction(STORES.syncState, "readwrite");
  tx.objectStore(STORES.syncState).put(next);
  await txDone(tx);
  return next;
}

export async function listOutboxSummary(): Promise<{
  queued: number;
  syncing: number;
  failed: number;
  applied: number;
}> {
  if (!isBrowser()) {
    return { queued: 0, syncing: 0, failed: 0, applied: 0 };
  }
  const db = await openDb();
  const tx = db.transaction(STORES.outbox, "readonly");
  const rows = (await requestToPromise<OutboxRecord[]>(tx.objectStore(STORES.outbox).getAll())) || [];
  await txDone(tx);
  return rows.reduce(
    (acc, row) => {
      acc[row.status] += 1;
      return acc;
    },
    { queued: 0, syncing: 0, failed: 0, applied: 0 } as Record<OutboxStatus, number>,
  );
}

export async function listOutboxRecords(limit = 100): Promise<OutboxRecord[]> {
  if (!isBrowser()) return [];
  const db = await openDb();
  const tx = db.transaction(STORES.outbox, "readonly");
  const rows = (await requestToPromise<OutboxRecord[]>(tx.objectStore(STORES.outbox).getAll())) || [];
  await txDone(tx);
  const sorted = rows.sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at)).slice(0, Math.max(1, limit));
  const decoded: OutboxRecord[] = [];
  for (const row of sorted) {
    decoded.push(await decodeOutboxRecord(row));
  }
  return decoded;
}

export async function retryOutboxOperation(operationId: string): Promise<void> {
  if (!isBrowser()) return;
  const db = await openDb();
  const tx = db.transaction(STORES.outbox, "readwrite");
  const store = tx.objectStore(STORES.outbox);
  const row = (await requestToPromise<OutboxRecord | undefined>(store.get(operationId))) || undefined;
  if (row) {
    row.status = "queued";
    row.last_error = null;
    row.next_retry_at = null;
    row.updated_at = new Date().toISOString();
    store.put(row);
  }
  await txDone(tx);
}

export async function discardOperation(operationId: string): Promise<void> {
  if (!isBrowser()) return;
  const db = await openDb();
  const tx = db.transaction(
    [STORES.outbox, STORES.uploadQueue, STORES.uploadBlobs, STORES.conflicts],
    "readwrite",
  );
  const outboxStore = tx.objectStore(STORES.outbox);
  const uploadStore = tx.objectStore(STORES.uploadQueue);
  const uploadBlobStore = tx.objectStore(STORES.uploadBlobs);
  const conflictsStore = tx.objectStore(STORES.conflicts);

  const linkedUploads =
    ((await requestToPromise<any[]>(uploadStore.index("by_operation_id").getAll(operationId))) || []) as UploadQueueItem[];

  for (const item of linkedUploads) {
    if (item.upload_id) {
      uploadStore.delete(item.upload_id);
      uploadBlobStore.delete(item.upload_id);
    }
  }

  outboxStore.delete(operationId);
  conflictsStore.delete(operationId);
  await txDone(tx);
}

export async function queueUploadItem(item: UploadQueueItem): Promise<void> {
  if (!isBrowser()) return;
  const db = await openDb();
  const tx = db.transaction(STORES.uploadQueue, "readwrite");
  tx.objectStore(STORES.uploadQueue).put(item);
  await txDone(tx);
}

export async function listUploadQueue(status?: UploadQueueItem["status"]): Promise<UploadQueueItem[]> {
  if (!isBrowser()) return [];
  const db = await openDb();
  const tx = db.transaction(STORES.uploadQueue, "readonly");
  const rows = (await requestToPromise<UploadQueueItem[]>(tx.objectStore(STORES.uploadQueue).getAll())) || [];
  await txDone(tx);
  if (!status) return rows;
  return rows.filter((row) => row.status === status);
}

export async function updateUploadQueueItem(
  uploadId: string,
  patch: Partial<UploadQueueItem>,
): Promise<void> {
  if (!isBrowser()) return;
  const db = await openDb();
  const tx = db.transaction(STORES.uploadQueue, "readwrite");
  const store = tx.objectStore(STORES.uploadQueue);
  const row = (await requestToPromise<UploadQueueItem | undefined>(store.get(uploadId))) || undefined;
  if (row) {
    store.put({ ...row, ...patch });
  }
  await txDone(tx);
}

export async function saveUploadBlob(uploadId: string, blob: Blob, fileName?: string | null): Promise<void> {
  if (!isBrowser()) return;
  const db = await openDb();
  const tx = db.transaction(STORES.uploadBlobs, "readwrite");
  const store = tx.objectStore(STORES.uploadBlobs);
  const now = new Date().toISOString();
  const record: UploadBlobRecord = {
    upload_id: uploadId,
    file_name: fileName ?? null,
    blob,
    created_at: now,
    updated_at: now,
  };
  store.put(record);
  await txDone(tx);
}

export async function getUploadBlob(uploadId: string): Promise<UploadBlobRecord | null> {
  if (!isBrowser()) return null;
  const db = await openDb();
  const tx = db.transaction(STORES.uploadBlobs, "readonly");
  const store = tx.objectStore(STORES.uploadBlobs);
  const record = (await requestToPromise<UploadBlobRecord | undefined>(store.get(uploadId))) || null;
  await txDone(tx);
  return record;
}

export async function deleteUploadBlob(uploadId: string): Promise<void> {
  if (!isBrowser()) return;
  const db = await openDb();
  const tx = db.transaction(STORES.uploadBlobs, "readwrite");
  tx.objectStore(STORES.uploadBlobs).delete(uploadId);
  await txDone(tx);
}

function snapshotPk(snapshotKey: SnapshotKey, scope: SyncScope, variantKey?: string) {
  const normalizedVariant = (variantKey || "default").trim() || "default";
  return `${scope}:${snapshotKey}:${normalizedVariant}`;
}

export async function saveOfflineSnapshot<T>(
  snapshotKey: SnapshotKey,
  scope: SyncScope,
  data: T,
  options?: {
    variantKey?: string;
    sourceCursor?: number | null;
    expiresAt?: string | null;
  },
): Promise<void> {
  if (!isBrowser()) return;
  const db = await openDb();
  const nowIso = new Date().toISOString();
  const payload: OfflineSnapshotEnvelope<T> = {
    data,
    cached_at: nowIso,
    scope,
    source_cursor: options?.sourceCursor ?? null,
    expires_at: options?.expiresAt ?? null,
  };
  const record: SnapshotRecord<T> = {
    snapshot_pk: snapshotPk(snapshotKey, scope, options?.variantKey),
    snapshot_key: snapshotKey,
    scope,
    variant_key: (options?.variantKey || "default").trim() || "default",
    payload,
    updated_at: nowIso,
  };

  const tx = db.transaction(STORES.snapshots, "readwrite");
  tx.objectStore(STORES.snapshots).put(record);
  await txDone(tx);
}

export async function loadOfflineSnapshot<T>(
  snapshotKey: SnapshotKey,
  scope: SyncScope,
  options?: { variantKey?: string },
): Promise<OfflineSnapshotEnvelope<T> | null> {
  if (!isBrowser()) return null;
  const db = await openDb();
  const tx = db.transaction(STORES.snapshots, "readonly");
  const store = tx.objectStore(STORES.snapshots);
  const row =
    (await requestToPromise<SnapshotRecord<T> | undefined>(
      store.get(snapshotPk(snapshotKey, scope, options?.variantKey)),
    )) || undefined;
  await txDone(tx);
  return row?.payload ?? null;
}

export async function saveBookingsSnapshot(
  scope: SyncScope,
  data: MyBookingsResponse,
  options?: { variantKey?: string; sourceCursor?: number | null; expiresAt?: string | null },
): Promise<void> {
  await saveOfflineSnapshot("bookings_snapshot", scope, data, options);
}

export async function loadBookingsSnapshot(
  scope: SyncScope,
  options?: { variantKey?: string },
): Promise<OfflineSnapshotEnvelope<MyBookingsResponse> | null> {
  return loadOfflineSnapshot<MyBookingsResponse>("bookings_snapshot", scope, options);
}

export async function saveReservationsSnapshot(
  scope: SyncScope,
  data: ReservationListResponse,
  options?: { variantKey?: string; sourceCursor?: number | null; expiresAt?: string | null },
): Promise<void> {
  await saveOfflineSnapshot("reservations_snapshot", scope, data, options);
}

export async function loadReservationsSnapshot(
  scope: SyncScope,
  options?: { variantKey?: string },
): Promise<OfflineSnapshotEnvelope<ReservationListResponse> | null> {
  return loadOfflineSnapshot<ReservationListResponse>("reservations_snapshot", scope, options);
}

export async function saveDashboardSnapshot(
  scope: SyncScope,
  data: DashboardSummaryResponse,
  options?: { variantKey?: string; sourceCursor?: number | null; expiresAt?: string | null },
): Promise<void> {
  await saveOfflineSnapshot("dashboard_snapshot", scope, data, options);
}

export async function loadDashboardSnapshot(
  scope: SyncScope,
  options?: { variantKey?: string },
): Promise<OfflineSnapshotEnvelope<DashboardSummaryResponse> | null> {
  return loadOfflineSnapshot<DashboardSummaryResponse>("dashboard_snapshot", scope, options);
}

export async function saveMapSnapshot(
  scope: SyncScope,
  data: { amenities: MapSnapshotAmenity[] },
  options?: { variantKey?: string; sourceCursor?: number | null; expiresAt?: string | null },
): Promise<void> {
  await saveOfflineSnapshot("map_snapshot", scope, data, options);
}

export async function loadMapSnapshot(
  scope: SyncScope,
  options?: { variantKey?: string },
): Promise<OfflineSnapshotEnvelope<{ amenities: MapSnapshotAmenity[] }> | null> {
  return loadOfflineSnapshot<{ amenities: MapSnapshotAmenity[] }>("map_snapshot", scope, options);
}

export async function savePaymentsSnapshot(
  scope: SyncScope,
  data: AdminPaymentsResponse,
  options?: { variantKey?: string; sourceCursor?: number | null; expiresAt?: string | null },
): Promise<void> {
  await saveOfflineSnapshot("payments_snapshot", scope, data, options);
}

export async function loadPaymentsSnapshot(
  scope: SyncScope,
  options?: { variantKey?: string },
): Promise<OfflineSnapshotEnvelope<AdminPaymentsResponse> | null> {
  return loadOfflineSnapshot<AdminPaymentsResponse>("payments_snapshot", scope, options);
}
