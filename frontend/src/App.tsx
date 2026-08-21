import { useState, useRef, useEffect, useCallback } from 'react'
import { PokedexChassis } from './components/PokedexChassis'
import { FloatingPokeballBadge } from './components/FloatingPokeballBadge'
import type { ChatMessage } from './components/PokedexScreenChat'
import type { RagStage } from './components/LinearRagLoader'
import './App.css'

interface Citation {
  chunk_id: string
  support: string
}

interface LatencyMetrics {
  stt: number
  retrieval: number
  rerank: number
  generation: number
  validation: number
  total: number
}

interface VoiceQueryResponse {
  request_id: string
  transcript: string
  answer: string
  citations: Citation[]
  grounded: boolean
  confidence: number
  latency_ms: LatencyMetrics
}

function App() {
  const [isOpen, setIsOpen] = useState(true)
  const [isListening, setIsListening] = useState(false)
  const [isProcessing, setIsProcessing] = useState(false)
  const [liveTranscript, setLiveTranscript] = useState('')
  const [ragStage, setRagStage] = useState<RagStage>('idle')
  const [latestMetrics, setLatestMetrics] = useState<LatencyMetrics | undefined>(undefined)
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome-1',
      sender: 'bob',
      text: 'Hello, Trainer! I am Bob, your Voice RAG Pokédex. Press the Blue Button, click the White Orb, or tap Spacebar to ask anything.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      grounded: true,
    },
  ])

  const recognitionRef = useRef<any>(null)
  const isListeningRef = useRef(false)
  const recorderHandledRef = useRef(false)
  const liveTranscriptRef = useRef('')
  const sessionTranscriptRef = useRef('')
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  // Format current time
  const getCurrentTime = () =>
    new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

  // Play text-to-speech for Bob's response
  const speakResponse = useCallback((text: string) => {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel() // Stop any previous speech
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.rate = 1.05
      utterance.pitch = 1.0
      // Select natural English voice if available
      const voices = window.speechSynthesis.getVoices()
      const preferredVoice = voices.find(
        (v) => v.lang.startsWith('en') && (v.name.includes('Google') || v.name.includes('Natural') || v.name.includes('Samantha'))
      )
      if (preferredVoice) utterance.voice = preferredVoice
      window.speechSynthesis.speak(utterance)
    }
  }, [])

  // Process text query with backend API
  const handleQuery = useCallback(
    async (queryText: string) => {
      if (!queryText || queryText.trim().length === 0) return

      const cleanQuery = queryText.trim()
      const timeStr = getCurrentTime()

      // Add user message
      const userMsgId = `user-${Date.now()}`
      setMessages((prev) => [
        ...prev,
        {
          id: userMsgId,
          sender: 'user',
          text: cleanQuery,
          timestamp: timeStr,
        },
      ])

      setIsProcessing(true)
      setRagStage('retrieving')

      const startTime = performance.now()

      try {
        // Stage 1: Retrieval ramp
        setTimeout(() => {
          setRagStage((s) => (s === 'retrieving' ? 'generating' : s))
        }, 120)

        const base = (import.meta as any).env?.VITE_API_BASE || 'http://127.0.0.1:8000'
        const targetUrl = base ? `${base}/api/v1/text/query` : '/api/v1/text/query'

        const response = await fetch(targetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: cleanQuery, top_k: 3 }),
        })

        if (!response.ok) {
          throw new Error(`Server returned status ${response.status}`)
        }

        const data: VoiceQueryResponse = await response.json()
        const totalLatency = Math.round(performance.now() - startTime)

        const lm: LatencyMetrics = data.latency_ms || {
          stt: 0,
          retrieval: 25,
          rerank: 0,
          generation: totalLatency - 25,
          validation: 0,
          total: totalLatency,
        }

        setLatestMetrics(lm)
        setRagStage('done')

        // Add Bob's response message
        const bobMsgId = `bob-${Date.now()}`
        const answer = data.answer || "I couldn't find a matching entry in the database."

        setMessages((prev) => [
          ...prev,
          {
            id: bobMsgId,
            sender: 'bob',
            text: answer,
            timestamp: getCurrentTime(),
            grounded: data.grounded,
            confidence: data.confidence,
            latency: {
              stt: lm.stt,
              retrieval: lm.retrieval,
              generation: lm.generation,
              total: lm.total,
            },
            citations: data.citations,
          },
        ])
        setLiveTranscript('')
        liveTranscriptRef.current = ''

        // Speak aloud
        speakResponse(answer)
      } catch (err: any) {
        console.error('Query error:', err)
        setRagStage('error')
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            sender: 'bob',
            text: `Connection Error: ${err.message || 'Could not reach backend on port 8000. Ensure backend is running.'}`,
            timestamp: getCurrentTime(),
            grounded: false,
          },
        ])
      } finally {
        setIsProcessing(false)
        setTimeout(() => {
          setRagStage('idle')
        }, 3000)
      }
    },
    [speakResponse]
  )

  // Fall back to the backend recorder when browser speech recognition is unavailable.
  const handleRecordedVoice = useCallback(
    async (audioBlob: Blob) => {
      setIsProcessing(true)
      setRagStage('retrieving')
      setLiveTranscript('Transcribing your recording...')

      try {
        const base = (import.meta as any).env?.VITE_API_BASE || 'http://127.0.0.1:8000'
        const formData = new FormData()
        formData.append('audio', audioBlob, 'recording.webm')
        const response = await fetch(`${base}/api/v1/voice/query`, {
          method: 'POST',
          body: formData,
        })

        if (!response.ok) {
          const detail = await response.text()
          throw new Error(`Voice request failed (${response.status}): ${detail.slice(0, 160)}`)
        }

        const data: VoiceQueryResponse = await response.json()
        const answer = data.answer || "I couldn't find a matching entry in the database."
        const metrics = data.latency_ms

        setLatestMetrics(metrics)
        setMessages((prev) => [
          ...prev,
          {
            id: `user-${Date.now()}`,
            sender: 'user',
            text: data.transcript || 'Audio received, but no speech was detected.',
            timestamp: getCurrentTime(),
          },
          {
            id: `bob-${Date.now() + 1}`,
            sender: 'bob',
            text: answer,
            timestamp: getCurrentTime(),
            grounded: data.grounded,
            confidence: data.confidence,
            latency: {
              stt: metrics.stt,
              retrieval: metrics.retrieval,
              generation: metrics.generation,
              total: metrics.total,
            },
            citations: data.citations,
          },
        ])
        setRagStage('done')
        speakResponse(answer)
      } catch (err: any) {
        setRagStage('error')
        setMessages((prev) => [
          ...prev,
          {
            id: `err-${Date.now()}`,
            sender: 'bob',
            text: `Voice Error: ${err.message || 'Could not transcribe the recording.'}`,
            timestamp: getCurrentTime(),
            grounded: false,
          },
        ])
      } finally {
        setLiveTranscript('')
        setIsProcessing(false)
        setTimeout(() => setRagStage('idle'), 3000)
      }
    },
    [speakResponse]
  )

  // Start Speech Recognition & Audio stream
  const startSpeechRecognition = useCallback(() => {
    if (isListeningRef.current || isProcessing) return

    setIsOpen(true) // Ensure Pokédex is open
    setLiveTranscript('')
    liveTranscriptRef.current = ''
    sessionTranscriptRef.current = ''
    recorderHandledRef.current = false
    setIsListening(true)
    isListeningRef.current = true
    setRagStage('listening')

    // Web Speech API
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (SpeechRecognition) {
      try {
        const recognition = new SpeechRecognition()
        recognition.continuous = true
        recognition.interimResults = true
        recognition.lang = 'en-US'

        recognition.onresult = (event: any) => {
          let finalText = ''
          let interimText = ''

          for (let i = 0; i < event.results.length; ++i) {
            const transcript = event.results[i][0].transcript
            if (event.results[i].isFinal) {
              finalText += transcript
            } else {
              interimText += transcript
            }
          }

          const currentText = `${finalText} ${interimText}`.trim()
          sessionTranscriptRef.current = currentText
          setLiveTranscript(currentText)
          liveTranscriptRef.current = currentText
        }

        recognition.onerror = (event: any) => {
          console.warn('Speech recognition error:', event.error)
        }

        recognition.onend = () => {
          // The recorder is authoritative. Browser speech is only a live preview.
        }

        recognitionRef.current = recognition
        recognition.start()
      } catch (e) {
        console.error('Error starting Web Speech API:', e)
      }
    }

    // MediaRecorder stream backup
    if (navigator.mediaDevices?.getUserMedia) {
      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          if (!isListeningRef.current) {
            stream.getTracks().forEach((track) => track.stop())
            return
          }
          const recorder = new MediaRecorder(stream)
          mediaRecorderRef.current = recorder
          audioChunksRef.current = []

          recorder.ondataavailable = (e) => {
            if (e.data.size > 0) {
              audioChunksRef.current.push(e.data)
            }
          }

          recorder.onstop = () => {
            const audioBlob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' })
            if (!recorderHandledRef.current && audioBlob.size > 0) {
              recorderHandledRef.current = true
              handleRecordedVoice(audioBlob)
            }
          }

          recorder.start()
        })
        .catch((err) => {
          console.warn('Microphone stream access warning:', err)
          isListeningRef.current = false
          setIsListening(false)
          setRagStage('error')
          setMessages((prev) => [
            ...prev,
            {
              id: `err-${Date.now()}`,
              sender: 'bob',
              text: `Microphone Error: ${err.message || 'Microphone access was denied.'}`,
              timestamp: getCurrentTime(),
              grounded: false,
            },
          ])
        })
    } else {
      setIsListening(false)
      isListeningRef.current = false
      setRagStage('error')
      setMessages((prev) => [
        ...prev,
        {
          id: `err-${Date.now()}`,
          sender: 'bob',
          text: 'Microphone Error: This browser does not support audio capture.',
          timestamp: getCurrentTime(),
          grounded: false,
        },
      ])
    }
  }, [isProcessing, handleRecordedVoice])

  // Stop Speech Recognition
  const stopSpeechRecognition = useCallback(() => {
    isListeningRef.current = false
    setIsListening(false)

    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch (e) {}
      recognitionRef.current = null
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop()
        mediaRecorderRef.current.stream.getTracks().forEach((track) => track.stop())
      } catch (e) {}
    }
  }, [])

  // Toggle speech input
  const toggleSpeechInput = useCallback(() => {
    if (isListening) {
      stopSpeechRecognition()
    } else {
      startSpeechRecognition()
    }
  }, [isListening, startSpeechRecognition, stopSpeechRecognition])

  // Spacebar key listener (triggers Bob startup / mic input)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is actively typing in a text input or textarea
      const target = e.target as HTMLElement
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return
      }

      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault()
        toggleSpeechInput()
      } else if (e.key === 'Escape' && isOpen) {
        setIsOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toggleSpeechInput, isOpen])

  return (
    <div className="pokedex-app-root">
      {/* Primary Minimal Page with Floating Pokeball Badge */}
      <FloatingPokeballBadge
        isOpen={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
      />

      {/* Main Pokédex Modal / View */}
      {isOpen && (
        <div className="pokedex-modal-stage">
          <PokedexChassis
            messages={messages}
            liveTranscript={liveTranscript}
            isListening={isListening}
            isProcessing={isProcessing}
            ragStage={ragStage}
            latencyMetrics={latestMetrics}
            onToggleListen={toggleSpeechInput}
            onSendMessage={handleQuery}
            onPlaySpeech={speakResponse}
          />
        </div>
      )}
    </div>
  )
}

export default App
