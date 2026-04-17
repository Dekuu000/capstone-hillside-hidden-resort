const KEY_STORAGE = "hs-sync-crypto-key-v1";

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
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

async function getOrCreateRawKey(): Promise<Uint8Array | null> {
  if (typeof window === "undefined") return null;
  const existing = window.localStorage.getItem(KEY_STORAGE);
  if (existing) {
    return fromBase64(existing);
  }
  const next = new Uint8Array(32);
  window.crypto.getRandomValues(next);
  window.localStorage.setItem(KEY_STORAGE, toBase64(next));
  return next;
}

let cachedKey: CryptoKey | null = null;

async function getCryptoKey(): Promise<CryptoKey | null> {
  if (cachedKey) return cachedKey;
  const raw = await getOrCreateRawKey();
  if (!raw) return null;
  const rawKey = new Uint8Array(raw.byteLength);
  rawKey.set(raw);
  cachedKey = await window.crypto.subtle.importKey(
    "raw",
    rawKey,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"],
  );
  return cachedKey;
}

export async function encryptJson(payload: unknown): Promise<string | null> {
  if (typeof window === "undefined") return null;
  const key = await getCryptoKey();
  if (!key) return null;
  const iv = new Uint8Array(12);
  window.crypto.getRandomValues(iv);
  const encoded = new TextEncoder().encode(JSON.stringify(payload));
  const cipher = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded,
  );
  const cipherBytes = new Uint8Array(cipher);
  const packed = new Uint8Array(iv.byteLength + cipherBytes.byteLength);
  packed.set(iv, 0);
  packed.set(cipherBytes, iv.byteLength);
  return toBase64(packed);
}

export async function decryptJson<T>(encrypted: string | null | undefined): Promise<T | null> {
  if (!encrypted || typeof window === "undefined") return null;
  const key = await getCryptoKey();
  if (!key) return null;
  const packed = fromBase64(encrypted);
  if (packed.byteLength <= 12) return null;
  const iv = packed.slice(0, 12);
  const cipher = packed.slice(12);
  try {
    const plain = await window.crypto.subtle.decrypt(
      { name: "AES-GCM", iv },
      key,
      cipher,
    );
    const text = new TextDecoder().decode(plain);
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
