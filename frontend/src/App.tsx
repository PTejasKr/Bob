import { useState, useRef, useEffect } from 'react'
import { Mic, Square, Loader2, Menu, X, GitBranch, Info, FileText } from 'lucide-react'
import './App.css'

interface Citation {
  chunk_id: string;
  support: string;
}

interface LatencyMetrics {
  stt: number;
  retrieval: number;
  rerank: number;
  generation: number;
  validation: number;
  total: number;
}

interface VoiceQueryResponse {
  request_id: string;
  transcript: string;
  answer: string;
  citations: Citation[];
  grounded: boolean;
  confidence: number;
  latency_ms: LatencyMetrics;
}

function App() {
  const [isRecording, setIsRecording] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<VoiceQueryResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      mediaRecorderRef.current = new MediaRecorder(stream)
      
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }

      mediaRecorderRef.current.onstop = handleStop
      audioChunksRef.current = []
      mediaRecorderRef.current.start()
      setIsRecording(true)
      setError(null)
      setResult(null)
    } catch (err) {
      console.error("Error accessing microphone:", err)
      setError("Microphone access denied or not available.")
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop()
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop())
      setIsRecording(false)
    }
  }

  const handleStop = async () => {
    const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/wav' })
    const formData = new FormData()
    formData.append('audio', audioBlob, 'recording.wav')

    setLoading(true)
    setError(null)
    try {
      // Assuming backend is running on 8001
      const response = await fetch('http://127.0.0.1:8001/api/v1/voice/query', {
        method: 'POST',
        body: formData,
      })
      
      if (!response.ok) {
        throw new Error(`Server error: ${response.statusText}`)
      }
      
      const data: VoiceQueryResponse = await response.json()
      setResult(data)
    } catch (err: any) {
      console.error(err)
      setError(err.message || "An error occurred while processing the audio.")
    } finally {
      setLoading(false)
    }
  }

  // Handle escape key to close menu
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMenuOpen(false)
    }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [])

  return (
    <div className="app-container">
      {/* Top Navigation */}
      <nav className="top-nav">
        <div className="logo">HH Goa 2026</div>
        <button 
          className="menu-button" 
          onClick={() => setIsMenuOpen(!isMenuOpen)}
          aria-label="Toggle menu"
        >
          {isMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </nav>

      {/* Vertical Menu Overlay */}
      <div className={`menu-overlay ${isMenuOpen ? 'open' : ''}`}>
        <div className="menu-content">
          <div className="menu-header">
            <h3>Menu</h3>
            <button className="close-button" onClick={() => setIsMenuOpen(false)}>
              <X size={24} />
            </button>
          </div>
          <nav className="vertical-nav">
            <a href="#" className="nav-item">
              <Info size={20} />
              <span>About Us</span>
            </a>
            <a href="#" className="nav-item">
              <FileText size={20} />
              <span>Dataset Docs</span>
            </a>
            <a href="#" className="nav-item">
              <GitBranch size={20} />
              <span>GitBranch</span>
            </a>
          </nav>
          <div className="menu-footer">
            <p>Voice-Enabled RAG System</p>
            <p className="version">v1.0.0 Turbo Mode</p>
          </div>
        </div>
        <div className="menu-backdrop" onClick={() => setIsMenuOpen(false)}></div>
      </div>

      {/* Main Content */}
      <main className="main-content">
        <div className="hero-section">
          <h1 className="hero-title">What would you like to know?</h1>
          <p className="hero-subtitle">Ask anything from the MSMARCO-XI dataset.</p>
        </div>

        <div className="record-container">
          <button 
            className={`record-button ${isRecording ? 'recording' : ''}`}
            onClick={isRecording ? stopRecording : startRecording}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="spinner" size={32} />
            ) : isRecording ? (
              <Square size={32} fill="currentColor" />
            ) : (
              <Mic size={32} />
            )}
          </button>
          <p className="record-status">
            {loading ? 'Processing...' : isRecording ? 'Listening... Tap to stop' : 'Tap to speak'}
          </p>
        </div>

        {error && (
          <div className="error-card">
            <p>{error}</p>
          </div>
        )}

        {result && (
          <div className="results-container slide-up">
            <div className="transcript-box">
              <span className="label">You said</span>
              <p>"{result.transcript}"</p>
            </div>
            
            <div className="answer-box">
              <div className="answer-header">
                <span className="label">Answer</span>
                {result.grounded ? (
                  <span className="status-badge grounded">Grounded</span>
                ) : (
                  <span className="status-badge ungrounded">Insufficient Context</span>
                )}
              </div>
              <p className="answer-text">{result.answer}</p>
            </div>

            <div className="metrics-box">
              <span className="label">Latency Breakdown</span>
              <div className="metrics-grid">
                <div className="metric-item">
                  <span className="metric-name">STT</span>
                  <span className="metric-value">{result.latency_ms.stt}ms</span>
                </div>
                <div className="metric-item">
                  <span className="metric-name">Retrieval</span>
                  <span className="metric-value">{result.latency_ms.retrieval}ms</span>
                </div>
                <div className="metric-item">
                  <span className="metric-name">Generation</span>
                  <span className="metric-value">{result.latency_ms.generation}ms</span>
                </div>
                <div className="metric-item total">
                  <span className="metric-name">Total</span>
                  <span className="metric-value">{result.latency_ms.total}ms</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}

export default App
