"use client";

import React, { useEffect, useRef, useState } from "react";
import Header from "../layout/Header";
import { useAudioPlayer, formatTime } from "../../context/AudioPlayerContext";
import {
  HeadphonesIcon,
  HeartIcon,
  ClockIcon,
  NoteIcon,
  PlayIcon,
  PauseIcon,
} from "../Icons";

export default function HomeView({
  categories = [],
  audioBooks = [],
  shortStories = [],
  onOpenBook,
  onOpenShortStory,
  onOpenFullPageFlip,
  onOpenSearch,
  onToggleProfile,
  onSelectCategory,
  onOpenPlaylists,
}) {
  const [activeChip, setActiveChip] = useState(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const viewRef = useRef(null);
  const [showPlaylistsModal, setShowPlaylistsModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showFavoritesModal, setShowFavoritesModal] = useState(false);
  const [showNotesModal, setShowNotesModal] = useState(false);
  const [notesTab, setNotesTab] = useState("notes"); // 'notes' | 'diary' | 'todo'
  const [notesSearch, setNotesSearch] = useState("");
  const [readerStorageData, setReaderStorageData] = useState({
    booklists: {},
    notes: {},
    diaries: [],
    todos: [],
  });
  const [newDiaryTitle, setNewDiaryTitle] = useState("");
  const [newDiaryContent, setNewDiaryContent] = useState("");
  const [isAddingDiary, setIsAddingDiary] = useState(false);
  const [newTodoText, setNewTodoText] = useState("");

  const loadReaderStorage = () => {
    try {
      const raw = localStorage.getItem("golpojolpo.reader.web.v1");
      const parsed = raw ? JSON.parse(raw) : {};
      const lib = parsed.library || {};
      const diariesRaw = localStorage.getItem("golpojolpo_diaries_v1");
      const todosRaw = localStorage.getItem("golpojolpo_todos_v1");
      setReaderStorageData({
        booklists: lib.booklists || {},
        notes: lib.notes || {},
        diaries: diariesRaw ? JSON.parse(diariesRaw) : [],
        todos: todosRaw ? JSON.parse(todosRaw) : [],
      });
    } catch {
      // ignore
    }
  };

  const saveDiaries = (nextDiaries) => {
    setReaderStorageData((prev) => ({ ...prev, diaries: nextDiaries }));
    try {
      localStorage.setItem("golpojolpo_diaries_v1", JSON.stringify(nextDiaries));
    } catch {
      // ignore
    }
  };

  const saveTodos = (nextTodos) => {
    setReaderStorageData((prev) => ({ ...prev, todos: nextTodos }));
    try {
      localStorage.setItem("golpojolpo_todos_v1", JSON.stringify(nextTodos));
    } catch {
      // ignore
    }
  };

  const deleteSavedBookNote = (bookId, noteId) => {
    try {
      const raw = localStorage.getItem("golpojolpo.reader.web.v1");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const lib = parsed.library || {};
      const notesMap = { ...(lib.notes || {}) };
      const existing = notesMap[bookId];
      if (Array.isArray(existing)) {
        notesMap[bookId] = existing.filter((n) => n.id !== noteId);
      } else if (Array.isArray(existing?.quotes)) {
        notesMap[bookId] = {
          ...existing,
          quotes: existing.quotes.filter((n) => n.id !== noteId),
        };
      }
      parsed.library = { ...lib, notes: notesMap };
      localStorage.setItem("golpojolpo.reader.web.v1", JSON.stringify(parsed));
      loadReaderStorage();
    } catch {
      // ignore
    }
  };

  const deleteSavedBooklist = (listId) => {
    try {
      const raw = localStorage.getItem("golpojolpo.reader.web.v1");
      if (!raw) return;
      const parsed = JSON.parse(raw);
      const lib = parsed.library || {};
      const nextLists = { ...(lib.booklists || {}) };
      delete nextLists[listId];
      parsed.library = { ...lib, booklists: nextLists };
      localStorage.setItem("golpojolpo.reader.web.v1", JSON.stringify(parsed));
      loadReaderStorage();
    } catch {
      // ignore
    }
  };

  const {
    currentTrack,
    isPlaying,
    playTrack,
    togglePlay,
    userPlaylists,
    toggleTrackInUserPlaylist,
    historyItems,
    removeHistoryItem,
    audioClips,
    activeClipId,
    playClipSegment,
    removeAudioClip,
    openFullPlayer,
  } = useAudioPlayer();

  const collections = [
    { name: "PlayLists", icon: <HeadphonesIcon /> },
    { name: "Favorites", icon: <HeartIcon /> },
    { name: "History", icon: <ClockIcon /> },
    { name: "Notes", icon: <NoteIcon /> },
  ];

  // Allows smooth horizontal scrolling using mouse wheel on desktop when scrollbar is hidden
  const handleHorizontalWheel = (e) => {
    const container = e.currentTarget;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && container.scrollWidth > container.clientWidth) {
      container.scrollLeft += e.deltaY;
    }
  };

  useEffect(() => {
    const mainEl = viewRef.current?.closest("main");
    if (!mainEl) return undefined;

    let rafId = null;
    const handleScroll = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const top = mainEl.scrollTop;
        setIsScrolled((prev) => {
          if (!prev && top > 90) return true;
          if (prev && top < 70) return false;
          return prev;
        });
      });
    };

    handleScroll();
    mainEl.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      mainEl.removeEventListener("scroll", handleScroll);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, []);

  const handleCollectionClick = (name) => {
    if (name === "PlayLists") {
      if (typeof onOpenPlaylists === "function") {
        onOpenPlaylists();
      } else {
        setShowPlaylistsModal(true);
      }
    } else if (name === "History") {
      setShowHistoryModal(true);
    } else if (name === "Favorites") {
      loadReaderStorage();
      setShowFavoritesModal(true);
    } else if (name === "Notes") {
      loadReaderStorage();
      setShowNotesModal(true);
    }
  };

  return (
    <div ref={viewRef} className="view">
      {/* 1. Sticky Top Bar: Navbar + Compact Collection Icons (appear on scroll) + Category Chips */}
      <div className={`sticky-page-header home-sticky-header${isScrolled ? " is-scrolled" : ""}`}>
        <div className="home-sticky-top-row">
          {/* Compact Collection Icon Bar (appears neatly on the left when scrolled) */}
          <div className={`home-compact-coll${isScrolled ? " is-visible" : ""}`}>
            {collections.map((c) => (
              <button
                key={c.name}
                type="button"
                className="home-compact-icon-btn"
                title={c.name}
                aria-label={c.name}
                onClick={() => handleCollectionClick(c.name)}
              >
                {c.icon}
              </button>
            ))}
          </div>

          <div className="home-header-wrap">
            <Header onOpenSearch={onOpenSearch} onToggleProfile={onToggleProfile} />
          </div>
        </div>

        {/* Category Chips from categories collection */}
        <div className="chips" onWheel={handleHorizontalWheel}>
          {categories.map((cat) => (
            <button
              key={cat.id}
              className="chip"
              style={{
                borderColor: activeChip === cat.id ? "var(--ink)" : undefined,
                fontWeight: activeChip === cat.id ? "600" : undefined,
                backgroundColor: activeChip === cat.id ? "var(--soft)" : undefined,
              }}
              onClick={() => {
                setActiveChip(cat.id);
                if (onSelectCategory) {
                  onSelectCategory(cat.id);
                }
              }}
            >
              {cat.bn || cat.en}
            </button>
          ))}
        </div>
      </div>

      {/* 2. Expanded Collection Cards (Scrolls up naturally without height jitter!) */}
      <h2 className="home-coll-title">Collection</h2>
      <div className="coll">
        {collections.map((c) => (
          <button
            key={c.name}
            onClick={() => handleCollectionClick(c.name)}
          >
            {c.icon}
            <span>{c.name}</span>
          </button>
        ))}
      </div>

      {/* Favorites / Booklists Modal (matching Testing/app/library/favorites.jsx) */}
      {showFavoritesModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 45,
            background: "rgba(0,0,0,0.45)",
            display: "grid",
            placeItems: "center",
            padding: "16px",
          }}
          onClick={() => setShowFavoritesModal(false)}
        >
          <div
            className="box"
            style={{
              width: "min(480px, 100%)",
              maxHeight: "80dvh",
              overflowY: "auto",
              padding: "18px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "14px",
                paddingBottom: "10px",
                borderBottom: "1px solid var(--line)",
              }}
            >
              <div>
                <b className="serif" style={{ fontSize: "18px", display: "block" }}>
                  My Favorites (বুকলিস্টসমূহ)
                </b>
                <span style={{ fontSize: "12px", color: "var(--mute)" }}>
                  {Object.keys(readerStorageData.booklists || {}).length} Collections
                </span>
              </div>
              <button
                onClick={() => setShowFavoritesModal(false)}
                style={{ fontSize: "16px", color: "var(--mute)", padding: "4px 8px" }}
              >
                ✕
              </button>
            </div>

            {Object.keys(readerStorageData.booklists || {}).length === 0 ? (
              <div style={{ fontSize: "14px", color: "var(--mute)", padding: "14px 0" }}>
                এখনো কোনো বুকলিস্ট তৈরি করা হয়নি। ই-বুক পড়ার সময় নিচের <b>＋</b> বাটনে ক্লিক করে বুকলিস্ট তৈরি ও বই যোগ করতে পারবেন।
              </div>
            ) : (
              <div style={{ display: "grid", gap: "12px" }}>
                {Object.entries(readerStorageData.booklists).map(([listId, list]) => {
                  const itemIds = Array.isArray(list.items) ? list.items : [];
                  const matchedStories = itemIds
                    .map(
                      (bid) =>
                        shortStories.find(
                          (s) => s.id === bid || `shortStory:${s.id}` === bid
                        ) || null
                    )
                    .filter(Boolean);

                  return (
                    <div
                      key={listId}
                      style={{
                        border: "1px solid var(--line)",
                        borderRadius: "14px",
                        padding: "12px 14px",
                        background: "var(--soft)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          marginBottom: matchedStories.length > 0 ? "10px" : 0,
                        }}
                      >
                        <div>
                          <b style={{ fontSize: "15px" }}>{list.title}</b>
                          <span
                            style={{
                              fontSize: "12px",
                              color: "var(--mute)",
                              marginLeft: "8px",
                            }}
                          >
                            ({itemIds.length}টি বই)
                          </span>
                        </div>
                        <button
                          onClick={() => deleteSavedBooklist(listId)}
                          style={{ fontSize: "13px", color: "var(--mute)", padding: "2px 6px" }}
                          title="Delete List"
                        >
                          ✕
                        </button>
                      </div>

                      {matchedStories.length > 0 && (
                        <div style={{ display: "grid", gap: "6px" }}>
                          {matchedStories.map((st) => (
                            <div
                              key={st.id}
                              className="clip"
                              style={{
                                marginBottom: 0,
                                padding: "8px 10px",
                                background: "#fff",
                                cursor: "pointer",
                              }}
                              onClick={() => {
                                setShowFavoritesModal(false);
                                if (onOpenFullPageFlip) {
                                  onOpenFullPageFlip(st);
                                } else if (onOpenShortStory) {
                                  onOpenShortStory(st);
                                }
                              }}
                            >
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <b style={{ fontSize: "14px", display: "block" }}>{st.title}</b>
                                <span style={{ fontSize: "12px" }}>{st.writer}</span>
                              </div>
                              <span style={{ fontSize: "12px", fontWeight: 600 }}>পড়ুন →</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Notes, Diary & Todo List Modal (matching Testing/app/library/notes.jsx) */}
      {showNotesModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 45,
            background: "rgba(0,0,0,0.45)",
            display: "grid",
            placeItems: "center",
            padding: "16px",
          }}
          onClick={() => setShowNotesModal(false)}
        >
          <div
            className="box"
            style={{
              width: "min(520px, 100%)",
              maxHeight: "82dvh",
              overflowY: "auto",
              padding: "18px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "12px",
              }}
            >
              <b className="serif" style={{ fontSize: "18px" }}>
                Notes & Journal
              </b>
              <button
                onClick={() => setShowNotesModal(false)}
                style={{ fontSize: "16px", color: "var(--mute)", padding: "4px 8px" }}
              >
                ✕
              </button>
            </div>

            {/* 3 Tabs matching Testing/app/library/notes.jsx: Note | Diary | List */}
            <div
              style={{
                display: "flex",
                gap: "8px",
                borderBottom: "1px solid var(--line)",
                paddingBottom: "10px",
                marginBottom: "14px",
              }}
            >
              {[
                { key: "notes", label: "Note" },
                { key: "diary", label: "Diary" },
                { key: "todo", label: "List" },
              ].map((t) => (
                <button
                  key={t.key}
                  onClick={() => setNotesTab(t.key)}
                  style={{
                    flex: 1,
                    padding: "7px 12px",
                    borderRadius: "999px",
                    fontSize: "13px",
                    fontWeight: 600,
                    background: notesTab === t.key ? "var(--ink)" : "var(--soft)",
                    color: notesTab === t.key ? "#fff" : "var(--ink)",
                  }}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* TAB 1: Saved Book Highlights / Notes (NoteTab.jsx) */}
            {notesTab === "notes" && (
              <div>
                <input
                  type="text"
                  placeholder="Search notes, quotes or books..."
                  value={notesSearch}
                  onChange={(e) => setNotesSearch(e.target.value)}
                  style={{
                    width: "100%",
                    padding: "9px 12px",
                    borderRadius: "10px",
                    border: "1px solid var(--line)",
                    marginBottom: "12px",
                    fontSize: "13px",
                    outline: "none",
                  }}
                />

                {(() => {
                  const allQuotes = [];
                  Object.entries(readerStorageData.notes || {}).forEach(([bookId, rawList]) => {
                    const arr = Array.isArray(rawList)
                      ? rawList
                      : Array.isArray(rawList?.quotes)
                      ? rawList.quotes
                      : [];
                    arr.forEach((n) => allQuotes.push({ ...n, bookId, itemType: "quote" }));
                  });

                  const allAudioClips = (audioClips || []).map((c) => ({
                    ...c,
                    itemType: "clip",
                  }));

                  const combined = [...allAudioClips, ...allQuotes].sort(
                    (a, b) => (b.createdAt || 0) - (a.createdAt || 0)
                  );

                  const q = notesSearch.trim().toLowerCase();
                  const filtered = q
                    ? combined.filter((n) =>
                        n.itemType === "clip"
                          ? (n.title || "").toLowerCase().includes(q) ||
                            (n.content || "").toLowerCase().includes(q) ||
                            (n.bookTitle || "").toLowerCase().includes(q) ||
                            (n.artist || "").toLowerCase().includes(q)
                          : (n.title || "").toLowerCase().includes(q) ||
                            (n.ref?.text || "").toLowerCase().includes(q) ||
                            (n.ref?.bookTitle || "").toLowerCase().includes(q) ||
                            (n.content || "").toLowerCase().includes(q)
                      )
                    : combined;

                  if (filtered.length === 0) {
                    return (
                      <div style={{ fontSize: "13px", color: "var(--mute)", padding: "14px 0" }}>
                        কোনো সংরক্ষিত অডিও ক্লিপ বা বুক নোট পাওয়া যায়নি। অডিও প্লেয়ার থেকে <b>Clip &amp; Note</b> অথবা বই পড়ার সময় টেক্সট সিলেক্ট করে <b>Note</b> যোগ করুন।
                      </div>
                    );
                  }

                  return (
                    <div style={{ display: "grid", gap: "10px" }}>
                      {filtered.map((n) => {
                        if (n.itemType === "clip") {
                          const isClipPlaying = activeClipId === n.id && isPlaying;
                          const matchedAudioBook = audioBooks.find(
                            (b) => b.id === n.bookId || b.id === n.trackId
                          );
                          return (
                            <div
                              key={n.id}
                              style={{
                                border: "1px solid var(--line)",
                                borderLeft: "4px solid var(--ink)",
                                borderRadius: "12px",
                                padding: "12px",
                                background: "var(--soft)",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  justifyContent: "space-between",
                                  alignItems: "flex-start",
                                  gap: "8px",
                                }}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: 0 }}>
                                  <button
                                    type="button"
                                    className="dot"
                                    onClick={() => playClipSegment(n, false)}
                                    title="শুধু এই ক্লিপটি প্লে করুন"
                                  >
                                    {isClipPlaying ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
                                  </button>
                                  <div style={{ minWidth: 0 }}>
                                    <b style={{ fontSize: "14px", display: "block" }}>
                                      {n.title || "Audio Clip"}
                                    </b>
                                    <span style={{ fontSize: "11.5px", color: "var(--mute)" }}>
                                      {n.bookTitle} · {formatTime(n.from)} – {formatTime(n.to)}
                                    </span>
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeAudioClip(n.id)}
                                  style={{ fontSize: "13px", color: "var(--mute)", padding: "2px 6px" }}
                                  title="Delete Clip"
                                >
                                  ✕
                                </button>
                              </div>

                              {n.content && (
                                <div
                                  style={{
                                    margin: "8px 0 6px",
                                    fontSize: "13px",
                                    lineHeight: 1.55,
                                    color: "var(--ink)",
                                  }}
                                >
                                  {n.content}
                                </div>
                              )}

                              <div style={{ display: "flex", gap: "12px", marginTop: "6px" }}>
                                <button
                                  type="button"
                                  onClick={() => playClipSegment(n, false)}
                                  style={{
                                    fontSize: "12px",
                                    fontWeight: 600,
                                    color: "var(--ink)",
                                    padding: "3px 0",
                                  }}
                                >
                                  {isClipPlaying ? "Pause Clip" : "▶ Play Clip Only"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setShowNotesModal(false);
                                    if (matchedAudioBook && onOpenBook) {
                                      onOpenBook(matchedAudioBook);
                                    } else {
                                      playClipSegment(n, true);
                                      openFullPlayer();
                                    }
                                  }}
                                  style={{
                                    fontSize: "12px",
                                    fontWeight: 600,
                                    color: "#6b4f2d",
                                    padding: "3px 0",
                                  }}
                                >
                                  মূল অডিওতে যান →
                                </button>
                              </div>
                            </div>
                          );
                        }

                        const matchedStory = shortStories.find(
                          (s) => s.id === n.bookId || `shortStory:${s.id}` === n.bookId
                        );
                        return (
                          <div
                            key={n.id}
                            style={{
                              border: "1px solid var(--line)",
                              borderLeft: "4px solid #6b4f2d",
                              borderRadius: "12px",
                              padding: "12px",
                              background: "var(--soft)",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "flex-start",
                                gap: "8px",
                              }}
                            >
                              <div>
                                <b style={{ fontSize: "14px", display: "block" }}>
                                  {n.title || "Note"}
                                </b>
                                <span style={{ fontSize: "11px", color: "var(--mute)" }}>
                                  {n.ref?.bookTitle || matchedStory?.title || "ই-বুক"} · পৃষ্ঠা{" "}
                                  {(n.ref?.startPage ?? n.ref?.page ?? 0) + 1}
                                </span>
                              </div>
                              <button
                                onClick={() => deleteSavedBookNote(n.bookId, n.id)}
                                style={{ fontSize: "13px", color: "var(--mute)", padding: "2px 6px" }}
                                title="Delete Note"
                              >
                                ✕
                              </button>
                            </div>

                            <div
                              style={{
                                margin: "8px 0",
                                fontStyle: "italic",
                                fontSize: "13.5px",
                                lineHeight: 1.6,
                              }}
                            >
                              “{n.ref?.text}”
                            </div>

                            {n.content && (
                              <div style={{ fontSize: "12.5px", color: "var(--mute)", marginBottom: "8px" }}>
                                {n.content}
                              </div>
                            )}

                            {matchedStory && (
                              <button
                                onClick={() => {
                                  setShowNotesModal(false);
                                  if (onOpenFullPageFlip) {
                                    onOpenFullPageFlip(matchedStory);
                                  } else if (onOpenShortStory) {
                                    onOpenShortStory(matchedStory);
                                  }
                                }}
                                style={{
                                  fontSize: "12px",
                                  fontWeight: 600,
                                  color: "#6b4f2d",
                                  padding: "4px 0",
                                }}
                              >
                                Jump back to source →
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}
              </div>
            )}

            {/* TAB 2: Personal Diary (DiaryTab.jsx) */}
            {notesTab === "diary" && (
              <div>
                {!isAddingDiary ? (
                  <>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginBottom: "12px",
                      }}
                    >
                      <span style={{ fontSize: "13px", color: "var(--mute)" }}>
                        ব্যক্তিগত ডায়েরি ও নোটসমূহ
                      </span>
                      <button
                        onClick={() => setIsAddingDiary(true)}
                        style={{
                          padding: "6px 14px",
                          borderRadius: "999px",
                          background: "var(--ink)",
                          color: "#fff",
                          fontSize: "12px",
                          fontWeight: 600,
                        }}
                      >
                        + New Entry
                      </button>
                    </div>

                    {readerStorageData.diaries.length === 0 ? (
                      <div style={{ fontSize: "13px", color: "var(--mute)", padding: "14px 0" }}>
                        আপনার ডায়েরি খালি। উপরে <b>+ New Entry</b> বাটনে ক্লিক করে নতুন ডায়েরি লিখুন।
                      </div>
                    ) : (
                      <div style={{ display: "grid", gap: "10px" }}>
                        {readerStorageData.diaries.map((d) => (
                          <div
                            key={d.id}
                            style={{
                              border: "1px solid var(--line)",
                              borderRadius: "12px",
                              padding: "12px",
                              background: "var(--soft)",
                            }}
                          >
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                alignItems: "center",
                                marginBottom: "6px",
                              }}
                            >
                              <b style={{ fontSize: "14px" }}>{d.title || "Untitled Entry"}</b>
                              <button
                                onClick={() =>
                                  saveDiaries(
                                    readerStorageData.diaries.filter((x) => x.id !== d.id)
                                  )
                                }
                                style={{ fontSize: "13px", color: "var(--mute)" }}
                              >
                                ✕
                              </button>
                            </div>
                            <p
                              style={{
                                margin: 0,
                                fontSize: "13px",
                                lineHeight: 1.6,
                                whiteSpace: "pre-wrap",
                              }}
                            >
                              {d.content}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <div style={{ display: "grid", gap: "10px" }}>
                    <input
                      type="text"
                      placeholder="ডায়েরির শিরোনাম..."
                      value={newDiaryTitle}
                      onChange={(e) => setNewDiaryTitle(e.target.value)}
                      style={{
                        padding: "9px 12px",
                        borderRadius: "10px",
                        border: "1px solid var(--line)",
                        fontSize: "14px",
                      }}
                    />
                    <textarea
                      rows={5}
                      placeholder="এখানে লিখুন..."
                      value={newDiaryContent}
                      onChange={(e) => setNewDiaryContent(e.target.value)}
                      style={{
                        padding: "10px 12px",
                        borderRadius: "10px",
                        border: "1px solid var(--line)",
                        fontSize: "14px",
                        fontFamily: "inherit",
                      }}
                    />
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                      <button
                        onClick={() => {
                          setIsAddingDiary(false);
                          setNewDiaryTitle("");
                          setNewDiaryContent("");
                        }}
                        style={{
                          padding: "7px 14px",
                          borderRadius: "8px",
                          background: "var(--soft)",
                          fontSize: "13px",
                        }}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => {
                          if (!newDiaryContent.trim() && !newDiaryTitle.trim()) return;
                          const entry = {
                            id: Date.now().toString(),
                            title: newDiaryTitle.trim() || "Untitled",
                            content: newDiaryContent.trim(),
                            createdAt: Date.now(),
                          };
                          saveDiaries([entry, ...readerStorageData.diaries]);
                          setNewDiaryTitle("");
                          setNewDiaryContent("");
                          setIsAddingDiary(false);
                        }}
                        style={{
                          padding: "7px 16px",
                          borderRadius: "8px",
                          background: "var(--ink)",
                          color: "#fff",
                          fontSize: "13px",
                          fontWeight: 600,
                        }}
                      >
                        Save
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: To-Do List (ListTab.jsx) */}
            {notesTab === "todo" && (
              <div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!newTodoText.trim()) return;
                    const next = [
                      {
                        id: Date.now().toString(),
                        text: newTodoText.trim(),
                        completed: false,
                      },
                      ...readerStorageData.todos,
                    ];
                    saveTodos(next);
                    setNewTodoText("");
                  }}
                  style={{ display: "flex", gap: "8px", marginBottom: "12px" }}
                >
                  <input
                    type="text"
                    placeholder="Add todo..."
                    value={newTodoText}
                    onChange={(e) => setNewTodoText(e.target.value)}
                    style={{
                      flex: 1,
                      padding: "9px 12px",
                      borderRadius: "10px",
                      border: "1px solid var(--line)",
                      fontSize: "13px",
                      outline: "none",
                    }}
                  />
                  <button
                    type="submit"
                    style={{
                      padding: "8px 16px",
                      borderRadius: "10px",
                      background: "var(--ink)",
                      color: "#fff",
                      fontSize: "13px",
                      fontWeight: 600,
                    }}
                  >
                    Add
                  </button>
                </form>

                {readerStorageData.todos.length === 0 ? (
                  <div style={{ fontSize: "13px", color: "var(--mute)", padding: "12px 0" }}>
                    কোনো তালিকা নেই। উপরে নতুন কাজ যুক্ত করুন।
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: "8px" }}>
                    {readerStorageData.todos.map((t) => (
                      <div
                        key={t.id}
                        className="clip"
                        style={{ marginBottom: 0, padding: "9px 12px" }}
                      >
                        <input
                          type="checkbox"
                          checked={Boolean(t.completed)}
                          onChange={() =>
                            saveTodos(
                              readerStorageData.todos.map((item) =>
                                item.id === t.id
                                  ? { ...item, completed: !item.completed }
                                  : item
                              )
                            )
                          }
                          style={{ width: "16px", height: "16px", accentColor: "var(--ink)" }}
                        />
                        <span
                          style={{
                            flex: 1,
                            fontSize: "14px",
                            textDecoration: t.completed ? "line-through" : "none",
                            color: t.completed ? "var(--mute)" : "var(--ink)",
                          }}
                        >
                          {t.text}
                        </span>
                        <button
                          onClick={() =>
                            saveTodos(readerStorageData.todos.filter((item) => item.id !== t.id))
                          }
                          style={{ fontSize: "13px", color: "var(--mute)" }}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Listening & Reading History Modal */}
      {showHistoryModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 45,
            background: "rgba(0,0,0,0.4)",
            display: "grid",
            placeItems: "center",
            padding: "16px",
          }}
          onClick={() => setShowHistoryModal(false)}
        >
          <div
            className="box"
            style={{
              width: "min(460px, 100%)",
              maxHeight: "78dvh",
              overflowY: "auto",
              padding: "18px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "14px",
                paddingBottom: "10px",
                borderBottom: "1px solid var(--line)",
              }}
            >
              <b className="serif" style={{ fontSize: "18px" }}>
                History (শোনা ও পড়ার ইতিহাস)
              </b>
              <button
                onClick={() => setShowHistoryModal(false)}
                style={{ fontSize: "16px", color: "var(--mute)", padding: "4px 8px" }}
              >
                ✕
              </button>
            </div>

            {!historyItems || historyItems.length === 0 ? (
              <div style={{ fontSize: "14px", color: "var(--mute)", padding: "12px 0" }}>
                এখনো কোনো অডিও শোনা বা ই-বুক পড়ার ইতিহাস নেই।
              </div>
            ) : (
              <div style={{ display: "grid", gap: "8px" }}>
                {historyItems.map((item) => {
                  const isAudio = item.type === "audio";
                  const progressPct = isAudio
                    ? item.duration > 0
                      ? Math.min(100, Math.round((item.currentTime / item.duration) * 100))
                      : 0
                    : item.scrollPercent || 1;
                  const isThisAudioPlaying =
                    isAudio && isPlaying && currentTrack?.id === item.itemId;

                  const handleResumeItem = () => {
                    if (isAudio) {
                      playTrack(item.track, item.playlist, item.currentTime || 0);
                      setShowHistoryModal(false);
                    } else if (item.story && onOpenShortStory) {
                      setShowHistoryModal(false);
                      onOpenShortStory(item.story);
                    }
                  };

                  return (
                    <div
                      key={item.id}
                      className="clip"
                      style={{
                        marginBottom: 0,
                        padding: "10px 12px",
                        position: "relative",
                        overflow: "hidden",
                      }}
                    >
                      <button
                        className="dot"
                        onClick={handleResumeItem}
                        title={isAudio ? "যেখান থেকে থেমেছিলেন সেখান থেকে শুনুন" : "যেখান থেকে থেমেছিলেন সেখান থেকে পড়ুন"}
                      >
                        {isThisAudioPlaying ? (
                          <PauseIcon size={13} />
                        ) : (
                          <PlayIcon size={13} />
                        )}
                      </button>

                      <div
                        style={{ flex: 1, minWidth: 0, cursor: "pointer" }}
                        onClick={handleResumeItem}
                      >
                        <b
                          style={{
                            display: "block",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            fontSize: "14px",
                          }}
                        >
                          {item.title}
                        </b>
                        <span style={{ fontSize: "12px" }}>
                          {isAudio
                            ? `অডিও · ${formatTime(item.currentTime)} / ${formatTime(item.duration)} (${progressPct}%)`
                            : `ই-বুক · ${progressPct}% পড়া হয়েছে`}
                          {item.artist ? ` · ${item.artist}` : ""}
                        </span>
                      </div>

                      <button
                        title="ইতিহাস থেকে সরান"
                        onClick={() => removeHistoryItem(item.id)}
                        style={{ color: "var(--mute)", fontSize: "14px", padding: "4px 6px" }}
                      >
                        ✕
                      </button>

                      {/* Bottom progress line inside history card */}
                      <div
                        style={{
                          position: "absolute",
                          left: 0,
                          right: 0,
                          bottom: 0,
                          height: "3px",
                          background: "var(--soft)",
                        }}
                      >
                        <div
                          style={{
                            width: `${progressPct}%`,
                            height: "100%",
                            background: "var(--ink)",
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Saved Playlists Modal */}
      {showPlaylistsModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 45,
            background: "rgba(0,0,0,0.4)",
            display: "grid",
            placeItems: "center",
            padding: "16px",
          }}
          onClick={() => setShowPlaylistsModal(false)}
        >
          <div
            className="box"
            style={{
              width: "min(440px, 100%)",
              maxHeight: "75dvh",
              overflowY: "auto",
              padding: "18px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "14px",
                paddingBottom: "10px",
                borderBottom: "1px solid var(--line)",
              }}
            >
              <b className="serif" style={{ fontSize: "18px" }}>
                PlayLists
              </b>
              <button
                onClick={() => setShowPlaylistsModal(false)}
                style={{ fontSize: "16px", color: "var(--mute)", padding: "4px 8px" }}
              >
                ✕
              </button>
            </div>

            {userPlaylists.map((pl) => (
              <div key={pl.id} style={{ marginBottom: "16px" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "8px",
                  }}
                >
                  <b style={{ fontSize: "15px" }}>
                    {pl.name} ({pl.tracks.length})
                  </b>
                  {pl.tracks.length > 0 && (
                    <button
                      onClick={() => {
                        playTrack(pl.tracks[0], pl.tracks);
                        setShowPlaylistsModal(false);
                      }}
                      style={{
                        fontSize: "13px",
                        fontWeight: 600,
                        padding: "4px 12px",
                        borderRadius: "999px",
                        background: "var(--ink)",
                        color: "#fff",
                      }}
                    >
                      Play All
                    </button>
                  )}
                </div>

                {pl.tracks.length === 0 ? (
                  <div style={{ fontSize: "13px", color: "var(--mute)", padding: "8px 0" }}>
                    মিনি প্লেয়ারের প্লেলিস্ট বাটনে ক্লিক করে এখানে অডিও যুক্ত করুন।
                  </div>
                ) : (
                  <div style={{ display: "grid", gap: "6px" }}>
                    {pl.tracks.map((tr) => {
                      const active = isPlaying && currentTrack?.id === tr.id;
                      return (
                        <div
                          key={tr.id}
                          className="clip"
                          style={{ marginBottom: 0, padding: "8px 10px" }}
                        >
                          <button
                            className="dot"
                            onClick={() => {
                              if (currentTrack?.id === tr.id) {
                                togglePlay();
                              } else {
                                playTrack(tr, pl.tracks);
                              }
                            }}
                          >
                            {active ? <PauseIcon size={13} /> : <PlayIcon size={13} />}
                          </button>
                          <div
                            style={{ flex: 1, minWidth: 0, cursor: "pointer" }}
                            onClick={() => playTrack(tr, pl.tracks)}
                          >
                            <b
                              style={{
                                display: "block",
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                fontSize: "14px",
                              }}
                            >
                              {tr.title}
                            </b>
                            <span style={{ fontSize: "12px" }}>
                              {tr.artist || tr.writer} · {tr.time || formatTime(tr.durationSec)}
                            </span>
                          </div>
                          <button
                            title="Remove"
                            onClick={() => toggleTrackInUserPlaylist(tr, pl.id)}
                            style={{ color: "var(--mute)", fontSize: "14px", padding: "4px 6px" }}
                          >
                            ✕
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* AudioBooks (books collection) */}
      <h2>AudioBooks</h2>
      <div className="row" onWheel={handleHorizontalWheel}>
        {audioBooks.map((book, idx) => (
          <button
            key={book.id}
            className="item"
            onClick={() => onOpenBook(book)}
          >
            <div className={`cover ${idx % 2 === 1 ? "alt" : ""}`}>
              {book.artwork && (
                <img
                  src={book.artwork}
                  alt={book.title}
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              )}
              <span className="big">{book.letter || "ব"}</span>
              <small>{book.artist || book.writer}</small>
            </div>
            <div className="t">{book.title}</div>
            <div className="a">{book.artist || book.writer}</div>
          </button>
        ))}
      </div>

      {/* Books / eBooks (shortStory collection) */}
      <h2>Books (ই-বুক)</h2>
      <div className="row" onWheel={handleHorizontalWheel}>
        {shortStories.map((story, idx) => (
          <button
            key={story.id}
            className="item"
            onClick={() => onOpenShortStory(story)}
          >
            <div className={`cover tall ${idx % 2 === 0 ? "alt" : ""}`}>
              {story.artwork && (
                <img
                  src={story.artwork}
                  alt={story.title}
                  style={{
                    position: "absolute",
                    inset: 0,
                    width: "100%",
                    height: "100%",
                    objectFit: "cover",
                  }}
                  onError={(e) => {
                    e.currentTarget.style.display = "none";
                  }}
                />
              )}
              <span className="big">{story.letter || "গ"}</span>
              <small>{story.writer}</small>
            </div>
            <div className="t">{story.title}</div>
            <div className="a">{story.writer}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
