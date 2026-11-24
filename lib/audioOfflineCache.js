"use client";

/**
 * GolpoJolpo Encrypted & Chunked IndexedDB Offline Audio Engine (v3)
 *
 * Security & Storage Architecture:
 * 1. Binary Chunking (`CHUNK_BYTES = 2 MB`):
 *    - Large MP3 files are split into 2 MB binary chunks (`audio_chunks` store).
 *    - NO `audio/mpeg` Blob is ever stored in IndexedDB — DevTools cannot preview or
 *      download any audio file from storage!
 * 2. Web Crypto API `AES-GCM` (256-bit Non-Extractable Key):
 *    - Generates a non-extractable (`extractable: false`) 256-bit `AES-GCM` CryptoKey
 *      persisted in IndexedDB (`crypto_keys` store). Even Console JS cannot export the key!
 *    - Every 2 MB chunk is encrypted with a unique random 12-byte IV + Additional Authenticated
 *      Data (`AAD = "${fileKey}:${chunkIndex}"`) before writing to IndexedDB.
 *    - Copied IndexedDB files are pure AES-GCM ciphertext and 100% unplayable outside the app.
 * 3. Just-In-Time In-Memory Decryption:
 *    - Right before playback, chunks are decrypted in RAM via `crypto.subtle.decrypt` and
 *      assembled into an ephemeral `blob:` URL with ownership-based lifecycle cleanup.
 * 4. 750 MB LRU Eviction + Legacy Unencrypted DB Cleanup:
 *    - Automatically deletes legacy unencrypted `v1`/`v2` databases on first open.
 */

const DB_NAME = "golpojolpo_offline_audio_v3";
const LEGACY_DB_NAMES = ["golpojolpo_offline_audio_v1", "golpojolpo_offline_audio_v2"];
const DB_VERSION = 1;

const STORE_META = "audio_meta"; // { key, chunkCount, size, total, mimeType, complete, lastAccess }
const STORE_CHUNKS = "audio_chunks"; // { id: `${key}:${index}`, key, index, iv: Uint8Array, cipher: ArrayBuffer }
const STORE_KEYS = "crypto_keys"; // { id: "master-aes-gcm-v3", cryptoKey: CryptoKey (extractable: false) }
const MASTER_KEY_ID = "master-aes-gcm-v3";

const CHUNK_BYTES = 2 * 1024 * 1024; // 2 MB per encrypted binary chunk
const MAX_CACHE_BYTES = 750 * 1024 * 1024; // 750 MB LRU cap
const MIN_VALID_AUDIO_BYTES = 16 * 1024; // 16 KB minimum

let dbPromise = null;
let masterKeyPromise = null;
let legacyCleaned = false;

const activeDownloads = new Map(); // key -> { controller, owners: Set<symbol>, listeners: Set<fn> }
const blobUrlPool = new Map(); // key -> { url, size, total, complete, owners: Set<symbol>, revokeTimer }
const decryptInFlight = new Map(); // key -> Promise<entry|null>

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

function cleanupLegacyDatabasesOnce() {
  if (legacyCleaned || typeof window === "undefined" || !("indexedDB" in window)) return;
  legacyCleaned = true;
  for (const oldName of LEGACY_DB_NAMES) {
    try {
      window.indexedDB.deleteDatabase(oldName);
    } catch {
      // ignore
    }
  }
}

