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
import { merchantsSimilar } from './duplicates'
import { suggestCategory } from './parseCsv'
import { suggestTdAccount } from './parseTd'
import type { AccountId } from '../types'

const SKIP_LINE =
  /^(congratulations|pre-approved|you'?re\s+pre-approved|youre\s+pre-approved|get\s+started|overview|membership|offers|account|pay\s*&\s*transfer|terms apply|search|activity|posted|account details|td first class|visa infinite|travel visa|chequing|savings)\b/i

/** Loan / promo banners (Amex Personal Loan card) — never merchants or amounts. */
const SKIP_PROMO =
  /pre-approved|personal\s+loan|terms\s+apply|get\s+started|congratulations/i

/** Amex puts city / phone under the merchant — never a payee by itself. */
const PHONE_LIKE =
  /^[\d\s()./+-]{7,}$|^\+?\d[\d\s().-]{6,}\d$|^\d{3}[-.\s]?\d{3}[-.\s]?\d{4}$/

/** North American phone anywhere in a line (Amex subtitle). */
const PHONE_IN_TEXT =
  /\b(?:\+?1[-.\s]*)?(?:\(?\d{3}\)?[-.\s]*)\d{3}[-.\s]*\d{4}\b/g

export type ParseScreenshotOptions = {
  /**
   * Starting section date when continuing a multi-screenshot scroll
   * (previous image’s last charge date). Prefer this over “today”.
   */
  initialDate?: string | null
}

/**
 * Bank app screenshots (Amex / TD) put dates on section headers and
 * merchant + amount on the rows below. Carry the date forward.
 */
export function parseScreenshotText(
  text: string,
  options?: ParseScreenshotOptions,
): ParsedStatementRow[] {
  const scrubbed = scrubPhoneAmountOcr(normalizeCreditAmountGlyphs(text))
  const fromSections = parseSectionedActivity(scrubbed, options)

  // Sectioned parse is authoritative for Amex/TD activity screenshots — even
  // when every visible row is Pending (zero posted). Falling back to naive
  // date-header pairs re-imports Pending Tim Hortons and drops credit rules.
  const amexOrTdActivityShot =
    /simplycash|\bpending\b|\bamex\b|american\s*express|membership\s*rewards/i.test(
      scrubbed,
    )
  const extras =
    fromSections.length > 0 || amexOrTdActivityShot
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
 * Amex marks refunds with a standalone “Credit” badge (same slot as Pending).
 * Never treat that badge as the merchant name.
 */
function isCreditStatusOnly(line: string): boolean {
  return /^(credit|refund|return)\.?$/i.test(line.replace(/\s+/g, ' ').trim())
}

/** Canadian / US province+country fragments under Amex payees. */
const REGION_CODE =
  /^(on|bc|ab|qc|mb|sk|ns|nb|nl|pe|nt|nu|yt|ca|us|usa|canada)$/i

/** One-word payees that must not be mistaken for city subtitles. */
const SINGLE_WORD_MERCHANT =
  /^(nordstrom|starbucks|costco|walmart|target|netflix|spotify|uber|ubereats|lyft|sobeys|loblaws|amazon|factor|docupet|cursor|metro|apple|google|mcdonalds|sidelineswap|openai|petro|esso|shell|playstation|sony|nintendo|xbox|steam|discord|paypal|venmo|instacart|doordash|skip|skipthedishes|landmark|cineplex|bestbuy|ikea|zara|h\s*&\s*m|oldnavy|gap|lululemon|milestones)$/i

/**
 * Amex “Plan It” installment badge (often under the amount). Same slot as
 * Credit/Pending — never a payee, and never treat OCR’d “Pending” lookalikes
 * here; Plan It marks a *posted* charge.
 */
function isPlanItStatusOnly(line: string): boolean {
  const t = line.replace(/\s+/g, ' ').trim()
  return /^plan\s*it\.?$/i.test(t) || /^planit\.?$/i.test(t)
}

/**
 * Amex puts city / phone / URL fragments under the amount. Those are not the
 * next merchant — skip them when hunting for a Credit/Pending badge so
 * `Amount → SEATTLE → Credit` still counts as a refund.
 */
function isLocationOrDetailSubtitle(line: string): boolean {
  const t = line.replace(/\s+/g, ' ').trim()
  if (!t) return false
  if (isCreditStatusOnly(t) || isPendingStatusOnly(t) || isPlanItStatusOnly(t)) {
    return false
  }
  if (isDateOnlyLine(t) || lineHasAmount(t)) return false
  // Pure phone / digits — Amex puts these under the payee.
  if (PHONE_LIKE.test(t)) return true
  PHONE_IN_TEXT.lastIndex = 0
  if (PHONE_IN_TEXT.test(t) && !/\$/.test(t)) {
    PHONE_IN_TEXT.lastIndex = 0
    // `AMZN MKTP CA 866-216-1072` is the payee row, not a subtitle.
    // Only phone-only (or phone + junk) lines are location details.
    const withoutPhone = stripPhones(t)
    if (!withoutPhone || !isPlausibleMerchant(withoutPhone)) return true
    return false
  }
  PHONE_IN_TEXT.lastIndex = 0
  if (/^amzn\.com\b/i.test(t)) return true
  // Help URLs / order ids under Uber Eats & similar (not the payee).
  if (/^(help\.)?uber\.com\.?$/i.test(t.replace(/\s+/g, ''))) return true
  if (/^help\.uber\.com\b/i.test(t)) return true
  if (/^order\s*#?\s*\d+\b/i.test(t)) return true
  if (REGION_CODE.test(t)) return true

  const m = stripToMerchant(t)
  if (!m) return false
  // Lone host/URL detail lines — not "AMAZON.COM AMZN.COM/BILL".
  if (/^[a-z0-9.-]+\.(com|net|org|ca|io)$/i.test(m)) return true
  if (/\d/.test(m) || /\./.test(m)) return false

  const words = m.split(/\s+/).filter(Boolean)
  if (words.length === 0 || words.length > 4) return false
  if (!words.every((w) => /^[A-Za-z][A-Za-z'-]*$/.test(w))) return false

  // City + province (+ country): TORONTO ON, TORONTO ON CA, WHITBY ON.
  if (words.length >= 2 && words.slice(1).every((w) => REGION_CODE.test(w))) {
    return true
  }

  // Single token: city (SEATTLE / WHITBY), not a one-word merchant.
  if (words.length === 1) {
    if (SINGLE_WORD_MERCHANT.test(words[0])) return false
    // OCR often glues "UBER EATS" → "UBEREATS" — treat as payee, not city.
    if (/eats|hortons|mcdonald|amazon|amzn|openai|petro/i.test(words[0])) {
      return false
    }
    return true
  }

  // Multi-word cities only with geographic prefixes — avoid “OLD NAVY”.
  return /^(san|new|los|las|north|south|east|west|fort|mount|mt|st|saint|santa|sao|rio)\b/i.test(
    m,
  )
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

  for (let j = amountIndex + 1; j < Math.min(lines.length, amountIndex + 4); j += 1) {
    const next = lines[j]
    if (isPendingStatusOnly(next)) return true
    if (isCreditStatusOnly(next) || isPlanItStatusOnly(next)) continue
    if (isDateOnlyLine(next) || lineHasAmount(next)) break
    if (isLocationOrDetailSubtitle(next)) continue
    if (isPlausibleMerchant(stripToMerchant(next))) break
  }

  if (amountIndex > 0 && isPendingStatusOnly(lines[amountIndex - 1])) {
    const above = amountIndex >= 2 ? lines[amountIndex - 2] : ''
    // Previous charge ended with amount then Pending — not this row.
    if (above && lineHasAmount(above)) return false
    // OCR often loses the prior amount (`TIM HORTONS` → `Dele`) so Pending
    // sits alone above the *next* payee. A line that already names its own
    // merchant is a new charge — do not inherit that orphaned Pending.
    if (isPlausibleMerchant(stripToMerchant(line))) return false
    return true
  }

  return false
}

/**
 * Amex screenshots often show refunds as a positive `$12.34` with a nearby
 * “Credit” badge, or as `-$12.34` / `($12.34)` / `$12.34 CR`.
 */
function chargeLooksLikeCredit(lines: string[], amountIndex: number): boolean {
  const line = lines[amountIndex] ?? ''
  if (lineAmountLooksLikeCredit(line)) return true

  for (let j = amountIndex + 1; j < Math.min(lines.length, amountIndex + 4); j += 1) {
    const next = lines[j]
    if (isCreditStatusOnly(next)) return true
    if (isPendingStatusOnly(next) || isPlanItStatusOnly(next)) break
    if (isDateOnlyLine(next) || lineHasAmount(next)) break
    if (isLocationOrDetailSubtitle(next)) continue
    if (isPlausibleMerchant(stripToMerchant(next))) break
  }

  if (amountIndex > 0 && isCreditStatusOnly(lines[amountIndex - 1])) {
    const above = amountIndex >= 2 ? lines[amountIndex - 2] : ''
    // Previous charge ended with amount then Credit — not this row.
    if (above && lineHasAmount(above)) return false
    // Same orphaned-badge case as Pending: next payee names itself.
    if (isPlausibleMerchant(stripToMerchant(line))) return false
    return true
  }

  return false
}

/** Inline credit markers on the amount line itself. */
function lineAmountLooksLikeCredit(line: string): boolean {
  const normalized = normalizeMinusGlyphs(line)
  if (/\(\s*\$?\s*\d{1,3}(?:,\d{3})*\.\d{1,2}\s*\)/.test(normalized)) return true
  if (/(?:^|[^\d.])-\s*\$?\s*\d{1,3}(?:,\d{3})*\.\d{1,2}\b/.test(normalized)) {
    return true
  }
  if (/(?:\$\s*)?\d{1,3}(?:,\d{3})*\.\d{1,2}\s*CR\b/i.test(normalized)) {
    return true
  }
  // “Credit” / “Refund” on the same row as the amount (not alone as a badge).
  if (
    /\b(credit|refund|return)\b/i.test(normalized) &&
    !isCreditStatusOnly(normalized)
  ) {
    return true
  }
  return false
}

function normalizeMinusGlyphs(text: string): string {
  return text.replace(/[−–—―‒‾˗]/g, '-')
}

/**
 * Amex green −$ amounts often OCR as a stray glyph before the dollars
 * (`~$41.19`, `=$41.19`, `_$41.19`) once the minus washes out.
 * Also repair `-$45.19` → `-845.19` when `$` is read as `8` after the minus.
 */
function normalizeCreditAmountGlyphs(text: string): string {
  return normalizeMinusGlyphs(text)
    .replace(/[~≈=_|]\s*(\$\s*\d{1,3}(?:,\d{3})*\.\d{1,2})\b/g, '-$1')
    .replace(
      /(?<![\d.])-\s*8(\d{2}\.\d{2})\b/g,
      (_full, rest: string) => {
        const n = Number(rest)
        // `$45.19` → `845.19` after a credit minus; keep real `-8.50` / `-812`.
        return n >= 10 && n < 100 ? `-${rest}` : `-8${rest}`
      },
    )
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

  // OCR `$` → `S` then digits: S16.77 → $16.77 (and S100.00 → $100.00).
  next = next.replace(/(^|[\s])S(\d{1,3}(?:,\d{3})*\.\d{2})\b/g, '$1$$$2')

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
    // Only strip when the remainder looks like a short price (one digit dollars).
    // Avoid `#2616 … $13.31` → `$3.31` (second digit of 13 matching store “1”).
    if (/^\d\.\d{1,2}$/.test(rest) && Number(rest) > 0 && Number(rest) < 10) {
      return rest
    }
  }
  // Second-to-last glued: 84958 → 5 + 4.80 → 54.80
  if (digits.length >= 2 && digits[digits.length - 2] === amount[0]) {
    const rest = amount.slice(1)
    if (/^\d\.\d{1,2}$/.test(rest) && Number(rest) > 0 && Number(rest) < 10) {
      return rest
    }
  }
  return amount
}

/**
 * True when the line is basically just a money amount (Amex right-column OCR
 * often emits `$124.29` on its own line *above* the merchant).
 */
function isAmountOnlyLine(line: string): boolean {
  const amounts = amountsOnLine(line)
  if (amounts.length !== 1) return false
  let rest = stripToMerchant(line)
  // Trailing `$`→`S` junk left after a split amount line.
  rest = rest.replace(/^s$/i, '').trim()
  if (!rest) return true
  return !isPlausibleMerchant(rest) && rest.length <= 3
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
  if (isPlanItStatusOnly(m)) return false
  if (
    /^(opening|closing|total|subtotal|balance|credit|refund|return|pending)$/i.test(
      m,
    )
  ) {
    return false
  }
  return true
}

/**
 * Extract amounts; credits are negative (`-$12`, `($12)`, `$12 CR`).
 * Prefer signed/paren/CR forms so refunds are not read as ordinary charges.
 */
function amountsOnLine(line: string): number[] {
  const cleaned = normalizeMinusGlyphs(stripStoreNumbers(stripPhones(line)))
  const found: number[] = []
  const covered = new Set<number>()

  const take = (start: number, end: number, value: number) => {
    for (let i = start; i < end; i += 1) {
      if (covered.has(i)) return
    }
    for (let i = start; i < end; i += 1) covered.add(i)
    const n = Number(Number(value).toFixed(2))
    if (n !== 0 && Math.abs(n) < 50000) found.push(n)
  }

  for (const m of cleaned.matchAll(
    /\(\s*\$?\s*(\d{1,3}(?:,\d{3})*\.\d{1,2})\s*\)/g,
  )) {
    if (m.index == null) continue
    take(m.index, m.index + m[0].length, -Number(m[1].replace(/,/g, '')))
  }

  for (const m of cleaned.matchAll(
    /(?<![\d.])-\s*\$?\s*(\d{1,3}(?:,\d{3})*\.\d{1,2})\b/g,
  )) {
    if (m.index == null) continue
    take(m.index, m.index + m[0].length, -Number(m[1].replace(/,/g, '')))
  }

  for (const m of cleaned.matchAll(
    /\$\s*(\d{1,3}(?:,\d{3})*\.\d{1,2})\b(?:\s*CR)?/gi,
  )) {
    if (m.index == null) continue
    const raw = m[1].replace(/,/g, '')
    const n = Number(raw)
    const credit = /\bCR\s*$/i.test(m[0])
    take(m.index, m.index + m[0].length, credit ? -n : n)
  }

  if (found.length === 0) {
    for (const m of cleaned.matchAll(AMOUNT_PATTERN)) {
      if (m.index == null || m[0].includes('$')) continue
      let raw = stripDollarMisreadAsFive(m[1].replace(/[$,\s]/g, ''), false)
      let n = Number(raw)
      if (/\bCR\s*$/i.test(m[0]) || /(?<![\d.])-\s*\$?\s*\d/.test(m[0])) {
        n = -Math.abs(n)
      }
      take(m.index, m.index + m[0].length, n)
    }
  }

  return [...new Set(found)]
}

function lineHasAmount(line: string): boolean {
  return amountsOnLine(line).length > 0
}

function stripToMerchant(line: string): string {
  let merchant = normalizeMinusGlyphs(stripStoreNumbers(stripPhones(line)))
  for (const pattern of DATE_PATTERNS) {
    merchant = merchant.replace(pattern, ' ')
  }
  return cleanMerchantName(
    merchant
      .replace(/\(\s*\$?\s*\d{1,3}(?:,\d{3})*\.\d{1,2}\s*\)/g, ' ')
      .replace(/(?<![\d.])-\s*\$?\s*\d{1,3}(?:,\d{3})*\.\d{1,2}\b/g, ' ')
      .replace(AMOUNT_PATTERN, ' ')
      .replace(/\$\s*\d{1,3}(?:,\d{3})*\.\d{1,2}\b/g, ' '),
  )
}

function amountFromLine(line: string, context: string): number | null {
  const cleaned = normalizeMinusGlyphs(stripStoreNumbers(stripPhones(line)))
  const any = amountsOnLine(line)
  let amount = pickStatementAmount(any)
  if (!amount) return null

  const hadExplicitDollar = /\$/.test(cleaned)
  // Bare OCR amount: `$` often becomes a leading `5`.
  if (!hadExplicitDollar) {
    const fixed = stripDollarMisreadAsFive(Math.abs(amount).toFixed(2), false)
    if (fixed !== Math.abs(amount).toFixed(2)) {
      amount = amount < 0 ? -Number(fixed) : Number(fixed)
    }
  }

  // Repair store-# contamination only when the # and amount are adjacent
  // (OCR glued `#849584.80`). Skip when city text sits between (`#2616 WHITBY $13.31`).
  const gluedStore = line.match(
    /#\s*(\d{3,})\s*\$?\s*(\d{1,3}\.\d{1,2})\b/,
  )
  if (gluedStore) {
    const fixed = stripStoreContaminatingDigit(
      gluedStore[1],
      Math.abs(amount).toFixed(2),
    )
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

  // Positive OCR amount + nearby/inline credit marker → treat as refund.
  if (amount > 0 && lineAmountLooksLikeCredit(line)) {
    return -amount
  }
  return amount
}

function resolveMerchant(
  onLine: string,
  pending: string | null,
): string | null {
  // City / province sitting on the amount row must not become the payee.
  const onLineMerchant = isLocationOrDetailSubtitle(onLine) ? '' : onLine
  const a = isPlausibleMerchant(onLineMerchant) ? onLineMerchant : null
  const b = pending && isPlausibleMerchant(pending) ? pending : null
  if (a && b) {
    // Prefer a real pending payee over a weak/city-ish amount-line fragment.
    if (isStrongPayeeName(b) && !isStrongPayeeName(a)) return normalizeUberMerchant(b)
    // OCR split "DOCUPET PET" / "LICENSING $33.55" — join continuation.
    if (
      a.split(/\s+/).length <= 2 &&
      !b.toLowerCase().includes(a.toLowerCase()) &&
      !a.toLowerCase().includes(b.toLowerCase())
    ) {
      return normalizeUberMerchant(`${b} ${a}`)
    }
    return normalizeUberMerchant(a)
  }
  const picked = a ?? b
  return picked ? normalizeUberMerchant(picked) : null
}

/** Prefer recognizable brand payees when OCR also emits city/URL crumbs. */
function isStrongPayeeName(merchant: string): boolean {
  return /uber|amzn|amazon|starbucks|tim\s*hort|mcdonald|petro|openai|chatgpt|nordstrom|wal-?mart|metro|costco|spotify|docupet|sidelineswap|factor|lyft|playstation|sony|nintendo|xbox/i.test(
    merchant,
  )
}

/** OCR glue / star variants → readable Uber Eats label. */
function normalizeUberMerchant(merchant: string): string {
  let m = merchant.replace(/\s+/g, ' ').trim()
  // Amex Plan It badge sometimes glues onto the payee name.
  m = m.replace(/\bplan\s*it\b/gi, ' ').replace(/\s+/g, ' ').trim()
  m = m.replace(/\bUBER\s*\*?\s*EATS\b/i, 'UBER EATS')
  m = m.replace(/\bUBEREATS\b/i, 'UBER EATS')
  if (!/uber/i.test(m)) return m
  // Drop trailing city/region Amex often appends on the same OCR line.
  m = m.replace(
    /\s+(TORONTO|VANCOUVER|MONTREAL|CALGARY|OTTAWA|WHITBY|SEATTLE|BOSTON|SAN\s+FRANCISCO)(?:\s+(?:ON|BC|AB|QC|CA|US)){0,2}\s*$/i,
    '',
  )
  m = m.replace(/\s+HELP\.UBER\.COM\b/i, '')
  return m.replace(/\s+/g, ' ').trim() || merchant
}

function firstDateHeaderDate(lines: string[]): string | null {
  for (const line of lines) {
    if (!isDateOnlyLine(line)) continue
    const raw = extractDate(line)
    if (!raw) continue
    const normalized = normalizeStatementDate(raw)
    if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) return normalized
  }
  return null
}

function parseSectionedActivity(
  text: string,
  options?: ParseScreenshotOptions,
): ParsedStatementRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l.length > 0)

  // Never stamp undated rows with "upload day" when the screenshot already has
  // section headers (or a prior image’s date). Mid-scroll crops often omit the
  // header above the first visible charge — use the next header instead of today.
  const firstHeaderDate = firstDateHeaderDate(lines)
  const seeded =
    (options?.initialDate &&
    /^\d{4}-\d{2}-\d{2}$/.test(options.initialDate.slice(0, 10))
      ? options.initialDate.slice(0, 10)
      : null) ??
    firstHeaderDate ??
    localTodayYmd()
  let currentDate: string | null = seeded
  let pendingMerchant: string | null = null
  /** Amount OCR’d on the line above the payee (Amex right-column). */
  let pendingAmount: number | null = null
  const rows: ParsedStatementRow[] = []

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]
    if (SKIP_LINE.test(line) || SKIP_PROMO.test(line)) continue
    if (isPendingStatusOnly(line)) continue
    // Keep pending merchant; Credit / Plan It badges are not payees.
    if (isCreditStatusOnly(line) || isPlanItStatusOnly(line)) continue
    if (/page\s+\d+/i.test(line)) continue

    if (isDateOnlyLine(line)) {
      currentDate = normalizeStatementDate(extractDate(line)!)
      pendingMerchant = null
      pendingAmount = null
      continue
    }

    const context = [lines[i - 1], line, lines[i + 1]].filter(Boolean).join(' ')
    const distinctAmounts = amountsOnLine(line)
    let amount = amountFromLine(line, context)
    const merchantOnLine = stripToMerchant(line).replace(/\bs\b/gi, ' ').replace(/\s+/g, ' ').trim()

    // Plan It rows: OCR often turns `$124.29` into `S252` (no cents). Ignore
    // whole-dollar junk on the payee line when Plan It is the next badge.
    if (
      amount != null &&
      !/\d+\.\d{2}/.test(line) &&
      !/\$\s*\d/.test(line) &&
      lines.slice(i + 1, i + 3).some((l) => isPlanItStatusOnly(l))
    ) {
      amount = null
    }

    if (!amount) {
      // City / phone under a prior charge must not become the next payee.
      if (isLocationOrDetailSubtitle(line)) continue
      if (isPlausibleMerchant(merchantOnLine)) {
        // Orphan amount on the prior line → this payee.
        if (pendingAmount != null && currentDate) {
          rows.push({
            date: currentDate,
            amount: pendingAmount,
            merchant: normalizeUberMerchant(merchantOnLine),
            suggestedCategoryId: suggestCategory(merchantOnLine),
            suggestedAccountId: 'other',
            isRefund: false,
          })
          pendingAmount = null
          pendingMerchant = null
          continue
        }
        // OCR often splits "UBER" / "EATS" or "DOCUPET" / "PET" across lines.
        if (
          pendingMerchant &&
          merchantOnLine.split(/\s+/).length <= 2 &&
          pendingMerchant.split(/\s+/).length <= 2 &&
          !pendingMerchant.toLowerCase().includes(merchantOnLine.toLowerCase()) &&
          !merchantOnLine.toLowerCase().includes(pendingMerchant.toLowerCase())
        ) {
          pendingMerchant = `${pendingMerchant} ${merchantOnLine}`
        } else {
          pendingMerchant = merchantOnLine
        }
      }
      continue
    }

    // Do not import Pending auth holds — only posted activity.
    if (chargeLooksPending(lines, i)) {
      pendingMerchant = null
      pendingAmount = null
      continue
    }

    if (distinctAmounts.length > 1) {
      pendingMerchant = null
      pendingAmount = null
      continue
    }

    // Bare amount line (right column). Amex OCR may put it above OR below the payee.
    if (isAmountOnlyLine(line)) {
      const onlyAmt = Math.abs(amount)
      if (pendingMerchant && currentDate) {
        rows.push({
          date: currentDate,
          amount: onlyAmt,
          merchant: normalizeUberMerchant(pendingMerchant),
          suggestedCategoryId: suggestCategory(pendingMerchant),
          suggestedAccountId: 'other',
          isRefund: amount < 0 || chargeLooksLikeCredit(lines, i),
        })
        pendingMerchant = null
        pendingAmount = null
        continue
      }
      if (!pendingMerchant) {
        pendingAmount = onlyAmt
        continue
      }
    }

    const inlineDate = extractDate(line)
    const date = inlineDate
      ? normalizeStatementDate(inlineDate)
      : currentDate
    if (!date) {
      pendingMerchant = null
      pendingAmount = null
      continue
    }

    let merchant = resolveMerchant(merchantOnLine, pendingMerchant)

    if (!isPlausibleMerchant(merchant ?? '')) {
      merchant = findMerchantAbove(lines, i)
    }

    // Last resort: the amount row named itself (`OLDNAVY.COM -$41.40`,
    // `ZARA.COM $30`). Those read as host/city subtitles, which dropped the
    // whole charge. Any payee text beats losing the row.
    if (!isPlausibleMerchant(merchant ?? '') && isPlausibleMerchant(merchantOnLine)) {
      merchant = merchantOnLine
    }

    // Prefer an orphan amount from the line above when this row’s amount looks
    // like OCR junk (`S252`) but we already captured `124.29`.
    let finalAmount = Math.abs(amount)
    const amountTokenLooksWhole =
      !/\d+\.\d{2}/.test(line) && !/\$\s*\d/.test(line)
    if (
      pendingAmount != null &&
      isPlausibleMerchant(merchant ?? '') &&
      pendingAmount >= 1 &&
      pendingAmount < 50000 &&
      (amountTokenLooksWhole || finalAmount < 1)
    ) {
      finalAmount = pendingAmount
    }

    pendingMerchant = null
    const usedPendingAmount = pendingAmount != null && finalAmount === pendingAmount
    pendingAmount = usedPendingAmount ? null : pendingAmount

    if (!merchant || !isPlausibleMerchant(merchant)) {
      // Keep amount for the following payee line.
      if (isAmountOnlyLine(line) || !merchantOnLine) {
        pendingAmount = finalAmount
      }
      continue
    }

    if (!usedPendingAmount) pendingAmount = null

    const looksLikeRefund =
      amount < 0 ||
      chargeLooksLikeCredit(lines, i) ||
      /refund|return|rebate|credit|payment\s+thank/i.test(merchant)

    rows.push({
      date,
      amount: finalAmount,
      merchant,
      suggestedCategoryId: suggestCategory(merchant),
      suggestedAccountId: 'other',
      isRefund: looksLikeRefund,
    })
  }

  return promoteTwinMerchantRefunds(rows)
}

function localTodayYmd(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * OCR often keeps the minus on only one of several same-day credits from the
 * same payee (Amazon returns, Old Navy returns). If any sibling is already a
 * refund, promote the rest so every green row imports as a return.
 */
function promoteTwinMerchantRefunds(
  rows: ParsedStatementRow[],
): ParsedStatementRow[] {
  const byDate = new Map<string, ParsedStatementRow[]>()
  for (const row of rows) {
    const key = `${row.date}|${refundTwinMerchantKey(row.merchant)}`
    const list = byDate.get(key) ?? []
    list.push(row)
    byDate.set(key, list)
  }
  const promote = new Set<ParsedStatementRow>()
  for (const list of byDate.values()) {
    if (list.length < 2) continue
    if (!list.some((r) => r.isRefund)) continue
    // Different amounts = twin returns (not a re-OCR dupe of one credit).
    const amounts = new Set(list.map((r) => roundMoney(r.amount)))
    if (amounts.size < 2) continue
    for (const r of list) promote.add(r)
  }
  if (promote.size === 0) return rows
  return rows.map((r) => (promote.has(r) ? { ...r, isRefund: true } : r))
}

/** Group same-payee rows for twin-refund promotion (drops OCR order ids). */
function refundTwinMerchantKey(merchant: string): string {
  return cleanMerchantName(stripStoreNumbers(stripPhones(merchant)))
    .toLowerCase()
    .replace(/\*.*$/, '')
    .replace(/\.(com|ca|net|org)\b/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim()
}

/** Walk up past store # / city subtitles to the real payee name. */
function findMerchantAbove(lines: string[], index: number): string | null {
  for (let j = index - 1; j >= Math.max(0, index - 4); j -= 1) {
    const prev = lines[j]
    if (isDateOnlyLine(prev)) break
    if (SKIP_LINE.test(prev) || SKIP_PROMO.test(prev) || isPendingStatusOnly(prev)) break
    if (isCreditStatusOnly(prev) || isPlanItStatusOnly(prev)) continue
    if (isLocationOrDetailSubtitle(prev)) continue
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
  const seen = new Map<string, number>()
  const out: ParsedStatementRow[] = []
  for (const row of rows) {
    if (!isPlausibleMerchant(row.merchant)) continue
    const key = `${row.date}|${row.amount}|${row.merchant.toLowerCase()}|${
      row.isRefund ? 'R' : 'E'
    }`
    const prior = seen.get(key) ?? 0
    // Expenses: exact dedupe across parse paths. Refunds: keep multiples —
    // two Amazon returns can share merchant + amount on the same day.
    if (prior > 0 && !row.isRefund) continue
    seen.set(key, prior + 1)
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
  const consumedGroups = new Set<string>()

  for (const row of rows) {
    const groupKey = `${row.date}|${roundMoney(row.amount)}`
    if (consumedGroups.has(groupKey)) continue
    consumedGroups.add(groupKey)

    const siblings = byDateAmount.get(groupKey) ?? [row]
    const best = siblings.reduce((a, b) =>
      merchantScore(b) > merchantScore(a) ? b : a,
    )

    const refunds = siblings.filter((s) => s.isRefund)
    // Keep every same-day same-amount refund — do not collapse two returns.
    if (refunds.length > 1) {
      for (const r of refunds) {
        const merchant =
          merchantScore(r) >= merchantScore(best) ? r.merchant : best.merchant
        out.push({
          ...r,
          merchant,
          suggestedCategoryId:
            r.suggestedCategoryId ||
            best.suggestedCategoryId ||
            suggestCategory(merchant),
        })
      }
      continue
    }

    out.push(best)
  }

  return out
}

/**
 * OCR often emits the same charge twice with a truncated amount
 * (15.81 vs 15.8) or a junk order-id merchant (CA*5N7Q55BGO).
 * Do not collapse unrelated merchants, and never merge two exact-amount
 * refunds (legitimate twin Amazon returns).
 */
function collapseNearDuplicateCharges(
  rows: ParsedStatementRow[],
): ParsedStatementRow[] {
  const kept: ParsedStatementRow[] = []

  for (const row of rows) {
    const idx = kept.findIndex((k) => {
      if (k.date !== row.date) return false
      if (!amountsNearlySame(k.amount, row.amount)) return false
      if (merchantsSimilar(k.merchant, row.merchant) === 'none') return false
      // Never merge two refunds — twin Amazon returns (even 1¢ apart) must both keep.
      if (k.isRefund && row.isRefund) return false
      return true
    })
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
      isRefund: Boolean(existing.isRefund || row.isRefund),
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
