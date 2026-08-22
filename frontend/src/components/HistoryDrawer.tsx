import React from 'react'
import type { ChatMessage } from './PokedexScreenChat'

interface HistoryDrawerProps {
  isOpen: boolean
  messages: ChatMessage[]
  onClose: () => void
  onSelectPair?: (pairIndex: number) => void
}

export const HistoryDrawer: React.FC<HistoryDrawerProps> = ({
  isOpen,
  messages,
  onClose,
  onSelectPair,
}) => {
  if (!isOpen) return null

  // Pair messages into User + Bob responses
  const pairs: { user?: ChatMessage; bob?: ChatMessage; index: number }[] = []
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].sender === 'user') {
      const userMsg = messages[i]
      const bobMsg = messages[i + 1]?.sender === 'bob' ? messages[i + 1] : undefined
      pairs.push({ user: userMsg, bob: bobMsg, index: pairs.length })
    }
  }

  return (
    <div className="history-drawer-overlay" onClick={onClose}>
      <div className="history-drawer-content" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <h2>POKÉDEX HISTORY LOGS</h2>
          <button className="drawer-close-btn" onClick={onClose}>
            ✕
          </button>
        </div>

        <div className="drawer-list">
          {pairs.length === 0 ? (
            <div className="history-empty-text">No Q&amp;A history recorded yet.</div>
          ) : (
            pairs.map((pair) => (
              <div
                key={pair.index}
                className="history-pair-card"
                onClick={() => {
                  if (onSelectPair) onSelectPair(pair.index)
                  onClose()
                }}
              >
                <div className="history-card-time">{pair.user?.timestamp}</div>
                <div className="history-card-user">Q: {pair.user?.text}</div>
                <div className="history-card-bob">
                  A: {pair.bob?.text || 'No answer generated.'}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
