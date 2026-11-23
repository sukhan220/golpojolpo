"use client";

import React, { useState, useEffect } from "react";
import { useAudioPlayer, formatTime } from "../../context/AudioPlayerContext";
import {
  LeftArrowIcon,
  PlayIcon,
  PauseIcon,
  PrevIcon,
  NextIcon,
  Backward10Icon,
  Forward10Icon,
  VolumeIcon,
} from "../Icons";

export default function PlayerView({ onBack }) {
  const [imageError, setImageError] = useState(false);
  const [activeModal, setActiveModal] = useState(null); // null | 'pl' | 'note'
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [clipTitle, setClipTitle] = useState("");
  const [clipNote, setClipNote] = useState("");
  const [clipFrom, setClipFrom] = useState(0);
  const [clipTo, setClipTo] = useState(60);

  const {
    currentTrack,
    playlist,
    playlistIndex,
    isPlaying,
    isBuffering,
    currentTime,
    duration,
    bufferedTime,
    speed,
    volume,
    audioError,
    togglePlay,
    seek,
    skip,
    playNext,
    playPrev,
    playTrack,
    setSpeed,
    setVolume,
    closeFullPlayer,
    userPlaylists,
    isTrackInPlaylist,
    toggleTrackInUserPlaylist,
    createUserPlaylist,
    getClipsForBook,
    addAudioClip,
    playClipSegment,
    activeClipId,
  } = useAudioPlayer();

  useEffect(() => {
    setImageError(false);
  }, [currentTrack?.id, currentTrack?.artwork]);

  if (!currentTrack) return null;

  const savedClips = getClipsForBook(currentTrack);
  const defaultClips = currentTrack.clips || [
    { name: "শুরু", s: 0 },
    { name: "দ্বিতীয় অংশ", s: Math.round(duration * 0.3) },
    { name: "তৃতীয় অংশ", s: Math.round(duration * 0.6) },
    { name: "শেষ অংশ", s: Math.round(duration * 0.85) },
  ];
  const allClips = [
    ...savedClips.map((c) => ({
      ...c,
      s: c.from,
      name: c.title || c.content || `ক্লিপ ${formatTime(c.from)}–${formatTime(c.to)}`,
      isUserClip: true,
    })),
    ...defaultClips,
  ].sort((a, b) => a.s - b.s);

  const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];

  const hasPrevPart = Array.isArray(playlist) && playlist.length > 1 && playlistIndex > 0;
  const hasNextPart =
    Array.isArray(playlist) && playlist.length > 1 && playlistIndex < playlist.length - 1;

  const handleBack = () => {
    closeFullPlayer();
    if (onBack) onBack();
  };

  const openClipModal = () => {
    const start = Math.floor(currentTime || 0);
    const maxD = Math.max(10, Math.floor(duration || 1800));
    setClipFrom(start);
    setClipTo(Math.min(maxD, start + 60));
    setClipTitle("");
    setClipNote("");
    setActiveModal("note");
  };

  const handleSaveClip = () => {
    addAudioClip({
      track: currentTrack,
      bookId: currentTrack.bookId || currentTrack.id,
      trackId: currentTrack.id,
      bookTitle: currentTrack.title,
      artist: currentTrack.artist || currentTrack.writer || "",
      artwork: currentTrack.artwork || "",
      url: currentTrack.url || "",
      title: clipTitle,
      content: clipNote,
      from: clipFrom,
      to: clipTo,
    });
    setActiveModal(null);
  };

  const handleHorizontalWheel = (e) => {
    const container = e.currentTarget;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && container.scrollWidth > container.clientWidth) {
      container.scrollLeft += e.deltaY;
    }
  };

  const maxClipDur = Math.max(1, Math.floor(duration || 1800));
  const rgLeftPct = (clipFrom / maxClipDur) * 100;
  const rgWidthPct = Math.max(0, ((clipTo - clipFrom) / maxClipDur) * 100);

  return (
    <div className="view player-screen">
      {/* Player Top Bar: Back + NOW PLAYING + Add to Playlist & Clip/Note buttons */}
      <div className="ptop">
        <button className="back" onClick={handleBack} style={{ marginBottom: 0 }}>
          <LeftArrowIcon />
          Back
        </button>

        <span className="pt">NOW PLAYING</span>

        <span className="pact">
          <button
            type="button"
            onClick={() => setActiveModal("pl")}
            aria-label="Add to playlist"
            title="Add to Playlist"
          >
            <svg viewBox="0 0 24 24">
              <path d="M4 6h12M4 11h12M4 16h7M17 14v6M14 17h6" />
            </svg>
          </button>
          <button
            type="button"
            onClick={openClipModal}
            aria-label="Clip and note"
            title="Clip & Note"
          >
            <svg viewBox="0 0 24 24">
              <path d="M6 3h8l4 4v14H6zM12 11v6M9 14h6" />
            </svg>
          </button>
        </span>
      </div>

      {audioError && (
        <div
          style={{
            padding: "8px 14px",
            backgroundColor: "#fff0f0",
            border: "1px solid #ffd0d0",
            borderRadius: "10px",
            color: "#c0392b",
            fontSize: "13px",
            marginBottom: "10px",
          }}
        >
          {audioError}
        </div>
      )}

      <div className="player">
        {/* Cover Art with Artwork image and letter fallback */}
        <div className="cover">
          {currentTrack.artwork && !imageError ? (
            <img
              src={currentTrack.artwork}
              alt={currentTrack.title}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
              onError={() => setImageError(true)}
            />
          ) : (
            <>
              <span className="big">{currentTrack.letter || "ব"}</span>
              <small>{currentTrack.artist || currentTrack.writer}</small>
            </>
          )}
        </div>

        <div className="right">
          <div>
            <h3>{currentTrack.title}</h3>
            <div className="au">{currentTrack.artist || currentTrack.writer}</div>
            {currentTrack.voice && (
              <div className="au" style={{ fontSize: "13px", marginTop: "2px" }}>
                কণ্ঠ: {currentTrack.voice}
                {playlist.length > 1 ? ` · পর্ব ${playlistIndex + 1}/${playlist.length}` : ""}
              </div>
            )}
          </div>

          {/* Nested Parts / Episodes horizontal selector (if multiple parts exist) */}
          {playlist.length > 1 && (
            <div>
              <p className="hint">পর্বসমূহ ({playlist.length}টি পর্ব)</p>
              <div className="sp horiz-scroll" onWheel={handleHorizontalWheel}>
                {playlist.map((track, idx) => {
                  const isCurrent = currentTrack.id === track.id;
                  return (
                    <button
                      key={track.id || idx}
                      onClick={() => playTrack(track, playlist)}
                      aria-pressed={isCurrent}
                    >
                      পর্ব {idx + 1}: {track.title}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quick Chapters / Clips (includes user-saved Clips & Notes right on top!) */}
          <div>
            <p className="hint">Clips and chapters ({allClips.length})</p>
            <div className="sp horiz-scroll" onWheel={handleHorizontalWheel}>
              {allClips.map((c, i) => (
                <button
                  key={c.id || i}
                  onClick={() => (c.isUserClip ? playClipSegment(c, false) : seek(c.s))}
                  aria-pressed={
                    c.isUserClip
                      ? activeClipId === c.id
                      : currentTime >= c.s &&
                        (i === allClips.length - 1 || currentTime < allClips[i + 1].s)
                  }
                  title={c.content || c.name}
                >
                  {c.isUserClip ? "✂ " : ""}
                  {c.name} ({formatTime(c.s)}
                  {c.to ? `–${formatTime(c.to)}` : ""})
                </button>
              ))}
            </div>
          </div>

          {/* Seekbar with YouTube-style 3-Layer Progress Track (Unbuffered -> Buffered -> Played) */}
          <div>
            <div className="seek">
              <div className="seek-buffer-track" aria-hidden="true">
                <div
                  className="seek-buffer-fill"
                  style={{
                    width: `${
                      duration > 0 ? Math.min(100, (bufferedTime / duration) * 100) : 0
                    }%`,
                  }}
                />
                <div
                  className="seek-played-fill"
                  style={{
                    width: `${
                      duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0
                    }%`,
                  }}
                />
              </div>
              <div className="ticks">
                {allClips.map((c, i) => {
                  const percent = duration > 0 ? (c.s / duration) * 100 : 0;
                  return (
                    <i
                      key={c.id || i}
                      style={{
                        left: `calc(${percent}% + ${8 - (percent / 100) * 16}px)`,
                      }}
                    />
                  );
                })}
              </div>

              <input
                type="range"
                id="seek"
                className="seek-range-yt"
                min="0"
                max={duration || 100}
                value={currentTime}
                onChange={(e) => seek(Number(e.target.value))}
                aria-label="Seek"
              />
            </div>

            <div className="times">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>

          {/* Controls: Prev, -10s, Play/Pause, +10s, Next */}
          <div className="ctl">
            <button
              onClick={playPrev}
              disabled={!hasPrevPart}
              aria-label="Previous episode"
              title="পূর্ববর্তী পর্ব"
            >
              <PrevIcon />
            </button>

            <button
              onClick={() => skip(-10)}
              aria-label="Back 10 seconds"
              title="১০ সেকেন্ড পেছনে"
            >
              <Backward10Icon />
            </button>

            <button
              className="pp"
              onClick={togglePlay}
              aria-label={isBuffering ? "Loading" : isPlaying ? "Pause" : "Play"}
            >
              {isBuffering ? (
                <span className="gj-play-spinner lg" aria-hidden="true" />
              ) : isPlaying ? (
                <PauseIcon size={26} />
              ) : (
                <PlayIcon size={26} />
              )}
            </button>

            <button
              onClick={() => skip(10)}
              aria-label="Forward 10 seconds"
              title="১০ সেকেন্ড সামনে"
            >
              <Forward10Icon />
            </button>

            <button
              onClick={playNext}
              disabled={!hasNextPart}
              aria-label="Next episode"
              title="পরবর্তী পর্ব"
            >
              <NextIcon />
            </button>
          </div>

          {/* Playback speed */}
          <div>
            <p className="hint">Playback speed</p>
            <div className="sp">
              {speeds.map((s) => (
                <button
                  key={s}
                  onClick={() => setSpeed(s)}
                  aria-pressed={speed === s}
                >
                  {s}x
                </button>
              ))}
            </div>
          </div>

          {/* Volume */}
          <label className="vol">
            <VolumeIcon />
            <input
              type="range"
              id="vol"
              min="0"
              max="100"
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
              aria-label="Volume"
            />
          </label>
        </div>
      </div>

      {/* Add to Playlist Modal (matching design #m-pl) */}
      {activeModal === "pl" && (
        <div className="ovl" onClick={() => setActiveModal(null)}>
          <div
            className="modal"
            role="dialog"
            aria-label="Add to Playlist"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Add to Playlist</h3>
            <input
              className="fld"
              placeholder="Playlist Name"
              value={newPlaylistName}
              onChange={(e) => setNewPlaylistName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && newPlaylistName.trim()) {
                  createUserPlaylist(newPlaylistName, currentTrack);
                  setNewPlaylistName("");
                }
              }}
            />
            <button
              type="button"
              className="btn"
              style={{ marginTop: "12px", width: "100%" }}
              onClick={() => {
                if (newPlaylistName.trim()) {
                  createUserPlaylist(newPlaylistName, currentTrack);
                  setNewPlaylistName("");
                }
              }}
            >
              Create &amp; Add
            </button>

            <div style={{ marginTop: "10px", maxHeight: "220px", overflowY: "auto" }}>
              {userPlaylists.map((pl) => {
                const isAdded = isTrackInPlaylist(currentTrack.id, pl.id);
                return (
                  <div key={pl.id} className="plrow">
                    <span>
                      {pl.name} ({pl.tracks.length})
                    </span>
                    <button
                      type="button"
                      className="plus"
                      aria-pressed={isAdded}
                      aria-label={`Add to ${pl.name}`}
                      onClick={() => toggleTrackInUserPlaylist(currentTrack, pl.id)}
                    >
                      {isAdded ? (
                        <svg viewBox="0 0 24 24" style={{ width: "16px", height: "16px" }}>
                          <path d="M5 12l5 5 9-10" />
                        </svg>
                      ) : (
                        <svg viewBox="0 0 24 24" style={{ width: "16px", height: "16px" }}>
                          <path d="M12 5v14M5 12h14" />
                        </svg>
                      )}
                    </button>
                  </div>
                );
              })}
            </div>

            <button type="button" className="cl" onClick={() => setActiveModal(null)}>
              Close
            </button>
          </div>
        </div>
      )}

      {/* Clip & Note Modal (matching design #m-note with Dual Range Slider) */}
      {activeModal === "note" && (
        <div className="ovl" onClick={() => setActiveModal(null)}>
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
                <b>{formatTime(clipFrom)}</b>
              </div>
              <span>→</span>
              <div>
                <small>TO</small>
                <b>{formatTime(clipTo)}</b>
              </div>
            </div>

            <input
              className="fld"
              placeholder="Clip Title (optional)..."
              value={clipTitle}
              onChange={(e) => setClipTitle(e.target.value)}
            />
            <input
              className="fld"
              placeholder="Note content..."
              value={clipNote}
              onChange={(e) => setClipNote(e.target.value)}
            />

            <div className="dual">
              <div className="tr" />
              <div
                className="rg"
                style={{ left: `${rgLeftPct}%`, width: `${rgWidthPct}%` }}
              />
              <input
                type="range"
                min="0"
                max={maxClipDur}
                value={clipFrom}
                aria-label="From"
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setClipFrom(Math.min(v, clipTo));
                }}
              />
              <input
                type="range"
                min="0"
                max={maxClipDur}
                value={clipTo}
                aria-label="To"
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setClipTo(Math.max(v, clipFrom));
                }}
              />
            </div>

            <button
              type="button"
              className="btn"
              style={{ width: "100%" }}
              onClick={handleSaveClip}
            >
              Save Clip
            </button>
            <button type="button" className="cl" onClick={() => setActiveModal(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
