import type { QrToken } from "../../packages/shared/src/types";

const KEY_STORAGE = "hillside_qr_public_key_v1";
const DB_NAME = "hillside-qr-local-v1";
const STORE_NAME = "used_jti";

export type TokenLocalVerdict = "valid" | "invalid" | "expired" | "replayed" | "missing_key";

export type TokenLocalVerifyResult = {
  verdict: TokenLocalVerdict;
  reason: string | null;
};

function toEpochSeconds(expiresAt: string): number {
  const millis = Date.parse(expiresAt);
  if (!Number.isFinite(millis)) return 0;
  return Math.floor(millis / 1000);
}

function buildCanonicalPayload(token: QrToken, reservationCodeHint?: string | null) {
  const reservationCode = token.reservation_code || reservationCodeHint || "";
  return `${token.jti}|${token.reservation_id}|${reservationCode}|${toEpochSeconds(token.expires_at)}|${token.rotation_version}`;
}

function hexToBytes(value: string): Uint8Array {
  const normalized = value.trim().toLowerCase();
  if (!/^[0-9a-f]+$/.test(normalized) || normalized.length % 2 !== 0) {
    throw new Error("Invalid hex payload.");
  }
  const bytes = new Uint8Array(normalized.length / 2);
  for (let index = 0; index < normalized.length; index += 2) {
    bytes[index / 2] = Number.parseInt(normalized.slice(index, index + 2), 16);
  }
  return bytes;
}

function base64UrlToBytes(value: string): Uint8Array {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

async function importEd25519PublicKey(publicKeyBase64Url: string): Promise<CryptoKey> {
  const keyData = base64UrlToBytes(publicKeyBase64Url);
  return crypto.subtle.importKey("raw", toArrayBuffer(keyData), { name: "Ed25519" }, false, ["verify"]);
}

async function verifyEd25519HexSignature(
  token: QrToken,
  publicKeyBase64Url: string,
  reservationCodeHint?: string | null,
): Promise<boolean> {
  const signature = hexToBytes(token.signature);
  if (signature.length !== 64) return false;
  const message = new TextEncoder().encode(buildCanonicalPayload(token, reservationCodeHint));
  const key = await importEd25519PublicKey(publicKeyBase64Url);
  return crypto.subtle.verify("Ed25519", key, toArrayBuffer(signature), toArrayBuffer(message));
}

function openReplayDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "jti" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Unable to open local replay DB."));
  });
}

export async function isQrJtiReplayed(jti: string): Promise<boolean> {
  const db = await openReplayDb();
  try {
    const result = await new Promise<boolean>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const req = tx.objectStore(STORE_NAME).get(jti);
      req.onsuccess = () => resolve(Boolean(req.result));
      req.onerror = () => reject(req.error || new Error("Unable to read JTI replay store."));
    });
    return result;
  } catch {
    return false;
  } finally {
    db.close();
  }
}

export async function markQrJtiUsed(jti: string, reservationCode: string, source: "queued" | "confirmed"): Promise<void> {
  const db = await openReplayDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put({
        jti,
        reservation_code: reservationCode,
        source,
        used_at: new Date().toISOString(),
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error("Unable to persist JTI replay marker."));
      tx.onabort = () => reject(tx.error || new Error("Persist JTI replay marker aborted."));
    });
  } finally {
    db.close();
  }
}

export function loadCachedQrPublicKey(): string | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage.getItem(KEY_STORAGE);
  } catch {
    return null;
  }
}

export function cacheQrPublicKey(publicKey: string): void {
  try {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(KEY_STORAGE, publicKey);
  } catch {
    // No-op
  }
}

export async function verifyQrTokenLocally(
  token: QrToken,
  publicKeyBase64Url: string | null,
  options?: { reservationCodeHint?: string | null; verifyReplay?: boolean },
): Promise<TokenLocalVerifyResult> {
  const leewayMs = 5000;
  if (Date.parse(token.expires_at) + leewayMs < Date.now()) {
    return { verdict: "expired", reason: "QR token expired. Ask guest to refresh QR." };
  }
  if (!publicKeyBase64Url) {
    return { verdict: "missing_key", reason: "Offline verifier key missing. Reconnect once to refresh check-in key." };
  }
  if (options?.verifyReplay) {
    const replayed = await isQrJtiReplayed(token.jti);
    if (replayed) {
      return { verdict: "replayed", reason: "QR token already used locally. Ask guest to show a fresh QR." };
    }
  }
  try {
    const valid = await verifyEd25519HexSignature(token, publicKeyBase64Url, options?.reservationCodeHint);
    if (!valid) {
      return { verdict: "invalid", reason: "Invalid QR signature." };
    }
    return { verdict: "valid", reason: null };
  } catch {
    return { verdict: "invalid", reason: "Failed to verify QR signature locally." };
  }
}
