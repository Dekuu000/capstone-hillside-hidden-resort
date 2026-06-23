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

/**
 * Purge the service-worker offline caches on sign-out so a shared device never
 * serves the previous user's cached (authenticated) pages to the next user.
 * No-op when the Cache Storage API is unavailable (SSR / unsupported browser).
 */
export async function clearOfflineAppCaches() {
  if (typeof window === "undefined" || !("caches" in window)) return;
  try {
    const keys = await caches.keys();
    await Promise.all(keys.filter((key) => key.startsWith("hillside-")).map((key) => caches.delete(key)));
  } catch {
    // Best-effort; never block sign-out on cache cleanup.
  }
}
