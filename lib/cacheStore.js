/**
 * Global Server & Client Cache Store for GolpoJolpo
 *
 * Ensures Firebase Firestore is NOT hit on every request/render.
 * Supports Reverse API pushes (POST /api/sync) to add, update, delete,
 * or invalidate cached items across collections:
 * - categories
 * - books
 * - shortStory
 * - writer
 */

const globalForCache = globalThis;

if (!globalForCache.__GOLPOJOLPO_SYNC_STATE__) {
  globalForCache.__GOLPOJOLPO_SYNC_STATE__ = {
    version: 1,
    collectionVersions: {
      categories: 1,
      books: 1,
      shortStory: 1,
      writer: 1,
    },
    // Stores items pushed directly via Reverse API so clients can merge without hitting Firebase
    pushedEvents: [],
    lastUpdated: Date.now(),
  };
}

export function getServerSyncState() {
  return globalForCache.__GOLPOJOLPO_SYNC_STATE__;
}

/**
 * Record an event from Reverse API (POST /api/sync)
 * @param {Object} payload
 * @param {"categories"|"books"|"shortStory"|"writer"|"all"} payload.collection
 * @param {"add"|"update"|"delete"|"invalidate"} [payload.action="add"]
 * @param {Object|Array} [payload.data]
 */
export function recordReverseApiEvent({ collection, action = "add", data = null }) {
  const state = getServerSyncState();
  state.version += 1;
  state.lastUpdated = Date.now();

  const targets =
    collection === "all"
      ? ["categories", "books", "shortStory", "writer"]
      : [collection];

  targets.forEach((col) => {
    if (state.collectionVersions[col] !== undefined) {
      state.collectionVersions[col] += 1;
    }
  });

  const event = {
    id: `evt_${state.version}_${Date.now()}`,
    version: state.version,
    collection,
    action,
    data,
    timestamp: state.lastUpdated,
  };

  // Keep last 100 events in memory buffer
  state.pushedEvents.push(event);
  if (state.pushedEvents.length > 100) {
    state.pushedEvents = state.pushedEvents.slice(-100);
  }

  return {
    state,
    event,
  };
}
