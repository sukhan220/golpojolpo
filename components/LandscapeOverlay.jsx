"use client";

import React, { useRef } from "react";
import { ContractIcon } from "./Icons";

const GOLD = "#D4AF37";

export default function LandscapeOverlay({
  showOverlay,
  zoomActive,
  currentLeafIndex,
  totalLeaves,
  currentPage,
  pages = [],
  onExitFullscreen,
  onLeafChange,
  resetOverlayTimer,
  isRotated90 = false,
}) {
  const sliderTrackRef = useRef(null);

  if (!showOverlay || zoomActive) return null;

  const totalPages = pages.length || 1;
  const safeTotalLeaves = Math.max(1, totalLeaves || Math.ceil(totalPages / 2));
  const safeCurrentLeaf = Math.min(safeTotalLeaves, Math.max(1, currentLeafIndex || 1));
  const progressPercent = Math.round((safeCurrentLeaf / safeTotalLeaves) * 100);

  const nextPageExists = currentPage + 1 < totalPages;
  const pageRangeText = nextPageExists
    ? `(Page: ${currentPage + 1}-${currentPage + 2})`
    : `(Page: ${currentPage + 1})`;

  const tickCount = Math.min(safeTotalLeaves, 30);

  // Compute leaf index from pointer position (supports both normal and 90-deg rotated mobile view)
  const updateLeafFromPointer = (clientX, clientY) => {
    const track = sliderTrackRef.current;
    if (!track || safeTotalLeaves <= 1) return;
    const rect = track.getBoundingClientRect();
    let ratio = 0;
    if (isRotated90) {
      ratio = (clientY - rect.top) / Math.max(1, rect.height);
    } else {
      ratio = (clientX - rect.left) / Math.max(1, rect.width);
    }
    const clamped = Math.max(0, Math.min(1, ratio));
    const leafIndex = Math.round(clamped * (safeTotalLeaves - 1));
    onLeafChange(leafIndex);
    resetOverlayTimer();
  };

  return (
    <div
      className="landscape-overlay-container"
      onClick={(e) => {
        e.stopPropagation();
        resetOverlayTimer();
      }}
    >
      {/* Top Bar: Contract / Return to normal button (top-left like the React Native LandscapeOverlay) */}
      <div className="landscape-top-bar" style={{ justifyContent: "flex-start" }}>
        <button
          type="button"
          className="landscape-contract-btn"
          onClick={(e) => {
            e.stopPropagation();
            onExitFullscreen();
          }}
          title="Exit Fullscreen"
          aria-label="Exit Fullscreen"
        >
          <ContractIcon size={24} color="white" />
        </button>
      </div>

      {/* Bottom Bar: Progress & Leaf slider */}
      <div
        className="landscape-bottom-bar"
        onClick={(e) => {
          e.stopPropagation();
          resetOverlayTimer();
        }}
      >
        <div className="landscape-info-row">
          <span className="landscape-progress-text">
            Progress: {progressPercent}%
          </span>
          <span className="landscape-leaf-text">
            Leaf: {safeCurrentLeaf} / {safeTotalLeaves}{" "}
            <strong style={{ color: GOLD }}>{pageRangeText}</strong>
          </span>
        </div>

        <div
          ref={sliderTrackRef}
          className="landscape-slider-wrapper"
          onTouchStart={(e) => {
            e.stopPropagation();
            if (e.touches[0]) {
              updateLeafFromPointer(e.touches[0].clientX, e.touches[0].clientY);
            }
          }}
          onTouchMove={(e) => {
            e.stopPropagation();
            if (e.touches[0]) {
              updateLeafFromPointer(e.touches[0].clientX, e.touches[0].clientY);
            }
          }}
        >
          {/* Tick mark indicators */}
          <div className="landscape-tick-row">
            {Array.from({ length: tickCount }).map((_, i) => (
              <span
                key={i}
                className="landscape-tick"
                style={{
                  backgroundColor:
                    i < safeCurrentLeaf - 1 ? GOLD : "rgba(255,255,255,0.6)",
                }}
              />
            ))}
          </div>

          <input
            type="range"
            min="0"
            max={Math.max(1, safeTotalLeaves - 1)}
            step="1"
            value={safeCurrentLeaf - 1}
            onChange={(e) => {
              const leafVal = Number(e.target.value);
              onLeafChange(leafVal);
              resetOverlayTimer();
            }}
            className="landscape-range-slider"
            aria-label="Page Spread Scrub"
          />
        </div>
      </div>
    </div>
  );
}
