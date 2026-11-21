/* eslint-disable no-restricted-globals */
/**
 * GolpoJolpo Production-Grade Offline-First Audio Chunk Cache Service Worker (v3)
 *
 * Production Guarantees:
 * 1. RFC 9110 Range Parsing:
 *    - Supports standard (`bytes=a-b`), open-ended (`bytes=a-`), suffix (`bytes=-n`),
 *      multi-range passthrough, and strict `416 Range Not Satisfiable` responses.
 * 2. Zero Cache-Write Race Conditions:
 *    - Deduplicates concurrent fetches via `inFlightFetches` until atomic IDB commit finishes.
 *    - Batches 200-OK multi-chunk writes into a single `readwrite` transaction.
 *    - Throttles `lastAccess` updates (30s) in a lightweight index store (zero 1MB re-writes).
 * 3. Single-Transaction Zero-OOM LRU Management:
 *    - Separates binary chunks (`chunks`) from lightweight metadata (`chunk_index`), so LRU
 *      never loads 500MB of ArrayBuffers into RAM.
 *    - Runs scan + eviction + orphaned `meta` cleanup inside ONE atomic `readwrite` transaction,
 *      protects the active playing `token`, and awaits `tx.oncomplete`.
 * 4. Strict Upstream `Content-Range` & Integrity Validation:
 *    - Rejects non-audio Content-Types, zero-byte bodies, missing/malformed 206 Content-Range,
 *      offset mismatches (`cr.start !== chunkStart`), and truncated payloads.
 *    - Detects upstream file size changes (`cr.total !== knownTotal`) and purges stale chunks.
 */

const DB_NAME = "golpojolpo_audio_chunks_v3";
const OLD_DB_NAMES = ["golpojolpo_audio_chunks_v1", "golpojolpo_audio_chunks_v2"];
const DB_VERSION = 1;

const STORE_CHUNKS = "chunks"; // { key, data: ArrayBuffer }
const STORE_INDEX = "chunk_index"; // { key, token, chunkIndex, size, total, contentType, lastAccess }
const STORE_META = "meta"; // { token, total, contentType, updatedAt }

const CHUNK_SIZE = 1024 * 1024; // 1 MB aligned chunks
const LOOKAHEAD_CHUNKS = 4; // Prefetch next 4 MB ahead while playing
const MAX_CACHE_BYTES = 750 * 1024 * 1024; // 750 MB LRU cap
const LRU_TARGET_RATIO = 0.85;
const TOUCH_THROTTLE_MS = 30 * 1000; // Update lastAccess at most once per 30s per chunk

let dbPromise = null;
const inFlightFetches = new Map(); // chunkKey -> Promise
const lastTouchMap = new Map(); // chunkKey -> timestamp

let lruRunning = false;
let lruPendingToken = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_CHUNKS)) {
        db.createObjectStore(STORE_CHUNKS, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(STORE_INDEX)) {
        const idxStore = db.createObjectStore(STORE_INDEX, { keyPath: "key" });
        idxStore.createIndex("lastAccess", "lastAccess", { unique: false });
        idxStore.createIndex("token", "token", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: "token" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });
  return dbPromise;
}

function txPromise(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error("IndexedDB transaction error"));
    tx.onabort = () => reject(tx.error || new Error("IndexedDB transaction aborted"));
  });
}

function reqPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(storeName, key) {
  const db = await openDb();
  const tx = db.transaction(storeName, "readonly");
  return reqPromise(tx.objectStore(storeName).get(key));
}

/**
 * Reads both chunk metadata and binary payload in one readonly transaction.
 */
async function readCachedChunk(chunkKey) {
  const db = await openDb();
  const tx = db.transaction([STORE_INDEX, STORE_CHUNKS], "readonly");
  const idxReq = tx.objectStore(STORE_INDEX).get(chunkKey);
  const dataReq = tx.objectStore(STORE_CHUNKS).get(chunkKey);
  const [meta, chunk] = await Promise.all([reqPromise(idxReq), reqPromise(dataReq)]);
  if (!meta || !chunk || !chunk.data || chunk.data.byteLength === 0) {
    return null;
  }
  return { meta, data: chunk.data };
}

/**
 * Throttled lightweight lastAccess update — touches ONLY `chunk_index` (~100 bytes),
 * never rewriting the 1 MB binary ArrayBuffer.
 */
