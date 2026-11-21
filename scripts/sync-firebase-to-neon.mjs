import "dotenv/config";
import dotenv from "dotenv";
import path from "path";
import { initializeApp } from "firebase/app";
import { collection, getDocs, getFirestore } from "firebase/firestore";
import { PrismaClient } from "@prisma/client";

// Load .env.local explicitly (Next.js convention)
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

const prisma = new PrismaClient();

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const SUBCOLLECTION_CANDIDATES = ["tracks", "episodes", "chapters", "parts", "audio", "items"];

function extractUrl(val) {
  if (!val) return "";
  if (typeof val === "string") return val.trim();
  if (Array.isArray(val)) {
    for (const item of val) {
      const found = extractUrl(item);
      if (found) return found;
    }
    return "";
  }
  if (typeof val === "object") {
    return (
      val.url ||
      val.audioUrl ||
      val.fileUrl ||
      val.link ||
      val.src ||
      val.audio ||
      ""
    ).toString().trim();
  }
  return "";
}

async function fetchBookNestedTracks(db, bookId) {
  const nested = [];
  for (const sub of SUBCOLLECTION_CANDIDATES) {
    try {
      const snap = await getDocs(collection(db, "books", bookId, sub));
      if (!snap.empty) {
        snap.docs.forEach((d, idx) => {
          const data = d.data();
          nested.push({
            id: d.id,
            title: data.title || data.name || `পর্ব ${idx + 1}`,
            url: extractUrl(data.url || data.audioUrl || data.link || data),
            time: data.time || data.duration || "",
            voice: data.voice || "",
            order: typeof data.order === "number" ? data.order : idx,
          });
        });
        break;
      }
    } catch {
      // Subcollection doesn't exist
    }
  }
  return nested;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is missing in .env.local");
  }
  if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
    throw new Error("Firebase environment variables are missing in .env.local");
  }

  console.log("Connecting to Firebase Firestore & Neon PostgreSQL...");
  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);

  // 1. Sync Categories
  const catSnap = await getDocs(collection(db, "categories"));
  const validCategoryIds = new Set();
  for (const doc of catSnap.docs) {
    const d = doc.data();
    const docId = doc.id;
    validCategoryIds.add(docId);
    await prisma.category.upsert({
      where: { docId },
      update: {
        bn: d.bn || d.name || docId,
        en: d.en || null,
        audio: d.audio !== undefined ? Boolean(d.audio) : true,
        kindle: d.kindle !== undefined ? Boolean(d.kindle) : true,
      },
      create: {
        docId,
        bn: d.bn || d.name || docId,
        en: d.en || null,
        audio: d.audio !== undefined ? Boolean(d.audio) : true,
        kindle: d.kindle !== undefined ? Boolean(d.kindle) : true,
      },
    });
  }
  console.log(`✓ Synced ${catSnap.size} categories`);

  // 2. Sync Writers
  const writerSnap = await getDocs(collection(db, "writer"));
  const validWriterIds = new Set();
  const writerCatLinks = [];
  for (const doc of writerSnap.docs) {
    const d = doc.data();
    const docId = doc.id;
    validWriterIds.add(docId);
    await prisma.writer.upsert({
      where: { docId },
      update: {
        bn: d.bn || d.name || docId,
        en: d.en || null,
        bio: d.bio || d.description || null,
        avatar: d.img || d.avatar || d.photo || null,
        show: d.show !== undefined ? Boolean(d.show) : true,
      },
      create: {
        docId,
        bn: d.bn || d.name || docId,
        en: d.en || null,
        bio: d.bio || d.description || null,
        avatar: d.img || d.avatar || d.photo || null,
        show: d.show !== undefined ? Boolean(d.show) : true,
      },
    });

    const cateIds = Array.isArray(d.cateId)
      ? d.cateId
      : typeof d.cateId === "string"
      ? [d.cateId]
      : [];
    for (const cid of cateIds) {
      if (validCategoryIds.has(cid)) {
        writerCatLinks.push({ writerId: docId, categoryId: cid });
      }
    }
  }
  for (const link of writerCatLinks) {
    await prisma.writerCategory.upsert({
      where: {
        writerId_categoryId: {
          writerId: link.writerId,
          categoryId: link.categoryId,
        },
      },
      update: {},
      create: link,
    });
  }
  console.log(`✓ Synced ${writerSnap.size} writers (${writerCatLinks.length} writer-category links)`);

  // 3. Sync AudioBooks (`books`)
  const booksSnap = await getDocs(collection(db, "books"));
  for (const doc of booksSnap.docs) {
    const d = doc.data();
    const docId = doc.id;
    const rawCateId = Array.isArray(d.cateId) ? d.cateId[0] : d.cateId;
    const rawWriterId = Array.isArray(d.writerId) ? d.writerId[0] : d.writerId;
    const cateId = rawCateId && validCategoryIds.has(rawCateId) ? rawCateId : null;
    const writerId = rawWriterId && validWriterIds.has(rawWriterId) ? rawWriterId : null;

    const nestedTracks = await fetchBookNestedTracks(db, docId);
    const inlineTracks = Array.isArray(d.tracks) ? d.tracks : null;
    const tracksJson = nestedTracks.length > 0 ? nestedTracks : inlineTracks;

    await prisma.book.upsert({
      where: { docId },
      update: {
        title: d.title || docId,
        artist: d.artist || d.writer || null,
        writer: d.writer || d.artist || null,
        time: d.time ? String(d.time) : null,
        url: extractUrl(d.url || d.audioUrl || d.link || ""),
        voice: d.voice || null,
        artwork: d.artwork || d.img || d.cover || null,
        description: d.description || d.desc || null,
        tracksJson: tracksJson || undefined,
        cateId,
        writerId,
      },
      create: {
        docId,
        title: d.title || docId,
        artist: d.artist || d.writer || null,
        writer: d.writer || d.artist || null,
        time: d.time ? String(d.time) : null,
        url: extractUrl(d.url || d.audioUrl || d.link || ""),
        voice: d.voice || null,
        artwork: d.artwork || d.img || d.cover || null,
        description: d.description || d.desc || null,
        tracksJson: tracksJson || undefined,
        cateId,
        writerId,
      },
    });
  }
  console.log(`✓ Synced ${booksSnap.size} audiobooks`);

  // 4. Sync Short Stories / eBooks (`shortStory`)
  const storySnap = await getDocs(collection(db, "shortStory"));
  for (const doc of storySnap.docs) {
    const d = doc.data();
    const docId = doc.id;
    const rawCateId = Array.isArray(d.cateId) ? d.cateId[0] : d.cateId;
    const rawWriterId = Array.isArray(d.writerId) ? d.writerId[0] : d.writerId;
    const cateId = rawCateId && validCategoryIds.has(rawCateId) ? rawCateId : null;
    const writerId = rawWriterId && validWriterIds.has(rawWriterId) ? rawWriterId : null;

    await prisma.shortStory.upsert({
      where: { docId },
      update: {
        title: d.title || docId,
        writer: d.writer || d.author || "",
        fileUrl: extractUrl(d.fileUrl || d.url || "") || null,
        artwork: d.artwork || d.img || d.cover || null,
        content: typeof d.content === "string" ? d.content : null,
        cateId,
        writerId,
      },
      create: {
        docId,
        title: d.title || docId,
        writer: d.writer || d.author || "",
        fileUrl: extractUrl(d.fileUrl || d.url || "") || null,
        artwork: d.artwork || d.img || d.cover || null,
        content: typeof d.content === "string" ? d.content : null,
        cateId,
        writerId,
      },
    });
  }
  console.log(`✓ Synced ${storySnap.size} short stories / eBooks`);

  console.log("All Firebase collections mirrored to Neon PostgreSQL successfully!");
}

main()
  .then(async () => {
    await prisma.$disconnect();
    process.exit(0);
  })
  .catch(async (err) => {
    console.error("Sync failed:", err);
    await prisma.$disconnect();
    process.exit(1);
  });
