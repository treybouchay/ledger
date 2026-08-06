import type { AccountId, PersonId } from '../types'

export type OwnerConfidence = 'high' | 'medium' | 'low'

export interface StatementOwnerDetection {
  personId: PersonId | null
  confidence: OwnerConfidence
  /** Short human note, e.g. "Prepared for Kate Xue". */
  reason?: string
}

const KATE_NAMES = ['kate', 'katherine', 'kathryn', 'katie']
const TREVOR_NAMES = ['trevor']

/**
 * Guess whose statement this is from PDF/CSV text (and optionally the file name).
 * Always allow the UI to override — this is a best-effort hint.
 */
export function detectStatementOwner(
  text: string,
  fileName = '',
): StatementOwnerDetection {
  const compact = collapseSpacedLetters(text)
  const hay = compact.toLowerCase()
  const fileHay = fileName.toLowerCase()

  const prepared = matchPreparedFor(compact)
  if (prepared) return prepared

  const cardholder = matchLabeledName(compact, [
    /card\s*member[:\s]+([A-Za-z][A-Za-z .'-]{1,40})/i,
    /cardholder[:\s]+([A-Za-z][A-Za-z .'-]{1,40})/i,
    /account\s*holder[:\s]+([A-Za-z][A-Za-z .'-]{1,40})/i,
    /customer\s*name[:\s]+([A-Za-z][A-Za-z .'-]{1,40})/i,
    /primary\s*cardmember[:\s]+([A-Za-z][A-Za-z .'-]{1,40})/i,
    // TD First Class / Cash Back header: "MISS KATE FISH 4520 …"
    /\b(?:MISS|MR|MRS|MS)\s+([A-Za-z][A-Za-z .'-]{1,40})\s+\d{4}\b/i,
  ])
  if (cardholder) return cardholder

  const fromFile = personFromToken(fileHay)
  if (fromFile) {
    return {
      personId: fromFile,
      confidence: 'medium',
      reason: `File name mentions ${capitalize(fromFile)}`,
    }
  }

  // Header-ish window: first ~2.5k chars after collapse (covers TD spaced PDFs).
  const header = hay.slice(0, 2500)
  const kateHits = countNameHits(header, KATE_NAMES)
  const trevorHits = countNameHits(header, TREVOR_NAMES)

  if (kateHits > 0 && trevorHits === 0) {
    return {
      personId: 'kate',
      confidence: kateHits >= 2 ? 'high' : 'medium',
      reason: 'Statement text mentions Kate',
    }
  }
  if (trevorHits > 0 && kateHits === 0) {
    return {
      personId: 'trevor',
      confidence: trevorHits >= 2 ? 'high' : 'medium',
      reason: 'Statement text mentions Trevor',
    }
  }
  if (kateHits > trevorHits && kateHits > 0) {
    return {
      personId: 'kate',
      confidence: 'low',
      reason: 'Kate appears more often than Trevor in the header',
    }
  }
  if (trevorHits > kateHits && trevorHits > 0) {
    return {
      personId: 'trevor',
      confidence: 'low',
      reason: 'Trevor appears more often than Kate in the header',
    }
  }

  return { personId: null, confidence: 'low' }
}

/** Prefer account implied by bank type / row suggestions. */
export function suggestAccountFromStatement(
  text: string,
  fileName: string,
  rowAccounts: AccountId[],
): AccountId | null {
  const name = fileName.toLowerCase()
  const hay = text.toLowerCase()

  if (
    hay.includes('american express') ||
    hay.includes('amex bank') ||
    hay.includes('simplycash') ||
    name.includes('amex')
  ) {
    return 'amex'
  }

  if (
    hay.replace(/ /g, '').includes('toronto-dominion') ||
    hay.replace(/ /g, '').includes('toronto–dominion') ||
    hay.includes('easyweb') ||
    hay.includes('td.com') ||
    hay.replace(/ /g, '').includes('firstclasstravel')
  ) {
    const squeezed = hay.replace(/ /g, '')
    if (
      squeezed.includes('allinclusive') ||
      squeezed.includes('startingbalance') ||
      (squeezed.includes('branchno') && squeezed.includes('withdrawals')) ||
      (squeezed.includes('easyline') &&
        (squeezed.includes('withdrawals') || squeezed.includes('deposits')))
    ) {
      return 'debit'
    }
    if (squeezed.includes('firstclasstravel')) return 'first_class'
    if (
      /cash\s*back|visa\s*infinite|credit\s*card|activity\s*description/i.test(
        text,
      ) ||
      squeezed.includes('tdpoints')
    ) {
      return 'td_cashback'
    }
    return 'debit'
  }

  if (name.includes('td') || name.includes('chequing') || name.includes('checking')) {
    return 'debit'
  }

  const counts = new Map<AccountId, number>()
  for (const id of rowAccounts) {
    if (id === 'other') continue
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]
  return top?.[0] ?? null
}

function matchPreparedFor(text: string): StatementOwnerDetection | null {
  const patterns = [
    /prepared\s+for[:\s]+([A-Za-z][A-Za-z .'-]{1,48})/i,
    /statement\s+for[:\s]+([A-Za-z][A-Za-z .'-]{1,48})/i,
  ]
  return matchLabeledName(text, patterns)
}

function matchLabeledName(
  text: string,
  patterns: RegExp[],
): StatementOwnerDetection | null {
  for (const pattern of patterns) {
    const m = text.match(pattern)
    if (!m?.[1]) continue
    const chunk = m[1].trim().split(/[\n,|]/)[0]?.trim() ?? ''
    const person = personFromToken(chunk.toLowerCase())
    if (!person) continue
    return {
      personId: person,
      confidence: 'high',
      reason: `Prepared for / cardholder: ${chunk.slice(0, 40)}`,
    }
  }
  return null
}

function personFromToken(token: string): PersonId | null {
  const t = token.toLowerCase()
  if (KATE_NAMES.some((n) => wordBoundary(t, n))) return 'kate'
  if (TREVOR_NAMES.some((n) => wordBoundary(t, n))) return 'trevor'
  return null
}

function wordBoundary(hay: string, name: string): boolean {
  return new RegExp(`(?:^|[^a-z])${name}(?:[^a-z]|$)`).test(hay)
}

function countNameHits(hay: string, names: string[]): number {
  let n = 0
  for (const name of names) {
    const re = new RegExp(`(?:^|[^a-z])${name}(?:[^a-z]|$)`, 'g')
    n += [...hay.matchAll(re)].length
  }
  return n
}

/**
 * TD PDFs often extract as "K A T E" / "T R E V O R". Collapse single-letter
 * runs so name matching still works.
 */
function collapseSpacedLetters(raw: string): string {
  let s = raw.replace(/\r/g, '\n')
  // "K A T E" → "KATE", "T R E V O R" → "TREVOR"
  s = s.replace(
    /\b([A-Za-z])(?:\s+([A-Za-z])){2,12}\b/g,
    (full) => {
      const letters = full.split(/\s+/)
      if (letters.every((c) => c.length === 1)) return letters.join('')
      return full
    },
  )
  return s
}

function capitalize(id: PersonId): string {
  return id === 'kate' ? 'Kate' : 'Trevor'
}
