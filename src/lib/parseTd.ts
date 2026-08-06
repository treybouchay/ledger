import type { AccountId } from '../types'
import { suggestCategory } from './parseCsv'
import type { ParsedStatementRow } from './parseStatementText'

const MONTHS: Record<string, number> = {
  JAN: 1,
  FEB: 2,
  MAR: 3,
  APR: 4,
  MAY: 5,
  JUN: 6,
  JUL: 7,
  AUG: 8,
  SEP: 9,
  OCT: 10,
  NOV: 11,
  DEC: 12,
}

const MON =
  '(?:J ?A ?N|F ?E ?B|M ?A ?R|A ?P ?R|M ?A ?Y|J ?U ?N|J ?U ?L|A ?U ?G|S ?E ?P|O ?C ?T|N ?O ?V|D ?E ?C)'

export function looksLikeTd(text: string): boolean {
  const squeezed = text.replace(/ /g, '').toLowerCase()
  return (
    squeezed.includes('toronto-dominion') ||
    squeezed.includes('toronto–dominion') ||
    squeezed.includes('allinclusive') ||
    squeezed.includes('easyline') ||
    squeezed.includes('firstclasstravel') ||
    squeezed.includes('tdcashback') ||
    (squeezed.includes('td.com') && squeezed.includes('statement')) ||
    (squeezed.includes('branchno') &&
      squeezed.includes('accountno') &&
      squeezed.includes('withdrawals'))
  )
}

