const SW_VERSION = "v1.4.0";
const APP_SHELL_CACHE = `hillside-app-shell-${SW_VERSION}`;
const RUNTIME_CACHE = `hillside-runtime-${SW_VERSION}`;
const MAP_CACHE = `hillside-map-${SW_VERSION}`;
const OFFLINE_URL = "/offline.html";

const PRECACHE_URLS = [
  OFFLINE_URL,
  "/",
  "/login",
  "/register",
  "/my-bookings",
  "/tours",
  "/guest/my-stay",
  "/guest/map",
  "/guest/services",
  "/admin",
  "/admin/check-in",
  "/admin/walk-in",
  "/admin/payments",
  "/admin/reservations",
  "/admin/sync",
  "/data/guest-map-amenities.json",
  "/images/resort-map.svg",
];

const GUEST_NAV_FALLBACK = "/guest/my-stay";
const ADMIN_NAV_FALLBACK = "/admin/sync";
const OFFLINE_CAPABLE_NAV_PREFIXES = [
  "/guest/my-stay",
  "/guest/map",
  "/guest/services",
  "/my-bookings",
  "/admin",
  "/admin/check-in",
  "/admin/walk-in",
  "/admin/payments",
  "/admin/reservations",
  "/admin/sync",
];
const LIVE_REQUIRED_PREFIXES = ["/admin/blockchain", "/admin/ai-center", "/api/ai", "/api/blockchain"];

function matchesPrefix(pathname, prefixes) {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(APP_SHELL_CACHE);
      await Promise.allSettled(
        PRECACHE_URLS.map(async (url) => {
          try {
            await cache.add(url);
          } catch {
            // Keep SW install resilient even when some auth routes redirect.
          }
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => ![APP_SHELL_CACHE, RUNTIME_CACHE, MAP_CACHE].includes(key))
          .map((key) => caches.delete(key)),
      ),
    ).then(() => self.clients.claim()),
  );
});

function isNavigationRequest(request) {
  return request.mode === "navigate";
}

function isStaticAsset(requestUrl) {
  return requestUrl.pathname.startsWith("/_next/static/");
}

function isMapAsset(requestUrl) {
  return (
    requestUrl.pathname.startsWith("/guest/map") ||
    requestUrl.pathname === "/data/guest-map-amenities.json" ||
    requestUrl.pathname === "/images/resort-map.svg"
  );
}

function isOfflineCapableNavigation(pathname) {
  return matchesPrefix(pathname, OFFLINE_CAPABLE_NAV_PREFIXES);
}

function isLiveRequiredPath(pathname) {
  return matchesPrefix(pathname, LIVE_REQUIRED_PREFIXES);
}

function cacheNavigationResponse(cache, request, url, response) {
  if (!response || !response.ok) return;
  cache.put(request, response.clone());
  const pathRequest = new Request(url.pathname, { method: "GET" });
  cache.put(pathRequest, response.clone());
}

async function resolveNavigationFallback(url) {
  if (url.pathname.startsWith("/guest") || url.pathname === "/my-bookings") {
    return (await caches.match(GUEST_NAV_FALLBACK)) || (await caches.match(OFFLINE_URL));
  }
  if (url.pathname.startsWith("/admin")) {
    return (
      (await caches.match(ADMIN_NAV_FALLBACK)) ||
      (await caches.match("/admin")) ||
      (await caches.match(OFFLINE_URL))
    );
  }
  return caches.match(OFFLINE_URL);
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;
  if (isLiveRequiredPath(url.pathname)) {
    event.respondWith(fetch(request));
    return;
  }

  if (isNavigationRequest(request)) {
    event.respondWith((async () => {
      const cache = await caches.open(RUNTIME_CACHE);
      const cached = (await cache.match(request)) || (await cache.match(new Request(url.pathname)));

      if (isOfflineCapableNavigation(url.pathname)) {
        const networkRefresh = fetch(request)
          .then((response) => {
            cacheNavigationResponse(cache, request, url, response);
            return response;
          })
          .catch(() => null);

        if (cached) {
          event.waitUntil(networkRefresh);
          return cached;
        }

        const networkResponse = await networkRefresh;
        if (networkResponse) return networkResponse;
        return resolveNavigationFallback(url);
      }

      try {
        const response = await fetch(request);
        cacheNavigationResponse(cache, request, url, response);
        return response;
      } catch {
        if (cached) return cached;
        return resolveNavigationFallback(url);
      }
    })());
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith((async () => {
      const cached = await caches.match(request);
      const refresh = fetch(request)
        .then((response) => {
          caches.open(APP_SHELL_CACHE).then((cache) => cache.put(request, response.clone()));
          return response;
        })
        .catch(() => null);
      if (cached) {
        event.waitUntil(refresh);
        return cached;
      }
      return (await refresh) || (await caches.match(OFFLINE_URL));
    })());
    return;
  }

  if (isMapAsset(url)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        const fetchPromise = fetch(request)
          .then((response) => {
            const cloned = response.clone();
            caches.open(MAP_CACHE).then((cache) => cache.put(request, cloned));
            return response;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      }),
    );
    return;
  }

  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, response.clone()));
      return response;
    } catch {
      return (await caches.match(request)) || (await caches.match(OFFLINE_URL));
    }
  })());
});
