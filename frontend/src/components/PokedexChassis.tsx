import React from 'react'
import { DPadControl } from './DPadControl'
import { LinearRagLoader } from './LinearRagLoader'
import type { RagStage } from './LinearRagLoader'
import { PokedexScreenChat } from './PokedexScreenChat'
import type { ChatMessage } from './PokedexScreenChat'

interface PokedexChassisProps {
  isOpen: boolean
  isCollapsed: boolean
  messages: ChatMessage[]
  liveTranscript: string
  bobLiveAnswer?: string
  isListening: boolean
  isProcessing: boolean
  ragStage: RagStage
  ttsEnabled: boolean
  latencyMetrics?: { stt?: number; retrieval?: number; generation?: number; total?: number }
  onToggleOpen: () => void
  onToggleListen: () => void
  onToggleTts: () => void
  onSendMessage: (text: string) => void
  onPlaySpeech: (text: string) => void
  onScrollUp: () => void
  onScrollDown: () => void
}

export function PokedexChassis({
  isOpen,
  isCollapsed,
  messages,
  liveTranscript,
  bobLiveAnswer,
  isListening,
  isProcessing,
  ragStage,
  ttsEnabled,
  latencyMetrics,
  onToggleOpen,
  onToggleListen,
  onToggleTts,
  onSendMessage,
  onPlaySpeech,
  onScrollUp,
  onScrollDown,
}: PokedexChassisProps) {
  const [activeTab, setActiveTab] = React.useState<number>(0)

  const handleDpadLeft = () => {
    setActiveTab((prev) => (prev - 1 + 3) % 3)
  }

  const handleDpadRight = () => {
    setActiveTab((prev) => (prev + 1) % 3)
  }

  return (
    <div className="pokedex-viewport-wrapper">
      <div className={`pokedex-main-chassis ${isOpen ? 'is-flipped-open' : 'is-closed'} ${isCollapsed ? 'is-collapsed' : ''}`}>
        
        {/* Top Flip Lid */}
        <div 
          className="pokedex-top-flip-lid"
          onClick={!isOpen ? onToggleOpen : undefined}
          title={!isOpen ? 'Click to Flip Open Pokédex' : undefined}
        >
          {isOpen && (
            <div className="inside-lid-pokeball-motif">
              <div className="lid-pokeball-ring">
                <div className="lid-pokeball-top" />
                <div className="lid-pokeball-bottom" />
                <div className="lid-pokeball-center-band" />
                
                {/* Central Button to Activate AI Assistant Bob */}
                <button
                  type="button"
                  className={`lid-central-activation-btn ${isListening ? 'listening-pulse' : isProcessing ? 'processing-pulse' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    onToggleListen()
                  }}
                  title={isListening ? 'Listening... Tap to Stop' : 'Tap Central Button or Spacebar to activate Bob'}
                  aria-label="Activate AI Assistant Bob"
                >
                  <div className="central-inner-orb" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Hinge Line */}
        <div className="pokedex-top-hinge">
          <div className="hinge-ridge hinge-left" />
          <div className="hinge-ridge hinge-center" />
          <div className="hinge-ridge hinge-right" />
        </div>

        {/* Body Layout */}
        <div className="pokedex-body-grid">
          
          {/* Left Spine: LEDs & Blue Button */}
          <div className="pokedex-left-column">
            <div className="pokedex-led-cluster">
              <div className={`pokedex-led led-rect ${isProcessing ? 'pulsing-fast' : 'lit-green'}`} />
              <div className={`pokedex-led led-rect ${isListening ? 'lit-amber' : isProcessing ? 'lit-cyan' : 'lit-green'}`} />
            </div>

            <div className="pokedex-linear-section">
              <LinearRagLoader
                stage={ragStage}
                retrievalTimeMs={latencyMetrics?.retrieval}
                generationTimeMs={latencyMetrics?.generation}
                totalTimeMs={latencyMetrics?.total}
              />
            </div>

            {/* Blue Circular Spine Button (TTS Speech Reply Toggle) */}
            <button
              type="button"
              className={`pokedex-blue-spine-btn ${ttsEnabled ? 'is-glowing' : ''}`}
              onClick={onToggleTts}
              title={ttsEnabled ? 'Voice Reply: ON (Click to Mute Speech)' : 'Voice Reply: OFF (Click to Enable Speech)'}
              aria-label="Toggle Speech Reply"
            />
          </div>

          {/* Center Screen (Visible when open) */}
          <div className="pokedex-center-frame">
            {isOpen ? (
              <div className="pokedex-screen-bezel">
                <div className="pokedex-inner-screen">
                  <PokedexScreenChat
                    messages={messages}
                    liveTranscript={liveTranscript}
                    bobLiveAnswer={bobLiveAnswer}
                    isListening={isListening}
                    isProcessing={isProcessing}
                    activeTab={activeTab}
                    latencyMetrics={latencyMetrics}
                    onSendMessage={onSendMessage}
                    onPlaySpeech={onPlaySpeech}
                  />
                </div>

                <div className="pokedex-bottom-bezel-capsules">
                  <div className="bezel-pill-capsule left-capsule" />
                  <div className="bezel-pill-capsule right-capsule" />
                </div>
              </div>
            ) : (
              <div 
                className="pokedex-closed-cover-panel" 
                onClick={onToggleOpen}
                title="Click or press Pokéball to Flip Open"
              >
                <div className="closed-cover-text">TAP TO FLIP OPEN</div>
              </div>
            )}
          </div>

          {/* Right Wing Pod: 4D D-Pad */}
          <div className="pokedex-right-wing-pod">
            <div className="right-wing-housing">
              <DPadControl
                onUp={onScrollUp}
                onDown={onScrollDown}
                onLeft={handleDpadLeft}
                onRight={handleDpadRight}
                onCenter={onToggleListen}
              />
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
