import {
  AMOUNT_PATTERN,
  DATE_PATTERNS,
  cleanMerchantName,
  extractDate,
  isDateOnlyLine,
  normalizeStatementDate,
  parseStatementText,
  pickStatementAmount,
  type ParsedStatementRow,
} from './parseStatementText'
import { suggestCategory } from './parseCsv'
import { suggestTdAccount } from './parseTd'
import type { AccountId } from '../types'

const SKIP_LINE =
  /^(congratulations|pre-approved|overview|membership|offers|account|pay\s*&\s*transfer|terms apply|search|activity|posted|account details|td first class|visa infinite|travel visa|chequing|savings)\b/i

/** Amex puts city / phone under the merchant — never a payee by itself. */
const PHONE_LIKE =
  /^[\d\s()./+-]{7,}$|^\+?\d[\d\s().-]{6,}\d$|^\d{3}[-.\s]?\d{3}[-.\s]?\d{4}$/

/** North American phone anywhere in a line (Amex subtitle). */
const PHONE_IN_TEXT =
  /\b(?:\+?1[-.\s]*)?(?:\(?\d{3}\)?[-.\s]*)\d{3}[-.\s]*\d{4}\b/g

/**
 * Bank app screenshots (Amex / TD) put dates on section headers and
 * merchant + amount on the rows below. Carry the date forward.
 */
export function parseScreenshotText(text: string): ParsedStatementRow[] {
  const scrubbed = scrubPhoneAmountOcr(text)
  const fromSections = parseSectionedActivity(scrubbed)

  // Sectioned parse is authoritative when it finds charges. Aggressive
  // window joins were inventing "Tuesday FAE HEALING" and wrong payees.
  const extras =
    fromSections.length > 0
      ? []
      : [
          ...parseStatementText(scrubbed).filter((row) =>
            isPlausibleMerchant(row.merchant),
          ),
          ...parseDateHeaderPairs(scrubbed),
        ]

  const accountHint = suggestScreenshotAccount(text)
  return collapseNearDuplicateCharges(
    preferBestMerchant(
      dedupeParsed(
        [...fromSections, ...extras].map((row) => ({
          ...row,
          suggestedAccountId:
            row.suggestedAccountId === 'other' || !row.suggestedAccountId
              ? accountHint
              : row.suggestedAccountId,
        })),
      ),
    ),
  )
}

function suggestScreenshotAccount(text: string): AccountId {
  if (looksLikeAmexApp(text)) return 'amex'
  if (/td\b|first\s*class|visa\s*infinite|chequing|cashback/i.test(text)) {
    return suggestTdAccount(text)
  }
  return 'other'
}

/** Store / location codes on TD & Amex (“#84958”) — strip before reading amounts. */
const STORE_NUM = /#\s*\d{3,}\b/g

/** True when this line is only the Amex/TD “Pending” status badge. */
function isPendingStatusOnly(line: string): boolean {
  return /^pending\.?$/i.test(line.replace(/\s+/g, ' ').trim())
}

/**
 * Pending charges sit under the amount (or on the same row). Skip them —
 * they are not posted yet and often OCR worse than settled rows.
 *
 * Look forward for a Pending badge, and only look one line back when that
 * Pending sits between a merchant name and this amount — never steal the
 * previous charge’s Pending (that was skipping SidelineSwap after McDonalds).
 */
function chargeLooksPending(lines: string[], amountIndex: number): boolean {
  const line = lines[amountIndex] ?? ''
  if (/\bpending\b/i.test(line)) return true

  for (let j = amountIndex + 1; j < Math.min(lines.length, amountIndex + 3); j += 1) {
    const next = lines[j]
    if (isPendingStatusOnly(next)) return true
    if (isDateOnlyLine(next) || lineHasAmount(next)) break
    if (isPlausibleMerchant(stripToMerchant(next))) break
  }

  if (amountIndex > 0 && isPendingStatusOnly(lines[amountIndex - 1])) {
    const above = amountIndex >= 2 ? lines[amountIndex - 2] : ''
    // Previous charge ended with amount then Pending — not this row.
    if (above && lineHasAmount(above)) return false
    return true
  }

  return false
}

/**
 * OCR often reads `$` as `5` (`$16.77` → `516.77`, `$2.00` → `52.00`).
 * Only rewrite bare amounts (no `$` on the token); keep real `$52` / `$516`.
 */
