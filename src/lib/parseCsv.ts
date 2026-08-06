import type { AccountId, CategorizationRule, CategoryId } from '../types'
import { allCategorizationRules } from './learnedRules'

export interface ParsedCsvRow {
  date: string
  /** Signed amount when the statement shows credits as negative. */
  amount: number
  merchant: string
  suggestedCategoryId: CategoryId
  suggestedAccountId: AccountId
  isRefund?: boolean
}

export function suggestCategory(
  merchant: string,
  rules: CategorizationRule[] = allCategorizationRules(),
): CategoryId {
  const hay = merchant.toLowerCase()
  for (const rule of rules) {
    if (hay.includes(rule.pattern.toLowerCase())) {
      return rule.categoryId
    }
  }
  return 'other'
}

export function parseStatementCsv(text: string): ParsedCsvRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
  if (lines.length === 0) return []

  const header = lines[0].toLowerCase()
  const hasHeader =
    header.includes('date') ||
    header.includes('description') ||
    header.includes('amount') ||
    header.includes('merchant')

  const dataLines = hasHeader ? lines.slice(1) : lines
  const rows: ParsedCsvRow[] = []

  for (const line of dataLines) {
    const parts = splitCsvLine(line)
    if (parts.length < 3) continue

    // Flexible: Date, Description/Merchant, Amount  OR  Date, Amount, Description
    let date = parts[0]
    let merchant = parts[1]
    let amountRaw = parts[2]

    if (!isLikelyAmount(amountRaw) && isLikelyAmount(parts[1])) {
      amountRaw = parts[1]
      merchant = parts.slice(2).join(' ')
    } else if (parts.length > 3 && !isLikelyAmount(amountRaw)) {
      amountRaw = parts[parts.length - 1]
      merchant = parts.slice(1, -1).join(' ')
    }

    const cleaned = String(amountRaw).replace(/[$,\s]/g, '')
    const amount = Number(cleaned)
    if (!date || !merchant || Number.isNaN(amount) || amount === 0) continue

    const merchantClean = merchant.trim()
    const looksLikeRefund =
      amount < 0 || /refund|return|rebate|credit/i.test(merchantClean)

    rows.push({
      date: normalizeDate(date),
      amount,
      merchant: merchantClean,
      suggestedCategoryId: suggestCategory(merchantClean),
      suggestedAccountId: 'other',
      isRefund: looksLikeRefund,
    })
  }

  return rows
}

function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (const ch of line) {
    if (ch === '"') {
      inQuotes = !inQuotes
      continue
    }
    if (ch === ',' && !inQuotes) {
      out.push(cur.trim())
      cur = ''
      continue
    }
    cur += ch
  }
  out.push(cur.trim())
  return out
}

function isLikelyAmount(v: string): boolean {
  return /^-?\$?\d[\d,]*\.?\d*$/.test(v.trim().replace(/\s/g, ''))
}

function normalizeDate(raw: string): string {
  const trimmed = raw.trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(trimmed)) return trimmed.slice(0, 10)

  const mdy = trimmed.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/)
  if (mdy) {
    const mm = Number(mdy[1])
    const dd = Number(mdy[2])
    const yyyy = Number(mdy[3])
    if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      return `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
    }
  }

  const d = new Date(trimmed)
  if (!Number.isNaN(d.getTime())) {
    // Local Y-M-D — avoid UTC shift from toISOString().
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  }
  return trimmed
}
