import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { getServerSyncState, recordReverseApiEvent } from "../../../lib/cacheStore";

const VALID_COLLECTIONS = new Set(["categories", "books", "shortStory", "writer", "all"]);
const VALID_ACTIONS = new Set(["add", "update", "delete", "invalidate"]);

/**
 * GET /api/sync
 * Returns current cache version and any Reverse API pushed events since `sinceVersion`.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const sinceVersion = Number(searchParams.get("sinceVersion") || 0);

  const state = getServerSyncState();
  const events =
    sinceVersion > 0
      ? state.pushedEvents.filter((e) => e.version > sinceVersion)
      : state.pushedEvents;

  return NextResponse.json(
    {
      ok: true,
      version: state.version,
      collectionVersions: state.collectionVersions,
      lastUpdated: state.lastUpdated,
      events,
    },
    {
      headers: {
        // Cache at Vercel Edge CDN for 5 minutes so all visitors share 1 Edge response (0 Fast Origin Transfer!)
        "Cache-Control": "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
      },
    }
  );
}

/**
 * POST /api/sync (Reverse API Webhook)
 *
 * Allows external services / admin / webhooks to push new items or invalidate cache
 * so the app never needs to constantly poll or hit Firebase.
 *
 * Example Body 1 (Direct Add without hitting Firebase):
 * {
 *   "collection": "categories",
 *   "action": "add",
 *   "data": { "id": "c-99", "bn": "নতুন বিভাগ", "en": "New Category", "audio": true, "kindle": true }
 * }
 *
 * Example Body 2 (Force one-time Firebase re-fetch for a collection):
 * {
 *   "collection": "books",
 *   "action": "invalidate"
 * }
 */
export async function POST(request) {
  try {
    const body = await request.json();
    const { collection, action = "add", data = null, secret } = body || {};

    // Optional secret verification if SYNC_API_SECRET is configured in .env.local
    if (process.env.SYNC_API_SECRET && secret !== process.env.SYNC_API_SECRET) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized: Invalid Reverse API secret" },
        { status: 401 }
      );
    }

    if (!collection || !VALID_COLLECTIONS.has(collection)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid 'collection'. Use 'categories', 'books', 'shortStory', 'writer', or 'all'.",
        },
        { status: 400 }
      );
    }

    if (!VALID_ACTIONS.has(action)) {
      return NextResponse.json(
        {
          ok: false,
          error: "Invalid 'action'. Use 'add', 'update', 'delete', or 'invalidate'.",
        },
        { status: 400 }
      );
    }

    const { state, event } = recordReverseApiEvent({
      collection,
      action,
      data,
    });

    // Revalidate Next.js route, Sync endpoint & Edge-Cached Catalog API immediately
    revalidatePath("/");
    revalidatePath("/api/catalog");
    revalidatePath("/api/sync");

    return NextResponse.json({
      ok: true,
      message: `Reverse API sync applied (${action} on ${collection})`,
      version: state.version,
      collectionVersions: state.collectionVersions,
      event,
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err?.message || "Invalid JSON payload" },
      { status: 400 }
    );
  }
}
