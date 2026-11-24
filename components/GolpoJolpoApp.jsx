"use client";

import React, { useEffect, useRef, useState } from "react";
import { DataService } from "../lib/dataService";
import {
  AudioPlayerProvider,
  useAudioPlayer,
} from "../context/AudioPlayerContext";
import { AuthProvider } from "../context/AuthContext";
import Navigation from "./layout/Navigation";
import ProfileDialog from "./layout/ProfileDialog";
import PullToRefresh from "./layout/PullToRefresh";
import MiniPlayer from "./player/MiniPlayer";
import PlayerView from "./player/PlayerView";
import HomeView from "./views/HomeView";
import LibraryView from "./views/LibraryView";
import CategoryView from "./views/CategoryView";
import BookDetailView from "./views/BookDetailView";
import WritersView from "./views/WritersView";
import AuthorDetailView from "./views/AuthorDetailView";
import MagazineView from "./views/MagazineView";
import SearchView from "./views/SearchView";
import EBookDetailView from "./views/EBookDetailView";
import EBookReaderModal from "./views/EBookReaderModal";
import PlaylistsView from "./views/PlaylistsView";
import PlaylistDetailView from "./views/PlaylistDetailView";
import ReaderApp from "./ReaderAppWrapper";
import {
  MOCK_CATEGORIES,
  MOCK_AUDIO_BOOKS,
  MOCK_SHORT_STORIES,
  MOCK_WRITERS,
} from "../lib/mockData";

