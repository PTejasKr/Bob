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
  const [stats, setStats] = useState<{ p10: number; p50: number; p100: number }>({
    p10: 110,
    p50: 155,
    p100: 210,
  })

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        const res = await fetch('/api/v1/metrics')
        if (res.ok) {
          const data = await res.json()
          const totalStage = data.stages?.total || data.stages?.generation
          if (totalStage && totalStage.n > 0) {
            setStats({
              p10: Math.round(totalStage.p10 || totalStage.p50 * 0.75),
              p50: Math.round(totalStage.p50 || 150),
              p100: Math.round(totalStage.p100 || 195),
            })
          } else if (totalTimeMs) {
            setStats({
              p10: Math.round(totalTimeMs * 0.75),
              p50: Math.round(totalTimeMs),
              p100: Math.round(totalTimeMs * 1.25),
            })
          }
        }
      } catch (err) {
        console.warn('Metrics fetch error:', err)
      }
    }

    fetchMetrics()
    const interval = setInterval(fetchMetrics, 3000)
    return () => clearInterval(interval)
  }, [totalTimeMs])

  useEffect(() => {
    let interval: any

    if (stage === 'idle') {
      setSimulatedProgress(0)
    } else if (stage === 'listening') {
      setSimulatedProgress(15)
    } else if (stage === 'retrieving') {
      setSimulatedProgress(25)
      interval = setInterval(() => {
        setSimulatedProgress((p) => (p < 60 ? p + 5 : p))
      }, 40)
    } else if (stage === 'generating') {
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

  const totalSegments = 16
  const activeSegments = Math.round((simulatedProgress / 100) * totalSegments)

  return (
    <div className={`pokedex-linear-loader ${stage}`}>
      <div className="loader-header">
        <div className="loader-title">RAG PIPE</div>
        <div className="loader-stage-tag" style={{ color: getStageColor() }}>
          {getStageLabel()}
        </div>
      </div>

      <div className="linear-track">
        <div
          className="linear-fill"
          style={{
            height: `${simulatedProgress}%`,
            backgroundColor: getStageColor(),
            boxShadow: `0 0 12px ${getStageColor()}`,
          }}
        />

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

        {(stage === 'retrieving' || stage === 'generating') && (
          <div className="linear-scan-beam" />
        )}
      </div>

      <div className="loader-telemetry">
        <span className="telemetry-label">
          {stage === 'retrieving' ? 'SCANNING' : stage === 'generating' ? 'GROQ LLM' : stage === 'done' ? 'SYNCED' : 'PROGRESS'}
        </span>
        <span className="telemetry-val">
          {stage === 'retrieving' && retrievalTimeMs
            ? `${retrievalTimeMs}ms`
            : stage === 'generating' && generationTimeMs
            ? `${generationTimeMs}ms`
            : stage === 'done' && totalTimeMs
            ? `${totalTimeMs}ms`
            : `${simulatedProgress}%`}
        </span>
      </div>

      {/* Percentile Stats Block */}
      <div className="pokedex-percentile-stats">
        <div className="stat-line">
          <span className="stat-label">P10</span>
          <span className="stat-val val-green">{stats.p10}ms</span>
        </div>
        <div className="stat-line">
          <span className="stat-label">P50</span>
          <span className="stat-val val-cyan">{stats.p50}ms</span>
        </div>
        <div className="stat-line">
          <span className="stat-label">P100</span>
          <span className="stat-val val-amber">{stats.p100}ms</span>
        </div>
      </div>
    </div>
  )
}
