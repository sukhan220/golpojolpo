"use client";

import React, { useState } from "react";
import { SearchIcon, PlayIcon, LeftArrowIcon } from "../Icons";

export default function SearchView({
  audioBooks,
  shortStories,
  writers,
  onOpenBook,
  onOpenShortStory,
  onSelectWriter,
  onBack,
}) {
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();

  const matchedBooks = q
    ? audioBooks.filter(
        (b) =>
          b.title?.toLowerCase().includes(q) ||
          b.artist?.toLowerCase().includes(q) ||
          b.writer?.toLowerCase().includes(q)
      )
    : [];

  const matchedStories = q
    ? shortStories.filter(
        (s) =>
          s.title?.toLowerCase().includes(q) ||
          s.writer?.toLowerCase().includes(q)
      )
    : [];

  const matchedWriters = q
    ? writers.filter(
        (w) =>
          w.name?.toLowerCase().includes(q) ||
          w.bn?.toLowerCase().includes(q)
      )
    : [];

  return (
    <div className="view">
      <div className="top" style={{ gap: "12px", alignItems: "center" }}>
        {onBack && (
          <button className="back" onClick={onBack} style={{ margin: 0 }}>
            <LeftArrowIcon />
          </button>
        )}
        <h1 className="brand" style={{ margin: 0, fontSize: "24px" }}>অনুসন্ধান</h1>
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          border: "1px solid var(--line)",
          borderRadius: "12px",
          padding: "10px 14px",
          background: "var(--card)",
          margin: "12px 0 20px",
        }}
      >
        <SearchIcon size={20} className="icon" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="গল্প, লেখক বা অডিওবুক খুঁজুন..."
          style={{
            border: "none",
            outline: "none",
            background: "transparent",
            width: "100%",
            fontSize: "16px",
            color: "var(--ink)",
          }}
          autoFocus
        />
        {query && (
          <button
            onClick={() => setQuery("")}
            style={{ color: "var(--mute)", fontSize: "14px", padding: "4px" }}
          >
            ✕
          </button>
        )}
      </div>

      {!q ? (
        <div className="box" style={{ color: "var(--mute)" }}>
          যেকোনো গল্প, লেখক বা অডিওবুকের নাম লিখে অনুসন্ধান করুন।
        </div>
      ) : (
        <div style={{ display: "grid", gap: "24px" }}>
          {/* AudioBooks */}
          {matchedBooks.length > 0 && (
            <div>
              <h3>অডিওবুক ({matchedBooks.length})</h3>
              <div className="stories">
                {matchedBooks.map((book) => (
                  <button
                    key={book.id}
                    className="tile"
                    onClick={() => onOpenBook(book)}
                  >
                    <div className="cover">
                      <span className="big">{book.letter || "ব"}</span>
                      <span className="ov">
                        <PlayIcon size={16} />
                      </span>
                    </div>
                    <div className="tt">{book.title}</div>
                    <div style={{ textAlign: "center", fontSize: "12px", color: "var(--mute)" }}>
                      {book.artist || book.writer}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* eBooks */}
          {matchedStories.length > 0 && (
            <div>
              <h3>ই-বুক ({matchedStories.length})</h3>
              <div className="stories">
                {matchedStories.map((story) => (
                  <button
                    key={story.id}
                    className="tile"
                    onClick={() => onOpenShortStory(story)}
                  >
                    <div className="cover tall alt">
                      <span className="big">{story.letter || "গ"}</span>
                    </div>
                    <div className="tt">{story.title}</div>
                    <div style={{ textAlign: "center", fontSize: "12px", color: "var(--mute)" }}>
                      {story.writer}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Writers */}
          {matchedWriters.length > 0 && (
            <div>
              <h3>লেখক ({matchedWriters.length})</h3>
              <div className="wl">
                {matchedWriters.map((writer) => (
                  <button
                    key={writer.id}
                    className="wrow"
                    onClick={() => onSelectWriter(writer)}
                  >
                    <span className="av">
                      {writer.img && (
                        <img
                          src={writer.img}
                          alt={writer.name || writer.bn}
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />
                      )}
                      {writer.letter || "র"}
                    </span>
                    <span className="serif">{writer.name || writer.bn}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {matchedBooks.length === 0 &&
            matchedStories.length === 0 &&
            matchedWriters.length === 0 && (
              <div className="box" style={{ color: "var(--mute)" }}>
                &ldquo;{query}&rdquo; দিয়ে কোনো ফলাফল পাওয়া যায়নি।
              </div>
            )}
        </div>
      )}
    </div>
  );
}
