"use client";

import React, { useState } from "react";
import Header from "../layout/Header";

export default function LibraryView({
  categories,
  shortStories,
  onSelectCategory,
  onOpenShortStory,
  onOpenSearch,
  onToggleProfile,
}) {
  const [tab, setTab] = useState("audio"); // 'audio' or 'kindle'

  return (
    <div className="view">
      <div className="sticky-page-header">
        <Header onOpenSearch={onOpenSearch} onToggleProfile={onToggleProfile} />

        {/* Segmented control: Audio / Kindle */}
        <div className="seg" role="tablist" style={{ marginBottom: "6px" }}>
          <button
            role="tab"
            aria-selected={tab === "audio"}
            onClick={() => setTab("audio")}
          >
            Audio
          </button>
          <button
            role="tab"
            aria-selected={tab === "kindle"}
            onClick={() => setTab("kindle")}
          >
            Kindle
          </button>
        </div>
      </div>

      {tab === "audio" ? (
        <div className="cats">
          {categories
            .filter((c) => c.audio)
            .map((cat) => (
              <button
                key={cat.id}
                onClick={() => onSelectCategory(cat.id)}
              >
                {cat.bn}
              </button>
            ))}
        </div>
      ) : (
        <div>
          {shortStories && shortStories.length > 0 ? (
            <div className="stories">
              {shortStories.map((story, i) => (
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
                  <div style={{ textAlign: "center", color: "var(--mute)", fontSize: "12px" }}>
                    {story.writer}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="box" style={{ color: "var(--mute)" }}>
              কিন্ডল বইয়ের সংগ্রহ শীঘ্রই আসছে।
            </div>
          )}
        </div>
      )}
    </div>
  );
}
