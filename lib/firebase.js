import { getApp, getApps, initializeApp } from "firebase/app";
import {
  collection,
  getDocs,
  getFirestore,
  onSnapshot,
} from "firebase/firestore";
import { encryptAudioUrl } from "./audioCrypto";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

let db = null;

export function getDb() {
  if (db) return db;
  if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
    console.warn("Firebase configuration is missing or incomplete in environment.");
    return null;
  }
  const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
  db = getFirestore(app);
  return db;
}

/**
 * Extracts a raw URL string from a string, array, or object with any URL field name
 */
export function extractRawUrl(input) {
  if (!input) return "";
  if (typeof input === "string") {
    return input.replace(/^['"“”‘’\s]+|['"“”‘’\s]+$/g, "").trim();
  }
  if (Array.isArray(input)) {
    for (const item of input) {
      const found = extractRawUrl(item);
      if (found) return found;
    }
    return "";
  }
  if (typeof input === "object") {
    const direct =
      input.url ||
      input.audioUrl ||
      input.audio ||
      input.fileUrl ||
      input.link ||
      input.src ||
      input.trackUrl ||
      input.partUrl ||
      input.streamUrl ||
      input.file;
    if (typeof direct === "string" && direct.trim()) {
      return direct.replace(/^['"“”‘’\s]+|['"“”‘’\s]+$/g, "").trim();
    }
    // Search any string property that looks like an http URL
    for (const val of Object.values(input)) {
      if (typeof val === "string") {
        const cleaned = val.replace(/^['"“”‘’\s]+|['"“”‘’\s]+$/g, "").trim();
        if (cleaned.startsWith("http://") || cleaned.startsWith("https://")) {
          return cleaned;
        }
      }
    }
  }
  return "";
}

/**
 * Converts Dropbox, Google Drive, or standard URLs to encrypted streaming URLs (/api/stream?t=...)
 */
export function formatAudioUrl(urlInput) {
  let cleanUrl = extractRawUrl(urlInput);
  if (!cleanUrl) return "";

  // If already encrypted into /api/stream?t=..., return directly
  if (cleanUrl.startsWith("/api/stream?t=")) {
    return cleanUrl;
  }

  if (cleanUrl.includes("dropbox.com")) {
    cleanUrl = cleanUrl.replace("www.dropbox.com", "dl.dropboxusercontent.com");
    if (cleanUrl.includes("dl=0")) {
      cleanUrl = cleanUrl.replace("dl=0", "raw=1");
    } else if (!cleanUrl.includes("raw=1") && !cleanUrl.includes("dl=1")) {
      cleanUrl += cleanUrl.includes("?") ? "&raw=1" : "?raw=1";
    }
  }

  if (cleanUrl.includes("drive.google.com/file/d/")) {
    const match = cleanUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      cleanUrl = `https://drive.google.com/uc?export=download&id=${match[1]}`;
    }
  }

  return encryptAudioUrl(cleanUrl);
}

/**
 * Helper to calculate first Bengali letter / symbol for display
 */
export function extractInitial(text) {
  if (!text) return "গ";
  const trimmed = text.toString().trim().replace(/^['"“”‘’]+/, "");
  return trimmed.slice(0, 2);
}

/**
 * Helper to parse "MM:SS" or "HH:MM:SS" into total seconds
 */
export function parseDurationToSeconds(timeStr) {
  if (!timeStr) return 0;
  if (typeof timeStr === "number") return timeStr;
  const parts = timeStr.toString().trim().split(":").map(Number);
  if (parts.length === 2) {
    return (parts[0] || 0) * 60 + (parts[1] || 0);
  }
  if (parts.length === 3) {
    return (parts[0] || 0) * 3600 + (parts[1] || 0) * 60 + (parts[2] || 0);
  }
  return 0;
}

/**
 * Helper to extract multi-part tracks from any Firestore book document structure:
 * - Array of strings: tracks/parts/episodes/url: ["https://...", "https://..."]
 * - Array of objects: tracks/parts/episodes: [{ title, url/audio/link, time }, ...]
 * - Object map: tracks/parts: { "1": "https://...", "2": "https://..." }
 * - Numbered fields on document: url1, url2 / part1, part2 / track1, track2
 */
function extractNestedTracksFromDoc(docId, data = {}) {
  const bookTitle = (data.title || "অডিও").replace(/^['"]+|['"]+$/g, "").trim();
  const bookArtist = (data.artist || data.writer || "").replace(/^['"]+|['"]+$/g, "").trim();
  const bookWriter = (data.writer || data.artist || "").replace(/^['"]+|['"]+$/g, "").trim();
  const bookVoice = (data.voice || "অজানা কণ্ঠ").replace(/^['"]+|['"]+$/g, "").trim();
  const bookTime = data.time || "০০:০০";
  const bookDurationSec = data.durationSec || parseDurationToSeconds(bookTime) || 1800;
  const bookArtwork = data.artwork || "";
  const fallbackParentUrl = typeof data.url === "string" ? formatAudioUrl(data.url) : "";

  let rawTracks =
    data.tracks ||
    data.episodes ||
    data.chapters ||
    data.parts ||
    data.urls ||
    data.audioList ||
    null;

  // If data.url itself is an array of URLs/objects
  if (!rawTracks && Array.isArray(data.url) && data.url.length > 0) {
    rawTracks = data.url;
  }

  // If rawTracks is a Firestore Map/Object (e.g. { "1": "...", "2": "..." })
  if (rawTracks && typeof rawTracks === "object" && !Array.isArray(rawTracks)) {
    const entries = Object.entries(rawTracks).sort(([a], [b]) =>
      a.localeCompare(b, undefined, { numeric: true })
    );
    rawTracks = entries.map(([key, val]) => {
      if (typeof val === "string") {
        return { url: val, title: `${bookTitle} - ${key}` };
      }
      return { ...val, id: val?.id || `${docId}-${key}` };
    });
  }

  // Check for numbered fields on the document itself (e.g. url1, url2 or part1, part2)
  if (!Array.isArray(rawTracks) || rawTracks.length === 0) {
    const numberedKeys = Object.keys(data)
      .filter((k) => /^(url|part|track|episode|audio)[_-]?\d+$/i.test(k))
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    if (numberedKeys.length > 1) {
      rawTracks = numberedKeys.map((k) => data[k]).filter(Boolean);
    }
  }

  if (!Array.isArray(rawTracks) || rawTracks.length === 0) {
    return [];
  }

  return rawTracks
    .map((tr, idx) => {
      // Case 1: element is a direct URL string
      if (typeof tr === "string") {
        const cleanTrackUrl = formatAudioUrl(tr) || fallbackParentUrl;
        return {
          id: `${docId}-track-${idx + 1}`,
          bookId: docId,
          title: `${bookTitle} - পর্ব ${idx + 1}`,
          artist: bookArtist,
          writer: bookWriter,
          voice: bookVoice,
          time: bookTime,
          durationSec: bookDurationSec,
          url: cleanTrackUrl,
          artwork: bookArtwork,
          letter: extractInitial(bookTitle),
          index: idx + 1,
        };
      }

      // Case 2: element is an object
      if (typeof tr === "object" && tr !== null) {
        const trackUrl = formatAudioUrl(tr) || fallbackParentUrl;
        const rawTitle =
          tr.title ||
          tr.name ||
          tr.bn ||
          tr.label ||
          tr.partName ||
          `${bookTitle} - পর্ব ${idx + 1}`;
        const trackTime = tr.time || tr.duration || bookTime;
        const trackDurationSec =
          parseDurationToSeconds(trackTime) || bookDurationSec;

        return {
          id: tr.id || `${docId}-track-${idx + 1}`,
          bookId: docId,
          title: rawTitle.toString().replace(/^['"]+|['"]+$/g, "").trim(),
          artist: (tr.artist || bookArtist).replace(/^['"]+|['"]+$/g, "").trim(),
          writer: (tr.writer || bookWriter).replace(/^['"]+|['"]+$/g, "").trim(),
          voice: (tr.voice || bookVoice).replace(/^['"]+|['"]+$/g, "").trim(),
          time: trackTime,
          durationSec: trackDurationSec,
          url: trackUrl,
          artwork: tr.artwork || bookArtwork,
          letter: extractInitial(rawTitle || bookTitle),
          index: idx + 1,
        };
      }

      return null;
    })
    .filter((item) => item !== null);
}

// -------------------------------------------------------------
// Normalizers (Used by both Firestore & Reverse API)
// -------------------------------------------------------------

export function normalizeCategory(id, data = {}) {
  return {
    id: id || data.id || `c-${Date.now()}`,
    bn: data.bn || data.title || data.name || id,
    en: data.en || "",
    audio: data.audio !== false,
    kindle: data.kindle !== false,
  };
}

export function normalizeAudioBook(id, data = {}) {
  const docId = id || data.id || `track-${Date.now()}`;
  const durationSec = data.durationSec || parseDurationToSeconds(data.time);
  const nestedTracks = extractNestedTracksFromDoc(docId, data);

  // Main stream URL: either from data.url or first nested track's URL
  const primaryUrl =
    formatAudioUrl(data.url) ||
    (nestedTracks.length > 0 ? nestedTracks[0].url : "");

  return {
    id: docId,
    title: (data.title || "নামহীন অডিও").replace(/^['"]+|['"]+$/g, "").trim(),
    artist: (data.artist || data.writer || "").replace(/^['"]+|['"]+$/g, "").trim(),
    writer: (data.writer || data.artist || "").replace(/^['"]+|['"]+$/g, "").trim(),
    writerId: data.writerId || "",
    cateId: data.cateId || "",
    voice: (data.voice || "অজানা কণ্ঠ").replace(/^['"]+|['"]+$/g, "").trim(),
    time: data.time || (nestedTracks[0]?.time) || "০০:০০",
    durationSec: durationSec || nestedTracks[0]?.durationSec || 1800,
    url: primaryUrl,
    artwork: data.artwork || "",
    letter: extractInitial(data.title),
    description: data.description || `${data.title || "অডিওবুক"} - গল্পজল্প অডিওবুক।`,
    clips: data.clips || undefined,
    tracks: nestedTracks,
  };
}

export function formatBookFileUrl(urlInput) {
  let cleanUrl = extractRawUrl(urlInput);
  if (!cleanUrl) return "";

  if (cleanUrl.includes("dropbox.com")) {
    cleanUrl = cleanUrl.replace("www.dropbox.com", "dl.dropboxusercontent.com");
    if (cleanUrl.includes("dl=0")) {
      cleanUrl = cleanUrl.replace("dl=0", "raw=1");
    } else if (!cleanUrl.includes("raw=1") && !cleanUrl.includes("dl=1")) {
      cleanUrl += cleanUrl.includes("?") ? "&raw=1" : "?raw=1";
    }
  }

  if (cleanUrl.includes("drive.google.com/file/d/")) {
    const match = cleanUrl.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (match && match[1]) {
      cleanUrl = `https://drive.google.com/uc?export=download&id=${match[1]}`;
    }
  }

  return cleanUrl;
}

export function normalizeShortStory(id, data = {}) {
  const docId = id || data.id || `s-${Date.now()}`;
  const rawFileUrl = data.fileUrl || data.url || data.link || data.file || "";
  return {
    id: docId,
    title: (data.title || "নামহীন গল্প").replace(/^['"]+|['"]+$/g, "").trim(),
    writer: (data.writer || "").replace(/^['"]+|['"]+$/g, "").trim(),
    writerId: data.writerId || "",
    cateId: data.cateId || "",
    fileUrl: formatBookFileUrl(rawFileUrl),
    artwork: (data.artwork || "").toString().replace(/^['"]+|['"]+$/g, "").trim(),
    letter: extractInitial(data.title),
    content: data.content || data.text || "",
    sampleText: data.sampleText || "",
  };
}

export function normalizeWriter(id, data = {}) {
  const docId = id || data.id || `w-${Date.now()}`;
  const bnName = (data.bn || data.name || docId).replace(/^['"]+|['"]+$/g, "").trim();
  const imgUrl = (data.img || data.image || data.avatar || data.artwork || "")
    .toString()
    .replace(/^['"“”‘’\s]+|['"“”‘’\s]+$/g, "")
    .trim();
  return {
    id: docId,
    bn: bnName,
    en: (data.en || "").replace(/^['"]+|['"]+$/g, "").trim(),
    name: bnName,
    img: imgUrl,
    show: data.show !== false,
    cateId: Array.isArray(data.cateId) ? data.cateId : [],
    categories: Array.isArray(data.categories) ? data.categories : [],
    letter: extractInitial(bnName),
  };
}

// -------------------------------------------------------------
// One-Time Fetchers (getDocs) — Prevents constant Firebase hits!
// -------------------------------------------------------------

export async function fetchCategoriesOnce() {
  const firestore = getDb();
  if (!firestore) throw new Error("Firebase not initialized");
  const snapshot = await getDocs(collection(firestore, "categories"));
  return snapshot.docs.map((d) => normalizeCategory(d.id, d.data()));
}

export async function fetchAudioBooksOnce() {
  const firestore = getDb();
  if (!firestore) throw new Error("Firebase not initialized");
  const snapshot = await getDocs(collection(firestore, "books"));
  return snapshot.docs.map((d) => normalizeAudioBook(d.id, d.data()));
}

export async function fetchShortStoriesOnce() {
  const firestore = getDb();
  if (!firestore) throw new Error("Firebase not initialized");
  const snapshot = await getDocs(collection(firestore, "shortStory"));
  return snapshot.docs.map((d) => normalizeShortStory(d.id, d.data()));
}

export async function fetchWritersOnce() {
  const firestore = getDb();
  if (!firestore) throw new Error("Firebase not initialized");
  const snapshot = await getDocs(collection(firestore, "writer"));
  return snapshot.docs.map((d) => normalizeWriter(d.id, d.data()));
}

export async function fetchBookNestedSubcollectionsOnce(bookId, parentBook) {
  if (!bookId) return parentBook?.tracks || [];
  const firestore = getDb();
  if (!firestore) return parentBook?.tracks || [];

  const subcollectionNames = ["tracks", "episodes", "chapters", "parts", "items", "audio"];
  for (const subName of subcollectionNames) {
    try {
      const subRef = collection(firestore, "books", bookId, subName);
      const snapshot = await getDocs(subRef);
      if (!snapshot.empty) {
        const subTracks = snapshot.docs.map((docSnap, idx) => {
          const d = docSnap.data();
          const trackUrl = formatAudioUrl(d) || formatAudioUrl(parentBook?.url);
          const rawTitle =
            d.title ||
            d.name ||
            d.bn ||
            d.label ||
            `${parentBook?.title || "পর্ব"} - পর্ব ${idx + 1}`;
          const trackTime = d.time || d.duration || parentBook?.time || "০০:০০";
          return {
            id: docSnap.id,
            bookId: bookId,
            title: rawTitle.toString().replace(/^['"]+|['"]+$/g, "").trim(),
            artist: d.artist || parentBook?.artist || parentBook?.writer || "",
            writer: d.writer || parentBook?.writer || "",
            voice: d.voice || parentBook?.voice || "",
            time: trackTime,
            durationSec:
              parseDurationToSeconds(trackTime) || parentBook?.durationSec || 1800,
            url: trackUrl,
            artwork: d.artwork || parentBook?.artwork || "",
            letter: extractInitial(rawTitle || parentBook?.title),
            order: d.order ?? d.index ?? idx,
            index: idx + 1,
          };
        });
        subTracks.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
        return subTracks;
      }
    } catch {
      // Subcollection doesn't exist or offline; continue
    }
  }
  return parentBook?.tracks || [];
}

// -------------------------------------------------------------
// Legacy Realtime Listeners (kept for compatibility)
// -------------------------------------------------------------

export function subscribeToAudioBooks(onData, onError) {
  const firestore = getDb();
  if (!firestore) {
    if (onError) onError(new Error("Firebase not initialized"));
    return () => {};
  }
  return onSnapshot(
    collection(firestore, "books"),
    (snapshot) => {
      onData(snapshot.docs.map((d) => normalizeAudioBook(d.id, d.data())));
    },
    onError
  );
}

export function subscribeToBookNestedSubcollections(bookId, parentBook, onTracks) {
  fetchBookNestedSubcollectionsOnce(bookId, parentBook)
    .then(onTracks)
    .catch(() => onTracks(parentBook?.tracks || []));
  return () => {};
}

export function subscribeToCategories(onData, onError) {
  const firestore = getDb();
  if (!firestore) {
    if (onError) onError(new Error("Firebase not initialized"));
    return () => {};
  }
  return onSnapshot(
    collection(firestore, "categories"),
    (snapshot) => {
      onData(snapshot.docs.map((d) => normalizeCategory(d.id, d.data())));
    },
    onError
  );
}

export function subscribeToShortStories(onData, onError) {
  const firestore = getDb();
  if (!firestore) {
    if (onError) onError(new Error("Firebase not initialized"));
    return () => {};
  }
  return onSnapshot(
    collection(firestore, "shortStory"),
    (snapshot) => {
      onData(snapshot.docs.map((d) => normalizeShortStory(d.id, d.data())));
    },
    onError
  );
}

export function subscribeToWriters(onData, onError) {
  const firestore = getDb();
  if (!firestore) {
    if (onError) onError(new Error("Firebase not initialized"));
    return () => {};
  }
  return onSnapshot(
    collection(firestore, "writer"),
    (snapshot) => {
      onData(snapshot.docs.map((d) => normalizeWriter(d.id, d.data())));
    },
    onError
  );
}

export function subscribeToReaderBooks(onBooks, onError) {
  fetchShortStoriesOnce()
    .then((stories) => {
      onBooks(
        stories.map((data) => ({
          ...data,
          id: `shortStory:${data.id}`,
          documentId: data.id,
          sourceCollection: "shortStory",
          title: data.title || "নামহীন বই",
          author: data.writer || "",
          artwork: data.artwork || "",
          fileUrl: data.fileUrl || "",
          source: "firestore",
        }))
      );
    })
    .catch(onError);
  return () => {};
}
