import type { AccountId, CategoryId } from '../types'
import { suggestCategory } from './parseCsv'

/** Shared shape for CSV and PDF statement rows. */
export interface ParsedStatementRow {
  date: string
  amount: number
  merchant: string
  suggestedCategoryId: CategoryId
  suggestedAccountId: AccountId
  isRefund?: boolean
  /** Incoming transfer/payroll — show in review but unchecked by default. */
  likelyDeposit?: boolean
}

const MONTH =
  'Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec'

const WEEKDAY =
  'Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday'

const WEEKDAY_PATTERN = new RegExp(`\\b(?:${WEEKDAY})\\b`, 'gi')

const DATE_PATTERNS = [
  /\b(\d{4}-\d{2}-\d{2})\b/,
  /\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/,
  /\b(\d{1,2}-\d{1,2}-\d{2,4})\b/,
  // TD app: "Tuesday August 4, 2026"
  new RegExp(
    `\\b((?:${WEEKDAY})\\s+(?:${MONTH})[a-z]*\\s+\\d{1,2},?\\s+\\d{2,4})\\b`,
    'i',
  ),
  /\b((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{2,4})\b/i,
  /\b(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{2,4})\b/i,
  // Bank apps / screenshots often omit the year ("Aug 5" or Amex "3 Aug").
  new RegExp(`\\b((?:${MONTH})[a-z]*\\.?\\s+\\d{1,2})\\b`, 'i'),
  new RegExp(`\\b(\\d{1,2}\\s+(?:${MONTH})[a-z]*\\.?)\\b`, 'i'),
  /\b(today|yesterday)\b/i,
]

const AMOUNT_PATTERN =
  /(?:CAD\s*)?(-?\$?\s*\d{1,3}(?:,\d{3})*(?:\.\d{2})|-?\d+\.\d{2})(?:\s*CR)?\b/g

/** True when the whole line is just a date heading (Amex / TD app section headers). */
export function isDateOnlyLine(line: string): boolean {
  const trimmed = line.replace(/\s+/g, ' ').trim()
  if (!trimmed || trimmed.length > 48) return false
  if (!extractDate(trimmed)) return false
  let rest = trimmed
  for (const pattern of DATE_PATTERNS) {
    rest = rest.replace(pattern, ' ')
  }
  rest = rest
    .replace(WEEKDAY_PATTERN, ' ')
    .replace(/[,.\-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return rest.length === 0
}

export function extractDate(line: string): string | null {
  for (const pattern of DATE_PATTERNS) {
    const m = line.match(pattern)
    if (m?.[1]) return m[1]
  }
  return null
}

export function normalizeStatementDate(raw: string): string {
  return normalizeDate(raw)
}

export function pickStatementAmount(amounts: number[]): number | null {
  return pickAmount(amounts)
}

/** Remove weekday / leftover date chrome from a merchant string. */
export function cleanMerchantName(raw: string): string {
  return raw
    .replace(WEEKDAY_PATTERN, ' ')
    .replace(/\b(CAD|USD|CR|DR)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export { AMOUNT_PATTERN, DATE_PATTERNS, WEEKDAY_PATTERN }

export function parseStatementText(text: string): ParsedStatementRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 4)

  const rows: ParsedStatementRow[] = []

  for (const line of lines) {
    if (/^(date|description|amount|balance|transaction)/i.test(line)) continue
    if (/page\s+\d+/i.test(line)) continue
    if (isDateOnlyLine(line)) continue

    const date = extractDate(line)
    const amounts = [...line.matchAll(AMOUNT_PATTERN)].map((m) =>
      Number(m[1].replace(/[$,\s]/g, '')),
    )
    if (!date || amounts.length === 0) continue

    // Prefer the last money-looking token that isn't a huge balance-like outlier
    // when multiple amounts appear; still keep reasonable purchases.
    const amount = pickAmount(amounts)
    if (!amount || amount === 0) continue

    // Multi-amount lines from screenshot window joins are ambiguous — skip.
    if (amounts.filter((n) => Math.abs(n) > 0 && Math.abs(n) < 50000).length > 1) {
      continue
    }

    let merchant = line
    for (const pattern of DATE_PATTERNS) {
      merchant = merchant.replace(pattern, ' ')
    }
    merchant = cleanMerchantName(
      merchant.replace(AMOUNT_PATTERN, ' '),
    )

    if (merchant.length < 2) continue
    if (/^(opening|closing|total|subtotal|balance)/i.test(merchant)) continue

    const looksLikeRefund =
      amount < 0 || /refund|return|rebate|credit|payment\s+thank/i.test(merchant)

    rows.push({
      date: normalizeDate(date),
      amount,
      merchant,
      suggestedCategoryId: suggestCategory(merchant),
      suggestedAccountId: 'other',
      isRefund: looksLikeRefund,
    })
  }

  return dedupeParsed(rows)
}

function pickAmount(amounts: number[]): number | null {
  const usable = amounts.filter((n) => Math.abs(n) > 0 && Math.abs(n) < 50000)
  if (usable.length === 0) return null
  return usable[usable.length - 1]
}

function normalizeDate(raw: string): string {
  const trimmed = raw.trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10)

  if (/^today$/i.test(trimmed)) return localYmd(new Date())
  if (/^yesterday$/i.test(trimmed)) {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    return localYmd(d)
  }

  const mdy = trimmed.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/)
  if (mdy) {
    const mm = Number(mdy[1])
    const dd = Number(mdy[2])
    const yyyy = Number(mdy[3])
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      return `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
    }
  }

  // "Aug 5" / "Aug. 5"
  const monDay = trimmed.match(
    new RegExp(`^(${MONTH})[a-z]*\\.?\\s+(\\d{1,2})$`, 'i'),
  )
  if (monDay) {
    return resolveMonthDay(monDay[1], Number(monDay[2]))
  }

  // Amex app: "3 Aug" / "3 Aug."
  const dayMon = trimmed.match(
    new RegExp(`^(\\d{1,2})\\s+(${MONTH})[a-z]*\\.?$`, 'i'),
  )
  if (dayMon) {
    return resolveMonthDay(dayMon[2], Number(dayMon[1]))
  }

  const d = new Date(trimmed)
  if (!Number.isNaN(d.getTime())) {
    return localYmd(d)
  }
  return trimmed
}

/** Month + day without year — current year, or prior if far in the future. */
function resolveMonthDay(monthName: string, day: number): string {
  const now = new Date()
  let year = now.getFullYear()
  let d = new Date(`${monthName} ${day}, ${year}`)
  if (Number.isNaN(d.getTime())) return `${monthName} ${day}`
  const daysAhead = (d.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)
  if (daysAhead > 45) {
    year -= 1
    d = new Date(`${monthName} ${day}, ${year}`)
  }
  return Number.isNaN(d.getTime()) ? `${monthName} ${day}` : localYmd(d)
}

function localYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function dedupeParsed(rows: ParsedStatementRow[]): ParsedStatementRow[] {
  const seen = new Set<string>()
  const out: ParsedStatementRow[] = []
  for (const row of rows) {
    const key = `${row.date}|${row.amount}|${row.merchant.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(row)
  }
  return out
}