function openDb() {
  if (typeof window === "undefined" || !("indexedDB" in window)) {
    return Promise.resolve(null);
  }
  cleanupLegacyDatabasesOnce();
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_META)) {
          const metaStore = db.createObjectStore(STORE_META, { keyPath: "key" });
          metaStore.createIndex("lastAccess", "lastAccess", { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_CHUNKS)) {
          const chunkStore = db.createObjectStore(STORE_CHUNKS, { keyPath: "id" });
          chunkStore.createIndex("key", "key", { unique: false });
        }
        if (!db.objectStoreNames.contains(STORE_KEYS)) {
          db.createObjectStore(STORE_KEYS, { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => {
        dbPromise = null;
        resolve(null);
      };
    } catch {
      dbPromise = null;
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

/**
 * Retrieves or generates the non-extractable 256-bit AES-GCM CryptoKey stored in IndexedDB.
 */
async function getOrCreateMasterKey() {
  if (typeof window === "undefined" || !window.crypto?.subtle) return null;
  if (masterKeyPromise) return masterKeyPromise;

  masterKeyPromise = (async () => {
    const db = await openDb();
    if (!db) return null;

    // 1. Check existing non-extractable CryptoKey in IndexedDB
    const existing = await new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_KEYS, "readonly");
        const req = tx.objectStore(STORE_KEYS).get(MASTER_KEY_ID);
        req.onsuccess = () => resolve(req.result?.cryptoKey || null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });

    if (existing) return existing;

    // 2. Generate brand-new 256-bit AES-GCM key with `extractable: false`
    try {
      const cryptoKey = await window.crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        false, // NON-EXTRACTABLE: raw key bytes can NEVER be exported!
        ["encrypt", "decrypt"]
      );

      await new Promise((resolve) => {
        try {
          const tx = db.transaction(STORE_KEYS, "readwrite");
          tx.objectStore(STORE_KEYS).put({
            id: MASTER_KEY_ID,
            cryptoKey,
            createdAt: Date.now(),
          });
          tx.oncomplete = () => resolve();
          tx.onerror = () => resolve();
        } catch {
          resolve();
        }
      });

      return cryptoKey;
    } catch {
      masterKeyPromise = null;
      return null;
    }
  })();

  return masterKeyPromise;
}

function makeChunkAad(fileKey, chunkIndex) {
  return new TextEncoder().encode(`gj-v3:${fileKey}:${chunkIndex}`);
}

async function encryptBinaryChunk(masterKey, fileKey, chunkIndex, plainUint8) {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const aad = makeChunkAad(fileKey, chunkIndex);
  const cipher = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: aad },
    masterKey,
    plainUint8
  );
  return { iv, cipher };
}

async function decryptBinaryChunk(masterKey, fileKey, chunkIndex, iv, cipher) {
  const aad = makeChunkAad(fileKey, chunkIndex);
  const plainBuf = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv, additionalData: aad },
    masterKey,
    cipher
  );
  return new Uint8Array(plainBuf);
}

