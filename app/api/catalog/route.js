import { NextResponse } from "next/server";
import {
  fetchAudioBooksOnce,
  fetchCategoriesOnce,
  fetchShortStoriesOnce,
  fetchWritersOnce,
  normalizeAudioBook,
  normalizeCategory,
  normalizeShortStory,
  normalizeWriter,
} from "../../../lib/firebase";
import { prisma } from "../../../lib/prisma";
import {
  getServerCatalogCache,
  getServerSyncState,
  setServerCatalogCache,
} from "../../../lib/cacheStore";

let inFlightCatalogPromise = null;

async function fetchCatalogFromNeonFallback() {
  const [cats, books, stories, writers] = await Promise.all([
    prisma.category.findMany(),
    prisma.book.findMany(),
    prisma.shortStory.findMany(),
    prisma.writer.findMany({
      include: {
        categories: {
          include: { category: true },
        },
      },
    }),
  ]);

  return {
    source: "neon",
    categories: cats.map((c) =>
      normalizeCategory(c.docId, {
        bn: c.bn,
        en: c.en || "",
        audio: c.audio,
        kindle: c.kindle,
      })
    ),
    books: books.map((b) =>
      normalizeAudioBook(b.docId, {
        title: b.title,
        artist: b.artist || "",
        writer: b.writer || "",
        writerId: b.writerId || "",
        cateId: b.cateId || "",
        voice: b.voice || "",
        time: b.time || "",
        url: b.url || "",
        artwork: b.artwork || "",
        description: b.description || "",
        tracks: Array.isArray(b.tracksJson) ? b.tracksJson : undefined,
      })
    ),
    shortStory: stories.map((s) =>
      normalizeShortStory(s.docId, {
        title: s.title,
        writer: s.writer,
        writerId: s.writerId || "",
        cateId: s.cateId || "",
        fileUrl: s.fileUrl || "",
        artwork: s.artwork || "",
        content: s.content || "",
      })
    ),
    writer: writers.map((w) => {
      const catLinks = Array.isArray(w.categories) ? w.categories : [];
      return normalizeWriter(w.docId, {
        bn: w.bn,
        en: w.en || "",
        img: w.avatar || "",
        show: w.show,
        cateId: catLinks.map((link) => link.categoryId).filter(Boolean),
        categories: catLinks.map((link) => link.category?.bn).filter(Boolean),
      });
    }),
  };
}

async function buildCatalogBundle() {
  // Primary: Firebase Firestore (normalized & audio URLs encrypted on server)
  try {
    const [categories, books, shortStory, writer] = await Promise.all([
      fetchCategoriesOnce(),
      fetchAudioBooksOnce(),
      fetchShortStoriesOnce(),
      fetchWritersOnce(),
    ]);

    if (books.length > 0 || categories.length > 0) {
      return {
        source: "firestore",
        categories,
        books,
        shortStory,
        writer,
      };
    }
  } catch (err) {
    console.warn("Catalog API Firestore primary fetch failed, trying Neon fallback:", err?.message);
  }

  // Secondary Automatic Failover: Neon PostgreSQL (handles unlimited traffic even if Firebase quota ends!)
  return fetchCatalogFromNeonFallback();
}

/**
 * GET /api/catalog
 *
 * Edge-Cached Public Catalog Endpoint:
 * - Served from Vercel Edge CDN (`s-maxage=900, stale-while-revalidate=86400`) so 100,000+ new visitors
 *   share 1 cached JSON response (ZERO per-visitor Firebase reads & ZERO Fast Origin Transfer spikes!).
 * - Encrypts all `r2://` and external audio URLs on the server so raw storage paths never reach the browser.
 * - Automatically fails over to Neon PostgreSQL if Firebase Firestore is ever unavailable or rate-limited.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const forceFresh = searchParams.get("fresh") === "1";

  try {
    let bundle = !forceFresh ? getServerCatalogCache() : null;

    if (!bundle) {
      if (!inFlightCatalogPromise || forceFresh) {
        inFlightCatalogPromise = buildCatalogBundle()
          .then((res) => {
            setServerCatalogCache(res);
            return res;
          })
          .finally(() => {
            inFlightCatalogPromise = null;
          });
      }
      bundle = await inFlightCatalogPromise;
    }

    const syncState = getServerSyncState();
    const cacheHeader = forceFresh
      ? "no-store"
      : "public, max-age=120, s-maxage=900, stale-while-revalidate=86400";

    return NextResponse.json(
      {
        ok: true,
        version: syncState.version,
        source: bundle.source,
        categories: bundle.categories,
        books: bundle.books,
        shortStory: bundle.shortStory,
        writer: bundle.writer,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": cacheHeader,
        },
      }
    );
  } catch (err) {
    if (err?.digest === "NEXT_PRERENDER_INTERRUPTED") throw err;
    console.error("Catalog API error:", err);
    return NextResponse.json(
      { ok: false, error: "Catalog temporarily unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