function touchChunkAccess(indexRecord) {
  const now = Date.now();
  const prev = lastTouchMap.get(indexRecord.key) || 0;
  if (now - prev < TOUCH_THROTTLE_MS) return;
  lastTouchMap.set(indexRecord.key, now);

  openDb()
    .then((db) => {
      const tx = db.transaction(STORE_INDEX, "readwrite");
      tx.objectStore(STORE_INDEX).put({ ...indexRecord, lastAccess: now });
      return txPromise(tx);
    })
    .catch(() => {});
}

/**
 * Atomically writes 1 or more chunks + index records + token meta in ONE readwrite transaction.
 */
async function writeChunksAtomically(chunkRecords, indexRecords, metaRecord) {
  const db = await openDb();
  const tx = db.transaction([STORE_CHUNKS, STORE_INDEX, STORE_META], "readwrite");
  const chunkStore = tx.objectStore(STORE_CHUNKS);
  const indexStore = tx.objectStore(STORE_INDEX);
  const metaStore = tx.objectStore(STORE_META);

  for (let i = 0; i < chunkRecords.length; i++) {
    chunkStore.put(chunkRecords[i]);
    indexStore.put(indexRecords[i]);
  }
  if (metaRecord) {
    metaStore.put(metaRecord);
  }
  await txPromise(tx);
}

/**
 * Purges all cached chunks & metadata for a token (used when upstream file size changes).
 */
async function invalidateTokenCache(token) {
  const db = await openDb();
  const tx = db.transaction([STORE_INDEX, STORE_CHUNKS, STORE_META], "readwrite");
  const indexStore = tx.objectStore(STORE_INDEX);
  const chunkStore = tx.objectStore(STORE_CHUNKS);
  const metaStore = tx.objectStore(STORE_META);

  const tokenIdx = indexStore.index("token");
  await new Promise((resolve, reject) => {
    const cursorReq = tokenIdx.openCursor(IDBKeyRange.only(token));
    cursorReq.onsuccess = (e) => {
      const cursor = e.target.result;
      if (cursor) {
        const key = cursor.value.key;
        chunkStore.delete(key);
        cursor.delete();
        lastTouchMap.delete(key);
        cursor.continue();
      } else {
        resolve();
      }
    };
    cursorReq.onerror = () => reject(cursorReq.error);
  });

  metaStore.delete(token);
  await txPromise(tx);
}

/**
 * Single-transaction Zero-OOM LRU eviction:
 * - Scans ONLY lightweight `chunk_index` records (never loads 1 MB ArrayBuffers into RAM).
 * - Protects `protectedToken` (currently playing audio) from eviction.
 * - Cleans up orphaned `meta` records when a token has 0 chunks remaining.
 * - Awaits `tx.oncomplete` before releasing `lruRunning`.
 */
async function enforceLruLimit(protectedToken = null) {
  if (lruRunning) {
    lruPendingToken = protectedToken;
    return;
  }
  lruRunning = true;

  try {
    const db = await openDb();
    const tx = db.transaction([STORE_INDEX, STORE_CHUNKS, STORE_META], "readwrite");
    const indexStore = tx.objectStore(STORE_INDEX);
    const chunkStore = tx.objectStore(STORE_CHUNKS);
    const metaStore = tx.objectStore(STORE_META);
    const lastAccessIdx = indexStore.index("lastAccess");

    const entries = [];
    const tokenCounts = new Map();
    let totalBytes = 0;

    await new Promise((resolve, reject) => {
      const cursorReq = lastAccessIdx.openCursor();
      cursorReq.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          const val = cursor.value;
          const sz = Number(val.size) || 0;
          totalBytes += sz;
          entries.push({ key: val.key, token: val.token, size: sz });
          tokenCounts.set(val.token, (tokenCounts.get(val.token) || 0) + 1);
          cursor.continue();
        } else {
          resolve();
        }
      };
      cursorReq.onerror = () => reject(cursorReq.error);
    });

    if (totalBytes > MAX_CACHE_BYTES) {
      const targetBytes = Math.floor(MAX_CACHE_BYTES * LRU_TARGET_RATIO);
      for (const item of entries) {
        if (totalBytes <= targetBytes) break;
        if (protectedToken && item.token === protectedToken) continue;

        indexStore.delete(item.key);
        chunkStore.delete(item.key);
        lastTouchMap.delete(item.key);
        totalBytes -= item.size;

        const remaining = (tokenCounts.get(item.token) || 1) - 1;
        tokenCounts.set(item.token, remaining);
        if (remaining <= 0) {
          metaStore.delete(item.token);
        }
      }
    }

    await txPromise(tx);
  } catch {
    // Ignore LRU cleanup failure (non-fatal)
  } finally {
    lruRunning = false;
    if (lruPendingToken !== null) {
      const nextToken = lruPendingToken;
      lruPendingToken = null;
      enforceLruLimit(nextToken).catch(() => {});
    }
  }
}

