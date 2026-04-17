type CachedArrival = {
  reservation_id: string;
  reservation_code: string;
  check_in_date?: string | null;
  check_out_date?: string | null;
  status?: string | null;
  guest_name?: string | null;
  total_amount?: number | null;
  amount_paid_verified?: number | null;
  balance_due?: number | null;
  signed_hash?: string | null;
  signed_token?: {
    jti: string;
    expires_at: string;
    rotation_version: number;
    signature: string;
  } | null;
  cached_at: string;
  signature_hint?: string | null;
};

type CacheRecord = {
  date_key: string;
  generated_at: string;
  valid_until: string;
  count: number;
  updated_at: string;
  items: CachedArrival[];
};

const DB_NAME = "hillside-checkin-cache-v1";
const STORE_NAME = "kv";
const RECORD_KEY = "today-arrivals";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Failed to open arrivals cache DB."));
  });
}

function normalizeItems(items: unknown[]): CachedArrival[] {
  const normalized: CachedArrival[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const reservation_id = String((item as { reservation_id?: unknown }).reservation_id || "").trim();
    const reservation_code = String((item as { reservation_code?: unknown }).reservation_code || "").trim();
    if (!reservation_id || !reservation_code) continue;
    const total = Number((item as { total_amount?: unknown }).total_amount ?? 0);
    const paid = Number((item as { amount_paid_verified?: unknown }).amount_paid_verified ?? 0);
    const balance = Number((item as { balance_due?: unknown }).balance_due ?? Math.max(total - paid, 0));
    normalized.push({
      reservation_id,
      reservation_code,
      check_in_date: String((item as { check_in_date?: unknown }).check_in_date || "") || null,
      check_out_date: String((item as { check_out_date?: unknown }).check_out_date || "") || null,
      status: String((item as { status?: unknown }).status || "") || null,
      guest_name: String((item as { guest_name?: unknown }).guest_name || "") || null,
      total_amount: Number.isFinite(total) ? total : 0,
      amount_paid_verified: Number.isFinite(paid) ? paid : 0,
      balance_due: Number.isFinite(balance) ? balance : 0,
      signed_hash: String((item as { signed_hash?: unknown }).signed_hash || "") || null,
      signed_token: (() => {
        const token = (item as { signed_token?: unknown }).signed_token;
        if (!token || typeof token !== "object") return null;
        const jti = String((token as { jti?: unknown }).jti || "").trim();
        const expires_at = String((token as { expires_at?: unknown }).expires_at || "").trim();
        const signature = String((token as { signature?: unknown }).signature || "").trim();
        const rotation_version = Number((token as { rotation_version?: unknown }).rotation_version ?? 0);
        if (!jti || !expires_at || !signature || !Number.isFinite(rotation_version) || rotation_version < 1) return null;
        return {
          jti,
          expires_at,
          signature,
          rotation_version: Math.floor(rotation_version),
        };
      })(),
      cached_at: String((item as { cached_at?: unknown }).cached_at || new Date().toISOString()),
      signature_hint: String((item as { signature_hint?: unknown }).signature_hint || "") || null,
    });
  }
  return normalized;
}

export async function saveTodayArrivalsCache(items: CachedArrival[], dateKey: string): Promise<void> {
  const db = await openDb();
  try {
    const generatedAt = new Date().toISOString();
    const validUntilDate = new Date();
    validUntilDate.setHours(23, 59, 59, 999);
    validUntilDate.setDate(validUntilDate.getDate() + 1);
    const record: CacheRecord = {
      date_key: dateKey,
      generated_at: generatedAt,
      valid_until: validUntilDate.toISOString(),
      count: normalizeItems(items).length,
      updated_at: generatedAt,
      items: normalizeItems(items),
    };
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(record, RECORD_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("Failed to save arrivals cache."));
      tx.onabort = () => reject(tx.error || new Error("Arrivals cache save aborted."));
    });
  } finally {
    db.close();
  }
}

export async function loadTodayArrivalsCache(): Promise<CacheRecord | null> {
  const db = await openDb();
  try {
    const record = await new Promise<CacheRecord | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).get(RECORD_KEY);
      request.onsuccess = () => resolve((request.result as CacheRecord | null) ?? null);
      request.onerror = () => reject(request.error || new Error("Failed to load arrivals cache."));
    });
    if (!record) return null;
    return {
      ...record,
      items: normalizeItems(Array.isArray(record.items) ? record.items : []),
    };
  } catch {
    return null;
  } finally {
    db.close();
  }
}

export async function clearTodayArrivalsCache(): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(RECORD_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("Failed to clear arrivals cache."));
      tx.onabort = () => reject(tx.error || new Error("Arrivals cache clear aborted."));
    });
  } finally {
    db.close();
  }
}

export type { CachedArrival, CacheRecord };
