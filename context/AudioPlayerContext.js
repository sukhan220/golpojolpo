"use client";

import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { formatAudioUrl } from "../lib/firebase";
import {
  getOfflineCachedAudioUrl,
  cacheAudioInBackground,
  invalidateOfflineCachedAudio,
  releaseOfflineAudioOwner,
} from "../lib/audioOfflineCache";

const AudioPlayerContext = createContext(null);

const USER_PLAYLISTS_KEY = "golpojolpo_user_playlists_v1";
const USER_HISTORY_KEY = "golpojolpo_history_v1";
const USER_CLIPS_KEY = "golpojolpo_audio_clips_v1";
const USER_RECENT_PLAYLIST_KEY = "golpojolpo_recent_playlist_v1";
const RATE_LIMIT_HINT_KEY = "gj_rl_hint_v1";
const RECENT_PLAYLIST_LIMIT = 6;

const DEFAULT_USER_PLAYLISTS = [
  {
    id: "fav-playlist",
    name: "My Playlist",
    tracks: [],
  },
];

/**
 * Validates and sanitizes a track object for playlist/history storage.
 */
function sanitizeTrackForStorage(track, fallbackDuration = 1800) {
  if (!track || typeof track !== "object" || !track.id) return null;
  const id = String(track.id).trim();
  const title = typeof track.title === "string" && track.title.trim() ? track.title.trim() : "";
  if (!id || !title) return null;
  return {
    id,
    bookId: track.bookId ? String(track.bookId) : id,
    title,
    artist: track.artist || track.writer || "",
    writer: track.writer || track.artist || "",
    voice: track.voice || "",
    time: track.time || "০০:০০",
    durationSec:
      Number.isFinite(Number(track.durationSec)) && Number(track.durationSec) > 0
        ? Number(track.durationSec)
        : fallbackDuration,
    url: formatAudioUrl(track.url || ""),
    artwork: track.artwork || "",
    letter: track.letter || "ব",
  };
}

/**
 * Bug #9 Fix: Strictly validates playlists loaded from or written to localStorage.
 * Guarantees at least one valid playlist and removes malformed/duplicate entries.
 */
function sanitizeUserPlaylists(raw) {
  if (!Array.isArray(raw) || raw.length === 0) {
    return DEFAULT_USER_PLAYLISTS.map((p) => ({ ...p, tracks: [] }));
  }

  const seenIds = new Set();
  const cleaned = [];

  for (const pl of raw) {
    if (!pl || typeof pl !== "object") continue;
    const id = typeof pl.id === "string" ? pl.id.trim() : "";
    const name = typeof pl.name === "string" ? pl.name.trim() : "";
    if (!id || !name || seenIds.has(id)) continue;
    seenIds.add(id);

    const seenTrackIds = new Set();
    const validTracks = [];
    if (Array.isArray(pl.tracks)) {
      for (const t of pl.tracks) {
        const clean = sanitizeTrackForStorage(t);
        if (clean && !seenTrackIds.has(clean.id)) {
          seenTrackIds.add(clean.id);
          validTracks.push(clean);
        }
      }
    }

    cleaned.push({ id, name, tracks: validTracks });
  }

  return cleaned.length > 0
    ? cleaned
    : DEFAULT_USER_PLAYLISTS.map((p) => ({ ...p, tracks: [] }));
}

function sanitizeHistoryList(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item) => item && typeof item === "object" && typeof item.id === "string" && item.type)
    .slice(0, 60);
}

function sanitizeClipsList(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (c) => c && typeof c === "object" && typeof c.id === "string" && Number.isFinite(Number(c.from ?? c.s))
  );
}

/**
 * Fix #2 Helper: Normalizes relative & absolute URLs to canonical href for exact comparison.
 */
function normalizeComparableUrl(urlStr) {
  if (!urlStr || typeof urlStr !== "string") return "";
  if (urlStr.startsWith("blob:") || urlStr.startsWith("data:")) return urlStr;
  try {
    if (typeof window !== "undefined" && window.location?.origin) {
      return new URL(urlStr, window.location.origin).href;
    }
  } catch {
    // fallback to raw string
  }
  return urlStr;
}

/**
 * Fix #5 Helper: Checks whether `targetSec` lies inside any buffered range of `audio`.
 */
