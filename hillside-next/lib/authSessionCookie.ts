export async function setServerSessionCookie(accessToken: string, emailValue?: string | null) {
  const response = await fetch("/api/auth/session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    cache: "no-store",
    body: JSON.stringify({ accessToken, email: emailValue ?? null }),
  });
  if (!response.ok) {
    throw new Error("Unable to initialize server session cookie.");
  }
}

export async function clearServerSessionCookie() {
  await fetch("/api/auth/session", { method: "DELETE" });
}

// IndexedDB databases that hold per-user offline data (cached entities, queued
// mutations, guest QR tokens, offline check-in cache). These are per-origin and
// shared across accounts on a device, so they MUST be wiped on sign-out.
const OFFLINE_DB_NAMES = [
  "hillside-offline-sync-v1",
  "hillside-checkin-cache-v1",
  "hillside-guest-qr-v1",
  "hillside-secure-offline-v1",
  "hillside-qr-local-v1",
];

// Wipe every object store inside a database. We CLEAR contents rather than
// deleteDatabase() because the always-mounted sync engine holds an open
// connection, which makes deleteDatabase() block indefinitely. Clearing stores
// works regardless of open connections.
function clearIndexedDb(name: string): Promise<void> {
  return new Promise((resolve) => {
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(name);
    } catch {
      resolve();
      return;
    }
    req.onerror = () => resolve();
    req.onsuccess = () => {
      const db = req.result;
      try {
        const stores = Array.from(db.objectStoreNames);
        if (stores.length === 0) {
          db.close();
          resolve();
          return;
        }
        const tx = db.transaction(stores, "readwrite");
        stores.forEach((store) => {
          try {
            tx.objectStore(store).clear();
          } catch {
            // ignore individual store failures
          }
        });
        const done = () => {
          try {
            db.close();
          } catch {
            // ignore
          }
          resolve();
        };
        tx.oncomplete = done;
        tx.onerror = done;
        tx.onabort = done;
      } catch {
        try {
          db.close();
        } catch {
          // ignore
        }
        resolve();
      }
    };
  });
}

/**
 * Purge ALL on-device user data on sign-out so a shared device never exposes one
 * user's content to the next: service-worker page caches, IndexedDB offline
 * stores (cached reservations, sync outbox, guest QR tokens), and app-scoped
 * localStorage. Best-effort and resilient — never blocks sign-out.
 *
 * Note: any unsynced offline mutations in the outbox are discarded on logout
 * (security over preserving cross-session offline edits).
 */
export async function clearOfflineUserData() {
  if (typeof window === "undefined") return;

  // 1. Service-worker / runtime caches (rendered authenticated pages).
  if ("caches" in window) {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith("hillside-")).map((key) => caches.delete(key)));
    } catch {
      // ignore
    }
  }

  // 2. IndexedDB offline stores. Clear every existing hillside-* database (falls
  //    back to the known list when databases() is unsupported, e.g. Firefox).
  if ("indexedDB" in window) {
    try {
      let targets = OFFLINE_DB_NAMES;
      if (typeof indexedDB.databases === "function") {
        const existing = await indexedDB.databases();
        const found = existing
          .map((db) => db.name)
          .filter((name): name is string => typeof name === "string" && name.startsWith("hillside-"));
        if (found.length) targets = found;
      }
      await Promise.all(targets.map((name) => clearIndexedDb(name)));
    } catch {
      // ignore
    }
  }

  // 3. App-scoped localStorage (booking drafts, local QR key, etc.). Supabase's
  //    own auth keys are cleared by supabase.auth.signOut().
  try {
    const removable = Object.keys(window.localStorage).filter(
      (key) => key.startsWith("hillside") || key.startsWith("hs_") || key.startsWith("hs-"),
    );
    removable.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // ignore
  }
}
