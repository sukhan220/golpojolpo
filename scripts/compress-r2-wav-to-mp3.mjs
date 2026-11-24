import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import dotenv from "dotenv";
import { initializeApp } from "firebase/app";
import { collection, doc, getDocs, getFirestore, updateDoc } from "firebase/firestore";
import { PrismaClient } from "@prisma/client";
import {
  createR2PresignedGetUrl,
  getR2Config,
  uploadBufferToR2,
} from "../lib/r2Signer.js";

const execFileAsync = promisify(execFile);
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const INSPECT_ONLY = process.argv.includes("--inspect");
const TARGET_BITRATE = process.env.MP3_BITRATE || "128k";

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

async function listAllR2Objects() {
  const { accountId, bucket, accessKeyId, secretAccessKey, configured } = getR2Config();
  if (!configured) throw new Error("R2 env vars missing");

  const region = "auto";
  const service = "s3";
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const canonicalUri = `/${encodeRfc3986(bucket)}`;

  const objects = [];
  let continuationToken = "";

  while (true) {
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateStamp = amzDate.slice(0, 8);
    const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
    const payloadHash = sha256Hex("");

    const qParams = [["list-type", "2"]];
    if (continuationToken) {
      qParams.push(["continuation-token", continuationToken]);
    }
    const canonicalQueryString = qParams
      .map(([k, v]) => `${encodeRfc3986(k)}=${encodeRfc3986(v)}`)
      .sort()
      .join("&");

    const canonicalHeaders =
      `host:${host}\n` +
      `x-amz-content-sha256:${payloadHash}\n` +
      `x-amz-date:${amzDate}\n`;
    const signedHeaders = "host;x-amz-content-sha256;x-amz-date";

    const canonicalRequest = [
      "GET",
      canonicalUri,
      canonicalQueryString,
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
    const signature = crypto.createHmac("sha256", signingKey).update(stringToSign).digest("hex");
    const authHeader = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const res = await fetch(`https://${host}${canonicalUri}?${canonicalQueryString}`, {
      headers: {
        "x-amz-content-sha256": payloadHash,
        "x-amz-date": amzDate,
        Authorization: authHeader,
      },
    });
    if (!res.ok) {
      throw new Error(`ListObjects failed (${res.status}): ${await res.text()}`);
    }
    const xml = await res.text();
    const contentsMatches = [...xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)];
    for (const m of contentsMatches) {
      const block = m[1];
      const key = block.match(/<Key>([\s\S]*?)<\/Key>/)?.[1] || "";
      const size = Number(block.match(/<Size>(\d+)<\/Size>/)?.[1] || 0);
      if (key) {
        objects.push({
          key: key
            .replace(/&amp;/g, "&")
            .replace(/&lt;/g, "<")
            .replace(/&gt;/g, ">")
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'"),
          size,
        });
      }
    }

    const isTruncated = /<IsTruncated>true<\/IsTruncated>/i.test(xml);
    const nextToken = xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/)?.[1];
    if (isTruncated && nextToken) {
      continuationToken = nextToken;
    } else {
      break;
    }
  }

  return objects;
}

async function deleteR2Object(objectKey) {
  const { accountId, bucket, accessKeyId, secretAccessKey } = getR2Config();
  const region = "auto";
  const service = "s3";
  const host = `${accountId}.r2.cloudflarestorage.com`;
  const canonicalUri = `/${encodeRfc3986(bucket)}/${encodePathKey(objectKey)}`;

  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const credentialScope = `${dateStamp}/${region}/${service}/aws4_request`;
  const payloadHash = sha256Hex("");

  const canonicalHeaders =
    `host:${host}\n` +
    `x-amz-content-sha256:${payloadHash}\n` +
    `x-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";

  const canonicalRequest = [
    "DELETE",
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
  const signature = crypto.createHmac("sha256", signingKey).update(stringToSign).digest("hex");
  const authHeader = `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const res = await fetch(`https://${host}${canonicalUri}`, {
    method: "DELETE",
    headers: {
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
      Authorization: authHeader,
    },
  });
  if (!res.ok && res.status !== 204) {
    throw new Error(`DELETE failed (${res.status}): ${await res.text()}`);
  }
}

