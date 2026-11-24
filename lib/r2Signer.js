import crypto from "crypto";

/**
 * Zero-dependency Cloudflare R2 AWS Signature Version 4 (SigV4) Utility.
 * Uses only Node.js built-in `crypto` to generate:
 *  - Short-lived Presigned GET URLs (0 MB Vercel bandwidth — audio streams directly from R2!)
 *  - Signed PUT uploads (used by the Dropbox -> R2 migration script)
 */

function sha256Hex(data) {
  return crypto.createHash("sha256").update(data).digest("hex");
}

function hmac(key, data) {
  return crypto.createHmac("sha256", key).update(data).digest();
}

function getSignatureKey(secretKey, dateStamp, region, service) {
  const kDate = hmac(`AWS4${secretKey}`, dateStamp);
  const kRegion = hmac(kDate, region);
  const kService = hmac(kRegion, service);
  return hmac(kService, "aws4_request");
}

function encodeRfc3986(str) {
  return encodeURIComponent(str).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`
  );
}

function encodePathKey(key) {
  return String(key || "")
    .replace(/^\/+/, "")
    .split("/")
    .map((seg) => encodeRfc3986(seg))
    .join("/");
}

export function getR2Config() {
  const accountId = (process.env.R2_ACCOUNT_ID || "").trim();
  const bucket = (process.env.R2_BUCKET_NAME || "").trim();
  const accessKeyId = (process.env.R2_ACCESS_KEY_ID || "").trim();
  const secretAccessKey = (process.env.R2_SECRET_ACCESS_KEY || "").trim();
  const configured = Boolean(accountId && bucket && accessKeyId && secretAccessKey);
  return { accountId, bucket, accessKeyId, secretAccessKey, configured };
}

/**
 * Extracts an R2 object key from `r2://path/file.mp3` or `https://<id>.r2.cloudflarestorage.com/<bucket>/path/file.mp3`.
 * Returns null if the URL is not an R2 resource.
 */
export function extractR2ObjectKey(rawUrl) {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  const trimmed = rawUrl.trim();
  if (trimmed.startsWith("r2://")) {
    const key = trimmed.slice("r2://".length).replace(/^\/+/, "");
    return key || null;
  }

  const { bucket } = getR2Config();
  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname.endsWith(".r2.cloudflarestorage.com")) {
      const cleanPath = parsed.pathname.replace(/^\/+/, "");
      if (bucket && cleanPath.startsWith(`${bucket}/`)) {
        return decodeURIComponent(cleanPath.slice(bucket.length + 1)) || null;
      }
      return decodeURIComponent(cleanPath) || null;
    }
  } catch {
    // not a full URL
  }
  return null;
}

/**
 * Generates a short-lived SigV4 Presigned GET URL for a private Cloudflare R2 object.
 * Default expiry: 1800s (30 minutes — matches our playback grant window!).
 */
export function createR2PresignedGetUrl(objectKey, expiresSec = 1800) {
  const { accountId, bucket, accessKeyId, secretAccessKey, configured } = getR2Config();
  if (!configured || !objectKey) return null;

  const region = "auto";
  const service = "s3";
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const encodedKey = encodePathKey(objectKey);
  const canonicalUri = `/${encodeRfc3986(bucket)}/${encodedKey}`;

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const clampedExpires = Math.max(60, Math.min(86400, Math.floor(expiresSec)));

  const queryParams = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", `${accessKeyId}/${credentialScope}`],
    ["X-Amz-Date", amzDate],
    ["X-Amz-Expires", String(clampedExpires)],
    ["X-Amz-SignedHeaders", "host"],
  ];

  const canonicalQueryString = queryParams
    .map(([k, v]) => `${encodeRfc3986(k)}=${encodeRfc3986(v)}`)
    .sort()
    .join("&");

  const canonicalHeaders = `host:${host}\n`;
  const canonicalRequest = [
    "GET",
    canonicalUri,
    canonicalQueryString,
    canonicalHeaders,
    "host",
    "UNSIGNED-PAYLOAD",
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = getSignatureKey(secretAccessKey, dateStamp, region, service);
  const signature = crypto
    .createHmac("sha256", signingKey)
    .update(stringToSign)
    .digest("hex");

  return `https://${host}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`;
}

/**
 * Uploads a binary Buffer/Uint8Array directly to Cloudflare R2 using SigV4 PUT.
 */
export async function uploadBufferToR2(objectKey, bodyBuffer, contentType = "audio/mpeg") {
  const { accountId, bucket, accessKeyId, secretAccessKey, configured } = getR2Config();
  if (!configured) {
    throw new Error("R2 environment variables are missing in .env.local");
  }

  const region = "auto";
  const service = "s3";
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const encodedKey = encodePathKey(objectKey);
  const canonicalUri = `/${encodeRfc3986(bucket)}/${encodedKey}`;

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const payloadHash = sha256Hex(bodyBuffer);

  const canonicalHeaders =
    `content-type:${contentType}\n` +
    `host:${host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = "content-type;host;x-amz-content-sha256;x-amz-date";

  const canonicalRequest = [
    "PUT",
    canonicalUri,
    "",
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");

  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");

  const signingKey = getSignatureKey(secretAccessKey, dateStamp, region, service);
  const signature = crypto
    .createHmac("sha256", signingKey)
    .update(stringToSign)
    .digest("hex");

  const authHeader = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(`https://${host}${canonicalUri}`, {
    method: "PUT",
    headers: {
      "Content-Type": contentType,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      Authorization: authHeader,
    },
    body: bodyBuffer,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`R2 PUT failed (${res.status}): ${errText}`);
  }

  return `r2://${objectKey.replace(/^\/+/, "")}`;
}
