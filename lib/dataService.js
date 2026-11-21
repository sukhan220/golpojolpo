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

const CACHE_PREFIX = "golpojolpo_cache_v7_";
const SYNC_VERSION_KEY = "golpojolpo_sync_version_v7";

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

/**
 * Load a collection from Cache first; only hit Firebase ONCE if cache is empty or forceRefresh=true
 */
async function loadCollectionCached(collectionName, forceRefresh = false) {
  if (!forceRefresh) {
    const cached = readLocalCache(collectionName);
    if (cached && cached.length > 0) {
      return cached;
    }
  }

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

export class DataService {
  /**
   * Synchronize with Reverse API (`/api/sync`) without hitting Firebase!
   * Merges any items pushed via Reverse API directly into the client cache.
   */
  static async syncWithReverseApi() {
    if (typeof window === "undefined" || syncInProgress) return;
    syncInProgress = true;
    try {
      const localVersion = Number(window.localStorage.getItem(SYNC_VERSION_KEY) || 0);
      const res = await fetch(`/api/sync?sinceVersion=${localVersion}`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const payload = await res.json();
      if (payload?.ok) {
        if (Array.isArray(payload.events) && payload.events.length > 0) {
          payload.events.forEach((evt) => applyReverseEventToCache(evt));
        }
        if (payload.version) {
          window.localStorage.setItem(SYNC_VERSION_KEY, String(payload.version));
        }
      }
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
