"use client";

import React, { useEffect } from "react";

export default function ProfileDialog({ isOpen, onClose }) {
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
          <span className="av">G</span>
          <div>
            <b className="serif">Guest</b>
            <span>Your Profile</span>
          </div>
        </div>

        <button className="prow" onClick={() => alert("Coming soon")}>
          <span>Edit Profile</span>
        </button>

        <div className="sec">Settings</div>

        <label className="prow">
          <span>Notifications</span>
          <input type="checkbox" className="sw" defaultChecked />
        </label>

        <label className="prow">
          <span>Download on Wi-Fi only</span>
          <input type="checkbox" className="sw" />
        </label>

        <button className="prow" onClick={() => alert("Language: English")}>
          <span>Language</span>
          <em>English</em>
        </button>

        <button className="prow" onClick={() => alert("Contact support: support@golpojolpo.com")}>
          <span>Help &amp; Support</span>
        </button>

        <button className="prow out" onClick={() => { alert("Logged out successfully"); onClose(); }}>
          <span>Log Out</span>
        </button>
      </div>
    </>
  );
}
