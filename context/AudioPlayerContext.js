"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { MOCK_AUDIO_BOOKS } from "../lib/mockData";
import { formatAudioUrl } from "../lib/firebase";
import {
  getOfflineCachedAudioUrl,
  cacheAudioInBackground,
  invalidateOfflineCachedAudio,
} from "../lib/audioOfflineCache";

const AudioPlayerContext = createContext(null);

const USER_PLAYLISTS_KEY = "golpojolpo_user_playlists_v1";
const USER_HISTORY_KEY = "golpojolpo_history_v1";
const USER_CLIPS_KEY = "golpojolpo_audio_clips_v1";

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
  const [bufferedTime, setBufferedTime] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [volume, setVolume] = useState(80);
  const [isFullPlayerOpen, setIsFullPlayerOpen] = useState(false);
  const [isMiniPlayerDismissed, setIsMiniPlayerDismissed] = useState(false);
  const [audioError, setAudioError] = useState(null);
  const [userPlaylists, setUserPlaylists] = useState(DEFAULT_USER_PLAYLISTS);
  const [historyItems, setHistoryItems] = useState([]);
  const [audioClips, setAudioClips] = useState([]);
  const [activeClipEndSec, setActiveClipEndSec] = useState(null);
  const [activeClipId, setActiveClipId] = useState(null);

  const audioRef = useRef(null);
  const pendingResumeTimeRef = useRef(null);
  const lastHistorySaveRef = useRef(0);
  const historyItemsRef = useRef([]);
  const currentTrackRef = useRef(null);
  const playlistRef = useRef([]);
  const activeClipEndRef = useRef(null);
  const loadedStreamKeyRef = useRef("");
  const networkRetryRef = useRef(0);
  const loadAndPlayAudioSourceRef = useRef(null);

  const buildDirectStreamUrl = (streamUrl, bypassSw = false) => {
    if (!bypassSw || !streamUrl) return streamUrl;
    try {
      const parsed = new URL(streamUrl, window.location.origin);
      parsed.searchParams.set("bypass_sw", "1");
      return parsed.pathname + parsed.search;
    } catch {
      return streamUrl + (streamUrl.includes("?") ? "&" : "?") + "bypass_sw=1";
    }
  };

  // Helper: Load audio source using IndexedDB blob: URL first (100% offline-capable!),
  // otherwise stream from network while caching progressively in IndexedDB in background.
  const loadAndPlayAudioSource = async (streamUrl, resumeSec = 0, options = {}) => {
    const { forceNetwork = false, bypassSw = false, autoPlay = true } = options;
    const audio = audioRef.current;
    if (!audio || !streamUrl) return;

    const isOfflineNow = typeof navigator !== "undefined" && navigator.onLine === false;
    const cachedInfo = forceNetwork ? null : await getOfflineCachedAudioUrl(streamUrl);

    // Choose local blob: URL if completely cached OR if currently offline with partial cache
    const useBlob = !forceNetwork && cachedInfo && (cachedInfo.complete || isOfflineNow);
    const playSrc = useBlob
      ? cachedInfo.url
      : buildDirectStreamUrl(streamUrl, bypassSw);

    try {
      audio.pause();
      pendingResumeTimeRef.current = resumeSec > 0 ? resumeSec : null;
      loadedStreamKeyRef.current = streamUrl;
      audio.src = playSrc;
      audio.currentTime = resumeSec;
      audio.playbackRate = speed;
      audio.volume = Math.max(0, Math.min(1, volume / 100));
      audio.load();

      if (autoPlay) {
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          setIsPlaying(true);
          setAudioError(null);
          playPromise.catch((err) => {
            console.warn("Audio playback prevented or failed:", playSrc, err);
            setIsPlaying(false);
          });
        }
      }
    } catch (err) {
      console.warn("Audio start error:", err);
      setIsPlaying(false);
    }

    // If not completely cached yet and we're online, progressively cache into IndexedDB
    if (!cachedInfo?.complete && !isOfflineNow) {
      cacheAudioInBackground(streamUrl, ({ loadedBytes, totalBytes, complete }) => {
        if (loadedStreamKeyRef.current === streamUrl && totalBytes > 0) {
          const estDur = audio.duration && !isNaN(audio.duration) ? audio.duration : duration || 1800;
          const cachedSec = complete ? estDur : (loadedBytes / totalBytes) * estDur;
          setBufferedTime((prev) => Math.max(prev, cachedSec));
        }
      }).catch(() => {});
    }
  };

  loadAndPlayAudioSourceRef.current = loadAndPlayAudioSource;

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
   * Helper: finds the most recently played audio entry from memory or localStorage.
   */
  const getLastPlayedAudioFromHistory = () => {
    const inMem = (historyItemsRef.current || []).find(
      (h) => h && h.type === "audio" && h.track && h.track.id
    );
    if (inMem) return inMem;
    if (typeof window !== "undefined") {
      try {
        const saved = window.localStorage.getItem(USER_HISTORY_KEY);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            return (
              parsed.find((h) => h && h.type === "audio" && h.track && h.track.id) ||
              null
            );
          }
        }
      } catch {
        // Ignore storage error
      }
    }
    return null;
  };

  /**
   * Restores the last played audio track from history (without auto-playing),
   * or falls back to the first real Firebase/cached audiobook if no history exists.
   */
  const syncInitialTrack = (firstRealBook) => {
    if (!firstRealBook || firstRealBook.isMock) return;
    setCurrentTrack((prev) => {
      if (!prev || prev.isMock) {
        const lastAudio = getLastPlayedAudioFromHistory();
        if (lastAudio && lastAudio.track) {
          const restoredTrack = {
            ...lastAudio.track,
            url: formatAudioUrl(lastAudio.track.url),
          };
          const restoredList =
            Array.isArray(lastAudio.playlist) && lastAudio.playlist.length > 0
              ? lastAudio.playlist
              : [restoredTrack];
          const idx = restoredList.findIndex((t) => t.id === restoredTrack.id);
          setPlaylist(restoredList);
          setPlaylistIndex(idx >= 0 ? idx : 0);
          setCurrentTime(lastAudio.currentTime || 0);
          setDuration(lastAudio.duration || restoredTrack.durationSec || 1800);
          return restoredTrack;
        }

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

          // Immediately restore the last played audio track on reload (without auto-playing)
          const lastAudio = parsedHist.find(
            (h) => h && h.type === "audio" && h.track && h.track.id
          );
          if (lastAudio) {
            const restoredTrack = {
              ...lastAudio.track,
              url: formatAudioUrl(lastAudio.track.url),
            };
            const restoredList =
              Array.isArray(lastAudio.playlist) && lastAudio.playlist.length > 0
                ? lastAudio.playlist
                : [restoredTrack];
            const idx = restoredList.findIndex((t) => t.id === restoredTrack.id);
            setCurrentTrack((prev) => (!prev || prev.isMock ? restoredTrack : prev));
            setPlaylist(restoredList);
            setPlaylistIndex(idx >= 0 ? idx : 0);
            setCurrentTime(lastAudio.currentTime || 0);
            setDuration(lastAudio.duration || restoredTrack.durationSec || 1800);
          }
        }
      }
    } catch {
      // Ignore storage error
    }

    try {
      const savedClips = window.localStorage.getItem(USER_CLIPS_KEY);
      if (savedClips) {
        const parsedClips = JSON.parse(savedClips);
        if (Array.isArray(parsedClips)) {
          setAudioClips(parsedClips);
        }
      }
    } catch {
      // Ignore storage error
    }
  }, []);

  const persistAudioClips = (nextClips) => {
    setAudioClips(nextClips);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(USER_CLIPS_KEY, JSON.stringify(nextClips));
      } catch {
        // Ignore storage error
      }
    }
  };

  const addAudioClip = (clipPayload) => {
    if (!clipPayload) return null;
    const fromSec = Math.max(0, Math.floor(Number(clipPayload.from) || 0));
    const toSec = Math.max(fromSec + 1, Math.floor(Number(clipPayload.to) || fromSec + 30));
    const newClip = {
      id: `clip-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      bookId: clipPayload.bookId || clipPayload.track?.bookId || clipPayload.track?.id || "",
      trackId: clipPayload.trackId || clipPayload.track?.id || "",
      bookTitle: clipPayload.bookTitle || clipPayload.track?.title || "অডিও ক্লিপ",
      artist: clipPayload.artist || clipPayload.track?.artist || clipPayload.track?.writer || "",
      artwork: clipPayload.artwork || clipPayload.track?.artwork || "",
      url: formatAudioUrl(clipPayload.url || clipPayload.track?.url || ""),
      track: clipPayload.track
        ? {
            ...clipPayload.track,
            url: formatAudioUrl(clipPayload.track.url || clipPayload.url || ""),
          }
        : null,
      title: (clipPayload.title || "").trim() || `ক্লিপ ${formatTime(fromSec)}–${formatTime(toSec)}`,
      content: (clipPayload.content || "").trim(),
      from: fromSec,
      to: toSec,
      s: fromSec,
      name: (clipPayload.title || clipPayload.content || "").trim() || `ক্লিপ ${formatTime(fromSec)}–${formatTime(toSec)}`,
      createdAt: Date.now(),
    };
    const next = [newClip, ...audioClips];
    persistAudioClips(next);
    return newClip;
  };

  const removeAudioClip = (clipId) => {
    persistAudioClips(audioClips.filter((c) => c.id !== clipId));
    if (activeClipId === clipId) {
      activeClipEndRef.current = null;
      setActiveClipEndSec(null);
      setActiveClipId(null);
    }
  };

  const getClipsForBook = (bookOrTrack) => {
    if (!bookOrTrack) return [];
    const targetBookId = bookOrTrack.bookId || bookOrTrack.id;
    const targetTrackId = bookOrTrack.id;
    return audioClips
      .filter(
        (c) =>
          (targetBookId && (c.bookId === targetBookId || c.trackId === targetBookId)) ||
          (targetTrackId && (c.trackId === targetTrackId || c.bookId === targetTrackId))
      )
      .sort((a, b) => (a.from || a.s || 0) - (b.from || b.s || 0));
  };

  const playClipSegment = (clip, openPlayer = false) => {
    if (!clip) return;
    const startSec = Math.max(0, Number(clip.from ?? clip.s ?? 0));
    const endSec = clip.to && Number(clip.to) > startSec ? Number(clip.to) : null;

    // If the same clip is currently playing, toggle pause
    if (activeClipId === clip.id && isPlaying) {
      pauseTrack();
      return;
    }

    const trackObj = clip.track || {
      id: clip.trackId || clip.bookId || clip.id,
      bookId: clip.bookId || clip.trackId || clip.id,
      title: clip.bookTitle || clip.title,
      artist: clip.artist || "",
      writer: clip.artist || "",
      artwork: clip.artwork || "",
      url: formatAudioUrl(clip.url || ""),
      durationSec: Math.max(endSec || 0, 1800),
    };

    activeClipEndRef.current = endSec;
    setActiveClipEndSec(endSec);
    setActiveClipId(clip.id);

    const sameTrack =
      currentTrackRef.current &&
      (currentTrackRef.current.id === trackObj.id ||
        (currentTrackRef.current.url && currentTrackRef.current.url === formatAudioUrl(trackObj.url)));

    if (sameTrack && audioRef.current?.src) {
      seek(startSec);
      if (!isPlaying) {
        audioRef.current.play?.().then(() => setIsPlaying(true)).catch(() => {});
      }
    } else {
      playTrack(trackObj, null, startSec);
      // Re-apply activeClipEndRef since playTrack clears it
      activeClipEndRef.current = endSec;
      setActiveClipEndSec(endSec);
      setActiveClipId(clip.id);
    }

    if (openPlayer) {
      setIsFullPlayerOpen(true);
    }
  };

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

    activeClipEndRef.current = null;
    setActiveClipEndSec(null);
    setActiveClipId(null);
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

    setBufferedTime(0);
    networkRetryRef.current = 0;
    loadAndPlayAudioSource(resolvedUrl, resumeSec);
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
        const hadError = Boolean(audioRef.current.error) || Boolean(audioError);
        const needsReload =
          !audioRef.current.src ||
          loadedStreamKeyRef.current !== streamUrl ||
          hadError ||
          audioRef.current.readyState === 0;

        if (needsReload) {
          const savedHist = (historyItemsRef.current || []).find(
            (h) => h.id === `audio:${currentTrack.id}`
          );
          const resumeSec =
            currentTime > 0
              ? currentTime
              : savedHist?.currentTime > 3
              ? savedHist.currentTime
              : 0;
          networkRetryRef.current = 0;
          const isOnlineNow = typeof navigator === "undefined" || navigator.onLine !== false;
          loadAndPlayAudioSource(streamUrl, resumeSec, {
            forceNetwork: hadError && isOnlineNow,
            bypassSw: hadError && isOnlineNow,
          });
          return;
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

  // Register Offline-First Audio Chunk Cache SW & request persistent storage (prevents browser eviction up to 750MB)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw-audio-cache.js", { scope: "/" })
        .catch(() => {
          // Ignore if SW registration is blocked in private mode
        });
    }
    if (navigator.storage && typeof navigator.storage.persist === "function") {
      navigator.storage.persist().catch(() => {
        // Ignore if browser denies persistent storage
      });
    }
    // Listen for network coming back online -> automatically resume/recover audio playback
    const onOnline = () => {
      setAudioError(null);
      networkRetryRef.current = 0;
      const a = audioRef.current;
      const streamUrl =
        loadedStreamKeyRef.current ||
        (currentTrackRef.current ? formatAudioUrl(currentTrackRef.current.url) : "");
      if (a && streamUrl && currentTrackRef.current && (a.error || a.readyState === 0)) {
        const resumeAt = a.currentTime || 0;
        if (loadAndPlayAudioSourceRef.current) {
          loadAndPlayAudioSourceRef.current(streamUrl, resumeAt, {
            forceNetwork: true,
            bypassSw: true,
            autoPlay: true,
          });
        }
      }
    };
    window.addEventListener("online", onOnline);

    return () => {
      window.removeEventListener("online", onOnline);
    };
  }, []);

  // HTML5 audio event handlers attached to off-DOM Audio instance (so no <audio> tag appears in DOM inspector)
  useEffect(() => {
    if (typeof window === "undefined") return;
    const audio = new window.Audio();
    audio.preload = "auto"; // Pre-buffer ahead like YouTube
    audioRef.current = audio;

    const updateBuffered = () => {
      try {
        if (audio.buffered && audio.buffered.length > 0) {
          let maxEnd = 0;
          for (let i = 0; i < audio.buffered.length; i++) {
            const end = audio.buffered.end(i);
            if (end > maxEnd) maxEnd = end;
          }
          setBufferedTime(maxEnd);
        }
      } catch {
        // Ignore
      }
    };

    const onLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        setDuration(audio.duration);
      }
      updateBuffered();
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
      updateBuffered();

      // If playing a specific saved clip segment (from -> to), auto-pause at clip end!
      if (
        activeClipEndRef.current !== null &&
        audio.currentTime >= activeClipEndRef.current
      ) {
        audio.pause();
        setIsPlaying(false);
        activeClipEndRef.current = null;
        setActiveClipEndSec(null);
        setActiveClipId(null);
        return;
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

    const onError = async () => {
      if (!audio.src) return;

      const streamUrl = loadedStreamKeyRef.current;
      const isOnlineNow = typeof navigator === "undefined" || navigator.onLine !== false;
      const resumeAt = audio.currentTime || 0;

      // Case A: A cached `blob:` URL failed while online (e.g. truncated/corrupt offline blob)
      // -> Invalidate bad cache entry and seamlessly recover from live server stream!
      if (streamUrl && audio.src.startsWith("blob:") && isOnlineNow && networkRetryRef.current < 1) {
        networkRetryRef.current += 1;
        await invalidateOfflineCachedAudio(streamUrl);
        if (loadAndPlayAudioSourceRef.current) {
          loadAndPlayAudioSourceRef.current(streamUrl, resumeAt, {
            forceNetwork: true,
            bypassSw: true,
            autoPlay: true,
          });
          return;
        }
      }

      // Case B: Streaming `/api/stream?t=...` failed while OFFLINE
      // -> Seamlessly switch to our IndexedDB blob: URL!
      if (streamUrl && !audio.src.startsWith("blob:") && !isOnlineNow) {
        const cached = await getOfflineCachedAudioUrl(streamUrl);
        if (cached && cached.url) {
          pendingResumeTimeRef.current = resumeAt > 0 ? resumeAt : null;
          audio.src = cached.url;
          audio.load();
          audio.play().then(() => {
            setIsPlaying(true);
            setAudioError(null);
          }).catch(() => {
            setIsPlaying(false);
          });
          return;
        }
      }

      // Case C: Streaming `/api/stream?t=...` failed while ONLINE (e.g. stale SW 503 after offline reload)
      // -> Retry once bypassing Service Worker directly to `/api/stream?t=...&bypass_sw=1`!
      if (streamUrl && !audio.src.startsWith("blob:") && isOnlineNow && networkRetryRef.current < 1) {
        networkRetryRef.current += 1;
        if (loadAndPlayAudioSourceRef.current) {
          loadAndPlayAudioSourceRef.current(streamUrl, resumeAt, {
            forceNetwork: true,
            bypassSw: true,
            autoPlay: true,
          });
          return;
        }
      }

      setIsPlaying(false);
      if (!isOnlineNow) {
        setAudioError(
          "ইন্টারনেট সংযোগ নেই — তবে আগে বাফার/ক্যাশ হওয়া অংশটুকু সিক করে অফলাইনে শুনতে পারবেন।"
        );
      } else {
        setAudioError("অডিও ফাইলটি প্লে করা যাচ্ছে না। লিংক বা ইন্টারনেট সংযোগ পরীক্ষা করুন।");
      }
    };

    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("progress", updateBuffered);
    audio.addEventListener("canplay", updateBuffered);
    audio.addEventListener("error", onError);

    return () => {
      audio.pause();
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("progress", updateBuffered);
      audio.removeEventListener("canplay", updateBuffered);
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
        bufferedTime,
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
        audioClips,
        activeClipId,
        activeClipEndSec,
        addAudioClip,
        removeAudioClip,
        getClipsForBook,
        playClipSegment,
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