function isTimeBufferedInAudio(audio, targetSec, toleranceSec = 0.5) {
  if (!audio || !audio.buffered || audio.buffered.length === 0) return false;
  try {
    for (let i = 0; i < audio.buffered.length; i++) {
      const start = audio.buffered.start(i);
      const end = audio.buffered.end(i);
      if (targetSec >= start - toleranceSec && targetSec <= end + toleranceSec) {
        return true;
      }
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * Formats a 429 rate-limit message in Bengali with the exact next available time & countdown.
 */
function formatRateLimitMessage(nextAvailableAt, retryAfterSec, limit = 6, blockedTrack = null) {
  const mins = Math.max(1, Math.ceil((Number(retryAfterSec) || 1800) / 60));
  let timeLabel = "";
  if (nextAvailableAt) {
    try {
      const dt = new Date(nextAvailableAt);
      if (!isNaN(dt.getTime())) {
        timeLabel = dt.toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
        });
      }
    } catch {
      // ignore
    }
  }
  return {
    title: "Playback Limit Reached",
    message: `Sorry, you cannot play more than ${limit} audio tracks within 30 minutes. Please request a new audio after 30 minutes.`,
    suggestion:
      'Add this audio to your "Listen Later" playlist to enjoy it later. For now, you can continue listening from your Recent playlist.',
    nextAvailableText: timeLabel
      ? `Next new audio available at ${timeLabel} (in ~${mins} min).`
      : `Next new audio available in ~${mins} min.`,
    blockedTrack: blockedTrack || null,
  };
}

export function AudioPlayerProvider({ children }) {
  const [currentTrack, setCurrentTrack] = useState(null);
  const [playlist, setPlaylist] = useState([]);
  const [playlistIndex, setPlaylistIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [bufferedTime, setBufferedTime] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [volume, setVolume] = useState(80);
  const [isFullPlayerOpen, setIsFullPlayerOpen] = useState(false);
  const [isMiniPlayerDismissed, setIsMiniPlayerDismissed] = useState(false);
  const [audioError, setAudioError] = useState(null);
  const [rateLimitInfo, setRateLimitInfo] = useState(null);
  const [rateLimitPopup, setRateLimitPopup] = useState(null);
  const [userPlaylists, setUserPlaylists] = useState(DEFAULT_USER_PLAYLISTS);
  const [recentPlaylistTracks, setRecentPlaylistTracks] = useState([]);
  const [historyItems, setHistoryItems] = useState([]);
  const [audioClips, setAudioClips] = useState([]);
  const [activeClipEndSec, setActiveClipEndSec] = useState(null);
  const [activeClipId, setActiveClipId] = useState(null);

  const audioRef = useRef(null);
  const isMountedRef = useRef(true);
  const ownerIdRef = useRef(null);

  // Fix #2: Monotonic source load token & normalized active src tracking to ignore stale events
  const sourceTokenRef = useRef(0);
  const activeAudioSrcRef = useRef("");
  const loadedStreamKeyRef = useRef("");

  // Playback / resume / offline recovery refs
  const pendingResumeTimeRef = useRef(null);
  const currentTimeRef = useRef(0);
  const durationRef = useRef(0);
  const speedRef = useRef(1);
  const volumeRef = useRef(80);
  const wantPlayingRef = useRef(false);
  const wasStalledOfflineRef = useRef(false);
  const usingPartialBlobRef = useRef(false);
  const networkRetryRef = useRef(0);

  // Bug #10 Fix: Separate native buffer & background cache progress refs (never summed!)
  const nativeBufferedRef = useRef(0);
  const bgCacheBufferedRef = useRef(0);
  const bgCacheCompleteRef = useRef(false);

  // Bug #7 Fix: History throttling & consistency refs
  const lastHistoryPersistTimeRef = useRef(0);
  const lastPersistedSecRef = useRef(-1);
  const lastPersistedTrackIdRef = useRef("");
  const historyItemsRef = useRef([]);
  const recentPlaylistRef = useRef([]);

  // Track / playlist / clip refs
  const currentTrackRef = useRef(null);
  const playlistRef = useRef([]);
  const playlistIndexRef = useRef(0);
  const activeClipEndRef = useRef(null);
  const activeClipIdRef = useRef(null);
  const loadAndPlayAudioSourceRef = useRef(null);
  // In-memory cache of server-approved playback grants (streamUrl -> expiresAtMs, pruned & capped)
  const grantedStreamsRef = useRef(new Map());
  // Client-side UX short-circuit when 6/6 slots are already full (avoids doomed Vercel/Neon hits)
  const rateLimitLockRef = useRef(null);

  /**
   * Fix #1: Synchronizes playlist state & refs atomically so rapid actions
   * (playTrack, playNext, playPrev, onEnded, history snapshot) never read stale refs.
   */
  const syncPlaylistState = (nextList, nextIndex = 0) => {
    const safeList = Array.isArray(nextList) ? nextList : [];
    const safeIdx =
      safeList.length > 0
        ? Math.max(0, Math.min(safeList.length - 1, Number(nextIndex) || 0))
        : 0;
    playlistRef.current = safeList;
    playlistIndexRef.current = safeIdx;
    setPlaylist(safeList);
    setPlaylistIndex(safeIdx);
    return { list: safeList, index: safeIdx };
  };

  useEffect(() => {
    historyItemsRef.current = historyItems;
  }, [historyItems]);

  useEffect(() => {
    currentTrackRef.current = currentTrack;
  }, [currentTrack]);

  useEffect(() => {
    playlistRef.current = playlist;
  }, [playlist]);

  useEffect(() => {
    playlistIndexRef.current = playlistIndex;
  }, [playlistIndex]);

  useEffect(() => {
    durationRef.current = duration;
  }, [duration]);

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  useEffect(() => {
    volumeRef.current = volume;
  }, [volume]);

  /**
   * Bug #5 & #10 Helper: Returns the most accurate known audio duration.
   * Prefers native `audio.duration` when finite and > 0.
   */
  const getAccurateDuration = () => {
    const a = audioRef.current;
    if (a && Number.isFinite(a.duration) && a.duration > 0) {
      return a.duration;
    }
    if (Number.isFinite(durationRef.current) && durationRef.current > 0) {
      return durationRef.current;
    }
    const trackDur = Number(currentTrackRef.current?.durationSec);
    if (Number.isFinite(trackDur) && trackDur > 0) {
      return trackDur;
    }
    return 0;
  };

  /**
   * Bug #10 Fix: Computes monotonic, clamped bufferedTime from separate native & background refs.
   * Never sums the two sources, never exceeds actual duration, and never falsely shows 100%
   * before download/buffering is actually complete.
   */
  const recomputeBufferedTime = () => {
    if (!isMountedRef.current) return;
    const totalDur = getAccurateDuration();
    const nativeSec = Math.max(0, nativeBufferedRef.current || 0);
    const bgSec = Math.max(0, bgCacheBufferedRef.current || 0);
    let combined = Math.max(nativeSec, bgSec);

    if (totalDur > 0) {
      if (bgCacheCompleteRef.current || nativeSec >= totalDur - 0.5) {
        combined = totalDur;
      } else {
        // Clamp below 100% until actually complete
        combined = Math.min(combined, Math.max(0, totalDur * 0.995));
      }
      combined = Math.min(totalDur, Math.max(0, combined));
    }

    setBufferedTime((prev) => {
      const next = totalDur > 0 ? Math.min(totalDur, Math.max(prev, combined)) : Math.max(prev, combined);
      return next;
    });
  };

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

  /**
   * Helper: Load audio source using IndexedDB blob: URL first (100% offline-capable!),
   * otherwise stream from network while caching progressively in IndexedDB in background.
   *
   * Fixes applied:
   * - Bug #1: Only sets `isPlaying(true)` AFTER `audio.play()` Promise resolves.
   * - Bug #4: Preserves `pendingResumeTimeRef` accurately across `audio.load()` and partial->network transitions.
   * - Bug #6: Guards all async steps with `loadToken === sourceTokenRef.current` & `isMountedRef.current`.
   * - Bug #10: Updates `bgCacheBufferedRef` separately and clamps against real duration.
   */
  const loadAndPlayAudioSource = async (streamUrl, resumeSec = 0, options = {}) => {
    const { forceNetwork = false, bypassSw = false, autoPlay = true } = options;
    const audio = audioRef.current;
    if (!audio || !streamUrl || !isMountedRef.current) return;

    // Increment load token to invalidate any older in-flight loads or stale audio events
    const loadToken = ++sourceTokenRef.current;
    const safeResume = Number.isFinite(Number(resumeSec)) && Number(resumeSec) > 0 ? Number(resumeSec) : 0;

    // Show brief, smooth loading spinner on Play button (both online & offline) before starting new track
    audio.pause();
    setIsPlaying(false);
    setIsBuffering(true);
    setAudioError(null);

    const isOfflineNow = typeof navigator !== "undefined" && navigator.onLine === false;
    const ownerId = ownerIdRef.current;

    // Run IndexedDB lookup in parallel with a smooth 280ms transition pause so UI feels polished
    const [cachedInfo] = await Promise.all([
      forceNetwork ? Promise.resolve(null) : getOfflineCachedAudioUrl(streamUrl, ownerId),
      autoPlay ? new Promise((resolve) => setTimeout(resolve, 280)) : Promise.resolve(),
    ]);

    // Abort if unmounted or a newer load started while awaiting IndexedDB / transition
    if (!isMountedRef.current || sourceTokenRef.current !== loadToken || audioRef.current !== audio) {
      return;
    }

    const useBlob = !forceNetwork && cachedInfo && (cachedInfo.complete || isOfflineNow);
    usingPartialBlobRef.current = Boolean(useBlob && cachedInfo && !cachedInfo.complete);

    // Server-side 30-minute sliding window rate limit check (max 6 unique audios):
    // - SKIPPED when playing from already-cached IndexedDB blob (zero unnecessary API calls!)
    // - SKIPPED when streamUrl already has a valid in-memory grant in the current window
    // - SHORT-CIRCUITED locally (0 Vercel / 0 Neon hits!) when 6/6 window is already locked until nextAvailableAt
    if (!useBlob && !isOfflineNow && streamUrl.startsWith("/api/stream?t=")) {
      const nowMs = Date.now();
      // Prune expired entries from grantedStreamsRef to keep memory tiny
      for (const [k, exp] of grantedStreamsRef.current.entries()) {
        if (!exp || exp <= nowMs) grantedStreamsRef.current.delete(k);
      }

      const existingExp = grantedStreamsRef.current.get(streamUrl);
      const hasValidSession = Boolean(existingExp && nowMs < existingExp - 10000);

      if (!hasValidSession) {
        // Hydrate tiny sessionStorage hint once if memory lock is empty (handles page reload without hitting server!)
        if (!rateLimitLockRef.current && typeof window !== "undefined") {
          try {
            const rawHint = window.sessionStorage.getItem(RATE_LIMIT_HINT_KEY);
            if (rawHint) {
              const parsedHint = JSON.parse(rawHint);
              if (parsedHint && parsedHint.nextAvailableAtMs > nowMs) {
                rateLimitLockRef.current = parsedHint;
              } else {
                window.sessionStorage.removeItem(RATE_LIMIT_HINT_KEY);
              }
            }
          } catch {
            // ignore
          }
        }

        // Layer 2 Client Short-Circuit: if 6/6 slots are already full until `nextAvailableAtMs`,
        // show the Listen Later + Recent popup immediately with ZERO Vercel/Neon requests!
        const activeLock = rateLimitLockRef.current;
        if (activeLock && activeLock.nextAvailableAtMs > nowMs) {
          const retryAfterSec = Math.max(
            1,
            Math.ceil((activeLock.nextAvailableAtMs - nowMs) / 1000)
          );
          const popupContent = formatRateLimitMessage(
            activeLock.nextAvailableAt,
            retryAfterSec,
            activeLock.limit || 6,
            currentTrackRef.current
          );
          wantPlayingRef.current = false;
          setIsBuffering(false);
          setIsPlaying(false);
          setRateLimitInfo({
            limit: activeLock.limit || 6,
            used: activeLock.used || 6,
            remaining: 0,
            retryAfterSec,
            nextAvailableAt: activeLock.nextAvailableAt,
          });
          setRateLimitPopup(popupContent);
          setAudioError(popupContent.message);
          return;
        } else if (activeLock) {
          rateLimitLockRef.current = null;
          try {
            window.sessionStorage.removeItem(RATE_LIMIT_HINT_KEY);
          } catch {
            // ignore
          }
        }

        try {
          const permRes = await fetch("/api/audio/play-permission", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ streamUrl }),
          });

          // Abort if unmounted or a newer track load superseded this one while waiting
          if (
            !isMountedRef.current ||
            sourceTokenRef.current !== loadToken ||
            audioRef.current !== audio
          ) {
            return;
          }

          const permData = await permRes.json().catch(() => ({}));

          if (permRes.status === 429 || permData?.allowed === false) {
            wantPlayingRef.current = false;
            setIsBuffering(false);
            setIsPlaying(false);
            const nextMs = permData.nextAvailableAt
              ? new Date(permData.nextAvailableAt).getTime()
              : Date.now() + (permData.retryAfterSec || 60) * 1000;
            const lockObj = {
              limit: permData.limit || 6,
              used: permData.used || 6,
              nextAvailableAt: permData.nextAvailableAt || new Date(nextMs).toISOString(),
              nextAvailableAtMs: nextMs,
            };
            rateLimitLockRef.current = lockObj;
            try {
              window.sessionStorage.setItem(RATE_LIMIT_HINT_KEY, JSON.stringify(lockObj));
            } catch {
              // ignore
            }
            const popupContent = formatRateLimitMessage(
              lockObj.nextAvailableAt,
              permData.retryAfterSec,
              lockObj.limit,
              currentTrackRef.current
            );
            setRateLimitInfo({
              limit: lockObj.limit,
              used: lockObj.used,
              remaining: 0,
              retryAfterSec: permData.retryAfterSec || 60,
              nextAvailableAt: lockObj.nextAvailableAt,
            });
            setRateLimitPopup(popupContent);
            setAudioError(popupContent.message);
            return;
          }

          if (permRes.ok && permData?.allowed) {
            const expMs = permData.expiresAt
              ? new Date(permData.expiresAt).getTime()
              : Date.now() + 29 * 60 * 1000;
            grantedStreamsRef.current.set(streamUrl, expMs);

            // If this 6th track just filled the 6/6 window (non-exempt), pre-arm the client lock
            // so even the VERY FIRST 7th click triggers popup locally with 0 server/DB hits!
            if (!permData.exempt && permData.remaining === 0 && permData.nextAvailableAt) {
              const nextMs = new Date(permData.nextAvailableAt).getTime();
              if (nextMs > Date.now()) {
                const lockObj = {
                  limit: permData.limit || 6,
                  used: permData.used || 6,
                  nextAvailableAt: permData.nextAvailableAt,
                  nextAvailableAtMs: nextMs,
                };
                rateLimitLockRef.current = lockObj;
                try {
                  window.sessionStorage.setItem(RATE_LIMIT_HINT_KEY, JSON.stringify(lockObj));
                } catch {
                  // ignore
                }
              }
            }

            setRateLimitInfo({
              limit: permData.limit || 6,
              used: permData.used || 1,
              remaining: permData.exempt ? 999 : (permData.remaining ?? 5),
              retryAfterSec: 0,
              nextAvailableAt: permData.nextAvailableAt || null,
            });
          }
        } catch (permErr) {
          // If network dropped mid-permission check, let offline fallback handle it
          console.warn("Playback permission request error:", permErr);
        }
      }
    }

    // Permission confirmed (or cached/offline) — now safely record in Recent-6 & History!
    if (currentTrackRef.current && !currentTrackRef.current.isMock) {
      syncTrackIntoRecentPlaylist(currentTrackRef.current);
      recordAudioHistory(
        currentTrackRef.current,
        safeResume,
        getAccurateDuration() || currentTrackRef.current.durationSec || 1800,
        playlistRef.current,
        true
      );
    }

    const playSrc = useBlob ? cachedInfo.url : buildDirectStreamUrl(streamUrl, bypassSw);

    try {
      audio.pause();
      pendingResumeTimeRef.current = safeResume > 0 ? safeResume : null;
      currentTimeRef.current = safeResume;
      loadedStreamKeyRef.current = streamUrl;
      activeAudioSrcRef.current = normalizeComparableUrl(playSrc);
      audio.__gjLoadToken = loadToken;

      if (cachedInfo?.complete) {
        bgCacheCompleteRef.current = true;
      }

      audio.src = playSrc;
      audio.playbackRate = speedRef.current;
      audio.volume = Math.max(0, Math.min(1, volumeRef.current / 100));
      audio.load();

      if (autoPlay) {
        wantPlayingRef.current = true;
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              if (!isMountedRef.current || sourceTokenRef.current !== loadToken) return;
              setIsBuffering(false);
              setIsPlaying(true);
              setAudioError(null);
            })
            .catch((err) => {
              if (!isMountedRef.current || sourceTokenRef.current !== loadToken) return;
              // Ignore AbortError caused by rapid track switching
              if (err && err.name === "AbortError") return;
              console.warn("Audio playback prevented or failed:", playSrc, err);
              setIsBuffering(false);
              setIsPlaying(false);
            });
        } else {
          setIsBuffering(false);
          setIsPlaying(true);
          setAudioError(null);
        }
      } else {
        setIsBuffering(false);
        setIsPlaying(false);
      }
    } catch (err) {
      console.warn("Audio start error:", err);
      if (isMountedRef.current && sourceTokenRef.current === loadToken) {
        setIsBuffering(false);
        setIsPlaying(false);
      }
    }

    // If not completely cached yet and we're online, progressively cache into IndexedDB
    if (!cachedInfo?.complete && !isOfflineNow) {
      cacheAudioInBackground(
        streamUrl,
        ({ loadedBytes, totalBytes, complete }) => {
          if (
            !isMountedRef.current ||
            sourceTokenRef.current !== loadToken ||
            loadedStreamKeyRef.current !== streamUrl
          ) {
            return;
          }
          if (totalBytes > 0) {
            const estDur = getAccurateDuration();
            if (estDur > 0) {
              const ratio = Math.min(1, Math.max(0, loadedBytes / totalBytes));
              bgCacheCompleteRef.current = Boolean(complete);
              bgCacheBufferedRef.current = complete ? estDur : ratio * estDur;
              recomputeBufferedTime();
            }
          }
        },
        ownerId
      ).catch(() => {});
    }
  };

  loadAndPlayAudioSourceRef.current = loadAndPlayAudioSource;

  /**
   * Bug #7 Fix: Separates in-memory React state update from localStorage persistence
   * and writes compact playlist snapshots to avoid heavy serialization every 2.5s.
   */
  const persistHistory = (nextHistory, writeToStorage = true) => {
    historyItemsRef.current = nextHistory;
    if (isMountedRef.current) {
      setHistoryItems(nextHistory);
    }
    if (writeToStorage && typeof window !== "undefined") {
      try {
        window.localStorage.setItem(USER_HISTORY_KEY, JSON.stringify(nextHistory));
      } catch {
        // Ignore storage quota error
      }
    }
  };

  const recordAudioHistory = (trackObj, timeSec, durSec, listObj = null, forcePersist = false) => {
    if (!trackObj || trackObj.isMock || !trackObj.id) return;
    const entryId = `audio:${trackObj.id}`;
    const safeTime = Math.max(0, Math.floor(Number(timeSec) || 0));
    const safeDur = Math.max(1, Math.floor(Number(durSec) || trackObj.durationSec || 1800));

    const now = Date.now();
    const isSameTrack = lastPersistedTrackIdRef.current === trackObj.id;
    const secDelta = Math.abs(safeTime - lastPersistedSecRef.current);
    const timeSinceWrite = now - lastHistoryPersistTimeRef.current;

    // Skip redundant writes if not forced and change is minimal
    if (!forcePersist && isSameTrack && secDelta < 5 && timeSinceWrite < 10000) {
      return;
    }

    // Store compact playlist snapshot (max 50 tracks, minimal fields) to keep localStorage fast & small
    const rawList = Array.isArray(listObj) && listObj.length > 0 ? listObj : playlistRef.current;
    const compactPlaylist = Array.isArray(rawList)
      ? rawList
          .slice(0, 50)
          .map((t) => sanitizeTrackForStorage(t, safeDur))
          .filter(Boolean)
      : [];

    const cleanTrack = sanitizeTrackForStorage(trackObj, safeDur) || {
      ...trackObj,
      url: formatAudioUrl(trackObj.url),
    };

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
      track: cleanTrack,
      playlist: compactPlaylist,
      updatedAt: now,
    };

    const existingList = historyItemsRef.current || [];
    const filtered = existingList.filter((item) => item.id !== entryId);
    const nextHistory = [newEntry, ...filtered].slice(0, 60);

    lastHistoryPersistTimeRef.current = now;
    lastPersistedSecRef.current = safeTime;
    lastPersistedTrackIdRef.current = trackObj.id;

    persistHistory(nextHistory, true);
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
    persistHistory(nextHistory, true);
  };

  const getBookReadingProgress = (storyId) => {
    if (!storyId) return null;
    const existingList = historyItemsRef.current || [];
    return existingList.find((item) => item.id === `ebook:${storyId}`) || null;
  };

  const persistRecentPlaylist = (nextTracks) => {
    const cleaned = Array.isArray(nextTracks)
      ? nextTracks
          .map((t) => sanitizeTrackForStorage(t))
          .filter(Boolean)
          .slice(0, RECENT_PLAYLIST_LIMIT)
      : [];
    recentPlaylistRef.current = cleaned;
    if (isMountedRef.current) {
      setRecentPlaylistTracks(cleaned);
    }
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(USER_RECENT_PLAYLIST_KEY, JSON.stringify(cleaned));
      } catch {
        // Ignore storage error
      }
    }
  };

  /**
   * Stable Recent-6 Playlist updater:
   * - If `trackObj` is ALREADY one of the current 6 tracks -> keeps exact serial order intact!
   * - Only when a NEW track outside the current 6 is played -> inserts at top & slices to 6.
   */
  const syncTrackIntoRecentPlaylist = (trackObj) => {
    if (!trackObj || trackObj.isMock || !trackObj.id) return;
    const cleanTrack = sanitizeTrackForStorage(trackObj, durationRef.current || 1800);
    if (!cleanTrack) return;

    const currentList = recentPlaylistRef.current || [];
    const existingIdx = currentList.findIndex((t) => t && t.id === cleanTrack.id);
    if (existingIdx >= 0) {
      // Already inside the 6 recent tracks -> preserve exact serial order!
      return;
    }

    const nextList = [cleanTrack, ...currentList].slice(0, RECENT_PLAYLIST_LIMIT);
    persistRecentPlaylist(nextList);
  };

  const removeFromRecentPlaylist = (trackId) => {
    if (!trackId) return;
    const nextList = (recentPlaylistRef.current || []).filter((t) => t.id !== trackId);
    persistRecentPlaylist(nextList);
  };

  const removeHistoryItem = (entryId) => {
    const existingList = historyItemsRef.current || [];
    persistHistory(existingList.filter((item) => item.id !== entryId), true);
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
          const parsed = sanitizeHistoryList(JSON.parse(saved));
          return parsed.find((h) => h && h.type === "audio" && h.track && h.track.id) || null;
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
          const safeIdx = idx >= 0 ? idx : 0;
          const restoredTime = Number(lastAudio.currentTime) || 0;
          const restoredDur = Number(lastAudio.duration) || restoredTrack.durationSec || 1800;

          syncPlaylistState(restoredList, safeIdx);
          currentTimeRef.current = restoredTime;
          setCurrentTime(restoredTime);
          durationRef.current = restoredDur;
          setDuration(restoredDur);
          return restoredTrack;
        }

        const hasParts = Array.isArray(firstRealBook.tracks) && firstRealBook.tracks.length > 0;
        const target = hasParts ? firstRealBook.tracks[0] : firstRealBook;
        const initList = hasParts ? firstRealBook.tracks : [firstRealBook];
        const initDur = target.durationSec || firstRealBook.durationSec || 1800;

        syncPlaylistState(initList, 0);
        durationRef.current = initDur;
        setDuration(initDur);
        return {
          ...target,
          url: formatAudioUrl(target.url || firstRealBook.url),
        };
      }
      return prev;
    });
  };

  // Load saved user playlists, history & clips from localStorage on mount (with validation)
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = window.localStorage.getItem(USER_PLAYLISTS_KEY);
      if (saved) {
        const validated = sanitizeUserPlaylists(JSON.parse(saved));
        setUserPlaylists(validated);
      }
    } catch {
      setUserPlaylists(DEFAULT_USER_PLAYLISTS);
    }

    try {
      const savedHist = window.localStorage.getItem(USER_HISTORY_KEY);
      if (savedHist) {
        const parsedHist = sanitizeHistoryList(JSON.parse(savedHist));
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
          const restoredTime = Number(lastAudio.currentTime) || 0;
          const restoredDur = Number(lastAudio.duration) || restoredTrack.durationSec || 1800;

          setCurrentTrack((prev) => (!prev || prev.isMock ? restoredTrack : prev));
          syncPlaylistState(restoredList, idx >= 0 ? idx : 0);
          currentTimeRef.current = restoredTime;
          setCurrentTime(restoredTime);
          durationRef.current = restoredDur;
          setDuration(restoredDur);
        }
      }
    } catch {
      // Ignore storage error
    }

    try {
      const savedRecent = window.localStorage.getItem(USER_RECENT_PLAYLIST_KEY);
      if (savedRecent) {
        const parsedRecent = JSON.parse(savedRecent);
        if (Array.isArray(parsedRecent) && parsedRecent.length > 0) {
          const cleanedRecent = parsedRecent
            .map((t) => sanitizeTrackForStorage(t))
            .filter(Boolean)
            .slice(0, RECENT_PLAYLIST_LIMIT);
          recentPlaylistRef.current = cleanedRecent;
          setRecentPlaylistTracks(cleanedRecent);
        }
      } else if (historyItemsRef.current.length > 0) {
        // One-time seed from existing audio history
        const seeded = historyItemsRef.current
          .filter((h) => h && h.type === "audio" && h.track && h.track.id)
          .slice(0, RECENT_PLAYLIST_LIMIT)
          .map((h) => sanitizeTrackForStorage(h.track, h.duration || 1800))
          .filter(Boolean);
        if (seeded.length > 0) {
          recentPlaylistRef.current = seeded;
          setRecentPlaylistTracks(seeded);
          window.localStorage.setItem(USER_RECENT_PLAYLIST_KEY, JSON.stringify(seeded));
        }
      }
    } catch {
      // Ignore storage error
    }

    try {
      const savedClips = window.localStorage.getItem(USER_CLIPS_KEY);
      if (savedClips) {
        setAudioClips(sanitizeClipsList(JSON.parse(savedClips)));
      }
    } catch {
      // Ignore storage error
    }
  }, []);

  const persistAudioClips = (nextClips) => {
    const validated = sanitizeClipsList(nextClips);
    setAudioClips(validated);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(USER_CLIPS_KEY, JSON.stringify(validated));
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
      title:
        (clipPayload.title || "").trim() || `ক্লিপ ${formatTime(fromSec)}–${formatTime(toSec)}`,
      content: (clipPayload.content || "").trim(),
      from: fromSec,
      to: toSec,
      s: fromSec,
      name:
        (clipPayload.title || clipPayload.content || "").trim() ||
        `ক্লিপ ${formatTime(fromSec)}–${formatTime(toSec)}`,
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
      activeClipIdRef.current = null;
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

  /**
   * Bug #1 & #3 Fix: Passes `clipConfig` directly to `playTrack` so active clip state
   * is never wiped during track switch, and awaits `audio.play()` Promise before setting isPlaying.
   */
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

    const sameTrack =
      currentTrackRef.current &&
      (currentTrackRef.current.id === trackObj.id ||
        (currentTrackRef.current.url &&
          currentTrackRef.current.url === formatAudioUrl(trackObj.url)));

    if (sameTrack && audioRef.current?.src && !audioRef.current.error) {
      activeClipEndRef.current = endSec;
      activeClipIdRef.current = clip.id;
      setActiveClipEndSec(endSec);
      setActiveClipId(clip.id);
      seek(startSec);
      wantPlayingRef.current = true;
      const token = sourceTokenRef.current;
      const playPromise = audioRef.current.play?.();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            if (isMountedRef.current && sourceTokenRef.current === token) {
              setIsPlaying(true);
              setAudioError(null);
            }
          })
          .catch((err) => {
            if (err && err.name === "AbortError") return;
            if (isMountedRef.current && sourceTokenRef.current === token) {
              setIsPlaying(false);
            }
          });
      }
    } else {
      playTrack(trackObj, null, startSec, {
        clipConfig: { id: clip.id, endSec },
      });
    }

    if (openPlayer) {
      setIsFullPlayerOpen(true);
    }
  };

  /**
   * Bug #9 Fix: All playlist mutations validate through `sanitizeUserPlaylists`.
   */
  const saveUserPlaylists = (nextLists) => {
    const validated = sanitizeUserPlaylists(nextLists);
    setUserPlaylists(validated);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(USER_PLAYLISTS_KEY, JSON.stringify(validated));
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
    const cleanTrack = sanitizeTrackForStorage(track, durationRef.current || 1800);
    if (!cleanTrack) return;

    const targetExists = userPlaylists.some((pl) => pl.id === listId);
    const effectiveListId = targetExists ? listId : userPlaylists[0]?.id || "fav-playlist";

    const nextLists = userPlaylists.map((pl) => {
      if (pl.id !== effectiveListId) return pl;
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
    const cleanInitial = initialTrack
      ? sanitizeTrackForStorage(initialTrack, durationRef.current || 1800)
      : null;
    const newId = `pl-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    const newList = {
      id: newId,
      name: trimmed,
      tracks: cleanInitial ? [cleanInitial] : [],
    };
    saveUserPlaylists([...userPlaylists, newList]);
  };

  const addTrackToListenLater = (track) => {
    const cleanTrack = sanitizeTrackForStorage(track, durationRef.current || 1800);
    if (!cleanTrack) return false;
    const existingList = userPlaylists.find(
      (pl) => pl.name.trim().toLowerCase() === "listen later"
    );
    if (existingList) {
      const alreadyIn = existingList.tracks.some((t) => t.id === cleanTrack.id);
      if (!alreadyIn) {
        const nextLists = userPlaylists.map((pl) =>
          pl.id === existingList.id
            ? { ...pl, tracks: [...pl.tracks, cleanTrack] }
            : pl
        );
        saveUserPlaylists(nextLists);
      }
      return true;
    }
    const newList = {
      id: `pl-listen-later-${Date.now()}`,
      name: "Listen Later",
      tracks: [cleanTrack],
    };
    saveUserPlaylists([...userPlaylists, newList]);
    return true;
  };

  const deleteUserPlaylist = (listId) => {
    if (!listId || userPlaylists.length <= 1) return;
    const remaining = userPlaylists.filter((p) => p.id !== listId);
    if (remaining.length === 0) return;
    saveUserPlaylists(remaining);
  };

  /**
   * Play a specific track, optionally setting a playlist of nested tracks, an explicit resumeTime,
   * and optional `options.clipConfig` ({ id, endSec }) to preserve clip bounds atomically.
   *
   * Fixes applied:
   * - Bug #2: Always resolves & syncs `playlistIndex` accurately even when `newPlaylist` is omitted.
   * - Bug #3: Supports atomic `options.clipConfig` instead of wiping clip state.
   * - Bug #10: Resets both `nativeBufferedRef` and `bgCacheBufferedRef` on track switch.
   */
  const playTrack = (track, newPlaylist = null, explicitResumeTime = null, options = {}) => {
    if (!track) return;

    // Fix #4: Flush outgoing track's final position to history BEFORE switching tracks
    const prevTrack = currentTrackRef.current;
    if (prevTrack && !prevTrack.isMock && prevTrack.id && prevTrack.id !== track.id) {
      const prevPos =
        audioRef.current && Number.isFinite(audioRef.current.currentTime) && audioRef.current.currentTime > 0
          ? audioRef.current.currentTime
          : currentTimeRef.current;
      if (prevPos > 0) {
        recordAudioHistory(
          prevTrack,
          prevPos,
          getAccurateDuration() || prevTrack.durationSec || 1800,
          playlistRef.current,
          true
        );
      }
    }

    const { clipConfig = null } = options;

    // Atomically set or clear active clip bounds
    if (clipConfig && clipConfig.id) {
      activeClipEndRef.current = clipConfig.endSec ?? null;
      activeClipIdRef.current = clipConfig.id;
      setActiveClipEndSec(clipConfig.endSec ?? null);
      setActiveClipId(clipConfig.id);
    } else {
      activeClipEndRef.current = null;
      activeClipIdRef.current = null;
      setActiveClipEndSec(null);
      setActiveClipId(null);
    }
    setIsMiniPlayerDismissed(false);

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

    // Fix #1: Synchronize playlist state, playlistRef, playlistIndex, playlistIndexRef together
    let activeList = playlistRef.current;
    if (newPlaylist && Array.isArray(newPlaylist) && newPlaylist.length > 0) {
      const idx = newPlaylist.findIndex((t) => t.id === formattedTrack.id);
      activeList = syncPlaylistState(newPlaylist, idx >= 0 ? idx : 0).list;
    } else if (Array.isArray(track.tracks) && track.tracks.length > 0) {
      const idx = track.tracks.findIndex((t) => t.id === formattedTrack.id);
      activeList = syncPlaylistState(track.tracks, idx >= 0 ? idx : 0).list;
    } else {
      const existingIdx = (playlistRef.current || []).findIndex(
        (t) => t && t.id === formattedTrack.id
      );
      if (existingIdx >= 0) {
        activeList = syncPlaylistState(playlistRef.current, existingIdx).list;
      } else {
        activeList = syncPlaylistState([formattedTrack], 0).list;
      }
    }

    // Check if there is a saved timestamp in History for this track
    let resumeSec = 0;
    if (typeof explicitResumeTime === "number" && explicitResumeTime >= 0) {
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
    currentTrackRef.current = formattedTrack;
    currentTimeRef.current = resumeSec;
    setCurrentTime(resumeSec);
    const initialDur = formattedTrack.durationSec || 0;
    durationRef.current = initialDur;
    setDuration(initialDur);
    setAudioError(null);

    if (!resolvedUrl) {
      wantPlayingRef.current = false;
      setIsPlaying(false);
      setAudioError("এই পর্বের অডিও লিংক (url) পাওয়া যায়নি।");
      return;
    }

    // Reset separate buffer trackers for new track
    // Note: Recent-6 & History are recorded inside `loadAndPlayAudioSource` ONLY AFTER
    // server-side playback permission succeeds (so a rate-limited 7th track never enters Recent!)
    nativeBufferedRef.current = 0;
    bgCacheBufferedRef.current = 0;
    bgCacheCompleteRef.current = false;
    setBufferedTime(0);

    networkRetryRef.current = 0;
    wantPlayingRef.current = true;
    wasStalledOfflineRef.current = false;
    loadAndPlayAudioSource(resolvedUrl, resumeSec);
  };

  const pauseTrack = () => {
    wantPlayingRef.current = false;
    setIsBuffering(false);
    setIsPlaying(false);
    if (audioRef.current) {
      audioRef.current.pause();
      if (currentTrackRef.current) {
        recordAudioHistory(
          currentTrackRef.current,
          audioRef.current.currentTime || currentTimeRef.current,
          getAccurateDuration() || 1800,
          playlistRef.current,
          true
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
            currentTimeRef.current > 0
              ? currentTimeRef.current
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

        audioRef.current.playbackRate = speedRef.current;
        wantPlayingRef.current = true;
        const token = sourceTokenRef.current;
        const playPromise = audioRef.current.play();
        if (playPromise !== undefined) {
          // Bug #1 Fix: Wait for Promise resolution before updating isPlaying
          playPromise
            .then(() => {
              if (!isMountedRef.current || sourceTokenRef.current !== token) return;
              setIsPlaying(true);
              setAudioError(null);
            })
            .catch((err) => {
              if (err && err.name === "AbortError") return;
              console.warn("Play error:", err);
              if (isMountedRef.current && sourceTokenRef.current === token) {
                setIsPlaying(false);
              }
            });
        } else {
          setIsPlaying(true);
          setAudioError(null);
        }
      }
    }
  };

  /**
   * Bug #5 Fix: Validates seek position against the actual audio duration (or seekable range)
   * instead of an arbitrary estimated 1800s fallback.
   */
  const seek = (timeInSec) => {
    const a = audioRef.current;
    let maxDur = 0;

    if (a && Number.isFinite(a.duration) && a.duration > 0) {
      maxDur = a.duration;
    } else if (a && a.seekable && a.seekable.length > 0) {
      const seekEnd = a.seekable.end(a.seekable.length - 1);
      if (Number.isFinite(seekEnd) && seekEnd > 0) {
        maxDur = seekEnd;
      }
    }

    if (maxDur <= 0) {
      maxDur = getAccurateDuration();
    }

    const numericTarget = Number(timeInSec);
    if (!Number.isFinite(numericTarget)) return;

    const target = maxDur > 0 ? Math.max(0, Math.min(maxDur, numericTarget)) : Math.max(0, numericTarget);
    currentTimeRef.current = target;
    setCurrentTime(target);

    if (a && a.src) {
      if (a.readyState >= 1) {
        try {
          a.currentTime = target;
          pendingResumeTimeRef.current = null;
        } catch {
          pendingResumeTimeRef.current = target;
        }
      } else {
        // Audio metadata not loaded yet — defer seek until loadedmetadata
        pendingResumeTimeRef.current = target;
      }

      // Fix #5: When offline and seeking outside buffered ranges, do NOT show playback as active
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        const isBuffered = isTimeBufferedInAudio(a, target, 0.5);
        if (!isBuffered) {
          wasStalledOfflineRef.current = true;
          try {
            a.pause();
          } catch {
            // ignore
          }
          setIsPlaying(false);
          setAudioError(
            "ইন্টারনেট সংযোগ নেই — এই অংশটি বাফার করা নেই। আগে বাফার/ক্যাশ হওয়া অংশে সিক করুন অথবা অনলাইনে আসুন।"
          );
        } else {
          wasStalledOfflineRef.current = false;
          setAudioError(null);
        }
      }
    }

    if (currentTrackRef.current) {
      recordAudioHistory(
        currentTrackRef.current,
        target,
        maxDur || 1800,
        playlistRef.current,
        true
      );
    }
  };

  const skip = (deltaSec) => {
    seek(currentTimeRef.current + deltaSec);
  };

  /**
   * Play next track in playlist (if nested collection)
   */
  const playNext = () => {
    const list = playlistRef.current;
    const idx = playlistIndexRef.current;
    if (list.length > 1 && idx < list.length - 1) {
      const nextIdx = idx + 1;
      syncPlaylistState(list, nextIdx);
      playTrack(list[nextIdx], list);
    }
  };

  /**
   * Play previous track in playlist (if nested collection)
   */
  const playPrev = () => {
    const list = playlistRef.current;
    const idx = playlistIndexRef.current;
    if (list.length > 1 && idx > 0) {
      const prevIdx = idx - 1;
      syncPlaylistState(list, prevIdx);
      playTrack(list[prevIdx], list);
    }
  };

  const handleSetSpeed = (newSpeed) => {
    setSpeed(newSpeed);
    speedRef.current = newSpeed;
    if (audioRef.current) {
      audioRef.current.playbackRate = newSpeed;
    }
  };

  const handleSetVolume = (newVol) => {
    setVolume(newVol);
    volumeRef.current = newVol;
    if (audioRef.current) {
      audioRef.current.volume = Math.max(0, Math.min(1, newVol / 100));
    }
  };

  // Register Offline-First Audio Chunk Cache SW, persistent storage, online recovery & history flush
  useEffect(() => {
    if (typeof window === "undefined") return;
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw-audio-cache.js", { scope: "/" }).catch(() => {});
    }
    if (navigator.storage && typeof navigator.storage.persist === "function") {
      navigator.storage.persist().catch(() => {});
    }

    // Bug #4 Fix: Accurately preserve resume position when recovering from offline/partial blob
    const onOnline = () => {
      if (!isMountedRef.current) return;
      setAudioError(null);
      networkRetryRef.current = 0;

      // Do NOT auto-play if the browser tab is hidden/closed
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        return;
      }

      const a = audioRef.current;
      const streamUrl =
        loadedStreamKeyRef.current ||
        (currentTrackRef.current ? formatAudioUrl(currentTrackRef.current.url) : "");

      if (!a || !streamUrl || !currentTrackRef.current) return;

      const needsRecovery =
        Boolean(a.error) ||
        a.readyState < 3 ||
        wasStalledOfflineRef.current ||
        usingPartialBlobRef.current ||
        (wantPlayingRef.current && a.paused);

      if (needsRecovery) {
        const audioPos = Number.isFinite(a.currentTime) && a.currentTime > 0 ? a.currentTime : 0;
        const trackedPos =
          Number.isFinite(currentTimeRef.current) && currentTimeRef.current > 0
            ? currentTimeRef.current
            : 0;
        const resumeAt = Math.max(audioPos, trackedPos);

        wasStalledOfflineRef.current = false;
        usingPartialBlobRef.current = false;
        if (loadAndPlayAudioSourceRef.current) {
          loadAndPlayAudioSourceRef.current(streamUrl, resumeAt, {
            forceNetwork: true,
            bypassSw: false,
            autoPlay: wantPlayingRef.current,
          });
        }
      }
    };

    // Bug #7 Fix: Flush latest audio position to localStorage when tab hides or unloads
    const flushHistoryNow = () => {
      const a = audioRef.current;
      if (currentTrackRef.current && (a?.currentTime > 0 || currentTimeRef.current > 0)) {
        recordAudioHistory(
          currentTrackRef.current,
          a && a.currentTime > 0 ? a.currentTime : currentTimeRef.current,
          getAccurateDuration() || 1800,
          playlistRef.current,
          true
        );
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flushHistoryNow();
      }
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("beforeunload", flushHistoryNow);
    window.addEventListener("pagehide", flushHistoryNow);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("beforeunload", flushHistoryNow);
      window.removeEventListener("pagehide", flushHistoryNow);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  /**
   * HTML5 audio event handlers attached to off-DOM Audio instance.
   *
   * Fixes applied:
   * - Bug #4: Applies `pendingResumeTimeRef` reliably in `loadedmetadata` AND `canplay`,
   *           and blocks premature `timeupdate` at 0 from clobbering pending resume position.
   * - Bug #6: `isStaleEvent()` validates that the event belongs to the active `audio` instance
   *           and active `src` before mutating any React state.
   * - Bug #8: Complete cleanup on unmount (pauses, clears src, removes all listeners,
   *           invalidates in-flight tokens, and releases blob URLs — Strict Mode safe).
   * - Bug #10: Updates `nativeBufferedRef` separately and clamps via `recomputeBufferedTime()`.
   */
  useEffect(() => {
    if (typeof window === "undefined") return;
    isMountedRef.current = true;
    const mountOwnerId = Symbol("audio-player-mount");
    ownerIdRef.current = mountOwnerId;

    const audio = new window.Audio();
    audio.preload = "metadata"; // Avoid aggressive 206 bursts; lib/audioOfflineCache caches full track in 1 clean request
    audio.__gjLoadToken = -1;
    audioRef.current = audio;

    // Fix #2: Strict per-load token + canonical URL validation (eliminates relative/absolute mismatch)
    const isStaleEvent = () => {
      if (!isMountedRef.current || audioRef.current !== audio) return true;
      if (audio.__gjLoadToken !== sourceTokenRef.current) return true;
      const expected = activeAudioSrcRef.current;
      if (!expected) return true;
      const actualNormalized = normalizeComparableUrl(audio.src || audio.getAttribute("src") || "");
      return !actualNormalized || actualNormalized !== expected;
    };

    const applyPendingResume = () => {
      if (pendingResumeTimeRef.current === null) return;
      const targetTime = pendingResumeTimeRef.current;
      const realDur = Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : 0;
      const clampedTarget = realDur > 0 ? Math.min(targetTime, Math.max(0, realDur - 0.5)) : targetTime;
      try {
        audio.currentTime = clampedTarget;
        currentTimeRef.current = clampedTarget;
        setCurrentTime(clampedTarget);
        pendingResumeTimeRef.current = null;
      } catch {
        // Retry on next canplay if not seekable yet
      }
    };

    const updateBuffered = () => {
      if (isStaleEvent()) return;
      try {
        if (audio.buffered && audio.buffered.length > 0) {
          let maxEnd = 0;
          for (let i = 0; i < audio.buffered.length; i++) {
            const end = audio.buffered.end(i);
            if (Number.isFinite(end) && end > maxEnd) maxEnd = end;
          }
          nativeBufferedRef.current = Math.max(nativeBufferedRef.current, maxEnd);
          recomputeBufferedTime();
        }
      } catch {
        // Ignore
      }
    };

    const onLoadedMetadata = () => {
      if (isStaleEvent()) return;
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        durationRef.current = audio.duration;
        setDuration(audio.duration);
      }
      applyPendingResume();
      updateBuffered();
    };

    const onCanPlay = () => {
      if (isStaleEvent()) return;
      applyPendingResume();
      updateBuffered();
    };

    const onTimeUpdate = () => {
      if (isStaleEvent()) return;

      // Bug #4 Fix: Do not let an initial 0s timeupdate overwrite pending resume position
      if (pendingResumeTimeRef.current !== null && audio.currentTime < 0.5) {
        return;
      }

      currentTimeRef.current = audio.currentTime;
      setCurrentTime(audio.currentTime);

      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        durationRef.current = audio.duration;
        setDuration(audio.duration);
      }
      updateBuffered();

      // Fix #4 & #6: When a clip finishes, clamp to exact endSec, pause cleanly, clear clip bounds
      // so normal playback continues past endSec on next Play, and persist position to history!
      if (
        activeClipEndRef.current !== null &&
        audio.currentTime >= activeClipEndRef.current
      ) {
        const clipEndPos = activeClipEndRef.current;
        audio.pause();
        try {
          audio.currentTime = clipEndPos;
        } catch {
          // ignore
        }
        currentTimeRef.current = clipEndPos;
        setCurrentTime(clipEndPos);
        wantPlayingRef.current = false;
        setIsPlaying(false);
        activeClipEndRef.current = null;
        activeClipIdRef.current = null;
        setActiveClipEndSec(null);
        setActiveClipId(null);

        if (currentTrackRef.current) {
          recordAudioHistory(
            currentTrackRef.current,
            clipEndPos,
            getAccurateDuration() || 1800,
            playlistRef.current,
            true
          );
        }
        return;
      }

      // Bug #7 Fix: Throttled history persistence (skips redundant writes inside recordAudioHistory)
      if (currentTrackRef.current && audio.currentTime > 1) {
        recordAudioHistory(
          currentTrackRef.current,
          audio.currentTime,
          getAccurateDuration() || 1800,
          playlistRef.current,
          false
        );
      }
    };

    const onStalledOrWaiting = () => {
      if (isStaleEvent()) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        wasStalledOfflineRef.current = true;
        setIsBuffering(false);
        setIsPlaying(false);
        setAudioError(
          "ইন্টারনেট সংযোগ নেই — তবে আগে বাফার/ক্যাশ হওয়া অংশটুকু সিক করে অফলাইনে শুনতে পারবেন।"
        );
      } else if (wantPlayingRef.current) {
        setIsBuffering(true);
      }
    };

    const onPlaying = () => {
      if (isStaleEvent()) return;
      // Fix #5: Do not mark playback successful if offline at an unbuffered position
      if (
        typeof navigator !== "undefined" &&
        navigator.onLine === false &&
        !isTimeBufferedInAudio(audio, audio.currentTime, 0.75)
      ) {
        wasStalledOfflineRef.current = true;
        try {
          audio.pause();
        } catch {
          // ignore
        }
        setIsBuffering(false);
        setIsPlaying(false);
        return;
      }
      wasStalledOfflineRef.current = false;
      setIsBuffering(false);
      setAudioError(null);
      setIsPlaying(true);
    };

    const onEnded = () => {
      if (isStaleEvent()) return;
      const list = playlistRef.current;
      const idx = playlistIndexRef.current;
      if (list.length > 0 && idx < list.length - 1) {
        const nextIdx = idx + 1;
        syncPlaylistState(list, nextIdx);
        playTrack(list[nextIdx], list);
      } else {
        wantPlayingRef.current = false;
        setIsPlaying(false);
        currentTimeRef.current = 0;
        setCurrentTime(0);
      }
    };

    const onError = async () => {
      if (isStaleEvent()) return;

      const loadToken = sourceTokenRef.current;
      const streamUrl = loadedStreamKeyRef.current;
      const isOnlineNow = typeof navigator === "undefined" || navigator.onLine !== false;
      const resumeAt = Math.max(
        Number.isFinite(audio.currentTime) ? audio.currentTime : 0,
        currentTimeRef.current || 0
      );

      // Case A: A cached `blob:` URL failed while online -> invalidate & recover from live server
      if (
        streamUrl &&
        audio.src.startsWith("blob:") &&
        isOnlineNow &&
        networkRetryRef.current < 1
      ) {
        networkRetryRef.current += 1;
        await invalidateOfflineCachedAudio(streamUrl);
        if (!isMountedRef.current || sourceTokenRef.current !== loadToken) return;
        if (loadAndPlayAudioSourceRef.current) {
          loadAndPlayAudioSourceRef.current(streamUrl, resumeAt, {
            forceNetwork: true,
            bypassSw: true,
            autoPlay: wantPlayingRef.current,
          });
          return;
        }
      }

      // Case B: Streaming `/api/stream?t=...` failed while OFFLINE -> switch to IndexedDB blob: URL
      if (streamUrl && !audio.src.startsWith("blob:") && !isOnlineNow) {
        const cached = await getOfflineCachedAudioUrl(streamUrl, mountOwnerId);
        if (!isMountedRef.current || sourceTokenRef.current !== loadToken) return;
        if (cached && cached.url) {
          usingPartialBlobRef.current = !cached.complete;
          pendingResumeTimeRef.current = resumeAt > 0 ? resumeAt : null;
          const nextToken = ++sourceTokenRef.current;
          activeAudioSrcRef.current = normalizeComparableUrl(cached.url);
          audio.__gjLoadToken = nextToken;
          audio.src = cached.url;
          audio.load();
          const playPromise = audio.play();
          if (playPromise !== undefined) {
            playPromise
              .then(() => {
                if (!isMountedRef.current || sourceTokenRef.current !== nextToken) return;
                setIsPlaying(true);
                setAudioError(null);
              })
              .catch(() => {
                if (!isMountedRef.current || sourceTokenRef.current !== nextToken) return;
                setIsPlaying(false);
              });
          }
          return;
        }
      }

      // Case C: Streaming `/api/stream?t=...` failed while ONLINE (e.g. expired grant cookie or stale SW)
      // -> Clear local grant session so next load re-validates permission & bypasses SW once
      if (
        streamUrl &&
        !audio.src.startsWith("blob:") &&
        isOnlineNow &&
        networkRetryRef.current < 1
      ) {
        networkRetryRef.current += 1;
        grantedStreamsRef.current.delete(streamUrl);
        if (loadAndPlayAudioSourceRef.current) {
          loadAndPlayAudioSourceRef.current(streamUrl, resumeAt, {
            forceNetwork: true,
            bypassSw: true,
            autoPlay: wantPlayingRef.current,
          });
          return;
        }
      }

      if (!isMountedRef.current || sourceTokenRef.current !== loadToken) return;
      setIsBuffering(false);
      setIsPlaying(false);
      if (!isOnlineNow) {
        wasStalledOfflineRef.current = true;
        setAudioError(
          "ইন্টারনেট সংযোগ নেই — তবে আগে বাফার/ক্যাশ হওয়া অংশটুকু সিক করে অফলাইনে শুনতে পারবেন।"
        );
      } else {
        setAudioError("অডিও ফাইলটি প্লে করা যাচ্ছে না। লিংক বা ইন্টারনেট সংযোগ পরীক্ষা করুন।");
      }
    };

    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("canplay", onCanPlay);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("progress", updateBuffered);
    audio.addEventListener("stalled", onStalledOrWaiting);
    audio.addEventListener("waiting", onStalledOrWaiting);
    audio.addEventListener("playing", onPlaying);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);

    // Fix #3: Ownership-based cleanup on unmount (React Strict Mode safe — never revokes shared blob URLs prematurely)
    return () => {
      isMountedRef.current = false;
      sourceTokenRef.current += 1;
      activeAudioSrcRef.current = "";
      audio.__gjLoadToken = -1;

      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("canplay", onCanPlay);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("progress", updateBuffered);
      audio.removeEventListener("stalled", onStalledOrWaiting);
      audio.removeEventListener("waiting", onStalledOrWaiting);
      audio.removeEventListener("playing", onPlaying);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);

      try {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      } catch {
        // Ignore cleanup error
      }
      if (audioRef.current === audio) {
        audioRef.current = null;
      }
      releaseOfflineAudioOwner(mountOwnerId);
    };
  }, []);

  return (
    <AudioPlayerContext.Provider
      value={{
        currentTrack,
        playlist,
        playlistIndex,
        isPlaying,
        isBuffering,
        currentTime,
        duration: duration || currentTrack?.durationSec || 1800,
        bufferedTime,
        speed,
        volume,
        isFullPlayerOpen,
        audioError,
        rateLimitInfo,
        rateLimitPopup,
        dismissRateLimitPopup: () => setRateLimitPopup(null),
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
        recentPlaylistTracks,
        removeFromRecentPlaylist,
        isTrackInPlaylist,
        toggleTrackInUserPlaylist,
        createUserPlaylist,
        addTrackToListenLater,
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
