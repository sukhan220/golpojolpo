"use client";

import React from "react";
import { SearchIcon, UserIcon } from "../Icons";
import { useAuth } from "../../context/AuthContext";

export default function Header({ onOpenSearch, onToggleProfile, title }) {
  const { user } = useAuth();

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
          style={{ overflow: "hidden", padding: 0 }}
        >
          {user?.avatar ? (
            <img
              src={user.avatar}
              alt={user.name || "User"}
              referrerPolicy="no-referrer"
              style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "50%" }}
            />
          ) : user?.name ? (
            <span style={{ fontWeight: 700, fontSize: "14px" }}>
              {user.name.trim().charAt(0).toUpperCase()}
            </span>
          ) : (
            <UserIcon size={20} />
          )}
        </button>
      </div>
    </div>
  );
}