/**
 * RFC 9110 compliant Range header parser.
 * Returns:
 *  - { status: "none" }
 *  - { status: "multi" } -> multi-range (passthrough to network)
 *  - { status: "passthrough" } -> suffix range with unknown totalSize
 *  - { status: "unsatisfiable" } -> respond 416 Range Not Satisfiable
 *  - { status: "ok", start, end }
 */
function parseRangeHeader(rangeHeader, totalSize) {
  if (!rangeHeader) return { status: "none" };
  const trimmed = rangeHeader.trim();
  const match = /^bytes=(.+)$/i.exec(trimmed);
  if (!match) return { status: "unsatisfiable" };

  const spec = match[1].trim();
  // Multi-range requests (e.g. `bytes=0-100, 200-300`) pass through directly
  if (spec.includes(",")) {
    return { status: "multi" };
  }

  const parts = spec.split("-");
  if (parts.length !== 2) return { status: "unsatisfiable" };

  const startStr = parts[0].trim();
  const endStr = parts[1].trim();

  // Suffix range: `bytes=-500` (last 500 bytes)
  if (startStr === "") {
    if (endStr === "" || !/^\d+$/.test(endStr)) {
      return { status: "unsatisfiable" };
    }
    const suffixLen = parseInt(endStr, 10);
    if (suffixLen <= 0) return { status: "unsatisfiable" };
    if (!totalSize || totalSize <= 0) {
      return { status: "passthrough" };
    }
    const start = Math.max(0, totalSize - suffixLen);
    const end = totalSize - 1;
    return { status: "ok", start, end };
  }

  if (!/^\d+$/.test(startStr)) {
    return { status: "unsatisfiable" };
  }
  const start = parseInt(startStr, 10);

  if (totalSize && start >= totalSize) {
    return { status: "unsatisfiable" };
  }

  let end;
  if (endStr === "") {
    // Open-ended range: `bytes=start-`
    end = totalSize
      ? Math.min(totalSize - 1, start + CHUNK_SIZE - 1)
      : start + CHUNK_SIZE - 1;
  } else {
    if (!/^\d+$/.test(endStr)) {
      return { status: "unsatisfiable" };
    }
    end = parseInt(endStr, 10);
    if (end < start) {
      return { status: "unsatisfiable" };
    }
    if (totalSize && end >= totalSize) {
      end = totalSize - 1;
    }
  }

  return { status: "ok", start, end };
}

/**
 * Strict Content-Range parser: `bytes <start>-<end>/<total|*>`
 */
function parseContentRange(header) {
  if (!header) return null;
  const match = /^bytes\s+(\d+)-(\d+)\/(\d+|\*)$/i.exec(header.trim());
  if (!match) return null;
  const start = parseInt(match[1], 10);
  const end = parseInt(match[2], 10);
  const total = match[3] === "*" ? null : parseInt(match[3], 10);

  if (isNaN(start) || isNaN(end) || end < start) return null;
  if (total !== null && (isNaN(total) || total <= 0 || end >= total)) return null;

  return { start, end, total };
}

function isValidAudioContentType(ct) {
  if (!ct) return true;
  const lower = ct.toLowerCase();
  if (
    lower.includes("application/json") ||
    lower.includes("text/html") ||
    lower.includes("text/plain") ||
    lower.includes("application/xml")
  ) {
    return false;
  }
  return true;
}

/**
 * Fetches one fixed-size aligned chunk (1 MB) from IndexedDB first, or network if missing.
 * Deduplicates concurrent requests until BOTH network fetch and atomic IDB commit complete.
 */
