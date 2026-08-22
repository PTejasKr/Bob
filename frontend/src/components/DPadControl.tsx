import React from 'react'

interface DPadControlProps {
  onUp?: () => void
  onDown?: () => void
  onLeft?: () => void
  onRight?: () => void
  onCenter?: () => void
}

export const DPadControl: React.FC<DPadControlProps> = ({
  onUp,
  onDown,
  onLeft,
  onRight,
  onCenter,
}) => {
  return (
    <div className="dpad-housing">
      <div className="dpad-cross-container">
        <button
          type="button"
          className="dpad-btn dpad-up"
          onClick={onUp}
          title="Scroll Up"
          aria-label="D-Pad Up"
        >
          ▲
        </button>
        <button
          type="button"
          className="dpad-btn dpad-left"
          onClick={onLeft}
          title="Action Left"
          aria-label="D-Pad Left"
        >
          ◄
        </button>
        <button
          type="button"
          className="dpad-btn dpad-center"
          onClick={onCenter}
          title="Activate Bob"
          aria-label="D-Pad Center"
        />
        <button
          type="button"
          className="dpad-btn dpad-right"
          onClick={onRight}
          title="Action Right"
          aria-label="D-Pad Right"
        >
          ►
        </button>
        <button
          type="button"
          className="dpad-btn dpad-down"
          onClick={onDown}
          title="Scroll Down"
          aria-label="D-Pad Down"
        >
          ▼
        </button>
      </div>
    </div>
  )
}
