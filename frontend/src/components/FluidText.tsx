import React, { useEffect, useRef, useMemo, useState } from 'react'

interface FluidTextProps {
  /**
   * The text content to display.
   */
  text: string
  /**
   * Optional class names for the container (controls font-size, weight, color).
   */
  className?: string
  /**
   * The maximum scale factor for the hovered character.
   * @default 2.2
   */
  maxScale?: number
  /**
   * The radius of the distortion effect in pixels.
   * @default 200
   */
  radius?: number
  /**
   * Physics stiffness: 0.1 (Liquid) to 0.9 (Snappy).
   * @default 0.15
   */
  stiffness?: number
  /**
   * Duration of the fade-in animation in milliseconds.
   * @default 700
   */
  fadeDuration?: number
}

export function FluidText({
  text,
  className = '',
  maxScale = 2.2,
  radius = 200,
  stiffness = 0.15,
  fadeDuration = 700,
}: FluidTextProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const spansRef = useRef<(HTMLSpanElement | null)[]>([])

  // Controls visual visibility (Fade in) to prevent FOUT
  const [isReady, setIsReady] = useState(false)

  // Internal high-performance state (No React Rerenders)
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

  // 1. Measurement System
  useEffect(() => {
    if (!containerRef.current) return

    const measure = () => {
      if (!containerRef.current) return

      // Reset transforms temporarily to measure raw unscaled natural widths
      spansRef.current.forEach((span) => {
        if (span) span.style.transform = 'none'
      })

      const widths = spansRef.current
        .filter((s): s is HTMLSpanElement => s !== null)
        .map((s) => s.getBoundingClientRect().width)

      if (widths.length === 0 || widths.every((w) => w === 0)) return

      state.current.charWidths = widths
      state.current.totalNaturalWidth = widths.reduce((sum, w) => sum + w, 0)
      state.current.isMeasured = true

      // Trigger fade-in
      setIsReady(true)
    }

    if (document.fonts?.ready) {
      document.fonts.ready.then(measure)
    } else {
      measure()
    }

    const observer = new ResizeObserver(measure)
    observer.observe(containerRef.current)

    // Re-measure on next tick just in case layout shifted
    const timeout = setTimeout(measure, 60)

    return () => {
      observer.disconnect()
      clearTimeout(timeout)
    }
  }, [text])

  // 2. Physics & Layout Engine
  useEffect(() => {
    let frameId: number

    const loop = () => {
      if (!state.current.isMeasured || !containerRef.current) {
        frameId = requestAnimationFrame(loop)
        return
      }

      const s = state.current

      // --- PHYSICS ---
      // 1. Lerp Position
      const posDelta = s.targetX - s.currentX
      s.currentX += posDelta * stiffness

      // 2. Lerp Intensity
      const intDelta = s.targetIntensity - s.currentIntensity
      s.currentIntensity += intDelta * 0.08

      // --- LAYOUT ---
      let totalDesiredWidth = 0
      const desiredScales: number[] = []

      // Pass 1: Calculate desired scale per character based on Mouse Proximity
      s.charWidths.forEach((w, i) => {
        let offset = 0
        for (let j = 0; j < i; j++) offset += s.charWidths[j]
        const charCenter = offset + w / 2

        const dist = Math.abs(charCenter - s.currentX)

        let desiredScale = 1.0
        if (dist < radius) {
          const normalized = dist / radius
          // Cosine interpolation for organic wave shape
          const curve = Math.cos(normalized * (Math.PI / 2))
          desiredScale = 1 + (maxScale - 1) * curve * s.currentIntensity
        }

        desiredScales[i] = desiredScale
        totalDesiredWidth += w * desiredScale
      })

      // Pass 2: Calculate Normalization Factor (k) so total line width stays constant
      const k =
        totalDesiredWidth === 0 ? 1 : s.totalNaturalWidth / totalDesiredWidth

      // Pass 3: Apply Transforms
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

    // Instant snap on initial cursor entry
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
      className={`satis-fluid-text-root ${className}`}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      aria-label={text}
      style={{
        position: 'relative',
        display: 'inline-block',
        cursor: 'crosshair',
        userSelect: 'none',
        whiteSpace: 'nowrap',
        lineHeight: 1,
      }}
    >
      {/* 
         LAYER 1: Animated Interactive Content
      */}
      <div
        className="satis-fluid-text-animated"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          display: 'block',
          opacity: isReady ? 1 : 0,
          transition: `opacity ${fadeDuration}ms ease-out`,
          pointerEvents: 'none',
          willChange: 'opacity',
        }}
        aria-hidden="true"
      >
        {chars.map((char, i) => (
          <span
            key={i}
            ref={(el) => {
              spansRef.current[i] = el
            }}
            className="satis-fluid-char"
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              display: 'inline-block',
              transformOrigin: '0% 50%',
              textAlign: 'left',
              backfaceVisibility: 'hidden',
              WebkitFontSmoothing: 'antialiased',
              transformStyle: 'preserve-3d',
              willChange: 'transform',
            }}
          >
            {char === ' ' ? '\u00A0' : char}
          </span>
        ))}
      </div>

      {/* 
         LAYER 2: Invisible Clone (Layout Reservation ONLY - completely hidden from view)
      */}
      <span
        className="satis-fluid-text-clone"
        style={{
          display: 'block',
          visibility: 'hidden',
          opacity: 0,
          pointerEvents: 'none',
          userSelect: 'none',
          whiteSpace: 'pre',
          lineHeight: 1,
        }}
        aria-hidden="true"
      >
        {text}
      </span>
    </div>
  )
}
