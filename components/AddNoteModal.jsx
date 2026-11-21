"use client";

import { useEffect, useRef } from "react";

export default function AddNoteModal({
  visible,
  noteTitle,
  setNoteTitle,
  noteText,
  setNoteText,
  selectedText,
  onSave,
  onCancel,
}) {
  const titleInputRef = useRef(null);

  useEffect(() => {
    if (visible) {
      setTimeout(() => titleInputRef.current?.focus(), 60);
    }
  }, [visible]);

  if (!visible) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave();
  };

  return (
    <div
      className="add-note-overlay"
      onClick={onCancel}
      role="dialog"
      aria-modal="true"
      aria-label="Add New Note"
    >
      <form
        className="add-note-modal-box"
        onClick={(e) => e.stopPropagation()}
        onSubmit={handleSubmit}
      >
        <h3 className="add-note-header-title">Add New Note</h3>

        <input
          ref={titleInputRef}
          type="text"
          placeholder="Note Title (Optional)..."
          value={noteTitle}
          onChange={(e) => setNoteTitle(e.target.value)}
          className="add-note-title-input"
        />

        <div className="add-note-quote-box">
          <div className="add-note-quote-scroll">
            <span className="add-note-quote-text">“{selectedText}”</span>
          </div>
        </div>

        <textarea
          placeholder="আপনার মতামত বা নোট লিখুন..."
          value={noteText}
          onChange={(e) => setNoteText(e.target.value)}
          className="add-note-content-input"
          rows={3}
        />

        <div className="add-note-button-group">
          <button
            type="button"
            className="add-note-cancel-btn"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="add-note-save-btn"
          >
            Save Note
          </button>
        </div>
      </form>
    </div>
  );
}

