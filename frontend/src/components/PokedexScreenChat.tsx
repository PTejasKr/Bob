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
  isListening: boolean
  isProcessing: boolean
  onSendMessage: (text: string) => void
  onPlaySpeech?: (text: string) => void
}

export const PokedexScreenChat: React.FC<PokedexScreenChatProps> = ({
  messages,
  liveTranscript,
  isListening,
  isProcessing,
  onSendMessage,
  onPlaySpeech,
}) => {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [messages, liveTranscript, isProcessing])

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

        {isProcessing && !liveTranscript && (
          <div className="wa-message-row bob-row">
            <div className="wa-bubble wa-bob-bubble processing-bubble">
              <div className="wa-bubble-tail tail-left" />
              <div className="wa-bubble-header">
                <span className="wa-sender-label">BOB</span>
              </div>
              <div className="wa-bubble-text yellow-rag-text processing-dots">
                <span className="rag-dot dot1">.</span>
                <span className="rag-dot dot2">.</span>
                <span className="rag-dot dot3">.</span>
              </div>
            </div>
          </div>
        )}
      </div>

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
    </div>
  )
}
