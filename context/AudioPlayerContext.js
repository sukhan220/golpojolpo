"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { MOCK_AUDIO_BOOKS } from "../lib/mockData";
import { formatAudioUrl } from "../lib/firebase";

const AudioPlayerContext = createContext(null);

const USER_PLAYLISTS_KEY = "golpojolpo_user_playlists_v1";
const USER_HISTORY_KEY = "golpojolpo_history_v1";

const DEFAULT_USER_PLAYLISTS = [
  {
    id: "fav-playlist",
    name: "My Playlist",
    tracks: [],
  },
];

export function AudioPlayerProvider({ children }) {
  const [currentTrack, setCurrentTrack] = useState(null);
  const [playlist, setPlaylist] = useState([]);
  const [playlistIndex, setPlaylistIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [volume, setVolume] = useState(80);
  const [isFullPlayerOpen, setIsFullPlayerOpen] = useState(false);
  const [isMiniPlayerDismissed, setIsMiniPlayerDismissed] = useState(false);
  const [audioError, setAudioError] = useState(null);
  const [userPlaylists, setUserPlaylists] = useState(DEFAULT_USER_PLAYLISTS);
  const [historyItems, setHistoryItems] = useState([]);

  const audioRef = useRef(null);
  const pendingResumeTimeRef = useRef(null);
  const lastHistorySaveRef = useRef(0);
  const historyItemsRef = useRef([]);
  const currentTrackRef = useRef(null);
  const playlistRef = useRef([]);

  useEffect(() => {
    historyItemsRef.current = historyItems;
  }, [historyItems]);

  useEffect(() => {
    currentTrackRef.current = currentTrack;
  }, [currentTrack]);

  useEffect(() => {
    playlistRef.current = playlist;
  }, [playlist]);

  const persistHistory = (nextHistory) => {
    historyItemsRef.current = nextHistory;
    setHistoryItems(nextHistory);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(USER_HISTORY_KEY, JSON.stringify(nextHistory));
      } catch {
        // Ignore storage error
      }
    }
  };

  const recordAudioHistory = (trackObj, timeSec, durSec, listObj = null) => {
    if (!trackObj || trackObj.isMock || !trackObj.id) return;
    const entryId = `audio:${trackObj.id}`;
    const safeTime = Math.max(0, Math.floor(timeSec || 0));
    const safeDur = Math.max(1, Math.floor(durSec || trackObj.durationSec || 1800));

    const newEntry = {
      id: entryId,
      type: "audio",
      itemId: trackObj.id,
      bookId: trackObj.bookId || trackObj.id,
      title: trackObj.title,
      artist: trackObj.artist || trackObj.writer || "",
      artwork: trackObj.artwork || "",
      letter: trackObj.letter || "ব",
      currentTime: safeTime,
      duration: safeDur,
      track: {
        ...trackObj,
        url: formatAudioUrl(trackObj.url),
      },
      playlist: Array.isArray(listObj) && listObj.length > 0 ? listObj : playlistRef.current,
      updatedAt: Date.now(),
    };

    const existingList = historyItemsRef.current || [];
    const filtered = existingList.filter((item) => item.id !== entryId);
    const nextHistory = [newEntry, ...filtered].slice(0, 60);
    persistHistory(nextHistory);
  };

  const recordBookReadingProgress = (story, scrollTop = 0, scrollPercent = 0) => {
    if (!story || !story.id) return;
    const entryId = `ebook:${story.id}`;
    const existingList = historyItemsRef.current || [];
    const prevEntry = existingList.find((item) => item.id === entryId);

    const finalScrollTop = scrollTop > 0 ? Math.floor(scrollTop) : prevEntry?.scrollTop || 0;
    const finalPercent =
      scrollPercent > 0
        ? Math.min(100, Math.max(1, Math.round(scrollPercent)))
        : prevEntry?.scrollPercent || 1;

    const newEntry = {
      id: entryId,
      type: "ebook",
      itemId: story.id,
      title: story.title,
      artist: story.writer || "",
      artwork: story.artwork || "",
      letter: story.letter || "গ",
      scrollTop: finalScrollTop,
      scrollPercent: finalPercent,
      story,
      updatedAt: Date.now(),
    };

    const filtered = existingList.filter((item) => item.id !== entryId);
    const nextHistory = [newEntry, ...filtered].slice(0, 60);
    persistHistory(nextHistory);
  };

  const getBookReadingProgress = (storyId) => {
    if (!storyId) return null;
    const existingList = historyItemsRef.current || [];
    return existingList.find((item) => item.id === `ebook:${storyId}`) || null;
  };

  const removeHistoryItem = (entryId) => {
    const existingList = historyItemsRef.current || [];
    persistHistory(existingList.filter((item) => item.id !== entryId));
  };

  /**
   * Sets the initial default track from real Firebase/cached audioBooks
   * without auto-playing, or replaces a mock placeholder track.
   */
  const syncInitialTrack = (firstRealBook) => {
    if (!firstRealBook || firstRealBook.isMock) return;
    setCurrentTrack((prev) => {
      if (!prev || prev.isMock) {
        const hasParts = Array.isArray(firstRealBook.tracks) && firstRealBook.tracks.length > 0;
        const target = hasParts ? firstRealBook.tracks[0] : firstRealBook;
        if (hasParts) {
          setPlaylist(firstRealBook.tracks);
          setPlaylistIndex(0);
        } else {
          setPlaylist([firstRealBook]);
          setPlaylistIndex(0);
        }
        setDuration(target.durationSec || firstRealBook.durationSec || 1800);
        return {
          ...target,
          url: formatAudioUrl(target.url || firstRealBook.url),
        };
      }
      return prev;
    });
  };

  // Load saved user playlists & history from localStorage on mount
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = window.localStorage.getItem(USER_PLAYLISTS_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setUserPlaylists(parsed);
        }
      }
    } catch {
      // Ignore storage error
    }

    try {
      const savedHist = window.localStorage.getItem(USER_HISTORY_KEY);
      if (savedHist) {
        const parsedHist = JSON.parse(savedHist);
        if (Array.isArray(parsedHist)) {
          setHistoryItems(parsedHist);
          historyItemsRef.current = parsedHist;
        }
      }
    } catch {
      // Ignore storage error
    }
  }, []);

  const saveUserPlaylists = (nextLists) => {
    setUserPlaylists(nextLists);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(USER_PLAYLISTS_KEY, JSON.stringify(nextLists));
      } catch {
        // Ignore storage error
      }
    }
  };

  const isTrackInPlaylist = (trackId, listId = null) => {
    if (!trackId) return false;
    if (listId) {
      const target = userPlaylists.find((p) => p.id === listId);
      return Boolean(target?.tracks?.some((t) => t.id === trackId));
    }
    return userPlaylists.some((p) => p.tracks?.some((t) => t.id === trackId));
  };

  const toggleTrackInUserPlaylist = (track, listId = "fav-playlist") => {
    if (!track) return;
    const cleanTrack = {
      id: track.id,
      bookId: track.bookId || track.id,
      title: track.title,
      artist: track.artist || track.writer || "",
      writer: track.writer || track.artist || "",
      voice: track.voice || "",
      time: track.time || "০০:০০",
      durationSec: track.durationSec || duration || 1800,
      url: formatAudioUrl(track.url),
      artwork: track.artwork || "",
      letter: track.letter || "ব",
    };

    const nextLists = userPlaylists.map((pl) => {
      if (pl.id !== listId) return pl;
      const exists = pl.tracks.some((t) => t.id === cleanTrack.id);
      return {
        ...pl,
        tracks: exists
          ? pl.tracks.filter((t) => t.id !== cleanTrack.id)
          : [...pl.tracks, cleanTrack],
      };
    });
    saveUserPlaylists(nextLists);
  };

  const createUserPlaylist = (name, initialTrack = null) => {
    const trimmed = (name || "").trim();
    if (!trimmed) return;
    const newId = `pl-${Date.now()}`;
    const newList = {
      id: newId,
      name: trimmed,
      tracks: initialTrack
        ? [
            {
              id: initialTrack.id,
              bookId: initialTrack.bookId || initialTrack.id,
              title: initialTrack.title,
              artist: initialTrack.artist || initialTrack.writer || "",
              writer: initialTrack.writer || initialTrack.artist || "",
              voice: initialTrack.voice || "",
              time: initialTrack.time || "০০:০০",
              durationSec: initialTrack.durationSec || duration || 1800,
              url: formatAudioUrl(initialTrack.url),
              artwork: initialTrack.artwork || "",
              letter: initialTrack.letter || "ব",
            },
          ]
        : [],
    };
    saveUserPlaylists([...userPlaylists, newList]);
  };

  const deleteUserPlaylist = (listId) => {
    if (userPlaylists.length <= 1) return;
    saveUserPlaylists(userPlaylists.filter((p) => p.id !== listId));
  };

  /**
   * Play a specific track, optionally setting a playlist of nested tracks and an optional resumeTime
   */
  const playTrack = (track, newPlaylist = null, explicitResumeTime = null) => {
    if (!track) return;

    setIsMiniPlayerDismissed(false);

    let activeList = playlist;
    if (newPlaylist && Array.isArray(newPlaylist) && newPlaylist.length > 0) {
      activeList = newPlaylist;
      setPlaylist(newPlaylist);
      const idx = newPlaylist.findIndex((t) => t.id === track.id);
      setPlaylistIndex(idx >= 0 ? idx : 0);
    } else if (Array.isArray(track.tracks) && track.tracks.length > 0) {
      activeList = track.tracks;
      setPlaylist(track.tracks);
      setPlaylistIndex(0);
    }

    // Resolve stream URL from track, or fallback to track.tracks[0].url
    const resolvedUrl =
      formatAudioUrl(track.url) ||
      (Array.isArray(track.tracks) && track.tracks.length > 0
        ? formatAudioUrl(track.tracks[0].url)
        : "");

    const formattedTrack = {
      ...track,
      url: resolvedUrl,
    };

    // Check if there is a saved timestamp in History for this track
    let resumeSec = 0;
    if (typeof explicitResumeTime === "number" && explicitResumeTime > 0) {
      resumeSec = explicitResumeTime;
    } else {
      const savedHist = (historyItemsRef.current || []).find(
        (h) => h.id === `audio:${formattedTrack.id}`
      );
      if (
        savedHist &&
        savedHist.currentTime > 3 &&
        (!savedHist.duration || savedHist.currentTime < savedHist.duration - 5)
      ) {
        resumeSec = savedHist.currentTime;
      }
    }

    setCurrentTrack(formattedTrack);
    setCurrentTime(resumeSec);
    setDuration(formattedTrack.durationSec || 0);
    setAudioError(null);

    if (!resolvedUrl) {
      setIsPlaying(false);
      setAudioError("এই পর্বের অডিও লিংক (url) পাওয়া যায়নি।");
      return;
    }

    recordAudioHistory(
      formattedTrack,
      resumeSec,
      formattedTrack.durationSec || 1800,
      activeList
    );

    if (audioRef.current) {
      try {
        audioRef.current.pause();
        pendingResumeTimeRef.current = resumeSec > 0 ? resumeSec : null;
        audioRef.current.src = resolvedUrl;
        audioRef.current.currentTime = resumeSec;
        audioRef.current.playbackRate = speed;
        audioRef.current.volume = Math.max(0, Math.min(1, volume / 100));
        audioRef.current.load();

        const playPromise = audioRef.current.play();
        if (playPromise !== undefined) {
          setIsPlaying(true);
          playPromise.catch((err) => {
            console.warn("Audio playback prevented or failed:", resolvedUrl, err);
            setIsPlaying(false);
          });
        }
      } catch (err) {
        console.warn("Audio start error:", err);
        setIsPlaying(false);
      }
    }
  };

  const pauseTrack = () => {
    setIsPlaying(false);
    if (audioRef.current) {
      audioRef.current.pause();
      if (currentTrackRef.current) {
        recordAudioHistory(
          currentTrackRef.current,
          audioRef.current.currentTime,
          audioRef.current.duration || duration,
          playlistRef.current
        );
      }
    }
  };

  /**
   * Dismiss MiniPlayer when slid down: stops audio and hides MiniPlayer until next play
   */
  const dismissMiniPlayer = () => {
    pauseTrack();
    setIsMiniPlayerDismissed(true);
  };

  const togglePlay = () => {
    if (isPlaying) {
      pauseTrack();
    } else {
      if (!currentTrack) return;
      setIsMiniPlayerDismissed(false);
      const streamUrl =
        formatAudioUrl(currentTrack.url) ||
        (Array.isArray(currentTrack.tracks) && currentTrack.tracks.length > 0
          ? formatAudioUrl(currentTrack.tracks[0].url)
          : "");

      if (!streamUrl) {
        setAudioError("এই পর্বের অডিও লিংক (url) পাওয়া যায়নি।");
        return;
      }

      if (audioRef.current) {
        if (!audioRef.current.src || !audioRef.current.src.endsWith(streamUrl)) {
          const savedHist = (historyItemsRef.current || []).find(
            (h) => h.id === `audio:${currentTrack.id}`
          );
          const resumeSec =
            currentTime > 0
              ? currentTime
              : savedHist?.currentTime > 3
              ? savedHist.currentTime
              : 0;
          pendingResumeTimeRef.current = resumeSec > 0 ? resumeSec : null;
          audioRef.current.src = streamUrl;
          audioRef.current.load();
        }
        audioRef.current.playbackRate = speed;
        const playPromise = audioRef.current.play();
        if (playPromise !== undefined) {
          setIsPlaying(true);
          setAudioError(null);
          playPromise.catch((err) => {
            console.warn("Play error:", err);
            setIsPlaying(false);
          });
        }
      }
    }
  };

  const seek = (timeInSec) => {
    const maxDur = duration || currentTrack?.durationSec || 1800;
    const target = Math.max(0, Math.min(maxDur, timeInSec));
    setCurrentTime(target);
    if (audioRef.current) {
      audioRef.current.currentTime = target;
    }
    if (currentTrackRef.current) {
      recordAudioHistory(
        currentTrackRef.current,
        target,
        maxDur,
        playlistRef.current
      );
    }
  };

  const skip = (deltaSec) => {
    seek(currentTime + deltaSec);
  };

  /**
   * Play next track in playlist (if nested collection)
   */
  const playNext = () => {
    if (playlist.length > 1 && playlistIndex < playlist.length - 1) {
      const nextIdx = playlistIndex + 1;
      setPlaylistIndex(nextIdx);
      playTrack(playlist[nextIdx], playlist);
    }
  };

  /**
   * Play previous track in playlist (if nested collection)
   */
  const playPrev = () => {
    if (playlist.length > 1 && playlistIndex > 0) {
      const prevIdx = playlistIndex - 1;
      setPlaylistIndex(prevIdx);
      playTrack(playlist[prevIdx], playlist);
    }
  };

  const handleSetSpeed = (newSpeed) => {
    setSpeed(newSpeed);
    if (audioRef.current) {
      audioRef.current.playbackRate = newSpeed;
    }
  };

  const handleSetVolume = (newVol) => {
    setVolume(newVol);
    if (audioRef.current) {
      audioRef.current.volume = Math.max(0, Math.min(1, newVol / 100));
    }
  };

  // HTML5 audio event handlers attached to off-DOM Audio instance (so no <audio> tag appears in DOM inspector)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const audio = new window.Audio();
    audio.preload = "metadata";
    audioRef.current = audio;

    const onLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        setDuration(audio.duration);
      }
      if (pendingResumeTimeRef.current && pendingResumeTimeRef.current > 0) {
        const targetTime = pendingResumeTimeRef.current;
        pendingResumeTimeRef.current = null;
        if (!audio.duration || targetTime < audio.duration - 2) {
          audio.currentTime = targetTime;
          setCurrentTime(targetTime);
        }
      }
    };

    const onTimeUpdate = () => {
      setCurrentTime(audio.currentTime);
      if (audio.duration && !isNaN(audio.duration)) {
        setDuration(audio.duration);
      }
      const now = Date.now();
      if (
        currentTrackRef.current &&
        audio.currentTime > 1 &&
        now - lastHistorySaveRef.current > 2500
      ) {
        lastHistorySaveRef.current = now;
        recordAudioHistory(
          currentTrackRef.current,
          audio.currentTime,
          audio.duration || 1800,
          playlistRef.current
        );
      }
    };

    const onError = () => {
      if (!audio.src) return;
      setIsPlaying(false);
      setAudioError("অডিও ফাইলটি প্লে করা যাচ্ছে না। লিংক বা ইন্টারনেট সংযোগ পরীক্ষা করুন।");
    };

    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("error", onError);

    return () => {
      audio.pause();
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("error", onError);
    };
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onEnded = () => {
      if (playlist.length > 0 && playlistIndex < playlist.length - 1) {
        const nextIdx = playlistIndex + 1;
        setPlaylistIndex(nextIdx);
        playTrack(playlist[nextIdx], playlist);
      } else {
        setIsPlaying(false);
        setCurrentTime(0);
      }
    };
    audio.addEventListener("ended", onEnded);
    return () => audio.removeEventListener("ended", onEnded);
  }, [playlist, playlistIndex]);

  return (
    <AudioPlayerContext.Provider
      value={{
        currentTrack,
        playlist,
        playlistIndex,
        isPlaying,
        currentTime,
        duration: duration || currentTrack?.durationSec || 1800,
        speed,
        volume,
        isFullPlayerOpen,
        audioError,
        playTrack,
        pauseTrack,
        togglePlay,
        seek,
        skip,
        playNext,
        playPrev,
        setSpeed: handleSetSpeed,
        setVolume: handleSetVolume,
        openFullPlayer: () => setIsFullPlayerOpen(true),
        closeFullPlayer: () => setIsFullPlayerOpen(false),
        isMiniPlayerDismissed,
        dismissMiniPlayer,
        syncInitialTrack,
        userPlaylists,
        isTrackInPlaylist,
        toggleTrackInUserPlaylist,
        createUserPlaylist,
        deleteUserPlaylist,
        historyItems,
        recordBookReadingProgress,
        getBookReadingProgress,
        removeHistoryItem,
      }}
    >
      {children}
    </AudioPlayerContext.Provider>
  );
}

export function useAudioPlayer() {
  const context = useContext(AudioPlayerContext);
  if (!context) {
    throw new Error("useAudioPlayer must be used within an AudioPlayerProvider");
  }
  return context;
}

/**
 * Format seconds to M:SS or MM:SS
 */
export function formatTime(seconds) {
  if (isNaN(seconds) || seconds < 0) return "0:00";
  const s = Math.floor(seconds);
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}
