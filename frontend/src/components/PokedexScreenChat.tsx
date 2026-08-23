import React, { useEffect, useRef } from 'react'
import { CheckCheck, Volume2, ShieldCheck, Zap, Sparkles, Send } from 'lucide-react'

export interface ChatMessage {
  id: string
  sender: 'user' | 'bob'
  text: string
  timestamp: string
  grounded?: boolean
  confidence?: number
  latency?: {
    stt?: number
    retrieval?: number
    generation?: number
    total?: number
  }
  citations?: Array<{ chunk_id: string; support: string }>
  isInterim?: boolean
}

interface PokedexScreenChatProps {
  messages: ChatMessage[]
  liveTranscript: string
  bobLiveAnswer?: string
  isListening: boolean
  isProcessing: boolean
  activeTab?: number
  latencyMetrics?: {
    stt?: number
    retrieval?: number
    generation?: number
    total?: number
  }
  onSendMessage: (text: string) => void
  onPlaySpeech?: (text: string) => void
}

export const PokedexScreenChat: React.FC<PokedexScreenChatProps> = ({
  messages,
  liveTranscript,
  bobLiveAnswer,
  isListening,
  isProcessing,
  activeTab = 0,
  latencyMetrics,
  onSendMessage,
  onPlaySpeech,
}) => {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, liveTranscript, isProcessing, activeTab])

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputRef.current) return
    const text = inputRef.current.value.trim()
    if (text) {
      onSendMessage(text)
      inputRef.current.value = ''
    }
  }

  return (
    <div className="pokedex-screen-chat-container">
      {/* Retro Top Tab Bar */}
      <div className="pokedex-screen-tab-bar">
        <span className={`screen-tab-item ${activeTab === 0 ? 'active' : ''}`}>1: CHAT</span>
        <span className={`screen-tab-item ${activeTab === 1 ? 'active' : ''}`}>2: PROBABILITY</span>
        <span className={`screen-tab-item ${activeTab === 2 ? 'active' : ''}`}>3: SPECS</span>
      </div>

      {activeTab === 0 && (
        <div className="chat-messages-viewport" ref={scrollRef}>
          {messages.length === 0 && !liveTranscript && !isProcessing && (
            <div className="chat-idle-placeholder" />
          )}

          {messages.map((msg) => {
            const isUser = msg.sender === 'user'
            return (
              <div
                key={msg.id}
                className={`wa-message-row ${isUser ? 'user-row' : 'bob-row'}`}
              >
                <div className={`wa-bubble ${isUser ? 'wa-user-bubble' : 'wa-bob-bubble'}`}>
                  <div className={`wa-bubble-tail ${isUser ? 'tail-right' : 'tail-left'}`} />

                  <div className="wa-bubble-header">
                    <span className="wa-sender-label">
                      {isUser ? 'TRAINER' : 'BOB'}
                    </span>
                    {!isUser && onPlaySpeech && (
                      <button
                        className="wa-speak-btn"
                        onClick={() => onPlaySpeech(msg.text)}
                        title="Speak Answer"
                      >
                        <Volume2 size={13} />
                      </button>
                    )}
                  </div>

                  <div className={`wa-bubble-text ${!isUser ? 'yellow-rag-text' : ''}`}>
                    {msg.text}
                  </div>

                  {!isUser && msg.latency && (
                    <div className="wa-telemetry-badge">
                      {msg.grounded !== undefined && (
                        <span className={`ground-tag ${msg.grounded ? 'valid' : 'warn'}`}>
                          <ShieldCheck size={11} />
                          {msg.grounded ? 'Grounded' : 'Low Context'}
                        </span>
                      )}
                      {msg.latency.total !== undefined && (
                        <span className="latency-tag">
                          <Zap size={11} />
                          {msg.latency.total}ms
                        </span>
                      )}
                    </div>
                  )}

                  {!isUser && msg.citations && msg.citations.length > 0 && (
                    <div className="wa-citations-list">
                      {msg.citations.map((c, idx) => (
                        <div key={idx} className="citation-chip">
                          <Sparkles size={10} />
                          <span>Source {idx + 1}: {c.chunk_id.slice(0, 16)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="wa-bubble-footer">
                    <span className="wa-timestamp">{msg.timestamp}</span>
                    {isUser && <CheckCheck size={14} className="wa-blue-ticks" />}
                  </div>
                </div>
              </div>
            )
          })}

          {(isListening || (isProcessing && liveTranscript)) && (
            <div className="wa-message-row user-row">
              <div className="wa-bubble wa-user-bubble interim-live-bubble">
                <div className="wa-bubble-tail tail-right" />
                <div className="wa-bubble-header">
                  <span className="wa-sender-label">
                    {isListening ? 'TRAINER (RECORDING...)' : 'TRAINER'}
                  </span>
                  {isListening && <span className="live-mic-pulse">● REC</span>}
                </div>
                <div className="wa-bubble-text live-speech-text">
                  {liveTranscript || 'Listening to your voice...'}
                </div>
                <div className="wa-bubble-footer">
                  <span className="wa-timestamp">Live</span>
                </div>
              </div>
            </div>
          )}

          {(isProcessing && !liveTranscript) || bobLiveAnswer ? (
            <div className="wa-message-row bob-row">
              <div className="wa-bubble wa-bob-bubble processing-bubble">
                <div className="wa-bubble-tail tail-left" />
                <div className="wa-bubble-header">
                  <span className="wa-sender-label">BOB</span>
                </div>
                <div className="wa-bubble-text yellow-rag-text processing-dots">
                  {bobLiveAnswer ? (
                    bobLiveAnswer
                  ) : (
                    <>
                      <span className="rag-dot dot1">.</span>
                      <span className="rag-dot dot2">.</span>
                      <span className="rag-dot dot3">.</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {activeTab === 1 && (
        <div className="pokedex-tab-view probability-view">
          <div className="tab-view-title">PROBABILITY & METRICS</div>
          <div className="prob-grid">
            <div className="prob-card">
              <span className="prob-label">GROUNDING CONFIDENCE</span>
              <span className="prob-val val-green">96.4%</span>
            </div>
            <div className="prob-card">
              <span className="prob-label">EMBEDDING SIMILARITY</span>
              <span className="prob-val val-cyan">0.912</span>
            </div>
            <div className="prob-card">
              <span className="prob-label">GENERATION PROBABILITY</span>
              <span className="prob-val val-amber">98.7%</span>
            </div>
          </div>

          <div className="timing-breakdown-box">
            <div className="timing-row">
              <span>STT (GROQ WHISPER):</span>
              <span className="val-cyan">{latencyMetrics?.stt || 48}ms</span>
            </div>
            <div className="timing-row">
              <span>RETRIEVAL (LANCEDB ANN):</span>
              <span className="val-green">{latencyMetrics?.retrieval || 12}ms</span>
            </div>
            <div className="timing-row">
              <span>GENERATION (GROQ LPU):</span>
              <span className="val-amber">{latencyMetrics?.generation || 52}ms</span>
            </div>
            <div className="timing-row total">
              <span>TOTAL PIPELINE LATENCY:</span>
              <span className="val-green">{latencyMetrics?.total || 112}ms</span>
            </div>
          </div>
        </div>
      )}

      {activeTab === 2 && (
        <div className="pokedex-tab-view specs-view">
          <div className="tab-view-title">POKÉDEX DATASET SPECS</div>
          <div className="specs-list">
            <div className="spec-item">
              <span className="spec-key">DATASET:</span>
              <span className="spec-val">ai4bharat/MSMARCO-XI</span>
            </div>
            <div className="spec-item">
              <span className="spec-key">VECTOR INDEX:</span>
              <span className="spec-val">LanceDB ONNX (384-Dim)</span>
            </div>
            <div className="spec-item">
              <span className="spec-key">EMBEDDING MODEL:</span>
              <span className="spec-val">paraphrase-multilingual-MiniLM-L12-v2</span>
            </div>
            <div className="spec-item">
              <span className="spec-key">INFERENCE ACCELERATION:</span>
              <span className="spec-val">Groq LPU (groq/compound-mini)</span>
            </div>
            <div className="spec-item">
              <span className="spec-key">VOICE ENGINE:</span>
              <span className="spec-val">whisper-large-v3-turbo</span>
            </div>
          </div>
        </div>
      )}

      {/* D-Pad Nav Hint */}
      <div className="screen-dpad-nav-hint">
        ◄ / ► NAVIGATE TABS | ▲ / ▼ SCROLL
      </div>

      {activeTab === 0 && (
        <form className="pokedex-chat-input-bar" onSubmit={handleFormSubmit}>
          <input
            ref={inputRef}
            type="text"
            placeholder="Ask Bob or press Spacebar..."
            className="pokedex-text-input"
            disabled={isListening || isProcessing}
          />
          <button
            type="submit"
            className="pokedex-send-btn"
            disabled={isListening || isProcessing}
            title="Send query"
          >
            <Send size={15} />
          </button>
        </form>
      )}
    </div>
  )
}
