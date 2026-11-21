"use client";

import React, { useState, useEffect, useRef } from "react";
import { useAudioPlayer } from "../../context/AudioPlayerContext";
import { LeftArrowIcon } from "../Icons";

export default function EBookReaderModal({ story, onBack, onOpenFullPageFlip }) {
  const [fontSize, setFontSize] = useState(18);
  const [theme, setTheme] = useState("paper"); // 'paper', 'sepia', 'dark'
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);

  const scrollContainerRef = useRef(null);
  const restoredScrollRef = useRef(false);
  const lastScrollSaveRef = useRef(0);

  const { recordBookReadingProgress, getBookReadingProgress } = useAudioPlayer();

  useEffect(() => {
    if (!story) return;
    restoredScrollRef.current = false;

    // Record initial reading history entry
    recordBookReadingProgress(story, 0, 0);

    if (story.content) {
      setContent(story.content);
      return;
    }
    if (story.sampleText) {
      setContent(story.sampleText);
      return;
    }
    if (story.fileUrl) {
      setLoading(true);
      fetch(story.fileUrl)
        .then((res) => {
          if (!res.ok) throw new Error("Network response was not ok");
          return res.text();
        })
        .then((text) => {
          setContent(text);
          setLoading(false);
        })
        .catch(() => {
          setContent(
            `---chapter: ${story.title}---
${story.title} - ${story.writer}।
গল্পজল্পে বইটি সংরক্ষিত রয়েছে। অনলাইন সংযোগে সম্পূর্ণ পড়তে অসুবিধা হলে ডাউনলোড করে অফলাইনে পড়ুন।`
          );
          setLoading(false);
        });
    } else {
      setContent(
        `---chapter: ${story.title}---
${story.title} - ${story.writer}।
বইটির বিষয়বস্তু শীঘ্রই আপডেট করা হবে।`
      );
    }
  }, [story]);

  // Restore saved reading scroll position once content is loaded
  useEffect(() => {
    if (!story || loading || !content || restoredScrollRef.current) return;
    const saved = getBookReadingProgress(story.id);
    if (saved && scrollContainerRef.current) {
      restoredScrollRef.current = true;
      setTimeout(() => {
        const el = scrollContainerRef.current;
        if (!el) return;
        if (saved.scrollTop > 0) {
          el.scrollTop = saved.scrollTop;
        } else if (saved.scrollPercent > 1) {
          const maxScroll = el.scrollHeight - el.clientHeight;
          if (maxScroll > 0) {
            el.scrollTop = Math.round((saved.scrollPercent / 100) * maxScroll);
          }
        }
      }, 60);
    }
  }, [story, loading, content, getBookReadingProgress]);

  const handleReaderScroll = (e) => {
    if (!story) return;
    const el = e.currentTarget;
    const now = Date.now();
    if (now - lastScrollSaveRef.current < 400) return;
    lastScrollSaveRef.current = now;

    const maxScroll = Math.max(1, el.scrollHeight - el.clientHeight);
    const percent = Math.min(100, Math.max(1, Math.round((el.scrollTop / maxScroll) * 100)));
    recordBookReadingProgress(story, el.scrollTop, percent);
  };

  if (!story) return null;

  const themes = {
    paper: { bg: "#ffffff", text: "#161616", border: "#e6e6e6" },
    sepia: { bg: "#fbf0d9", text: "#3c2f1f", border: "#ebd9b8" },
    dark: { bg: "#1a1a1a", text: "#e0e0e0", border: "#333333" },
  };

  const activeTheme = themes[theme] || themes.paper;

  const rawSections = content
    .split(/---(?:page|chapter:[^-\n]*)---/i)
    .filter((s) => s.trim().length > 0);
  const sections = rawSections.length > 0 ? rawSections : [content];

  return (
    <div
      ref={scrollContainerRef}
      onScroll={handleReaderScroll}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 50,
        backgroundColor: activeTheme.bg,
        color: activeTheme.text,
        overflowY: "auto",
        display: "flex",
        flexDirection: "column",
        transition: "background-color 0.2s ease, color 0.2s ease",
      }}
    >
      {/* Top Header Bar */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          backgroundColor: activeTheme.bg,
          borderBottom: `1px solid ${activeTheme.border}`,
          padding: "12px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "12px",
        }}
      >
        <button
          onClick={onBack}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "6px",
            color: activeTheme.text,
            fontWeight: "500",
          }}
        >
          <LeftArrowIcon />
          <span>ফিরে যান</span>
        </button>

        <div style={{ textAlign: "center", flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: "'Noto Serif Bengali', serif",
              fontWeight: 600,
              fontSize: "17px",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {story.title}
          </div>
          <div style={{ fontSize: "12px", opacity: 0.75 }}>{story.writer}</div>
        </div>

        {/* Font & Theme Controls */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <button
            onClick={() => setFontSize((s) => Math.max(14, s - 2))}
            style={{
              padding: "4px 8px",
              border: `1px solid ${activeTheme.border}`,
              borderRadius: "6px",
              fontSize: "14px",
            }}
            title="ফন্ট ছোট করুন"
          >
            A-
          </button>
          <button
            onClick={() => setFontSize((s) => Math.min(28, s + 2))}
            style={{
              padding: "4px 8px",
              border: `1px solid ${activeTheme.border}`,
              borderRadius: "6px",
              fontSize: "14px",
            }}
            title="ফন্ট বড় করুন"
          >
            A+
          </button>

          {/* Theme circles */}
          <button
            onClick={() => setTheme("paper")}
            style={{
              width: "24px",
              height: "24px",
              borderRadius: "50%",
              backgroundColor: "#ffffff",
              border: "2px solid #ccc",
            }}
            title="সাদা"
          />
          <button
            onClick={() => setTheme("sepia")}
            style={{
              width: "24px",
              height: "24px",
              borderRadius: "50%",
              backgroundColor: "#fbf0d9",
              border: "2px solid #d4af37",
            }}
            title="সেপিয়া"
          />
          <button
            onClick={() => setTheme("dark")}
            style={{
              width: "24px",
              height: "24px",
              borderRadius: "50%",
              backgroundColor: "#1a1a1a",
              border: "2px solid #555",
            }}
            title="রাত"
          />
        </div>
      </div>

      {/* Reader Body */}
      <div
        style={{
          maxWidth: "760px",
          width: "100%",
          margin: "0 auto",
          padding: "36px 24px 80px",
          fontSize: `${fontSize}px`,
          lineHeight: 1.85,
          fontFamily: "'Noto Serif Bengali', 'Hind Siliguri', serif",
        }}
      >
        {loading ? (
          <div style={{ textAlign: "center", padding: "60px 0", color: "var(--mute)" }}>
            বইটি লোড হচ্ছে...
          </div>
        ) : (
          sections.map((section, idx) => (
            <div key={idx} style={{ marginBottom: "32px", whiteSpace: "pre-wrap" }}>
              {section.trim()}
              {idx < sections.length - 1 && (
                <div
                  style={{
                    margin: "32px 0",
                    borderBottom: `1px dashed ${activeTheme.border}`,
                  }}
                />
              )}
            </div>
          ))
        )}

        {/* 3D Page flip launcher button */}
        {onOpenFullPageFlip && (
          <div style={{ marginTop: "40px", textAlign: "center" }}>
            <button
              onClick={() => onOpenFullPageFlip(story)}
              className="btn"
              style={{
                display: "inline-flex",
                width: "auto",
                backgroundColor: "var(--ink)",
                color: "#fff",
                padding: "10px 24px",
                borderRadius: "999px",
                fontSize: "15px",
              }}
            >
              📖 ত্রিমাত্রিক পেজ-টার্ন মোডে পড়ুন
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
