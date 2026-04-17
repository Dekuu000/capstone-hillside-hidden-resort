"use client";

import { useEffect } from "react";

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    const register = async () => {
      const isDev = process.env.NODE_ENV !== "production";
      const allowDevServiceWorker = process.env.NEXT_PUBLIC_ENABLE_SW_IN_DEV === "true";

      const resetServiceWorkerState = async () => {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
        if ("caches" in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((key) => caches.delete(key)));
        }
      };

      if (isDev && !allowDevServiceWorker) {
        // Prevent stale SW-controlled chunks from causing hydration/version mismatches in local dev.
        await resetServiceWorkerState();
        return;
      }

      if (isDev && allowDevServiceWorker) {
        // Dev hot updates can invalidate SSR/client trees while old SW caches still serve stale chunks.
        // Reset first, then register a fresh worker for predictable offline testing.
        await resetServiceWorkerState();
      }

      try {
        await navigator.serviceWorker.register("/sw.js", { scope: "/" });
      } catch {
        // Silent fail in unsupported/dev scenarios.
      }
    };

    void register();
  }, []);

  return null;
}
