"use client";

import React, { useState } from "react";
import { useAudioPlayer } from "../../context/AudioPlayerContext";
import {
  LeftArrowIcon,
  DocumentTextIcon,
} from "../Icons";

export default function EBookDetailView({
  story,
  onBack,
  onReadNow,
  backLabel = "Back",
}) {
  const [tab, setTab] = useState("d"); // 'd': Description, 'i': Info
  const [imageFailed, setImageFailed] = useState(false);

  const { getBookReadingProgress } = useAudioPlayer();

  if (!story) return null;

  const savedProgress = getBookReadingProgress ? getBookReadingProgress(story.id) : null;
  const progressPercent = savedProgress?.scrollPercent || 0;

  return (
    <div className="view">
      <button className="back" onClick={onBack}>
        <LeftArrowIcon />
        {backLabel}
      </button>

      <div className="detail">
        {/* Cover Art */}
        <div>
          <div className="cover tall">
            {story.artwork && !imageFailed ? (
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
                onError={() => setImageFailed(true)}
              />
            ) : (
              <>
                <span className="big">{story.letter || "গ"}</span>
                <small>{story.writer}</small>
              </>
            )}
          </div>
        </div>

        {/* Info & Read Now Action */}
        <div className="detail-body">
          <h1 className="serif detail-title">{story.title}</h1>
          <div className="detail-author">{story.writer || "অজানা লেখক"}</div>

          <div className="meta">
            <span className="pill">
              <DocumentTextIcon size={15} />
              ই-বুক (eBook)
            </span>
            {progressPercent > 0 && (
              <span className="pill">
                {progressPercent}% পড়া হয়েছে
              </span>
            )}
          </div>

          <div className="detail-action">
            <button
              className="btn"
              onClick={() => onReadNow && onReadNow(story)}
            >
              <DocumentTextIcon size={18} color="#ffffff" />
              {progressPercent > 1 ? "Continue Reading" : "Read Now"}
            </button>
          </div>

          {/* Tabs */}
          <div
            className="tabs"
            role="tablist"
            style={{ gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}
          >
            <button
              role="tab"
              aria-selected={tab === "d"}
              onClick={() => setTab("d")}
            >
              Description
            </button>
            <button
              role="tab"
              aria-selected={tab === "i"}
              onClick={() => setTab("i")}
            >
              Details
            </button>
          </div>

          {/* Panel */}
          <div className="panel">
            {tab === "d" && (
              <div className="box">
                {story.description ||
                  `${story.title} — ${
                    story.writer ? `${story.writer}-এর ` : ""
                  }একটি অনবদ্য রচনা। "Read Now" বাটনে ক্লিক করে সরাসরি বইটি পড়ুন, বুকমার্ক ও নোট সংরক্ষণ করুন এবং ডাবল-ক্লিক করে পেজ-ফ্লিপার মোডে পাতা উল্টে পড়ুন।`}
              </div>
            )}

            {tab === "i" && (
              <div className="box" style={{ display: "grid", gap: "8px", fontSize: "14px" }}>
                <div>
                  <b>বইয়ের নাম:</b> {story.title}
                </div>
                <div>
                  <b>লেখক:</b> {story.writer || "অজানা"}
                </div>
                <div>
                  <b>সংস্করণ:</b> গল্পজল্প ডিজিটাল ই-বুক
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