async function getOrFetchChunk(requestUrl, token, chunkIndex, knownTotal) {
  const chunkKey = `${token}:${chunkIndex}`;

  // 1. Offline-first IndexedDB lookup (ZERO server hit!)
  const cached = await readCachedChunk(chunkKey);
  if (cached) {
    touchChunkAccess(cached.meta);
    return {
      buffer: cached.data,
      total: cached.meta.total || knownTotal,
      contentType: cached.meta.contentType || "audio/mpeg",
      fromCache: true,
    };
  }

  // 2. Deduplicate concurrent fetches (held until IDB commit finishes)
  if (inFlightFetches.has(chunkKey)) {
    return inFlightFetches.get(chunkKey);
  }

  const fetchPromise = (async () => {
    const chunkStart = chunkIndex * CHUNK_SIZE;
    const chunkEnd = knownTotal
      ? Math.min(knownTotal - 1, chunkStart + CHUNK_SIZE - 1)
      : chunkStart + CHUNK_SIZE - 1;

    const upstream = await fetch(requestUrl, {
      method: "GET",
      headers: {
        Range: `bytes=${chunkStart}-${chunkEnd}`,
      },
    });

    if (upstream.status !== 206 && upstream.status !== 200) {
      throw new Error(`Upstream status ${upstream.status}`);
    }

    const contentType = upstream.headers.get("content-type") || "audio/mpeg";
    if (!isValidAudioContentType(contentType)) {
      throw new Error(`Invalid non-audio content-type: ${contentType}`);
    }

    const buffer = await upstream.arrayBuffer();
    if (!buffer || buffer.byteLength === 0) {
      throw new Error("Empty upstream audio payload");
    }

    const now = Date.now();

    // Case A: Upstream returned 206 Partial Content — strictly validate Content-Range!
    if (upstream.status === 206) {
      const cr = parseContentRange(upstream.headers.get("content-range"));
      if (!cr) {
        throw new Error("Missing or malformed Content-Range on 206 response");
      }

      const expectedLen = cr.end - cr.start + 1;
      if (cr.start !== chunkStart) {
        throw new Error(`Content-Range offset mismatch: expected ${chunkStart}, got ${cr.start}`);
      }
      if (buffer.byteLength !== expectedLen) {
        throw new Error(
          `Truncated 206 body: expected ${expectedLen} bytes, got ${buffer.byteLength}`
        );
      }

      const total = cr.total || knownTotal || null;

      // If upstream file changed size on server, purge stale chunks before caching new one
      if (knownTotal && cr.total && cr.total !== knownTotal) {
        await invalidateTokenCache(token);
      }

      const chunkRecord = { key: chunkKey, data: buffer };
      const indexRecord = {
        key: chunkKey,
        token,
        chunkIndex,
        size: buffer.byteLength,
        total,
        contentType,
        lastAccess: now,
      };
      const metaRecord = total ? { token, total, contentType, updatedAt: now } : null;

      await writeChunksAtomically([chunkRecord], [indexRecord], metaRecord);
      enforceLruLimit(token).catch(() => {});

      return { buffer, total, contentType, fromCache: false };
    }

    // Case B: Upstream returned 200 OK (full file) — validate Content-Length if present
    const clHeader = upstream.headers.get("content-length");
    if (clHeader) {
      const expectedTotal = parseInt(clHeader, 10);
      if (!isNaN(expectedTotal) && expectedTotal > 0 && buffer.byteLength !== expectedTotal) {
        throw new Error(
          `Truncated 200 body: expected ${expectedTotal} bytes, got ${buffer.byteLength}`
        );
      }
    }

    const total = buffer.byteLength;
    if (knownTotal && total !== knownTotal) {
      await invalidateTokenCache(token);
    }

    const totalChunks = Math.ceil(total / CHUNK_SIZE);
    const chunkRecords = [];
    const indexRecords = [];
    for (let i = 0; i < totalChunks; i++) {
      const slice = buffer.slice(i * CHUNK_SIZE, Math.min(total, (i + 1) * CHUNK_SIZE));
      const key = `${token}:${i}`;
      chunkRecords.push({ key, data: slice });
      indexRecords.push({
        key,
        token,
        chunkIndex: i,
        size: slice.byteLength,
        total,
        contentType,
        lastAccess: now,
      });
    }

    const metaRecord = { token, total, contentType, updatedAt: now };
    await writeChunksAtomically(chunkRecords, indexRecords, metaRecord);
    enforceLruLimit(token).catch(() => {});

    const requestedSlice = buffer.slice(chunkStart, Math.min(total, chunkEnd + 1));
    return {
      buffer: requestedSlice,
      total,
      contentType,
      fromCache: false,
    };
  })();

  inFlightFetches.set(chunkKey, fetchPromise);
  try {
    return await fetchPromise;
  } finally {
    inFlightFetches.delete(chunkKey);
  }
}

/**
 * YouTube-style sequential lookahead prefetch (prefetches next LOOKAHEAD_CHUNKS in background)
 */
async function prefetchLookahead(requestUrl, token, startChunkIndex, totalBytes) {
  if (!totalBytes) return;
  for (let offset = 1; offset <= LOOKAHEAD_CHUNKS; offset++) {
    const idx = startChunkIndex + offset;
    if (idx * CHUNK_SIZE >= totalBytes) break;
    try {
      const exists = await idbGet(STORE_INDEX, `${token}:${idx}`);
      if (!exists) {
        await getOrFetchChunk(requestUrl, token, idx, totalBytes);
      }
    } catch {
      // Stop prefetching if offline or upstream error
      break;
    }
  }
}

