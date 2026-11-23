"use client";

import React, { useState, useEffect, useRef } from "react";
import { useAudioPlayer } from "../../context/AudioPlayerContext";
import {
  LeftArrowIcon,
  SearchIcon,
  PlayIcon,
  PauseIcon,
  PrevIcon,
  NextIcon,
} from "../Icons";

export default function PlaylistDetailView({ playlistId, onBack, onOpenSearch }) {
  const {
    userPlaylists = [],
    recentPlaylistTracks = [],
    currentTrack,
    playlist: activePlaylist,
    playlistIndex,
    isPlaying,
    isBuffering,
    playTrack,
    togglePlay,
    playPrev,
    playNext,
    openFullPlayer,
    toggleTrackInUserPlaylist,
    removeFromRecentPlaylist,
  } = useAudioPlayer();

  const [sheetTrack, setSheetTrack] = useState(null);
  const [coverError, setCoverError] = useState(false);
  const [thumbErrors, setThumbErrors] = useState({});
  const [isScrolled, setIsScrolled] = useState(false);
  const viewRef = useRef(null);

  useEffect(() => {
    setCoverError(false);
    setIsScrolled(false);
  }, [playlistId]);

  // Smooth scroll listener on <main> with hysteresis (zero vibration/jitter!)
  useEffect(() => {
    const mainEl = viewRef.current?.closest("main");
    if (!mainEl) return;

    let rafId = null;
    const handleScroll = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        const top = mainEl.scrollTop;
        setIsScrolled((prev) => {
          if (!prev && top > 125) return true;
          if (prev && top < 80) return false;
          return prev;
        });
      });
    };

    handleScroll();
    mainEl.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      mainEl.removeEventListener("scroll", handleScroll);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [playlistId]);

  const isRecentPlaylist = playlistId === "__recent__";

  const targetPlaylist = isRecentPlaylist
    ? {
        id: "__recent__",
        name: "Recent",
        tracks: recentPlaylistTracks,
        isRecent: true,
      }
    : userPlaylists.find((p) => p.id === playlistId) || userPlaylists[0] || null;

  if (!targetPlaylist) {
    return (
      <div className="view">
        <div className="phead2">
          <button className="back" onClick={onBack} style={{ margin: 0 }}>
            <LeftArrowIcon />
            Play List
          </button>
        </div>
        <div className="box" style={{ color: "var(--mute)" }}>
          প্লেলিস্টটি পাওয়া যায়নি।
        </div>
      </div>
    );
  }

  const tracks = Array.isArray(targetPlaylist.tracks) ? targetPlaylist.tracks : [];
  const first = tracks[0] || null;
  const hasCoverImg = Boolean(first?.artwork) && !coverError;

  // Check if the full sequential playlist queue is currently active
  const isSequentialQueueActive =
    tracks.length > 0 &&
    Boolean(currentTrack?.id) &&
    Array.isArray(activePlaylist) &&
    activePlaylist.length === tracks.length &&
    activePlaylist.every((t, i) => t && tracks[i] && t.id === tracks[i].id);

  const isPlayAllPlaying = isSequentialQueueActive && isPlaying;
  const isPlayAllBuffering = isSequentialQueueActive && isBuffering;
  const canPrev = isSequentialQueueActive && playlistIndex > 0;
  const canNext = isSequentialQueueActive && playlistIndex < tracks.length - 1;

  // Play All: plays tracks sequentially one after another right in-place
  const handlePlayAll = () => {
    if (tracks.length === 0) return;
    if (isSequentialQueueActive) {
      togglePlay();
      return;
    }
    playTrack(tracks[0], tracks);
  };

  // Single-track Play/Pause button: plays ONLY this single track in-place (stays on playlist page)
  const handlePlaySingleInPlace = (track) => {
    if (currentTrack?.id === track.id) {
      togglePlay();
    } else {
      playTrack(track, [track]);
    }
  };

  // Clicking the middle (title/author/thumbnail): plays track & navigates to the Full Audio Player
  const handleOpenInFullPlayer = (track) => {
    if (currentTrack?.id !== track.id) {
      playTrack(track, tracks);
    } else if (!isPlaying) {
      togglePlay();
    }
    openFullPlayer();
  };

  return (
    <div ref={viewRef} className="view">
      {/* Fixed-height Sticky Top Bar: matches HTML .phead2 at top; morphs into Cover + Name + Prev / Play All / Next on scroll */}
      <div className={`sticky-page-header pl-sticky-bar${isScrolled ? " is-scrolled" : ""}`}>
        <div className="pl-sticky-left">
          <button
            type="button"
            className="pl-back-icon"
            onClick={onBack}
            aria-label="Back"
          >
            <LeftArrowIcon />
          </button>

          {!isScrolled && (
            <button
              type="button"
              className="pl-back-title"
              onClick={onBack}
            >
              {targetPlaylist.name}
            </button>
          )}

          <div className={`pl-compact-identity${isScrolled ? " is-visible" : ""}`}>
            <span className="pl-sticky-cov">
              {hasCoverImg ? (
                <img
                  src={first.artwork}
                  alt={targetPlaylist.name}
                  onError={() => setCoverError(true)}
                />
              ) : (
                <span>
                  {first?.letter || targetPlaylist.name.trim().charAt(0) || "গ"}
                </span>
              )}
            </span>

            <div className="pl-sticky-meta">
              <strong className="serif">{targetPlaylist.name}</strong>
              <span>{tracks.length}টি অডিও</span>
            </div>
          </div>
        </div>

        <div className="pl-sticky-right">
          <div className={`pl-sticky-controls${isScrolled ? " is-visible" : ""}`}>
            <button
              type="button"
              className="pl-rnd-sm"
              disabled={!canPrev}
              aria-label="Previous"
              title="পূর্ববর্তী"
              onClick={playPrev}
            >
              <PrevIcon size={15} />
            </button>

            <button
              type="button"
              className="btn pl-pall-sm"
              disabled={tracks.length === 0}
              onClick={handlePlayAll}
            >
              {isPlayAllBuffering ? (
                <>
                  <span className="gj-play-spinner" aria-hidden="true" />
                  <span>Load</span>
                </>
              ) : isPlayAllPlaying ? (
                <>
                  <PauseIcon size={15} />
                  <span>Pause</span>
                </>
              ) : (
                <>
                  <PlayIcon size={15} />
                  <span>Play All</span>
                </>
              )}
            </button>

            <button
              type="button"
              className="pl-rnd-sm"
              disabled={!canNext}
              aria-label="Next"
              title="পরবর্তী"
              onClick={playNext}
            >
              <NextIcon size={15} />
            </button>
          </div>

          <button
            type="button"
            className="pl-search-sm"
            aria-label="Search"
            onClick={onOpenSearch}
          >
            <SearchIcon size={19} />
          </button>
        </div>
      </div>

      {/* Original HTML Hero Design (Cover + Playlist Name + Prev / Play All / Next) */}
      <div className="pcov">
        <div className="cover">
          {hasCoverImg ? (
            <img
              src={first.artwork}
              alt={targetPlaylist.name}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "cover",
              }}
              onError={() => setCoverError(true)}
            />
          ) : (
            <>
              <span className="big">
                {first?.letter || targetPlaylist.name.trim().charAt(0) || "গ"}
              </span>
              <small>{first?.artist || first?.writer || ""}</small>
            </>
          )}
        </div>
      </div>

      <h1 className="serif pn">{targetPlaylist.name}</h1>

      <div className="pctl">
        <button
          type="button"
          className="rnd"
          disabled={!canPrev}
          aria-label="Previous"
          onClick={playPrev}
        >
          <PrevIcon size={18} />
        </button>

        <button
          type="button"
          className="btn pall"
          disabled={tracks.length === 0}
          onClick={handlePlayAll}
        >
          {isPlayAllBuffering ? (
            <>
              <span className="gj-play-spinner" aria-hidden="true" />
              Loading...
            </>
          ) : isPlayAllPlaying ? (
            <>
              <PauseIcon size={18} />
              Pause
            </>
          ) : (
            <>
              <PlayIcon size={18} />
              Play All
            </>
          )}
        </button>

        <button
          type="button"
          className="rnd"
          disabled={!canNext}
          aria-label="Next"
          onClick={playNext}
        >
          <NextIcon size={18} />
        </button>
      </div>

      <div className="tl">
        {tracks.length > 0 ? (
          tracks.map((track) => {
            const isCurrent = currentTrack?.id === track.id;
            const isRowPlaying = isCurrent && isPlaying;
            const isRowBuffering = isCurrent && isBuffering;
            const hasThumb = Boolean(track.artwork) && !thumbErrors[track.id];

            return (
              <div className="trow" key={track.id}>
                <span
                  className="th2"
                  style={{ position: "relative", overflow: "hidden", cursor: "pointer" }}
                  onClick={() => handleOpenInFullPlayer(track)}
                >
                  {hasThumb ? (
                    <img
                      src={track.artwork}
                      alt={track.title}
                      style={{
                        position: "absolute",
                        inset: 0,
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                      onError={() =>
                        setThumbErrors((prev) => ({ ...prev, [track.id]: true }))
                      }
                    />
                  ) : (
                    track.letter || "ব"
                  )}
                </span>

                <div
                  className="tx"
                  style={{ cursor: "pointer" }}
                  onClick={() => handleOpenInFullPlayer(track)}
                >
                  <b className="serif">{track.title}</b>
                  <span>{track.artist || track.writer || ""}</span>
                </div>

                <button
                  type="button"
                  className="pl2"
                  aria-label={isRowPlaying ? `Pause ${track.title}` : `Play ${track.title}`}
                  onClick={() => handlePlaySingleInPlace(track)}
                >
                  {isRowBuffering ? (
                    <span className="gj-play-spinner" aria-hidden="true" />
                  ) : isRowPlaying ? (
                    <PauseIcon size={16} />
                  ) : (
                    <PlayIcon size={16} />
                  )}
                </button>

                <button
                  type="button"
                  className="more"
                  aria-label="More"
                  onClick={() => setSheetTrack(track)}
                >
                  <svg className="f" viewBox="0 0 24 24" style={{ width: 20, height: 20 }}>
                    <circle cx="12" cy="5" r="1.8" />
                    <circle cx="12" cy="12" r="1.8" />
                    <circle cx="12" cy="19" r="1.8" />
                  </svg>
                </button>
              </div>
            );
          })
        ) : (
          <div className="box" style={{ color: "var(--mute)", marginTop: "16px" }}>
            {isRecentPlaylist
              ? "এখনও কোনো অডিও শোনা হয়নি।"
              : "এই প্লেলিস্টে এখনও কোনো গল্প নেই।"}
          </div>
        )}
      </div>

      {/* Bottom Action Sheet for Track Options */}
      {sheetTrack && (
        <div
          className="ovl sheet"
          role="dialog"
          aria-modal="true"
          aria-label="Track options"
          onClick={() => setSheetTrack(null)}
        >
          <div className="sh" onClick={(e) => e.stopPropagation()}>
            <i className="grab" />
            <h3>{sheetTrack.title}</h3>
            <button
              type="button"
              className="shr"
              onClick={() => {
                if (isRecentPlaylist) {
                  removeFromRecentPlaylist(sheetTrack.id);
                } else {
                  toggleTrackInUserPlaylist(sheetTrack, targetPlaylist.id);
                }
                setSheetTrack(null);
              }}
            >
              <span className="ic">
                <svg viewBox="0 0 24 24">
                  <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" />
                </svg>
              </span>
              {isRecentPlaylist ? "Remove from Recent" : "Remove from Playlist"}
            </button>
            <button
              type="button"
              className="shr"
              onClick={() => setSheetTrack(null)}
            >
              <span className="ic">
                <svg viewBox="0 0 24 24">
                  <path d="M6 6l12 12M18 6L6 18" />
                </svg>
              </span>
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