export function stripDollarMisreadAsFive(
  amountStr: string,
  hadExplicitDollar: boolean,
): string {
  if (hadExplicitDollar) return amountStr
  const raw = amountStr.replace(/,/g, '').trim()
  // $16.77 → 516.77 (three digits before the decimal)
  if (/^5\d{2}\.\d{2}$/.test(raw)) {
    const rest = raw.slice(1)
    const n = Number(rest)
    if (n >= 1 && n < 100) return rest
  }
  // $2.00 → 52.00 (single-digit dollars only — avoids nuking real $52)
  if (/^5\d\.\d{2}$/.test(raw)) {
    const rest = raw.slice(1)
    const n = Number(rest)
    if (n > 0 && n < 10) return rest
  }
  return amountStr
}

/**
 * Fix Amex OCR: area-code digit merges into the dollar amount
 * (`403-262-4255 $337.31` → `$37.31`).
 * Also fix store-# merges (`#84958 $4.80` OCR’d as `$54.80`).
 * Also fix `$` misread as `5` (`516.77` → `16.77`).
 */
export function scrubPhoneAmountOcr(text: string): string {
  const lines = text.replace(/\u00a0/g, ' ').split(/\r?\n/)
  return lines
    .map((line, i) => {
      const neighbors = [lines[i - 1], line, lines[i + 1]]
        .filter(Boolean)
        .join(' ')
      return repairAmountsOnLine(line, neighbors)
    })
    .join('\n')
}

