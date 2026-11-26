import { useState, useRef, useEffect } from 'react'
import './App.css'
import { PokedexChassis } from './components/PokedexChassis'
import { FloatingPokeballBadge } from './components/FloatingPokeballBadge'
import type { ChatMessage } from './components/PokedexScreenChat'
import type { RagStage } from './components/LinearRagLoader'
import { useVAD } from './hooks/useVAD'

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

function App() {
  const [isOpen, setIsOpen] = useState(true)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [ttsEnabled, setTtsEnabled] = useState(true)
  const [isListening, setIsListening] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [liveTranscript, setLiveTranscript] = useState('')
  const [bobLiveAnswer, setBobLiveAnswer] = useState('')
  const [ragStage, setRagStage] = useState<RagStage>('idle')
  const [latencyMetrics, setLatencyMetrics] = useState<{
    stt?: number
    retrieval?: number
    generation?: number
    total?: number
  }>({})
  const [messages, setMessages] = useState<ChatMessage[]>([])

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<BlobPart[]>([])
  const wsRef = useRef<WebSocket | null>(null)
  const ttsEnabledRef = useRef(true)
  const bgAudioRef = useRef<HTMLAudioElement | null>(null)
  const [bgAudioPlaying, setBgAudioPlaying] = useState(false)
  const [bgVolume, setBgVolume] = useState<number>(0.35)
  const [wasBgPlayingBeforeMic, setWasBgPlayingBeforeMic] = useState<boolean>(false)

  useEffect(() => {
    ttsEnabledRef.current = ttsEnabled
  }, [ttsEnabled])

  useEffect(() => {
    if (bgAudioRef.current) {
      bgAudioRef.current.volume = bgVolume
    }
  }, [bgVolume])

  useEffect(() => {
    const audio = bgAudioRef.current
    if (!audio) return

    if (isListening) {
      if (!audio.paused) {
        setWasBgPlayingBeforeMic(true)
        audio.pause()
        setBgAudioPlaying(false)
      }
    } else {
      if (wasBgPlayingBeforeMic) {
        audio.play().then(() => {
          setBgAudioPlaying(true)
        }).catch(() => {})
        setWasBgPlayingBeforeMic(false)
      }
    }
  }, [isListening])

  useEffect(() => {
    const audio = bgAudioRef.current
    if (!audio) return
    audio.volume = bgVolume

    const tryPlay = () => {
      audio.play().then(() => {
        setBgAudioPlaying(true)
      }).catch((err) => {
        console.log('Background audio autoplay deferred for gesture:', err)
      })
    }

    tryPlay()

    const handleUserGesture = () => {
      if (audio.paused) {
        audio.play().then(() => {
          setBgAudioPlaying(true)
        }).catch(() => {})
      }
    }

    window.addEventListener('click', handleUserGesture, { once: true })
    window.addEventListener('keydown', handleUserGesture, { once: true })

    return () => {
      window.removeEventListener('click', handleUserGesture)
      window.removeEventListener('keydown', handleUserGesture)
    }
  }, [])

  const toggleBgAudio = () => {
    const audio = bgAudioRef.current
    if (!audio) return
    if (bgAudioPlaying) {
      audio.pause()
      setBgAudioPlaying(false)
    } else {
      audio.play().then(() => setBgAudioPlaying(true)).catch(() => {})
    }
  }

  const speakAnswer = (text: string) => {
    if (!ttsEnabledRef.current || !text || !('speechSynthesis' in window)) return
    try {
      window.speechSynthesis.cancel()
      const cleanText = text.replace(/[*_#`\[\]]/g, '').trim()
      if (!cleanText) return
      const utterance = new SpeechSynthesisUtterance(cleanText)
      utterance.rate = 1.05
      window.speechSynthesis.speak(utterance)
    } catch (e) {
      console.error('Speech synthesis error:', e)
    }
  }

  useEffect(() => {
    // Connect WebSocket
    const wsUrl = API_BASE
      ? `${API_BASE.replace(/^http/, 'ws')}/api/v1/voice/ws`
      : (() => {
          const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
          const host = window.location.hostname
          const port = host === 'localhost' || host === '127.0.0.1' ? ':8000' : ''
          return `${protocol}//${host}${port}/api/v1/voice/ws`
        })()
    
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
            setRagStage('listening')
            setIsProcessing(true)
          } else if (data.status === 'searching') {
            setRagStage('retrieving')
            if (data.transcript) setLiveTranscript(data.transcript)
          } else if (data.status === 'answering') {
            setRagStage('generating')
            if (data.transcript) setLiveTranscript(data.transcript)
            if (!data.speculative) setBobLiveAnswer('')
          } else if (data.status === 'clear') {
            setBobLiveAnswer('')
          } else if (data.status === 'token') {
            setBobLiveAnswer((prev) => prev + data.token)
          } else if (data.status === 'done') {
            setRagStage('done')
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

              const bobAnswer = data.answer || 'No answer generated.'
              const bobMsg: ChatMessage = {
                id: `b-${Date.now()}`,
                sender: 'bob',
                text: bobAnswer,
                timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
                grounded: data.grounded ?? true,
                latency: typeof data.latency_ms === 'number' ? { total: data.latency_ms } : data.latency_ms,
                citations: data.citations || [],
              }

              setMessages((prev) => [...prev, userMsg, bobMsg])
              setLiveTranscript('')
              setBobLiveAnswer('')

              speakAnswer(bobAnswer)
            }
          } else if (data.status === 'error') {
            setRagStage('error')
            setIsProcessing(false)
            setIsListening(false)
            setBobLiveAnswer('')
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

  // Keyboard Spacebar shortcut to activate Bob voice assistant
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
      // Voice input automatically enables Text-To-Speech
      setTtsEnabled(true)
      ttsEnabledRef.current = true

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
      mediaRecorderRef.current = mediaRecorder
      audioChunksRef.current = []

      // Start VAD
      startVAD(stream)

      // Web Speech API for Speculative Streaming
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      let recognition: any = null
      if (SpeechRecognition) {
        recognition = new SpeechRecognition()
        recognition.continuous = true
        recognition.interimResults = true
        recognition.onresult = (event: any) => {
          let interim = ''
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            interim += event.results[i][0].transcript
          }
          if (interim.trim()) {
            setLiveTranscript(interim)
            if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
              wsRef.current.send(JSON.stringify({ type: 'speculate', text: interim }))
            }
          }
        }
        try {
          recognition.start()
        } catch (e) {
          console.error("SpeechRecognition start error:", e)
        }
      }

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorder.onstop = async () => {
        stopVAD()
        if (recognition) {
          try {
            recognition.stop()
          } catch(e) {}
        }
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        setIsProcessing(true)
        setRagStage('retrieving')

        if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
          wsRef.current.send(audioBlob)
        } else {
          try {
            const formData = new FormData()
            formData.append('audio', audioBlob, 'recording.webm')
            const res = await fetch(`${API_BASE}/api/v1/voice/query`, {
              method: 'POST',
              body: formData,
            })
            const data = await res.json()
            setRagStage('done')
            setIsProcessing(false)

            const userMsg: ChatMessage = {
              id: `u-${Date.now()}`,
              sender: 'user',
              text: data.transcript || 'Voice Recording',
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            }
            const bobAnswer = data.answer || 'No answer generated.'
            const bobMsg: ChatMessage = {
              id: `b-${Date.now()}`,
              sender: 'bob',
              text: bobAnswer,
              timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              grounded: data.grounded,
              confidence: data.confidence,
              latency: data.latency_ms,
              citations: data.citations || [],
            }
            setMessages((prev) => [...prev, userMsg, bobMsg])
            setLatencyMetrics(data.latency_ms || {})
            setLiveTranscript('')

            speakAnswer(bobAnswer)
          } catch (err) {
            console.error('HTTP Voice fallback error:', err)
            setRagStage('error')
            setIsProcessing(false)
          }
        }
      }

      mediaRecorder.start()
      setIsListening(true)
      setRagStage('listening')
      setLiveTranscript('Listening to your voice...')
    } catch (err) {
      console.error('Microphone error:', err)
      setRagStage('error')
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isListening) {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop())
      setIsListening(false)
    }
  }

  const { startVAD, stopVAD } = useVAD(stopRecording)

  const handleToggleListen = () => {
    if (isListening) {
      stopRecording()
    } else {
      startRecording()
    }
  }

  const handleToggleTts = () => {
    setTtsEnabled((prev) => {
      const next = !prev
      ttsEnabledRef.current = next
      if (!next && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel()
      }
      return next
    })
  }

  const handleSendMessage = async (text: string) => {
    if (!text.trim()) return

    // Keyboard input automatically turns OFF Text-To-Speech
    setTtsEnabled(false)
    ttsEnabledRef.current = false
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }

    const userMsg: ChatMessage = {
      id: `u-${Date.now()}`,
      sender: 'user',
      text: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    }
    setMessages((prev) => [...prev, userMsg])
    setIsProcessing(true)
    setRagStage('retrieving')

    try {
      const res = await fetch(`${API_BASE}/api/v1/text/query`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: text, top_k: 3 }),
      })
      setRagStage('generating')
      const data = await res.json()
      setRagStage('done')
      setIsProcessing(false)

      const bobAnswer = data.answer || 'No answer available.'
      const bobMsg: ChatMessage = {
        id: `b-${Date.now()}`,
        sender: 'bob',
        text: bobAnswer,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        grounded: data.grounded,
        confidence: data.confidence,
        latency: data.latency_ms,
        citations: data.citations || [],
      }

      setMessages((prev) => [...prev, bobMsg])
      if (data.latency_ms) setLatencyMetrics(data.latency_ms)

      speakAnswer(bobAnswer)
    } catch (err) {
      console.error('Text query error:', err)
      setRagStage('error')
      setIsProcessing(false)
    }
  }

  const handlePlaySpeech = (text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel()
      const cleanText = text.replace(/[*_#`\[\]]/g, '').trim()
      const utterance = new SpeechSynthesisUtterance(cleanText)
      utterance.rate = 1.05
      window.speechSynthesis.speak(utterance)
    }
  }

  const handleScrollUp = () => {
    const el = document.querySelector('.chat-messages-viewport')
    if (el) el.scrollTop -= 140
  }

  const handleScrollDown = () => {
    const el = document.querySelector('.chat-messages-viewport')
    if (el) el.scrollTop += 140
  }

  const handlePokeballClick = () => {
    if (isCollapsed || !isOpen) {
      setIsCollapsed(false)
      setIsOpen(true)
    } else {
      setIsCollapsed(true)
      setIsOpen(false)
    }
  }

  return (
    <div className="app-viewport">
      {/* 1. Live Background Video Wallpaper (Baymax / Snorlax) */}
      <video
        src="/background.mp4"
        autoPlay
        loop
        muted
        playsInline
        className="live-background-video"
      />
      <div className="live-wallpaper-overlay" />

      {/* 2. Official 180px 3D Pokémon Poster Title "BOB" on Baymax Background */}
      {(isCollapsed || !isOpen) && (
        <div className="pokemon-poster-bob-container" onClick={handlePokeballClick}>
          <div className="pokemon-poster-banner-top">Gotta Answer 'Em All!</div>
          <h1 className="pokemon-poster-bob-title">BOB</h1>
          <div className="pokemon-poster-subtitle">AI POKÉDEX ASSISTANT</div>
        </div>
      )}

      {/* 3. Pokédex Chassis Viewport (Flip Open / Closed / Off-screen Collapsed States) */}
      <PokedexChassis
        isOpen={isOpen && !isCollapsed}
        isCollapsed={isCollapsed}
        messages={messages}
        liveTranscript={liveTranscript}
        bobLiveAnswer={bobLiveAnswer}
        isListening={isListening}
        isProcessing={isProcessing}
        ragStage={ragStage}
        ttsEnabled={ttsEnabled}
        latencyMetrics={latencyMetrics}
        onToggleOpen={handlePokeballClick}
        onToggleListen={handleToggleListen}
        onToggleTts={handleToggleTts}
        onSendMessage={handleSendMessage}
        onPlaySpeech={handlePlaySpeech}
        onScrollUp={handleScrollUp}
        onScrollDown={handleScrollDown}
      />

      {/* 4. Floating Pokéball Launcher Badge */}
      <FloatingPokeballBadge
        isOpen={isOpen && !isCollapsed}
        onClick={handlePokeballClick}
      />

      {/* 5. Embedded Background Audio (Kanoko Town / Pokémon Theme) */}
      <audio
        ref={bgAudioRef}
        src="/background_audio.mp3"
        loop
        autoPlay
      />

      {/* 6. Background Music Control Widget with Volume Slider */}
      <div className="bg-music-control-widget">
        <button
          className={`bg-music-toggle-btn ${bgAudioPlaying ? 'playing' : 'paused'}`}
          onClick={toggleBgAudio}
          title={bgAudioPlaying ? 'Pause Background Music' : 'Play Background Music'}
        >
          {bgAudioPlaying ? '🎵 BGM: ON' : '🔇 BGM: OFF'}
        </button>

        <div className="bgm-volume-container">
          <span className="volume-icon">VOL</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.02"
            value={bgVolume}
            onChange={(e) => setBgVolume(parseFloat(e.target.value))}
            className="bgm-volume-slider"
            title={`Volume: ${Math.round(bgVolume * 100)}%`}
          />
          <span className="volume-pct">{Math.round(bgVolume * 100)}%</span>
        </div>
      </div>
    </div>
  )
}

export default App
