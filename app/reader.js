"use client";

import { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import PageTurn from "../components/PageTurn";
import BookLoader from "../components/BookLoader";
import SpeedModal from "../components/SpeedModal";
import FontSelector, { FONTS_LIST } from "../components/FontSelector";
import JumpPageModal from "../components/JumpPageModal";
import AddNoteModal from "../components/AddNoteModal";
import BooklistModal from "../components/BooklistModal";
import ChapterSidebar from "../components/ChapterSidebar";
import LandscapeOverlay from "../components/LandscapeOverlay";
import { SPEED_MAP } from "../lib/speedMap";
import { subscribeToReaderBooks } from "../lib/firebase";
import {
  ArrowBackIcon,
  MenuIcon,
  ChevronBackIcon,
  ChevronForwardIcon,
  DocumentTextIcon,
  BookmarksOutlineIcon,
  BookmarkFilledIcon,
  BookmarkOutlineIcon,
  AddCircleOutlineIcon,
} from "../components/Icons";

const STORAGE_KEY = "golpojolpo.reader.web.v1";
const THEME_STORAGE_KEY = "user_theme_index";
const FILE_CACHE_PREFIX = "golpojolpo_book_file_cache_v2_";

function readCachedBookFile(bookId, fileUrl) {
  if (typeof window === "undefined" || !bookId) return null;
  try {
    const raw = window.localStorage.getItem(`${FILE_CACHE_PREFIX}${bookId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (fileUrl && parsed.fileUrl && parsed.fileUrl !== fileUrl) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeCachedBookFile(bookId, fileUrl, text, isComplete = true) {
  if (typeof window === "undefined" || !bookId || !text) return;
  try {
    window.localStorage.setItem(
      `${FILE_CACHE_PREFIX}${bookId}`,
      JSON.stringify({
        bookId,
        fileUrl: fileUrl || "",
        text,
        isComplete: Boolean(isComplete),
        byteLength: text.length,
        updatedAt: Date.now(),
      }),
    );
  } catch {
    // Ignore storage quota error
  }
}

const DEMO_BOOK = {
  id: "demo-river",
  title: "নদীর ওপারে",
  author: "গল্পজল্প পাঠক",
  text: `---chapter: প্রথম অধ্যায়: ভোরের আলো---
শহরের শেষ প্রান্তে যে নদীটি বয়ে গেছে, তার নাম কেউ ঠিক করে বলতে পারে না। কেউ বলে মেঘনা, কেউ বলে কীর্তিনাশা। কিন্তু গ্রামের মানুষের কাছে সে শুধু নদী—চেনা, আপন, আর প্রতিদিন নতুন।

ভোর হলে নদীর জল কুয়াশার চাদর সরিয়ে ধীরে ধীরে জেগে ওঠে। দূরের নৌকাগুলোকে তখন মনে হয় ভেসে থাকা কয়েকটি ছায়া।
---page---
---chapter: দ্বিতীয় অধ্যায়: ছোট্ট নৌকা---
রাফি প্রতিদিন স্কুলে যাওয়ার আগে ঘাটে দাঁড়াত। ওপারের দিকে তাকিয়ে সে ভাবত, নদীর ওপারেও কি একই রকম সকাল হয়? একই রকম পাখির ডাক, একই রকম মানুষের ব্যস্ততা?

একদিন তার দাদু বললেন, “নদী শুধু দুই পাড়কে আলাদা করে না, রাফি। সে এক পাড়ের গল্প আরেক পাড়ে পৌঁছে দেয়।” কথাটা শুনে রাফির মনে হলো, নদী বুঝি এক বিশাল বই—প্রতিটি ঢেউ তার নতুন পৃষ্ঠা।
---page---
সেদিন বিকেলে রাফি ছোট্ট নৌকায় চড়ে ওপারে গেল। সঙ্গে ছিল একটি খাতা, কয়েকটি রঙিন পেন্সিল আর অনেক প্রশ্ন। ওপারের মানুষের গল্প শুনে সে খাতায় লিখল—ভিন্ন পাড়, ভিন্ন ঘর; তবু স্বপ্নগুলো একই রকম।

ফিরে আসার সময় নদীর জলে সূর্য ডুবে যাচ্ছিল। রাফি জানত, পরদিন আবার সে নতুন একটি গল্প খুঁজতে বের হবে।`,
};

const THEMES = [
  {
    name: "book",
    label: "বই",
    background: "#e0d8c3",
    page: "#fdfaf1",
    text: "#2c1e0f",
    highlight: "#ffe58a",
  },
  {
    name: "paper",
    label: "কাগজ",
    background: "#d6d1c7",
    page: "#f4f1ea",
    text: "#2c2c2c",
    highlight: "#ffe58a",
  },
  {
    name: "sepia",
    label: "সেপিয়া",
    background: "#c5b08b",
    page: "#e9dcc9",
    text: "#433422",
    highlight: "#e6bd69",
  },
  {
    name: "night",
    label: "রাত",
    background: "#121212",
    page: "#1f1f1f",
    text: "#b0b0b0",
    highlight: "#665000",
  },
];

const HTML_READER_TAGS = new Set([
  "a", "article", "b", "blockquote", "br", "caption", "center", "dd", "del", "div", "dl", "dt",
  "em", "figcaption", "figure", "h1", "h2", "h3", "h4", "h5", "h6", "hr", "i", "img", "li",
  "ol", "p", "pre", "s", "small", "span", "strong", "sub", "sup", "table", "tbody", "td", "tfoot",
  "th", "thead", "tr", "u", "ul",
]);
const HTML_READER_DROP_TAGS = new Set(["embed", "iframe", "object", "script", "style", "svg", "template"]);
const HTML_READER_VOID_TAGS = new Set(["br", "hr", "img"]);
const HTML_READER_STYLE_PROPERTIES = new Set([
  "align-items", "background", "background-color", "border", "border-radius", "color", "display", "flex-direction",
  "font-size", "font-style", "font-weight", "height", "line-height", "margin", "margin-bottom", "margin-left",
  "margin-right", "margin-top", "max-height", "max-width", "object-fit", "padding", "padding-bottom", "padding-left",
  "padding-right", "padding-top", "text-align", "vertical-align", "width",
]);

function splitBook(text, title) {
  // 1. First split by explicit ---page--- markers
  const rawBlocks = text.split(/\s*---page---\s*/i);
  const MAX_CHARS_PER_PAGE = 1450;

  // 2. If any ---page--- block is very long (or if there were only a few ---page--- markers for a long story),
  // subdivide long blocks along paragraph boundaries so every paragraph gets its own readable page and nothing is cut off!
  const expandedPages = [];
  for (const block of rawBlocks) {
    const trimmedBlock = block.trim();
    if (!trimmedBlock) continue;

    if (trimmedBlock.length <= MAX_CHARS_PER_PAGE) {
      expandedPages.push(trimmedBlock);
      continue;
    }

    const lines = trimmedBlock.split(/\n+/);
    let currentChunk = [];
    let currentLen = 0;

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      if (/^---chapter:/i.test(trimmedLine) && currentChunk.length > 0) {
        expandedPages.push(currentChunk.join("\n\n"));
        currentChunk = [trimmedLine];
        currentLen = trimmedLine.length;
        continue;
      }

      // If adding this paragraph exceeds MAX_CHARS_PER_PAGE and we already have content on this page, start a new page
      if (currentChunk.length > 0 && currentLen + trimmedLine.length > MAX_CHARS_PER_PAGE) {
        expandedPages.push(currentChunk.join("\n\n"));
        currentChunk = [trimmedLine];
        currentLen = trimmedLine.length;
      } else {
        currentChunk.push(trimmedLine);
        currentLen += trimmedLine.length;
      }
    }

    if (currentChunk.length > 0) {
      expandedPages.push(currentChunk.join("\n\n"));
    }
  }

  const finalRawPages = expandedPages.length > 0 ? expandedPages : [text];

  const chapters = [];
  const pages = finalRawPages
    .map((rawPage, index) => {
      // Extract all ---chapter: অধ্যায়ের নাম--- markers on this page
      const chapterRegex = /---chapter:\s*(.*?)---/gi;
      let match;
      while ((match = chapterRegex.exec(rawPage)) !== null) {
        const chapTitle = match[1].trim();
        if (chapTitle) {
          chapters.push({ title: chapTitle, pageIndex: index });
        }
      }
      return rawPage.replace(/---chapter:\s*.*?---/gi, "").trim();
    })
    .filter((p, idx, arr) => p.length > 0 || arr.length === 1);

  return {
    pages: pages.length ? pages : [text],
    chapters: chapters.length ? chapters : [{ title: title || "শুরু", pageIndex: 0 }],
  };
}

function htmlStyleToReactStyle(element) {
  const style = {};
  for (let index = 0; index < element.style.length; index += 1) {
    const property = element.style.item(index);
    const value = element.style.getPropertyValue(property).trim();
    if (!HTML_READER_STYLE_PROPERTIES.has(property) || /url\s*\(|expression|javascript:/i.test(value)) continue;
    const reactProperty = property.replace(/-([a-z])/g, (_, character) => character.toUpperCase());
    style[reactProperty] = value;
  }
  return Object.keys(style).length ? style : undefined;
}

function safeHtmlUrl(value, baseUrl, image = false) {
  if (!value) return undefined;
  try {
    const url = baseUrl ? new URL(value, baseUrl) : new URL(value, window.location.href);
    if (image && url.protocol === "data:" && /^data:image\/(?:png|jpe?g|gif|webp|avif);/i.test(value)) return url.toString();
    if (url.protocol === "https:" || url.protocol === "http:" || (!image && url.protocol === "mailto:")) {
      return url.toString();
    }
  } catch (error) {
    console.warn("Ignoring invalid URL in book HTML.", error);
  }
  return undefined;
}

function renderHtmlNode(node, baseUrl, key) {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent;
  if (node.nodeType !== Node.ELEMENT_NODE) return null;

  const tagName = node.tagName.toLowerCase();
  if (HTML_READER_DROP_TAGS.has(tagName)) return null;
  if (!HTML_READER_TAGS.has(tagName)) {
    return [...node.childNodes]
      .map((child, index) => renderHtmlNode(child, baseUrl, `${key}-${index}`))
      .filter((child) => child !== null && child !== undefined);
  }
  const children = [...node.childNodes]
    .map((child, index) => renderHtmlNode(child, baseUrl, `${key}-${index}`))
    .filter((child) => child !== null && child !== undefined);

  const props = { key };
  const className = node.getAttribute("class");
  const style = htmlStyleToReactStyle(node);
  if (className) props.className = className;
  if (style) props.style = style;

  if (tagName === "img") {
    props.src = safeHtmlUrl(node.getAttribute("src"), baseUrl, true);
    props.alt = node.getAttribute("alt") || "";
    props.title = node.getAttribute("title") || undefined;
    props.width = Number(node.getAttribute("width")) || undefined;
    props.height = Number(node.getAttribute("height")) || undefined;
    props.loading = "lazy";
    props.onError = () => console.error("Could not load a book HTML image.", { src: node.getAttribute("src") });
    if (!props.src) return null;
  } else {
    for (const attribute of ["align", "colspan", "rowspan", "scope"]) {
      if (node.hasAttribute(attribute)) {
        const propName = attribute === "colspan" ? "colSpan" : attribute === "rowspan" ? "rowSpan" : attribute;
        props[propName] = node.getAttribute(attribute);
      }
    }
    if (tagName === "a") {
      props.href = safeHtmlUrl(node.getAttribute("href"), baseUrl);
      if (!props.href) return children;
      if (node.getAttribute("target") === "_blank") {
        props.target = "_blank";
        props.rel = "noopener noreferrer";
      }
    }
  }

  return createElement(tagName, props, ...(HTML_READER_VOID_TAGS.has(tagName) ? [] : children));
}

function renderBookHtml(text, baseUrl) {
  if (!/<(?:!doctype|!--|(?:html|body|div|section|article|p|h[1-6]|img|figure|table|ul|ol|blockquote|center)\b)/i.test(text)) {
    return null;
  }
  const parsedDocument = new DOMParser().parseFromString(text, "text/html");
  return [...parsedDocument.body.childNodes]
    .map((node, index) => renderHtmlNode(node, baseUrl, `book-html-${index}`))
    .filter((node) => node !== null && node !== undefined);
}

function readSavedData() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return { books: [DEMO_BOOK], library: { history: {}, bookmarks: {}, notes: {}, booklists: {} } };
    const parsed = JSON.parse(saved);
    const savedBooks = Array.isArray(parsed.books) && parsed.books.length ? parsed.books : [];
    return {
      books: savedBooks.some((book) => book.id === DEMO_BOOK.id) ? savedBooks : [DEMO_BOOK, ...savedBooks],
      library: {
        history: parsed.library?.history || {},
        bookmarks: parsed.library?.bookmarks || {},
        notes: parsed.library?.notes || {},
        booklists: parsed.library?.booklists || {},
      },
    };
  } catch (error) {
    console.error("Could not load reader data from local storage.", error);
    return { books: [DEMO_BOOK], library: { history: {}, bookmarks: {}, notes: {}, booklists: {} } };
  }
}

function textOffsetWithin(root, node, offset) {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, offset);
  return range.toString().length;
}

function renderHighlights(text, notes, color, pageIndex, paragraphOffset, onHighlightClick) {
  const parts = [];
  let cursor = 0;
  while (cursor < text.length) {
    const matches = notes
      .map((note) => {
        const ref = note.ref || {};
        if (Number.isInteger(ref.startOffset) && Number.isInteger(ref.endOffset)) {
          const pageStart = pageIndex === ref.startPage ? ref.startOffset : 0;
          const pageEnd = pageIndex === ref.endPage ? ref.endOffset : Number.POSITIVE_INFINITY;
          const start = Math.max(cursor, pageStart - paragraphOffset);
          const end = Math.min(text.length, pageEnd - paragraphOffset);
          return start < end && start < text.length ? { note, start, end } : null;
        }
        const index = ref.text ? text.indexOf(ref.text, cursor) : -1;
        return index >= 0 ? { note, start: index, end: index + ref.text.length } : null;
      })
      .filter(Boolean)
      .sort((first, second) => first.start - second.start);

    const match = matches[0];
    if (!match) {
      parts.push(text.slice(cursor));
      break;
    }
    if (match.start > cursor) parts.push(text.slice(cursor, match.start));
    parts.push(
      <mark
        key={`${match.note.id}-${match.start}`}
        onClick={(event) => {
          event.stopPropagation();
          onHighlightClick(match.note.id, match.note.ref?.text || match.note.title, event.clientX, event.clientY);
        }}
        style={{ backgroundColor: color }}
      >
        {text.slice(match.start, match.end)}
      </mark>,
    );
    cursor = match.end;
  }
  return parts;
}

function renderMarkdownParagraph(text, notes, color, pageIndex, paragraphOffset, onHighlightClick, imageBaseUrl) {
  const imagePattern = /!\[([^\]]*)\]\((.*?)(?:\s+["']([^"']*)["'])?\)/g;
  const parts = [];
  let cursor = 0;
  let match;

  while ((match = imagePattern.exec(text))) {
    if (match.index > cursor) {
      parts.push(...renderHighlights(text.slice(cursor, match.index), notes, color, pageIndex, paragraphOffset + cursor, onHighlightClick));
    }

    let src = match[2].trim().replace(/^<|>$/g, "");
    try {
      src = imageBaseUrl ? new URL(src, imageBaseUrl).toString() : new URL(src, window.location.href).toString();
    } catch (error) {
      console.warn("Could not resolve a Markdown image URL.", error);
    }
    parts.push(
      <img
        key={`markdown-image-${match.index}`}
        className="reader-markdown-image"
        src={src}
        alt={match[1]}
        title={match[3] || undefined}
        loading="lazy"
        onError={(event) => {
          console.error("Could not load Markdown image.", { src });
          event.currentTarget.hidden = true;
        }}
      />,
    );
    cursor = imagePattern.lastIndex;
  }

  if (cursor < text.length) {
    parts.push(...renderHighlights(text.slice(cursor), notes, color, pageIndex, paragraphOffset + cursor, onHighlightClick));
  }

  return parts;
}

export default function ReaderApp({ initialStory, onBack } = {}) {
  const [books, setBooks] = useState([DEMO_BOOK]);
  const [databaseBooks, setDatabaseBooks] = useState([]);
  const [databaseLoading, setDatabaseLoading] = useState(true);
  const [databaseError, setDatabaseError] = useState("");
  const [library, setLibrary] = useState({ history: {}, bookmarks: {}, notes: {}, booklists: {} });
  const [activeBookId, setActiveBookId] = useState(initialStory?.id || null);
  const [hydrated, setHydrated] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [importError, setImportError] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [urlLoading, setUrlLoading] = useState(false);

  const initialBookObj = useMemo(() => {
    if (!initialStory) return null;
    const hasRemoteFile = Boolean(initialStory.fileUrl && initialStory.fileUrl.trim());
    return {
      id: initialStory.id || "selected-story",
      documentId: initialStory.id || "selected-story",
      title: initialStory.title || "নামহীন বই",
      author: initialStory.writer || initialStory.author || "লেখক",
      writer: initialStory.writer || initialStory.author || "লেখক",
      artwork: initialStory.artwork || "",
      fileUrl: hasRemoteFile ? initialStory.fileUrl.trim() : "",
      text: hasRemoteFile
        ? initialStory.content || ""
        : initialStory.content || initialStory.sampleText || DEMO_BOOK.text,
      sourceCollection: "shortStory",
      source: "firestore",
    };
  }, [initialStory]);

  useEffect(() => {
    if (initialBookObj) {
      setBooks((prev) => [initialBookObj, ...prev.filter((b) => b.id !== initialBookObj.id)]);
      setActiveBookId(initialBookObj.id);

      const savedData = readSavedData();
      const rawId = (initialBookObj.documentId || initialBookObj.id || "").replace(/^shortStory:/, "");
      const savedHist =
        savedData.library?.history?.[initialBookObj.id] ||
        savedData.library?.history?.[rawId] ||
        savedData.library?.history?.[`shortStory:${rawId}`];
      if (savedHist) {
        setCurrentPage(Math.max(0, savedHist.page || 0));
        scrollRestoreRef.current = { y: savedHist.scrollY || 0, page: savedHist.page || 0 };
      } else {
        setCurrentPage(0);
        scrollRestoreRef.current = null;
      }
      // Always start in Single Page mode
      setFullscreen(false);
      setIsRotatedLandscape(false);
      setSpreadMode(false);
      setScrollMode(true);
    }
  }, [initialBookObj]);

  // Reading settings
  const [currentPage, setCurrentPage] = useState(0);
  const [scrollMode, setScrollMode] = useState(true); // Default scrollMode
  const [spreadMode, setSpreadMode] = useState(false);
  const [pageTurn, setPageTurn] = useState(null);
  const [fontSize, setFontSize] = useState(16);
  const [selectedFontName, setSelectedFontName] = useState("serif");
  const [fontFamily, setFontFamily] = useState(FONTS_LIST[0].family);
  const [themeIndex, setThemeIndex] = useState(0);

  // Auto-scroll with exact Speed mapping
  const [autoScroll, setAutoScroll] = useState(false);
  const [speedX, setSpeedX] = useState(1);
  const [autoScrollSpeed, setAutoScrollSpeed] = useState(0.4);
  const [speedModalVisible, setSpeedModalVisible] = useState(false);

  // Fullscreen & Mobile 90-degree Landscape Rotation Overlay
  const [fullscreen, setFullscreen] = useState(false);
  const [isRotatedLandscape, setIsRotatedLandscape] = useState(false);
  const [showOverlay, setShowOverlay] = useState(false);
  const overlayTimerRef = useRef(null);
  const baseFontSizeRef = useRef(16);
  const prevReaderStateRef = useRef(null);

  // Navigation Modals
  const [jumpModalVisible, setJumpModalVisible] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(false);
  const [sidebarTab, setSidebarTab] = useState("chapters"); // 'chapters' | 'bookmarks' | 'notes'
  const [booklistModalVisible, setBooklistModalVisible] = useState(false);

  // Note Modal & Selection Context Menu
  const [addNoteModalVisible, setAddNoteModalVisible] = useState(false);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteText, setNoteText] = useState("");
  const [selectedText, setSelectedText] = useState("");
  const [selectionData, setSelectionData] = useState(null);
  const [floatingVisible, setFloatingVisible] = useState(false);
  const [actionMode, setActionMode] = useState(null); // 'save' | 'delete'
  const [floatingPos, setFloatingPos] = useState({ x: 0, y: 0 });
  const [selectedHighlightId, setSelectedHighlightId] = useState(null);

  const [toast, setToast] = useState("");
  const [bookContent, setBookContent] = useState({ id: "", text: "", loading: false, error: "" });

  const readerRootRef = useRef(null);
  const fileInputRef = useRef(null);
  const scrollRootRef = useRef(null);
  const saveTimerRef = useRef(null);
  const lastTapRef = useRef(0);
  const lastScrollYRef = useRef(0);
  const scrollRestoreRef = useRef(null);
  const pageTurnRef = useRef(null);
  const pageTurnTimerRef = useRef(null);
  const currentPageRef = useRef(currentPage);

  // Two-finger touch swipe detection for theme changing
  const touchStartYRef = useRef(0);
  const isTwoFingerRef = useRef(false);
  const hasTriggeredThemeRef = useRef(false);
  const [flickering, setFlickering] = useState(false);

  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  // Initial load
  useEffect(() => {
    const saved = readSavedData();
    setBooks((prev) => {
      const merged = [...saved.books];
      prev.forEach((b) => {
        if (!merged.some((item) => item.id === b.id)) {
          merged.unshift(b);
        }
      });
      return merged;
    });
    setLibrary(saved.library);

    try {
      const savedTheme = localStorage.getItem(THEME_STORAGE_KEY);
      if (savedTheme !== null) {
        setThemeIndex(Number(savedTheme) % THEMES.length);
      }
    } catch {
      // ignore
    }

    setHydrated(true);
  }, []);

  // Firebase subscription
  useEffect(() => {
    let unsubscribe;
    const timer = setTimeout(() => {
      try {
        unsubscribe = subscribeToReaderBooks(
          (remoteBooks) => {
            setDatabaseBooks(remoteBooks);
            setDatabaseError("");
            setDatabaseLoading(false);
          },
          (error) => {
            console.error("Could not subscribe to Firebase reading books.", error);
            setDatabaseError(`Firebase বই লোড করা যায়নি: ${error.message || "database access denied"}`);
            setDatabaseLoading(false);
          },
        );
      } catch (error) {
        console.error("Could not connect Firebase reader.", error);
        setDatabaseError(error.message || "Firebase configuration is missing.");
        setDatabaseLoading(false);
      }
    }, 0);
    return () => {
      clearTimeout(timer);
      unsubscribe?.();
    };
  }, []);

  // Persist to local storage
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ books, library }));
    } catch (error) {
      console.error("Could not save reader data to local storage.", error);
      setStorageError("এই ব্রাউজারে সংরক্ষণের জায়গা শেষ বা অনুপলব্ধ। বইয়ের তথ্য export করে রাখুন।");
    }
  }, [books, library, hydrated]);

  const allBooks = useMemo(() => {
    const combined = [...databaseBooks, ...books];
    if (initialBookObj && !combined.some((b) => b.id === initialBookObj.id)) {
      combined.unshift(initialBookObj);
    }
    return combined;
  }, [databaseBooks, books, initialBookObj]);
  const activeBook =
    allBooks.find(
      (book) =>
        book.id === activeBookId ||
        book.documentId === activeBookId ||
        book.id === `shortStory:${activeBookId}`,
    ) ||
    initialBookObj ||
    allBooks[0] ||
    DEMO_BOOK;
  const resolvedBookId = activeBook?.id || activeBookId || DEMO_BOOK.id;
  const activeBookText = activeBook?.text;
  const activeBookFileUrl = activeBook?.fileUrl;
  const currentText =
    activeBookText ||
    (bookContent.id === resolvedBookId || bookContent.id === activeBookId ? bookContent.text : "");
  const parsed = useMemo(
    () => (activeBook && currentText ? splitBook(currentText, activeBook.title) : { pages: [], chapters: [] }),
    [activeBook, currentText],
  );
  const pages = parsed.pages;
  const theme = THEMES[themeIndex] || THEMES[0];

  // Normalize bookNotes (handles both array and { quotes: [...] })
  const bookNotes = useMemo(() => {
    if (!activeBook) return [];
    const raw = library.notes[activeBook.id];
    if (Array.isArray(raw)) return raw;
    if (Array.isArray(raw?.quotes)) return raw.quotes;
    return [];
  }, [activeBook, library.notes]);

  const bookmarks = activeBook ? library.bookmarks[activeBook.id] || [] : [];
  const totalPages = pages.length;
  const totalLeaves = Math.max(1, Math.ceil(totalPages / 2));
  const currentLeafIndex = Math.min(totalLeaves, Math.floor(currentPage / 2) + 1);

  const activeBookLoading = Boolean(
    activeBook &&
      !activeBookText &&
      bookContent.id !== resolvedBookId &&
      bookContent.id !== activeBookId
      ? true
      : bookContent.loading,
  );
  const activeBookError =
    activeBook && (bookContent.id === resolvedBookId || bookContent.id === activeBookId)
      ? bookContent.error
      : "";

  // Auto-scroll speed calculation
  useEffect(() => {
    const calculated = SPEED_MAP[speedX] ?? (0.2 * speedX);
    setAutoScrollSpeed(calculated);
  }, [speedX]);

  // Auto-scroll interval
  useEffect(() => {
    if (!autoScroll || !scrollMode) return undefined;
    const timer = setInterval(() => {
      scrollRootRef.current?.scrollBy({
        top: autoScrollSpeed,
        behavior: "auto",
      });
    }, 50);
    return () => clearInterval(timer);
  }, [autoScroll, scrollMode, autoScrollSpeed]);

  // Turn animation complete
  const completePageTurn = useCallback(() => {
    const turn = pageTurnRef.current;
    if (!turn) return;
    clearTimeout(pageTurnTimerRef.current);
    pageTurnRef.current = null;
    pageTurnTimerRef.current = null;
    setCurrentPage(turn.target);
  }, []);

  const cancelPageTurn = useCallback(() => {
    clearTimeout(pageTurnTimerRef.current);
    pageTurnRef.current = null;
    pageTurnTimerRef.current = null;
  }, []);

  // Theme toggle with persistent storage and flicker animation
  const toggleTheme = useCallback(() => {
    const nextIndex = (themeIndex + 1) % THEMES.length;
    setThemeIndex(nextIndex);
    setFlickering(true);
    setTimeout(() => setFlickering(false), 400);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, nextIndex.toString());
    } catch {
      // ignore
    }
  }, [themeIndex]);

  // Overlay management
  const triggerOverlay = () => {
    if (showOverlay) {
      setShowOverlay(false);
      if (overlayTimerRef.current) {
        clearTimeout(overlayTimerRef.current);
        overlayTimerRef.current = null;
      }
    } else {
      setShowOverlay(true);
      if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
      overlayTimerRef.current = setTimeout(() => {
        setShowOverlay(false);
        overlayTimerRef.current = null;
      }, 5000);
    }
  };

  const resetOverlayTimer = () => {
    if (showOverlay) {
      if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
      overlayTimerRef.current = setTimeout(() => {
        setShowOverlay(false);
        overlayTimerRef.current = null;
      }, 5000);
    }
  };

  // Open book & restore position
  const openBook = (bookId) => {
    const book = allBooks.find((item) => item.id === bookId);
    if (!book) return;
    cancelPageTurn();
    setPageTurn(null);
    const history = library.history[bookId];
    const pageCount = book.text ? splitBook(book.text, book.title).pages.length : history?.total || 1;
    setCurrentPage(Math.min(Math.max(history?.page || 0, 0), Math.max(pageCount - 1, 0)));
    setScrollMode(history?.scrollMode !== undefined ? Boolean(history.scrollMode) : true);
    setSpreadMode(Boolean(history?.spreadMode));
    setAutoScroll(false);
    scrollRestoreRef.current = history ? { y: history.scrollY, page: history.page } : null;
    setActiveBookId(bookId);
  };

  // Fetch & Cache fileUrl with streaming partial cache + automatic re-fetch if incomplete
  useEffect(() => {
    if (!resolvedBookId || activeBookText) return undefined;
    const abortController = new AbortController();

    const cleanUrl = (activeBookFileUrl || "")
      .toString()
      .replace(/^['"“”‘’\s]+|['"“”‘’\s]+$/g, "")
      .trim();

    if (!cleanUrl) {
      setBookContent({
        id: resolvedBookId,
        text: DEMO_BOOK.text,
        loading: false,
        error: "",
      });
      return undefined;
    }

    let directUrl = cleanUrl;
    if (directUrl.includes("dropbox.com")) {
      directUrl = directUrl.replace("www.dropbox.com", "dl.dropboxusercontent.com");
      if (directUrl.includes("dl=0")) {
        directUrl = directUrl.replace("dl=0", "raw=1");
      } else if (!directUrl.includes("raw=1") && !directUrl.includes("dl=1")) {
        directUrl += directUrl.includes("?") ? "&raw=1" : "?raw=1";
      }
    }

    const cacheId = (activeBook?.documentId || resolvedBookId).replace(/^shortStory:/, "");
    const cached =
      readCachedBookFile(cacheId, directUrl) ||
      readCachedBookFile(resolvedBookId, directUrl);

    // 1. If completely loaded & cached previously, serve immediately from cache without network hit!
    if (cached && cached.isComplete && cached.text && cached.text.trim().length > 0) {
      setBookContent({
        id: resolvedBookId,
        text: cached.text,
        loading: false,
        error: "",
      });
      return undefined;
    }

    // 2. If partially cached (e.g., previous load was interrupted), show the partial text immediately while fetching the full file in the background!
    const hasPartialCache = Boolean(cached && cached.text && cached.text.trim().length > 0);
    if (hasPartialCache) {
      setBookContent({
        id: resolvedBookId,
        text: cached.text,
        loading: false,
        error: "",
      });
    } else {
      setBookContent({ id: resolvedBookId, text: "", loading: true, error: "" });
    }

    const timer = setTimeout(async () => {
      let accumulatedText = "";
      try {
        const proxyUrl = `/api/stream?url=${encodeURIComponent(directUrl)}`;
        let response = await fetch(proxyUrl, { signal: abortController.signal });
        if (!response.ok) {
          response = await fetch(directUrl, { signal: abortController.signal });
        }
        if (!response.ok) {
          throw new Error(`বইয়ের ফাইল লোড ব্যর্থ (HTTP ${response.status})`);
        }

        // Stream chunks progressively so whatever is loaded so far is cached even if interrupted
        const expectedBytes = Number(response.headers.get("content-length") || 0);
        let receivedBytes = 0;

        if (response.body && typeof response.body.getReader === "function") {
          const reader = response.body.getReader();
          const decoder = new TextDecoder("utf-8");
          let done = false;

          while (!done) {
            const { value, done: readerDone } = await reader.read();
            done = readerDone;
            if (value) {
              receivedBytes += value.byteLength;
              accumulatedText += decoder.decode(value, { stream: !done });
              // Cache partial progress as chunks arrive
              if (accumulatedText.trim().length > 0) {
                writeCachedBookFile(cacheId, directUrl, accumulatedText, false);
                if (cacheId !== resolvedBookId) {
                  writeCachedBookFile(resolvedBookId, directUrl, accumulatedText, false);
                }
              }
            }
          }
        } else {
          accumulatedText = await response.text();
          receivedBytes = new Blob([accumulatedText]).size;
        }

        if (!accumulatedText.trim()) {
          throw new Error("বইয়ের ফাইলটি খালি।");
        }

        // Only mark as 100% complete if we received all expected bytes (or if Content-Length was not sent and stream ended cleanly)
        const isFullyLoaded = expectedBytes > 0 ? receivedBytes >= expectedBytes : true;

        writeCachedBookFile(cacheId, directUrl, accumulatedText, isFullyLoaded);
        if (cacheId !== resolvedBookId) {
          writeCachedBookFile(resolvedBookId, directUrl, accumulatedText, isFullyLoaded);
        }

        setBookContent({
          id: resolvedBookId,
          text: accumulatedText,
          loading: false,
          error: "",
        });
      } catch (error) {
        if (error.name === "AbortError") {
          // User closed or switched before full load completed — keep whatever partial text was loaded cached as isComplete: false
          if (accumulatedText.trim().length > 0) {
            writeCachedBookFile(cacheId, directUrl, accumulatedText, false);
          }
          return;
        }
        console.error("Could not load the Firebase book file.", error);
        // If we had partial cache or accumulated partial text, let the user read what was loaded so far
        const fallbackText = accumulatedText.trim() || (hasPartialCache ? cached.text : "");
        if (fallbackText) {
          writeCachedBookFile(cacheId, directUrl, fallbackText, false);
          setBookContent({
            id: resolvedBookId,
            text: fallbackText,
            loading: false,
            error: "",
          });
        } else {
          setBookContent({
            id: resolvedBookId,
            text: "",
            loading: false,
            error: error.message || "বইয়ের ফাইল লোড করা যায়নি।",
          });
        }
      }
    }, 0);

    return () => {
      clearTimeout(timer);
      abortController.abort();
    };
  }, [resolvedBookId, activeBookFileUrl, activeBookText, activeBook?.documentId]);

  // Save history with debounce (saves under both raw ID and shortStory:ID + syncs to GolpoJolpo main History store)
  const saveHistory = useCallback(
    (page, scrollY = 0) => {
      if (!activeBook) return;
      const rawDocId = (activeBook.documentId || activeBook.id || "").replace(/^shortStory:/, "");
      const histPayload = {
        page,
        scrollY,
        scrollMode,
        spreadMode,
        total: pages.length,
        type: "reader",
        sourceType: activeBook.sourceCollection || "local",
        fileUrl: activeBook.fileUrl || "",
        lastReadAt: Date.now(),
      };

      setLibrary((current) => ({
        ...current,
        history: {
          ...current.history,
          [activeBook.id]: histPayload,
          ...(rawDocId ? { [rawDocId]: histPayload, [`shortStory:${rawDocId}`]: histPayload } : {}),
        },
      }));

      // Sync to main app unified History (golpojolpo_history_v1)
      try {
        const total = Math.max(1, pages.length);
        const pct = Math.min(100, Math.max(1, Math.round(((page + 1) / total) * 100)));
        const rawHist = localStorage.getItem("golpojolpo_history_v1");
        const list = rawHist ? JSON.parse(rawHist) : [];
        const canonicalId = rawDocId || activeBook.id;
        const entryId = `ebook:${canonicalId}`;
        const newEntry = {
          id: entryId,
          type: "ebook",
          itemId: canonicalId,
          title: activeBook.title,
          artist: activeBook.writer || activeBook.author || "",
          artwork: activeBook.artwork || "",
          fileUrl: activeBook.fileUrl || "",
          letter: (activeBook.title || "গ").trim().slice(0, 2),
          page,
          totalPages: total,
          scrollTop: scrollY,
          scrollPercent: pct,
          story: initialStory || activeBook,
          updatedAt: Date.now(),
        };
        const nextList = [
          newEntry,
          ...(Array.isArray(list)
            ? list.filter((x) => x.id !== entryId && x.itemId !== activeBook.id)
            : []),
        ].slice(0, 60);
        localStorage.setItem("golpojolpo_history_v1", JSON.stringify(nextList));
      } catch {
        // Ignore storage error
      }
    },
    [activeBook, initialStory, pages.length, scrollMode, spreadMode],
  );

  useEffect(() => {
    if (!activeBook || !hydrated || !pages.length || bookContent.loading) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveHistory(currentPage, scrollMode ? lastScrollYRef.current : 0);
    }, 500);
    return () => clearTimeout(saveTimerRef.current);
  }, [activeBook, currentPage, scrollMode, hydrated, saveHistory, pages.length, bookContent.loading]);

  // Restore scroll when pages finish loading
  useEffect(() => {
    if (!activeBook || !scrollMode || !pages.length || bookContent.loading) return undefined;
    const frame = requestAnimationFrame(() => {
      const restore = scrollRestoreRef.current;
      if (restore?.y) {
        scrollRootRef.current?.scrollTo({ top: restore.y, behavior: "auto" });
      } else if (restore?.page || currentPageRef.current > 0) {
        const targetIdx = restore?.page ?? currentPageRef.current;
        const pageEl = scrollRootRef.current?.querySelector(`[data-reader-page="${targetIdx}"]`);
        if (pageEl) scrollRootRef.current?.scrollTo({ top: pageEl.offsetTop, behavior: "auto" });
      }
      scrollRestoreRef.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [activeBookId, scrollMode, activeBook, pages.length, bookContent.loading]);

  // Toast auto-hide
  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(""), 2500);
    return () => clearTimeout(timer);
  }, [toast]);

  // Navigation handlers
  const handleJumpPage = useCallback(
    (pageIndex) => {
      const target = Math.max(0, Math.min(Number(pageIndex) || 0, totalPages - 1));
      if (scrollMode) {
        setCurrentPage(target);
        const element = document.querySelector(`[data-reader-page="${target}"]`);
        if (element && scrollRootRef.current) {
          element.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      } else {
        const step = spreadMode ? 2 : 1;
        if (Math.abs(target - currentPage) === step) {
          const turn = {
            id: `${Date.now()}-${target}`,
            from: currentPage,
            target,
            direction: target > currentPage ? "forward" : "backward",
          };
          pageTurnRef.current = turn;
          setPageTurn(turn);
          pageTurnTimerRef.current = setTimeout(() => {
            completePageTurn();
            setPageTurn(null);
          }, 800);
        } else {
          setCurrentPage(target);
        }
      }
    },
    [completePageTurn, currentPage, scrollMode, spreadMode, totalPages],
  );

  const handleNext = () => {
    if (currentPage >= totalPages - (spreadMode ? 2 : 1)) return;
    if (scrollMode) {
      const next = currentPage + 1;
      setCurrentPage(next);
      handleJumpPage(next);
    } else {
      handleJumpPage(currentPage + (spreadMode ? 2 : 1));
    }
  };

  const handlePrev = () => {
    if (currentPage <= 0) return;
    const prev = Math.max(0, currentPage - (spreadMode ? 2 : 1));
    setCurrentPage(prev);
    if (scrollMode) {
      handleJumpPage(prev);
    } else {
      handleJumpPage(prev);
    }
  };

  // Text selection & floating menu (Disabled in Double Page / Spread / Fullscreen mode)
  const handleSelection = () => {
    if (!scrollMode || spreadMode || fullscreen) {
      window.getSelection?.()?.removeAllRanges?.();
      if (floatingVisible) setFloatingVisible(false);
      return;
    }
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const rawText = selection.toString();
    const text = rawText.trim();
    if (!text) {
      if (floatingVisible && actionMode === "save") setFloatingVisible(false);
      return;
    }
    const range = selection.getRangeAt(0);
    const startNode = (range.startContainer.nodeType === Node.TEXT_NODE
      ? range.startContainer.parentElement
      : range.startContainer).closest("[data-reader-page]");
    const endNode = (range.endContainer.nodeType === Node.TEXT_NODE
      ? range.endContainer.parentElement
      : range.endContainer).closest("[data-reader-page]");

    if (!startNode || !endNode) return;

    const startPage = Number(startNode.dataset.readerPage);
    const endPage = Number(endNode.dataset.readerPage);
    const trimStart = rawText.length - rawText.trimStart().length;
    const trimEnd = rawText.length - rawText.trimEnd().length;
    const startOffset = textOffsetWithin(startNode, range.startContainer, range.startOffset) + trimStart;
    const endOffset = textOffsetWithin(endNode, range.endContainer, range.endOffset) - trimEnd;

    setSelectedText(text);
    setSelectionData({ startPage, endPage, startOffset, endOffset });
    setActionMode("save");

    const rect = range.getBoundingClientRect();
    setFloatingPos({
      x: Math.max(12, Math.min(window.innerWidth - 160, rect.left + rect.width / 2 - 50)),
      y: Math.max(12, rect.top - 50),
    });
    setFloatingVisible(true);
  };

  const handleHighlightClick = (noteId, text, clientX, clientY) => {
    setSelectedHighlightId(noteId);
    setSelectedText(text || "");
    setActionMode("delete");
    setFloatingPos({
      x: Math.max(12, Math.min(window.innerWidth - 160, clientX - 50)),
      y: Math.max(12, clientY - 50),
    });
    setFloatingVisible(true);
  };

  // Save note matching React Native structure
  const handleSaveNote = () => {
    if (!activeBook || !selectedText || !selectionData) return;
    const noteId = Date.now().toString();
    const highlightInfo = {
      id: noteId,
      title: noteTitle.trim() || "Note",
      content: noteText.trim(),
      ref: {
        text: selectedText,
        bookTitle: activeBook.title || "Unknown Book",
        startPage: selectionData.startPage,
        endPage: selectionData.endPage,
        startOffset: selectionData.startOffset,
        endOffset: selectionData.endOffset,
        page: selectionData.startPage,
        id: noteId,
      },
    };

    setLibrary((current) => {
      const existing = current.notes[activeBook.id] || [];
      const updated = Array.isArray(existing)
        ? [...existing, highlightInfo]
        : Array.isArray(existing?.quotes)
        ? { ...existing, quotes: [...existing.quotes, highlightInfo] }
        : [highlightInfo];

      return {
        ...current,
        notes: {
          ...current.notes,
          [activeBook.id]: updated,
        },
      };
    });

    setAddNoteModalVisible(false);
    setFloatingVisible(false);
    setNoteTitle("");
    setNoteText("");
    setSelectedText("");
    setSelectionData(null);
    window.getSelection()?.removeAllRanges();
    setToast("নোট ও হাইলাইট সংরক্ষণ করা হয়েছে");
  };

  // Delete note
  const handleDeleteNote = (note) => {
    if (!activeBook) return;
    const targetId = typeof note === "string" ? note : note?.id;
    setLibrary((current) => {
      const raw = current.notes[activeBook.id];
      if (Array.isArray(raw)) {
        return {
          ...current,
          notes: { ...current.notes, [activeBook.id]: raw.filter((n) => n.id !== targetId) },
        };
      }
      if (Array.isArray(raw?.quotes)) {
        return {
          ...current,
          notes: {
            ...current.notes,
            [activeBook.id]: {
              ...raw,
              quotes: raw.quotes.filter((n) => n.id !== targetId),
            },
          },
        };
      }
      return current;
    });
    setFloatingVisible(false);
    setSelectedHighlightId(null);
    setToast("নোট মুছে ফেলা হয়েছে");
  };

  // Bookmark toggle
  const toggleBookmark = () => {
    if (!activeBook) return;
    const exists = bookmarks.includes(currentPage);
    setLibrary((current) => ({
      ...current,
      bookmarks: {
        ...current.bookmarks,
        [activeBook.id]: exists
          ? bookmarks.filter((page) => page !== currentPage)
          : [...bookmarks, currentPage].sort((a, b) => a - b),
      },
    }));
    setToast(exists ? "বুকমার্ক সরানো হয়েছে" : "বুকমার্ক যোগ করা হয়েছে");
  };

  const removeBookmark = (page) => {
    if (!activeBook) return;
    setLibrary((current) => ({
      ...current,
      bookmarks: {
        ...current.bookmarks,
        [activeBook.id]: (current.bookmarks[activeBook.id] || []).filter((p) => p !== page),
      },
    }));
    setToast("বুকমার্ক সরানো হয়েছে");
  };

  // Booklists
  const createBooklist = (title) => {
    if (!title.trim() || !activeBook) return;
    const id = Date.now().toString();
    setLibrary((current) => ({
      ...current,
      booklists: {
        ...current.booklists,
        [id]: { title: title.trim(), items: [activeBook.id] },
      },
    }));
    setToast("বুকলিস্ট তৈরি হয়েছে এবং বইটি যোগ হয়েছে");
  };

  const toggleBookInList = (id) => {
    if (!activeBook) return;
    setLibrary((current) => {
      const list = current.booklists[id];
      if (!list) return current;
      const contains = Array.isArray(list.items) && list.items.includes(activeBook.id);
      return {
        ...current,
        booklists: {
          ...current.booklists,
          [id]: {
            ...list,
            items: contains ? list.items.filter((item) => item !== activeBook.id) : [...list.items, activeBook.id],
          },
        },
      };
    });
  };

  // Fullscreen & Rotated 2-Page Flipper Mode toggle (triggered on double-click / double-tap)
  const toggleFullscreen = async () => {
    const next = !fullscreen;
    cancelPageTurn();
    setPageTurn(null);
    setFloatingVisible(false);
    setSelectedText("");
    setActionMode(null);
    setFullscreen(next);

    if (next) {
      // Save previous portrait state (exact match to React Native prevReaderState.current)
      prevReaderStateRef.current = {
        scrollMode,
        autoScroll,
        fontSize,
        currentPage: currentPageRef.current,
        scrollY: lastScrollYRef.current,
      };
      baseFontSizeRef.current = fontSize;

      // Switch to 2-Page Spread Flipper mode and rotate 90deg on portrait screens
      setAutoScroll(false);
      setScrollMode(false);
      setSpreadMode(true);
      setFontSize(Math.max(12, fontSize - 3));
      setCurrentPage((prev) => Math.floor(prev / 2) * 2);

      const isPortrait =
        typeof window !== "undefined" && window.innerHeight > window.innerWidth;
      setIsRotatedLandscape(isPortrait);

      // Show the progress/exit overlay briefly upon entering fullscreen
      setShowOverlay(true);
      if (overlayTimerRef.current) clearTimeout(overlayTimerRef.current);
      overlayTimerRef.current = setTimeout(() => {
        setShowOverlay(false);
        overlayTimerRef.current = null;
      }, 5000);

      try {
        if (!document.fullscreenElement) {
          await readerRootRef.current?.requestFullscreen?.();
        }
      } catch {
        // Ignore on browsers that restrict requestFullscreen
      }
    } else {
      // Return to Portrait Scroll Mode and restore previous state
      setIsRotatedLandscape(false);
      setShowOverlay(false);
      setSpreadMode(false);
      setScrollMode(true);
      const prev = prevReaderStateRef.current;
      setFontSize(prev?.fontSize || baseFontSizeRef.current || 16);
      scrollRestoreRef.current = {
        page: currentPageRef.current,
        y: prev?.currentPage === currentPageRef.current ? prev?.scrollY : undefined,
      };

      try {
        if (document.fullscreenElement) {
          await document.exitFullscreen?.();
        }
      } catch {
        // Ignore
      }
    }
  };

  useEffect(() => {
    const handleResize = () => {
      if (fullscreen) {
        setIsRotatedLandscape(window.innerHeight > window.innerWidth);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [fullscreen]);

  // Keyboard navigation
  useEffect(() => {
    if (!activeBook) return undefined;
    const handleKey = (e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "ArrowRight") handleNext();
      if (e.key === "ArrowLeft") handlePrev();
      if (e.key === "Escape") {
        setSidebarVisible(false);
        setBooklistModalVisible(false);
        setJumpModalVisible(false);
        setSpeedModalVisible(false);
        setAddNoteModalVisible(false);
        setFloatingVisible(false);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [activeBook, handleNext, handlePrev]);

  // Import local book
  const addBook = (title, text) => {
    cancelPageTurn();
    setPageTurn(null);
    const book = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title: title.trim() || "নামহীন বই",
      author: "",
      text,
    };
    setBooks((current) => [book, ...current]);
    setActiveBookId(book.id);
    setCurrentPage(0);
    setScrollMode(true);
    setImportError("");
    setToast("বইটি যোগ করা হয়েছে");
  };

  const importFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      if (!text.trim()) throw new Error("ফাইলটি খালি।");
      addBook(file.name.replace(/\.[^.]+$/, ""), text);
    } catch (error) {
      console.error("Could not read selected book file.", error);
      setImportError(error.message || "ফাইলটি পড়া যায়নি।");
    }
  };

  const importUrl = async (event) => {
    event.preventDefault();
    if (!urlInput.trim()) return;
    setUrlLoading(true);
    setImportError("");
    try {
      const response = await fetch(urlInput.trim());
      if (!response.ok) throw new Error(`URL থেকে বই আনা যায়নি (HTTP ${response.status}).`);
      const text = await response.text();
      if (!text.trim()) throw new Error("URL-এ খালি ফাইল আছে।");
      const filename = urlInput.trim().split("/").pop()?.split("?")[0] || "অনলাইন বই";
      addBook(decodeURIComponent(filename).replace(/\.[^.]+$/, ""), text);
      setUrlInput("");
    } catch (error) {
      console.error("Could not fetch book URL.", error);
      setImportError(
        error.message?.includes("fetch")
          ? "এই ওয়েবসাইট থেকে ফাইল আনা যাচ্ছে না (সম্ভবত CORS বাধা)। ফাইলটি ডাউনলোড করে Upload book ব্যবহার করুন।"
          : error.message || "URL থেকে বই আনা যায়নি।",
      );
    } finally {
      setUrlLoading(false);
    }
  };

  const exportLibrary = () => {
    try {
      const data = new Blob([JSON.stringify({ books: allBooks, library }, null, 2)], { type: "application/json" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(data);
      link.download = "golpojolpo-reader-backup.json";
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (error) {
      console.error("Could not export reader backup.", error);
      setToast("Backup export করা যায়নি");
    }
  };

  const closeReader = () => {
    cancelPageTurn();
    setPageTurn(null);
    setAutoScroll(false);
    setFullscreen(false);
    setIsRotatedLandscape(false);
    setSpreadMode(false);
    setScrollMode(true);
    setSidebarVisible(false);
    setFloatingVisible(false);
    try {
      if (document.fullscreenElement) {
        document.exitFullscreen?.();
      }
    } catch {
      // ignore
    }
    if (onBack) {
      onBack();
    }
  };

  const handleScroll = () => {
    if (!scrollRootRef.current) return;
    lastScrollYRef.current = scrollRootRef.current.scrollTop;
    const rootRect = scrollRootRef.current.getBoundingClientRect();
    let nearest = 0;
    let distance = Number.POSITIVE_INFINITY;
    scrollRootRef.current.querySelectorAll("[data-reader-page]").forEach((element) => {
      const offset = Math.abs(element.getBoundingClientRect().top - rootRect.top);
      if (offset < distance) {
        distance = offset;
        nearest = Number(element.dataset.readerPage);
      }
    });
    if (currentPage !== nearest) {
      setCurrentPage(nearest);
    }
  };

  // Render Page Content
  const renderPage = (pageIndex, flipMode = false) => {
    const pageText = pages[pageIndex] || "";
    const htmlBook = renderBookHtml(pageText, activeBookFileUrl);
    const paragraphs = htmlBook ? [] : pageText.split(/\n+/).filter((line) => line.trim());
    const visibleText = paragraphs.join("");

    const notesOnPage = bookNotes
      .filter((note) => {
        const startPage = note.ref?.startPage ?? note.ref?.page;
        const endPage = note.ref?.endPage ?? note.ref?.page;
        return Number.isInteger(startPage) && Number.isInteger(endPage) && pageIndex >= startPage && pageIndex <= endPage;
      })
      .map((note) => {
        if (Number.isInteger(note.ref?.startOffset) && Number.isInteger(note.ref?.endOffset)) return note;
        const startOffset = visibleText.indexOf(note.ref?.text || "");
        return startOffset < 0
          ? note
          : {
              ...note,
              ref: {
                ...note.ref,
                page: pageIndex,
                startPage: pageIndex,
                endPage: pageIndex,
                startOffset,
                endOffset: startOffset + (note.ref?.text?.length || 0),
              },
            };
      });

    let paragraphOffset = 0;
    return (
      <article
        className={`reader-page${flipMode ? " flip-reader-page" : ""}${pageIndex === 0 ? " cover-page" : ""}`}
        data-reader-page={pageIndex}
        key={`${activeBook.id}-${pageIndex}`}
        onMouseUp={handleSelection}
        onTouchEnd={handleSelection}
        style={{
          backgroundColor: theme.page,
          color: theme.text,
          fontFamily,
          fontSize: `${fontSize}px`,
        }}
      >
        <div className="page-content">
          {htmlBook ? (
            <div className="book-html-content">{htmlBook}</div>
          ) : paragraphs.length ? (
            paragraphs.map((paragraph, paragraphIndex) => {
              const offset = paragraphOffset;
              paragraphOffset += paragraph.length;
              const trimmedLine = paragraph.trim();

              // Markdown horizontal rule (--- or ***)
              if (/^(?:---+|\*\*\*+|___+)$/.test(trimmedLine)) {
                return <hr key={`${pageIndex}-${paragraphIndex}`} className="reader-hr" />;
              }

              // Markdown H1 .. H6 headings (# .. ######)
              const headingMatch = trimmedLine.match(/^(#{1,6})\s+(.*)$/);
              if (headingMatch) {
                const level = Math.min(6, headingMatch[1].length);
                const headingText = headingMatch[2]
                  .replace(/\*\*(.*?)\*\*/g, "$1")
                  .replace(/__(.*?)__/g, "$1")
                  .trim();
                const Tag = `h${level}`;
                return (
                  <Tag key={`${pageIndex}-${paragraphIndex}`} className={`reader-md-h${level}`}>
                    {headingText}
                  </Tag>
                );
              }

              const cleanParagraph = paragraph
                .replace(/\*\*(.*?)\*\*/g, "$1")
                .replace(/__(.*?)__/g, "$1");

              return (
                <p key={`${pageIndex}-${paragraphIndex}`}>
                  {renderMarkdownParagraph(
                    cleanParagraph,
                    notesOnPage,
                    theme.highlight,
                    pageIndex,
                    offset,
                    handleHighlightClick,
                    activeBookFileUrl,
                  )}
                </p>
              );
            })
          ) : (
            <p className="empty-page">এই পৃষ্ঠাটি ফাঁকা।</p>
          )}
        </div>
        <span className="page-number">{pageIndex + 1}</span>
      </article>
    );
  };

  // If not hydrated yet
  if (!hydrated) {
    return (
      <main className="reader-app" style={{ "--reader-bg": "#e0d5c1" }}>
        <BookLoader visible={true} />
      </main>
    );
  }

  // Active Reader View
  const isBookmarked = bookmarks.includes(currentPage);

  return (
    <main
      ref={readerRootRef}
      className={`reader-app${fullscreen ? " is-fullscreen" : ""}${
        fullscreen && isRotatedLandscape ? " is-rotated-landscape" : ""
      }${flickering ? " flicker-effect" : ""}`}
      style={{
        "--reader-bg": theme.background,
        "--reader-page": theme.page,
        "--reader-text": theme.text,
        "--reader-highlight": theme.highlight,
      }}
      onTouchStart={(e) => {
        if (e.touches.length === 2) {
          isTwoFingerRef.current = true;
          hasTriggeredThemeRef.current = false;
          touchStartYRef.current = (e.touches[0].pageY + e.touches[1].pageY) / 2;
        }
      }}
      onTouchMove={(e) => {
        if (isTwoFingerRef.current && e.touches.length === 2 && !hasTriggeredThemeRef.current) {
          const currentY = (e.touches[0].pageY + e.touches[1].pageY) / 2;
          const diffY = currentY - touchStartYRef.current;
          if (Math.abs(diffY) > 80) {
            hasTriggeredThemeRef.current = true;
            toggleTheme();
          }
        }
      }}
      onTouchEnd={() => {
        isTwoFingerRef.current = false;
        hasTriggeredThemeRef.current = false;
      }}
    >
      {/* ========================================= */}
      {/* 1. HEADER (matching React Native Header)   */}
      {/* ========================================= */}
      {!fullscreen && (
        <header className="reader-header">
          {/* Back Button */}
          <button
            type="button"
            className="reader-header-icon-btn"
            onClick={closeReader}
            title="Back to library"
            aria-label="Back to library"
          >
            <ArrowBackIcon size={24} color="#3b2f1b" />
          </button>

          {/* Compact Settings Bar (Speed, FontSelector, AutoScroll Switch) */}
          <div className="compact-settings">
            {/* Speed Badge Button -> opens SpeedModal */}
            <button
              type="button"
              className="speed-badge-btn"
              onClick={() => setSpeedModalVisible(true)}
              title="Change auto-scroll speed"
            >
              {speedX}x
            </button>

            {/* Font Selector */}
            <FontSelector
              selectedFont={selectedFontName}
              onSelect={(name, family) => {
                setSelectedFontName(name);
                setFontFamily(family);
              }}
            />

            {/* AutoScroll Switch */}
            <div className="switch-container" title="Auto Scroll Toggle">
              <label className="switch">
                <input
                  type="checkbox"
                  checked={autoScroll}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    if (checked && !scrollMode) {
                      setScrollMode(true);
                    }
                    setAutoScroll(checked);
                  }}
                  aria-label="Toggle auto-scroll"
                />
                <span className="switch-slider round" />
              </label>
            </div>
          </div>

          {/* Menu Button -> opens ChapterSidebar */}
          <button
            type="button"
            className="reader-header-icon-btn"
            onClick={() => {
              setSidebarTab("chapters");
              setSidebarVisible(true);
            }}
            title="সূচিপত্র ও মেনু"
            aria-label="Menu"
          >
            <MenuIcon size={24} color="#3b2f1b" />
          </button>
        </header>
      )}

      {/* ========================================= */}
      {/* 2. READER STAGE (Content & Gestures)       */}
      {/* ========================================= */}
      <div className="reader-body">
        <section
          className={`reader-stage${scrollMode ? " scroll-mode" : " page-mode"}${spreadMode && !scrollMode ? " spread-mode" : ""}`}
          onCopy={(e) => {
            if (!scrollMode || spreadMode || fullscreen) {
              e.preventDefault();
            }
          }}
          onCut={(e) => {
            if (!scrollMode || spreadMode || fullscreen) {
              e.preventDefault();
            }
          }}
          onContextMenu={(e) => {
            if (!scrollMode || spreadMode || fullscreen) {
              e.preventDefault();
            }
          }}
          onClick={() => {
            const now = Date.now();
            if (now - lastTapRef.current < 320) {
              // Double Tap / Double Click: Rotated 2-Page Spread Fullscreen toggle
              window.getSelection?.()?.removeAllRanges?.();
              toggleFullscreen();
            } else {
              // Single Tap: If in fullscreen, show overlay
              if (fullscreen) {
                triggerOverlay();
              }
              if (floatingVisible) {
                setFloatingVisible(false);
              }
            }
            lastTapRef.current = now;
          }}
        >
          {activeBookLoading ? (
            <BookLoader visible={true} />
          ) : activeBookError ? (
            <div className="reader-load-state error-text" role="alert">
              {activeBookError}
            </div>
          ) : scrollMode ? (
            <div className="reader-scroll" ref={scrollRootRef} onScroll={handleScroll}>
              <div className="pages-wrap">
                {pages.map((_, index) => renderPage(index))}
              </div>
            </div>
          ) : pages.length ? (
            <PageTurn
              key={`${activeBook.id}-${spreadMode ? "spread" : "portrait"}`}
              pages={pages}
              renderPage={(pageIndex) => renderPage(pageIndex, true)}
              spreadMode={spreadMode}
              currentPage={currentPage}
              zoom={1}
              turn={pageTurn}
              isRotated90={fullscreen && isRotatedLandscape}
              onTurnPage={(targetPage) => {
                setCurrentPage(targetPage);
              }}
              onSingleTap={() => {
                if (fullscreen) {
                  triggerOverlay();
                }
                if (floatingVisible) {
                  setFloatingVisible(false);
                }
              }}
              onDoubleTap={() => {
                toggleFullscreen();
              }}
              onTurnComplete={() => {
                completePageTurn();
                setPageTurn(null);
              }}
            />
          ) : (
            <div className="reader-load-state">এই বইয়ে পড়ার মতো কোনো পৃষ্ঠা নেই।</div>
          )}

          {/* Floating Context Menu (matching React Native contextMenu) */}
          {floatingVisible && (
            <div
              className="floating-context-menu"
              style={{
                left: `${floatingPos.x}px`,
                top: `${floatingPos.y}px`,
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {actionMode === "save" && (
                <button
                  type="button"
                  className="floating-menu-btn"
                  onClick={() => {
                    setFloatingVisible(false);
                    setAddNoteModalVisible(true);
                  }}
                >
                  Note
                </button>
              )}

              {actionMode === "delete" && (
                <button
                  type="button"
                  className="floating-menu-btn delete"
                  onClick={() => {
                    handleDeleteNote(selectedHighlightId);
                  }}
                >
                  Delete
                </button>
              )}

              <button
                type="button"
                className="floating-menu-btn cancel"
                onClick={() => setFloatingVisible(false)}
              >
                Cancel
              </button>
            </div>
          )}

          {/* Landscape / Fullscreen Overlay (matching React Native LandscapeOverlay) */}
          {fullscreen && (
            <LandscapeOverlay
              showOverlay={showOverlay}
              zoomActive={false}
              currentLeafIndex={currentLeafIndex}
              totalLeaves={totalLeaves}
              currentPage={currentPage}
              pages={pages}
              isRotated90={fullscreen && isRotatedLandscape}
              onExitFullscreen={toggleFullscreen}
              onLeafChange={(leafIndex) => {
                const target = leafIndex * 2;
                setCurrentPage(Math.max(0, Math.min(target, totalPages - 1)));
              }}
              resetOverlayTimer={resetOverlayTimer}
            />
          )}
        </section>
      </div>

      {/* ========================================= */}
      {/* 3. FOOTER (matching React Native Footer)   */}
      {/* ========================================= */}
      {!fullscreen && (
        <footer className="reader-footer">
          {/* Left group: Prev + Page Indicator */}
          <div className="reader-footer-left-group">
            <button
              type="button"
              className="footer-icon-btn"
              onClick={handlePrev}
              disabled={currentPage <= 0}
              title="Previous Page"
              aria-label="Previous Page"
            >
              <ChevronBackIcon size={24} color={currentPage <= 0 ? "#ccc" : "#3b2f1b"} />
            </button>

            <button
              type="button"
              className="footer-page-btn"
              onClick={() => setJumpModalVisible(true)}
              title="Go To Page"
            >
              {currentPage + 1} / {totalPages}
            </button>
          </div>

          {/* 1. View Saved Notes List Button */}
          <button
            type="button"
            className="footer-icon-btn"
            onClick={() => {
              setSidebarTab("notes");
              setSidebarVisible(true);
            }}
            title="নোটসমূহ"
            aria-label="View Saved Notes"
          >
            <DocumentTextIcon size={22} color="#3b2f1b" />
          </button>

          {/* 2. View Bookmarks List Button */}
          <button
            type="button"
            className="footer-icon-btn"
            onClick={() => {
              setSidebarTab("bookmarks");
              setSidebarVisible(true);
            }}
            title="বুকমার্কস"
            aria-label="View Bookmarks"
          >
            <BookmarksOutlineIcon size={22} color="#3b2f1b" />
          </button>

          {/* 3. Bookmark Current Page Toggle Button */}
          <button
            type="button"
            className="footer-icon-btn"
            onClick={toggleBookmark}
            title={isBookmarked ? "বুকমার্ক সরানো" : "বুকমার্ক যোগ করা"}
            aria-label="Toggle Bookmark"
          >
            {isBookmarked ? (
              <BookmarkFilledIcon size={22} color="#6b4f2d" />
            ) : (
              <BookmarkOutlineIcon size={22} color="#6b4f2d" />
            )}
          </button>

          {/* 4. Add to Booklist Button */}
          <button
            type="button"
            className="footer-icon-btn"
            onClick={() => setBooklistModalVisible(true)}
            title="বুকলিস্টে যোগ করুন"
            aria-label="Add to Booklist"
          >
            <AddCircleOutlineIcon size={22} color="#3b2f1b" />
          </button>

          {/* 5. Next Page Button (on the far right matching React Native footer) */}
          <button
            type="button"
            className="footer-icon-btn"
            onClick={handleNext}
            disabled={currentPage >= totalPages - (spreadMode ? 2 : 1)}
            title="Next Page"
            aria-label="Next Page"
          >
            <ChevronForwardIcon
              size={24}
              color={currentPage >= totalPages - (spreadMode ? 2 : 1) ? "#ccc" : "#3b2f1b"}
            />
          </button>
        </footer>
      )}

      {/* ========================================= */}
      {/* 4. MODALS & OVERLAYS                      */}
      {/* ========================================= */}

      {/* Speed Modal (matching SpeedModal.jsx) */}
      <SpeedModal
        visible={speedModalVisible}
        speedX={speedX}
        setSpeedX={setSpeedX}
        setAutoScrollSpeed={setAutoScrollSpeed}
        onClose={() => setSpeedModalVisible(false)}
      />

      {/* Jump Page Modal (matching JumpPageModal.jsx) */}
      <JumpPageModal
        visible={jumpModalVisible}
        onClose={() => setJumpModalVisible(false)}
        pagesLength={totalPages}
        onJump={handleJumpPage}
      />

      {/* Add Note Modal (matching AddNoteModal.jsx) */}
      <AddNoteModal
        visible={addNoteModalVisible}
        noteTitle={noteTitle}
        setNoteTitle={setNoteTitle}
        noteText={noteText}
        setNoteText={setNoteText}
        selectedText={selectedText}
        onSave={handleSaveNote}
        onCancel={() => {
          setAddNoteModalVisible(false);
          setNoteTitle("");
          setNoteText("");
          setSelectedText("");
          setSelectionData(null);
        }}
      />

      {/* Chapter Sidebar: Chapters, Bookmarks, Notes (matching ChapterSidebar.jsx) */}
      <ChapterSidebar
        visible={sidebarVisible}
        activeTab={sidebarTab}
        setActiveTab={setSidebarTab}
        onClose={() => setSidebarVisible(false)}
        chapters={parsed.chapters}
        bookmarks={bookmarks}
        notes={bookNotes}
        jumpToPage={handleJumpPage}
        onDeleteNote={handleDeleteNote}
        onRemoveBookmark={removeBookmark}
      />

      {/* Booklist Modal (matching BooklistModal.jsx) */}
      <BooklistModal
        visible={booklistModalVisible}
        onClose={() => setBooklistModalVisible(false)}
        booklists={library.booklists}
        bookId={activeBook.id}
        onCreateBooklist={createBooklist}
        onToggleBooklist={toggleBookInList}
      />

      {/* Toast notification */}
      {toast && <div className="toast">{toast}</div>}
    </main>
  );
}
