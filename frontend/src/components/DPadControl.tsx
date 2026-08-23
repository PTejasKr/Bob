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
  const handleClick = (e: React.MouseEvent, fn?: () => void) => {
    e.preventDefault()
    e.stopPropagation()
    if (fn) fn()
  }

  return (
    <div className="dpad-housing">
      <div className="dpad-cross-container">
        <button
          type="button"
          tabIndex={-1}
          className="dpad-btn dpad-up"
          onClick={(e) => handleClick(e, onUp)}
          title="Scroll Up"
          aria-label="D-Pad Up"
        />
        <button
          type="button"
          tabIndex={-1}
          className="dpad-btn dpad-left"
          onClick={(e) => handleClick(e, onLeft)}
          title="Action Left"
          aria-label="D-Pad Left"
        />
        <button
          type="button"
          tabIndex={-1}
          className="dpad-btn dpad-center"
          onClick={(e) => handleClick(e, onCenter)}
          title="Activate Bob"
          aria-label="D-Pad Center"
        />
        <button
          type="button"
          tabIndex={-1}
          className="dpad-btn dpad-right"
          onClick={(e) => handleClick(e, onRight)}
          title="Action Right"
          aria-label="D-Pad Right"
        />
        <button
          type="button"
          tabIndex={-1}
          className="dpad-btn dpad-down"
          onClick={(e) => handleClick(e, onDown)}
          title="Scroll Down"
          aria-label="D-Pad Down"
        />
      </div>
    </div>
  )
}
