"use client";

import React, { useState } from "react";
import { useAudioPlayer } from "../../context/AudioPlayerContext";
import { LeftArrowIcon } from "../Icons";

export default function PlaylistsView({ onBack, onOpenPlaylist }) {
  const { userPlaylists = [], deleteUserPlaylist } = useAudioPlayer();
  const [failedCovers, setFailedCovers] = useState({});

  const totalTracks = userPlaylists.reduce(
    (acc, pl) => acc + (Array.isArray(pl.tracks) ? pl.tracks.length : 0),
    0
  );

  return (
    <div className="view">
      <div className="phead">
        <button className="sqb" onClick={onBack} aria-label="Back">
          <LeftArrowIcon />
        </button>
        <div>
          <h1 className="serif">Play List</h1>
          <div className="rule" />
          <div className="sub">
            {userPlaylists.length} Playlists • {totalTracks} Tracks
          </div>
        </div>
      </div>

      {userPlaylists.length > 0 ? (
        <div className="stories">
          {userPlaylists.map((pl, idx) => {
            const tracks = Array.isArray(pl.tracks) ? pl.tracks : [];
            const first = tracks[0] || null;
            const hasArtwork = Boolean(first?.artwork) && !failedCovers[pl.id];
            const fallbackLetter = first?.letter || (pl.name ? pl.name.trim().charAt(0) : "গ");

            return (
              <div className="pw" key={pl.id}>
                <button
                  type="button"
                  className="tile"
                  style={{ width: "100%" }}
                  onClick={() => onOpenPlaylist(pl.id)}
                >
                  <div className={`cover${!hasArtwork && idx % 2 ? " alt" : ""}`}>
                    {hasArtwork ? (
                      <img
                        src={first.artwork}
                        alt={pl.name}
                        style={{
                          position: "absolute",
                          inset: 0,
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                        }}
                        onError={() =>
                          setFailedCovers((prev) => ({ ...prev, [pl.id]: true }))
                        }
                      />
                    ) : (
                      <span className="big">{fallbackLetter}</span>
                    )}
                    <span
                      className="cnt"
                      style={
                        hasArtwork
                          ? {
                              background: "rgba(0,0,0,0.58)",
                              color: "#fff",
                              backdropFilter: "blur(4px)",
                              zIndex: 2,
                            }
                          : undefined
                      }
                    >
                      {tracks.length}
                    </span>
                  </div>
                  <div className="tt">{pl.name}</div>
                </button>

                {userPlaylists.length > 1 && (
                  <button
                    type="button"
                    className="del"
                    aria-label={`Delete ${pl.name}`}
                    title="প্লেলিস্ট মুছুন"
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteUserPlaylist(pl.id);
                    }}
                  >
                    <svg viewBox="0 0 24 24" style={{ width: 14, height: 14 }}>
                      <path d="M6 6l12 12M18 6L6 18" />
                    </svg>
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="box" style={{ color: "var(--mute)" }}>
          কোনো প্লেলিস্ট নেই।
        </div>
      )}
    </div>
  );
}