async function idbGetMeta(key) {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_META, "readonly");
      const req = tx.objectStore(STORE_META).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbPutMeta(metaRecord) {
  const db = await openDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE_META, "readwrite");
      tx.objectStore(STORE_META).put(metaRecord);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function idbWriteEncryptedChunkAndMeta(chunkRecord, metaRecord) {
  const db = await openDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction([STORE_CHUNKS, STORE_META], "readwrite");
      if (chunkRecord) {
        tx.objectStore(STORE_CHUNKS).put(chunkRecord);
      }
      if (metaRecord) {
        tx.objectStore(STORE_META).put(metaRecord);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function idbReadAllChunksForKey(key) {
  const db = await openDb();
  if (!db) return [];
  return new Promise((resolve) => {
    const list = [];
    try {
      const tx = db.transaction(STORE_CHUNKS, "readonly");
      const idx = tx.objectStore(STORE_CHUNKS).index("key");
      const req = idx.openCursor(IDBKeyRange.only(key));
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          list.push(cursor.value);
          cursor.continue();
        } else {
          list.sort((a, b) => a.index - b.index);
          resolve(list);
        }
      };
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

async function idbDeleteFileAndChunks(key) {
  const db = await openDb();
  if (!db) return;
  return new Promise((resolve) => {
    try {
      const tx = db.transaction([STORE_META, STORE_CHUNKS], "readwrite");
      tx.objectStore(STORE_META).delete(key);
      const idx = tx.objectStore(STORE_CHUNKS).index("key");
      const req = idx.openCursor(IDBKeyRange.only(key));
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          cursor.delete();
          cursor.continue();
        }
      };
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
      const tx = db.transaction(STORE_META, "readonly");
      const idx = tx.objectStore(STORE_META).index("lastAccess");
      const req = idx.openCursor();
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          const v = cursor.value;
          const sz = Number(v.size) || 0;
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
    for (const item of entries) {
      if (totalBytes <= targetBytes) break;
      if (item.key === keepKey) continue;
      await idbDeleteFileAndChunks(item.key);
      totalBytes -= item.size;
    }
  } catch {
    // Ignore LRU cleanup error
  }
}

function concatUint8Arrays(arrays, totalLength) {
  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const arr of arrays) {
    merged.set(arr, offset);
    offset += arr.byteLength;
  }
  return merged;
}

/**
 * Decrypts all stored encrypted binary chunks for `key` in memory right before playback
 * and returns an ephemeral `blob:` URL.
 */
async function decryptCachedFileToBlobUrl(key, ownerId = null) {
  if (decryptInFlight.has(key)) {
    const res = await decryptInFlight.get(key);
    if (res && ownerId) {
      const poolEntry = blobUrlPool.get(key);
      if (poolEntry) poolEntry.owners.add(ownerId);
    }
    return res;
  }

  const promise = (async () => {
    const meta = await idbGetMeta(key);
    if (!meta || !meta.chunkCount || meta.size < MIN_VALID_AUDIO_BYTES) {
      return null;
    }

    const masterKey = await getOrCreateMasterKey();
    if (!masterKey) return null;

    const encryptedChunks = await idbReadAllChunksForKey(key);
    if (encryptedChunks.length === 0) return null;

    try {
      const decryptedSlices = [];
      let decryptedBytes = 0;

      for (let i = 0; i < encryptedChunks.length; i++) {
        const c = encryptedChunks[i];
        if (c.index !== i) {
          // Missing contiguous chunk -> stop at contiguous prefix
          break;
        }
        const plain = await decryptBinaryChunk(masterKey, key, c.index, c.iv, c.cipher);
        decryptedSlices.push(plain);
        decryptedBytes += plain.byteLength;
      }

      if (decryptedBytes < MIN_VALID_AUDIO_BYTES) return null;

      const isComplete = Boolean(meta.complete && encryptedChunks.length >= meta.chunkCount);
      const mimeType = isValidAudioContentType(meta.mimeType) ? meta.mimeType || "audio/mpeg" : "audio/mpeg";
      const memBlob = new Blob(decryptedSlices, { type: mimeType });
      const url = URL.createObjectURL(memBlob);

      const prev = blobUrlPool.get(key);
      const owners = prev?.owners ? new Set(prev.owners) : new Set();
      if (ownerId) owners.add(ownerId);
      if (prev?.revokeTimer) clearTimeout(prev.revokeTimer);
      if (prev?.url && (!prev.owners || prev.owners.size === 0)) {
        try {
          URL.revokeObjectURL(prev.url);
        } catch {
          // ignore
        }
      }

      const entry = {
        url,
        size: decryptedBytes,
        total: meta.total || decryptedBytes,
        complete: isComplete,
        owners,
        revokeTimer: null,
      };
      blobUrlPool.set(key, entry);

      // Touch lastAccess for LRU
      idbPutMeta({ ...meta, lastAccess: Date.now() }).catch(() => {});

      return {
        url: entry.url,
        size: entry.size,
        total: entry.total,
        complete: entry.complete,
      };
    } catch {
      // Decryption failed (corrupt or tampered ciphertext) -> purge invalid cache
      await idbDeleteFileAndChunks(key);
      return null;
    }
  })();

  decryptInFlight.set(key, promise);
  try {
    return await promise;
  } finally {
    decryptInFlight.delete(key);
  }
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
  await idbDeleteFileAndChunks(key);
}

/**
 * Aborts any in-flight background downloads for OTHER tracks when the user switches audio.
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
 * Synchronous lookup of an already-decrypted in-memory `blob:` URL (used during seek
 * so seeking never hits network if the track already finished caching in RAM!).
 */
export function getReadyMemoryBlobUrl(streamUrl, ownerId = null) {
  const key = extractCacheKey(streamUrl);
  if (!key) return null;
  const existing = blobUrlPool.get(key);
  if (existing && existing.url && existing.complete && existing.size >= MIN_VALID_AUDIO_BYTES) {
    if (existing.revokeTimer) {
      clearTimeout(existing.revokeTimer);
      existing.revokeTimer = null;
    }
    if (ownerId) existing.owners.add(ownerId);
    return existing.url;
  }
  return null;
}

/**
 * Returns a decrypted in-memory `blob:` URL if this audio is cached (complete or partial) in IndexedDB.
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

  return decryptCachedFileToBlobUrl(key, ownerId);
}

/**
 * Streams the audio file in the background, splits into 2 MB binary chunks,
 * encrypts each chunk with Web Crypto API `AES-GCM`, and stores ONLY ciphertext in IndexedDB.
 * Once complete, decrypts in memory (or uses streamed slices directly) to provide an instant `blob:` URL!
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

  // 1. Already completely cached? Decrypt in memory & notify immediately!
  const existingMeta = await idbGetMeta(key);
  if (existingMeta && existingMeta.complete && existingMeta.size >= MIN_VALID_AUDIO_BYTES) {
    const cached = await getOfflineCachedAudioUrl(streamUrl, ownerId);
    if (cached) {
      if (onProgress) {
        onProgress({
          loadedBytes: cached.size,
          totalBytes: cached.total,
          complete: true,
          blobUrl: cached.url,
        });
      }
      return;
    }
  }

  // 2. Already downloading this exact track? Register ownerId & attach onProgress listener!
  if (activeDownloads.has(key)) {
    const active = activeDownloads.get(key);
    if (ownerId) active.owners.add(ownerId);
    if (typeof onProgress === "function") active.listeners.add(onProgress);
    return;
  }

  const masterKey = await getOrCreateMasterKey();
  if (!masterKey) return;

  const controller = new AbortController();
  const dlOwners = new Set();
  if (ownerId) dlOwners.add(ownerId);
  const listeners = new Set();
  if (typeof onProgress === "function") listeners.add(onProgress);
  activeDownloads.set(key, { controller, owners: dlOwners, listeners });

  const notifyAll = (payload) => {
    for (const fn of listeners) {
      try {
        fn(payload);
      } catch {
        // ignore
      }
    }
  };

  let pendingParts = [];
  let pendingBytes = 0;
  const inMemoryDecryptedChunks = []; // Held only during download to create instant blobUrl at completion
  let chunkIndex = 0;
  let loadedBytes = 0;
  let totalBytes = 0;
  let contentType = "audio/mpeg";

  // Clear any previous partial chunks for a clean contiguous encrypted write
  if (existingMeta && !existingMeta.complete) {
    await idbDeleteFileAndChunks(key);
  }

  const flushOneEncryptedChunk = async (plainSlice, isFinalComplete = false) => {
    const idx = chunkIndex++;
    const { iv, cipher } = await encryptBinaryChunk(masterKey, key, idx, plainSlice);
    const chunkRecord = {
      id: `${key}:${idx}`,
      key,
      index: idx,
      iv,
      cipher,
    };
    const metaRecord = {
      key,
      chunkCount: chunkIndex,
      size: loadedBytes,
      total: totalBytes || loadedBytes,
      mimeType: contentType,
      complete: isFinalComplete,
      lastAccess: Date.now(),
    };
    await idbWriteEncryptedChunkAndMeta(chunkRecord, metaRecord);
  };

  try {
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
          pendingParts.push(value);
          pendingBytes += value.byteLength;
          loadedBytes += value.byteLength;

          notifyAll({
            loadedBytes,
            totalBytes: totalBytes || loadedBytes,
            complete: false,
            blobUrl: null,
          });

          // Whenever we accumulate >= 2 MB, slice exact 2 MB binary chunks & AES-GCM encrypt to IDB!
          while (pendingBytes >= CHUNK_BYTES) {
            const merged = concatUint8Arrays(pendingParts, pendingBytes);
            const exactChunk = merged.slice(0, CHUNK_BYTES);
            const remainder = merged.slice(CHUNK_BYTES);
            pendingParts = remainder.byteLength > 0 ? [remainder] : [];
            pendingBytes = remainder.byteLength;

            inMemoryDecryptedChunks.push(exactChunk);
            await flushOneEncryptedChunk(exactChunk, false);
          }
        }
      }
    } else {
      const buf = new Uint8Array(await res.arrayBuffer());
      loadedBytes = buf.byteLength;
      let offset = 0;
      while (offset < buf.byteLength) {
        const slice = buf.slice(offset, Math.min(buf.byteLength, offset + CHUNK_BYTES));
        offset += slice.byteLength;
        if (offset < buf.byteLength) {
          inMemoryDecryptedChunks.push(slice);
          await flushOneEncryptedChunk(slice, false);
        } else {
          pendingParts = [slice];
          pendingBytes = slice.byteLength;
        }
      }
    }

    if (loadedBytes >= MIN_VALID_AUDIO_BYTES) {
      const isComplete = totalBytes > 0 ? loadedBytes >= totalBytes : true;

      if (pendingBytes > 0) {
        const tailSlice = concatUint8Arrays(pendingParts, pendingBytes);
        pendingParts = [];
        pendingBytes = 0;
        inMemoryDecryptedChunks.push(tailSlice);
        await flushOneEncryptedChunk(tailSlice, isComplete);
      } else if (chunkIndex > 0) {
        await idbPutMeta({
          key,
          chunkCount: chunkIndex,
          size: loadedBytes,
          total: totalBytes || loadedBytes,
          mimeType: contentType,
          complete: isComplete,
          lastAccess: Date.now(),
        });
      }

      // Build ephemeral in-memory Blob URL for immediate zero-network playback & seeking
      const fullMemBlob = new Blob(inMemoryDecryptedChunks, { type: contentType });
      const prev = blobUrlPool.get(key);
      const preservedOwners = prev?.owners ? new Set(prev.owners) : new Set(dlOwners);
      if (ownerId) preservedOwners.add(ownerId);
      if (prev?.revokeTimer) clearTimeout(prev.revokeTimer);
      if (prev?.url && (!prev.owners || prev.owners.size === 0)) {
        try {
          URL.revokeObjectURL(prev.url);
        } catch {
          // ignore
        }
      }

      const newUrl = URL.createObjectURL(fullMemBlob);
      blobUrlPool.set(key, {
        url: newUrl,
        size: fullMemBlob.size,
        total: totalBytes || fullMemBlob.size,
        complete: isComplete,
        owners: preservedOwners,
        revokeTimer: null,
      });

      notifyAll({
        loadedBytes: fullMemBlob.size,
        totalBytes: totalBytes || fullMemBlob.size,
        complete: isComplete,
        blobUrl: newUrl,
      });

      enforceLruCap(key).catch(() => {});
    }
  } catch {
    // Network dropped or aborted midway — encrypt & save any remaining buffered bytes so partial offline playback works!
    try {
      if (pendingBytes > 0) {
        const tailSlice = concatUint8Arrays(pendingParts, pendingBytes);
        inMemoryDecryptedChunks.push(tailSlice);
        await flushOneEncryptedChunk(tailSlice, false);
      }
      if (loadedBytes >= MIN_VALID_AUDIO_BYTES && inMemoryDecryptedChunks.length > 0) {
        const partialMemBlob = new Blob(inMemoryDecryptedChunks, { type: contentType });
        const prev = blobUrlPool.get(key);
        const preservedOwners = prev?.owners ? new Set(prev.owners) : new Set(dlOwners);
        if (ownerId) preservedOwners.add(ownerId);
        if (prev?.revokeTimer) clearTimeout(prev.revokeTimer);
        if (prev?.url && (!prev.owners || prev.owners.size === 0)) {
          try {
            URL.revokeObjectURL(prev.url);
          } catch {
            // ignore
          }
        }
        const partialUrl = URL.createObjectURL(partialMemBlob);
        blobUrlPool.set(key, {
          url: partialUrl,
          size: partialMemBlob.size,
          total: totalBytes || partialMemBlob.size,
          complete: false,
          owners: preservedOwners,
          revokeTimer: null,
        });
      }
    } catch {
      // ignore partial flush error
    }
  } finally {
    inMemoryDecryptedChunks.length = 0;
    activeDownloads.delete(key);
  }
}
