import React, { useEffect, useRef, useMemo, useState } from 'react'

interface FluidTextProps {
  text: string
  className?: string
  maxScale?: number
  radius?: number
  stiffness?: number
  fadeDuration?: number
}

export const FluidText: React.FC<FluidTextProps> = ({
  text,
  className = '',
  maxScale = 2.4,
  radius = 180,
  stiffness = 0.18,
  fadeDuration = 600,
}) => {
  const containerRef = useRef<HTMLDivElement>(null)
  const spansRef = useRef<(HTMLSpanElement | null)[]>([])
  const [isReady, setIsReady] = useState(false)

  const state = useRef({
    charWidths: [] as number[],
    totalNaturalWidth: 0,
    isMeasured: false,
    targetX: -9999,
    currentX: -9999,
    targetIntensity: 0,
    currentIntensity: 0,
  })

  const chars = useMemo(() => text.split(''), [text])

  useEffect(() => {
    if (!containerRef.current) return

    const measure = () => {
      if (!containerRef.current) return

      spansRef.current.forEach((span) => {
        if (span) span.style.transform = 'none'
      })

      const widths = spansRef.current
        .filter((s): s is HTMLSpanElement => s !== null)
        .map((s) => s.getBoundingClientRect().width)

      if (widths.length === 0) return

      state.current.charWidths = widths
      state.current.totalNaturalWidth = widths.reduce((sum, w) => sum + w, 0)
      state.current.isMeasured = true
      setIsReady(true)
    }

    if (document.fonts?.ready) {
      document.fonts.ready.then(measure)
    } else {
      measure()
    }

    const observer = new ResizeObserver(measure)
    observer.observe(containerRef.current)

    return () => observer.disconnect()
  }, [text])

  useEffect(() => {
    let frameId: number

    const loop = () => {
      if (!state.current.isMeasured || !containerRef.current) {
        frameId = requestAnimationFrame(loop)
        return
      }

      const s = state.current

      const posDelta = s.targetX - s.currentX
      s.currentX += posDelta * stiffness

      const intDelta = s.targetIntensity - s.currentIntensity
      s.currentIntensity += intDelta * 0.08

      let totalDesiredWidth = 0
      const desiredScales: number[] = []

      s.charWidths.forEach((w, i) => {
        let offset = 0
        for (let j = 0; j < i; j++) offset += s.charWidths[j]
        const charCenter = offset + w / 2

        const dist = Math.abs(charCenter - s.currentX)

        let desiredScale = 1.0
        if (dist < radius) {
          const normalized = dist / radius
          const curve = Math.cos(normalized * (Math.PI / 2))
          desiredScale = 1 + (maxScale - 1) * curve * s.currentIntensity
        }

        desiredScales[i] = desiredScale
        totalDesiredWidth += w * desiredScale
      })

      const k = totalDesiredWidth === 0 ? 1 : s.totalNaturalWidth / totalDesiredWidth

      let currentLayoutX = 0
      spansRef.current.forEach((span, i) => {
        if (!span) return
        const w = s.charWidths[i]
        const finalScale = desiredScales[i] * k

        span.style.transform = `translate3d(${currentLayoutX.toFixed(2)}px, 0, 0) scaleX(${finalScale.toFixed(3)})`
        currentLayoutX += w * finalScale
      })

      frameId = requestAnimationFrame(loop)
    }

    loop()
    return () => cancelAnimationFrame(frameId)
  }, [maxScale, radius, stiffness])

  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    state.current.targetX = e.clientX - rect.left

    if (state.current.targetIntensity === 0) {
      state.current.currentX = e.clientX - rect.left
    }
    state.current.targetIntensity = 1
  }

  const onMouseLeave = () => {
    state.current.targetIntensity = 0
  }

  return (
    <div
      ref={containerRef}
      className={`fluid-text-container ${className}`}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      aria-label={text}
    >
      <div
        className={`fluid-text-animated ${isReady ? 'opacity-100' : 'opacity-0'}`}
        style={{ transition: `opacity ${fadeDuration}ms ease-out` }}
        aria-hidden="true"
      >
        {chars.map((char, i) => (
          <span
            key={i}
            ref={(el) => {
              spansRef.current[i] = el
            }}
            className="fluid-text-char"
          >
            {char === ' ' ? '\u00A0' : char}
          </span>
        ))}
      </div>

      <span className="fluid-text-placeholder" aria-hidden="true">
        {text}
      </span>
    </div>
  )
}