/** TD Visa / Mastercard statements (First Class Travel, Cash Back, etc.). */
export function looksLikeTdCredit(text: string): boolean {
  // Chequing statements win when their markers are present.
  if (looksLikeTdChequing(text)) return false

  const squeezed = text.replace(/ /g, '').toLowerCase()
  if (squeezed.includes('firstclasstravel')) return true
  if (squeezed.includes('tdcashback')) return true
  if (squeezed.includes('activitydescriptionamount')) return true
  if (squeezed.includes('tdpoints') && squeezed.includes('newbalance')) return true
  if (
    /credit\s*card/i.test(text) &&
    /transaction\s*posting|posting\s*date|activity\s*description/i.test(text)
  ) {
    return true
  }
  // Dual-date charge rows: "JUN 9 JUN 12 MERCHANT $6.73"
  if (
    /\b(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+\d{1,2}\s+(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\s+\d{1,2}\s+/i.test(
      text,
    ) &&
    (squeezed.includes('toronto-dominion') ||
      squeezed.includes('toronto–dominion') ||
      squeezed.includes('tdcanadatrust') ||
      squeezed.includes('td.com'))
  ) {
    return true
  }
  return false
}

export function looksLikeTdChequing(text: string): boolean {
  const squeezed = text.replace(/ /g, '').toLowerCase()
  // EasyLine appears on credit statements as a payment method — do not use alone.
  return (
    squeezed.includes('allinclusive') ||
    (squeezed.includes('branchno') && squeezed.includes('withdrawals')) ||
    squeezed.includes('startingbalance') ||
    squeezed.includes('closingbalance') ||
    (squeezed.includes('easyline') &&
      (squeezed.includes('withdrawals') || squeezed.includes('deposits')))
  )
}

/** Default account for a TD PDF (credit product vs chequing). */
export function suggestTdAccount(text: string): AccountId {
  if (looksLikeTdChequing(text)) return 'debit'
  const squeezed = text.replace(/ /g, '').toLowerCase()
  if (squeezed.includes('firstclasstravel')) return 'first_class'
  if (squeezed.includes('tdcashback') || /cash\s*back|visa\s*infinite/i.test(text)) {
    return 'td_cashback'
  }
  if (looksLikeTdCredit(text)) return 'td_cashback'
  return 'debit'
}

/**
 * Human hint when TD was recognized but zero rows parsed.
 * Chequing + credit layouts differ; scanned PDFs have no extractable text.
 */
export function tdEmptyParseHint(text: string): string {
  if (!text.trim()) {
    return 'No text found in this PDF (it may be a scan). Export CSV from EasyWeb instead.'
  }
  if (looksLikeTdCredit(text)) {
    return 'Recognized a TD credit-card PDF but couldn’t parse charges (unexpected layout). Try downloading CSV from EasyWeb.'
  }
  if (looksLikeTdChequing(text)) {
    return 'Recognized a TD chequing PDF but couldn’t parse transactions (spaced text layout may have changed). Try downloading CSV from EasyWeb.'
  }
  return 'Recognized a TD PDF but couldn’t parse transactions. Try downloading CSV from EasyWeb.'
}

/**
 * Parse TD Canada Trust PDFs: spaced-glyph chequing statements and
 * First Class Travel / Cash Back credit statements.
 */
export function parseTdStatement(raw: string): ParsedStatementRow[] {
  const credit = parseTdCreditStatement(raw)
  const chequing = parseTdChequingStatement(raw)

  if (looksLikeTdChequing(raw) && chequing.length > 0) return chequing
  if (looksLikeTdCredit(raw) && credit.length > 0) return credit
  // Prefer the richer parse when markers are ambiguous.
  if (credit.length >= chequing.length && credit.length > 0) return credit
  if (chequing.length > 0) return chequing
  return credit
}

/**
 * Credit layout (pdf.js or pypdf):
 *   JUN 9  JUN 12  WAL-MART … $6.73
 *   JUN 9 JUN 12 $6.73WAL-MART …
 * Prefer posting date (2nd column), like Amex.
 */
export function parseTdCreditStatement(raw: string): ParsedStatementRow[] {
  const accountId = suggestTdAccount(raw)
  const period = guessCreditPeriod(raw)
  const rows: ParsedStatementRow[] = []

  const collapsed = raw.replace(/\r/g, '\n')
  const monTok = '(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)'
  const head = new RegExp(
    `^\\s*(${monTok})\\s+(\\d{1,2})\\s+(${monTok})\\s+(\\d{1,2})\\s+(.+)$`,
    'i',
  )
  const moneyToken =
    /(-?\$?\d{1,3}(?:,\d{3})*\.\d{2}|-?\d+\.\d{2})/g

  for (const original of collapsed.split(/\n/)) {
    // Drop side-column summaries pdf.js sometimes concatenates onto the row.
    let line = original
      .trim()
      .replace(/ {2,}/g, ' ')
      .replace(/\s+Interest\s+-?\$?[\d,]+\.\d{2}.*$/i, '')
      .replace(/\s+Fees\s+-?\$?[\d,]+\.\d{2}.*$/i, '')
      .replace(/\s+Previous\b.*$/i, '')
      .replace(/\s+Payments\b.*$/i, '')
      .replace(/\s+Purchases\b.*$/i, '')
      .replace(/\s+Cash Advances\b.*$/i, '')
      .replace(/\s+Sub-?total\b.*$/i, '')
      .replace(/\s+NEW\s+BALANCE\b.*$/i, '')

    if (!line || line.length < 10) continue
    if (
      /previous\s+statement\s+balance|new\s+balance|minimum\s+payment|credit\s+limit|available\s+credit/i.test(
        line,
      )
    ) {
      continue
    }
    if (/^DATE\s+DATE|^TRANSACTION\s+POSTING/i.test(line)) continue

    const match = line.match(head)
    if (!match) continue

    const postMon = match[3]
    const postDay = Number(match[4])
    let rest = match[5].trim()

    const moneys = [...rest.matchAll(moneyToken)]
    if (moneys.length === 0) continue
    // Prefer the first money token (charge amount). Side totals are stripped above.
    const moneyMatch = moneys[0]
    const amountRaw = moneyMatch[1]
    const moneyIndex = moneyMatch.index ?? 0

    let merchantRaw: string
    if (moneyIndex === 0) {
      // $6.73WAL-MART… or $6.73 WAL-MART…
      merchantRaw = rest.slice(amountRaw.length).trim()
    } else {
      merchantRaw = rest.slice(0, moneyIndex).trim()
    }

    const date = dateFromMonthDay(postMon, postDay, period)
    if (!date) continue

    let amount = parseMoney(amountRaw)
    if (!Number.isFinite(amount) || amount === 0) continue

    let merchant = cleanCreditMerchant(merchantRaw)
    if (!merchant || merchant.length < 2) continue
    if (isCreditJunkMerchant(merchant)) continue

    const isPayment = /payment\s*-?\s*thank\s*you|payment\s+received/i.test(
      merchant,
    )
    const isRefund =
      amount < 0 ||
      isPayment ||
      /refund|return|credit\s*adjustment/i.test(merchant)

    if (amount < 0) amount = Math.abs(amount)

    rows.push({
      date,
      amount,
      merchant,
      suggestedCategoryId: suggestCategory(merchant),
      suggestedAccountId: accountId,
      isRefund,
      likelyDeposit: isPayment,
    })
  }

  return dedupe(rows)
}

/** TD Canada chequing PDFs often extract with a space between every character. */
export function parseTdChequingStatement(raw: string): ParsedStatementRow[] {
  const year = guessChequingYear(raw)
  const rows: ParsedStatementRow[] = []

  const tail = new RegExp(
    `((?:${MON}) ?\\d ?\\d)(?: ((?:\\d ?)+(?: ?, ?(?:\\d ?){3})* ?\\. ?\\d ?\\d))?(?:\\s*O ?D)?\\s*$`,
    'i',
  )
  const amountEnd =
    /((?:\d ?)+(?: ?, ?(?:\d ?){3})* ?\. ?\d ?\d)\s*$/

  for (const original of raw.split(/\n/)) {
    // pdf.js often inserts extra spaces between glyphs (breaks date/amount match).
    const line = original.trim().replace(/ {2,}/g, ' ')
    if (!line) continue
    const tm = line.match(tail)
    if (!tm || tm.index === undefined) continue
    const date = parseMonthDay(tm[1], year)
    if (!date) continue
    const before = line.slice(0, tm.index).trimEnd()

    let merchant = ''
    let amount = 0
    let deposit = false

    if (/P ?O ?D ?P ?F ?E ?E/i.test(before)) {
      const fee = before.match(
        /(?:2 ?0 ?2 ?\d) ((?:\d ?){1,3} ?\. ?\d ?\d)\s*$/,
      )
      const am = fee ?? before.match(amountEnd)
      if (!am) continue
      merchant = 'PODP FEE'
      amount = parseMoney(am[1])
    } else if (/T ?F ?R ?- ?(?:F ?R|T ?O)/i.test(before)) {
      const tfr = before.match(
        /^(.*?T ?F ?R ?- ?(F ?R|T ?O) )((?:\d ?){7}) ((?:\d ?)+(?: ?, ?(?:\d ?){3})* ?\. ?\d ?\d)\s*$/i,
      )
      if (!tfr) continue
      merchant = `${despace(tfr[1])}${tfr[3].replace(/\s/g, '')}`
      amount = parseMoney(tfr[4])
      deposit = /F ?R/i.test(tfr[2])
    } else if (/P ?T ?S ?T ?O/i.test(before)) {
      const pts = before.match(/((?:\d ?){1,3} ?\. ?\d ?\d)\s*$/)
      if (!pts) continue
      merchant = 'PTS TO'
      amount = parseMoney(pts[1])
    } else if (/A ?T ?M ?W ?\/ ?D/i.test(before)) {
      const withTerm = before.match(
        /^(.*?A ?T ?M ?W ?\/ ?D )((?:\d ?){6}) ((?:\d ?)+ ?\. ?\d ?\d)\s*$/i,
      )
      const noTerm = before.match(
        /^(.*?A ?T ?M ?W ?\/ ?D )((?:\d ?)+ ?\. ?\d ?\d)\s*$/i,
      )
      if (withTerm && !/NON/i.test(before)) {
        merchant = `${despace(withTerm[1])}${withTerm[2].replace(/\s/g, '')}`
        amount = parseMoney(withTerm[3])
      } else if (noTerm) {
        merchant = despace(noTerm[1])
        amount = parseMoney(noTerm[2])
      } else {
        continue
      }
    } else {
      const am = before.match(amountEnd)
      if (!am) continue
      amount = parseMoney(am[1])
      merchant = despace(before.slice(0, am.index).trimEnd())
      if (/PAY\s*$/i.test(merchant) || /PAY$/i.test(merchant.replace(/\s/g, ''))) {
        deposit = true
      }
    }

    const key = merchant.replace(/\s+/g, '').toUpperCase()
    if (!merchant || amount === 0) continue
    if (key.includes('STARTINGBALANCE') || key.includes('CLOSINGBALANCE')) {
      continue
    }
    if (key.includes('YOUROVERDRAFT') || key.includes('OVERDRAFTLIMIT')) {
      continue
    }

    const pretty = prettifyMerchant(merchant)
    rows.push({
      date,
      amount,
      merchant: pretty,
      suggestedCategoryId: suggestCategory(pretty),
      suggestedAccountId: 'debit' as AccountId,
      isRefund: false,
      likelyDeposit: deposit,
    })
  }

  return dedupe(rows)
}

interface CreditPeriod {
  startMonth: number
  startYear: number
  endMonth: number
  endYear: number
}

function guessCreditPeriod(raw: string): CreditPeriod {
  const period = raw.match(
    /STATEMENT\s*PERIOD[:\s]+([A-Za-z]+)\s+(\d{1,2}),?\s*(20\d{2})\s+to\s+([A-Za-z]+)\s+(\d{1,2}),?\s*(20\d{2})/i,
  )
  if (period) {
    const startMonth = MONTHS[period[1].slice(0, 3).toUpperCase()]
    const endMonth = MONTHS[period[4].slice(0, 3).toUpperCase()]
    if (startMonth && endMonth) {
      return {
        startMonth,
        startYear: Number(period[3]),
        endMonth,
        endYear: Number(period[6]),
      }
    }
  }

  const statementDate = raw.match(
    /STATEMENT\s*DATE[:\s]+([A-Za-z]+)\s+(\d{1,2}),?\s*(20\d{2})/i,
  )
  if (statementDate) {
    const endMonth = MONTHS[statementDate[1].slice(0, 3).toUpperCase()]
    const endYear = Number(statementDate[3])
    if (endMonth) {
      const startMonth = endMonth === 1 ? 12 : endMonth - 1
      const startYear = endMonth === 1 ? endYear - 1 : endYear
      return { startMonth, startYear, endMonth, endYear }
    }
  }

  const y = guessChequingYear(raw)
  return { startMonth: 1, startYear: y, endMonth: 12, endYear: y }
}

function dateFromMonthDay(
  monTok: string,
  day: number,
  period: CreditPeriod,
): string | null {
  const month = MONTHS[monTok.slice(0, 3).toUpperCase()]
  if (!month || day < 1 || day > 31) return null
  const year = yearForPostingMonth(month, period)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function yearForPostingMonth(month: number, period: CreditPeriod): number {
  if (period.startYear === period.endYear) return period.startYear
  // Period crosses calendar year (e.g. Dec → Jan): months from start side use startYear.
  if (month >= period.startMonth) return period.startYear
  return period.endYear
}

function cleanCreditMerchant(raw: string): string {
  return raw
    .replace(/\s+/g, ' ')
    .replace(/\s+\d{3}-\d{3}-\d{4}\b/g, '')
    .replace(/\s+\d{800,}.*$/g, '')
    .replace(/\?S\b/g, "'S") // MCDONALD?S from PDF encoding
    .trim()
}

function isCreditJunkMerchant(merchant: string): boolean {
  const key = merchant.replace(/\s+/g, '').toUpperCase()
  return (
    /^(PREVIOUS|NEWBALANCE|MINIMUM|PAYMENTINFORMATION|CREDITLIMIT|AVAILABLE|ANNUAL|ESTIMATED|CALCULATING|SUB-?TOTAL|TDPOINTS|CONTACT)/i.test(
      key,
    ) || /^(PAGE|DATE|ACTIVITY|AMOUNT|DESCRIPTION)/i.test(merchant)
  )
}

function guessChequingYear(raw: string): number {
  const squeezed = raw.replace(/ /g, '')
  // Prefer period ranges like "JUL01/25-JUL31/25" over any earlier 20xx.
  const range = squeezed.match(
    /(?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)\d{1,2}\/(\d{2})/i,
  )
  if (range) {
    const yy = Number(range[1])
    return yy >= 70 ? 1900 + yy : 2000 + yy
  }
  const full = [...raw.matchAll(/\b(20\d{2})\b/g)].map((m) => Number(m[1]))
  if (full.length > 0) {
    const counts = new Map<number, number>()
    for (const y of full) counts.set(y, (counts.get(y) ?? 0) + 1)
    const dominant = [...counts.entries()].sort(
      (a, b) => b[1] - a[1] || b[0] - a[0],
    )[0]?.[0]
    if (dominant) return dominant
  }
  return new Date().getFullYear()
}

function parseMonthDay(token: string, year: number): string | null {
  const compact = token.replace(/\s+/g, '').toUpperCase()
  const m = compact.match(/^([A-Z]{3})(\d{1,2})$/)
  if (!m) return null
  const month = MONTHS[m[1]]
  const day = Number(m[2])
  if (!month || day < 1 || day > 31) return null
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function parseMoney(raw: string): number {
  return Number(raw.replace(/[$,\s]/g, ''))
}

function despace(value: string): string {
  let s = value
  let prev = ''
  while (prev !== s) {
    prev = s
    s = s.replace(/([A-Za-z*]) ([A-Za-z*])/g, '$1$2')
  }
  prev = ''
  while (prev !== s) {
    prev = s
    s = s.replace(/([A-Za-z*]) ([0-9])/g, '$1$2')
    s = s.replace(/([A-Za-z*])([0-9]) ([0-9])/g, '$1$2$3')
  }
  return s.replace(/\s+/g, ' ').trim()
}

function prettifyMerchant(raw: string): string {
  let s = raw.replace(/\s+/g, ' ').trim()
  s = s.replace(/COSTCOWHOLESAL/i, 'COSTCO WHOLESALE')
  s = s.replace(/GOODLIFECLUBSMSP/i, 'GOODLIFE CLUBS')
  s = s.replace(/CDLSIMSP/i, 'CDLSI MSP')
  s = s.replace(/SENDE\s*-?\s*TFR/i, 'SEND E-TFR')
  s = s.replace(/E\s*-?\s*TRANSFER/i, 'E-TRANSFER')
  s = s.replace(/E\s*-?\s*TFR/i, 'E-TFR')
  s = s.replace(/NON\s*-?\s*TD\s*ATM/i, 'NON-TD ATM')
  s = s.replace(/TD\s*ATM/i, 'TD ATM')
  s = s.replace(/ATMW\s*\/\s*D/i, 'ATM W/D')
  s = s.replace(/MONTHLYACCOUNTFEE/i, 'MONTHLY ACCOUNT FEE')
  s = s.replace(/OVERDRAFTINTEREST/i, 'OVERDRAFT INTEREST')
  s = s.replace(/SlowNinjaIncoPAY/i, 'Slow Ninja Inc PAY')
  return s
}

function dedupe(rows: ParsedStatementRow[]): ParsedStatementRow[] {
  const seen = new Set<string>()
  const out: ParsedStatementRow[] = []
  for (const row of rows) {
    const key = `${row.date}|${row.amount}|${row.merchant.toLowerCase()}|${row.isRefund ? 1 : 0}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(row)
  }
  return out
}
