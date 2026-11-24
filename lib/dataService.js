/**
 * Clean Cache-First Service / Repository Pattern Layer
 *
 * ARCHITECTURE:
 * 1. Zero unnecessary Firebase hits:
 *    - Reads from In-Memory & LocalStorage cache first (`golpojolpo_cache_v2_*`).
 *    - Only calls Firebase `getDocs` ONCE when a collection is not yet cached or is invalidated.
 * 2. Reverse API Webhook Sync (`/api/sync`):
 *    - When new items are added via `POST /api/sync`, the Reverse API pushes the delta
 *      (or invalidates the collection) so the client merges the new item into cache
 *      without scanning Firebase repeatedly.
 * 3. Prisma Ready:
 *    - Future migration to Prisma only requires swapping the `fetch*Once` calls here.
 */

import {
  fetchAudioBooksOnce,
  fetchBookNestedSubcollectionsOnce,
  fetchCategoriesOnce,
  fetchShortStoriesOnce,
  fetchWritersOnce,
  normalizeAudioBook,
  normalizeCategory,
  normalizeShortStory,
  normalizeWriter,
} from "./firebase";
import {
  MOCK_CATEGORIES,
  MOCK_AUDIO_BOOKS,
  MOCK_SHORT_STORIES,
  MOCK_WRITERS,
  MOCK_MAGAZINES,
} from "./mockData";

const CACHE_PREFIX = "golpojolpo_cache_v9_";
const SYNC_VERSION_KEY = "golpojolpo_sync_version_v9";
const LAST_SYNC_AT_KEY = "golpojolpo_last_sync_at_v9";

// In-memory cache & active UI subscribers
const memoryCache = {
  categories: null,
  books: null,
  shortStory: null,
  writer: null,
  nestedTracks: {},
};

const subscribers = {
  categories: new Set(),
  books: new Set(),
  shortStory: new Set(),
  writer: new Set(),
};

const FALLBACK_MAP = {
  categories: MOCK_CATEGORIES,
  books: MOCK_AUDIO_BOOKS,
  shortStory: MOCK_SHORT_STORIES,
  writer: MOCK_WRITERS,
};

const FETCHER_MAP = {
  categories: fetchCategoriesOnce,
  books: fetchAudioBooksOnce,
  shortStory: fetchShortStoriesOnce,
  writer: fetchWritersOnce,
};

const NORMALIZER_MAP = {
  categories: normalizeCategory,
  books: normalizeAudioBook,
  shortStory: normalizeShortStory,
  writer: normalizeWriter,
};