function repairAmountsOnLine(line: string, context: string): string {
  let next = line

  // OCR `$` → `S` then digits: S16.77 → $16.77
  next = next.replace(/(^|[\s])S(\d{1,3}\.\d{2})\b/g, '$1$$$2')

  // Bare amount with leading 5 from `$` (`516.77` / `52.00`) when line has no $.
  if (!/\$/.test(next)) {
    next = next.replace(
      /(^|[^\d.])(5\d{1,2}\.\d{2})\b/g,
      (full, lead: string, amount: string) => {
        const fixed = stripDollarMisreadAsFive(amount, false)
        return fixed === amount ? full : `${lead}${fixed}`
      },
    )
  }

  // Glued store# + amount: #849584.80 → #84958 4.80
  next = next.replace(/(#\s*\d{3,})(\d\.\d{1,2})\b/g, '$1 $2')

  // Store # then amount — drop a digit stolen from the store number (#84958 + 4.80 → 54.80).
  next = next.replace(
    /#(\d{3,})\s*(\$?\s*)(\d{1,3}\.\d{1,2})\b/g,
    (_full, store: string, dollar: string, amount: string) => {
      const fixed = stripStoreContaminatingDigit(store, amount)
      return `#${store} ${dollar}${fixed}`.replace(/\s+/g, ' ').trim()
    },
  )

  next = next.replace(
    /(\d{3}[-.\s]?\d{3}[-.\s]?\d{4})(\d\.\d{2})\b/g,
    '$1 $2',
  )

  next = next.replace(
    /(\d{3})([-.\s]?\d{3}[-.\s]?\d{4})\s*(\$?\s*)(\d{3}\.\d{2})\b/g,
    (_full, area: string, rest: string, dollar: string, amount: string) => {
      const fixed = stripContaminatingDigit(area, amount)
      return `${area}${rest} ${dollar}${fixed}`.replace(/\s+/g, ' ').trim()
    },
  )

  PHONE_IN_TEXT.lastIndex = 0
  const contextHasPhone = PHONE_IN_TEXT.test(context)
  PHONE_IN_TEXT.lastIndex = 0
  const lineHasPhone = PHONE_IN_TEXT.test(line)
  PHONE_IN_TEXT.lastIndex = 0

  if (contextHasPhone && !lineHasPhone) {
    next = next.replace(
      /(\$?\s*)(\d{3}\.\d{2})\b/g,
      (full, dollar: string, amount: string) => {
        const phones = context.match(PHONE_IN_TEXT)
        PHONE_IN_TEXT.lastIndex = 0
        if (!phones?.length) return full
        const area = phones[0].replace(/\D/g, '').slice(0, 3)
        if (area.length < 3) return full
        const fixed = stripContaminatingDigit(area, amount)
        return `${dollar}${fixed}`
      },
    )
  }

  return next
}

function stripContaminatingDigit(areaCode: string, amount: string): string {
  const areaDigits = areaCode.replace(/\D/g, '')
  if (areaDigits.length < 3) return amount
  const areaLast = areaDigits[2]
  if (!amount.startsWith(areaLast)) return amount
  const rest = amount.slice(1)
  if (!/^\d{1,2}\.\d{1,2}$/.test(rest)) return amount
  const n = Number(rest)
  if (n < 1 || n >= 100) return amount
  return rest
}

/** #84958 + OCR “54.80” → “4.80” when a store digit prefixed the price. */
function stripStoreContaminatingDigit(store: string, amount: string): string {
  if (!/^\d{2,3}\.\d{1,2}$/.test(amount)) return amount
  const digits = store.replace(/\D/g, '')
  // Last digit of store glued: 8 + 4.80 → 84.80
  if (digits.endsWith(amount[0])) {
    const rest = amount.slice(1)
    if (/^\d{0,2}\.\d{1,2}$/.test(rest) && Number(rest) > 0 && Number(rest) < 100) {
      return rest.startsWith('.') ? amount : rest
    }
  }
  // Second-to-last glued: 84958 → 5 + 4.80 → 54.80
  if (digits.length >= 2 && digits[digits.length - 2] === amount[0]) {
    const rest = amount.slice(1)
    if (/^\d{0,2}\.\d{1,2}$/.test(rest) && Number(rest) > 0 && Number(rest) < 100) {
      return rest.startsWith('.') ? amount : rest
    }
  }
  return amount
}

function stripPhones(line: string): string {
  PHONE_IN_TEXT.lastIndex = 0
  return line.replace(PHONE_IN_TEXT, ' ').replace(/\s+/g, ' ').trim()
}

function stripStoreNumbers(line: string): string {
  return line.replace(STORE_NUM, ' ').replace(/\s+/g, ' ').trim()
}

function looksLikeAmexApp(text: string): boolean {
  return /simplycash|american\s*express|\bamex\b|membership\s*rewards/i.test(
    text,
  )
}

function isPlausibleMerchant(merchant: string): boolean {
  const m = cleanMerchantName(
    stripStoreNumbers(stripPhones(merchant.replace(/\s+/g, ' ').trim())),
  )
  if (m.length < 2) return false
  if (PHONE_LIKE.test(m)) return false
  if (!/[a-z]/i.test(m)) return false
  if (/^(opening|closing|total|subtotal|balance)$/i.test(m)) return false
  return true
}

function amountsOnLine(line: string): number[] {
  const cleaned = stripStoreNumbers(stripPhones(line))
  const dollar = [
    ...cleaned.matchAll(/\$\s*(\d{1,3}(?:,\d{3})*\.\d{1,2})\b/g),
  ].map((m) => {
    const raw = m[1].replace(/,/g, '')
    return Number(Number(raw).toFixed(2))
  })
  const bare = [...cleaned.matchAll(AMOUNT_PATTERN)]
    .filter((m) => !m[0].includes('$'))
    .map((m) => {
      const raw = stripDollarMisreadAsFive(m[1].replace(/[$,\s]/g, ''), false)
      return Number(Number(raw).toFixed(2))
    })
  const found = dollar.length > 0 ? dollar : bare
  return [...new Set(found.filter((n) => n !== 0 && Math.abs(n) < 50000))]
}

function lineHasAmount(line: string): boolean {
  return amountsOnLine(line).length > 0
}

function stripToMerchant(line: string): string {
  let merchant = stripStoreNumbers(stripPhones(line))
  for (const pattern of DATE_PATTERNS) {
    merchant = merchant.replace(pattern, ' ')
  }
  return cleanMerchantName(
    merchant
      .replace(AMOUNT_PATTERN, ' ')
      .replace(/\$\s*\d{1,3}(?:,\d{3})*\.\d{1,2}\b/g, ' '),
  )
}

function amountFromLine(line: string, context: string): number | null {
  const cleaned = stripStoreNumbers(stripPhones(line))
  const dollar = [
    ...cleaned.matchAll(/\$\s*(\d{1,3}(?:,\d{3})*\.\d{1,2})\b/g),
  ].map((m) => Number(Number(m[1].replace(/,/g, '')).toFixed(2)))
  const any = amountsOnLine(line)
  let amount = pickStatementAmount(dollar.length > 0 ? dollar : any)
  if (!amount) return null

  // Bare OCR amount: `$` often becomes a leading `5`.
  if (dollar.length === 0) {
    const fixed = stripDollarMisreadAsFive(Math.abs(amount).toFixed(2), false)
    if (fixed !== Math.abs(amount).toFixed(2)) {
      amount = amount < 0 ? -Number(fixed) : Number(fixed)
    }
  }

  // Repair store-# contamination using digits still visible on the raw line.
  const store = line.match(/#\s*(\d{3,})\b/)
  if (store) {
    const fixed = stripStoreContaminatingDigit(store[1], Math.abs(amount).toFixed(2))
    if (fixed !== Math.abs(amount).toFixed(2)) {
      amount = amount < 0 ? -Number(fixed) : Number(fixed)
    }
  }

  const abs = Math.abs(amount)
  const asStr = abs.toFixed(2)
  PHONE_IN_TEXT.lastIndex = 0
  if (abs >= 100 && abs < 1000 && PHONE_IN_TEXT.test(context)) {
    PHONE_IN_TEXT.lastIndex = 0
    const phones = context.match(PHONE_IN_TEXT) ?? []
    PHONE_IN_TEXT.lastIndex = 0
    for (const phone of phones) {
      const area = phone.replace(/\D/g, '').slice(0, 3)
      const fixed = stripContaminatingDigit(area, asStr)
      if (fixed !== asStr) {
        const n = Number(fixed)
        return amount < 0 ? -n : n
      }
    }
  }
  return amount
}

function resolveMerchant(
  onLine: string,
  pending: string | null,
): string | null {
  const a = isPlausibleMerchant(onLine) ? onLine : null
  const b = pending && isPlausibleMerchant(pending) ? pending : null
  if (a && b) {
    // OCR split "DOCUPET PET" / "LICENSING $33.55" — join continuation.
    if (
      a.split(/\s+/).length <= 2 &&
      !b.toLowerCase().includes(a.toLowerCase()) &&
      !a.toLowerCase().includes(b.toLowerCase())
    ) {
      return `${b} ${a}`
    }
    return a
  }
  return a ?? b
}

function parseSectionedActivity(text: string): ParsedStatementRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 0)

  let currentDate: string | null = null
  let pendingMerchant: string | null = null
  const rows: ParsedStatementRow[] = []

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (SKIP_LINE.test(line)) continue
    if (isPendingStatusOnly(line)) continue
    if (/page\s+\d+/i.test(line)) continue

    if (isDateOnlyLine(line)) {
      currentDate = normalizeStatementDate(extractDate(line)!)
      pendingMerchant = null
      continue
    }

    const context = [lines[i - 1], line, lines[i + 1]].filter(Boolean).join(' ')
    const distinctAmounts = amountsOnLine(line)
    const amount = amountFromLine(line, context)
    const merchantOnLine = stripToMerchant(line)

    if (!amount) {
      if (isPlausibleMerchant(merchantOnLine)) {
        pendingMerchant = merchantOnLine
      }
      continue
    }

    // Do not import Pending auth holds — only posted activity.
    if (chargeLooksPending(lines, i)) {
      pendingMerchant = null
      continue
    }

    if (distinctAmounts.length > 1) {
      pendingMerchant = null
      continue
    }

    const inlineDate = extractDate(line)
    const date = inlineDate
      ? normalizeStatementDate(inlineDate)
      : currentDate
    if (!date) {
      pendingMerchant = null
      continue
    }

    let merchant = resolveMerchant(merchantOnLine, pendingMerchant)

    if (!isPlausibleMerchant(merchant ?? '')) {
      merchant = findMerchantAbove(lines, i)
    }

    pendingMerchant = null

    if (!merchant || !isPlausibleMerchant(merchant)) continue

    const looksLikeRefund =
      amount < 0 || /refund|return|rebate|credit|payment\s+thank/i.test(merchant)

    rows.push({
      date,
      amount: Math.abs(amount),
      merchant,
      suggestedCategoryId: suggestCategory(merchant),
      suggestedAccountId: 'other',
      isRefund: looksLikeRefund || amount < 0,
    })
  }

  return rows
}

