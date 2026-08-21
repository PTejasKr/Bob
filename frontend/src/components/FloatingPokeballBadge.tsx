import React from 'react'

interface FloatingPokeballBadgeProps {
  onClick: () => void
  isOpen: boolean
}

export const FloatingPokeballBadge: React.FC<FloatingPokeballBadgeProps> = ({
  onClick,
  isOpen,
}) => {
  return (
    <div
      className={`floating-pokeball-launcher ${isOpen ? 'active' : ''}`}
      onClick={onClick}
      title={isOpen ? 'Minimize Pokédex' : 'Open Pokédex (or press Spacebar)'}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
    >
      <div className="scalloped-badge-wrap">
        {/* Scalloped / Petaled dark badge SVG background matching Image 2 */}
        <svg
          viewBox="0 0 100 100"
          className="scalloped-badge-svg"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <radialGradient id="badgeDarkGrad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#252528" />
              <stop offset="70%" stopColor="#17181c" />
              <stop offset="100%" stopColor="#0d0e11" />
            </radialGradient>
            <filter id="badgeShadow" x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="4" stdDeviation="6" floodColor="#000000" floodOpacity="0.8" />
              <feDropShadow dx="0" dy="0" stdDeviation="8" floodColor="#e51922" floodOpacity="0.25" />
            </filter>
          </defs>

          {/* 12-lobed smooth scalloped badge perimeter */}
          <path
            d="
              M 50 4
              C 58 4, 62 10, 68 14
              C 74 18, 81 18, 86 24
              C 91 30, 90 38, 93 45
              C 96 52, 93 60, 90 67
              C 87 74, 82 80, 75 84
              C 68 88, 62 92, 54 94
              C 46 96, 40 92, 33 88
              C 26 84, 19 80, 15 73
              C 11 66, 9 58, 10 50
              C 11 42, 13 34, 18 28
              C 23 22, 30 18, 37 14
              C 44 10, 42 4, 50 4
              Z
            "
            fill="url(#badgeDarkGrad)"
            stroke="rgba(255, 255, 255, 0.12)"
            strokeWidth="1.5"
            filter="url(#badgeShadow)"
          />

          {/* Inner subtle groove */}
          <circle
            cx="50"
            cy="50"
            r="38"
            fill="none"
            stroke="rgba(255, 255, 255, 0.06)"
            strokeWidth="1"
          />
        </svg>

        {/* Crisp Pokeball Icon (Image 2 style) */}
        <div className="inner-pokeball-disc">
          <div className="pokeball-top-half" />
          <div className="pokeball-bottom-half" />
          <div className="pokeball-center-band" />
          <div className="pokeball-center-btn">
            <div className="pokeball-inner-core" />
          </div>
        </div>
      </div>
    </div>
  )
}
