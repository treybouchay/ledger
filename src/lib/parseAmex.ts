import type { AccountId } from '../types'
import { daysApart, merchantsSimilar } from './duplicates'
import { suggestCategory } from './parseCsv'
import type { ParsedStatementRow } from './parseStatementText'

const MONTHS: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
}

/** Collapse Amex’s character/word-broken PDF text into usable lines. */
export function normalizeAmexText(raw: string): string {
  let text = raw.replace(/\r/g, '\n')

  // 06\n/\n05\n/\n2026  →  06/05/2026
  text = text.replace(
    /(\d{1,2})\s*\n\s*\/\s*\n\s*(\d{1,2})\s*\n\s*\/\s*\n\s*(\d{4})/g,
    '$1/$2/$3',
  )
  text = text.replace(
    /(\d{1,2})\s*\/\s*(\d{1,2})\s*\/\s*(\d{4})/g,
    '$1/$2/$3',
  )

  // Jun\n24  or Jun\n02\n,\n2026
  text = text.replace(
    /\b([A-Za-z]{3,9})\s*\n\s*(\d{1,2})\s*\n\s*,\s*\n\s*(\d{4})\b/g,
    '$1 $2, $3',
  )
  text = text.replace(/\b([A-Za-z]{3,9})\s*\n\s*(\d{1,2})\b/g, '$1 $2')

  // $\n67.41 or -\n$144.89
  text = text.replace(/-\s*\n\s*\$/g, '-$')
  text = text.replace(/\$\s*\n\s*/g, '$')
  text = text.replace(/-\s*\n\s*(\d)/g, '-$1')

  return text
}

export function looksLikeAmex(text: string): boolean {
  const hay = text.toLowerCase()
  return (
    hay.includes('american express') ||
    hay.includes('amex bank') ||
    hay.includes('simplycash') ||
    (hay.includes('transaction') && hay.includes('posting') && hay.includes('amount ($)'))
  )
}

/**
 * Prefer Amex cash-back / rewards detail pages: they keep
 * date + merchant + amount on adjacent tokens after normalize.
 *
 * Date choice: activity lines print Transaction Date then Posting Date —
 * we keep **posting date** so charges land in the statement month they
 * posted. Cashback detail pages only print one date; that date wins when
 * merging (higher-quality rows). Within a parse, merchant+amount within
 * ±1 day is treated as one charge so activity+cashback cannot double-count.
 */
export function parseAmexStatement(
  raw: string,
  statementYear = guessStatementYear(raw),
): ParsedStatementRow[] {
  const text = normalizeAmexText(raw)
  const fromCashback = parseAmexCashbackSection(text)
  // Cashback pages carry full MM/DD/YYYY — prefer that year for activity
  // lines that only print "Jul 2" (otherwise "Member Since 2019" wins).
  const yearFromCashback = dominantYear(fromCashback.map((r) => r.date))
  const fromActivity = parseAmexActivitySection(
    text,
    yearFromCashback ?? statementYear,
  )
  // Always merge: cashback pages are higher quality, but returning early on
  // cashback alone dropped activity-only charges (and vice versa).
  return mergeAmexRows(fromCashback, fromActivity)
}

/**
 * Pick the statement year for activity lines that lack a year.
 * Never use the first 20xx in the PDF — Amex often prints "Member Since 20xx"
 * before the real period, which parked hundreds of charges in the wrong decade.
 */
export function guessStatementYear(raw: string): number {
  const fullSlash = [...raw.matchAll(/\b\d{1,2}\/\d{1,2}\/(20\d{2})\b/g)].map(
    (m) => Number(m[1]),
  )
  const fromSlash = dominantNumber(fullSlash)
  if (fromSlash) return fromSlash

  const named = [
    ...raw.matchAll(
      /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2},?\s+(20\d{2})\b/gi,
    ),
  ].map((m) => Number(m[1]))
  const fromNamed = dominantNumber(named)
  if (fromNamed) return fromNamed

  const anchored =
    raw.match(
      /(?:statement\s+(?:period|date|closing)|closing\s+date|payment\s+due|new\s+transactions\s+for)[^0-9]{0,48}(20\d{2})/i,
    ) ?? raw.match(/\b(20\d{2})\b(?!\s*(?:member|since))/i)
  if (anchored) return Number(anchored[1])

  return new Date().getFullYear()
}

