import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { decryptAudioToken } from "../../../../lib/audioCrypto";
import {
  createR2PresignedGetUrl,
  extractR2ObjectKey,
} from "../../../../lib/r2Signer";
import {
  canonicalizeAudioKey,
  DEVICE_COOKIE_NAME,
  encodeGrantsCookie,
  getDeviceCookieOptions,
  getGrantsCookieOptions,
  getPlaybackQuotaStatus,
  GRANTS_COOKIE_NAME,
  requestAtomicPlayPermission,
  resolvePlaybackActor,
  shortCircuitFromSignedGrantsCookie,
} from "../../../../lib/playbackRateLimit";

function resolveDirectR2PlaybackUrl(rawInput, expiresSec = 1800) {
  const decrypted = decryptAudioToken(rawInput);
  if (!decrypted) return null;
  const r2Key = extractR2ObjectKey(decrypted);
  if (!r2Key) return null;
  return createR2PresignedGetUrl(r2Key, expiresSec);
}

/**
 * GET /api/audio/play-permission
 * Returns current actor's 30-minute sliding window quota status (read-only).
 */
export async function GET(request) {
  try {
    const actor = await resolvePlaybackActor(request);
    const status = await getPlaybackQuotaStatus(actor.actorKey);
    const response = NextResponse.json({
      ...status,
      actorType: actor.isGuest ? "guest" : "user",
    });

    if (actor.newSignedDeviceCookie) {
      response.cookies.set(
        DEVICE_COOKIE_NAME,
        actor.newSignedDeviceCookie,
        getDeviceCookieOptions()
      );
    }
    return response;
  } catch (err) {
    if (err?.digest === "NEXT_PRERENDER_INTERRUPTED") throw err;
    console.error("Play permission GET error:", err);
    return NextResponse.json(
      { error: "Failed to check playback quota" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/audio/play-permission
 * Body: { streamUrl?: string, token?: string }
 *
 * Atomically checks/grants playback permission for an audio track within the
 * 30-minute sliding window (max 6 unique audios per user/guest).
 * - Returns 200 OK with updated signed HttpOnly `gj_pb_grants` cookie when allowed.
 * - Returns 429 Too Many Requests with `Retry-After` header & `nextAvailableAt` when limit reached.
 */
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const rawInput = body.token || body.streamUrl || "";
    const audioKey = canonicalizeAudioKey(rawInput);

    if (!audioKey) {
      return NextResponse.json(
        { error: "Valid audio token or streamUrl is required" },
        { status: 400 }
      );
    }

    const actor = await resolvePlaybackActor(request);

    // Exempt GolpoJolpo staff roles (SUPER_ADMIN, ADMIN, EDITOR, ARTIST) from the 6-audio limit
    if (actor.isExempt) {
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();
      const signedGrants = encodeGrantsCookie(actor.actorKey, [], true);
      const directUrl = resolveDirectR2PlaybackUrl(rawInput, 1800);
      const response = NextResponse.json(
        {
          allowed: true,
          exempt: true,
          role: actor.role,
          audioKey,
          expiresAt,
          directUrl,
        },
        {
          status: 200,
          headers: { "Cache-Control": "no-store" },
        }
      );
      response.cookies.set(GRANTS_COOKIE_NAME, signedGrants, getGrantsCookieOptions());
      return response;
    }

    // Zero-DB Short-Circuit: if signed HttpOnly `gj_pb_grants` cookie already proves
    // this audio is granted OR all 6 slots are full, respond immediately without hitting Neon DB!
    const cookieStore = await cookies();
    const existingGrantsCookie = cookieStore.get(GRANTS_COOKIE_NAME)?.value;
    const fastResult = shortCircuitFromSignedGrantsCookie(
      existingGrantsCookie,
      actor.actorKey,
      audioKey
    );

    if (fastResult) {
      if (!fastResult.allowed) {
        return NextResponse.json(
          {
            allowed: false,
            reason: fastResult.reason,
            limit: fastResult.limit,
            used: fastResult.used,
            remaining: 0,
            retryAfterSec: fastResult.retryAfterSec,
            nextAvailableAt: fastResult.nextAvailableAt,
            error: "PLAYBACK_RATE_LIMITED",
          },
          {
            status: 429,
            headers: {
              "Retry-After": String(fastResult.retryAfterSec),
              "Cache-Control": "no-store",
            },
          }
        );
      }

      const directUrl = resolveDirectR2PlaybackUrl(rawInput, 1800);
      return NextResponse.json(
        {
          allowed: true,
          reused: true,
          audioKey: fastResult.audioKey,
          limit: fastResult.limit,
          used: fastResult.used,
          remaining: fastResult.remaining,
          expiresAt: fastResult.expiresAt,
          nextAvailableAt: fastResult.nextAvailableAt,
          directUrl,
        },
        {
          status: 200,
          headers: { "Cache-Control": "no-store" },
        }
      );
    }

    const result = await requestAtomicPlayPermission({
      actorKey: actor.actorKey,
      isGuest: actor.isGuest,
      ipHash: actor.ipHash,
      audioKey,
    });

    const signedGrants = encodeGrantsCookie(actor.actorKey, result.activeGrants, false);

    if (!result.allowed) {
      const response = NextResponse.json(
        {
          allowed: false,
          reason: result.reason,
          limit: result.limit,
          used: result.used,
          remaining: 0,
          retryAfterSec: result.retryAfterSec,
          nextAvailableAt: result.nextAvailableAt,
          error: "PLAYBACK_RATE_LIMITED",
        },
        {
          status: 429,
          headers: {
            "Retry-After": String(result.retryAfterSec),
            "Cache-Control": "no-store",
          },
        }
      );

      if (actor.newSignedDeviceCookie) {
        response.cookies.set(
          DEVICE_COOKIE_NAME,
          actor.newSignedDeviceCookie,
          getDeviceCookieOptions()
        );
      }
      response.cookies.set(GRANTS_COOKIE_NAME, signedGrants, getGrantsCookieOptions());
      return response;
    }

    const directUrl = resolveDirectR2PlaybackUrl(rawInput, 1800);
    const response = NextResponse.json(
      {
        allowed: true,
        reused: result.reused,
        audioKey: result.audioKey,
        limit: result.limit,
        used: result.used,
        remaining: result.remaining,
        expiresAt: result.expiresAt,
        nextAvailableAt: result.nextAvailableAt,
        directUrl,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );

    if (actor.newSignedDeviceCookie) {
      response.cookies.set(
        DEVICE_COOKIE_NAME,
        actor.newSignedDeviceCookie,
        getDeviceCookieOptions()
      );
    }
    response.cookies.set(GRANTS_COOKIE_NAME, signedGrants, getGrantsCookieOptions());
    return response;
  } catch (err) {
    console.error("Play permission POST error:", err);
    return NextResponse.json(
      { error: "Playback permission check failed" },
      { status: 500 }
    );
  }
}
