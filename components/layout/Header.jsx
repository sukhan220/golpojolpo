"use client";

import React, { useState } from "react";
import { SearchIcon, UserIcon } from "../Icons";
import { useAuth } from "../../context/AuthContext";
import { useAudioPlayer } from "../../context/AudioPlayerContext";

export default function Header({ onOpenSearch, onToggleProfile, onOpenRecent, title }) {
  const { user } = useAuth();
  const { recentPlaylistTracks = [] } = useAudioPlayer();
  const [recentImgErr, setRecentImgErr] = useState(false);

  const firstRecent = recentPlaylistTracks[0] || null;

  const handleOpenRecent = () => {
    if (typeof onOpenRecent === "function") {
      onOpenRecent();
    } else if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("golpojolpo:open-recent-playlist"));
    }
  };

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

      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        {/* Compact Recent 6 Playlist Pill next to Search */}
        <button
          type="button"
          className="recent-nav-pill"
          onClick={handleOpenRecent}
          aria-label="Recent Playlist"
          title="Recent (সর্বশেষ ৬টি অডিও)"
        >
          <span className="recent-nav-thumb">
            {firstRecent?.artwork && !recentImgErr ? (
              <img
                src={firstRecent.artwork}
                alt={firstRecent.title || "Recent"}
                onError={() => setRecentImgErr(true)}
              />
            ) : (
              <span>{firstRecent?.letter || "র"}</span>
            )}
          </span>
          <span className="recent-nav-label">Recent</span>
        </button>

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
