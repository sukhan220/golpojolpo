"use client";

import { BookmarkFilledIcon, TrashOutlineIcon } from "./Icons";

export default function ChapterSidebar({
  visible,
  activeTab = "chapters", // 'chapters' | 'bookmarks' | 'notes'
  setActiveTab,
  onClose,
  chapters = [],
  bookmarks = [],
  notes = [],
  jumpToPage,
  onDeleteNote,
  onRemoveBookmark,
}) {
  if (!visible) return null;

  const headerTitle =
    activeTab === "chapters"
      ? "সূচিপত্র"
      : activeTab === "bookmarks"
      ? "বুকমার্কস"
      : "নোটসমূহ";

  return (
    <div
      className="sidebar-modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={headerTitle}
    >
      <aside
        className="chapter-sidebar"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sidebar-top-bar">
          <h2 className="sidebar-header-title">{headerTitle}</h2>
          <button
            type="button"
            className="sidebar-close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {/* Tab switchers */}
        <div className="sidebar-tabs">
          <button
            type="button"
            className={`sidebar-tab-btn ${activeTab === "chapters" ? "active" : ""}`}
            onClick={() => setActiveTab("chapters")}
          >
            সূচিপত্র ({chapters.length})
          </button>
          <button
            type="button"
            className={`sidebar-tab-btn ${activeTab === "bookmarks" ? "active" : ""}`}
            onClick={() => setActiveTab("bookmarks")}
          >
            বুকমার্ক ({bookmarks.length})
          </button>
          <button
            type="button"
            className={`sidebar-tab-btn ${activeTab === "notes" ? "active" : ""}`}
            onClick={() => setActiveTab("notes")}
          >
            নোট ({notes.length})
          </button>
        </div>

        <div className="sidebar-scroll-content">
          {/* 1. সূচিপত্র (Chapters) */}
          {activeTab === "chapters" && (
            <div className="sidebar-list">
              {chapters.length === 0 ? (
                <p className="sidebar-empty">কোনো অধ্যায় চিহ্নিত করা নেই।</p>
              ) : (
                chapters.map((c, i) => (
                  <button
                    key={`chap-${i}`}
                    type="button"
                    className="chapter-item-btn"
                    onClick={() => {
                      jumpToPage(c.pageIndex);
                      onClose();
                    }}
                  >
                    <div className="chapter-info">
                      <span className="chapter-title">{c.title}</span>
                      <span className="chapter-page">পৃষ্ঠা {c.pageIndex + 1}</span>
                    </div>
                    <span className="chapter-arrow">›</span>
                  </button>
                ))
              )}
            </div>
          )}

          {/* 2. বুকমার্কস (Bookmarks) */}
          {activeTab === "bookmarks" && (
            <div className="sidebar-list">
              {bookmarks.length === 0 ? (
                <p className="sidebar-empty">এখনও কোনো পৃষ্ঠা বুকমার্ক করা হয়নি।</p>
              ) : (
                bookmarks.map((p, i) => (
                  <div key={`book-${i}`} className="bookmark-item-row">
                    <button
                      type="button"
                      className="bookmark-main-btn"
                      onClick={() => {
                        jumpToPage(p);
                        onClose();
                      }}
                    >
                      <BookmarkFilledIcon size={18} color="#6b4f2d" />
                      <div className="bookmark-info">
                        <span className="bookmark-title">পৃষ্ঠা {p + 1}</span>
                        {chapters.find((c) => c.pageIndex <= p) && (
                          <span className="bookmark-chapter">
                            {chapters.filter((c) => c.pageIndex <= p).at(-1)?.title}
                          </span>
                        )}
                      </div>
                    </button>
                    {onRemoveBookmark && (
                      <button
                        type="button"
                        className="bookmark-remove-btn"
                        onClick={() => onRemoveBookmark(p)}
                        title="বুকমার্ক মুছুন"
                        aria-label="Remove bookmark"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* 3. নোটসমূহ (Notes) */}
          {activeTab === "notes" && (
            <div className="sidebar-list">
              {notes.length === 0 ? (
                <p className="sidebar-empty">
                  পড়ার সময় যেকোনো টেক্সট সিলেক্ট করে &apos;নোট&apos; এ ক্লিক করে নোট সংরক্ষণ করতে পারবেন।
                </p>
              ) : (
                notes.map((n, i) => {
                  const targetPage = n.ref?.startPage ?? n.ref?.page ?? 0;
                  return (
                    <div key={n.id || `note-${i}`} className="note-item-row">
                      <button
                        type="button"
                        className="note-main-btn"
                        onClick={() => {
                          jumpToPage(targetPage);
                          onClose();
                        }}
                      >
                        <strong className="note-title">{n.title || "Untitled Note"}</strong>
                        <span className="note-quote">&ldquo;{n.ref?.text}&rdquo;</span>
                        {n.content && <span className="note-user-content">{n.content}</span>}
                        <span className="note-page">পৃষ্ঠা {targetPage + 1}</span>
                      </button>
                      <button
                        type="button"
                        className="note-delete-btn"
                        onClick={() => {
                          if (window.confirm("আপনি কি নিশ্চিতভাবে এই নোটটি ডিলিট করতে চান?")) {
                            onDeleteNote(n);
                          }
                        }}
                        title="নোট মুছুন"
                        aria-label="Delete note"
                      >
                        <TrashOutlineIcon size={18} color="#ff6b6b" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

