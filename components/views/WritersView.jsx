"use client";

import React from "react";
import Header from "../layout/Header";

export default function WritersView({
  writers,
  onSelectWriter,
  onOpenSearch,
  onToggleProfile,
}) {
  return (
    <div className="view">
      <div className="sticky-page-header">
        <Header onOpenSearch={onOpenSearch} onToggleProfile={onToggleProfile} />
        <h2 style={{ marginTop: "4px", marginBottom: "6px" }}>লেখকবৃন্দ</h2>
      </div>

      <div className="wl">
        {writers.map((writer) => (
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
            <div>
              <span className="serif" style={{ display: "block" }}>
                {writer.name || writer.bn}
              </span>
              {writer.categories && writer.categories.length > 0 && (
                <small style={{ color: "var(--mute)", fontSize: "13px" }}>
                  {writer.categories.slice(0, 3).join(", ")}
                </small>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
