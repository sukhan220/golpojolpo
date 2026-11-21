"use client";

import { SPEED_MAP } from "../lib/speedMap";

export default function SpeedModal({
  visible,
  speedX,
  setSpeedX,
  setAutoScrollSpeed,
  onClose,
}) {
  if (!visible) return null;

  const handleChange = (e) => {
    const val = Number(parseFloat(e.target.value).toFixed(2));
    setSpeedX(val);
    const calculated = SPEED_MAP[val] ?? (0.2 * val);
    if (setAutoScrollSpeed) {
      setAutoScrollSpeed(calculated);
    }
  };

  return (
    <div
      className="speed-modal-overlay"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Auto Scroll Speed"
    >
      <div
        className="speed-modal-content"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="speed-modal-header">
          <h3 className="speed-modal-title">Auto Scroll Speed</h3>
          <span className="speed-modal-badge">{speedX.toFixed(2)}x</span>
        </div>

        <div className="speed-slider-wrap">
          <input
            type="range"
            min="1"
            max="2"
            step="0.05"
            value={speedX}
            onChange={handleChange}
            className="speed-slider-range"
            aria-label="Speed slider"
          />
          <div className="speed-slider-marks">
            <span>1.0x</span>
            <span>1.5x</span>
            <span>2.0x</span>
          </div>
        </div>

        <button type="button" className="speed-done-btn" onClick={onClose}>
          Done
        </button>
      </div>
    </div>
  );
}

