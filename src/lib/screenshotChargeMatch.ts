import type { Transaction } from '../types'
import { daysApart, merchantsSimilar } from './duplicates'
import type { ParsedStatementRow } from './parseStatementText'

function amountsEqual(a: number, b: number): boolean {
  return Math.round(Math.abs(a) * 100) / 100 === Math.round(Math.abs(b) * 100) / 100
}

function fileBase(name: string): string {
  return name.split(/[/\\]/).pop()?.toLowerCase().trim() ?? name.toLowerCase()
}

/** True when a transaction’s sourceFile is this screenshot page. */
export function sourceFileMatchesPage(
  sourceFile: string | undefined,
  pageFile: string,
): boolean {
  if (!sourceFile?.trim() || !pageFile.trim()) return false
  if (sourceFile === pageFile) return true
  return fileBase(sourceFile) === fileBase(pageFile)
}

/** True when at least one tx is tagged to an individual screenshot in the batch. */
export function hasPerFileSourceTags(
  transactions: Transaction[],
  pageFiles: string[],
): boolean {
  if (pageFiles.length === 0) return false
  const bases = new Set(pageFiles.map(fileBase))
  return transactions.some((t) => {
    if (!t.sourceFile) return false
    return bases.has(fileBase(t.sourceFile))
  })
}

/**
 * Pair import transactions to OCR rows from one screenshot (amount + merchant,
 * ±2 days). Each tx is used at most once.
 */
export function matchTransactionsToScreenshotRows(
  transactions: Transaction[],
  rows: ParsedStatementRow[],
): Transaction[] {
  const remaining = [...transactions]
  const matched: Transaction[] = []

  for (const row of rows) {
    const amount = Math.abs(row.amount)
    const isRefund = row.amount < 0 || row.isRefund === true
    const scored = remaining
      .map((t, index) => {
        if (!amountsEqual(t.amount, amount)) return null
        if (Boolean(t.isRefund) !== isRefund) return null
        if (Boolean(t.isCashIn)) return null
        const sim = merchantsSimilar(t.merchant, row.merchant)
        if (sim === 'none') return null
        const dayGap = daysApart(t.date, row.date)
        if (dayGap > 2) return null
        const score =
          (sim === 'strong' ? 40 : 20) +
          (t.date === row.date ? 10 : 0) -
          dayGap
        return { t, index, score }
      })
      .filter((x): x is { t: Transaction; index: number; score: number } =>
        Boolean(x),
      )
      .sort((a, b) => b.score - a.score || a.index - b.index)

    const best = scored[0]
    if (!best) continue
    matched.push(best.t)
    remaining.splice(best.index, 1)
  }

  return matched
}