async function probeMagicHeader(objectKey) {
  const signedUrl = createR2PresignedGetUrl(objectKey, 600);
  const res = await fetch(signedUrl, {
    headers: { Range: "bytes=0-63" },
  });
  const contentType = res.headers.get("content-type") || "";
  const buf = Buffer.from(await res.arrayBuffer());
  const ascii0_4 = buf.subarray(0, 4).toString("ascii");
  const ascii8_12 = buf.subarray(8, 12).toString("ascii");

  let detectedFormat = "unknown";
  if (ascii0_4 === "RIFF" && ascii8_12 === "WAVE") {
    detectedFormat = "WAV (PCM/RIFF)";
  } else if (ascii0_4 === "fLaC") {
    detectedFormat = "FLAC";
  } else if (ascii0_4 === "OggS") {
    detectedFormat = "OGG";
  } else if (buf.subarray(4, 8).toString("ascii") === "ftyp") {
    detectedFormat = "M4A/MP4";
  } else if (buf.subarray(0, 3).toString("ascii") === "ID3" || (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0)) {
    detectedFormat = "MP3";
  }

  return { contentType, detectedFormat };
}

async function downloadFullObjectToFile(objectKey, destPath) {
  const signedUrl = createR2PresignedGetUrl(objectKey, 3600);
  let lastErr = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(signedUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const arrayBuf = await res.arrayBuffer();
      fs.writeFileSync(destPath, Buffer.from(arrayBuf));
      return;
    } catch (err) {
      lastErr = err;
      if (attempt < 3) await new Promise((r) => setTimeout(r, 2000 * attempt));
    }
  }
  throw lastErr;
}

async function updateDbReferencesIfRenamed(oldKey, newKey, db, prisma) {
  if (oldKey === newKey) return;
  const oldR2 = `r2://${oldKey}`;
  const newR2 = `r2://${newKey}`;

  const snap = await getDocs(collection(db, "books"));
  for (const d of snap.docs) {
    const data = d.data();
    let changed = false;
    const patch = {};
    if (data.url === oldR2) {
      patch.url = newR2;
      changed = true;
    }
    if (Array.isArray(data.tracks)) {
      let trChanged = false;
      const nextTracks = data.tracks.map((t) => {
        if (typeof t === "string" && t === oldR2) {
          trChanged = true;
          return newR2;
        }
        if (t && typeof t === "object" && t.url === oldR2) {
          trChanged = true;
          return { ...t, url: newR2 };
        }
        return t;
      });
      if (trChanged) {
        patch.tracks = nextTracks;
        changed = true;
      }
    }
    if (changed) {
      await updateDoc(doc(db, "books", d.id), patch);
      await prisma.book.updateMany({
        where: { docId: d.id },
        data: {
          ...(patch.url ? { url: patch.url } : {}),
          ...(patch.tracks ? { tracksJson: patch.tracks } : {}),
        },
      });
      console.log(`  ✓ Updated DB references for book ${d.id}: ${oldR2} -> ${newR2}`);
    }
  }
}

