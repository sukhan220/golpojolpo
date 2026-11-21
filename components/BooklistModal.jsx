"use client";

import { useEffect, useRef, useState } from "react";
import { AddCircleOutlineIcon, CheckmarkCircleIcon } from "./Icons";

export default function BooklistModal({
  visible,
  onClose,
  booklists = {},
  bookId,
  onCreateBooklist,
  onToggleBooklist,
}) {
  const [newListName, setNewListName] = useState("");
  const inputRef = useRef(null);

  useEffect(() => {
    if (visible) {
      setTimeout(() => inputRef.current?.focus(), 60);
    } else {
      setNewListName("");
    }
  }, [visible]);

  if (!visible) return null;

  const handleCreate = (e) => {
    e.preventDefault();
    if (!newListName.trim()) return;
    onCreateBooklist(newListName.trim());
    setNewListName("");
  };

  const listEntries = Object.entries(booklists || {});

  return (
    <div
      className="booklist-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Save to Booklist"
    >
      <div
        className="booklist-modal-sidebar"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="booklist-header-row">
          <h3 className="booklist-title">Save to Booklist</h3>
          <button type="button" className="booklist-close-btn" onClick={onClose}>
            ×
          </button>
        </div>

        <form className="booklist-input-row" onSubmit={handleCreate}>
          <input
            ref={inputRef}
            type="text"
            placeholder="New booklist name"
            value={newListName}
            onChange={(e) => setNewListName(e.target.value)}
            className="booklist-text-input"
          />
          <button type="submit" className="booklist-create-btn">
            Create
          </button>
        </form>

        <div className="booklist-items-scroll">
          {listEntries.length === 0 ? (
            <p className="booklist-empty">কোনো বুকলিস্ট তৈরি করা নেই। উপরে নতুন বুকলিস্ট লিখুন।</p>
          ) : (
            listEntries.map(([id, list]) => {
              const added = Array.isArray(list.items) && list.items.includes(bookId);
              return (
                <button
                  key={id}
                  type="button"
                  className="booklist-item-row"
                  onClick={() => onToggleBooklist(id)}
                >
                  <span className="booklist-item-title">{list.title}</span>
                  <span className="booklist-item-icon">
                    {added ? (
                      <CheckmarkCircleIcon size={22} color="#6b4f2d" />
                    ) : (
                      <AddCircleOutlineIcon size={22} color="#888" />
                    )}
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

