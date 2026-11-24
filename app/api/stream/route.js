import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decryptAudioToken } from "../../../lib/audioCrypto";
import {
  createR2PresignedGetUrl,
  extractR2ObjectKey,
} from "../../../lib/r2Signer";
import {
  GRANTS_COOKIE_NAME,
  verifyAudioStreamGrantCookie,
} from "../../../lib/playbackRateLimit";

/**
 * GET /api/stream?t=<encrypted_token> OR /api/stream?url=<external_url>
 *
 * Decrypts the audio token (or proxies an external eBook/text URL) on the server
 * to avoid CORS errors and hide raw Dropbox/external URLs.
 *
 * For audio streams (`?t=<token>`):
 * - Verifies the HMAC-signed HttpOnly `gj_pb_grants` cookie in O(1) memory (ZERO DB hits!).
 * - Range requests, chunks, buffering, retries, and SW prefetches NEVER count as new plays.
 */
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const token = searchParams.get("t");
  const rawUrlParam = searchParams.get("url");

  let targetUrl = "";
  if (token) {
    // Enforce server-side playback grant verification in-memory (0 DB / 0 Firebase reads)
    const cookieStore = await cookies();
    const grantCookie = cookieStore.get(GRANTS_COOKIE_NAME)?.value;
    if (!verifyAudioStreamGrantCookie(grantCookie, token)) {
      return NextResponse.json(
        { error: "Playback permission required or expired" },
        { status: 403, headers: { "Cache-Control": "no-store" } }
      );
    }
    targetUrl = decryptAudioToken(token) || "";

    // Zero Fast Origin Transfer Lock:
    // NEVER proxy audio bytes through Vercel Serverless Functions!
    // 1. If stored in Cloudflare R2 (`r2://...`), 302 redirect to a short-lived SigV4 Presigned URL.
    // 2. Even if a legacy/external URL (Dropbox/Drive/HTTPS) is encountered, 302 redirect directly
    //    to the upstream media URL so 0 audio bytes EVER pass through Vercel Origin!
    const r2Key = extractR2ObjectKey(targetUrl);
    if (r2Key) {
      const signedR2Url = createR2PresignedGetUrl(r2Key, 1800);
      if (signedR2Url) {
        return NextResponse.redirect(signedR2Url, {
          status: 302,
          headers: { "Cache-Control": "no-store" },
        });
      }
      return NextResponse.json(
        { error: "R2 storage configuration unavailable" },
        { status: 503, headers: { "Cache-Control": "no-store" } }
      );
    }

    if (targetUrl.startsWith("http://") || targetUrl.startsWith("https://")) {
      return NextResponse.redirect(targetUrl, {
        status: 302,
        headers: { "Cache-Control": "private, max-age=1800" },
      });
    }

    return NextResponse.json(
      { error: "Unsupported audio source" },
      { status: 400, headers: { "Cache-Control": "no-store" } }
    );
  } else if (rawUrlParam) {
    // Reconstruct the full external URL from the raw query string so unencoded '&' parameters
    // (such as Dropbox's &st=...&raw=1) are never stripped by searchParams.get("url")!
    const rawQuery = request.url.split("?")[1] || "";
    const urlKeyIdx = rawQuery.indexOf("url=");
    const extracted =
      urlKeyIdx >= 0
        ? decodeURIComponent(rawQuery.slice(urlKeyIdx + 4))
        : rawUrlParam;

    targetUrl = extracted.replace(/^['"“”‘’\s]+|['"“”‘’\s]+$/g, "").trim();
    if (targetUrl.includes("dropbox.com")) {
      targetUrl = targetUrl.replace("www.dropbox.com", "dl.dropboxusercontent.com");
      if (targetUrl.includes("dl=0")) {
        targetUrl = targetUrl.replace("dl=0", "raw=1");
      } else if (!targetUrl.includes("raw=1") && !targetUrl.includes("dl=1")) {
        targetUrl += targetUrl.includes("?") ? "&raw=1" : "?raw=1";
      }
    }
    if (targetUrl.includes("drive.google.com/file/d/")) {
      const match = targetUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
      if (match && match[1]) {
        targetUrl = `https://drive.google.com/uc?export=download&id=${match[1]}`;
      }
    }
  }

  if (!targetUrl) {
    return NextResponse.json({ error: "Missing or invalid target URL" }, { status: 400 });
  }

  try {
    const requestHeaders = new Headers();
    const rangeHeader = request.headers.get("range");
    if (rangeHeader) {
      requestHeaders.set("Range", rangeHeader);
    }
    requestHeaders.set(
      "User-Agent",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
    );

    const upstream = await fetch(targetUrl, {
      method: "GET",
      headers: requestHeaders,
      redirect: "follow",
    });

    if (!upstream.ok && upstream.status !== 206) {
      return NextResponse.json(
        { error: "Upstream audio unavailable" },
        { status: upstream.status || 502 }
      );
    }

    const upstreamType = (upstream.headers.get("content-type") || "").toLowerCase();
    const contentLengthNum = Number(upstream.headers.get("content-length") || 0);
    const MAX_TEXT_PROXY_BYTES = 5 * 1024 * 1024; // 5 MB strict cap (eBook .txt files only)

    // Hard guard: never proxy audio/video or large binaries even via `?url=`
    if (
      upstreamType.startsWith("audio/") ||
      upstreamType.startsWith("video/") ||
      contentLengthNum > MAX_TEXT_PROXY_BYTES
    ) {
      try {
        await upstream.body?.cancel();
      } catch {
        // ignore
      }
      return NextResponse.redirect(targetUrl, {
        status: 302,
        headers: { "Cache-Control": "public, max-age=3600" },
      });
    }

    const responseHeaders = new Headers();
    responseHeaders.set(
      "Content-Type",
      upstream.headers.get("content-type") || "text/plain; charset=utf-8"
    );

    const contentLength = upstream.headers.get("content-length");
    if (contentLength) {
      responseHeaders.set("Content-Length", contentLength);
    }

    // Cache public eBook text at Vercel Edge CDN for 7 days (0 repeat Fast Origin Transfer!)
    responseHeaders.set(
      "Cache-Control",
      "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400"
    );

    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Audio stream proxy error" },
      { status: 500 }
    );
  }
}
