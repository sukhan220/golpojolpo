"use client";

import React from "react";

export default function BookLoader({ visible }) {
  if (!visible) return null;

  return (
    <div className="book-loader-container" role="status" aria-label="Loading book">
      <div className="book-loader-book">
        <div className="book-loader-left-page" />
        <div className="book-loader-right-page" />
        <div className="book-loader-flip-page" />
      </div>

      <div className="book-loader-bar-bg">
        <div className="book-loader-bar-fill" />
      </div>
    </div>
  );
}
