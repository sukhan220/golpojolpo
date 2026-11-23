"use client";

import React, { useEffect, useRef, useState } from "react";

const PULL_THRESHOLD = 68; // px of damped pull needed to trigger reload
const MAX_PULL = 96;

/**
 * Checks whether the touch target or any scrollable ancestor up to `container` is scrolled down.
 */
function isAtScrollTop(target, container) {
  if (typeof window !== "undefined" && window.scrollY > 2) return false;
  if (container && container.scrollTop > 2) return false;

  let el = target;
  while (el && el !== container && el !== document.body) {
    if (el.scrollTop > 2) return false;
    el = el.parentElement;
  }
  return true;
}

/**
 * Mobile Pull-to-Refresh wrapper for `<main>`.
 * Swipe down gently from the top of any page on mobile/touch devices to reload.
 */
export default function PullToRefresh({ containerRef, onRefresh }) {
  const [pullDist, setPullDist] = useState(0);
  const [status, setStatus] = useState("idle"); // 'idle' | 'pulling' | 'ready' | 'refreshing' | 'offline'

  const startYRef = useRef(null);
  const startXRef = useRef(null);
  const activePullRef = useRef(false);
  const pullDistRef = useRef(0);
  const statusRef = useRef("idle");

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  useEffect(() => {
    const el = containerRef?.current;
    if (!el) return;

    const handleTouchStart = (e) => {
      if (statusRef.current === "refreshing") return;
      if (!e.touches || e.touches.length !== 1) return;

      const target = e.target;
      // Ignore range sliders, mini player swipe-down, modals, or inputs
      if (
        target?.closest?.(
          'input[type="range"], .mini, .mbg, .pop, .sheet, [data-no-ptr="true"]'
        )
      ) {
        return;
      }

      if (!isAtScrollTop(target, el)) return;

      startYRef.current = e.touches[0].clientY;
      startXRef.current = e.touches[0].clientX;
      activePullRef.current = false;
    };

    const handleTouchMove = (e) => {
      if (startYRef.current === null || statusRef.current === "refreshing") return;
      if (!e.touches || e.touches.length !== 1) return;

      const dy = e.touches[0].clientY - startYRef.current;
      const dx = e.touches[0].clientX - startXRef.current;

      // Cancel if swiping upward or predominantly horizontally (e.g. horizontal carousels)
      if (!activePullRef.current) {
        if (dy < 10) {
          if (dy < -6) startYRef.current = null;
          return;
        }
        if (Math.abs(dx) * 1.35 > Math.abs(dy)) {
          startYRef.current = null;
          return;
        }
        if (!isAtScrollTop(e.target, el)) {
          startYRef.current = null;
          return;
        }
        activePullRef.current = true;
      }

      if (dy <= 0) {
        pullDistRef.current = 0;
        setPullDist(0);
        setStatus("idle");
        return;
      }

      // Smooth rubber-band damping
      const damped = Math.min(MAX_PULL, Math.round(dy * 0.48));
      pullDistRef.current = damped;
      setPullDist(damped);
      setStatus(damped >= PULL_THRESHOLD ? "ready" : "pulling");

      if (e.cancelable) {
        e.preventDefault();
      }
    };

    const handleTouchEnd = async () => {
      if (startYRef.current === null) return;
      const pulled = pullDistRef.current;
      startYRef.current = null;
      startXRef.current = null;
      activePullRef.current = false;

      if (pulled >= PULL_THRESHOLD) {
        if (typeof navigator !== "undefined" && navigator.onLine === false) {
          setStatus("offline");
          setPullDist(54);
          setTimeout(() => {
            setStatus("idle");
            setPullDist(0);
            pullDistRef.current = 0;
          }, 1300);
          return;
        }

        setStatus("refreshing");
        setPullDist(56);
        try {
          if (typeof onRefresh === "function") {
            await onRefresh();
          }
        } catch {
          // ignore
        }
        setTimeout(() => {
          window.location.reload();
        }, 320);
      } else {
        setStatus("idle");
        setPullDist(0);
        pullDistRef.current = 0;
      }
    };

    el.addEventListener("touchstart", handleTouchStart, { passive: true });
    el.addEventListener("touchmove", handleTouchMove, { passive: false });
    el.addEventListener("touchend", handleTouchEnd, { passive: true });
    el.addEventListener("touchcancel", handleTouchEnd, { passive: true });

    return () => {
      el.removeEventListener("touchstart", handleTouchStart);
      el.removeEventListener("touchmove", handleTouchMove);
      el.removeEventListener("touchend", handleTouchEnd);
      el.removeEventListener("touchcancel", handleTouchEnd);
    };
  }, [containerRef, onRefresh]);

  if (status === "idle" && pullDist <= 0) return null;

  const progress = Math.min(1, pullDist / PULL_THRESHOLD);
  const rotation = status === "ready" ? 180 : Math.round(progress * 180);

  return (
    <div
      className={`ptr-wrap ${status}`}
      style={{
        transform: `translate(-50%, ${Math.max(8, pullDist - 24)}px)`,
        opacity: Math.min(1, progress * 1.4),
      }}
      aria-live="polite"
    >
      <div className="ptr-pill">
        {status === "refreshing" ? (
          <>
            <span className="ptr-spinner" aria-hidden="true" />
            <span>রিলোড হচ্ছে...</span>
          </>
        ) : status === "offline" ? (
          <span>অফলাইনে আছেন</span>
        ) : (
          <>
            <svg
              className="ptr-arrow"
              style={{ transform: `rotate(${rotation}deg)` }}
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.3"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 5v14" />
              <path d="m19 12-7 7-7-7" />
            </svg>
            <span>{status === "ready" ? "ছেড়ে দিন রিলোড করতে" : "নিচে টানুন রিলোড করতে"}</span>
          </>
        )}
      </div>
    </div>
  );
}
