"use client";

import React, { useState } from "react";
import { LeftArrowIcon, PlayIcon } from "../Icons";

export default function CategoryView({
  category,
  audioBooks,
  writers,
  onBack,
  onOpenBook,
}) {
  const [selectedWriterId, setSelectedWriterId] = useState(null);

  // Filter books in this category
  const categoryBooks = audioBooks.filter((b) => {
    const matchesCat = !category?.id || b.cateId === category.id || category.bn === "ছোট গল্প";
    const matchesWriter = !selectedWriterId || b.writerId === selectedWriterId;
    return matchesCat && matchesWriter;
  });

  // Filter writers who have content in this category
  const relevantWriters = writers.filter((w) => {
    if (!category?.id) return true;
    return w.cateId?.includes(category.id) || w.categories?.includes(category.bn);
  });

  return (
    <div className="view">
      <div className="sticky-page-header">
        <button className="back" onClick={onBack}>
          <LeftArrowIcon />
          {category?.bn || "লাইব্রেরি"}
        </button>

        <h2 style={{ marginTop: "2px", marginBottom: "6px" }}>
          {category?.bn || "বিভাগ"} লেখক
        </h2>

        {/* Authors filter chips (sticky) */}
        <div className="auth" style={{ marginBottom: "4px" }}>
          <button
            aria-pressed={selectedWriterId === null}
            onClick={() => setSelectedWriterId(null)}
          >
            সব লেখক
          </button>
          {relevantWriters.map((writer) => (
            <button
              key={writer.id}
              aria-pressed={selectedWriterId === writer.id}
              onClick={() =>
                setSelectedWriterId(selectedWriterId === writer.id ? null : writer.id)
              }
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
              {writer.name || writer.bn}
            </button>
          ))}
        </div>
      </div>

      {/* Stories / Books grid */}
      {categoryBooks.length > 0 ? (
        <div className="stories">
          {categoryBooks.map((book, i) => (
            <button
              key={book.id}
              className="tile"
              onClick={() => onOpenBook(book)}
            >
              <div className={`cover ${i % 2 ? "alt" : ""}`}>
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
                <span className="ov">
                  <PlayIcon size={16} />
                </span>
              </div>
              <div className="tt">{book.title}</div>
            </button>
          ))}
        </div>
      ) : (
        <div className="box" style={{ color: "var(--mute)" }}>
          এই বিভাগের অডিও শীঘ্রই আসছে।
        </div>
      )}
    </div>
  );
}