function MainApp() {
  const [route, setRoute] = useState("home");
  const [history, setHistory] = useState([]);

  // Collections state from Firestore (with mock fallback)
  const [categories, setCategories] = useState(MOCK_CATEGORIES);
  const [audioBooks, setAudioBooks] = useState(MOCK_AUDIO_BOOKS);
  const [shortStories, setShortStories] = useState(MOCK_SHORT_STORIES);
  const [writers, setWriters] = useState(MOCK_WRITERS);
  const [magazines, setMagazines] = useState([]);

  // Selected item states
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedBook, setSelectedBook] = useState(null);
  const [selectedWriter, setSelectedWriter] = useState(null);
  const [selectedStory, setSelectedStory] = useState(null);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState(null);
  const [isReaderModalOpen, setIsReaderModalOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const mainRef = useRef(null);

  const {
    isFullPlayerOpen,
    closeFullPlayer,
    openFullPlayer,
    syncInitialTrack,
    rateLimitPopup,
    dismissRateLimitPopup,
    addTrackToListenLater,
  } = useAudioPlayer();
  const [listenLaterAdded, setListenLaterAdded] = useState(false);

  useEffect(() => {
    setListenLaterAdded(false);
  }, [rateLimitPopup]);

  // Load from Cache first (only hits Firebase once if cache is empty) + sync with Reverse API on focus
  useEffect(() => {
    const unsubCats = DataService.listenCategories((data) => setCategories(data));
    const unsubAudio = DataService.listenAudioBooks((data) => {
      setAudioBooks(data);
      if (Array.isArray(data) && data.length > 0) {
        syncInitialTrack(data[0], data);
      }
    });
    const unsubStories = DataService.listenShortStories((data) => setShortStories(data));
    const unsubWriters = DataService.listenWriters((data) => setWriters(data));
    setMagazines(DataService.getMagazines());

    const handleFocus = () => {
      DataService.syncWithReverseApi();
    };
    window.addEventListener("focus", handleFocus);

    return () => {
      window.removeEventListener("focus", handleFocus);
      if (typeof unsubCats === "function") unsubCats();
      if (typeof unsubAudio === "function") unsubAudio();
      if (typeof unsubStories === "function") unsubStories();
      if (typeof unsubWriters === "function") unsubWriters();
    };
  }, []);

  // Listen to hash change for browser back/forward support (mount-only!)
  useEffect(() => {
    const handleHash = () => {
      const hash = window.location.hash.slice(1);
      if (hash && ["home", "library", "writers", "magazine", "search"].includes(hash)) {
        setRoute(hash);
      }
    };
    if (window.location.hash) handleHash();
    window.addEventListener("hashchange", handleHash);
    return () => window.removeEventListener("hashchange", handleHash);
  }, []);

  // Open Recent 6 Playlist when Navbar Recent pill is clicked (isolated from hashchange!)
  useEffect(() => {
    const handleOpenRecentPlaylist = () => {
      setSelectedPlaylistId("__recent__");
      setRoute((prevRoute) => {
        if (prevRoute !== "player" && prevRoute !== "playlist") {
          setHistory((prevHist) => [...prevHist, prevRoute]);
        }
        return "playlist";
      });
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    window.addEventListener("golpojolpo:open-recent-playlist", handleOpenRecentPlaylist);
    return () =>
      window.removeEventListener("golpojolpo:open-recent-playlist", handleOpenRecentPlaylist);
  }, []);

  const navigateTo = (newRoute) => {
    if (newRoute === route) return;
    setHistory((prev) => {
      // Do not push 'player' into history so pressing Back from a page never goes back into the player
      if (route === "player") return prev;
      return [...prev, route];
    });
    setRoute(newRoute);
    if (["home", "library", "writers", "magazine", "search"].includes(newRoute)) {
      window.location.hash = newRoute;
    }
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleGoBack = (fallback = "home") => {
    if (route === "player") {
      closeFullPlayer();
    }
    setHistory((prev) => {
      const nextStack = [...prev];
      while (nextStack.length > 0) {
        const candidate = nextStack.pop();
        if (candidate && candidate !== route && candidate !== "player") {
          setRoute(candidate);
          if (["home", "library", "writers", "magazine", "search"].includes(candidate)) {
            window.location.hash = candidate;
          }
          return nextStack;
        }
      }
      setRoute(fallback);
      if (["home", "library", "writers", "magazine", "search"].includes(fallback)) {
        window.location.hash = fallback;
      }
      return [];
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Open Category detail
  const handleSelectCategory = (cateId) => {
    const cat = categories.find((c) => c.id === cateId) || { id: cateId, bn: "ছোট গল্প" };
    setSelectedCategory(cat);
    navigateTo("category");
  };

  // Open Book detail
  const handleOpenBook = (book) => {
    setSelectedBook(book);
    navigateTo("book");
  };

  // Open Writer detail
  const handleSelectWriter = (writer) => {
    setSelectedWriter(writer);
    navigateTo("author");
  };

  // Open Short Story eBook Detail Page (like AudioBook Detail Page)
  const handleOpenShortStory = (story) => {
    setSelectedStory(story);
    setIsReaderModalOpen(false);
    navigateTo("ebook");
  };

  // Directly launch the full Page-Flipper & Scroll Reader when clicking Read Now
  const handleOpenFullPageFlip = (story) => {
    setIsReaderModalOpen(false);
    if (story) setSelectedStory(story);
    navigateTo("pageflip");
  };

  // Sync route if player opened via mini-player or Play Now
  useEffect(() => {
    if (isFullPlayerOpen && route !== "player") {
      setHistory((prev) => [...prev, route]);
      setRoute("player");
    }
  }, [isFullPlayerOpen, route]);

  if (route === "pageflip") {
    return (
      <ReaderApp
        initialStory={selectedStory}
        onBack={() => handleGoBack("home")}
      />
    );
  }

  return (
    <div className="app">
      {/* Side Navigation (Desktop sidebar / Mobile bottom bar) */}
      <Navigation
        activeTab={route}
        onNavigate={(target) => {
          if (route === "player") closeFullPlayer();
          navigateTo(target);
        }}
      />

      <main ref={mainRef}>
        <PullToRefresh
          containerRef={mainRef}
          onRefresh={() => DataService.syncWithReverseApi()}
        />
        {route === "home" && (
          <HomeView
            categories={categories}
            audioBooks={audioBooks}
            shortStories={shortStories}
            onOpenBook={handleOpenBook}
            onOpenShortStory={handleOpenShortStory}
            onOpenFullPageFlip={handleOpenFullPageFlip}
            onOpenSearch={() => navigateTo("search")}
            onToggleProfile={() => setIsProfileOpen(!isProfileOpen)}
            onSelectCategory={handleSelectCategory}
            onOpenPlaylists={() => navigateTo("playlists")}
          />
        )}

        {route === "playlists" && (
          <PlaylistsView
            onBack={() => handleGoBack("home")}
            onOpenPlaylist={(plId) => {
              setSelectedPlaylistId(plId);
              navigateTo("playlist");
            }}
          />
        )}

        {route === "playlist" && (
          <PlaylistDetailView
            playlistId={selectedPlaylistId}
            onBack={() =>
              handleGoBack(selectedPlaylistId === "__recent__" ? "home" : "playlists")
            }
            onOpenSearch={() => navigateTo("search")}
          />
        )}

        {route === "library" && (
          <LibraryView
            categories={categories}
            shortStories={shortStories}
            onSelectCategory={handleSelectCategory}
            onOpenShortStory={handleOpenShortStory}
            onOpenSearch={() => navigateTo("search")}
            onToggleProfile={() => setIsProfileOpen(!isProfileOpen)}
          />
        )}

        {route === "category" && (
          <CategoryView
            category={selectedCategory}
            audioBooks={audioBooks}
            writers={writers}
            onBack={() => handleGoBack("home")}
            onOpenBook={handleOpenBook}
          />
        )}

        {route === "book" && (
          <BookDetailView
            book={selectedBook || audioBooks[0]}
            onBack={() => handleGoBack("home")}
            backLabel="Back"
          />
        )}

        {route === "ebook" && (
          <EBookDetailView
            story={selectedStory || shortStories[0]}
            onBack={() => handleGoBack("home")}
            onReadNow={(story) => handleOpenFullPageFlip(story)}
            backLabel="Back"
          />
        )}

        {route === "writers" && (
          <WritersView
            writers={writers}
            onSelectWriter={handleSelectWriter}
            onOpenSearch={() => navigateTo("search")}
            onToggleProfile={() => setIsProfileOpen(!isProfileOpen)}
          />
        )}

        {route === "author" && (
          <AuthorDetailView
            writer={selectedWriter || writers[0]}
            audioBooks={audioBooks}
            shortStories={shortStories}
            onBack={() => handleGoBack("writers")}
            onOpenBook={handleOpenBook}
            onOpenShortStory={handleOpenShortStory}
          />
        )}

        {route === "magazine" && (
          <MagazineView
            magazines={magazines}
            onOpenSearch={() => navigateTo("search")}
            onToggleProfile={() => setIsProfileOpen(!isProfileOpen)}
          />
        )}

        {route === "search" && (
          <SearchView
            audioBooks={audioBooks}
            shortStories={shortStories}
            writers={writers}
            onOpenBook={handleOpenBook}
            onOpenShortStory={handleOpenShortStory}
            onSelectWriter={handleSelectWriter}
            onBack={() => handleGoBack("home")}
          />
        )}

        {route === "player" && (
          <PlayerView
            onBack={() => handleGoBack("home")}
          />
        )}
      </main>

      {/* Persistent Mini Player */}
      <MiniPlayer isPlayerViewActive={route === "player"} />

      {/* Profile & Settings Dialog */}
      <ProfileDialog
        isOpen={isProfileOpen}
        onClose={() => setIsProfileOpen(false)}
      />

      {/* Audio Playback Rate-Limit Popup Modal (English) */}
      {rateLimitPopup && (
        <div
          className="rl-modal-bg"
          role="dialog"
          aria-modal="true"
          aria-label={rateLimitPopup.title || "Playback Limit Reached"}
          onClick={dismissRateLimitPopup}
        >
          <div className="rl-modal" onClick={(e) => e.stopPropagation()}>
            <div className="rl-modal-icon" aria-hidden="true">
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
            </div>
            <h3>{rateLimitPopup.title}</h3>
            <p>{rateLimitPopup.message}</p>
            {rateLimitPopup.suggestion && (
              <p className="rl-modal-suggest">{rateLimitPopup.suggestion}</p>
            )}
            {rateLimitPopup.nextAvailableText && (
              <div className="rl-modal-meta">{rateLimitPopup.nextAvailableText}</div>
            )}
            <div className="rl-modal-actions">
              {rateLimitPopup.blockedTrack && (
                <button
                  type="button"
                  className="rl-modal-btn"
                  disabled={listenLaterAdded}
                  onClick={() => {
                    addTrackToListenLater(rateLimitPopup.blockedTrack);
                    setListenLaterAdded(true);
                  }}
                >
                  {listenLaterAdded ? "Added to Listen Later ✓" : "+ Add to Listen Later"}
                </button>
              )}
              <button
                type="button"
                className="rl-modal-btn secondary"
                onClick={() => {
                  dismissRateLimitPopup();
                  if (route === "player") closeFullPlayer();
                  setSelectedPlaylistId("__recent__");
                  navigateTo("playlist");
                }}
              >
                Open Recent Playlist
              </button>
              <button
                type="button"
                className="rl-modal-close"
                onClick={dismissRateLimitPopup}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* E-Book Reader Modal */}
      {isReaderModalOpen && (
        <EBookReaderModal
          story={selectedStory}
          onBack={() => setIsReaderModalOpen(false)}
          onOpenFullPageFlip={handleOpenFullPageFlip}
        />
      )}
    </div>
  );
}

export default function GolpoJolpoApp() {
  return (
    <AuthProvider>
      <AudioPlayerProvider>
        <MainApp />
      </AudioPlayerProvider>
    </AuthProvider>
  );
}
