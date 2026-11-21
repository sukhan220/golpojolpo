"use client";

import React from "react";
import Image from "next/image";
import {
  HomeNavIcon,
  MagazineNavIcon,
  LibraryNavIcon,
  WriterNavIcon,
  SearchIcon,
} from "../Icons";

export default function Navigation({ activeTab, onNavigate }) {
  const navItems = [
    { id: "home", label: "Home", icon: <HomeNavIcon /> },
    { id: "magazine", label: "Magazine", icon: <MagazineNavIcon /> },
    { id: "library", label: "Library", icon: <LibraryNavIcon /> },
    { id: "writers", label: "Writer", icon: <WriterNavIcon /> },
    { id: "search", label: "Search", icon: <SearchIcon />, desktopOnly: true },
  ];

  return (
    <nav className="side" aria-label="Main Navigation">
      <div className="logo" onClick={() => onNavigate("home")} style={{ cursor: "pointer" }}>
        <img
          className="lg"
          src="/logo.svg"
          alt="গল্পজল্প"
        />
      </div>

      {navItems.map((item) => {
        const isActive =
          activeTab === item.id ||
          (item.id === "library" && (activeTab === "category" || activeTab === "book")) ||
          (item.id === "writers" && activeTab === "author");

        return (
          <button
            key={item.id}
            className={item.desktopOnly ? "dsk" : ""}
            aria-current={isActive ? "page" : undefined}
            onClick={() => onNavigate(item.id)}
          >
            {item.icon}
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
