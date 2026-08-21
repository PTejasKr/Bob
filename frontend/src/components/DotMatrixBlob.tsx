import React, { useEffect, useRef } from 'react'

interface DotMatrixBlobProps {
  isListening: boolean
  isProcessing: boolean
  onClick: () => void
  disabled?: boolean
}

export const DotMatrixBlob: React.FC<DotMatrixBlobProps> = ({
  isListening,
  isProcessing,
  onClick,
  disabled = false,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const animFrameRef = useRef<number | null>(null)
  const stateRef = useRef({
    transitionProgress: 0,
    time: 0,
  })

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let isSubscribed = true

    const render = () => {
      if (!isSubscribed) return

      const width = canvas.width
      const height = canvas.height
      const cx = width / 2
      const cy = height / 2

      ctx.clearRect(0, 0, width, height)

      const targetTransition = isListening || isProcessing ? 1 : 0
      stateRef.current.transitionProgress += (targetTransition - stateRef.current.transitionProgress) * 0.08
      stateRef.current.time += isListening ? 0.045 : isProcessing ? 0.06 : 0.02

      const progress = stateRef.current.transitionProgress
      const t = stateRef.current.time

      if (progress < 0.98) {
        ctx.save()
        ctx.globalAlpha = 1 - progress

        const glowRad = 48 + Math.sin(t * 2) * 4
        const glowGrad = ctx.createRadialGradient(cx, cy, 10, cx, cy, glowRad)
        glowGrad.addColorStop(0, 'rgba(255, 255, 255, 0.95)')
        glowGrad.addColorStop(0.4, 'rgba(255, 255, 255, 0.65)')
        glowGrad.addColorStop(0.8, 'rgba(240, 245, 255, 0.25)')
        glowGrad.addColorStop(1, 'rgba(255, 255, 255, 0)')

        ctx.fillStyle = glowGrad
        ctx.beginPath()
        ctx.arc(cx, cy, glowRad, 0, Math.PI * 2)
        ctx.fill()

        const points = 7
        const baseR = 30 + Math.sin(t * 1.5) * 3
        ctx.beginPath()

        const coords: { x: number; y: number }[] = []
        for (let i = 0; i < points; i++) {
          const angle = (i / points) * Math.PI * 2
          const wave = Math.sin(t * 2.5 + i * 1.8) * 4 + Math.cos(t * 1.8 + i * 0.9) * 3
          const r = baseR + wave
          coords.push({
            x: cx + Math.cos(angle) * r,
            y: cy + Math.sin(angle) * r,
          })
        }

        ctx.moveTo((coords[0].x + coords[points - 1].x) / 2, (coords[0].y + coords[points - 1].y) / 2)
        for (let i = 0; i < points; i++) {
          const next = coords[(i + 1) % points]
          const curr = coords[i]
          const midX = (curr.x + next.x) / 2
          const midY = (curr.y + next.y) / 2
          ctx.quadraticCurveTo(curr.x, curr.y, midX, midY)
        }
        ctx.closePath()

        ctx.fillStyle = '#ffffff'
        ctx.shadowColor = 'rgba(255, 255, 255, 0.9)'
        ctx.shadowBlur = 16
        ctx.fill()

        ctx.beginPath()
        ctx.arc(cx - 6, cy - 6, 8, 0, Math.PI * 2)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)'
        ctx.fill()

        ctx.restore()
      }

      if (progress > 0.02) {
        ctx.save()
        ctx.globalAlpha = progress

        const matrixGlow = ctx.createRadialGradient(cx, cy, 15, cx, cy, 62)
        matrixGlow.addColorStop(0, 'rgba(255, 255, 255, 0.35)')
        matrixGlow.addColorStop(0.5, 'rgba(100, 200, 255, 0.2)')
        matrixGlow.addColorStop(1, 'rgba(0, 0, 0, 0)')
        ctx.fillStyle = matrixGlow
        ctx.beginPath()
        ctx.arc(cx, cy, 62, 0, Math.PI * 2)
        ctx.fill()

        ctx.fillStyle = '#ffffff'
        ctx.shadowColor = '#00e5ff'
        ctx.shadowBlur = 12
        const coreSize = 6 + Math.sin(t * 4) * 1.5
        ctx.fillRect(cx - coreSize / 2, cy - coreSize / 2, coreSize, coreSize)

        const rings = [
          { radius: 14, count: 8, dotSize: 3.2, speed: 1.2 },
          { radius: 23, count: 12, dotSize: 3.5, speed: -0.9 },
          { radius: 33, count: 16, dotSize: 3.8, speed: 1.5 },
          { radius: 43, count: 20, dotSize: 4.0, speed: -1.1 },
          { radius: 52, count: 24, dotSize: 3.6, speed: 1.8 },
        ]

        rings.forEach((ring, rIdx) => {
          const { radius, count, dotSize, speed } = ring
          const ringRotation = t * speed

          for (let i = 0; i < count; i++) {
            const baseAngle = (i / count) * Math.PI * 2
            const angle = baseAngle + ringRotation

            const wavePhase = Math.sin(t * 3.5 + baseAngle * 4 + rIdx * 1.2)
            const isDotActive = isProcessing 
              ? Math.sin(t * 5 + i * 0.8 + rIdx) > -0.2
              : Math.sin(t * 4 + baseAngle * 3) > -0.4

            const dynamicRadius = radius + (isDotActive ? wavePhase * 2.5 : 0)
            const px = cx + Math.cos(angle) * dynamicRadius
            const py = cy + Math.sin(angle) * dynamicRadius

            const size = isDotActive ? dotSize * 1.2 : dotSize * 0.85

            ctx.save()
            ctx.fillStyle = isDotActive 
              ? '#ffffff' 
              : 'rgba(180, 220, 255, 0.4)'

            if (isDotActive) {
              ctx.shadowColor = isProcessing ? '#00e5ff' : '#ffffff'
              ctx.shadowBlur = 10
            }

            ctx.fillRect(px - size / 2, py - size / 2, size, size)
            ctx.restore()
          }
        })

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)'
        ctx.lineWidth = 1.5
        for (let a = 0; a < 4; a++) {
          const ang = (a * Math.PI) / 2 + t * 0.5
          const x1 = cx + Math.cos(ang) * 56
          const y1 = cy + Math.sin(ang) * 56
          const x2 = cx + Math.cos(ang) * 60
          const y2 = cy + Math.sin(ang) * 60
          ctx.beginPath()
          ctx.moveTo(x1, y1)
          ctx.lineTo(x2, y2)
          ctx.stroke()
        }

        ctx.restore()
      }

      animFrameRef.current = requestAnimationFrame(render)
    }

    render()

    return () => {
      isSubscribed = false
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current)
      }
    }
  }, [isListening, isProcessing])

  return (
    <div 
      className={`dot-matrix-blob-container ${isListening ? 'listening' : ''} ${isProcessing ? 'processing' : ''}`}
      onClick={disabled ? undefined : onClick}
      title={isListening ? 'Listening... Tap to stop' : isProcessing ? 'Bob is thinking...' : 'Tap or press Spacebar to speak'}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          if (!disabled) onClick()
        }
      }}
    >
      <canvas 
        ref={canvasRef} 
        width={130} 
        height={130} 
        className="dot-matrix-canvas"
      />
    </div>
  )
}
