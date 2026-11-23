import crypto from "crypto";
import { cookies } from "next/headers";
import { prisma } from "./prisma";
import { getSessionUser } from "./auth";

export const PLAYBACK_WINDOW_MS = 30 * 60 * 1000; // 30 minutes sliding window
export const PLAYBACK_MAX_UNIQUE = 6; // Max 6 distinct audios per 30 minutes
export const GUEST_IP_MAX_UNIQUE = 12; // Secondary IP-level abuse cap for guests rotating cookies

// Staff/privileged roles exempt from the 6-audio / 30-min rate limit.
// Rate limit applies strictly to Guest users and standard USER role (no staff role).
export const RATE_LIMIT_EXEMPT_ROLES = new Set([
  "SUPER_ADMIN",
  "ADMIN",
  "EDITOR",
  "ARTIST",
]);

export const DEVICE_COOKIE_NAME = "gj_did";
export const GRANTS_COOKIE_NAME = "gj_pb_grants";

const DEVICE_COOKIE_TTL_SEC = 365 * 24 * 60 * 60; // 1 year
const GRANTS_COOKIE_TTL_SEC = 35 * 60; // 35 minutes (slightly > 30m window)

function getSigningKey() {
  const raw =
    process.env.PLAYBACK_LIMIT_SECRET ||
    process.env.JWT_SECRET ||
    process.env.GOOGLE_CLIENT_SECRET ||
    "golpojolpo-playback-rate-limit-secret-v1";
  return crypto.createHash("sha256").update(`gj-pblimit-v1:${raw}`).digest();
}

function hmacSign(value) {
  return crypto
    .createHmac("sha256", getSigningKey())
    .update(String(value))
    .digest("base64url");
}

