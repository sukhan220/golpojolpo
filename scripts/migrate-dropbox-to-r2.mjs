import dotenv from "dotenv";
import path from "path";
import { initializeApp } from "firebase/app";
import { collection, doc, getDocs, getFirestore, updateDoc } from "firebase/firestore";
import { PrismaClient } from "@prisma/client";
import { uploadBufferToR2, extractR2ObjectKey } from "../lib/r2Signer.js";

dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const DRY_RUN = process.argv.includes("--dry-run");
const prisma = new PrismaClient();

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const SUBCOLLECTION_CANDIDATES = ["tracks", "episodes", "chapters", "parts"];

function normalizeDownloadUrl(raw) {
  if (!raw || typeof raw !== "string") return "";
  let url = raw.replace(/^['"“”‘’\s]+|['"“”‘’\s]+$/g, "").trim();
  if (url.includes("dropbox.com")) {
    url = url.replace("www.dropbox.com", "dl.dropboxusercontent.com");
    if (url.includes("dl=0")) url = url.replace("dl=0", "raw=1");
    else if (!url.includes("raw=1") && !url.includes("dl=1")) {
      url += url.includes("?") ? "&raw=1" : "?raw=1";
    }
  }
  if (url.includes("drive.google.com/file/d/")) {
    const m = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (m?.[1]) url = `https://drive.google.com/uc?export=download&id=${m[1]}`;
  }
  return url;
}

function sanitizeKeySegment(str) {
  return String(str || "audio")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "audio";
}

async function fetchWithRetry(url, attempts = 3) {
  let lastErr = null;
  for (let i = 1; i <= attempts; i++) {
    try {
      const res = await fetch(url, {
        method: "GET",
        redirect: "follow",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0",
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const contentType = res.headers.get("content-type") || "audio/mpeg";
      if (contentType.includes("text/html") || contentType.includes("application/json")) {
        throw new Error(`Invalid non-audio content-type (${contentType})`);
      }
      const arrayBuf = await res.arrayBuffer();
      const buf = Buffer.from(arrayBuf);
      if (buf.byteLength < 1024) throw new Error(`File too small (${buf.byteLength} bytes)`);
      return { buf, contentType };
    } catch (err) {
      lastErr = err;
      if (i < attempts) {
        console.log(`  ↻ Retry ${i}/${attempts - 1} after error (${err.message})...`);
        await new Promise((r) => setTimeout(r, 2000 * i));
      }
    }
  }
  throw lastErr;
}

async function migrateSingleUrl(rawUrl, objectKey) {
  if (!rawUrl || extractR2ObjectKey(rawUrl)) {
    return { skipped: true, r2Url: rawUrl };
  }
  const dlUrl = normalizeDownloadUrl(rawUrl);
  if (!dlUrl.startsWith("http://") && !dlUrl.startsWith("https://")) {
    return { skipped: true, r2Url: rawUrl };
  }

  if (DRY_RUN) {
    console.log(`  [DRY-RUN] Would migrate -> r2://${objectKey}`);
    return { skipped: false, r2Url: `r2://${objectKey}` };
  }

  const { buf, contentType } = await fetchWithRetry(dlUrl, 3);
  const r2Url = await uploadBufferToR2(objectKey, buf, contentType);
  console.log(`  ✓ Uploaded ${(buf.byteLength / (1024 * 1024)).toFixed(2)} MB -> ${r2Url}`);
  return { skipped: false, r2Url };
}

async function main() {
  console.log(DRY_RUN ? "=== DRY RUN: Dropbox -> Cloudflare R2 ===" : "=== MIGRATING Dropbox -> Cloudflare R2 ===");
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  const booksSnap = await getDocs(collection(db, "books"));
  let migratedBooks = 0;
  let migratedParts = 0;
  let failed = 0;

  for (const bookDoc of booksSnap.docs) {
    const data = bookDoc.data();
    const bookId = bookDoc.id;
    console.log(`\nBook: ${data.title || bookId} (${bookId})`);

    // 1. Migrate main book `url` if present
    if (typeof data.url === "string" && data.url.trim() && !extractR2ObjectKey(data.url)) {
      try {
        const key = `audio/${sanitizeKeySegment(bookId)}.mp3`;
        const res = await migrateSingleUrl(data.url, key);
        if (!res.skipped && !DRY_RUN) {
          await updateDoc(doc(db, "books", bookId), { url: res.r2Url });
          await prisma.book.updateMany({
            where: { docId: bookId },
            data: { url: res.r2Url },
          });
          migratedBooks++;
        }
      } catch (err) {
        failed++;
        console.error(`  ✗ Failed book ${bookId}:`, err.message);
      }
    }

    // 2. Migrate inline `data.tracks` array if present (e.g. multi-part books like কনে দেখা)
    if (Array.isArray(data.tracks) && data.tracks.length > 0) {
      let tracksChanged = false;
      const updatedTracks = [];
      for (let i = 0; i < data.tracks.length; i++) {
        const item = data.tracks[i];
        const rawItemUrl =
          typeof item === "string"
            ? item
            : item?.url || item?.audioUrl || item?.link || "";
        if (!rawItemUrl || extractR2ObjectKey(rawItemUrl)) {
          updatedTracks.push(item);
          continue;
        }
        try {
          const partKey = `audio/${sanitizeKeySegment(bookId)}/part-${i + 1}.mp3`;
          const res = await migrateSingleUrl(rawItemUrl, partKey);
          if (!res.skipped && !DRY_RUN) {
            tracksChanged = true;
            migratedParts++;
            updatedTracks.push(
              typeof item === "string" ? res.r2Url : { ...item, url: res.r2Url }
            );
          } else {
            updatedTracks.push(item);
          }
        } catch (err) {
          failed++;
          console.error(`  ✗ Failed inline part ${bookId}[${i}]:`, err.message);
          updatedTracks.push(item);
        }
      }
      if (tracksChanged && !DRY_RUN) {
        await updateDoc(doc(db, "books", bookId), { tracks: updatedTracks });
        await prisma.book.updateMany({
          where: { docId: bookId },
          data: { tracksJson: updatedTracks },
        });
      }
    }

    // 3. Migrate nested subcollection tracks if present
    for (const sub of SUBCOLLECTION_CANDIDATES) {
      const subSnap = await getDocs(collection(db, "books", bookId, sub));
      if (subSnap.empty) continue;
      for (const partDoc of subSnap.docs) {
        const pData = partDoc.data();
        const rawPartUrl = typeof pData.url === "string" ? pData.url : pData.audioUrl || "";
        if (!rawPartUrl || extractR2ObjectKey(rawPartUrl)) continue;
        try {
          const partKey = `audio/${sanitizeKeySegment(bookId)}/${sanitizeKeySegment(partDoc.id)}.mp3`;
          const res = await migrateSingleUrl(rawPartUrl, partKey);
          if (!res.skipped && !DRY_RUN) {
            await updateDoc(doc(db, "books", bookId, sub, partDoc.id), { url: res.r2Url });
            migratedParts++;
          }
        } catch (err) {
          failed++;
          console.error(`  ✗ Failed part ${bookId}/${sub}/${partDoc.id}:`, err.message);
        }
      }
      break;
    }
  }

  console.log(`\nDone! Migrated ${migratedBooks} main audiobooks, ${migratedParts} nested parts, ${failed} failed.`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("Migration error:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
