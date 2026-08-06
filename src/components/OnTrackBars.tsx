import { useEffect, useRef, useState } from 'react'
import { formatMoney, type MonthEndSaveLine } from '../lib/compute'
import type { PersonId } from '../types'

type PersonFilter = 'all' | PersonId

function DivergingBar({
  label,
  value,
  maxAbs,
  emphasize,
  muted,
  grown,
  delayMs,
}: {
  label: string
  value: number
  maxAbs: number
  emphasize?: boolean
  muted?: boolean
  grown: boolean
  delayMs: number
}) {
  const pct =
    maxAbs > 0
      ? Math.min(100, Math.round((Math.abs(value) / maxAbs) * 10000) / 100)
      : 0
  const good = value >= 0
  // Whole % avoids subpixel smear against the zero line
  const widthPct = Math.round(pct)

  const fillStyle = {
    width: `${widthPct}%`,
    transform: grown ? 'scaleX(1)' : 'scaleX(0)',
    transitionDelay: grown ? `${delayMs}ms` : '0ms',
  } as const

  return (
    <div
      className={`month-end-divbar${emphasize ? ' emphasize' : ''}${muted ? ' muted' : ''}`}
    >
      <span className="month-end-divbar-label">{label}</span>
      <div
        className="month-end-divbar-track"
        role="img"
        aria-label={`${label} on track to save ${formatMoney(value)}`}
      >
        <div className="month-end-divbar-neg">
          {!good && widthPct > 0 ? (
            <span className="month-end-divbar-fill bad" style={fillStyle} />
          ) : null}
        </div>
        <div className="month-end-divbar-zero" aria-hidden />
        <div className="month-end-divbar-pos">
          {good && widthPct > 0 ? (
            <span className="month-end-divbar-fill good" style={fillStyle} />
          ) : null}
        </div>
      </div>
      <strong className={good ? 'good' : 'bad'}>{formatMoney(value)}</strong>
    </div>
  )
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/** Diverging Kate / Trevor / Both “on track to save” bars. */
export function OnTrackBars({
  lines,
  personFilter = 'all',
  compact = false,
  /** Wait until boot/refresh UI is gone before observing / animating. */
  ready = true,
}: {
  lines: MonthEndSaveLine[]
  personFilter?: PersonFilter
  compact?: boolean
  ready?: boolean
}) {
  const trevor = lines.find((r) => r.id === 'trevor')
  const kate = lines.find((r) => r.id === 'kate')
  const both = lines.find((r) => r.id === 'both')
  const rootRef = useRef<HTMLDivElement>(null)
  const playedRef = useRef(false)
  const [grown, setGrown] = useState(false)

  useEffect(() => {
    if (!ready) return

    const el = rootRef.current
    if (!el) return

    if (prefersReducedMotion()) {
      playedRef.current = true
      setGrown(true)
      return
    }

    if (playedRef.current) {
      setGrown(true)
      return
    }

    const play = () => {
      if (playedRef.current) return
      playedRef.current = true
      // Double rAF so the scaleX(0) paint lands before growing.
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setGrown(true))
      })
    }

    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return
        io.disconnect()
        play()
      },
      { threshold: 0.35, rootMargin: '0px 0px -4% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [ready])

  if (!trevor || !kate || !both) return null

  const maxAbs = Math.max(
    Math.abs(trevor.onTrackToSave),
    Math.abs(kate.onTrackToSave),
    Math.abs(both.onTrackToSave),
    1,
  )

  const rows = [trevor, kate, both] as const

  return (
    <div
      ref={rootRef}
      className={`month-end-divbars${compact ? ' compact' : ''}`}
    >
      {rows.map((row, i) => (
        <DivergingBar
          key={row.id}
          label={row.label}
          value={row.onTrackToSave}
          maxAbs={maxAbs}
          emphasize={
            personFilter === 'all' ||
            personFilter === row.id ||
            row.id === 'both'
          }
          muted={
            personFilter !== 'all' &&
            row.id !== 'both' &&
            row.id !== personFilter
          }
          grown={grown}
          delayMs={i * 70}
        />
      ))}
    </div>
  )
}