/** Walk up past store # / city subtitles to the real payee name. */
function findMerchantAbove(lines: string[], index: number): string | null {
  for (let j = index - 1; j >= Math.max(0, index - 4); j -= 1) {
    const prev = lines[j]
    if (isDateOnlyLine(prev)) break
    if (SKIP_LINE.test(prev) || isPendingStatusOnly(prev)) break
    if (lineHasAmount(prev)) break
    const m = stripToMerchant(prev)
    if (isPlausibleMerchant(m)) return m
  }
  return null
}

/** Fallback: join a date header with the single following charge line only. */
function parseDateHeaderPairs(text: string): ParsedStatementRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 0)

  const rows: ParsedStatementRow[] = []
  for (let i = 0; i < lines.length - 1; i += 1) {
    if (!isDateOnlyLine(lines[i])) continue
    const next = lines[i + 1]
    if (!lineHasAmount(next) || isDateOnlyLine(next)) continue
    const chunk = `${lines[i]} ${next}`
    for (const row of parseStatementText(chunk)) {
      if (isPlausibleMerchant(row.merchant)) rows.push(row)
    }
  }
  return rows
}

function dedupeParsed(rows: ParsedStatementRow[]): ParsedStatementRow[] {
  const seen = new Set<string>()
  const out: ParsedStatementRow[] = []
  for (const row of rows) {
    if (!isPlausibleMerchant(row.merchant)) continue
    const key = `${row.date}|${row.amount}|${row.merchant.toLowerCase()}`
    if (seen.has(key)) continue
    seen.add(key)
    const accountId: AccountId = row.suggestedAccountId ?? 'other'
    out.push({
      ...row,
      suggestedAccountId: accountId,
      suggestedCategoryId:
        row.suggestedCategoryId || suggestCategory(row.merchant),
    })
  }
  return out
}