function timingSafeEqualStr(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Normalizes any audio stream token or `/api/stream?t=<token>` into a fixed-length canonical key.
 */
export function canonicalizeAudioKey(rawTokenOrUrl) {
  if (!rawTokenOrUrl || typeof rawTokenOrUrl !== "string") return "";
  let token = rawTokenOrUrl.trim();
  const idx = token.indexOf("t=");
  if (idx >= 0) {
    token = token.slice(idx + 2).split("&")[0].trim();
  }
  if (!token) return "";
  return crypto.createHash("sha256").update(token).digest("base64url").slice(0, 24);
}

export function extractClientIp(request) {
  if (!request) return "unknown";
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "unknown";
}

export function hashIp(ip) {
  if (!ip || ip === "unknown") return null;
  return crypto
    .createHmac("sha256", getSigningKey())
    .update(`ip:${ip}`)
    .digest("base64url")
    .slice(0, 24);
}

/**
 * Signed HttpOnly Guest Device ID (`<id>.<sig>`).
 */
export function signDeviceId(deviceId) {
  return `${deviceId}.${hmacSign(`did:${deviceId}`)}`;
}

export function verifySignedDeviceId(cookieVal) {
  if (!cookieVal || typeof cookieVal !== "string") return null;
  const dotIdx = cookieVal.lastIndexOf(".");
  if (dotIdx <= 0) return null;
  const deviceId = cookieVal.slice(0, dotIdx);
  const sig = cookieVal.slice(dotIdx + 1);
  if (!deviceId || !sig) return null;
  const expected = hmacSign(`did:${deviceId}`);
  return timingSafeEqualStr(sig, expected) ? deviceId : null;
}

/**
 * Resolves the actor identity server-side:
 * - Authenticated user -> `user:<userId>` (shared across all devices logged into the same account)
 * - Guest user -> `guest:<verifiedHttpOnlyDeviceId>` + `ipHash` for abuse protection
 */
export async function resolvePlaybackActor(request) {
  const user = await getSessionUser(request);
  const ipHash = hashIp(extractClientIp(request));

  if (user && user.id) {
    const role = user.role || "USER";
    const isExempt = RATE_LIMIT_EXEMPT_ROLES.has(role);
    return {
      actorKey: `user:${user.id}`,
      isGuest: false,
      userId: user.id,
      role,
      isExempt,
      ipHash,
      newSignedDeviceCookie: null,
    };
  }

  const cookieStore = await cookies();
  const existingCookie = cookieStore.get(DEVICE_COOKIE_NAME)?.value;
  let deviceId = verifySignedDeviceId(existingCookie);
  let newSignedDeviceCookie = null;

  if (!deviceId) {
    deviceId = crypto.randomBytes(16).toString("hex");
    newSignedDeviceCookie = signDeviceId(deviceId);
  }

  return {
    actorKey: `guest:${deviceId}`,
    isGuest: true,
    userId: null,
    role: "GUEST",
    isExempt: false,
    ipHash,
    newSignedDeviceCookie,
  };
}

/**
 * Encodes & signs the actor's active grants into a compact HttpOnly cookie
 * so `/api/stream?t=<token>` can verify playback authorization in O(1) memory (ZERO DB hits!).
 * Format: base64url(JSON({ a: actorKey, x?: 1, exp?: epochSec, g: { [audioKey]: expEpochSec } })) + "." + hmac
 */
export function encodeGrantsCookie(actorKey, activeGrants, isExempt = false) {
  const nowSec = Math.floor(Date.now() / 1000);
  const grantMap = {};
  for (const g of activeGrants || []) {
    const expSec = Math.floor(new Date(g.expiresAt).getTime() / 1000);
    if (expSec > nowSec) {
      grantMap[g.audioKey] = expSec;
    }
  }
  const payloadObj = isExempt
    ? { a: actorKey, x: 1, exp: nowSec + GRANTS_COOKIE_TTL_SEC, g: grantMap }
    : { a: actorKey, g: grantMap };

  const payloadStr = Buffer.from(JSON.stringify(payloadObj), "utf8").toString("base64url");
  const sig = hmacSign(`grants:${payloadStr}`);
  return `${payloadStr}.${sig}`;
}

/**
 * Verifies the signed `gj_pb_grants` cookie in-memory (ZERO DB queries!).
 * Used by `/api/stream?t=<token>` so Range requests, chunks, buffering & SW prefetches
 * never touch the database and never count as new plays.
 */
export function verifyAudioStreamGrantCookie(cookieVal, rawStreamToken) {
  if (!cookieVal || !rawStreamToken) return false;
  const dotIdx = cookieVal.lastIndexOf(".");
  if (dotIdx <= 0) return false;
  const payloadStr = cookieVal.slice(0, dotIdx);
  const sig = cookieVal.slice(dotIdx + 1);
  if (!timingSafeEqualStr(sig, hmacSign(`grants:${payloadStr}`))) {
    return false;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payloadStr, "base64url").toString("utf8"));
    const nowSec = Math.floor(Date.now() / 1000);
    // Exempt staff roles (SUPER_ADMIN, ADMIN, EDITOR, ARTIST) pass immediately until cookie exp
    if (decoded?.x === 1 && typeof decoded.exp === "number" && decoded.exp > nowSec) {
      return true;
    }
    const audioKey = canonicalizeAudioKey(rawStreamToken);
    const expSec = decoded?.g?.[audioKey];
    if (!expSec || typeof expSec !== "number") return false;
    return expSec > nowSec;
  } catch {
    return false;
  }
}

/**
 * Zero-DB, Zero-RAM stateless short-circuit check from the HMAC-signed `gj_pb_grants` cookie.
 * Allows `/api/audio/play-permission` to answer both:
 *  - Already-granted audio reuse (200 OK)
 *  - Already-at-limit 6/6 rejection (429 Too Many Requests)
 * WITHOUT touching Neon PostgreSQL at all!
 */
