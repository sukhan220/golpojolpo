"use client";

/**
 * GolpoJolpo Direct IndexedDB Offline Audio Cache Engine (v1)
 *
 * Works reliably in ALL browsers & DevTools Offline mode WITHOUT relying on Service Worker
 * interception (which Chrome bypasses in DevTools "Offline" mode).
 *
 * How it works:
 * 1. When an audiobook plays, it streams via `/api/stream?t=<token>` as normal, while
 *    progressively caching the audio bytes into IndexedDB (`golpojolpo_offline_audio_v1`)
 *    in the background (with 750 MB LRU eviction cap — supports up to 500 MB audiobooks).
 * 2. If the audio is ALREADY cached in IndexedDB (complete or partial), we instantly create
 *    a local `blob:` URL from IndexedDB memory/disk — ZERO server hits, plays 100% OFFLINE!
 * 3. If the network drops mid-playback, whatever bytes were buffered so far are already saved
 *    in IndexedDB and can be seamlessly played offline from a `blob:` URL.
 */

const DB_NAME = "golpojolpo_offline_audio_v2";
const DB_VERSION = 1;
const STORE_FILES = "audio_files";
const MAX_CACHE_BYTES = 750 * 1024 * 1024; // 750 MB LRU cap
const MIN_VALID_AUDIO_BYTES = 16 * 1024; // 16 KB minimum to avoid caching error pages

let dbPromise = null;
const activeDownloads = new Map(); // token -> { controller, owners: Set<symbol> }
const blobUrlPool = new Map(); // token -> { url, size, total, complete, owners: Set<symbol>, revokeTimer }

function isValidAudioContentType(ct) {
  if (!ct) return true;
  const lower = ct.toLowerCase();
  if (
    lower.includes("application/json") ||
    lower.includes("text/html") ||
    lower.includes("text/plain")
  ) {
    return false;
  }
  return true;
}

function appendQueryParam(urlStr, paramKey, paramVal) {
  try {
    const parsed = new URL(urlStr, window.location.origin);
    parsed.searchParams.set(paramKey, paramVal);
    return parsed.pathname + parsed.search;
  } catch {
    return urlStr + (urlStr.includes("?") ? "&" : "?") + `${paramKey}=${paramVal}`;
  }
}

