import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decryptAudioToken } from "../../../lib/audioCrypto";
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

    const responseHeaders = new Headers();
    responseHeaders.set(
      "Content-Type",
      upstream.headers.get("content-type") || "audio/mpeg"
    );
    responseHeaders.set(
      "Accept-Ranges",
      upstream.headers.get("accept-ranges") || "bytes"
    );

    const contentLength = upstream.headers.get("content-length");
    if (contentLength) {
      responseHeaders.set("Content-Length", contentLength);
    }

    const contentRange = upstream.headers.get("content-range");
    if (contentRange) {
      responseHeaders.set("Content-Range", contentRange);
    }

    responseHeaders.set("Cache-Control", "private, max-age=3600");

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
