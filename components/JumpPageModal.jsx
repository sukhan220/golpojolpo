"use client";

import { useEffect, useRef, useState } from "react";

export default function JumpPageModal({ visible, onClose, pagesLength, onJump }) {
  const [input, setInput] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (visible) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setInput("");
    }
  }, [visible]);

  if (!visible) return null;

  const handleGo = (e) => {
    e?.preventDefault();
    const p = Number(input) - 1;
    if (p >= 0 && p < pagesLength) {
      onJump(p);
    }
    setInput("");
    onClose();
  };

  return (
    <div
      className="jump-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Go To Page"
    >
      <form
        className="jump-box"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleGo}
      >
        <h3 className="jump-title">Go To Page</h3>
        <p className="jump-subtitle">Total Page: {pagesLength}</p>

        <input
          ref={inputRef}
          type="number"
          min="1"
          max={pagesLength}
          placeholder="Page Number"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          className="jump-input"
          required
        />

        <div className="jump-buttons">
          <button
            type="button"
            className="jump-cancel-btn"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="jump-go-btn"
          >
            GO
          </button>
        </div>
      </form>
    </div>
  );
}

