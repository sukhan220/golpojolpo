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
  const {
    currentTrack,
    playlist,
    playlistIndex,
    isPlaying,
    currentTime,
    duration,
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
  } = useAudioPlayer();

  useEffect(() => {
    setImageError(false);
  }, [currentTrack?.id, currentTrack?.artwork]);

  if (!currentTrack) return null;

  const clips = currentTrack.clips || [
    { name: "শুরু", s: 0 },
    { name: "দ্বিতীয় অংশ", s: Math.round(duration * 0.3) },
    { name: "তৃতীয় অংশ", s: Math.round(duration * 0.6) },
    { name: "শেষ অংশ", s: Math.round(duration * 0.85) },
  ];

  const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];

  const hasPrevPart = Array.isArray(playlist) && playlist.length > 1 && playlistIndex > 0;
  const hasNextPart =
    Array.isArray(playlist) && playlist.length > 1 && playlistIndex < playlist.length - 1;

  const handleBack = () => {
    closeFullPlayer();
    if (onBack) onBack();
  };

  const handleHorizontalWheel = (e) => {
    const container = e.currentTarget;
    if (Math.abs(e.deltaY) > Math.abs(e.deltaX) && container.scrollWidth > container.clientWidth) {
      container.scrollLeft += e.deltaY;
    }
  };

  return (
    <div className="view player-screen">
      <button className="back" onClick={handleBack} style={{ marginBottom: "8px" }}>
        <LeftArrowIcon />
        Back
      </button>

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

          {/* Quick Chapters / Clips */}
          <div>
            <p className="hint">Clips and chapters</p>
            <div className="sp horiz-scroll" onWheel={handleHorizontalWheel}>
              {clips.map((c, i) => (
                <button
                  key={i}
                  onClick={() => seek(c.s)}
                  aria-pressed={
                    currentTime >= c.s &&
                    (i === clips.length - 1 || currentTime < clips[i + 1].s)
                  }
                >
                  {c.name || formatTime(c.s)} ({formatTime(c.s)})
                </button>
              ))}
            </div>
          </div>

          {/* Seekbar */}
          <div>
            <div className="seek">
              <div className="ticks">
                {clips.map((c, i) => {
                  const percent = duration > 0 ? (c.s / duration) * 100 : 0;
                  return (
                    <i
                      key={i}
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
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? <PauseIcon size={26} /> : <PlayIcon size={26} />}
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
    </div>
  );
}
