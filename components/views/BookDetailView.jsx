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
    playTrack,
    togglePlay,
    openFullPlayer,
    seek,
  } = useAudioPlayer();

  if (!book) return null;

  // Listen to nested subcollections (e.g. books/{id}/tracks, chapters, episodes, parts)
  useEffect(() => {
    setImageFailed(false);
    const unsub = DataService.listenBookNestedTracks(book, (tracks) => {
      setNestedTracks(tracks || []);
    });
    return () => {
      if (typeof unsub === "function") unsub();
    };
  }, [book]);

  const durationSec = book.durationSec || 1800;
  const clips = book.clips || [
    { name: "শুরু", s: 0 },
    { name: "দ্বিতীয় অংশ", s: Math.round(durationSec * 0.3) },
    { name: "তৃতীয় অংশ", s: Math.round(durationSec * 0.6) },
    { name: "শেষ অংশ", s: Math.round(durationSec * 0.85) },
  ];

  const targetFirstTrack = nestedTracks.length > 0 ? nestedTracks[0] : book;

  const isCurrentBookLoaded =
    !currentTrack?.isMock &&
    Boolean(currentTrack?.url) &&
    (currentTrack?.url === targetFirstTrack?.url ||
      nestedTracks.some((t) => !t.isMock && t.url && t.url === currentTrack?.url));

  const isCurrentBookPlaying = isPlaying && isCurrentBookLoaded;

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
              {isCurrentBookPlaying ? <PauseIcon size={18} /> : <PlayIcon size={18} />}
              {isCurrentBookPlaying ? "Pause" : "Play Now"}
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
                {clips.map((clip, i) => (
                  <button
                    key={i}
                    className="clip"
                    onClick={() => handlePlayClip(clip.s)}
                  >
                    <span className="dot">
                      <PlayIcon size={14} />
                    </span>
                    <div>
                      <b>{formatTime(clip.s)}</b>
                      <span>{clip.name}</span>
                    </div>
                  </button>
                ))}
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
    </div>
  );
}
