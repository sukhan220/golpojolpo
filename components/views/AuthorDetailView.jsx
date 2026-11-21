"use client";

import React, { useEffect, useRef, useState } from "react";
import { LeftArrowIcon, PlayIcon } from "../Icons";

export default function AuthorDetailView({
  writer,
  audioBooks,
  shortStories,
  onBack,
  onOpenBook,
  onOpenShortStory,
}) {
  const [activeCategory, setActiveCategory] = useState(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const viewRef = useRef(null);

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
          if (!prev && top > 110) return true;
          if (prev && top < 90) return false;
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

  if (!writer) return null;

  // Filter content by this author
  const authorAudioBooks = audioBooks.filter(
    (b) => b.writerId === writer.id || b.writer === writer.bn || b.artist === writer.bn
  );

  const authorStories = shortStories.filter(
    (s) => s.writerId === writer.id || s.writer === writer.bn
  );

  const categories = writer.categories || ["ছোটগল্প", "উপন্যাস", "কবিতা"];

  return (
    <div ref={viewRef} className="view author-detail-view">
      {/* 1. Sticky Top Bar: Back Button + Compact Author Pill (appears on the left when hero scrolls up) */}
      <div className={`sticky-page-header author-top-sticky${isScrolled ? " is-scrolled" : ""}`}>
        <div className="author-sticky-top-row">
          <button className="back" onClick={onBack}>
            <LeftArrowIcon />
            Writer
          </button>

          <div className={`author-compact-pill${isScrolled ? " is-visible" : ""}`}>
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
            <span className="serif author-compact-name">{writer.name || writer.bn}</span>
          </div>
        </div>
      </div>

      {/* 2. Hero Profile (At start: Big photo & centered name ABOVE the category chips, exactly as in screenshot) */}
      <div className="prof author-hero-prof">
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
        <h1 className="serif">{writer.name || writer.bn}</h1>
      </div>

      {/* 3. Sticky Category Filter Chips (Starts below Hero Profile, sticks right below Top Sticky Bar on scroll!) */}
      <div className="author-chips-sticky">
        <div className="auth author-sticky-chips">
          <button
            className="gchip"
            aria-pressed={activeCategory === null}
            onClick={() => setActiveCategory(null)}
          >
            সব
          </button>
          {categories.map((cat, i) => (
            <button
              key={i}
              className="gchip"
              aria-pressed={activeCategory === cat}
              onClick={() => setActiveCategory(activeCategory === cat ? null : cat)}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Audio books */}
      {authorAudioBooks.length > 0 && (
        <>
          <h3 style={{ marginTop: "16px", marginBottom: "8px" }}>অডিওবুক</h3>
          <div className="stories">
            {authorAudioBooks.map((book, i) => (
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
        </>
      )}

      {/* Short stories / eBooks */}
      {authorStories.length > 0 && (
        <>
          <h3 style={{ marginTop: "24px", marginBottom: "8px" }}>ই-বুক ও ছোটগল্প</h3>
          <div className="stories">
            {authorStories.map((story, i) => (
              <button
                key={story.id}
                className="tile"
                onClick={() => onOpenShortStory(story)}
              >
                <div className={`cover tall ${i % 2 ? "alt" : ""}`}>
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
                <div className="tt">{story.title}</div>
              </button>
            ))}
          </div>
        </>
      )}

      {authorAudioBooks.length === 0 && authorStories.length === 0 && (
        <div className="box" style={{ color: "var(--mute)" }}>
          এই লেখকের আরো সৃষ্টি শীঘ্রই গল্পজল্পে যোগ করা হবে।
        </div>
      )}
    </div>
  );
}
