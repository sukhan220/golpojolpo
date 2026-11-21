"use client";

import React from "react";
import { SearchIcon, UserIcon } from "../Icons";

export default function Header({ onOpenSearch, onToggleProfile, title }) {
  return (
    <div className="top">
      {title ? (
        <h1 className="brand">{title}</h1>
      ) : (
        <img
          className="lg"
          src="/logo.svg"
          alt="গল্পজল্প"
          style={{ height: "44px", width: "auto", cursor: "pointer" }}
        />
      )}

      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <button
          aria-label="Search"
          onClick={onOpenSearch}
          className="me"
          style={{ border: "none" }}
        >
          <SearchIcon size={20} />
        </button>

        <button
          className="me"
          onClick={onToggleProfile}
          aria-label="প্রোফাইল ও সেটিং"
          aria-haspopup="dialog"
        >
          <UserIcon size={20} />
        </button>
      </div>
    </div>
  );
}