function preferBestMerchant(rows: ParsedStatementRow[]): ParsedStatementRow[] {
  const byDateAmount = new Map<string, ParsedStatementRow[]>()
  for (const row of rows) {
    const key = `${row.date}|${roundMoney(row.amount)}`
    const list = byDateAmount.get(key) ?? []
    list.push(row)
    byDateAmount.set(key, list)
  }

  const out: ParsedStatementRow[] = []
  const used = new Set<string>()

  for (const row of rows) {
    const siblings =
      byDateAmount.get(`${row.date}|${roundMoney(row.amount)}`) ?? [row]
    const best = siblings.reduce((a, b) =>
      merchantScore(b) > merchantScore(a) ? b : a,
    )
    const bestKey = `${best.date}|${roundMoney(best.amount)}|${best.merchant.toLowerCase()}`
    if (used.has(bestKey)) continue
    used.add(bestKey)
    out.push(best)
  }

  return out
}

/**
 * OCR often emits the same charge twice with a truncated amount
 * (15.81 vs 15.8) or a junk order-id merchant (CA*5N7Q55BGO).
 */
function collapseNearDuplicateCharges(
  rows: ParsedStatementRow[],
): ParsedStatementRow[] {
  const kept: ParsedStatementRow[] = []

  for (const row of rows) {
    const idx = kept.findIndex(
      (k) => k.date === row.date && amountsNearlySame(k.amount, row.amount),
    )
    if (idx < 0) {
      kept.push(row)
      continue
    }

    const existing = kept[idx]
    const winner =
      merchantScore(row) > merchantScore(existing) ? row : existing
    kept[idx] = {
      ...winner,
      amount: morePreciseAmount(existing.amount, row.amount),
      suggestedCategoryId:
        winner.suggestedCategoryId || suggestCategory(winner.merchant),
    }
  }

  return kept
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100
}

function amountsNearlySame(a: number, b: number): boolean {
  if (roundMoney(a) === roundMoney(b)) return true
  if (Math.abs(a - b) <= 0.02) return true
  // Truncated tenth: 15.8 vs 15.81
  const tenthA = Math.round(a * 10) / 10
  const tenthB = Math.round(b * 10) / 10
  return tenthA === tenthB && Math.abs(a - b) < 0.1
}

function morePreciseAmount(a: number, b: number): number {
  if (amountsNearlySame(a, b)) return Math.max(roundMoney(a), roundMoney(b))
  return roundMoney(a)
}

function merchantScore(row: ParsedStatementRow): number {
  const m = row.merchant.trim()
  let score = m.length
  if (PHONE_LIKE.test(m)) score -= 100
  if (!/[a-z]/i.test(m)) score -= 50
  if (/^(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(m))
    score -= 80
  // Payment processor / order-id junk from OCR (CA*5N7Q55BGO, SQ *, etc.)
  if (/\*/.test(m)) score -= 40
  if (/^[A-Z]{1,3}\*[A-Z0-9]+$/i.test(m)) score -= 60
  if ((m.match(/\d/g) ?? []).length >= m.length / 2) score -= 25
  if (/amzn|amazon|starbucks|metro|tim\s*hort|uber|spotify/i.test(m)) score += 30
  score += (m.match(/[a-z]/gi) ?? []).length
  return score
}
