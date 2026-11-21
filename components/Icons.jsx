import React from "react";

// -------------------------------------------------------------
// Reader App Icons
// -------------------------------------------------------------

export function ArrowBackIcon({ size = 24, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" fill="none">
      <path
        d="M244 400L100 256l144-144M120 256h292"
        stroke={color}
        strokeWidth="48"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function MenuIcon({ size = 24, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" fill="none">
      <path
        d="M80 160h352M80 256h352M80 352h352"
        stroke={color}
        strokeWidth="40"
        strokeLinecap="round"
        strokeMiterlimit="10"
      />
    </svg>
  );
}

export function ChevronBackIcon({ size = 24, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" fill="none">
      <path
        d="M328 112L184 256l144 144"
        stroke={color}
        strokeWidth="48"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ChevronForwardIcon({ size = 24, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" fill="none">
      <path
        d="M184 112l144 144-144 144"
        stroke={color}
        strokeWidth="48"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function DocumentTextIcon({ size = 22, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" fill="none">
      <path
        d="M368 416H144a64 64 0 01-64-64V96a32 32 0 0132-32h240a32 32 0 0132 32v256a64 64 0 01-64 64z"
        stroke={color}
        strokeWidth="32"
        strokeLinejoin="round"
      />
      <path
        d="M176 128h160M176 208h160M176 288h80"
        stroke={color}
        strokeWidth="32"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function BookmarksOutlineIcon({ size = 22, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" fill="none">
      <path
        d="M128 80v380l128-96 128 96V80a32 32 0 00-32-32H160a32 32 0 00-32 32z"
        stroke={color}
        strokeWidth="32"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function BookmarkOutlineIcon({ size = 22, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" fill="none">
      <path
        d="M352 48H160a48 48 0 00-48 48v368l144-128 144 128V96a48 48 0 00-48-48z"
        stroke={color}
        strokeWidth="32"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function BookmarkFilledIcon({ size = 22, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" fill={color}>
      <path d="M352 48H160a48 48 0 00-48 48v368l144-128 144 128V96a48 48 0 00-48-48z" />
    </svg>
  );
}

export function AddCircleOutlineIcon({ size = 22, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" fill="none">
      <circle cx="256" cy="256" r="192" stroke={color} strokeWidth="32" />
      <path
        d="M256 176v160M176 256h160"
        stroke={color}
        strokeWidth="32"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function TrashOutlineIcon({ size = 20, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" fill="none">
      <path
        d="M112 112l20 320c1.2 19.3 17 32 36 32h176c19 0 34.8-12.7 36-32l20-320"
        stroke={color}
        strokeWidth="32"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M80 112h352M192 112V80a32 32 0 0132-32h64a32 32 0 0132 32v32"
        stroke={color}
        strokeWidth="32"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function CheckmarkCircleIcon({ size = 20, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" fill="none">
      <circle cx="256" cy="256" r="192" stroke={color} strokeWidth="32" />
      <path
        d="M160 256l64 64 128-128"
        stroke={color}
        strokeWidth="32"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function ContractIcon({ size = 24, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" fill="none">
      <path
        d="M304 416V304h112M208 96v112H96M416 208H304V96M96 304h112v112"
        stroke={color}
        strokeWidth="32"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// -------------------------------------------------------------
// GolpoJolpo App Icons
// -------------------------------------------------------------

export function PlayIcon({ className = "", size = 22 }) {
  return (
    <svg className={`f ${className}`} width={size} height={size} viewBox="0 0 24 24">
      <path d="M7 4.5v15l13-7.5z" />
    </svg>
  );
}

export function PauseIcon({ className = "", size = 22 }) {
  return (
    <svg className={`f ${className}`} width={size} height={size} viewBox="0 0 24 24">
      <rect x="6" y="4" width="4" height="16" rx="1" />
      <rect x="14" y="4" width="4" height="16" rx="1" />
    </svg>
  );
}

export function UserIcon({ className = "", size = 22 }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}

export function SearchIcon({ className = "", size = 22 }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-4-4" />
    </svg>
  );
}

export function LeftArrowIcon({ className = "", size = 22 }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24">
      <path d="M15 5l-7 7 7 7" />
    </svg>
  );
}

export function Backward10Icon({ className = "", size = 24 }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24">
      <path d="M3 12a9 9 0 1 0 3-6.7M3 4v5h5" />
      <text x="8.5" y="15.5" fontSize="7" fill="currentColor" stroke="none">10</text>
    </svg>
  );
}

export function Forward10Icon({ className = "", size = 24 }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24">
      <path d="M21 12a9 9 0 1 1-3-6.7M21 4v5h-5" />
      <text x="8.5" y="15.5" fontSize="7" fill="currentColor" stroke="none">10</text>
    </svg>
  );
}

export function PrevIcon({ className = "", size = 22 }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24">
      <path d="M6 5v14M19 5l-10 7 10 7z" />
    </svg>
  );
}

export function NextIcon({ className = "", size = 22 }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24">
      <path d="M18 5v14M5 5l10 7-10 7z" />
    </svg>
  );
}

export function VolumeIcon({ className = "", size = 22 }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24">
      <path d="M4 9v6h4l5 4V5L8 9zM17 9a4 4 0 0 1 0 6" />
    </svg>
  );
}

export function ClockIcon({ className = "", size = 20 }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function MicIcon({ className = "", size = 20 }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </svg>
  );
}

export function HeadphonesIcon({ className = "", size = 22 }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24">
      <path d="M4 15v-3a8 8 0 0 1 16 0v3M4 15h3v5H5a1 1 0 0 1-1-1zM20 15h-3v5h2a1 1 0 0 0 1-1z" />
    </svg>
  );
}

export function HeartIcon({ className = "", size = 22 }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24">
      <path d="M12 20s-8-5-8-11a4.5 4.5 0 0 1 8-2.5A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11z" />
    </svg>
  );
}

export function NoteIcon({ className = "", size = 22 }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24">
      <path d="M6 3h8l4 4v14H6zM9 12h6M9 16h6" />
    </svg>
  );
}

export function HomeNavIcon({ className = "", size = 22 }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24">
      <path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />
    </svg>
  );
}

export function MagazineNavIcon({ className = "", size = 22 }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24">
      <path d="M5 4h11a2 2 0 0 1 2 2v14H7a2 2 0 0 1-2-2zM18 8h2v10a2 2 0 0 1-2 2M8 8h6M8 12h6M8 16h4" />
    </svg>
  );
}

export function LibraryNavIcon({ className = "", size = 22 }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24">
      <path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 19V5M9 7h6" />
    </svg>
  );
}

export function WriterNavIcon({ className = "", size = 22 }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24">
      <path d="M4 20h4L19 9l-4-4L4 16zM13 7l4 4" />
    </svg>
  );
}

export function PlaylistAddIcon({ className = "", size = 20 }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24">
      <path d="M3 6h12M3 10h12M3 14h8M17 14v6M14 17h6" />
    </svg>
  );
}

export function PlaylistCheckedIcon({ className = "", size = 20 }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24">
      <path d="M3 6h12M3 10h12M3 14h8M14 16l2.5 2.5L21 14" />
    </svg>
  );
}
