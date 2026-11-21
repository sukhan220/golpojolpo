"use client";

import React, { useState, useEffect, useRef } from "react";
import { useAudioPlayer, formatTime } from "../../context/AudioPlayerContext";
import {
  PlayIcon,
  PauseIcon,
  PrevIcon,
  NextIcon,
  Backward10Icon,
  Forward10Icon,
  PlaylistAddIcon,
  PlaylistCheckedIcon,
} from "../Icons";

export default function MiniPlayer({ isPlayerViewActive }) {
  const [imgError, setImgError] = useState(false);
  const [showPlaylistMenu, setShowPlaylistMenu] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [dragY, setDragY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);

  const dragStartYRef = useRef(null);
  const didDragMoveRef = useRef(false);

  const {
    currentTrack,
    playlist,
    playlistIndex,
    isPlaying,
    currentTime,
    duration,
    togglePlay,
    seek,
    skip,
    playNext,
    playPrev,
    playTrack,
    openFullPlayer,
    isMiniPlayerDismissed,
    dismissMiniPlayer,
    userPlaylists,
    isTrackInPlaylist,
    toggleTrackInUserPlaylist,
    createUserPlaylist,
  } = useAudioPlayer();

  useEffect(() => {
    setImgError(false);
    setDragY(0);
  }, [currentTrack?.id, currentTrack?.artwork, isMiniPlayerDismissed]);

  if (!currentTrack || isPlayerViewActive || isMiniPlayerDismissed) return null;

  const progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0;

  const hasPrevPart = Array.isArray(playlist) && playlist.length > 1 && playlistIndex > 0;
  const hasNextPart =
    Array.isArray(playlist) && playlist.length > 1 && playlistIndex < playlist.length - 1;

  const isSavedInAnyPlaylist = isTrackInPlaylist(currentTrack.id);

  const handleCreatePlaylist = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!newListName.trim()) return;
    createUserPlaylist(newListName.trim(), currentTrack);
    setNewListName("");
  };

  // Touch & Mouse slide-down gesture to dismiss MiniPlayer & stop audio
  const handleTouchStart = (e) => {
    if (e.target.closest(".mini-seek, .mini-ctl")) return;
    const touch = e.touches?.[0];
    if (!touch) return;
    dragStartYRef.current = touch.clientY;
    didDragMoveRef.current = false;
    setIsDragging(true);
  };

  const handleTouchMove = (e) => {
    if (dragStartYRef.current === null) return;
    const touch = e.touches?.[0];
    if (!touch) return;
    const deltaY = touch.clientY - dragStartYRef.current;
    if (deltaY > 4) {
      didDragMoveRef.current = true;
      setDragY(deltaY);
    } else {
      setDragY(0);
    }
  };

  const handleTouchEnd = () => {
    if (dragStartYRef.current === null) return;
    dragStartYRef.current = null;
    setIsDragging(false);
    if (dragY > 28) {
      setShowPlaylistMenu(false);
      dismissMiniPlayer();
      setDragY(0);
    } else {
      setDragY(0);
    }
  };

  const handleMouseDown = (e) => {
    if (e.target.closest(".mini-seek, .mini-ctl")) return;
    dragStartYRef.current = e.clientY;
    didDragMoveRef.current = false;
    setIsDragging(true);

    const onMouseMove = (moveEvt) => {
      if (dragStartYRef.current === null) return;
      const deltaY = moveEvt.clientY - dragStartYRef.current;
      if (deltaY > 4) {
        didDragMoveRef.current = true;
        setDragY(deltaY);
      } else {
        setDragY(0);
      }
    };

    const onMouseUp = (upEvt) => {
      const deltaY =
        dragStartYRef.current !== null ? upEvt.clientY - dragStartYRef.current : 0;
      dragStartYRef.current = null;
      setIsDragging(false);
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup", onMouseUp);
      if (deltaY > 28) {
        setShowPlaylistMenu(false);
        dismissMiniPlayer();
        setDragY(0);
      } else {
        setDragY(0);
      }
    };

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  };

  const handleMiniClick = () => {
    if (didDragMoveRef.current) {
      didDragMoveRef.current = false;
      return;
    }
    openFullPlayer();
  };

  return (
    <>
      {/* Backdrop & Add-to-Playlist Popover */}
      {showPlaylistMenu && (
        <>
          <div
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 25,
              background: "transparent",
            }}
            onClick={() => setShowPlaylistMenu(false)}
          />
          <div
            className="mini-pl-pop"
            role="dialog"
            aria-label="Add to Playlist"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mini-pl-head">
              <b>Add to Playlist</b>
              <button
                onClick={() => setShowPlaylistMenu(false)}
                aria-label="Close"
                style={{ fontSize: "14px", color: "var(--mute)", padding: "2px 6px" }}
              >
                ✕
              </button>
            </div>

            <div className="mini-pl-list">
              {userPlaylists.map((pl) => {
                const checked = isTrackInPlaylist(currentTrack.id, pl.id);
                return (
                  <div key={pl.id} className="mini-pl-item">
                    <label className="mini-pl-label">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleTrackInUserPlaylist(currentTrack, pl.id)}
                      />
                      <span>{pl.name}</span>
                      <small>({pl.tracks.length})</small>
                    </label>
                    {pl.tracks.length > 0 && (
                      <button
                        className="mini-pl-play"
                        title="এই প্লেলিস্ট প্লে করুন"
                        onClick={() => {
                          playTrack(pl.tracks[0], pl.tracks);
                          setShowPlaylistMenu(false);
                        }}
                      >
                        <PlayIcon size={13} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <form className="mini-pl-form" onSubmit={handleCreatePlaylist}>
              <input
                type="text"
                placeholder="New playlist name..."
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
              />
              <button type="submit">+ Add</button>
            </form>
          </div>
        </>
      )}

      {/* Mini Player Bar (Slide down to dismiss & stop audio) */}
      <div
        className="mini"
        role="button"
        tabIndex={0}
        aria-label="Open player (or slide down to close)"
        onClick={handleMiniClick}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onMouseDown={handleMouseDown}
        style={{
          transform: dragY > 0 ? `translateY(${dragY}px)` : undefined,
          opacity: dragY > 0 ? Math.max(0.25, 1 - dragY / 90) : 1,
          transition: isDragging ? "none" : "transform 0.2s ease, opacity 0.2s ease",
          touchAction: "none",
          userSelect: "none",
        }}
      >
        {/* Subtle top drag bar indicator */}
        <span className="mini-drag-bar" aria-hidden="true" />

        <div className="th">
          {currentTrack.artwork && !imgError ? (
            <img
              src={currentTrack.artwork}
              alt={currentTrack.title}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                borderRadius: "inherit",
              }}
              onError={() => setImgError(true)}
            />
          ) : (
            currentTrack.letter || "ব"
          )}
        </div>

        <div className="tx">
          <b>{currentTrack.title}</b>
          <span>
            {currentTrack.artist || currentTrack.writer} · {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>

        {/* Mini Player Action Controls */}
        <div
          className="mini-ctl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Previous Part (always visible, disabled if no previous part) */}
          <button
            className="mini-btn"
            aria-label="Previous part"
            title="পূর্ববর্তী পর্ব"
            disabled={!hasPrevPart}
            onClick={playPrev}
          >
            <PrevIcon size={17} />
          </button>

          {/* 10s Backward (always shown) */}
          <button
            className="mini-btn"
            aria-label="Backward 10 seconds"
            title="১০ সেকেন্ড পেছনে"
            onClick={() => skip(-10)}
          >
            <Backward10Icon size={19} />
          </button>

          {/* Play / Pause */}
          <button
            className="pp"
            aria-label={isPlaying ? "Pause" : "Play"}
            title={isPlaying ? "পজ করুন" : "প্লে করুন"}
            onClick={togglePlay}
          >
            {isPlaying ? <PauseIcon size={18} /> : <PlayIcon size={18} />}
          </button>

          {/* 10s Forward (always shown) */}
          <button
            className="mini-btn"
            aria-label="Forward 10 seconds"
            title="১০ সেকেন্ড সামনে"
            onClick={() => skip(10)}
          >
            <Forward10Icon size={19} />
          </button>

          {/* Next Part (always visible, disabled if no next part) */}
          <button
            className="mini-btn"
            aria-label="Next part"
            title="পরবর্তী পর্ব"
            disabled={!hasNextPart}
            onClick={playNext}
          >
            <NextIcon size={17} />
          </button>

          {/* Add to Playlist Button */}
          <button
            className={`mini-btn ${isSavedInAnyPlaylist ? "saved" : ""}`}
            aria-label="Add to Playlist"
            title="প্লেলিস্টে যুক্ত করুন"
            onClick={() => setShowPlaylistMenu((prev) => !prev)}
          >
            {isSavedInAnyPlaylist ? (
              <PlaylistCheckedIcon size={19} />
            ) : (
              <PlaylistAddIcon size={19} />
            )}
          </button>
        </div>

        {/* Interactive Progress Line (same visual design, draggable/clickable to seek) */}
        <div
          className="ln"
          onClick={(e) => e.stopPropagation()}
        >
          <i style={{ width: `${Math.min(100, Math.max(0, progressPercent))}%` }}></i>
          <input
            type="range"
            className="mini-seek"
            min="0"
            max={duration || 100}
            step="1"
            value={currentTime}
            onChange={(e) => seek(Number(e.target.value))}
            aria-label="Seek audio"
          />
        </div>
      </div>
    </>
  );
}
