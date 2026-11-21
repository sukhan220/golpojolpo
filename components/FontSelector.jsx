"use client";

import { useState } from "react";

export const FONTS_LIST = [
  { name: "serif", family: "serif" },
  { name: "Tiro Bangla", family: '"Tiro Bangla", serif' },
  { name: "Anek Bangla", family: '"Anek Bangla", sans-serif' },
  { name: "Noto Sans Bengali", family: '"Noto Sans Bengali", sans-serif' },
  { name: "Hind Siliguri", family: '"Hind Siliguri", sans-serif' },
];

export default function FontSelector({ selectedFont, onSelect }) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="font-selector-wrap">
      <button
        type="button"
        className="font-selector-compact"
        onClick={() => setVisible(true)}
        aria-label="Select font"
      >
        <span className="font-selector-text">{selectedFont} ⌄</span>
      </button>

      {visible && (
        <div
          className="font-modal-overlay"
          onClick={() => setVisible(false)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="font-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="font-modal-title">Select Reading Font</div>
            {FONTS_LIST.map((item) => (
              <button
                key={item.name}
                type="button"
                className={`font-option ${selectedFont === item.name ? "active" : ""}`}
                style={{ fontFamily: item.family }}
                onClick={() => {
                  onSelect(item.name, item.family);
                  setVisible(false);
                }}
              >
                <span>{item.name}</span>
                {selectedFont === item.name && <span className="font-check">✓</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