async function handleAudioStreamRequest(request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("t");
  if (!token) {
    return fetch(request);
  }

  try {
    const meta = await idbGet(STORE_META, token);
    const knownTotal = meta?.total || null;
    const rangeHeader = request.headers.get("range");
    const parsed = parseRangeHeader(rangeHeader, knownTotal);

    if (parsed.status === "multi" || parsed.status === "passthrough") {
      return fetch(request);
    }

    if (parsed.status === "unsatisfiable") {
      return new Response(null, {
        status: 416,
        statusText: "Range Not Satisfiable",
        headers: {
          "Content-Range": `bytes */${knownTotal ?? "*"}`,
        },
      });
    }

    const reqStart = parsed.status === "ok" ? parsed.start : 0;
    const chunkIndex = Math.floor(reqStart / CHUNK_SIZE);
    const offsetInChunk = reqStart - chunkIndex * CHUNK_SIZE;

    const { buffer, total, contentType, fromCache } = await getOrFetchChunk(
      request.url,
      token,
      chunkIndex,
      knownTotal
    );

    const chunkGlobalStart = chunkIndex * CHUNK_SIZE;
    const availableEnd = chunkGlobalStart + buffer.byteLength - 1;
    const finalTotal = total || availableEnd + 1;

    // Re-check unsatisfiable range if `total` just became known
    if (parsed.status === "ok" && reqStart >= finalTotal) {
      return new Response(null, {
        status: 416,
        statusText: "Range Not Satisfiable",
        headers: {
          "Content-Range": `bytes */${finalTotal}`,
        },
      });
    }

    // Trigger background lookahead prefetch (next 4 MB) while online
    prefetchLookahead(request.url, token, chunkIndex, finalTotal).catch(() => {});

    // If browser requested WITHOUT Range header and entire file fits in this chunk, return 200 OK
    if (parsed.status === "none" && reqStart === 0 && availableEnd + 1 >= finalTotal) {
      return new Response(buffer, {
        status: 200,
        statusText: "OK",
        headers: {
          "Content-Type": contentType || "audio/mpeg",
          "Accept-Ranges": "bytes",
          "Content-Length": String(buffer.byteLength),
          "Cache-Control": "private, max-age=3600",
          "X-Audio-Cache": fromCache ? "HIT-IDB" : "MISS-NET",
        },
      });
    }

    const desiredEnd =
      parsed.status === "ok"
        ? Math.min(parsed.end, availableEnd, finalTotal - 1)
        : Math.min(availableEnd, finalTotal - 1);

    const sliceStart = Math.max(0, offsetInChunk);
    const sliceEnd = Math.max(sliceStart, desiredEnd - chunkGlobalStart + 1);
    const outSlice = buffer.slice(sliceStart, sliceEnd);

    if (outSlice.byteLength === 0) {
      return new Response(null, {
        status: 416,
        statusText: "Range Not Satisfiable",
        headers: {
          "Content-Range": `bytes */${finalTotal}`,
        },
      });
    }

    const actualEnd = reqStart + outSlice.byteLength - 1;

    return new Response(outSlice, {
      status: 206,
      statusText: "Partial Content",
      headers: {
        "Content-Type": contentType || "audio/mpeg",
        "Accept-Ranges": "bytes",
        "Content-Length": String(outSlice.byteLength),
        "Content-Range": `bytes ${reqStart}-${actualEnd}/${finalTotal}`,
        "Cache-Control": "private, max-age=3600",
        "X-Audio-Cache": fromCache ? "HIT-IDB" : "MISS-NET",
      },
    });
  } catch {
    // Only return 503 if actually offline; if online, fall back directly to network fetch!
    if (typeof self.navigator !== "undefined" && self.navigator.onLine === false) {
      return new Response(
        JSON.stringify({ error: "Offline: unbuffered audio chunk" }),
        {
          status: 503,
          statusText: "Service Unavailable",
          headers: { "Content-Type": "application/json" },
        }
      );
    }
    return fetch(request);
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      ...OLD_DB_NAMES.map(
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
  const url = new URL(event.request.url);
  if (
    event.request.method === "GET" &&
    url.origin === self.location.origin &&
    url.pathname === "/api/stream" &&
    url.searchParams.has("t") &&
    !url.searchParams.has("bypass_sw") &&
    !url.searchParams.has("nocache")
  ) {
    event.respondWith(handleAudioStreamRequest(event.request));
  }
});
