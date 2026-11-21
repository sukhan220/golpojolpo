import crypto from "crypto";
import { cookies } from "next/headers";

export const AUTH_COOKIE_NAME = "gj_jwt";
export const OAUTH_STATE_COOKIE = "gj_oauth_state";
const JWT_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

export const ROLES = {
  SUPER_ADMIN: "SUPER_ADMIN", // Owner
  ADMIN: "ADMIN",
  EDITOR: "EDITOR",
  ARTIST: "ARTIST",
  USER: "USER",
};

export const ROLE_HIERARCHY = {
  SUPER_ADMIN: 5,
  ADMIN: 4,
  EDITOR: 3,
  ARTIST: 2,
  USER: 1,
};

export const ROLE_LABELS_BN = {
  SUPER_ADMIN: "Super Admin (Owner)",
  ADMIN: "Admin",
  EDITOR: "Editor",
  ARTIST: "Artist",
  USER: "User",
};

function getJwtSecretKey() {
  const raw =
    process.env.JWT_SECRET ||
    process.env.GOOGLE_CLIENT_SECRET ||
    "golpojolpo-dev-jwt-secret-change-in-prod";
  // Derive a fixed 32-byte HMAC key via SHA-256
  return crypto.createHash("sha256").update(`gj-jwt-v1:${raw}`).digest();
}

function base64UrlEncode(input) {
  const buf = Buffer.isBuffer(input) ? input : Buffer.from(String(input), "utf8");
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function base64UrlDecode(str) {
  const padLen = (4 - (str.length % 4)) % 4;
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat(padLen);
  return Buffer.from(base64, "base64").toString("utf8");
}

export function generateRandomToken(bytes = 16) {
  return crypto.randomBytes(bytes).toString("hex");
}

/**
 * Signs an RFC 7519 HS256 JWT for the authenticated user.
 */
export function signAuthJwt(user) {
  const nowSec = Math.floor(Date.now() / 1000);
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    sub: user.id,
    email: user.email,
    name: user.name || "",
    avatar: user.avatar || null,
    role: user.role || ROLES.USER,
    iat: nowSec,
    exp: nowSec + JWT_TTL_SECONDS,
  };

  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const sig = crypto
    .createHmac("sha256", getJwtSecretKey())
    .update(signingInput)
    .digest();

  return `${signingInput}.${base64UrlEncode(sig)}`;
}

/**
 * Verifies an HS256 JWT and returns the decoded user claims, or null if invalid/expired.
 */
export function verifyAuthJwt(token) {
  if (!token || typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;

  const [encodedHeader, encodedPayload, encodedSig] = parts;
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const expectedSig = base64UrlEncode(
    crypto.createHmac("sha256", getJwtSecretKey()).update(signingInput).digest()
  );

  // Constant-time comparison to prevent timing attacks
  const sigBuf = Buffer.from(encodedSig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload));
    const nowSec = Math.floor(Date.now() / 1000);
    if (!payload.sub || !payload.exp || payload.exp < nowSec) {
      return null;
    }
    return {
      id: payload.sub,
      email: payload.email,
      name: payload.name || "",
      avatar: payload.avatar || null,
      role: payload.role || ROLES.USER,
    };
  } catch {
    return null;
  }
}

/**
 * Resolves the authenticated user from JWT in either:
 * 1. `Authorization: Bearer <jwt>` header (React Native / Mobile App)
 * 2. HttpOnly `gj_jwt` cookie (Web)
 */
export async function getSessionUser(request = null) {
  let rawToken = null;

  if (request) {
    const authHeader = request.headers.get("authorization") || "";
    if (authHeader.toLowerCase().startsWith("bearer ")) {
      rawToken = authHeader.slice(7).trim();
    }
  }

  if (!rawToken) {
    const cookieStore = await cookies();
    rawToken = cookieStore.get(AUTH_COOKIE_NAME)?.value || null;
  }

  if (!rawToken) return null;
  return verifyAuthJwt(rawToken);
}

export function hasRole(user, allowedRoles = []) {
  if (!user || !user.role) return false;
  return allowedRoles.includes(user.role);
}

export function hasMinRole(user, minRole) {
  if (!user || !user.role) return false;
  return (ROLE_HIERARCHY[user.role] || 0) >= (ROLE_HIERARCHY[minRole] || 0);
}

export function getCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: JWT_TTL_SECONDS,
  };
}
