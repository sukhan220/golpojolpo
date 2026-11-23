"use client";

import React, { useEffect, useState } from "react";
import { DataService } from "../../lib/dataService";
import { useAudioPlayer, formatTime } from "../../context/AudioPlayerContext";
import {
  LeftArrowIcon,
  PlayIcon,
  PauseIcon,
  ClockIcon,
  MicIcon,
} from "../Icons";

export default function BookDetailView({ book, onBack, backLabel = "Back" }) {
  const [tab, setTab] = useState("d"); // 'd': Description, 'c': Clips, 'l': List
  const [nestedTracks, setNestedTracks] = useState(book?.tracks || []);
  const [imageFailed, setImageFailed] = useState(false);

  const {
    currentTrack,
    isPlaying,
    isBuffering,
    playTrack,
    togglePlay,
    openFullPlayer,
    seek,
    getClipsForBook,
    addAudioClip,
    removeAudioClip,
    playClipSegment,
    activeClipId,
  } = useAudioPlayer();

  const [showAddClipModal, setShowAddClipModal] = useState(false);
  const [newClipTitle, setNewClipTitle] = useState("");
  const [newClipContent, setNewClipContent] = useState("");
  const [newClipFrom, setNewClipFrom] = useState(0);
  const [newClipTo, setNewClipTo] = useState(60);

  if (!book) return null;

  // Listen to nested subcollections (e.g. books/{id}/tracks, chapters, episodes, parts)
  useEffect(() => {
    setImageFailed(false);
    setNestedTracks(book?.tracks || []);
    const unsub = DataService.listenBookNestedTracks(book, (tracks) => {
      setNestedTracks(tracks || []);
    });
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, [book]);

  const durationSec = book.durationSec || 1800;
  const userSavedClips = getClipsForBook(book);
  const defaultClips = book.clips || [
    { name: "শুরু", s: 0 },
    { name: "দ্বিতীয় অংশ", s: Math.round(durationSec * 0.3) },
    { name: "তৃতীয় অংশ", s: Math.round(durationSec * 0.6) },
    { name: "শেষ অংশ", s: Math.round(durationSec * 0.85) },
  ];
  const clips = [
    ...userSavedClips.map((c) => ({ ...c, isUserClip: true })),
    ...defaultClips.map((c) => ({ ...c, isUserClip: false })),
  ];

  const targetFirstTrack = nestedTracks.length > 0 ? nestedTracks[0] : book;

  const isCurrentBookLoaded =
    !currentTrack?.isMock &&
    Boolean(currentTrack?.id) &&
    (currentTrack.id === book.id ||
      (currentTrack.bookId && currentTrack.bookId === book.id) ||
      nestedTracks.some((t) => !t.isMock && t.id && t.id === currentTrack.id));

  const isCurrentBookPlaying = isPlaying && isCurrentBookLoaded;
  const isCurrentBookBuffering = isBuffering && isCurrentBookLoaded;

  // Play or Pause main book / first track in nested collection
  const handlePlayNow = () => {
    if (isCurrentBookPlaying) {
      // Just pause in-place without navigating into the full player screen
      togglePlay();
      return;
    }

    if (isCurrentBookLoaded) {
      togglePlay();
      openFullPlayer();
      return;
    }

    if (nestedTracks.length > 0) {
      playTrack(nestedTracks[0], nestedTracks);
    } else {
      playTrack(book, [book]);
    }
    openFullPlayer();
  };

  // Play or Pause specific nested track
  const handlePlayNestedTrack = (track) => {
    if (currentTrack?.id === track.id) {
      togglePlay();
    } else {
      playTrack(track, nestedTracks.length > 0 ? nestedTracks : [track]);
      openFullPlayer();
    }
  };

  const handlePlayClip = (seconds) => {
    if (!isCurrentBookLoaded) {
      if (nestedTracks.length > 0) {
        playTrack(nestedTracks[0], nestedTracks);
      } else {
        playTrack(book, [book]);
      }
    } else if (!isPlaying) {
      togglePlay();
    }
    seek(seconds);
    openFullPlayer();
  };

  const tabs = [
    { id: "d", label: "Description" },
    { id: "c", label: `Clips (${clips.length})` },
    {
      id: "l",
      label: nestedTracks.length > 0 ? `List (${nestedTracks.length})` : "List",
    },
  ];

  return (
    <div className="view">
      <button className="back" onClick={onBack}>
        <LeftArrowIcon />
        {backLabel}
      </button>

      <div className="detail">
        {/* Cover Art (Artwork or Typographic letter) */}
        <div>
          <div className="cover">
            {book.artwork && !imageFailed ? (
              <img
                src={book.artwork}
                alt={book.title}
                style={{
                  position: "absolute",
                  inset: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                }}
                onError={() => setImageFailed(true)}
              />
            ) : (
              <>
                <span className="big">{book.letter || "ব"}</span>
                <small>{book.artist || book.writer}</small>
              </>
            )}
          </div>
        </div>

        {/* Info & Actions */}
        <div className="detail-body">
          <h1 className="serif detail-title">
            {book.title}
          </h1>
          <div className="detail-author">
            {book.artist || book.writer}
          </div>

          <div className="meta">
            <span className="pill">
              <ClockIcon size={16} />
              {book.time || formatTime(durationSec)}
            </span>
            {book.voice && (
              <span className="pill">
                <MicIcon size={16} />
                কণ্ঠ: {book.voice}
              </span>
            )}
            {nestedTracks.length > 0 && (
              <span className="pill">
                {nestedTracks.length}টি পর্ব
              </span>
            )}
          </div>

          <div className="detail-action">
            <button className="btn" onClick={handlePlayNow}>
              {isCurrentBookBuffering ? (
                <>
                  <span className="gj-play-spinner" aria-hidden="true" />
                  লোড হচ্ছে...
                </>
              ) : (
                <>
                  {isCurrentBookPlaying ? <PauseIcon size={18} /> : <PlayIcon size={18} />}
                  {isCurrentBookPlaying ? "Pause" : "Play Now"}
                </>
              )}
            </button>
          </div>

          {/* Tabs */}
          <div className="tabs" role="tablist">
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Panel */}
          <div className="panel">
            {/* Description Tab */}
            {tab === "d" && (
              <div className="box">
                {book.description ||
                  "এই চমৎকার বইটি আপনার চিন্তাভাবনার জগতকে বদলে দেবে। শুনতে শুরু করুন গল্পজল্পে।"}
              </div>
            )}

            {/* Clips Tab */}
            {tab === "c" && (
              <div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "10px",
                  }}
                >
                  <span style={{ fontSize: "13px", color: "var(--mute)" }}>
                    সেভ করা ক্লিপ ও চ্যাপ্টার ({clips.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setNewClipFrom(0);
                      setNewClipTo(Math.min(durationSec, 60));
                      setNewClipTitle("");
                      setNewClipContent("");
                      setShowAddClipModal(true);
                    }}
                    style={{
                      padding: "5px 12px",
                      borderRadius: "999px",
                      background: "var(--ink)",
                      color: "#fff",
                      fontSize: "12px",
                      fontWeight: 600,
                    }}
                  >
                    + Add Clip
                  </button>
                </div>

                {clips.map((clip, i) => {
                  const isClipPlaying = clip.isUserClip && activeClipId === clip.id && isPlaying;
                  return (
                    <div
                      key={clip.id || i}
                      className="clip"
                      style={{
                        borderColor: isClipPlaying ? "var(--ink)" : undefined,
                        background: isClipPlaying ? "var(--soft)" : undefined,
                      }}
                    >
                      <button
                        type="button"
                        className="dot"
                        onClick={() => {
                          if (clip.isUserClip) {
                            playClipSegment(clip, false);
                          } else {
                            handlePlayClip(clip.s);
                          }
                        }}
                        title="Play Clip"
                      >
                        {isClipPlaying ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
                      </button>

                      <div
                        style={{ flex: 1, minWidth: 0, cursor: "pointer" }}
                        onClick={() => {
                          if (clip.isUserClip) {
                            playClipSegment(clip, true);
                          } else {
                            handlePlayClip(clip.s);
                          }
                        }}
                      >
                        <b>
                          {clip.title || clip.name}{" "}
                          <small style={{ fontWeight: 500, color: "var(--mute)" }}>
                            ({formatTime(clip.from ?? clip.s)}
                            {clip.to ? ` – ${formatTime(clip.to)}` : ""})
                          </small>
                        </b>
                        {clip.content && <span>{clip.content}</span>}
                      </div>

                      {clip.isUserClip && (
                        <button
                          type="button"
                          onClick={() => removeAudioClip(clip.id)}
                          style={{ color: "var(--mute)", fontSize: "14px", padding: "4px 6px" }}
                          title="Delete Clip"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* List Tab (Nested Tracks / Subcollections) */}
            {tab === "l" && (
              <div>
                {nestedTracks.length > 0 ? (
                  <div style={{ display: "grid", gap: "8px" }}>
                    <p style={{ margin: "0 0 10px", fontSize: "14px", color: "var(--mute)" }}>
                      এই অডিও কালেকশনে মোট {nestedTracks.length}টি পর্ব রয়েছে। যেকোনো পর্বে ক্লিক করে শুনুন:
                    </p>
                    {nestedTracks.map((tr, idx) => {
                      const isThisPlaying = isPlaying && currentTrack?.id === tr.id;
                      return (
                        <button
                          key={tr.id || idx}
                          className="clip"
                          style={{
                            borderColor: isThisPlaying ? "var(--ink)" : undefined,
                            backgroundColor: isThisPlaying ? "var(--soft)" : undefined,
                          }}
                          onClick={() => handlePlayNestedTrack(tr)}
                        >
                          <span
                            className="dot"
                            style={{
                              backgroundColor: isThisPlaying ? "var(--ink)" : undefined,
                            }}
                          >
                            {isThisPlaying ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
                          </span>

                          <div style={{ flex: 1, minWidth: 0 }}>
                            <b
                              style={{
                                display: "block",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              {tr.title}
                            </b>
                            <span>
                              {tr.voice ? `কণ্ঠ: ${tr.voice}` : tr.artist || book.artist} · {tr.time || formatTime(tr.durationSec)}
                            </span>
                          </div>

                          {isThisPlaying && (
                            <span style={{ fontSize: "13px", fontWeight: "600", color: "var(--ink)" }}>
                              চলছে...
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <button
                    className="clip"
                    onClick={handlePlayNow}
                    style={{
                      borderColor: isCurrentBookPlaying ? "var(--ink)" : undefined,
                      backgroundColor: isCurrentBookPlaying ? "var(--soft)" : undefined,
                    }}
                  >
                    <span className="dot">
                      {isCurrentBookPlaying ? <PauseIcon size={14} /> : <PlayIcon size={14} />}
                    </span>
                    <div>
                      <b>{book.title} (সম্পূর্ণ অডিও)</b>
                      <span>{book.time || formatTime(durationSec)}</span>
                    </div>
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Add Clip Modal directly from Book Detail Clips tab */}
      {showAddClipModal && (
        <div className="ovl" onClick={() => setShowAddClipModal(false)}>
          <div
            className="modal"
            role="dialog"
            aria-label="Clip and Note"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Clip &amp; Note</h3>
            <div className="ft">
              <div>
                <small>FROM</small>
                <b>{formatTime(newClipFrom)}</b>
              </div>
              <span>→</span>
              <div>
                <small>TO</small>
                <b>{formatTime(newClipTo)}</b>
              </div>
            </div>

            <input
              className="fld"
              placeholder="Clip Title..."
              value={newClipTitle}
              onChange={(e) => setNewClipTitle(e.target.value)}
            />
            <input
              className="fld"
              placeholder="Note content..."
              value={newClipContent}
              onChange={(e) => setNewClipContent(e.target.value)}
            />

            <div className="dual">
              <div className="tr" />
              <div
                className="rg"
                style={{
                  left: `${(newClipFrom / Math.max(1, durationSec)) * 100}%`,
                  width: `${Math.max(0, ((newClipTo - newClipFrom) / Math.max(1, durationSec)) * 100)}%`,
                }}
              />
              <input
                type="range"
                min="0"
                max={durationSec}
                value={newClipFrom}
                aria-label="From"
                onChange={(e) => setNewClipFrom(Math.min(Number(e.target.value), newClipTo))}
              />
              <input
                type="range"
                min="0"
                max={durationSec}
                value={newClipTo}
                aria-label="To"
                onChange={(e) => setNewClipTo(Math.max(Number(e.target.value), newClipFrom))}
              />
            </div>

            <button
              type="button"
              className="btn"
              style={{ width: "100%" }}
              onClick={() => {
                addAudioClip({
                  track: targetFirstTrack,
                  bookId: book.id,
                  trackId: targetFirstTrack.id,
                  bookTitle: book.title,
                  artist: book.artist || book.writer || "",
                  artwork: book.artwork || "",
                  url: targetFirstTrack.url || book.url || "",
                  title: newClipTitle,
                  content: newClipContent,
                  from: newClipFrom,
                  to: newClipTo,
                });
                setShowAddClipModal(false);
              }}
            >
              Save Clip
            </button>
            <button type="button" className="cl" onClick={() => setShowAddClipModal(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
