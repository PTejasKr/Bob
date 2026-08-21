import React, { useEffect, useState } from 'react'

export type RagStage = 'idle' | 'listening' | 'retrieving' | 'generating' | 'done' | 'error'

interface LinearRagLoaderProps {
  stage: RagStage
  retrievalTimeMs?: number
  generationTimeMs?: number
  totalTimeMs?: number
}

export const LinearRagLoader: React.FC<LinearRagLoaderProps> = ({
  stage,
  retrievalTimeMs,
  generationTimeMs,
  totalTimeMs,
}) => {
  const [simulatedProgress, setSimulatedProgress] = useState(0)

  useEffect(() => {
    let interval: any

    if (stage === 'idle') {
      setSimulatedProgress(0)
    } else if (stage === 'listening') {
      // Gentle pulsing/breathing progress
      setSimulatedProgress(15)
    } else if (stage === 'retrieving') {
      // Rapid ramp to 55% during vector search
      setSimulatedProgress(25)
      interval = setInterval(() => {
        setSimulatedProgress((p) => (p < 60 ? p + 5 : p))
      }, 40)
    } else if (stage === 'generating') {
      // Ramp from 60% to 92% during LLM generation
      setSimulatedProgress(65)
      interval = setInterval(() => {
        setSimulatedProgress((p) => (p < 92 ? p + 3 : p))
      }, 70)
    } else if (stage === 'done') {
      setSimulatedProgress(100)
      const timeout = setTimeout(() => {
        setSimulatedProgress(0)
      }, 2500)
      return () => clearTimeout(timeout)
    } else if (stage === 'error') {
      setSimulatedProgress(100)
    }

    return () => {
      if (interval) clearInterval(interval)
    }
  }, [stage])

  const getStageLabel = () => {
    switch (stage) {
      case 'listening':
        return 'AUDIO IN'
      case 'retrieving':
        return 'RAG SCAN'
      case 'generating':
        return 'GENESIS'
      case 'done':
        return 'SYNCED'
      case 'error':
        return 'SYS ERR'
      default:
        return 'STANDBY'
    }
  }

  const getStageColor = () => {
    switch (stage) {
      case 'listening':
        return '#00e5ff'
      case 'retrieving':
        return '#00e676'
      case 'generating':
        return '#FFE81F'
      case 'done':
        return '#00e676'
      case 'error':
        return '#ff3b30'
      default:
        return 'rgba(255, 255, 255, 0.3)'
    }
  }

  // Number of discrete segments in the linear LED bar
  const totalSegments = 16
  const activeSegments = Math.round((simulatedProgress / 100) * totalSegments)

  return (
    <div className={`pokedex-linear-loader ${stage}`}>
      <div className="loader-header">
        <span className="loader-title">RAG PIPE</span>
        <span className="loader-stage-tag" style={{ color: getStageColor() }}>
          {getStageLabel()}
        </span>
      </div>

      {/* Main Linear Bar Container */}
      <div className="linear-track">
        {/* Continuous gradient fill with glow */}
        <div
          className="linear-fill"
          style={{
            height: `${simulatedProgress}%`,
            backgroundColor: getStageColor(),
            boxShadow: `0 0 12px ${getStageColor()}`,
          }}
        />

        {/* Segmented LED Tick Marks */}
        <div className="linear-segments-overlay">
          {Array.from({ length: totalSegments }).map((_, i) => {
            const isLit = totalSegments - 1 - i < activeSegments
            return (
              <div
                key={i}
                className={`linear-seg-notch ${isLit ? 'lit' : ''}`}
                style={{
                  backgroundColor: isLit ? getStageColor() : 'transparent',
                }}
              />
            )
          })}
        </div>

        {/* Scanline beam when actively retrieving/generating */}
        {(stage === 'retrieving' || stage === 'generating') && (
          <div className="linear-scan-beam" />
        )}
      </div>

      {/* Numerical Telemetry Metrics */}
      <div className="loader-telemetry">
        {stage === 'retrieving' && (
          <span className="telemetry-text">
            {retrievalTimeMs ? `${retrievalTimeMs}ms` : 'SCANNING'}
          </span>
        )}
        {stage === 'generating' && (
          <span className="telemetry-text">
            {generationTimeMs ? `${generationTimeMs}ms` : 'GROQ LLM'}
          </span>
        )}
        {stage === 'done' && totalTimeMs ? (
          <span className="telemetry-text green">{totalTimeMs}ms</span>
        ) : (
          <span className="telemetry-text dim">{simulatedProgress}%</span>
        )}
      </div>
    </div>
  )
}
