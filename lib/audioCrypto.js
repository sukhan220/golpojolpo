/**
 * Audio URL Encryption & Decryption Utility
 *
 * Hides raw Dropbox / external audio URLs from the DOM (<audio src="...">),
 * localStorage cache, and browser Network tab by encrypting them into an
 * opaque token served through `/api/stream?t=<token>`.
 */

const SECRET_KEY = "GolpoJolpo_Audio_Stream_Secret_Key_2026_!@#";

function toBytes(str) {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(str);
  }
  const arr = [];
  for (let i = 0; i < str.length; i++) {
    arr.push(str.charCodeAt(i) & 0xff);
  }
  return new Uint8Array(arr);
}

function fromBytes(bytes) {
  if (typeof TextDecoder !== "undefined") {
    return new TextDecoder().decode(bytes);
  }
  return String.fromCharCode(...bytes);
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  const b64 =
    typeof btoa !== "undefined"
      ? btoa(binary)
      : Buffer.from(bytes).toString("base64");
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBytes(b64url) {
  const padded = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (padded.length % 4)) % 4;
  const b64 = padded + "=".repeat(padLen);

  if (typeof atob !== "undefined") {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }
  return new Uint8Array(Buffer.from(b64, "base64"));
}

/**
 * Encrypts a raw audio URL into `/api/stream?t=<encrypted_token>`
 */
export function encryptAudioUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return "";
  const trimmed = rawUrl.trim();
  if (!trimmed) return "";

  // If already encrypted into /api/stream?t=..., return as-is
  if (trimmed.startsWith("/api/stream?t=")) {
    return trimmed;
  }

  const dataBytes = toBytes(trimmed);
  const keyBytes = toBytes(SECRET_KEY);
  // Deterministic 2-byte salt from URL so same URL produces consistent cacheable token
  let hash = 5381;
  for (let i = 0; i < dataBytes.length; i++) {
    hash = ((hash << 5) + hash) ^ dataBytes[i];
  }
  const s0 = (hash & 0xff) || 0x5a;
  const s1 = ((hash >> 8) & 0xff) || 0xa5;

  const out = new Uint8Array(dataBytes.length + 2);
  out[0] = s0;
  out[1] = s1;

  for (let i = 0; i < dataBytes.length; i++) {
    const k = keyBytes[i % keyBytes.length];
    const saltByte = i % 2 === 0 ? s0 : s1;
    out[i + 2] = dataBytes[i] ^ k ^ saltByte ^ (i & 0xff);
  }

  const token = bytesToBase64Url(out);
  return `/api/stream?t=${token}`;
}

/**
 * Decrypts `/api/stream?t=<token>` or raw token back into the upstream audio URL
 */
export function decryptAudioToken(tokenInput) {
  if (!tokenInput || typeof tokenInput !== "string") return "";
  let token = tokenInput.trim();
  if (token.startsWith("/api/stream?t=")) {
    token = token.slice("/api/stream?t=".length);
  }

  try {
    const raw = base64UrlToBytes(token);
    if (raw.length <= 2) return "";
    const s0 = raw[0];
    const s1 = raw[1];
    const keyBytes = toBytes(SECRET_KEY);
    const plain = new Uint8Array(raw.length - 2);

    for (let i = 0; i < plain.length; i++) {
      const k = keyBytes[i % keyBytes.length];
      const saltByte = i % 2 === 0 ? s0 : s1;
      plain[i] = raw[i + 2] ^ k ^ saltByte ^ (i & 0xff);
    }

    const url = fromBytes(plain);
    if (
      url.startsWith("http://") ||
      url.startsWith("https://") ||
      url.startsWith("r2://")
    ) {
      return url;
    }
    return "";
  } catch {
    return "";
  }
}