export function shortCircuitFromSignedGrantsCookie(cookieVal, expectedActorKey, audioKey) {
  if (!cookieVal || !expectedActorKey || !audioKey) return null;
  const dotIdx = cookieVal.lastIndexOf(".");
  if (dotIdx <= 0) return null;
  const payloadStr = cookieVal.slice(0, dotIdx);
  const sig = cookieVal.slice(dotIdx + 1);
  if (!timingSafeEqualStr(sig, hmacSign(`grants:${payloadStr}`))) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payloadStr, "base64url").toString("utf8"));
    if (!decoded || decoded.a !== expectedActorKey || !decoded.g || typeof decoded.g !== "object") {
      return null;
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const activeEntries = [];
    for (const [k, expSec] of Object.entries(decoded.g)) {
      if (typeof expSec === "number" && expSec > nowSec) {
        activeEntries.push({ audioKey: k, expSec });
      }
    }

    if (activeEntries.length === 0) return null;
    activeEntries.sort((a, b) => a.expSec - b.expSec);

    const earliestIso = new Date(activeEntries[0].expSec * 1000).toISOString();

    // Fast-path A: Audio is ALREADY granted in this signed cookie -> 0 DB queries!
    const match = activeEntries.find((e) => e.audioKey === audioKey);
    if (match) {
      return {
        allowed: true,
        reused: true,
        fromCookieShortCircuit: true,
        audioKey,
        limit: PLAYBACK_MAX_UNIQUE,
        used: activeEntries.length,
        remaining: Math.max(0, PLAYBACK_MAX_UNIQUE - activeEntries.length),
        expiresAt: new Date(match.expSec * 1000).toISOString(),
        nextAvailableAt: earliestIso,
      };
    }

    // Fast-path B: Actor ALREADY has 6 active grants in this signed cookie -> instant 429 with 0 DB queries!
    if (activeEntries.length >= PLAYBACK_MAX_UNIQUE) {
      const retryAfterSec = Math.max(1, activeEntries[0].expSec - nowSec);
      return {
        allowed: false,
        reason: "RATE_LIMIT_EXCEEDED",
        fromCookieShortCircuit: true,
        audioKey,
        limit: PLAYBACK_MAX_UNIQUE,
        used: activeEntries.length,
        remaining: 0,
        retryAfterSec,
        nextAvailableAt: earliestIso,
      };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Atomically checks and grants playback permission for `(actorKey, audioKey)`
 * using PostgreSQL transaction-scoped advisory locks (`pg_advisory_xact_lock`)
 * so concurrent requests can NEVER exceed 6 unique audios per 30-minute sliding window.
 */
export async function requestAtomicPlayPermission({ actorKey, isGuest, ipHash, audioKey }) {
  const now = new Date();
  const expiresAt = new Date(now.getTime() + PLAYBACK_WINDOW_MS);

  return prisma.$transaction(
    async (tx) => {
      // 1. Serialize concurrent requests for this exact actor (and IP for guests)
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${actorKey}))`;
      if (isGuest && ipHash) {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`ip:${ipHash}`}))`;
      }

      // 2. Prune expired grants for this actor
      await tx.$executeRaw`
        DELETE FROM "audio_play_grants"
        WHERE "actorKey" = ${actorKey} AND "expiresAt" <= ${now}
      `;

      // 3. Fetch currently active grants in the 30-minute sliding window
      const activeGrants = await tx.$queryRaw`
        SELECT "id", "actorKey", "audioKey", "ipHash", "grantedAt", "expiresAt"
        FROM "audio_play_grants"
        WHERE "actorKey" = ${actorKey} AND "expiresAt" > ${now}
        ORDER BY "expiresAt" ASC
      `;

      // 4. Already granted in this window? Reuse without consuming a new slot!
      const existing = activeGrants.find((g) => g.audioKey === audioKey);
      if (existing) {
        return {
          allowed: true,
          reused: true,
          audioKey,
          limit: PLAYBACK_MAX_UNIQUE,
          used: activeGrants.length,
          remaining: Math.max(0, PLAYBACK_MAX_UNIQUE - activeGrants.length),
          expiresAt: new Date(existing.expiresAt).toISOString(),
          nextAvailableAt: activeGrants[0]
            ? new Date(activeGrants[0].expiresAt).toISOString()
            : null,
          activeGrants,
        };
      }

      // 5. Check actor 6-audio sliding window limit
      if (activeGrants.length >= PLAYBACK_MAX_UNIQUE) {
        const earliest = new Date(activeGrants[0].expiresAt);
        const retryAfterSec = Math.max(1, Math.ceil((earliest.getTime() - now.getTime()) / 1000));
        return {
          allowed: false,
          reason: "RATE_LIMIT_EXCEEDED",
          audioKey,
          limit: PLAYBACK_MAX_UNIQUE,
          used: activeGrants.length,
          remaining: 0,
          retryAfterSec,
          nextAvailableAt: earliest.toISOString(),
          activeGrants,
        };
      }

      // 6. Secondary IP-level abuse protection for guests rotating/clearing cookies
      if (isGuest && ipHash) {
        const ipGrants = await tx.$queryRaw`
          SELECT "audioKey", "expiresAt"
          FROM "audio_play_grants"
          WHERE "ipHash" = ${ipHash} AND "expiresAt" > ${now}
          ORDER BY "expiresAt" ASC
        `;
        const distinctIpAudios = new Set(ipGrants.map((g) => g.audioKey));
        if (!distinctIpAudios.has(audioKey) && distinctIpAudios.size >= GUEST_IP_MAX_UNIQUE) {
          const earliest = new Date(ipGrants[0].expiresAt);
          const retryAfterSec = Math.max(1, Math.ceil((earliest.getTime() - now.getTime()) / 1000));
          return {
            allowed: false,
            reason: "IP_ABUSE_LIMIT_EXCEEDED",
            audioKey,
            limit: PLAYBACK_MAX_UNIQUE,
            used: PLAYBACK_MAX_UNIQUE,
            remaining: 0,
            retryAfterSec,
            nextAvailableAt: earliest.toISOString(),
            activeGrants,
          };
        }
      }

      // 7. Grant new playback slot atomically
      const newId = crypto.randomBytes(12).toString("hex");
      const storedIp = isGuest ? ipHash : null;
      await tx.$executeRaw`
        INSERT INTO "audio_play_grants" ("id", "actorKey", "audioKey", "ipHash", "grantedAt", "expiresAt")
        VALUES (${newId}, ${actorKey}, ${audioKey}, ${storedIp}, ${now}, ${expiresAt})
        ON CONFLICT ("actorKey", "audioKey")
        DO UPDATE SET "grantedAt" = ${now}, "expiresAt" = ${expiresAt}, "ipHash" = ${storedIp}
      `;

      const created = { id: newId, actorKey, audioKey, ipHash: storedIp, grantedAt: now, expiresAt };
      const updatedGrants = [...activeGrants, created].sort(
        (a, b) => new Date(a.expiresAt).getTime() - new Date(b.expiresAt).getTime()
      );

      return {
        allowed: true,
        reused: false,
        audioKey,
        limit: PLAYBACK_MAX_UNIQUE,
        used: updatedGrants.length,
        remaining: Math.max(0, PLAYBACK_MAX_UNIQUE - updatedGrants.length),
        expiresAt: expiresAt.toISOString(),
        nextAvailableAt: updatedGrants[0]
          ? new Date(updatedGrants[0].expiresAt).toISOString()
          : null,
        activeGrants: updatedGrants,
      };
    },
    { timeout: 10000 }
  );
}