async function main() {
  console.log("Scanning Cloudflare R2 bucket objects...");
  const objects = await listAllR2Objects();
  console.log(`Found ${objects.length} objects in R2.\n`);

  let totalBytesBefore = 0;
  const candidates = [];

  for (const obj of objects) {
    totalBytesBefore += obj.size;
    const { contentType, detectedFormat } = await probeMagicHeader(obj.key);
    const sizeMb = (obj.size / (1024 * 1024)).toFixed(2);
    const isNonMp3 =
      detectedFormat.startsWith("WAV") ||
      detectedFormat === "FLAC" ||
      obj.key.toLowerCase().endsWith(".wav");

    console.log(
      `${isNonMp3 ? "★ [CONVERT]" : "  [OK MP3] "} ${obj.key.padEnd(34)} | ${sizeMb.padStart(7)} MB | Magic: ${detectedFormat.padEnd(14)} | Type: ${contentType}`
    );

    if (isNonMp3) {
      candidates.push({ ...obj, detectedFormat, contentType });
    }
  }

  console.log(`\nTotal bucket size: ${(totalBytesBefore / (1024 * 1024)).toFixed(2)} MB`);
  console.log(`WAV / lossless files to convert to MP3 (${TARGET_BITRATE}): ${candidates.length}`);

  if (INSPECT_ONLY || candidates.length === 0) {
    return;
  }

  const firebaseConfig = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const prisma = new PrismaClient();

  let savedBytesTotal = 0;
  let convertedCount = 0;

  try {
    for (let i = 0; i < candidates.length; i++) {
      const item = candidates[i];
      const newKey = item.key.replace(/\.(wav|flac)$/i, ".mp3");
      const tmpIn = path.join(os.tmpdir(), `gj_r2_in_${Date.now()}_${i}`);
      const tmpOut = path.join(os.tmpdir(), `gj_r2_out_${Date.now()}_${i}.mp3`);

      console.log(
        `\n[${i + 1}/${candidates.length}] Converting ${item.key} (${(item.size / (1024 * 1024)).toFixed(2)} MB, ${item.detectedFormat}) -> ${newKey} (${TARGET_BITRATE})...`
      );

      try {
        await downloadFullObjectToFile(item.key, tmpIn);
        await execFileAsync("ffmpeg", [
          "-y",
          "-i",
          tmpIn,
          "-vn",
          "-codec:a",
          "libmp3lame",
          "-b:a",
          TARGET_BITRATE,
          "-ar",
          "44100",
          "-write_xing",
          "1",
          tmpOut,
        ]);

        const mp3Buf = fs.readFileSync(tmpOut);
        if (mp3Buf.byteLength < 8192) {
          throw new Error(`Converted MP3 suspiciously small (${mp3Buf.byteLength} bytes)`);
        }

        let uploadedOk = false;
        let lastUpErr = null;
        for (let upTry = 1; upTry <= 3; upTry++) {
          try {
            await uploadBufferToR2(newKey, mp3Buf, "audio/mpeg");
            uploadedOk = true;
            break;
          } catch (uErr) {
            lastUpErr = uErr;
            if (upTry < 3) await new Promise((r) => setTimeout(r, 2000 * upTry));
          }
        }
        if (!uploadedOk) throw lastUpErr;

        if (newKey !== item.key) {
          await updateDbReferencesIfRenamed(item.key, newKey, db, prisma);
          await deleteR2Object(item.key);
        }

        const beforeMb = (item.size / (1024 * 1024)).toFixed(2);
        const afterMb = (mp3Buf.byteLength / (1024 * 1024)).toFixed(2);
        const pct = (((item.size - mp3Buf.byteLength) / item.size) * 100).toFixed(1);
        savedBytesTotal += Math.max(0, item.size - mp3Buf.byteLength);
        convertedCount++;
        console.log(`  ✓ Done! ${beforeMb} MB -> ${afterMb} MB (Saved ${pct}%)`);
      } catch (err) {
        console.error(`  ✗ Failed on ${item.key}:`, err.message);
      } finally {
        try {
          if (fs.existsSync(tmpIn)) fs.unlinkSync(tmpIn);
          if (fs.existsSync(tmpOut)) fs.unlinkSync(tmpOut);
        } catch {
          // ignore
        }
      }
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log(
    `\n=== COMPLETE: Converted ${convertedCount}/${candidates.length} files | Saved ${(savedBytesTotal / (1024 * 1024)).toFixed(2)} MB! ===`
  );
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