function readLocalCache(collectionName) {
  if (memoryCache[collectionName]) return memoryCache[collectionName];
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(`${CACHE_PREFIX}${collectionName}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.data) && parsed.data.length > 0) {
      memoryCache[collectionName] = parsed.data;
      return parsed.data;
    }
  } catch {
    // Ignore storage read error
  }
  return null;
}

function writeLocalCache(collectionName, data) {
  memoryCache[collectionName] = data;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(
        `${CACHE_PREFIX}${collectionName}`,
        JSON.stringify({
          data,
          cachedAt: Date.now(),
        })
      );
    } catch {
      // Ignore storage quota error
    }
  }
  notifySubscribers(collectionName, data);
}

function notifySubscribers(collectionName, data) {
  const subs = subscribers[collectionName];
  if (!subs) return;
  subs.forEach((cb) => {
    try {
      cb(data);
    } catch {
      // Ignore subscriber error
    }
  });
}

let inFlightCatalogBundlePromise = null;

/**
 * Fetches all 4 public collections in a SINGLE Edge-Cached HTTP request (`/api/catalog`),
 * deduplicating concurrent listener calls on initial page load so 100,000+ new visitors
 * share Vercel's Edge CDN cache with near-zero Firebase reads!
 */
async function fetchEdgeCatalogBundleOnce(forceFresh = false) {
  if (typeof window === "undefined") return null;
  if (inFlightCatalogBundlePromise && !forceFresh) {
    return inFlightCatalogBundlePromise;
  }

  const endpoint = forceFresh ? "/api/catalog?fresh=1" : "/api/catalog";
  inFlightCatalogBundlePromise = fetch(endpoint)
    .then(async (res) => {
      if (!res.ok) return null;
      const payload = await res.json();
      if (!payload?.ok) return null;

      const cols = ["categories", "books", "shortStory", "writer"];
      for (const col of cols) {
        if (Array.isArray(payload[col]) && payload[col].length > 0) {
          writeLocalCache(col, payload[col]);
        }
      }
      if (payload.version) {
        try {
          window.localStorage.setItem(SYNC_VERSION_KEY, String(payload.version));
        } catch {
          // ignore
        }
      }
      try {
        window.localStorage.setItem(LAST_SYNC_AT_KEY, String(Date.now()));
      } catch {
        // ignore
      }
      return payload;
    })
    .catch(() => null)
    .finally(() => {
      inFlightCatalogBundlePromise = null;
    });

  return inFlightCatalogBundlePromise;
}

/**
 * Load a collection from Cache first; if empty, load via Edge-Cached `/api/catalog`
 * (falling back to direct Firebase `getDocs` only if the API is unreachable).
 */
async function loadCollectionCached(collectionName, forceRefresh = false) {
  if (!forceRefresh) {
    const cached = readLocalCache(collectionName);
    if (cached && cached.length > 0) {
      return cached;
    }
  }

  // 1. Primary: Edge-Cached `/api/catalog` (populates all 4 collections in 1 request!)
  const bundle = await fetchEdgeCatalogBundleOnce(forceRefresh);
  if (bundle && Array.isArray(bundle[collectionName]) && bundle[collectionName].length > 0) {
    return bundle[collectionName];
  }

  // 2. Fallback: Direct client Firebase one-time fetch if offline/API unreachable
  try {
    const fetcher = FETCHER_MAP[collectionName];
    const remoteData = await fetcher();
    if (Array.isArray(remoteData) && remoteData.length > 0) {
      writeLocalCache(collectionName, remoteData);
      return remoteData;
    }
  } catch (err) {
    console.warn(`Firebase one-time fetch for '${collectionName}' used fallback:`, err?.message);
  }

  const existing = readLocalCache(collectionName);
  if (existing && existing.length > 0) return existing;

  // Return fallback in-memory only — NEVER write mock fallback to localStorage!
  return FALLBACK_MAP[collectionName] || [];
}

/**
 * Apply an event received from Reverse API (`/api/sync`) directly to the cache
 */
function applyReverseEventToCache(event) {
  if (!event || !event.collection) return;
  const { collection: col, action, data } = event;

  const targets =
    col === "all" ? ["categories", "books", "shortStory", "writer"] : [col];

  targets.forEach((targetCol) => {
    if (action === "invalidate") {
      // Clear local cache and fetch once from Firebase
      loadCollectionCached(targetCol, true);
      return;
    }

    if (!data) return;
    const normalizer = NORMALIZER_MAP[targetCol];
    if (!normalizer) return;

    const currentList = readLocalCache(targetCol) || FALLBACK_MAP[targetCol] || [];
    const incomingItems = Array.isArray(data) ? data : [data];

    let updatedList = [...currentList];

    incomingItems.forEach((rawItem) => {
      const itemId = rawItem.id || rawItem.docId;
      if (action === "delete") {
        updatedList = updatedList.filter((item) => item.id !== itemId);
      } else {
        const normalized = normalizer(itemId, rawItem);
        const existingIndex = updatedList.findIndex((item) => item.id === normalized.id);
        if (existingIndex >= 0) {
          updatedList[existingIndex] = { ...updatedList[existingIndex], ...normalized };
        } else {
          updatedList.push(normalized);
        }
      }
    });

    writeLocalCache(targetCol, updatedList);
  });
}

let syncInProgress = false;
const MIN_SYNC_INTERVAL_MS = 15 * 60 * 1000; // Throttle across reloads to once per 15 mins

function getLastSyncTimestamp() {
  if (typeof window === "undefined") return 0;
  try {
    return Number(window.localStorage.getItem(LAST_SYNC_AT_KEY) || 0);
  } catch {
    return 0;
  }
}

export class DataService {
  /**
   * Synchronize new content without hitting Firebase or calling Vercel Functions on every reload:
   * - Persists `LAST_SYNC_AT_KEY` in `localStorage` so reloading within 15 minutes makes ZERO API calls!
   * - After 15 minutes (or on forced refresh), fetches the Edge-CDN cached `/api/catalog` in the background
   *   while keeping previous cached data on screen instantly (Stale-While-Revalidate).
   */
  static async syncWithReverseApi(force = false) {
    if (typeof window === "undefined" || syncInProgress) return;
    const now = Date.now();
    const lastSyncAt = getLastSyncTimestamp();
    if (!force && lastSyncAt > 0 && now - lastSyncAt < MIN_SYNC_INTERVAL_MS) {
      return;
    }
    syncInProgress = true;
    try {
      window.localStorage.setItem(LAST_SYNC_AT_KEY, String(now));
    } catch {
      // ignore
    }
    try {
      // Refresh full catalog from Vercel Edge CDN (0 Firebase reads + auto-picks up Firebase Console edits!)
      await fetchEdgeCatalogBundleOnce(false);
    } catch {
      // Offline or API not reachable
    } finally {
      syncInProgress = false;
    }
  }

  /**
   * Helper to subscribe a UI state setter to a cached collection
   */
  static _subscribeCached(collectionName, callback) {
    subscribers[collectionName].add(callback);

    // 1. Serve immediately from cache if available (0 Firebase hits)
    const cached = readLocalCache(collectionName);
    if (cached && cached.length > 0) {
      callback(cached);
    } else {
      // Otherwise load once from Firebase and cache it
      loadCollectionCached(collectionName, false).then((data) => callback(data));
    }

    // 2. Check Reverse API for any newly pushed items
    DataService.syncWithReverseApi();

    return () => {
      subscribers[collectionName].delete(callback);
    };
  }

  static listenCategories(callback) {
    return DataService._subscribeCached("categories", callback);
  }

  static listenAudioBooks(callback) {
    return DataService._subscribeCached("books", callback);
  }

  static listenShortStories(callback) {
    return DataService._subscribeCached("shortStory", callback);
  }

  static listenWriters(callback) {
    return DataService._subscribeCached("writer", callback);
  }

  /**
   * Nested tracks for a book — cached per book ID so Firebase isn't hit repeatedly
   */
  static listenBookNestedTracks(book, callback) {
    if (!book || book.isMock) {
      callback([]);
      return () => {};
    }

    const cacheKey = `nested_${book.id}`;
    if (memoryCache.nestedTracks[cacheKey]) {
      callback(memoryCache.nestedTracks[cacheKey]);
      return () => {};
    }

    if (typeof window !== "undefined") {
      try {
        const raw = window.localStorage.getItem(`${CACHE_PREFIX}${cacheKey}`);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed?.data)) {
            memoryCache.nestedTracks[cacheKey] = parsed.data;
            callback(parsed.data);
            return () => {};
          }
        }
      } catch {
        // Ignore
      }
    }

    if (book.tracks && book.tracks.length > 0) {
      callback(book.tracks);
    }

    fetchBookNestedSubcollectionsOnce(book.id, book)
      .then((tracks) => {
        const finalTracks =
          tracks && tracks.length > 0 ? tracks : book.tracks || [];
        memoryCache.nestedTracks[cacheKey] = finalTracks;
        if (typeof window !== "undefined") {
          try {
            window.localStorage.setItem(
              `${CACHE_PREFIX}${cacheKey}`,
              JSON.stringify({ data: finalTracks, cachedAt: Date.now() })
            );
          } catch {
            // Ignore
          }
        }
        callback(finalTracks);
      })
      .catch(() => {
        callback(book.tracks || []);
      });

    return () => {};
  }

  /**
   * Programmatically push an item or invalidate cache from client/Reverse API
   */
  static applyReverseEvent(event) {
    applyReverseEventToCache(event);
  }

  static getMagazines() {
    return MOCK_MAGAZINES;
  }
}
