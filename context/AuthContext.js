"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";

const AuthContext = createContext({
  user: null,
  loading: true,
  loginWithGoogle: () => {},
  logout: async () => {},
  refreshUser: async () => {},
});

const USER_CACHE_KEY = "gj_user_cache_v1";
const AUTH_BOOT_KEY = "gj_auth_boot_v1";
const USER_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

function hasLoggedInCookie() {
  if (typeof document === "undefined") return false;
  return /(?:^|;\s*)gj_logged_in=1(?:;|$)/.test(document.cookie || "");
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const refreshUser = useCallback(async (force = false) => {
    if (typeof window === "undefined") return;

    const hasCookie = hasLoggedInCookie();
    let bootChecked = false;
    try {
      bootChecked = window.localStorage.getItem(AUTH_BOOT_KEY) === "1";
    } catch {
      bootChecked = true;
    }

    // Fast path for logged-out Guests (0 Vercel Origin hits!):
    // If no `gj_logged_in=1` cookie exists and one-time legacy boot check already ran, skip `/api/auth/me` completely!
    if (!force && !hasCookie && bootChecked) {
      setUser(null);
      setLoading(false);
      return;
    }

    // Fast path for logged-in users on reload: serve cached profile for 15 minutes (0 Vercel Origin hits!)
    if (!force && hasCookie) {
      try {
        const raw = window.sessionStorage.getItem(USER_CACHE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          if (parsed?.user && Date.now() - (parsed.ts || 0) < USER_CACHE_TTL_MS) {
            setUser(parsed.user);
            setLoading(false);
            return;
          }
        }
      } catch {
        // ignore
      }
    }

    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      try {
        window.localStorage.setItem(AUTH_BOOT_KEY, "1");
      } catch {
        // ignore
      }
      if (res.ok) {
        const data = await res.json();
        const nextUser = data.user || null;
        setUser(nextUser);
        try {
          if (nextUser) {
            window.sessionStorage.setItem(
              USER_CACHE_KEY,
              JSON.stringify({ user: nextUser, ts: Date.now() })
            );
          } else {
            window.sessionStorage.removeItem(USER_CACHE_KEY);
          }
        } catch {
          // ignore
        }
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser(false);
  }, [refreshUser]);

  const loginWithGoogle = () => {
    window.location.href = "/api/auth/google";
  };

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      // ignore
    } finally {
      try {
        window.sessionStorage.removeItem(USER_CACHE_KEY);
      } catch {
        // ignore
      }
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, loading, loginWithGoogle, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
