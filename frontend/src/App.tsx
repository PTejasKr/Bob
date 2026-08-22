import { useState, useRef, useEffect } from 'react'
import './App.css'
import { PokedexChassis } from './components/PokedexChassis'
import { FloatingPokeballBadge } from './components/FloatingPokeballBadge'
import { PokemonBobLogo } from './components/PokemonBobLogo'
import { HistoryDrawer } from './components/HistoryDrawer'
import type { ChatMessage } from './components/PokedexScreenChat'

function App() {
  const [isOpen, setIsOpen] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [historyIndex, setHistoryIndex] = useState<number | null>(null)

  const [isListening, setIsListening] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [liveTranscript, setLiveTranscript] = useState('')

  const [messages, setMessages] = useState<ChatMessage[]>([])

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<BlobPart[]>([])
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    // Connect WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.hostname
    const port = host === 'localhost' || host === '127.0.0.1' ? ':8000' : ''
    const wsUrl = `${protocol}//${host}${port}/api/v1/voice/ws`
    
    try {
      const ws = new WebSocket(wsUrl)
      wsRef.current = ws

      ws.onopen = () => {
        console.log('WebSocket connected')
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)

          if (data.status === 'transcribing') {
            setIsProcessing(true)
          } else if (data.status === 'searching') {
            if (data.transcript) setLiveTranscript(data.transcript)
          } else if (data.status === 'answering') {
            if (data.transcript) setLiveTranscript(data.transcript)
          } else if (data.status === 'done') {
            setIsProcessing(false)
            setIsListening(false)

            const userText = data.transcript || liveTranscript
            if (userText) {
              const userMsg: ChatMessage = {
                id: `u-${Date.now()}`,
                sender: 'user',
                text: userText,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              }

              const bobMsg: ChatMessage = {
                id: `b-${Date.now()}`,
                sender: 'bob',
                text: data.answer || 'No answer generated.',
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                grounded: data.grounded ?? true,
                latency: typeof data.latency_ms === 'number' ? { total: data.latency_ms } : data.latency_ms,
                citations: data.citations || [],
              }

              setMessages((prev) => [...prev, userMsg, bobMsg])
              setHistoryIndex(null) // Return to latest
              setLiveTranscript('')

              if (data.answer && 'speechSynthesis' in window) {
                const utterance = new SpeechSynthesisUtterance(data.answer)
                utterance.rate = 1.05
                window.speechSynthesis.speak(utterance)
              }
            }
          } else if (data.status === 'error') {
            setIsProcessing(false)
            setIsListening(false)
          }
        } catch (e) {
          console.error('WS Parse Error:', e)
        }
      }

      ws.onclose = () => {
        console.log('WebSocket disconnected')
      }
    } catch (err) {
      console.error('WebSocket connection error:', err)
    }

    return () => {
      wsRef.current?.close()
    }
  }, [])

  // Spacebar shortcut to activate Bob
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault()
        handleToggleListen()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isListening, isProcessing])

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        setIsProcessing(true)

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(audioBlob)
        } else {
          try {
            const formData = new FormData()
            formData.append('audio', audioBlob, 'recording.webm')
            const res = await fetch('/api/v1/voice/query', {
              method: 'POST',
              body: formData,
            })
            const data = await res.json()
            setIsProcessing(false)

            const userMsg: ChatMessage = {
              id: `u-${Date.now()}`,
              sender: 'user',
              text: data.transcript || 'Voice Recording',
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            }
            const bobMsg: ChatMessage = {
              id: `b-${Date.now()}`,
              sender: 'bob',
              text: data.answer || 'No answer generated.',
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              grounded: data.grounded,
              confidence: data.confidence,
              latency: data.latency_ms,
              citations: data.citations || [],
            }
            setMessages((prev) => [...prev, userMsg, bobMsg])
            setHistoryIndex(null)
            setLiveTranscript('')
          } catch (err) {
            console.error('HTTP Voice fallback error:', err)
            setIsProcessing(false)
          }
        }
      }

      mediaRecorder.start()
      setIsListening(true)
      setLiveTranscript('Listening to your voice...')
    } catch (err) {
      console.error('Microphone error:', err)
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isListening) {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop())
      setIsListening(false)
    }
  }

  const handleToggleListen = () => {
    if (isListening) {
      stopRecording()
    } else {
      startRecording()
    }
  }

  const handleSendMessage = async (text: string) => {
    if (!text.trim()) return

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      sender: 'user',
      text: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }
    setMessages((prev) => [...prev, userMsg])
    setHistoryIndex(null)
    setIsProcessing(true)

    try {
      const res = await fetch('/api/v1/text/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: text, top_k: 3 }),
      })
      const data = await res.json()
      setIsProcessing(false)

      const bobMsg: ChatMessage = {
        id: `b-${Date.now()}`,
        sender: 'bob',
        text: data.answer || 'No answer available.',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        grounded: data.grounded,
        confidence: data.confidence,
        latency: data.latency_ms,
        citations: data.citations || [],
      }

      setMessages((prev) => [...prev, bobMsg])

      if (data.answer && 'speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(data.answer)
        utterance.rate = 1.05
        window.speechSynthesis.speak(utterance)
      }
    } catch (err) {
      console.error('Text query error:', err)
      setIsProcessing(false)
    }
  }

  const handlePlaySpeech = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = 1.05
      window.speechSynthesis.speak(utterance)
    }
  }

  // D-Pad Scroll Up/Down
  const handleScrollUp = () => {
    const el = document.querySelector('.chat-messages-viewport')
    if (el) el.scrollTop -= 140
  }

  const handleScrollDown = () => {
    const el = document.querySelector('.chat-messages-viewport')
    if (el) el.scrollTop += 140
  }

  // History Navigation via Left / Right D-Pad buttons
  const userPairCount = messages.filter((m) => m.sender === 'user').length

  const handlePrevHistory = () => {
    if (userPairCount === 0) return
    if (historyIndex === null) {
      setHistoryIndex(userPairCount - 1)
    } else if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1)
    }
  }

  const handleNextHistory = () => {
    if (userPairCount === 0 || historyIndex === null) return
    if (historyIndex < userPairCount - 1) {
      setHistoryIndex(historyIndex + 1)
    } else {
      setHistoryIndex(null) // Return to live/latest
    }
  }

  return (
    <div className="app-viewport">
      {/* 1. Live Background Video Wallpaper */}
      <video
        src="/background.mp4"
        autoPlay
        loop
        muted
        playsInline
        className="live-background-video"
      />
      <div className="live-wallpaper-overlay" />

      {/* 2. Pokémon XY Style "BOB" Logo on Background */}
      <PokemonBobLogo />

      {/* Navigation Header */}
      <header className="nav-header">
        <button
          className="hamburger-btn"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
        >
          <div className="hamburger-line" />
          <div className="hamburger-line" />
          <div className="hamburger-line" />
        </button>
        <div className={`menu-overlay ${menuOpen ? 'open' : ''}`}>
          <a href="#" className="menu-item">
            Pokédex RAG Bob
          </a>
          <a
            href="#"
            className="menu-item"
            onClick={(e) => {
              e.preventDefault()
              setIsOpen(!isOpen)
            }}
          >
            {isOpen ? 'Minimize Pokédex' : 'Open Pokédex'}
          </a>
          <a
            href="#"
            className="menu-item"
            onClick={(e) => {
              e.preventDefault()
              setHistoryOpen(true)
            }}
          >
            History Logs
          </a>
        </div>
      </header>

      {/* 3. Pokédex Chassis Viewport (With Image Aspect Ratio & Hotspots) */}
      <PokedexChassis
        isOpen={isOpen}
        messages={messages}
        activeHistoryIndex={historyIndex}
        liveTranscript={liveTranscript}
        isListening={isListening}
        isProcessing={isProcessing}
        onToggleOpen={() => setIsOpen(!isOpen)}
        onToggleListen={handleToggleListen}
        onOpenHistory={() => setHistoryOpen(true)}
        onPrevHistory={handlePrevHistory}
        onNextHistory={handleNextHistory}
        onSendMessage={handleSendMessage}
        onPlaySpeech={handlePlaySpeech}
        onScrollUp={handleScrollUp}
        onScrollDown={handleScrollDown}
      />

      {/* 4. Floating Pokéball Launcher Badge */}
      <FloatingPokeballBadge
        isOpen={isOpen}
        onClick={() => setIsOpen(!isOpen)}
      />

      {/* 5. History Drawer Modal (Opened by Blue Spine Button) */}
      <HistoryDrawer
        isOpen={historyOpen}
        messages={messages}
        onClose={() => setHistoryOpen(false)}
        onSelectPair={(index) => setHistoryIndex(index)}
      />
    </div>
  )
}

export default App
