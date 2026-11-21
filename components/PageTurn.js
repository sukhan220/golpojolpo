"use client";

import React, { useRef, useState, useEffect, useCallback } from "react";

/**
 * Maps screen (clientX, clientY) to the book container's local X coordinate (0 .. width),
 * accounting for 90-degree clockwise CSS rotation on mobile portrait screens.
 */
function getLocalBookX(clientX, clientY, hostEl, isRotated90) {
  if (!hostEl) return { x: 0, width: 1 };
  const rect = hostEl.getBoundingClientRect();
  if (isRotated90) {
    // When rotated +90deg clockwise, the book's horizontal axis (left -> right)
    // runs along the physical screen's vertical axis (top -> bottom).
    const width = Math.max(1, rect.height);
    const x = clientY - rect.top;
    return { x, width };
  }
  const width = Math.max(1, rect.width);
  const x = clientX - rect.left;
  return { x, width };
}

export default function PageTurn({
  pages,
  renderPage,
  spreadMode,
  currentPage,
  zoom = 1,
  turn,
  onTurnComplete,
  onTurnPage,
  onSingleTap,
  onDoubleTap,
  isRotated90 = false,
}) {
  const hostRef = useRef(null);
  const dragStateRef = useRef(null);
  const lastTapTimeRef = useRef(0);

  // Interactive drag state: { direction: 'forward'|'backward', progress: 0..1, settling: boolean, commit: boolean }
  const [dragFlip, setDragFlip] = useState(null);

  const pageCount = pages.length;
  // In spreadMode, ensure even index for left page
  const spreadStart = spreadMode ? Math.floor(currentPage / 2) * 2 : currentPage;

  const canGoForward = spreadMode
    ? spreadStart + 2 < pageCount
    : spreadStart + 1 < pageCount;
  const canGoBackward = spreadMode ? spreadStart - 2 >= 0 : spreadStart - 1 >= 0;

  // Reset dragFlip if currentPage changes externally
  useEffect(() => {
    setDragFlip(null);
    dragStateRef.current = null;
  }, [currentPage, spreadMode]);

  const finishDragFlip = useCallback(
    (direction, commit) => {
      setDragFlip((prev) =>
        prev
          ? {
              ...prev,
              settling: true,
              commit,
              progress: commit ? 1 : 0,
            }
          : null
      );

      setTimeout(() => {
        setDragFlip(null);
        dragStateRef.current = null;
        if (commit && onTurnPage) {
          const step = spreadMode ? 2 : 1;
          const nextTarget =
            direction === "forward"
              ? Math.min(pageCount - 1, spreadStart + step)
              : Math.max(0, spreadStart - step);
          onTurnPage(nextTarget);
        }
      }, 340);
    },
    [onTurnPage, pageCount, spreadMode, spreadStart]
  );

  const handlePointerDown = (clientX, clientY) => {
    if (turn || dragFlip?.settling) return;
    const { x, width } = getLocalBookX(clientX, clientY, hostRef.current, isRotated90);
    dragStateRef.current = {
      startX: x,
      currentX: x,
      width,
      startTime: Date.now(),
      moved: false,
      direction: null,
    };
  };

  const handlePointerMove = (clientX, clientY) => {
    const st = dragStateRef.current;
    if (!st || dragFlip?.settling) return;

    const { x, width } = getLocalBookX(clientX, clientY, hostRef.current, isRotated90);
    const deltaX = x - st.startX;

    if (!st.moved && Math.abs(deltaX) < 10) return;

    if (!st.moved) {
      const dir = deltaX < 0 ? "forward" : "backward";
      if (dir === "forward" && !canGoForward) return;
      if (dir === "backward" && !canGoBackward) return;
      st.moved = true;
      st.direction = dir;
    }

    st.currentX = x;
    const dragDistance =
      st.direction === "forward" ? st.startX - x : x - st.startX;
    const rawProgress = Math.max(0.02, Math.min(0.98, dragDistance / (width * 0.55)));

    setDragFlip({
      direction: st.direction,
      progress: rawProgress,
      settling: false,
      commit: false,
    });
  };

  const handlePointerUp = (clientX, clientY) => {
    const st = dragStateRef.current;
    if (!st) return;

    if (st.moved && st.direction) {
      const elapsed = Math.max(1, Date.now() - st.startTime);
      const distance = Math.abs(st.currentX - st.startX);
      const velocity = distance / elapsed; // px per ms
      const progress = distance / (st.width * 0.55);
      const shouldCommit = progress > 0.2 || velocity > 0.45;
      finishDragFlip(st.direction, shouldCommit);
      return;
    }

    dragStateRef.current = null;

    // If user didn't drag, check for double-tap vs edge tap vs center tap
    const now = Date.now();
    if (now - lastTapTimeRef.current < 300) {
      lastTapTimeRef.current = 0;
      if (onDoubleTap) onDoubleTap();
      return;
    }
    lastTapTimeRef.current = now;

    const { x, width } = getLocalBookX(clientX, clientY, hostRef.current, isRotated90);
    // Tap on right 22% edge flips forward; tap on left 22% edge flips backward; center tap toggles overlay
    if (x > width * 0.78 && canGoForward) {
      setDragFlip({ direction: "forward", progress: 0.08, settling: false, commit: true });
      requestAnimationFrame(() => finishDragFlip("forward", true));
    } else if (x < width * 0.22 && canGoBackward) {
      setDragFlip({ direction: "backward", progress: 0.08, settling: false, commit: true });
      requestAnimationFrame(() => finishDragFlip("backward", true));
    } else if (onSingleTap) {
      onSingleTap();
    }
  };

  // Active flip comes from either interactive dragFlip or button-triggered `turn` prop
  const activeDirection = dragFlip?.direction || turn?.direction || null;
  const baseStart = turn ? turn.from : spreadStart;

  if (spreadMode) {
    // 2-Page Open Book Spread Mode (Hinged at Center Spine 50%)
    // Determine which pages are shown on the static left base, static right base, and flipping leaf
    let staticLeftPage = baseStart;
    let staticRightPage = baseStart + 1;
    let leafFrontPage = null;
    let leafBackPage = null;

    if (activeDirection === "forward") {
      staticLeftPage = baseStart;
      staticRightPage = baseStart + 3; // Revealed underneath on the right!
      leafFrontPage = baseStart + 1; // Right page lifting up
      leafBackPage = baseStart + 2; // New left page on the back of the lifting leaf
    } else if (activeDirection === "backward") {
      staticLeftPage = baseStart - 2; // Revealed underneath on the left!
      staticRightPage = baseStart + 1;
      leafFrontPage = baseStart; // Left page lifting up
      leafBackPage = baseStart - 1; // New right page on the back of the lifting leaf
    }

    const angle = dragFlip
      ? activeDirection === "forward"
        ? -dragFlip.progress * 180
        : dragFlip.progress * 180
      : 0;

    const shadowOpacity = dragFlip
      ? Math.sin(dragFlip.progress * Math.PI) * 0.45
      : 0;

    return (
      <div
        ref={hostRef}
        className="page-turn-host book-spread-host"
        style={{ zoom }}
        onTouchStart={(e) => {
          if (e.touches.length === 1) {
            handlePointerDown(e.touches[0].clientX, e.touches[0].clientY);
          }
        }}
        onTouchMove={(e) => {
          if (e.touches.length === 1) {
            handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
          }
        }}
        onTouchEnd={(e) => {
          const t = e.changedTouches?.[0];
          if (t) handlePointerUp(t.clientX, t.clientY);
        }}
        onMouseDown={(e) => {
          if (e.button !== 0) return;
          handlePointerDown(e.clientX, e.clientY);
        }}
        onMouseMove={(e) => {
          if (dragStateRef.current) {
            handlePointerMove(e.clientX, e.clientY);
          }
        }}
        onMouseUp={(e) => {
          handlePointerUp(e.clientX, e.clientY);
        }}
      >
        <div className="book-spread-stage">
          {/* Static Left Half of the Open Book */}
          <div className="book-half book-half-left">
            {staticLeftPage >= 0 && staticLeftPage < pageCount ? (
              renderPage(staticLeftPage)
            ) : (
              <div className="reader-page flip-reader-page empty-leaf" />
            )}
            <div className="book-spine-shadow-left" />
          </div>

          {/* Static Right Half of the Open Book */}
          <div className="book-half book-half-right">
            {staticRightPage >= 0 && staticRightPage < pageCount ? (
              renderPage(staticRightPage)
            ) : (
              <div className="reader-page flip-reader-page empty-leaf" />
            )}
            <div className="book-spine-shadow-right" />
          </div>

          {/* Center Book Spine Crease */}
          <div className="book-center-spine" />

          {/* 3D Flipping Leaf (Hinged at Center Spine!) */}
          {activeDirection && (
            <div
              key={turn ? turn.id : "drag-leaf"}
              className={`book-flip-leaf ${activeDirection}${
                turn && !dragFlip ? " css-animated-leaf" : ""
              }`}
              style={
                dragFlip
                  ? {
                      transform: `rotateY(${angle}deg)`,
                      transition: dragFlip.settling
                        ? "transform 0.34s cubic-bezier(0.25, 0.8, 0.25, 1)"
                        : "none",
                    }
                  : undefined
              }
              onAnimationEnd={(e) => {
                if (turn && e.target === e.currentTarget && onTurnComplete) {
                  onTurnComplete();
                }
              }}
            >
              {/* Front of the flipping page */}
              <div className="book-leaf-face book-leaf-front">
                {leafFrontPage !== null &&
                leafFrontPage >= 0 &&
                leafFrontPage < pageCount ? (
                  renderPage(leafFrontPage)
                ) : (
                  <div className="reader-page flip-reader-page empty-leaf" />
                )}
                <div
                  className="book-curl-gradient"
                  style={{ opacity: dragFlip ? shadowOpacity + 0.15 : undefined }}
                />
              </div>

              {/* Back of the flipping page */}
              <div className="book-leaf-face book-leaf-back">
                {leafBackPage !== null &&
                leafBackPage >= 0 &&
                leafBackPage < pageCount ? (
                  renderPage(leafBackPage)
                ) : (
                  <div className="reader-page flip-reader-page empty-leaf" />
                )}
                <div
                  className="book-curl-gradient-back"
                  style={{ opacity: dragFlip ? shadowOpacity + 0.15 : undefined }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Single Page Flip Mode
  const singleUnderPage =
    activeDirection === "forward"
      ? baseStart + 1
      : activeDirection === "backward"
      ? baseStart - 1
      : baseStart;

  const singleAngle = dragFlip
    ? activeDirection === "forward"
      ? -dragFlip.progress * 180
      : dragFlip.progress * 180
    : 0;

  return (
    <div
      ref={hostRef}
      className="page-turn-host"
      style={{ zoom }}
      onTouchStart={(e) => {
        if (e.touches.length === 1) {
          handlePointerDown(e.touches[0].clientX, e.touches[0].clientY);
        }
      }}
      onTouchMove={(e) => {
        if (e.touches.length === 1) {
          handlePointerMove(e.touches[0].clientX, e.touches[0].clientY);
        }
      }}
      onTouchEnd={(e) => {
        const t = e.changedTouches?.[0];
        if (t) handlePointerUp(t.clientX, t.clientY);
      }}
      onMouseDown={(e) => {
        if (e.button !== 0) return;
        handlePointerDown(e.clientX, e.clientY);
      }}
      onMouseMove={(e) => {
        if (dragStateRef.current) {
          handlePointerMove(e.clientX, e.clientY);
        }
      }}
      onMouseUp={(e) => {
        handlePointerUp(e.clientX, e.clientY);
      }}
    >
      <div className="page-turn-layer">
        <div className="pages-wrap page-turn-pages">
          {singleUnderPage >= 0 && singleUnderPage < pageCount
            ? renderPage(singleUnderPage)
            : null}
        </div>
      </div>

      {activeDirection && (
        <div
          key={turn ? turn.id : "single-drag-leaf"}
          className={`page-flip-sheet ${activeDirection}`}
          style={
            dragFlip
              ? {
                  transform: `rotateY(${singleAngle}deg)`,
                  transition: dragFlip.settling
                    ? "transform 0.34s cubic-bezier(0.25, 0.8, 0.25, 1)"
                    : "none",
                  animation: "none",
                }
              : undefined
          }
          onAnimationEnd={(event) => {
            if (turn && event.target === event.currentTarget && onTurnComplete) {
              onTurnComplete();
            }
          }}
        >
          <div className="page-flip-face page-flip-front">
            <div className="pages-wrap page-turn-pages">
              {renderPage(baseStart)}
            </div>
          </div>
          <div className="page-flip-face page-flip-back">
            <div className="pages-wrap page-turn-pages">
              {singleUnderPage >= 0 && singleUnderPage < pageCount
                ? renderPage(singleUnderPage)
                : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
