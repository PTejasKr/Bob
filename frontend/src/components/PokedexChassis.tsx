import React from 'react'
import { DotMatrixBlob } from './DotMatrixBlob'
import { LinearRagLoader } from './LinearRagLoader'
import type { RagStage } from './LinearRagLoader'
import { PokedexScreenChat } from './PokedexScreenChat'
import type { ChatMessage } from './PokedexScreenChat'

interface PokedexChassisProps {
  messages: ChatMessage[]
  liveTranscript: string
  isListening: boolean
  isProcessing: boolean
  ragStage: RagStage
  latencyMetrics?: {
    stt?: number
    retrieval?: number
    generation?: number
    total?: number
  }
  onToggleListen: () => void
  onSendMessage: (text: string) => void
  onPlaySpeech?: (text: string) => void
}

export const PokedexChassis: React.FC<PokedexChassisProps> = ({
  messages,
  liveTranscript,
  isListening,
  isProcessing,
  ragStage,
  latencyMetrics,
  onToggleListen,
  onSendMessage,
  onPlaySpeech,
}) => {
  return (
    <div className="pokedex-viewport-wrapper">
      <div className="pokedex-main-chassis">
        <div className="pokedex-top-hinge">
          <div className="hinge-ridge hinge-left" />
          <div className="hinge-ridge hinge-center" />
          <div className="hinge-ridge hinge-right" />
        </div>

        <div className="pokedex-body-grid">
          <div className="pokedex-left-column">
            <div className="pokedex-led-cluster">
              <div className={`pokedex-led led-top ${isProcessing ? 'pulsing-fast' : 'lit-green'}`} />
              <div className={`pokedex-led led-bottom ${isListening ? 'lit-amber' : isProcessing ? 'lit-cyan' : 'lit-green'}`} />
            </div>

            <div className="pokedex-linear-section">
              <LinearRagLoader
                stage={ragStage}
                retrievalTimeMs={latencyMetrics?.retrieval}
                generationTimeMs={latencyMetrics?.generation}
                totalTimeMs={latencyMetrics?.total}
              />
            </div>
          </div>

          <div className="pokedex-center-frame">
            <div className="pokedex-screen-bezel">
              <div className="pokedex-inner-screen">
                <PokedexScreenChat
                  messages={messages}
                  liveTranscript={liveTranscript}
                  isListening={isListening}
                  isProcessing={isProcessing}
                  onSendMessage={onSendMessage}
                  onPlaySpeech={onPlaySpeech}
                />
              </div>

              <div className="pokedex-bottom-bezel-capsules">
                <div className="bezel-pill-capsule left-capsule" />
                <div className="bezel-pill-capsule right-capsule" />
              </div>
            </div>
          </div>

          <div className="pokedex-right-wing-pod">
            <div className="right-wing-housing">
              <div className="right-wing-inner-disc">
                <DotMatrixBlob
                  isListening={isListening}
                  isProcessing={isProcessing}
                  onClick={onToggleListen}
                />
              </div>
              <div className="right-wing-label">
                {isListening ? 'LISTENING' : isProcessing ? 'THINKING' : 'VOICE ORB'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
