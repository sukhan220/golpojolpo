"use client";

import React from "react";
import Header from "../layout/Header";

export default function MagazineView({
  magazines = [],
  onOpenSearch,
  onToggleProfile,
}) {
  return (
    <div className="view">
      <Header onOpenSearch={onOpenSearch} onToggleProfile={onToggleProfile} />

      <h2 style={{ marginTop: "6px" }}>ম্যাগাজিন</h2>

      <div className="stories">
        {magazines.map((m, i) => (
          <button
            key={m.id || i}
            className="tile"
            onClick={() => alert(`"${m.title}" সংখ্যা ${m.issue} শীঘ্রই আসছে!`)}
          >
            <div className={`cover tall ${i % 2 ? "alt" : ""}`}>
              <span className="big">{m.letter || "ম"}</span>
              <small>সংখ্যা {m.issue}</small>
            </div>
            <div className="tt">{m.title}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
