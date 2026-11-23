/* eslint-disable no-restricted-globals */
/**
 * GolpoJolpo Page & Static Asset Cache Service Worker (v4)
 *
 * Optimized for minimal Vercel Function Invocations & Fast Data Transfer:
 * 1. Page Shell Caching (Stale-While-Revalidate):
 *    - Caches `/` HTML shell in `golpojolpo_page_cache_v4` for instant loads & offline reload.
 * 2. Static Asset Caching (Cache-First):
 *    - Caches `/_next/static/*`, `/logo.svg`, `/favicon.svg`, `/icon.svg`, fonts & icons
 *      with ZERO repeat Vercel hits.
 * 3. Zero `/api/stream` 206 Flood:
 *    - Audio offline caching is handled in a single clean `200 OK` request by
 *      `lib/audioOfflineCache.js` (IndexedDB `golpojolpo_offline_audio_v2`), so SW does NOT
 *      split audio into 25+ 1MB `206` requests or double-download bandwidth!
 */

const PAGE_CACHE = "golpojolpo_page_cache_v4";
const STATIC_CACHE = "golpojolpo_static_cache_v4";
const VALID_CACHES = new Set([PAGE_CACHE, STATIC_CACHE]);
const OLD_AUDIO_CHUNK_DBS = [
  "golpojolpo_audio_chunks_v1",
  "golpojolpo_audio_chunks_v2",
  "golpojolpo_audio_chunks_v3",
];

function isStaticAsset(url) {
  if (url.origin !== self.location.origin) return false;
  const p = url.pathname;
  return (
    p.startsWith("/_next/static/") ||
    p === "/logo.svg" ||
    p === "/favicon.svg" ||
    p === "/icon.svg" ||
    /\.(?:js|css|svg|png|jpg|jpeg|webp|woff2?|ico)$/i.test(p)
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(PAGE_CACHE)
      .then((cache) => cache.addAll(["/", "/logo.svg", "/favicon.svg"]).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      // Remove outdated caches
      caches.keys().then((keys) =>
        Promise.all(
          keys.map((k) => (!VALID_CACHES.has(k) ? caches.delete(k) : Promise.resolve()))
        )
      ),
      // Clean up legacy SW chunk IDB stores (audio offline cache now lives solely in golpojolpo_offline_audio_v2)
      ...OLD_AUDIO_CHUNK_DBS.map(
        (name) =>
          new Promise((resolve) => {
            try {
              const req = indexedDB.deleteDatabase(name);
              req.onsuccess = () => resolve();
              req.onerror = () => resolve();
              req.onblocked = () => resolve();
            } catch {
              resolve();
            }
          })
      ),
    ])
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Never intercept /api/* routes (audio stream, auth, rate-limit, engagement, sync)
  if (url.pathname.startsWith("/api/")) return;

  // 1. Static Assets (/_next/static/*, svg, fonts, css, js) -> Cache-First (0 repeat Vercel hits)
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(STATIC_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        if (cached) return cached;
        const res = await fetch(req);
        if (res && res.ok && res.status === 200) {
          cache.put(req, res.clone()).catch(() => {});
        }
        return res;
      })
    );
    return;
  }

  // 2. HTML Page Navigations (/) -> Stale-While-Revalidate (instant load + works offline!)
  if (req.mode === "navigate") {
    event.respondWith(
      caches.open(PAGE_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        const networkPromise = fetch(req)
          .then((res) => {
            if (res && res.ok && res.status === 200) {
              cache.put(req, res.clone()).catch(() => {});
            }
            return res;
          })
          .catch(() => null);

        if (cached) {
          event.waitUntil(networkPromise);
          return cached;
        }
        const netRes = await networkPromise;
        if (netRes) return netRes;
        const fallbackHome = await cache.match("/");
        if (fallbackHome) return fallbackHome;
        return new Response("Offline", { status: 503 });
      })
    );
  }
});