/**
 * Read-only quota status for the current actor (used by GET /api/audio/play-permission).
 */
export async function getPlaybackQuotaStatus(actorKey) {
  const now = new Date();
  const activeGrants = await prisma.$queryRaw`
    SELECT "audioKey", "expiresAt"
    FROM "audio_play_grants"
    WHERE "actorKey" = ${actorKey} AND "expiresAt" > ${now}
    ORDER BY "expiresAt" ASC
  `;

  const used = activeGrants.length;
  const earliest = activeGrants[0] ? new Date(activeGrants[0].expiresAt) : null;
  const retryAfterSec =
    used >= PLAYBACK_MAX_UNIQUE && earliest
      ? Math.max(1, Math.ceil((earliest.getTime() - now.getTime()) / 1000))
      : 0;

  return {
    limit: PLAYBACK_MAX_UNIQUE,
    windowMinutes: 30,
    used,
    remaining: Math.max(0, PLAYBACK_MAX_UNIQUE - used),
    retryAfterSec,
    nextAvailableAt: earliest ? earliest.toISOString() : null,
    grantedAudioKeys: activeGrants.map((g) => ({
      audioKey: g.audioKey,
      expiresAt: new Date(g.expiresAt).toISOString(),
    })),
  };
}

export function getDeviceCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DEVICE_COOKIE_TTL_SEC,
  };
}

export function getGrantsCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: GRANTS_COOKIE_TTL_SEC,
  };
}
