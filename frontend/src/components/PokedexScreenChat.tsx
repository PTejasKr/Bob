import React, { useRef, useEffect } from 'react'

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
  citations?: Array<{ title?: string; doc_id?: string; text?: string }>
}

interface PokedexScreenChatProps {
  messages: ChatMessage[]
  activeHistoryIndex?: number | null
  liveTranscript: string
  isListening: boolean
  isProcessing: boolean
  onSendMessage: (text: string) => void
  onPlaySpeech?: (text: string) => void
}

export const PokedexScreenChat: React.FC<PokedexScreenChatProps> = ({
  messages,
  activeHistoryIndex,
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
  }, [messages, liveTranscript, isProcessing, activeHistoryIndex])

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputRef.current) return
    const text = inputRef.current.value.trim()
    if (text) {
      onSendMessage(text)
      inputRef.current.value = ''
    }
  }

  // Filter pairs if activeHistoryIndex is set
  let displayedMessages = messages
  if (typeof activeHistoryIndex === 'number' && activeHistoryIndex >= 0) {
    const pairs: { user?: ChatMessage; bob?: ChatMessage }[] = []
    for (let i = 0; i < messages.length; i++) {
      if (messages[i].sender === 'user') {
        pairs.push({
          user: messages[i],
          bob: messages[i + 1]?.sender === 'bob' ? messages[i + 1] : undefined,
        })
      }
    }
    const pair = pairs[activeHistoryIndex]
    if (pair) {
      displayedMessages = [pair.user, pair.bob].filter(Boolean) as ChatMessage[]
    }
  }

  return (
    <div className="pokedex-screen-chat-container">
      <div className="chat-messages-viewport" ref={scrollRef}>
        {displayedMessages.length === 0 && !liveTranscript && !isProcessing && (
          <div className="chat-idle-placeholder" />
        )}

        {displayedMessages.map((msg) => {
          const isUser = msg.sender === 'user'
          return (
            <div
              key={msg.id}
              className={`wa-message-row ${isUser ? 'user-row' : 'bob-row'}`}
            >
              <div className={`wa-bubble ${isUser ? 'wa-user-bubble' : 'wa-bob-bubble'}`}>
                <div className="wa-bubble-header">
                  <span className="wa-sender-label">
                    {isUser ? 'TRAINER' : 'BOB'}
                  </span>
                  {!isUser && onPlaySpeech && (
                    <button
                      type="button"
                      className="wa-speak-btn"
                      onClick={() => onPlaySpeech(msg.text)}
                      title="Listen to response"
                    >
                      🔊
                    </button>
                  )}
                </div>

                <div className={`wa-bubble-text ${!isUser ? 'yellow-rag-text' : ''}`}>
                  {msg.text}
                </div>

                {!isUser && (msg.grounded !== undefined || msg.latency) && (
                  <div className="wa-telemetry-badge">
                    {msg.grounded !== undefined && (
                      <span className={`ground-tag ${msg.grounded ? 'valid' : 'warn'}`}>
                        🛡️{msg.grounded ? 'Grounded' : 'Unverified'}
                      </span>
                    )}
                    {msg.latency?.total && (
                      <span className="latency-tag">⚡{msg.latency.total}ms</span>
                    )}
                  </div>
                )}

                {!isUser && msg.citations && msg.citations.length > 0 && (
                  <div className="wa-citations-list">
                    {msg.citations.map((c, i) => (
                      <span key={i} className="citation-chip">
                        📄 {c.title || c.doc_id || `Doc #${i + 1}`}
                      </span>
                    ))}
                  </div>
                )}

                <div className="wa-bubble-footer">
                  <span className="wa-timestamp">{msg.timestamp}</span>
                  {isUser && <span className="wa-blue-ticks">✓✓</span>}
                </div>
              </div>
            </div>
          )
        })}

        {isListening && (
          <div className="wa-message-row user-row">
            <div className="wa-bubble wa-user-bubble recording-pulse">
              <div className="wa-bubble-header">
                <span className="wa-sender-label">TRAINER (RECORDING...) • REC</span>
              </div>
              <div className="wa-bubble-text">{liveTranscript || 'Listening to your voice...'}</div>
              <div className="wa-bubble-footer">
                <span className="wa-timestamp">Live</span>
              </div>
            </div>
          </div>
        )}
      </div>

      <form className="pokedex-chat-input-bar" onSubmit={handleFormSubmit}>
        <input
          ref={inputRef}
          type="text"
          className="pokedex-text-input"
          placeholder="Ask Bob or press Spacebar.."
        />
        <button type="submit" className="pokedex-send-btn" title="Send Query">
          ➔
        </button>
      </form>
    </div>
  )
}
