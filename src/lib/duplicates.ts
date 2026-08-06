import type { PersonId, Transaction } from '../types'

export type MatchStatus = 'new' | 'duplicate' | 'possible'

export interface DuplicateMatch {
  status: MatchStatus
  matchedTransactionId?: string
  matchedMerchant?: string
  reason?: string
}

export interface NearDateDuplicatePair {
  keep: Transaction
  remove: Transaction
}

function normalizeMerchant(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function daysApart(a: string, b: string): number {
  const da = Date.parse(a)
  const db = Date.parse(b)
  if (Number.isNaN(da) || Number.isNaN(db)) return 999
  return Math.abs(da - db) / (1000 * 60 * 60 * 24)
}

export function merchantsSimilar(a: string, b: string): 'strong' | 'weak' | 'none' {
  const na = normalizeMerchant(a)
  const nb = normalizeMerchant(b)
  if (!na || !nb) return 'none'
  if (na === nb) return 'strong'
  // Require a meaningful substring — short tokens like "on" / "ca" / "td"
  // used to match nearly every Canadian merchant as a "duplicate".
  const shorter = na.length <= nb.length ? na : nb
  const longer = na.length <= nb.length ? nb : na
  if (shorter.length >= 5 && longer.includes(shorter)) return 'strong'

  const ta = new Set(na.split(' ').filter((t) => t.length > 2))
  const tb = new Set(nb.split(' ').filter((t) => t.length > 2))
  if (ta.size === 0 || tb.size === 0) return 'none'
  let overlap = 0
  for (const t of ta) {
    if (tb.has(t)) overlap += 1
  }
  const ratio = overlap / Math.min(ta.size, tb.size)
  if (ratio >= 0.6) return 'weak'
  return 'none'
}

function amountsEqual(a: number, b: number): boolean {
  return Math.round(Math.abs(a) * 100) / 100 === Math.round(Math.abs(b) * 100) / 100
}

/** Same person/refund/amount with strong merchant match within ±1 day. */
export function isNearDateDuplicate(
  a: {
    personId: PersonId
    date: string
    amount: number
    merchant: string
    isRefund?: boolean
  },
  b: {
    personId: PersonId
    date: string
    amount: number
    merchant: string
    isRefund?: boolean
  },
): boolean {
  if (a.personId !== b.personId) return false
  if (Boolean(a.isRefund) !== Boolean(b.isRefund)) return false
  if (!amountsEqual(a.amount, b.amount)) return false
  if (merchantsSimilar(a.merchant, b.merchant) !== 'strong') return false
  return daysApart(a.date, b.date) <= 1
}

export function findDuplicateMatch(
  candidate: {
    personId: PersonId
    date: string
    amount: number
    merchant: string
    isRefund: boolean
  },
  existing: Transaction[],
): DuplicateMatch {
  const amount = Math.round(Math.abs(candidate.amount) * 100) / 100
  const pool = existing.filter(
    (t) =>
      t.personId === candidate.personId &&
      Boolean(t.isRefund) === candidate.isRefund &&
      Math.round(Math.abs(t.amount) * 100) / 100 === amount,
  )

  let best: DuplicateMatch = { status: 'new' }

  for (const tx of pool) {
    const sim = merchantsSimilar(candidate.merchant, tx.merchant)
    const gap = daysApart(candidate.date, tx.date)

    if (sim === 'strong' && gap <= 1) {
      return {
        status: 'duplicate',
        matchedTransactionId: tx.id,
        matchedMerchant: tx.merchant,
        reason: `Matches existing “${tx.merchant}” on ${tx.date}`,
      }
    }

    if (
      (sim === 'strong' && gap <= 3) ||
      (sim === 'weak' && gap <= 1) ||
      (sim === 'none' && gap === 0)
    ) {
      best = {
        status: 'possible',
        matchedTransactionId: tx.id,
        matchedMerchant: tx.merchant,
        reason:
          sim === 'none'
            ? `Same date & amount as “${tx.merchant}”`
            : `Possible match of “${tx.merchant}” on ${tx.date}`,
      }
    }
  }

  return best
}

/**
 * Find ±1-day same-merchant/amount pairs already in the ledger.
 * When dates differ, keeps the later date (Amex posting date) and removes
 * the earlier (transaction date). Exact same-day doubles keep the first seen.
 */
export function findNearDateDuplicateRemovals(
  transactions: Transaction[],
): { pairs: NearDateDuplicatePair[]; removeIds: string[] } {
  const sorted = [...transactions].sort((a, b) => {
    const byDate = a.date.localeCompare(b.date)
    if (byDate !== 0) return byDate
    return a.id.localeCompare(b.id)
  })

  const remove = new Set<string>()
  const pairs: NearDateDuplicatePair[] = []

  for (let i = 0; i < sorted.length; i += 1) {
    const a = sorted[i]
    if (remove.has(a.id)) continue
    for (let j = i + 1; j < sorted.length; j += 1) {
      const b = sorted[j]
      if (remove.has(b.id)) continue
      if (daysApart(a.date, b.date) > 1) break
      if (!isNearDateDuplicate(
        {
          personId: a.personId,
          date: a.date,
          amount: a.amount,
          merchant: a.merchant,
          isRefund: a.isRefund,
        },
        {
          personId: b.personId,
          date: b.date,
          amount: b.amount,
          merchant: b.merchant,
          isRefund: b.isRefund,
        },
      )) {
        continue
      }

      // Prefer later date (posting); on a tie keep the earlier-listed row.
      const keep = a.date < b.date ? b : a
      const drop = keep === a ? b : a
      remove.add(drop.id)
      pairs.push({ keep, remove: drop })
    }
  }

  return { pairs, removeIds: [...remove] }
}

/**
 * Coffee / cafe merchants often legitimately repeat the same amount on
 * nearby days. Soft boost: only flag when exactly two charges sit 1 day
 * apart. Other merchants use a 1–3 day window (Amex txn vs post / double import).
 */
const COFFEE_MERCHANT_RE =
  /\b(tim\s*hortons|starbucks|coffee|good\s*earth)\b/

export function isCoffeeLikeMerchant(merchant: string): boolean {
  return COFFEE_MERCHANT_RE.test(normalizeMerchant(merchant))
}

export function wholeDaysApart(a: string, b: string): number {
  return Math.round(daysApart(a, b))
}

export interface PossibleDuplicatePair {
  keep: Transaction
  remove: Transaction
  gapDays: number
  amount: number
  merchant: string
  coffeeLike: boolean
  reason: string
}

function amountKey(amount: number): string {
  return String(Math.round(Math.abs(amount) * 100))
}

function groupKey(tx: Transaction): string {
  return [
    tx.personId,
    Boolean(tx.isRefund) ? '1' : '0',
    normalizeMerchant(tx.merchant),
    amountKey(tx.amount),
  ].join('|')
}

/** True when ≥3 same-key charges fall inside any 14-day window. */
function hasHighFrequencyWindow(sortedByDate: Transaction[]): boolean {
  if (sortedByDate.length < 3) return false
  let left = 0
  for (let right = 0; right < sortedByDate.length; right += 1) {
    while (
      left < right &&
      wholeDaysApart(sortedByDate[left].date, sortedByDate[right].date) > 14
    ) {
      left += 1
    }
    if (right - left + 1 >= 3) return true
  }
  return false
}

/**
 * Smarter possible-duplicate scan for ledger rows already saved.
 *
 * For each (person, refund?, merchantNorm, abs(amount)) group:
 * 1. Sort by date.
 * 2. High-frequency skip — ≥3 in the scoped set, or ≥3 inside any 14-day
 *    window → treat as a recurring pattern (e.g. daily coffee); do not flag.
 * 3. Pair flag — exactly 2 charges whose dates differ by 1–3 days (inclusive)
 *    → possible Amex/statement duplicate. Prefer keeping the later date.
 * 4. Coffee soft boost — merchants matching coffee patterns only flag when
 *    the gap is exactly 1 day; restaurants/other keep the 1–3 day window.
 *
 * Same-day / fuzzy ±1 day doubles remain covered by
 * `findNearDateDuplicateRemovals` / import matching.
 */
export function findPossibleDuplicatePairs(
  transactions: Transaction[],
  options?: {
    monthId?: string
    personId?: PersonId | 'all'
  },
): PossibleDuplicatePair[] {
  const monthId = options?.monthId
  const personId = options?.personId ?? 'all'

  const scoped = transactions.filter((t) => {
    if (monthId && t.monthId !== monthId) return false
    if (personId !== 'all' && t.personId !== personId) return false
    return true
  })

  const groups = new Map<string, Transaction[]>()
  for (const tx of scoped) {
    const key = groupKey(tx)
    const list = groups.get(key)
    if (list) list.push(tx)
    else groups.set(key, [tx])
  }

  const pairs: PossibleDuplicatePair[] = []

  for (const group of groups.values()) {
    if (group.length < 2) continue

    const sorted = [...group].sort((a, b) => {
      const byDate = a.date.localeCompare(b.date)
      if (byDate !== 0) return byDate
      return a.id.localeCompare(b.id)
    })

    // Recurring same amount (coffee etc.) — skip pairwise flagging.
    if (sorted.length >= 3 || hasHighFrequencyWindow(sorted)) continue
    if (sorted.length !== 2) continue

    const earlier = sorted[0]
    const later = sorted[1]
    const gapDays = wholeDaysApart(earlier.date, later.date)
    if (gapDays < 1) continue // same-day → near-date / import dedupe

    const coffeeLike = isCoffeeLikeMerchant(earlier.merchant)
    // Coffee: exactly 1 day. Other merchants: 1–3 days.
    const maxGap = coffeeLike ? 1 : 3
    if (gapDays > maxGap) continue

    pairs.push({
      keep: later,
      remove: earlier,
      gapDays,
      amount: Math.round(Math.abs(later.amount) * 100) / 100,
      merchant: later.merchant || earlier.merchant,
      coffeeLike,
      reason: coffeeLike
        ? `Same coffee-like merchant + amount ${gapDays} day apart (txn vs post?)`
        : `Same merchant + amount ${gapDays} day${gapDays === 1 ? '' : 's'} apart — possible Amex/statement duplicate`,
    })
  }

  pairs.sort((a, b) => {
    const byGap = a.gapDays - b.gapDays
    if (byGap !== 0) return byGap
    return a.keep.date.localeCompare(b.keep.date)
  })

  return pairs
}

export function possibleDuplicatePairKey(pair: PossibleDuplicatePair): string {
  return `${pair.remove.id}::${pair.keep.id}`
}
