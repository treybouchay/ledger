import type { AccountId, CategoryId, PersonId, Transaction } from '../types'
import { resolveAccountForPerson } from './customAccounts'
import { findDuplicateMatch, type MatchStatus } from './duplicates'
import type { ParsedStatementRow } from './parseStatementText'

export interface ReviewDraftRow {
  id: string
  date: string
  amount: number
  merchant: string
  categoryId: CategoryId
  accountId: AccountId
  personId: PersonId
  isRefund: boolean
  isCashIn?: boolean
  included: boolean
  suggestedCategoryId: CategoryId
  matchStatus: MatchStatus
  matchedTransactionId?: string
  matchReason?: string
}

export function draftsFromParsed(
  rows: ParsedStatementRow[],
  personId: PersonId,
  defaultAccountId: AccountId,
  existing: Transaction[],
): ReviewDraftRow[] {
  const batchAccepted: Transaction[] = []
  const drafts: ReviewDraftRow[] = []

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i]
    const accountId = resolveAccountForPerson(
      row.suggestedAccountId === 'other'
        ? defaultAccountId
        : row.suggestedAccountId,
      personId,
    )
    const isRefund = row.amount < 0 || row.isRefund === true
    const amount = Math.abs(row.amount)
    const candidate = {
      personId,
      date: row.date,
      amount,
      merchant: row.merchant,
      isRefund,
    }

    let match = findDuplicateMatch(candidate, existing)

    // Same file: ±1 day same merchant+amount → treat as duplicate and exclude
    // so one statement can’t import both transaction-date and posting-date rows.
    if (match.status === 'new' && batchAccepted.length > 0) {
      const batchMatch = findDuplicateMatch(candidate, batchAccepted)
      if (batchMatch.status === 'duplicate') {
        match = {
          status: 'duplicate',
          matchedTransactionId: batchMatch.matchedTransactionId,
          matchedMerchant: batchMatch.matchedMerchant,
          reason: `Same charge already in this file (±1 day of “${batchMatch.matchedMerchant}” on ${batchAccepted.find((t) => t.id === batchMatch.matchedTransactionId)?.date ?? 'nearby date'})`,
        }
      } else if (batchMatch.status === 'possible') {
        match = {
          status: 'possible',
          matchedTransactionId: batchMatch.matchedTransactionId,
          matchedMerchant: batchMatch.matchedMerchant,
          reason: `Possible double in this file vs “${batchMatch.matchedMerchant}”`,
        }
      }
    }

    const id = `draft-${Date.now()}-${i}`
    const included = match.status !== 'duplicate' && !row.likelyDeposit

    drafts.push({
      id,
      date: row.date,
      amount,
      merchant: row.merchant,
      categoryId: row.suggestedCategoryId,
      accountId,
      personId,
      isRefund,
      isCashIn: false,
      included,
      suggestedCategoryId: row.suggestedCategoryId,
      matchStatus: match.status,
      matchedTransactionId: match.matchedTransactionId,
      matchReason: row.likelyDeposit
        ? 'Deposit / transfer in — unchecked by default'
        : match.reason,
    })

    if (included) {
      batchAccepted.push({
        id,
        personId,
        monthId: row.date.slice(0, 7),
        date: row.date,
        amount,
        merchant: row.merchant,
        accountId,
        categoryId: row.suggestedCategoryId,
        isRefund,
        source: 'csv',
      })
    }
  }

  return drafts
}

/** Included rows that need manual attention before import. */
export function rowNeedsReview(row: ReviewDraftRow): boolean {
  return (
    row.included &&
    (row.categoryId === 'other' ||
      row.categoryId !== row.suggestedCategoryId ||
      row.matchStatus === 'possible')
  )
}

export function countNeedsReview(rows: ReviewDraftRow[]): number {
  return rows.filter(rowNeedsReview).length
}

export type NeedsLookFilter = 'all' | 'needs_look' | 'hide_needs_look'

export function filterByNeedsLook(
  rows: ReviewDraftRow[],
  filter: NeedsLookFilter,
): ReviewDraftRow[] {
  if (filter === 'all') return rows
  if (filter === 'needs_look') return rows.filter(rowNeedsReview)
  return rows.filter((r) => !rowNeedsReview(r))
}

export function countDuplicates(rows: ReviewDraftRow[]): number {
  return rows.filter((r) => r.matchStatus === 'duplicate').length
}
