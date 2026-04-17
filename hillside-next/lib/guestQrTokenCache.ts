import type { QrToken } from "../../packages/shared/src/types";

type CachedGuestQrToken = {
  reservation_id: string;
  reservation_code: string;
  token: QrToken;
  cached_at: string;
};

const DB_NAME = "hillside-guest-qr-v1";
const STORE_NAME = "tokens";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "reservation_id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Failed to open guest QR token cache."));
  });
}

export async function saveLastIssuedQrToken(record: CachedGuestQrToken): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("Failed to save guest QR token cache."));
      tx.onabort = () => reject(tx.error || new Error("Guest QR token cache save aborted."));
    });
  } finally {
    db.close();
  }
}

export async function loadLastIssuedQrToken(reservationId: string): Promise<CachedGuestQrToken | null> {
  const db = await openDb();
  try {
    const record = await new Promise<CachedGuestQrToken | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).get(reservationId);
      request.onsuccess = () => resolve((request.result as CachedGuestQrToken | null) ?? null);
      request.onerror = () => reject(request.error || new Error("Failed to load guest QR token cache."));
    });
    return record;
  } catch {
    return null;
  } finally {
    db.close();
  }
}

export type { CachedGuestQrToken };

