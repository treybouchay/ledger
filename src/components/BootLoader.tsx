import { useEffect, useRef, useState } from 'react'
import { CategoryLineIcon } from '../lib/categoryIcons'
import type { BuiltInCategoryId } from '../types'

/** Visually distinct built-in icons — one picked at random per page load. */
const SPLASH_ICON_IDS: BuiltInCategoryId[] = [
  'groceries',
  'mortgage',
  'coffee',
  'elexicon',
  'restaurants',
  'gas_vehicle',
  'spotify',
  'taxes',
  'gym',
  'internet',
  'home_car_insurance',
  'amazon',
  'take_out',
  'water',
  'entertainment',
  'cellphone',
  'factor',
  'clothes',
]

const BOOT_PHRASES = [
  'Fixing the ledgers…',
  'Starting the calculators…',
  'Balancing the books…',
  'Reconciling statements…',
  'Counting the leftovers…',
  'Sorting the categories…',
  'Waking the budgets…',
  'Tallying the charges…',
  'Checking the accounts…',
  'Smoothing the numbers…',
] as const

/** Soft hold before dismiss (normal motion). */
const MIN_MS = 1600
const MAX_MS = 2400
/** Never stick longer than this, even if ready is delayed. */
const HARD_MAX_MS = 4000
const REDUCED_MS = 700
const PHRASE_INTERVAL_MS = 780
const EXIT_MS = 320

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

function pickRandom<T>(items: readonly T[], exclude?: T): T {
  if (items.length === 1) return items[0]!
  let next = items[Math.floor(Math.random() * items.length)]!
  if (exclude !== undefined && items.length > 1) {
    let guard = 0
    while (next === exclude && guard < 8) {
      next = items[Math.floor(Math.random() * items.length)]!
      guard += 1
    }
  }
  return next
}

function randomBetween(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1))
}

type BootLoaderProps = {
  /** True once initial ledger state has been read (sync bootstrap is fine). */
  ready: boolean
  onDismiss: () => void
}

export function BootLoader({ ready, onDismiss }: BootLoaderProps) {
  const [leaving, setLeaving] = useState(false)
  const [iconId] = useState<BuiltInCategoryId>(() =>
    pickRandom(SPLASH_ICON_IDS),
  )
  const [phrase, setPhrase] = useState(() => pickRandom(BOOT_PHRASES))
  const [phraseKey, setPhraseKey] = useState(0)

  const onDismissRef = useRef(onDismiss)
  onDismissRef.current = onDismiss
  const readyRef = useRef(ready)
  readyRef.current = ready
  const dismissedRef = useRef(false)

  useEffect(() => {
    const reduced = prefersReducedMotion()
    const startedAt = performance.now()
    const minHold = reduced ? REDUCED_MS : randomBetween(MIN_MS, MAX_MS)

    let holdTimer: number | undefined
    let exitTimer: number | undefined
    let pollTimer: number | undefined
    let phraseTimer: number | undefined
    let cancelled = false

    function beginLeave() {
      if (cancelled || dismissedRef.current) return
      dismissedRef.current = true
      if (holdTimer !== undefined) window.clearTimeout(holdTimer)
      if (pollTimer !== undefined) window.clearInterval(pollTimer)
      if (phraseTimer !== undefined) window.clearInterval(phraseTimer)
      setLeaving(true)
      exitTimer = window.setTimeout(() => onDismissRef.current(), EXIT_MS)
    }

    function armHold() {
      if (cancelled || dismissedRef.current || holdTimer !== undefined) return
      if (!readyRef.current) return
      const remaining = Math.max(0, minHold - (performance.now() - startedAt))
      holdTimer = window.setTimeout(beginLeave, remaining)
      if (pollTimer !== undefined) {
        window.clearInterval(pollTimer)
        pollTimer = undefined
      }
    }

    if (!reduced) {
      phraseTimer = window.setInterval(() => {
        setPhrase((prev) => pickRandom(BOOT_PHRASES, prev))
        setPhraseKey((k) => k + 1)
      }, PHRASE_INTERVAL_MS)
    }

    armHold()
    if (!readyRef.current) {
      pollTimer = window.setInterval(armHold, 40)
    }

    const hardMaxTimer = window.setTimeout(beginLeave, HARD_MAX_MS)

    return () => {
      cancelled = true
      if (holdTimer !== undefined) window.clearTimeout(holdTimer)
      if (exitTimer !== undefined) window.clearTimeout(exitTimer)
      if (pollTimer !== undefined) window.clearInterval(pollTimer)
      if (phraseTimer !== undefined) window.clearInterval(phraseTimer)
      window.clearTimeout(hardMaxTimer)
    }
  }, [])

  return (
    <div
      className={`boot-loader${leaving ? ' boot-loader--leaving' : ''}`}
      role="status"
      aria-live="polite"
      aria-busy={!leaving}
      aria-label={phrase}
    >
      <div className="boot-loader__frost" aria-hidden />
      <div className="boot-loader__content">
        <div className="boot-loader__icon-wrap" aria-hidden>
          <span className="boot-loader__icon">
            <CategoryLineIcon categoryId={iconId} size={36} />
          </span>
        </div>
        <p key={phraseKey} className="boot-loader__phrase">
          {phrase}
        </p>
      </div>
    </div>
  )
}
