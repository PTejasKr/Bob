import React from 'react'
import { DPadControl } from './DPadControl'
import { PokedexScreenChat } from './PokedexScreenChat'
import type { ChatMessage } from './PokedexScreenChat'

interface PokedexChassisProps {
  isOpen: boolean
  messages: ChatMessage[]
  activeHistoryIndex?: number | null
  liveTranscript: string
  isListening: boolean
  isProcessing: boolean
  onToggleOpen: () => void
  onToggleListen: () => void
  onOpenHistory: () => void
  onPrevHistory?: () => void
  onNextHistory?: () => void
  onSendMessage: (text: string) => void
  onPlaySpeech?: (text: string) => void
  onScrollUp?: () => void
  onScrollDown?: () => void
}

export const PokedexChassis: React.FC<PokedexChassisProps> = ({
  isOpen,
  messages,
  activeHistoryIndex,
  liveTranscript,
  isListening,
  isProcessing,
  onToggleOpen,
  onToggleListen,
  onOpenHistory,
  onPrevHistory,
  onNextHistory,
  onSendMessage,
  onPlaySpeech,
  onScrollUp,
  onScrollDown,
}) => {
  return (
    <div className={`pokedex-viewport-wrapper ${!isOpen ? 'is-minimized' : ''}`}>
      {isOpen ? (
        /* Open Pokédex Container with Image Graphic */
        <div className="pokedex-graphic-container pokedex-open-graphic">
          <img
            src="/pokedex_open.jpg"
            alt="Pokédex Open"
            className="pokedex-base-image"
          />

          {/* Central Green Button Hotspot (Top Lid Pokéball) */}
          <button
            type="button"
            className={`hotspot-green-central-btn ${isListening ? 'listening-glow' : isProcessing ? 'processing-glow' : ''}`}
            onClick={onToggleListen}
            title="Tap Green Button or Spacebar to activate Bob"
            aria-label="Central Green Pokéball Button"
          />

          {/* Blue Button Hotspot (Left Spine) */}
          <button
            type="button"
            className="hotspot-blue-spine-btn"
            onClick={onOpenHistory}
            title="Press Blue Button to Open History Logs"
            aria-label="Blue Spine Button"
          />

          {/* Inner Black Screen Content Overlay */}
          <div className="hotspot-screen-viewport">
            <PokedexScreenChat
              messages={messages}
              activeHistoryIndex={activeHistoryIndex}
              liveTranscript={liveTranscript}
              isListening={isListening}
              isProcessing={isProcessing}
              onSendMessage={onSendMessage}
              onPlaySpeech={onPlaySpeech}
            />
          </div>

          {/* Interactive D-Pad Overlay (Right Wing Pod) */}
          <div className="hotspot-dpad-pod">
            <DPadControl
              onUp={onScrollUp}
              onDown={onScrollDown}
              onLeft={onPrevHistory}
              onRight={onNextHistory}
              onCenter={onToggleListen}
            />
            <div className="dpad-status-label">
              {isListening ? 'LISTENING' : isProcessing ? 'THINKING' : 'D-PAD'}
            </div>
          </div>
        </div>
      ) : (
        /* Closed Pokédex Container with Image Graphic */
        <div 
          className="pokedex-graphic-container pokedex-closed-graphic"
          onClick={onToggleOpen}
          title="Click Pokéball to Flip Open Pokédex"
        >
          <img
            src="/pokedex_closed.png"
            alt="Pokédex Closed"
            className="pokedex-base-image"
          />
          <div className="closed-overlay-tap">TAP TO OPEN</div>
        </div>
      )}
    </div>
  )
}
