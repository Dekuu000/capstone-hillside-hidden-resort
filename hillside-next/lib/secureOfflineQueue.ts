const DB_NAME = "hillside-secure-offline-v1";
const STORE_NAME = "kv";
const QUEUE_RECORD_KEY = "admin-checkin-qr-queue";
const PBKDF2_ITERATIONS = 120_000;
const PBKDF2_SALT = "hillside.admin.qr.queue.v1";

type QueueRecord = {
  version: 1;
  ciphertext_b64: string;
  iv_b64: string;
  updated_at: string;
};

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i] || 0);
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function openQueueDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Failed to open IndexedDB."));
  });
}

function deriveQueueKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  return crypto.subtle
    .importKey("raw", encoder.encode(secret), { name: "PBKDF2" }, false, ["deriveKey"])
    .then((baseKey) =>
      crypto.subtle.deriveKey(
        {
          name: "PBKDF2",
          salt: encoder.encode(PBKDF2_SALT),
          iterations: PBKDF2_ITERATIONS,
          hash: "SHA-256",
        },
        baseKey,
        { name: "AES-GCM", length: 256 },
        false,
        ["encrypt", "decrypt"],
      ));
}

async function encryptPayload(payload: string, secret: string): Promise<QueueRecord> {
  const key = await deriveQueueKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoded = new TextEncoder().encode(payload);
  const encrypted = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    key,
    encoded,
  );
  return {
    version: 1,
    ciphertext_b64: toBase64(new Uint8Array(encrypted)),
    iv_b64: toBase64(iv),
    updated_at: new Date().toISOString(),
  };
}

async function decryptPayload(record: QueueRecord, secret: string): Promise<string> {
  const key = await deriveQueueKey(secret);
  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: fromBase64(record.iv_b64),
    },
    key,
    fromBase64(record.ciphertext_b64),
  );
  return new TextDecoder().decode(decrypted);
}

export async function saveEncryptedQueue(items: unknown[], secret: string): Promise<void> {
  const db = await openQueueDb();
  try {
    const payload = JSON.stringify(items);
    const encrypted = await encryptPayload(payload, secret);

    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(encrypted, QUEUE_RECORD_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("Failed to store encrypted queue."));
      tx.onabort = () => reject(tx.error || new Error("Encrypted queue transaction aborted."));
    });
  } finally {
    db.close();
  }
}

export async function loadEncryptedQueue(secret: string): Promise<unknown[]> {
  const db = await openQueueDb();
  try {
    const record = await new Promise<QueueRecord | null>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).get(QUEUE_RECORD_KEY);
      request.onsuccess = () => resolve((request.result as QueueRecord | null) ?? null);
      request.onerror = () => reject(request.error || new Error("Failed to load encrypted queue."));
    });

    if (!record) return [];

    const plaintext = await decryptPayload(record, secret);
    const parsed = JSON.parse(plaintext);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  } finally {
    db.close();
  }
}

export async function clearEncryptedQueue(): Promise<void> {
  const db = await openQueueDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(QUEUE_RECORD_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("Failed to clear encrypted queue."));
      tx.onabort = () => reject(tx.error || new Error("Encrypted queue clear aborted."));
    });
  } finally {
    db.close();
  }
}
