"use client";

import React, { useEffect } from "react";
import { useAuth } from "../../context/AuthContext";

export default function ProfileDialog({ isOpen, onClose }) {
  const { user, loading, loginWithGoogle, logout } = useAuth();

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    if (isOpen) {
      window.addEventListener("keydown", handleKey);
    }
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const initial = user?.name
    ? user.name.trim().charAt(0).toUpperCase()
    : user?.email
    ? user.email.charAt(0).toUpperCase()
    : "G";

  return (
    <>
      {/* Backdrop */}
      <div
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 35,
          background: "transparent",
        }}
        onClick={onClose}
      />

      <div className="pop" role="dialog" aria-label="Profile and Settings">
        <div className="ph">
          {user?.avatar ? (
            <img
              src={user.avatar}
              alt={user.name || "Profile"}
              referrerPolicy="no-referrer"
              className="av"
              style={{ objectFit: "cover", padding: 0 }}
            />
          ) : (
            <span className="av">{initial}</span>
          )}
          <div style={{ minWidth: 0 }}>
            <b className="serif" style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {loading ? "লোড হচ্ছে..." : user ? user.name || "পাঠক" : "Guest"}
            </b>
            <span style={{ display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {user ? user.email : "লগইন করে লাইক, কমেন্ট ও রেটিং দিন"}
            </span>
            {user?.role ? (
              <span
                style={{
                  display: "inline-block",
                  marginTop: "4px",
                  padding: "2px 8px",
                  fontSize: "11px",
                  fontWeight: 600,
                  borderRadius: "999px",
                  background: user.role === "SUPER_ADMIN" || user.role === "ADMIN" ? "#111" : "#f0f0f0",
                  color: user.role === "SUPER_ADMIN" || user.role === "ADMIN" ? "#fff" : "#333",
                }}
              >
                {user.role === "SUPER_ADMIN"
                  ? "Super Admin (Owner)"
                  : user.role === "ADMIN"
                  ? "Admin"
                  : user.role === "EDITOR"
                  ? "Editor"
                  : user.role === "ARTIST"
                  ? "Artist"
                  : "User"}
              </span>
            ) : null}
          </div>
        </div>

        {!user ? (
          <div style={{ padding: "8px 12px 12px" }}>
            <button
              type="button"
              onClick={loginWithGoogle}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "10px",
                padding: "10px 14px",
                borderRadius: "10px",
                border: "1px solid #d7d7d7",
                background: "#fff",
                color: "#111",
                fontWeight: 600,
                fontSize: "14px",
                cursor: "pointer",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
              </svg>
              <span>Google দিয়ে লগইন করুন</span>
            </button>
          </div>
        ) : null}

        <div className="sec">Settings</div>

        <label className="prow">
          <span>Notifications</span>
          <input type="checkbox" className="sw" defaultChecked />
        </label>

        <label className="prow">
          <span>Download on Wi-Fi only</span>
          <input type="checkbox" className="sw" />
        </label>

        <button className="prow" onClick={() => alert("Language: বাংলা")}>
          <span>Language</span>
          <em>বাংলা</em>
        </button>

        <button className="prow" onClick={() => alert("Contact support: support@golpojolpo.com")}>
          <span>Help &amp; Support</span>
        </button>

        {user ? (
          <button
            className="prow out"
            onClick={async () => {
              await logout();
              onClose();
            }}
          >
            <span>Log Out</span>
          </button>
        ) : null}
      </div>
    </>
  );
}
