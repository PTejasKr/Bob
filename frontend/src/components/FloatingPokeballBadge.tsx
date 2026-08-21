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
      className={`floating-pokeball-launcher ${isOpen ? 'is-open' : 'is-closed'}`}
      onClick={onClick}
      title={isOpen ? 'Close Pokédex' : 'Open Pokédex (or press Spacebar)'}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick()
        }
      }}
    >
      <div className="pokeball-3d-flipper">
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