function openDb() {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return Promise.resolve(null);
  }
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_FILES)) {
          const store = db.createObjectStore(STORE_FILES, { keyPath: "key" });
          store.createIndex("lastAccess", "lastAccess", { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function extractCacheKey(streamUrl) {
  if (!streamUrl) return "";
  try {
    const parsed = new URL(streamUrl, window.location.origin);
    const token = parsed.searchParams.get("t");
    return token || streamUrl;
  } catch {
    return streamUrl;
  }
}

async function idbGet(key) {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_FILES, "readonly");
      const req = tx.objectStore(STORE_FILES).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbPut(record) {
  const db = await openDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_FILES, "readwrite");
      tx.objectStore(STORE_FILES).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function enforceLruCap(keepKey) {
  const db = await openDb();
  if (!db) return;
  try {
    const entries = [];
    let totalBytes = 0;

    await new Promise((resolve) => {
      const tx = db.transaction(STORE_FILES, "readonly");
      const idx = tx.objectStore(STORE_FILES).index("lastAccess");
      const req = idx.openCursor();
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          const v = cursor.value;
          const sz = v.size || (v.blob ? v.blob.size : 0);
          totalBytes += sz;
          entries.push({ key: v.key, size: sz });
          cursor.continue();
        } else {
          resolve();
        }
      };
      req.onerror = () => resolve();
    });

    if (totalBytes <= MAX_CACHE_BYTES) return;
    const targetBytes = Math.floor(MAX_CACHE_BYTES * 0.85);
    const delTx = db.transaction(STORE_FILES, "readwrite");
    const store = delTx.objectStore(STORE_FILES);
    for (const item of entries) {
      if (totalBytes <= targetBytes) break;
      if (item.key === keepKey) continue;
      store.delete(item.key);
      totalBytes -= item.size;
    }
  } catch {
    // Ignore LRU cleanup error
  }
}

async function idbDelete(key) {
  const db = await openDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_FILES, "readwrite");
      tx.objectStore(STORE_FILES).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

/**
 * Deletes a corrupt/broken cached audio entry from IndexedDB & revokes its blob URL.
 */
export async function invalidateOfflineCachedAudio(streamUrl) {
  const key = extractCacheKey(streamUrl);
  if (!key) return;
  const prev = blobUrlPool.get(key);
  if (prev) {
    if (prev.revokeTimer) clearTimeout(prev.revokeTimer);
    if (prev.url) {
      try {
        URL.revokeObjectURL(prev.url);
      } catch {
        // ignore
      }
    }
  }
  blobUrlPool.delete(key);
  await idbDelete(key);
}

/**
 * Ownership-based resource cleanup (React Strict Mode safe).
 * Removes `ownerId` from all blob URL leases and active downloads it acquired.
 * A shared blob: URL is ONLY revoked after a short grace window when ZERO owners remain,
 * preventing React Strict Mode's mount->unmount->remount cycle from revoking active blob URLs.
 */
/**
 * Aborts any in-flight background downloads for OTHER tracks when the user switches audio,
 * preventing wasted Vercel bandwidth on skipped tracks.
 * Whatever partial bytes were already downloaded are still safely flushed to IndexedDB!
 */
export function abortOtherBackgroundCaches(keepStreamUrl, ownerId = null) {
  const keepKey = extractCacheKey(keepStreamUrl);
  for (const [key, dl] of activeDownloads.entries()) {
    if (key === keepKey) continue;
    if (ownerId && dl.owners) {
      dl.owners.delete(ownerId);
      if (dl.owners.size > 0) continue;
    }
    try {
      dl.controller.abort();
    } catch {
      // ignore
    }
    activeDownloads.delete(key);
  }
}

export function releaseOfflineAudioOwner(ownerId) {
  if (!ownerId) return;

  for (const [key, dl] of activeDownloads.entries()) {
    dl.owners.delete(ownerId);
    if (dl.owners.size === 0) {
      try {
        dl.controller.abort();
      } catch {
        // ignore
      }
      activeDownloads.delete(key);
    }
  }

  for (const [key, entry] of blobUrlPool.entries()) {
    if (!entry.owners || !entry.owners.has(ownerId)) continue;
    entry.owners.delete(ownerId);
    if (entry.owners.size === 0 && !entry.revokeTimer) {
      entry.revokeTimer = setTimeout(() => {
        const current = blobUrlPool.get(key);
        if (current && current === entry && current.owners.size === 0) {
          try {
            URL.revokeObjectURL(current.url);
          } catch {
            // ignore
          }
          blobUrlPool.delete(key);
        }
      }, 1500);
    }
  }
}

/**
 * Returns a local `blob:` URL if this audio is cached (complete or partial) in IndexedDB.
 * Registers `ownerId` as an active lease holder so shared blob URLs are never revoked prematurely.
 */
export async function getOfflineCachedAudioUrl(streamUrl, ownerId = null) {
  const key = extractCacheKey(streamUrl);
  if (!key) return null;

  const existing = blobUrlPool.get(key);
  if (existing && existing.url && existing.size >= MIN_VALID_AUDIO_BYTES) {
    if (existing.revokeTimer) {
      clearTimeout(existing.revokeTimer);
      existing.revokeTimer = null;
    }
    if (ownerId) existing.owners.add(ownerId);
    return {
      url: existing.url,
      size: existing.size,
      total: existing.total,
      complete: existing.complete,
    };
  }

  const record = await idbGet(key);
  if (
    record &&
    record.blob &&
    record.blob.size >= MIN_VALID_AUDIO_BYTES &&
    isValidAudioContentType(record.blob.type)
  ) {
    const url = URL.createObjectURL(record.blob);
    const owners = new Set();
    if (ownerId) owners.add(ownerId);
    const entry = {
      url,
      size: record.blob.size,
      total: record.total || record.blob.size,
      complete: Boolean(record.complete),
      owners,
      revokeTimer: null,
    };
    blobUrlPool.set(key, entry);
    // Touch lastAccess for LRU
    idbPut({ ...record, lastAccess: Date.now() }).catch(() => {});
    return {
      url: entry.url,
      size: entry.size,
      total: entry.total,
      complete: entry.complete,
    };
  }

  return null;
}

/**
 * Streams the audio file in the background and saves progressive chunks to IndexedDB.
 * Even if the user goes offline midway, whatever was downloaded so far is saved as a playable Blob!
 *
 * @param {string} streamUrl - `/api/stream?t=...`
 * @param {function} onProgress - optional callback({ loadedBytes, totalBytes, complete, blobUrl })
 */
export async function cacheAudioInBackground(
  streamUrl,
  onProgress,
  ownerId = null,
  fetchUrlOverride = null
) {
  if (typeof window === "undefined" || !streamUrl) return;
  const key = extractCacheKey(streamUrl);
  if (!key) return;

  // Already completely cached?
  const existing = await idbGet(key);
  if (existing && existing.complete && existing.blob && existing.blob.size > 0) {
    const cached = await getOfflineCachedAudioUrl(streamUrl, ownerId);
    if (onProgress && cached) {
      onProgress({
        loadedBytes: cached.size,
        totalBytes: cached.total,
        complete: true,
        blobUrl: cached.url,
      });
    }
    return;
  }

  // Already downloading this exact track? Attach ownerId so it stays alive
  if (activeDownloads.has(key)) {
    if (ownerId) activeDownloads.get(key).owners.add(ownerId);
    return;
  }

  const controller = new AbortController();
  const dlOwners = new Set();
  if (ownerId) dlOwners.add(ownerId);
  activeDownloads.set(key, { controller, owners: dlOwners });

  const chunks = [];
  let loadedBytes = 0;
  let totalBytes = 0;
  let contentType = "audio/mpeg";
  let lastSavedBytes = 0;
  const SAVE_EVERY_BYTES = 2 * 1024 * 1024; // Save partial progress every 2 MB

  try {
    // If a direct Cloudflare R2 Presigned URL is provided, fetch directly from R2 (NEVER mutate SigV4 query params!)
    const directFetchUrl = fetchUrlOverride
      ? fetchUrlOverride
      : appendQueryParam(streamUrl, "bypass_sw", "1");
    const res = await fetch(directFetchUrl, {
      method: "GET",
      signal: controller.signal,
    });

    if (!res.ok || res.status === 206) {
      activeDownloads.delete(key);
      return;
    }

    contentType = res.headers.get("content-type") || "audio/mpeg";
    if (!isValidAudioContentType(contentType)) {
      activeDownloads.delete(key);
      return;
    }

    totalBytes = Number(res.headers.get("content-length") || 0);

    if (res.body && typeof res.body.getReader === "function") {
      const reader = res.body.getReader();
      let done = false;

      while (!done) {
        const { value, done: readerDone } = await reader.read();
        done = readerDone;
        if (value && value.byteLength > 0) {
          chunks.push(value);
          loadedBytes += value.byteLength;

          if (onProgress) {
            onProgress({
              loadedBytes,
              totalBytes: totalBytes || loadedBytes,
              complete: false,
              blobUrl: null,
            });
          }

          // Periodically flush partial blob to IndexedDB so offline cut mid-stream still works!
          if (loadedBytes - lastSavedBytes >= SAVE_EVERY_BYTES) {
            lastSavedBytes = loadedBytes;
            const partialBlob = new Blob(chunks, { type: contentType });
            await idbPut({
              key,
              blob: partialBlob,
              size: partialBlob.size,
              total: totalBytes || partialBlob.size,
              complete: false,
              lastAccess: Date.now(),
            });
          }
        }
      }
    } else {
      const buf = await res.arrayBuffer();
      chunks.push(new Uint8Array(buf));
      loadedBytes = buf.byteLength;
    }

    if (loadedBytes > 0) {
      const fullBlob = new Blob(chunks, { type: contentType });
      const isComplete = totalBytes > 0 ? loadedBytes >= totalBytes : true;

      await idbPut({
        key,
        blob: fullBlob,
        size: fullBlob.size,
        total: totalBytes || fullBlob.size,
        complete: isComplete,
        lastAccess: Date.now(),
      });

      // Replace pool entry only if no active owner is still playing the previous blob URL
      const prev = blobUrlPool.get(key);
      const preservedOwners = prev?.owners ? new Set(prev.owners) : new Set();
      if (ownerId) preservedOwners.add(ownerId);
      if (prev?.revokeTimer) clearTimeout(prev.revokeTimer);
      if (prev?.url && (!prev.owners || prev.owners.size === 0)) {
        try {
          URL.revokeObjectURL(prev.url);
        } catch {
          // ignore
        }
      }
      const newUrl = URL.createObjectURL(fullBlob);
      blobUrlPool.set(key, {
        url: newUrl,
        size: fullBlob.size,
        total: totalBytes || fullBlob.size,
        complete: isComplete,
        owners: preservedOwners,
        revokeTimer: null,
      });

      if (onProgress) {
        onProgress({
          loadedBytes: fullBlob.size,
          totalBytes: totalBytes || fullBlob.size,
          complete: isComplete,
          blobUrl: newUrl,
        });
      }

      enforceLruCap(key).catch(() => {});
    }
  } catch {
    // Network dropped midway — save whatever chunks were received so they play offline!
    if (chunks.length > 0 && loadedBytes > 0) {
      const partialBlob = new Blob(chunks, { type: contentType });
      await idbPut({
        key,
        blob: partialBlob,
        size: partialBlob.size,
        total: totalBytes || partialBlob.size,
        complete: false,
        lastAccess: Date.now(),
      });
      const prev = blobUrlPool.get(key);
      const preservedOwners = prev?.owners ? new Set(prev.owners) : new Set();
      if (ownerId) preservedOwners.add(ownerId);
      if (prev?.revokeTimer) clearTimeout(prev.revokeTimer);
      if (prev?.url && (!prev.owners || prev.owners.size === 0)) {
        try {
          URL.revokeObjectURL(prev.url);
        } catch {
          // ignore
        }
      }
      const partialUrl = URL.createObjectURL(partialBlob);
      blobUrlPool.set(key, {
        url: partialUrl,
        size: partialBlob.size,
        total: totalBytes || partialBlob.size,
        complete: false,
        owners: preservedOwners,
        revokeTimer: null,
      });
    }
  } finally {
    activeDownloads.delete(key);
  }
}
