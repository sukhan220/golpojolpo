"use client";

import { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import PageTurn from "../components/PageTurn";
import { subscribeToReaderBooks } from "../lib/firebase";

const STORAGE_KEY = "golpojolpo.reader.web.v1";
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
  { name: "বই", background: "#e0d8c3", page: "#fdfaf1", text: "#2c1e0f", highlight: "#ffe58a" },
  { name: "কাগজ", background: "#d6d1c7", page: "#f4f1ea", text: "#2c2c2c", highlight: "#ffe58a" },
  { name: "সেপিয়া", background: "#c5b08b", page: "#e9dcc9", text: "#433422", highlight: "#e6bd69" },
  { name: "রাত", background: "#121212", page: "#1f1f1f", text: "#d0ccc5", highlight: "#665000" },
];

const FONTS = [
  ["Tiro Bangla", '"Tiro Bangla", serif'],
  ["Anek Bangla", '"Anek Bangla", sans-serif'],
  ["Noto Sans Bengali", '"Noto Sans Bengali", sans-serif'],
  ["Serif", "Georgia, serif"],
  ["Sans-serif", "Arial, sans-serif"],
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
  const rawPages = text.split(/---page---/i);
  const chapters = [];
  const pages = rawPages.map((rawPage, index) => {
    const chapterMatch = rawPage.match(/---chapter:\s*(.*?)---/i);
    if (chapterMatch) chapters.push({ title: chapterMatch[1].trim(), pageIndex: index });
    return rawPage.replace(/---chapter:\s*.*?---/i, "").trim();
  });
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
    console.warn("Ignoring an invalid URL in book HTML.", error);
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

  return createElement(tagName, props, ...(
    HTML_READER_VOID_TAGS.has(tagName) ? [] : children
  ));
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
    const matches = notes.map((note) => {
      const ref = note.ref || {};
      if (Number.isInteger(ref.startOffset) && Number.isInteger(ref.endOffset)) {
        const pageStart = pageIndex === ref.startPage ? ref.startOffset : 0;
        const pageEnd = pageIndex === ref.endPage ? ref.endOffset : Number.POSITIVE_INFINITY;
        const start = Math.max(cursor, pageStart - paragraphOffset);
        const end = Math.min(text.length, pageEnd - paragraphOffset);
        return start < end && start < text.length
          ? { note, start, end }
          : null;
      }
      const index = ref.text ? text.indexOf(ref.text, cursor) : -1;
      return index >= 0 ? { note, start: index, end: index + ref.text.length } : null;
    }).filter(Boolean).sort((first, second) => first.start - second.start);
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
          onHighlightClick(match.note.id, event.clientX, event.clientY);
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
      // Markdown image URLs are user-provided and don't have build-time dimensions.
      // eslint-disable-next-line @next/next/no-img-element
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

function AppIcon({ children }) {
  return <span className="icon" aria-hidden="true">{children}</span>;
}

export default function ReaderApp() {
  const [books, setBooks] = useState([DEMO_BOOK]);
  const [databaseBooks, setDatabaseBooks] = useState([]);
  const [databaseLoading, setDatabaseLoading] = useState(true);
  const [databaseError, setDatabaseError] = useState("");
  const [library, setLibrary] = useState({ history: {}, bookmarks: {}, notes: {}, booklists: {} });
  const [activeBookId, setActiveBookId] = useState(null);
  const [hydrated, setHydrated] = useState(false);
  const [storageError, setStorageError] = useState("");
  const [importError, setImportError] = useState("");
  const [urlInput, setUrlInput] = useState("");
  const [urlLoading, setUrlLoading] = useState(false);

  const [currentPage, setCurrentPage] = useState(0);
  const [scrollMode, setScrollMode] = useState(false);
  const [spreadMode, setSpreadMode] = useState(false);
  const [pageTurn, setPageTurn] = useState(null);
  const [fontSize, setFontSize] = useState(18);
  const [fontFamily, setFontFamily] = useState(FONTS[0][1]);
  const [zoom, setZoom] = useState(1);
  const [themeIndex, setThemeIndex] = useState(0);
  const [autoScroll, setAutoScroll] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [fullscreen, setFullscreen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(false);
  const [panel, setPanel] = useState("");
  const [jumpInput, setJumpInput] = useState("");
  const [listName, setListName] = useState("");
  const [selectedText, setSelectedText] = useState("");
  const [selectedPage, setSelectedPage] = useState(0);
  const [selectionData, setSelectionData] = useState(null);
  const [selectedHighlightId, setSelectedHighlightId] = useState(null);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteContent, setNoteContent] = useState("");
  const [selectionPoint, setSelectionPoint] = useState(null);
  const [toast, setToast] = useState("");
  const [bookContent, setBookContent] = useState({ id: "", text: "", loading: false, error: "" });
  const readerRootRef = useRef(null);
  const fileInputRef = useRef(null);
  const scrollRootRef = useRef(null);
  const saveTimerRef = useRef(null);
  const pinchDistanceRef = useRef(0);
  const touchStartRef = useRef(null);
  const lastTouchTapRef = useRef(null);
  const lastTouchToggleAtRef = useRef(0);
  const controlsTimerRef = useRef(null);
  const previousSpreadModeRef = useRef(null);
  const usingCssFullscreenRef = useRef(false);
  const pageTurnRef = useRef(null);
  const pageTurnTimerRef = useRef(null);
  const scrollRestoreRef = useRef(null);
  const currentPageRef = useRef(currentPage);

  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  useEffect(() => {
    const timer = setTimeout(() => {
      const saved = readSavedData();
      setBooks(saved.books);
      setLibrary(saved.library);
      setHydrated(true);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

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

  useEffect(() => {
    if (!hydrated) return;
    let timer;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ books, library }));
      if (storageError) timer = setTimeout(() => setStorageError(""), 0);
    } catch (error) {
      console.error("Could not save reader data to local storage.", error);
      timer = setTimeout(() => setStorageError("এই ব্রাউজারে সংরক্ষণের জায়গা শেষ বা অনুপলব্ধ। বইয়ের তথ্য export করে রাখুন।"), 0);
    }
    return () => clearTimeout(timer);
  }, [books, library, hydrated, storageError]);

  const allBooks = useMemo(() => [...databaseBooks, ...books], [databaseBooks, books]);
  const activeBook = allBooks.find((book) => book.id === activeBookId) || null;
  const activeBookText = activeBook?.text;
  const activeBookFileUrl = activeBook?.fileUrl;
  const currentText = activeBookText || (bookContent.id === activeBook?.id ? bookContent.text : "");
  const parsed = useMemo(
    () => (activeBook && currentText ? splitBook(currentText, activeBook.title) : { pages: [], chapters: [] }),
    [activeBook, currentText],
  );
  const pages = parsed.pages;
  const theme = THEMES[themeIndex];
  const bookNotes = activeBook ? library.notes[activeBook.id] || [] : [];
  const bookmarks = activeBook ? library.bookmarks[activeBook.id] || [] : [];
  const totalPages = pages.length;
  const pageLabel = totalPages ? `${currentPage + 1} / ${totalPages}` : "0 / 0";
  const activeBookLoading = Boolean(activeBook && !activeBookText
    && (bookContent.id !== activeBook.id || bookContent.loading));
  const activeBookError = activeBook && bookContent.id === activeBook.id ? bookContent.error : "";

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

  useEffect(() => () => {
    clearTimeout(pageTurnTimerRef.current);
    clearTimeout(controlsTimerRef.current);
    pageTurnRef.current = null;
  }, []);

  const revealFullscreenControls = () => {
    setControlsVisible(true);
    clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => setControlsVisible(false), 3500);
  };

  const openBook = (bookId) => {
    const book = allBooks.find((item) => item.id === bookId);
    if (!book) return;
    cancelPageTurn();
    setPageTurn(null);
    const history = library.history[bookId];
    const pageCount = book.text ? splitBook(book.text, book.title).pages.length : history?.total || 1;
    setCurrentPage(Math.min(Math.max(history?.page || 0, 0), Math.max(pageCount - 1, 0)));
    setScrollMode(Boolean(history?.scrollMode));
    setSpreadMode(Boolean(history?.spreadMode));
    setAutoScroll(false);
    scrollRestoreRef.current = history ? { y: history.scrollY, page: history.page } : null;
    setActiveBookId(bookId);
  };

  useEffect(() => {
    if (!activeBookId || activeBookText) return undefined;

    const abortController = new AbortController();
    const timer = setTimeout(() => {
      if (!activeBookFileUrl) {
        setBookContent({ id: activeBookId, text: "", loading: false, error: "এই বইয়ের fileUrl নেই। Firebase shortStory ডকুমেন্টে fileUrl যোগ করুন।" });
        return;
      }
      setBookContent({ id: activeBookId, text: "", loading: true, error: "" });
      fetch(activeBookFileUrl, { signal: abortController.signal })
        .then((response) => {
          if (!response.ok) throw new Error(`বইয়ের ফাইল লোড ব্যর্থ (HTTP ${response.status})`);
          return response.text();
        })
        .then((text) => {
          if (!text.trim()) throw new Error("বইয়ের ফাইলটি খালি।");
          setBookContent({ id: activeBookId, text, loading: false, error: "" });
        })
        .catch((error) => {
          if (error.name === "AbortError") return;
          console.error("Could not load the Firebase book file.", error);
          setBookContent({
            id: activeBookId,
            text: "",
            loading: false,
            error: error.message?.includes("fetch")
              ? "বইয়ের ফাইল লোড করা যাচ্ছে না। ফাইল সার্ভারে CORS অনুমতি দিন, অথবা fileUrl যাচাই করুন।"
              : error.message || "বইয়ের ফাইল লোড করা যায়নি।",
          });
        });
    }, 0);
    return () => {
      clearTimeout(timer);
      abortController.abort();
    };
  }, [activeBookId, activeBookFileUrl, activeBookText]);

  const saveHistory = useCallback((page, scrollY = 0) => {
    if (!activeBook) return;
    setLibrary((current) => ({
      ...current,
      history: {
        ...current.history,
        [activeBook.id]: {
          page,
          scrollY,
          scrollMode,
          spreadMode,
          total: pages.length,
          type: "reader",
          sourceType: activeBook.sourceCollection || "local",
          lastReadAt: Date.now(),
        },
      },
    }));
  }, [activeBook, pages.length, scrollMode, spreadMode]);

  useEffect(() => {
    if (!activeBook || !scrollMode) return undefined;
    const frame = requestAnimationFrame(() => {
      const restore = scrollRestoreRef.current;
      if (restore?.y) {
        scrollRootRef.current?.scrollTo({ top: restore.y, behavior: "auto" });
      } else {
        const page = scrollRootRef.current?.querySelector(`[data-reader-page="${currentPageRef.current}"]`);
        if (page) scrollRootRef.current.scrollTo({ top: page.offsetTop, behavior: "auto" });
      }
      scrollRestoreRef.current = null;
    });
    return () => cancelAnimationFrame(frame);
  }, [activeBookId, scrollMode, activeBook]);

  useEffect(() => {
    if (!activeBook || !hydrated || !pages.length || bookContent.loading) return;
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveHistory(currentPage, scrollMode ? scrollRootRef.current?.scrollTop || 0 : 0);
    }, 450);
    return () => clearTimeout(saveTimerRef.current);
  }, [activeBook, currentPage, scrollMode, hydrated, saveHistory, pages.length, bookContent.loading]);

  useEffect(() => {
    if (!autoScroll || !scrollMode) return undefined;
    const timer = setInterval(() => {
      scrollRootRef.current?.scrollBy({ top: 0.4 * speed, behavior: "auto" });
    }, 50);
    return () => clearInterval(timer);
  }, [autoScroll, scrollMode, speed]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(""), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

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
    setScrollMode(false);
    setImportError("");
    setPanel("");
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

  const goToPage = useCallback((index) => {
    const target = Math.max(0, Math.min(Number(index) || 0, totalPages - 1));
    if (target === currentPage || pageTurnRef.current) {
      setPanel("");
      return;
    }
    if (scrollMode) {
      setCurrentPage(target);
      const element = document.querySelector(`[data-reader-page="${target}"]`);
      if (element && scrollRootRef.current) {
        scrollRootRef.current.scrollTo({ top: element.offsetTop, behavior: "smooth" });
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
        }, 1000);
      } else {
        setCurrentPage(target);
      }
    }
    setPanel("");
  }, [completePageTurn, currentPage, scrollMode, spreadMode, totalPages]);

  const goNext = useCallback(() => goToPage(currentPage + (spreadMode ? 2 : 1)), [currentPage, spreadMode, goToPage]);
  const goPrevious = useCallback(() => goToPage(currentPage - (spreadMode ? 2 : 1)), [currentPage, spreadMode, goToPage]);

  const handleSelection = () => {
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    const rawText = selection.toString();
    const text = rawText.trim();
    if (!text) return;
    const startNode = (range.startContainer.nodeType === Node.TEXT_NODE
      ? range.startContainer.parentElement
      : range.startContainer).closest("[data-reader-page]");
    const endNode = (range.endContainer.nodeType === Node.TEXT_NODE
      ? range.endContainer.parentElement
      : range.endContainer).closest("[data-reader-page]");
    if (!startNode || !endNode) return;

    const trimStart = rawText.length - rawText.trimStart().length;
    const trimEnd = rawText.length - rawText.trimEnd().length;
    const startPage = Number(startNode.dataset.readerPage);
    const endPage = Number(endNode.dataset.readerPage);
    const startOffset = textOffsetWithin(startNode, range.startContainer, range.startOffset) + trimStart;
    const endOffset = textOffsetWithin(endNode, range.endContainer, range.endOffset) - trimEnd;
    setSelectedText(text);
    setSelectedPage(startPage);
    setSelectionData({ startPage, endPage, startOffset, endOffset });
    setSelectedHighlightId(null);
    const rect = range.getBoundingClientRect();
    setSelectionPoint({ x: Math.min(window.innerWidth - 160, Math.max(16, rect.left)), y: Math.max(72, rect.top - 52) });
  };

  const saveNote = (event) => {
    event.preventDefault();
    if (!activeBook || !selectedText || !selectionData) return;
    const note = {
      id: `${Date.now()}`,
      title: noteTitle.trim() || "নোট",
      content: noteContent.trim(),
      ref: { text: selectedText, page: selectedPage, ...selectionData },
    };
    setLibrary((current) => ({
      ...current,
      notes: { ...current.notes, [activeBook.id]: [...(current.notes[activeBook.id] || []), note] },
    }));
    setPanel("");
    setNoteTitle("");
    setNoteContent("");
    setSelectedText("");
    setSelectionData(null);
    setSelectionPoint(null);
    window.getSelection()?.removeAllRanges();
    setToast("নোট ও হাইলাইট সংরক্ষণ করা হয়েছে");
  };

  const removeNote = (noteId) => {
    if (!activeBook) return;
    setLibrary((current) => ({
      ...current,
      notes: { ...current.notes, [activeBook.id]: (current.notes[activeBook.id] || []).filter((note) => note.id !== noteId) },
    }));
    setSelectedHighlightId(null);
    setSelectionPoint(null);
  };

  const toggleBookmark = () => {
    if (!activeBook) return;
    const exists = bookmarks.includes(currentPage);
    setLibrary((current) => ({
      ...current,
      bookmarks: {
        ...current.bookmarks,
        [activeBook.id]: exists ? bookmarks.filter((page) => page !== currentPage) : [...bookmarks, currentPage].sort((a, b) => a - b),
      },
    }));
    setToast(exists ? "বুকমার্ক সরানো হয়েছে" : "বুকমার্ক যোগ করা হয়েছে");
  };

  const toggleFullscreen = async () => {
    const nextFullscreen = !fullscreen;
    setFullscreen(nextFullscreen);
    clearTimeout(controlsTimerRef.current);
    setControlsVisible(false);
    const isMobile = window.matchMedia("(max-width: 640px)").matches;
    try {
      if (nextFullscreen) {
        if (isMobile) {
          previousSpreadModeRef.current = spreadMode;
          setSpreadMode(true);
        }
        await readerRootRef.current?.requestFullscreen?.();
        if (isMobile && window.matchMedia("(orientation: portrait)").matches) {
          const orientation = window.screen.orientation;
          if (typeof orientation?.lock !== "function") throw new Error("Screen orientation lock is unavailable.");
          await orientation.lock("landscape");
          if (window.matchMedia("(orientation: portrait)").matches) {
            throw new Error("The browser did not rotate to landscape.");
          }
        }
      } else if (document.fullscreenElement) {
        await document.exitFullscreen();
      }
    } catch (error) {
      console.info("Using the reader's landscape full-screen layout because browser orientation/fullscreen locking is unavailable.", error);
      if (isMobile && nextFullscreen && window.matchMedia("(orientation: portrait)").matches) {
        usingCssFullscreenRef.current = true;
        if (document.fullscreenElement) {
          try {
            await document.exitFullscreen();
          } catch (exitError) {
            console.warn("Could not leave browser fullscreen before applying the mobile layout.", exitError);
          }
        }
      }
    }
    if (!nextFullscreen && previousSpreadModeRef.current !== null) {
      usingCssFullscreenRef.current = false;
      setSpreadMode(previousSpreadModeRef.current);
      previousSpreadModeRef.current = null;
      try {
        window.screen.orientation?.unlock?.();
      } catch (error) {
        console.info("Could not unlock screen orientation.", error);
      }
    }
  };

  useEffect(() => {
    const handleFullscreen = () => {
      if (document.fullscreenElement) {
        setFullscreen(true);
        return;
      }
      if (usingCssFullscreenRef.current) return;
      setFullscreen(false);
      setControlsVisible(false);
      clearTimeout(controlsTimerRef.current);
      if (previousSpreadModeRef.current !== null) {
        setSpreadMode(previousSpreadModeRef.current);
        previousSpreadModeRef.current = null;
      }
      try {
        window.screen.orientation?.unlock?.();
      } catch (error) {
        console.info("Could not unlock screen orientation.", error);
      }
    };
    document.addEventListener("fullscreenchange", handleFullscreen);
    return () => document.removeEventListener("fullscreenchange", handleFullscreen);
  }, []);

  useEffect(() => {
    if (!activeBook) return undefined;
    const handleKey = (event) => {
      if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement) return;
      if (event.key === "ArrowRight") goNext();
      if (event.key === "ArrowLeft") goPrevious();
      if (event.key === "Escape") setPanel("");
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [activeBook, goNext, goPrevious]);

  const createBooklist = (event) => {
    event.preventDefault();
    if (!listName.trim()) return;
    const id = `${Date.now()}`;
    setLibrary((current) => ({
      ...current,
      booklists: { ...current.booklists, [id]: { title: listName.trim(), items: [activeBook.id] } },
    }));
    setListName("");
    setToast("বুকলিস্ট তৈরি হয়েছে এবং বইটি যোগ হয়েছে");
  };

  const toggleBookInList = (id) => {
    setLibrary((current) => {
      const list = current.booklists[id];
      const contains = list.items.includes(activeBook.id);
      return {
        ...current,
        booklists: {
          ...current.booklists,
          [id]: { ...list, items: contains ? list.items.filter((item) => item !== activeBook.id) : [...list.items, activeBook.id] },
        },
      };
    });
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
    setActiveBookId(null);
    setPanel("");
    setScrollMode(false);
    setZoom(1);
  };

  if (!hydrated) return <main className="loading-screen">পাঠক প্রস্তুত হচ্ছে…</main>;

  if (!activeBook) {
    return (
      <main className="library-screen">
        <header className="landing-header">
          <a href="#" className="brand" onClick={(event) => event.preventDefault()}>
            <span className="brand-mark">গ</span>
            <span>গল্পজল্প <small>পাঠক</small></span>
          </a>
          <button className="button button-quiet" onClick={exportLibrary}>Backup export</button>
        </header>
        <section className="welcome">
          <div className="welcome-copy">
            <span className="eyebrow">আপনার ব্যক্তিগত পাঠাগার</span>
            <h1>প্রতিটি বইয়ের<br /><em>নিজস্ব একটা জগৎ।</em></h1>
            <p>TXT বা Markdown বই খুলুন, পড়ার জায়গা সংরক্ষণ করুন, আর ভালো লাগা লাইনগুলো নোটে রাখুন।</p>
            <div className="welcome-actions">
              <button className="button button-primary" onClick={() => fileInputRef.current?.click()}><AppIcon>＋</AppIcon> বই আপলোড করুন</button>
              <button className="button button-quiet" onClick={() => openBook(DEMO_BOOK.id)}>নমুনা বই পড়ুন <span>→</span></button>
            </div>
            <input ref={fileInputRef} className="visually-hidden" type="file" accept=".txt,.md,.text,text/plain,text/markdown" onChange={importFile} />
          </div>
          <div className="book-art" aria-hidden="true"><div className="art-sun" /><div className="art-river" /><div className="art-book"><span>গল্পজল্প</span><strong>পড়ার<br />গল্প</strong><small>একটি বই, অনেকগুলো পৃষ্ঠা</small></div></div>
        </section>
        <section className="library-content">
          <div className="section-heading"><div><span className="eyebrow">শুরু করুন</span><h2>বইয়ের তাক</h2></div><span className="muted">{allBooks.length}টি বই</span></div>
          {databaseLoading && <p className="muted database-status">Firebase-এর বই খোঁজা হচ্ছে…</p>}
          {databaseError && <p className="error-banner" role="alert">{databaseError}</p>}
          {importError && <p className="error-banner" role="alert">{importError}</p>}
          {storageError && <p className="error-banner" role="alert">{storageError}</p>}
          <form className="url-form" onSubmit={importUrl}>
            <span aria-hidden="true">↗</span>
            <input value={urlInput} onChange={(event) => setUrlInput(event.target.value)} placeholder="অথবা .txt / .md ফাইলের সরাসরি URL দিন" type="url" aria-label="Book URL" />
            <button className="button button-quiet" disabled={urlLoading}>{urlLoading ? "আনা হচ্ছে…" : "URL থেকে খুলুন"}</button>
          </form>
          <div className="book-grid">
            {allBooks.map((book, index) => {
              const progress = library.history[book.id];
              const percent = progress?.total ? Math.round(((progress.page + 1) / progress.total) * 100) : 0;
              return (
                <button className={`book-card book-tone-${index % 4}`} key={book.id} onClick={() => openBook(book.id)}>
                  <span className="card-book" style={book.artwork ? { backgroundImage: `linear-gradient(180deg, #21190a40, #21190ac9), url("${book.artwork}")`, backgroundSize: "cover", backgroundPosition: "center" } : undefined}>
                    <span className="card-book-label">{book.title}</span>
                    <span className="card-book-author">{book.author || "গল্পজল্প পাঠক"}</span>
                  </span>
                  <span className="card-meta">
                    <strong>{book.title}</strong>
                    <small>{progress ? `${percent}% পড়া হয়েছে` : book.text ? `${splitBook(book.text, book.title).pages.length} পৃষ্ঠা` : book.source === "firestore" ? book.writer || "অনলাইন বই" : "স্থানীয় বই"}</small>
                  </span>
                </button>
              );
            })}
          </div>
          {Object.keys(library.booklists).length > 0 && (
            <div className="saved-lists"><h3>আপনার বুকলিস্ট</h3>{Object.values(library.booklists).map((list) => <span className="list-chip" key={list.title}>{list.title} · {list.items.length}</span>)}</div>
          )}
        </section>
        <footer className="landing-footer"><span>আপনার পড়ার জায়গা ও নোট এই ব্রাউজারেই সংরক্ষিত থাকে।</span><button onClick={exportLibrary}>তথ্যের backup নিন</button></footer>
      </main>
    );
  }

  const visibleIndices = scrollMode
    ? pages.map((_, index) => index)
    : spreadMode
      ? [currentPage, currentPage + 1].filter((index) => index < totalPages)
      : [currentPage];

  const handleHighlightClick = (noteId, x, y) => {
    setSelectedHighlightId(noteId);
    setSelectedText("");
    setSelectionData(null);
    setSelectionPoint({ x: Math.min(window.innerWidth - 160, Math.max(16, x)), y: Math.max(72, y - 52) });
  };

  const renderPage = (pageIndex, flipMode = false) => {
    const pageText = pages[pageIndex] || "";
    const htmlContent = renderBookHtml(pageText, activeBookFileUrl);
    const paragraphs = htmlContent ? [] : pageText.split(/\n+/).filter((line) => line.trim());
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
        return startOffset < 0 ? note : {
          ...note,
          ref: { ...note.ref, page: pageIndex, startPage: pageIndex, endPage: pageIndex, startOffset, endOffset: startOffset + note.ref.text.length },
        };
      });
    let paragraphOffset = 0;
    return (
      <article
        className={`reader-page${flipMode ? " flip-reader-page" : ""}`}
        data-reader-page={pageIndex}
        key={`${activeBook.id}-${pageIndex}`}
        onMouseUp={handleSelection}
        onKeyUp={handleSelection}
        onTouchEnd={handleSelection}
        style={{ backgroundColor: theme.page, color: theme.text, fontFamily, fontSize: `${fontSize}px` }}
      >
        <div className="page-content">
          {htmlContent
            ? <div className="book-html-content">{htmlContent}</div>
            : paragraphs.length
            ? paragraphs.map((paragraph, paragraphIndex) => {
                const offset = paragraphOffset;
                paragraphOffset += paragraph.length;
                return (
                  <p key={`${pageIndex}-${paragraphIndex}`}>
                    {renderMarkdownParagraph(paragraph, notesOnPage, theme.highlight, pageIndex, offset, handleHighlightClick, activeBookFileUrl)}
                  </p>
                );
              })
            : <p className="empty-page">এই পৃষ্ঠাটি ফাঁকা।</p>}
        </div>
        <span className="page-number">{pageIndex + 1}</span>
      </article>
    );
  };

  const handleScroll = () => {
    if (!scrollRootRef.current) return;
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
    setCurrentPage((current) => current === nearest ? current : nearest);
  };

  const panelTitle = {
    chapters: "সূচিপত্র",
    bookmarks: "বুকমার্ক",
    notes: "নোট ও হাইলাইট",
    booklists: "বুকলিস্ট",
    jump: "পৃষ্ঠায় যান",
    note: "নতুন নোট",
  }[panel];

  return (
    <main ref={readerRootRef} className={`reader-app${fullscreen ? " is-fullscreen" : ""}${controlsVisible ? " controls-visible" : ""}`} style={{ "--reader-bg": theme.background, "--reader-page": theme.page, "--reader-text": theme.text, "--reader-highlight": theme.highlight }}>
      <header className="reader-header">
        <button className="back-button" onClick={closeReader} aria-label="Back to library"><span>←</span><span className="back-label">পাঠাগার</span></button>
        <div className="reader-title"><strong>{activeBook.title}</strong><span>{parsed.chapters.filter((chapter) => chapter.pageIndex <= currentPage).at(-1)?.title || "পড়া চলছে"}</span></div>
        <div className="reader-tools">
          <button className="tool-button zoom-button" onClick={() => setZoom((value) => Math.max(1, Number((value - 0.1).toFixed(1))))} aria-label="Zoom out">−</button>
          <span className="font-size-value zoom-value">{Math.round(zoom * 100)}%</span>
          <button className="tool-button zoom-button" onClick={() => setZoom((value) => Math.min(2, Number((value + 0.1).toFixed(1))))} aria-label="Zoom in">＋</button>
          <button className="tool-button" onClick={() => setFontSize((size) => Math.max(12, size - 1))} aria-label="Decrease font size">A−</button>
          <span className="font-size-value">{fontSize}</span>
          <button className="tool-button" onClick={() => setFontSize((size) => Math.min(32, size + 1))} aria-label="Increase font size">A＋</button>
          <select className="font-select" value={fontFamily} onChange={(event) => setFontFamily(event.target.value)} aria-label="Font family">
            {FONTS.map(([name, value]) => <option value={value} key={name}>{name}</option>)}
          </select>
          <button className="tool-button theme-button" onClick={() => setThemeIndex((index) => (index + 1) % THEMES.length)} title="থিম বদলান"><span className={`theme-dot theme-${themeIndex}`} />{theme.name}</button>
          <button className={`tool-button${fullscreen ? " active" : ""}`} onClick={toggleFullscreen} title="Fullscreen"><AppIcon>⛶</AppIcon></button>
        </div>
      </header>

      <div className="reader-body">
        <aside className="reader-rail">
          <div className="rail-actions">
            <button onClick={() => setPanel("chapters")} title="সূচিপত্র"><AppIcon>☷</AppIcon><span>সূচি</span></button>
            <button onClick={() => setPanel("bookmarks")} title="বুকমার্ক"><AppIcon>♧</AppIcon><span>চিহ্ন</span></button>
            <button onClick={() => setPanel("notes")} title="নোট"><AppIcon>▤</AppIcon><span>নোট</span><small>{bookNotes.length || ""}</small></button>
            <button onClick={() => setPanel("booklists")} title="বুকলিস্ট"><AppIcon>＋</AppIcon><span>তালিকা</span></button>
          </div>
          <div className="rail-bottom"><span className="progress-mini">{Math.round(((currentPage + 1) / Math.max(totalPages, 1)) * 100)}%</span><span>পড়া</span></div>
        </aside>

        <section className={`reader-stage${scrollMode ? " scroll-mode" : " page-mode"}${spreadMode && !scrollMode ? " spread-mode" : ""}`} onDoubleClick={() => {
          if (Date.now() - lastTouchToggleAtRef.current > 700) toggleFullscreen();
        }} onTouchStart={(event) => {
          if (event.touches.length === 2) {
            touchStartRef.current = null;
            lastTouchTapRef.current = null;
            const [first, second] = event.touches;
            pinchDistanceRef.current = Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
          } else if (event.touches.length === 1) {
            const touch = event.touches[0];
            touchStartRef.current = { x: touch.clientX, y: touch.clientY, at: Date.now() };
          }
        }} onTouchMove={(event) => {
          if (event.touches.length !== 2 || !pinchDistanceRef.current) return;
          const [first, second] = event.touches;
          const distance = Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
          if (Math.abs(distance - pinchDistanceRef.current) > 36) {
            setZoom((value) => Math.min(2, Math.max(1, Number((value + (distance > pinchDistanceRef.current ? 0.1 : -0.1)).toFixed(1)))));
            pinchDistanceRef.current = distance;
          }
        }} onTouchEnd={(event) => {
          pinchDistanceRef.current = 0;
          const start = touchStartRef.current;
          const touch = event.changedTouches[0];
          touchStartRef.current = null;
          if (!start || !touch) return;
          const deltaX = touch.clientX - start.x;
          const deltaY = touch.clientY - start.y;
          const duration = Date.now() - start.at;
          if (duration <= 350 && Math.abs(deltaX) < 12 && Math.abs(deltaY) < 12) {
            const previousTap = lastTouchTapRef.current;
            const isDoubleTap = previousTap
              && Date.now() - previousTap.at <= 350
              && Math.hypot(touch.clientX - previousTap.x, touch.clientY - previousTap.y) < 40;
            if (isDoubleTap) {
              lastTouchTapRef.current = null;
              lastTouchToggleAtRef.current = Date.now();
              toggleFullscreen();
              return;
            }
            lastTouchTapRef.current = { x: touch.clientX, y: touch.clientY, at: Date.now() };
            if (fullscreen) revealFullscreenControls();
          } else {
            lastTouchTapRef.current = null;
          }
          if (fullscreen) return;
          if (scrollMode || zoom !== 1) return;
          if (Math.abs(deltaX) > 70 && Math.abs(deltaX) > Math.abs(deltaY) * 1.3) {
            if (deltaX < 0) goNext();
            else goPrevious();
          }
        }} onTouchCancel={() => {
          touchStartRef.current = null;
          pinchDistanceRef.current = 0;
          lastTouchTapRef.current = null;
        }}>
          {activeBookLoading ? <div className="reader-load-state" role="status">বইয়ের পৃষ্ঠা আনা হচ্ছে…</div> : activeBookError ? <div className="reader-load-state error-text" role="alert">{activeBookError}</div> : scrollMode ? (
            <div className="reader-scroll" ref={scrollRootRef} onScroll={handleScroll}>
              <div className="pages-wrap" style={{ zoom }}>{visibleIndices.map((pageIndex) => renderPage(pageIndex))}</div>
            </div>
          ) : pages.length ? (
            <PageTurn
              key={`${activeBook.id}-${spreadMode ? "spread" : "portrait"}`}
              pages={pages}
              renderPage={(pageIndex) => renderPage(pageIndex, true)}
              spreadMode={spreadMode}
              currentPage={currentPage}
              zoom={zoom}
              turn={pageTurn}
              onTurnComplete={() => {
                completePageTurn();
                setPageTurn(null);
              }}
            />
          ) : <div className="reader-load-state">এই বইয়ে পড়ার মতো কোনো পৃষ্ঠা নেই।</div>}
          {!scrollMode && pages.length > 0 && !activeBookLoading && !activeBookError && <button className="page-arrow page-arrow-left" onClick={goPrevious} disabled={currentPage <= 0} aria-label="Previous page">‹</button>}
          {!scrollMode && pages.length > 0 && !activeBookLoading && !activeBookError && <button className="page-arrow page-arrow-right" onClick={goNext} disabled={currentPage >= totalPages - (spreadMode ? 2 : 1)} aria-label="Next page">›</button>}
          {selectionPoint && selectedText && <div className="selection-action" style={{ left: selectionPoint.x, top: selectionPoint.y }}><button onMouseDown={(event) => event.preventDefault()} onClick={() => { setPanel("note"); setSelectionPoint(null); }}>✎ নোট যোগ করুন</button><button onClick={() => { setSelectedText(""); setSelectionData(null); setSelectionPoint(null); window.getSelection()?.removeAllRanges(); }}>×</button></div>}
          {selectionPoint && selectedHighlightId && <div className="selection-action" style={{ left: selectionPoint.x, top: selectionPoint.y }}><button onMouseDown={(event) => event.preventDefault()} onClick={() => removeNote(selectedHighlightId)}>নোট ও হাইলাইট মুছুন</button><button onClick={() => { setSelectedHighlightId(null); setSelectionPoint(null); }}>×</button></div>}
          {scrollMode && autoScroll && <span className="auto-scroll-indicator">অটোস্ক্রল চলছে</span>}
        </section>
      </div>

      <footer className="reader-footer">
        <div className="footer-left">
          <button className={`footer-button${scrollMode ? " selected" : ""}`} onClick={() => { cancelPageTurn(); setPageTurn(null); setScrollMode((mode) => !mode); setAutoScroll(false); }}>↕ <span>স্ক্রল</span></button>
          <button className={`footer-button${spreadMode ? " selected" : ""}`} onClick={() => { cancelPageTurn(); setPageTurn(null); setSpreadMode((mode) => !mode); setScrollMode(false); setAutoScroll(false); }}>▤ <span>দুই পৃষ্ঠা</span></button>
          <button className={`footer-button${autoScroll ? " selected" : ""}`} onClick={() => { if (!scrollMode) { cancelPageTurn(); setPageTurn(null); setScrollMode(true); } setAutoScroll((enabled) => !enabled); }}>▷ <span>অটোস্ক্রল</span></button>
          {autoScroll && <label className="speed-control"><span>গতি {speed.toFixed(1)}×</span><input type="range" min="0.5" max="2" step="0.1" value={speed} onChange={(event) => setSpeed(Number(event.target.value))} aria-label="Auto-scroll speed" /></label>}
        </div>
        <div className="page-controls">
          <button onClick={goPrevious} disabled={currentPage <= 0} aria-label="Previous page">←</button>
          <button className="page-count" onClick={() => { setPanel("jump"); setJumpInput(String(currentPage + 1)); }}>{pageLabel}</button>
          <button onClick={goNext} disabled={currentPage >= totalPages - (spreadMode ? 2 : 1)} aria-label="Next page">→</button>
          <input className="progress-range" type="range" min="1" max={Math.max(totalPages, 1)} value={currentPage + 1} onChange={(event) => goToPage(Number(event.target.value) - 1)} aria-label="Reading progress" />
        </div>
        <div className="footer-right">
          <button className={`footer-button${bookmarks.includes(currentPage) ? " selected" : ""}`} onClick={toggleBookmark}>{bookmarks.includes(currentPage) ? "◆" : "◇"} <span>বুকমার্ক</span></button>
          <button className="footer-button" onClick={() => setPanel("notes")}>▤ <span>নোটসমূহ</span></button>
        </div>
      </footer>

      {storageError && <div className="storage-warning" role="alert">{storageError}</div>}
      {toast && <div className="toast" role="status">{toast}</div>}

      {panel && (
        <div className={`panel-scrim${panel === "note" || panel === "jump" ? " centered" : ""}`} onMouseDown={(event) => { if (event.target === event.currentTarget) setPanel(""); }}>
          <section className={`reader-panel${panel === "note" || panel === "jump" ? " dialog-panel" : ""}`} role="dialog" aria-modal="true" aria-label={panelTitle}>
            <div className="panel-heading"><div><span className="eyebrow">গল্পজল্প পাঠক</span><h2>{panelTitle}</h2></div><button className="close-button" onClick={() => setPanel("")} aria-label="Close">×</button></div>

            {panel === "chapters" && <div className="panel-list">{parsed.chapters.map((chapter, index) => <button className="panel-row" key={`${chapter.pageIndex}-${chapter.title}`} onClick={() => goToPage(chapter.pageIndex)}><span className="row-index">{String(index + 1).padStart(2, "0")}</span><span>{chapter.title}</span><small>পৃষ্ঠা {chapter.pageIndex + 1}</small></button>)}</div>}

            {panel === "bookmarks" && <div className="panel-list">{bookmarks.length ? bookmarks.map((page) => <div className="panel-row" key={page}><button className="row-main" onClick={() => goToPage(page)}><span className="row-index">◆</span><span>পৃষ্ঠা {page + 1}</span><small>{parsed.chapters.find((chapter) => chapter.pageIndex <= page)?.title || activeBook.title}</small></button><button className="row-delete" onClick={() => setLibrary((current) => ({ ...current, bookmarks: { ...current.bookmarks, [activeBook.id]: bookmarks.filter((item) => item !== page) } }))} aria-label="Remove bookmark">×</button></div>) : <p className="empty-state">এখনও কোনো বুকমার্ক নেই।</p>}</div>}

            {panel === "notes" && <div className="panel-list">{bookNotes.length ? bookNotes.map((note) => <div className="note-card" key={note.id}><button className="note-open" onClick={() => goToPage(note.ref.page)}><strong>{note.title || "নোট"}</strong><span className="note-quote">“{note.ref.text}”</span>{note.content && <span>{note.content}</span>}<small>পৃষ্ঠা {note.ref.page + 1}</small></button><button className="row-delete" onClick={() => removeNote(note.id)} aria-label="Delete note">×</button></div>) : <p className="empty-state">পড়ার সময় কোনো লাইন নির্বাচন করে নোট যোগ করতে পারবেন।</p>}</div>}

            {panel === "booklists" && <div className="panel-list"><form className="create-list-form" onSubmit={createBooklist}><input value={listName} onChange={(event) => setListName(event.target.value)} placeholder="নতুন বুকলিস্টের নাম" aria-label="New booklist name" /><button className="button button-primary" type="submit">তৈরি</button></form>{Object.entries(library.booklists).map(([id, list]) => <div className="panel-row" key={id}><span>{list.title}</span><button className="list-toggle" onClick={() => toggleBookInList(id)}>{list.items.includes(activeBook.id) ? "✓ যোগ করা" : "+ বই যোগ"}</button></div>)}</div>}

            {panel === "jump" && <form className="jump-form" onSubmit={(event) => { event.preventDefault(); goToPage(Number(jumpInput) - 1); }}><p>মোট {totalPages}টি পৃষ্ঠা</p><label htmlFor="jump-page">পৃষ্ঠা নম্বর</label><input id="jump-page" type="number" min="1" max={totalPages} value={jumpInput} onChange={(event) => setJumpInput(event.target.value)} autoFocus /><button className="button button-primary" type="submit">যান</button></form>}

            {panel === "note" && <form className="note-form" onSubmit={saveNote}><label htmlFor="note-title">শিরোনাম (ঐচ্ছিক)</label><input id="note-title" value={noteTitle} onChange={(event) => setNoteTitle(event.target.value)} placeholder="নোটের শিরোনাম" /><div className="quote-preview">“{selectedText}”<small>পৃষ্ঠা {selectedPage + 1}</small></div><label htmlFor="note-content">আপনার নোট</label><textarea id="note-content" value={noteContent} onChange={(event) => setNoteContent(event.target.value)} placeholder="এই লাইনটি কেন ভালো লাগল?" rows="4" /><div className="dialog-actions"><button type="button" className="button button-quiet" onClick={() => setPanel("")}>বাতিল</button><button className="button button-primary" type="submit">নোট সংরক্ষণ</button></div></form>}
          </section>
        </div>
      )}
    </main>
  );
}