function dominantYear(isoDates: string[]): number | undefined {
  const years = isoDates
    .map((d) => Number(d.slice(0, 4)))
    .filter((y) => y >= 2000 && y <= 2100)
  return dominantNumber(years)
}

function dominantNumber(values: number[]): number | undefined {
  if (values.length === 0) return undefined
  const counts = new Map<number, number>()
  for (const v of values) {
    counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  return [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || b[0] - a[0],
  )[0]?.[0]
}

function parseAmexCashbackSection(text: string): ParsedStatementRow[] {
  // After normalize: 06/05/2026 PETRO-CANADA ... $67.41 $2.70
  // Refunds: 06/21/2026 FACTOR ... -$144.89 -$5.80
  const rowRe =
    /(\d{1,2}\/\d{1,2}\/\d{4})\s+([A-Z0-9][\sA-Z0-9*#.'&,/()%-]{2,}?)\s+(-?\$?\d[\d,]*\.\d{2})\s+-?\$?\d[\d,]*\.\d{2}/gi

  const rows: ParsedStatementRow[] = []
  for (const match of text.matchAll(rowRe)) {
    const date = toIsoDate(match[1])
    const merchant = cleanMerchant(match[2])
    const amountRaw = match[3].replace(/[$,]/g, '')
    const amount = Number(amountRaw)
    if (!date || !merchant || !Number.isFinite(amount) || amount === 0) continue
    if (isJunkMerchant(merchant)) continue

    rows.push(toRow(date, merchant, amount))
  }
  return rows
}

function parseAmexActivitySection(
  text: string,
  statementYear: number,
): ParsedStatementRow[] {
  // Pattern after normalize:
  // Jun 2 Jun 3 CURSOR, AI POWERED IDE  SAN FRANCISCO
  //   ^txn   ^posting — keep posting date for ledger month alignment.
  // amounts later collected in order under New Transactions — fragile.
  // Better: scan for "Mon D Mon D MERCHANT" then look ahead for nearby money tokens
  // on cashback pages only above. Here pair sequential merchants with amount list
  // that appears after "New Transactions".

  const merchants: { date: string; merchant: string }[] = []
  const activityRe =
    /\b([A-Za-z]{3,9})\s+(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{1,2})\s+([A-Z0-9][^\n]{2,80}?)(?=\s+[A-Za-z]{3,9}\s+\d{1,2}\s+[A-Za-z]{3,9}\s+\d{1,2}\s+[A-Z0-9]|\s+Prepared For|\s+Total of|\s+New Transactions|\s+Your Transactions|$)/g

  const collapsed = text.replace(/\n+/g, ' ')
  for (const match of collapsed.matchAll(activityRe)) {
    // Prefer posting date (2nd column) over transaction date (1st).
    const month = MONTHS[match[3].toLowerCase()]
    const day = Number(match[4])
    if (!month || !day) continue
    const merchant = cleanMerchant(match[5])
    if (!merchant || isJunkMerchant(merchant)) continue
    if (/payment received/i.test(merchant)) continue
    const date = `${statementYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    merchants.push({ date, merchant })
  }

  // Amounts listed after "New Transactions for" block (page 2 style)
  const amountBlock = collapsed.match(
    /New Transactions for[\s\S]{0,200}?((?:\d+\.\d{2}\s*){5,})/,
  )
  const amounts = amountBlock
    ? [...amountBlock[1].matchAll(/(\d+\.\d{2})/g)].map((m) => Number(m[1]))
    : []

  if (merchants.length === 0) return []

  // If we can't pair reliably, still return merchants with 0? No — skip.
  if (amounts.length === 0 || Math.abs(amounts.length - merchants.length) > 3) {
    // Fall back: only use cashback-like $amount immediately after merchant in collapsed text
    return parseLooseMerchantAmounts(collapsed, statementYear)
  }

  const count = Math.min(merchants.length, amounts.length)
  const rows: ParsedStatementRow[] = []
  for (let i = 0; i < count; i += 1) {
    rows.push(toRow(merchants[i].date, merchants[i].merchant, amounts[i]))
  }
  return rows
}

function parseLooseMerchantAmounts(
  collapsed: string,
  statementYear: number,
): ParsedStatementRow[] {
  const rows: ParsedStatementRow[] = []
  const re =
    /\b([A-Za-z]{3,9})\s+(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{1,2})\s+([A-Z0-9][\sA-Z0-9*#.'&,/-]{2,}?)\s+(-?\$?\d+\.\d{2})\b/g
  for (const match of collapsed.matchAll(re)) {
    // Posting date = 2nd Mon/D column
    const month = MONTHS[match[3].toLowerCase()]
    const day = Number(match[4])
    if (!month || !day) continue
    const merchant = cleanMerchant(match[5])
    const amount = Number(match[6].replace(/[$,]/g, ''))
    if (!merchant || isJunkMerchant(merchant) || !Number.isFinite(amount)) continue
    const date = `${statementYear}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
    rows.push(toRow(date, merchant, amount))
  }
  return rows
}

function toIsoDate(mdy: string): string | null {
  const [mm, dd, yyyy] = mdy.split('/').map((p) => Number(p))
  if (!mm || !dd || !yyyy) return null
  return `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`
}

function cleanMerchant(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .replace(/\s+\d{3}-\d{3}-\d{4}\s*$/g, '')
    .replace(/\s+\d{800,}.*$/g, '')
    .trim()
}

function isJunkMerchant(merchant: string): boolean {
  return /^(page|prepared for|account|opening|closing|transaction|posting|details|amount|total|new balance|previous|customer service|statement)/i.test(
    merchant,
  )
}

function toRow(
  date: string,
  merchant: string,
  amount: number,
): ParsedStatementRow {
  const isRefund =
    amount < 0 || /refund|return|payment received|credit/i.test(merchant)
  return {
    date,
    amount,
    merchant,
    suggestedCategoryId: suggestCategory(merchant),
    suggestedAccountId: 'amex' as AccountId,
    isRefund,
  }
}

function amexRowsNearDuplicate(
  a: ParsedStatementRow,
  b: ParsedStatementRow,
): boolean {
  if (
    Math.round(Math.abs(a.amount) * 100) !== Math.round(Math.abs(b.amount) * 100)
  ) {
    return false
  }
  if (daysApart(a.date, b.date) > 1) return false
  return merchantsSimilar(a.merchant, b.merchant) === 'strong'
}

/** Drop exact/near (±1 day) merchant+amount repeats within one section. */
function fuzzyDedupe(rows: ParsedStatementRow[]): ParsedStatementRow[] {
  const out: ParsedStatementRow[] = []
  for (const row of rows) {
    if (out.some((kept) => amexRowsNearDuplicate(kept, row))) continue
    out.push(row)
  }
  return out
}

/**
 * Prefer cashback rows; add activity rows that aren’t the same charge
 * (merchant + amount within ±1 day — covers txn vs posting date).
 */
function mergeAmexRows(
  preferred: ParsedStatementRow[],
  extra: ParsedStatementRow[],
): ParsedStatementRow[] {
  const preferredDeduped = fuzzyDedupe(preferred)
  if (extra.length === 0) return preferredDeduped
  if (preferredDeduped.length === 0) return fuzzyDedupe(extra)

  const merged = [...preferredDeduped]
  for (const row of fuzzyDedupe(extra)) {
    if (merged.some((kept) => amexRowsNearDuplicate(kept, row))) continue
    merged.push(row)
  }
  return merged
}
