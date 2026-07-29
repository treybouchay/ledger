import type { AccountId, CategoryId, PersonId } from '../types'
import type { ParsedCsvRow } from './parseCsv'

export interface ReviewDraftRow {
  id: string
  date: string
  amount: number
  merchant: string
  categoryId: CategoryId
  accountId: AccountId
  personId: PersonId
  isRefund: boolean
  included: boolean
  suggestedCategoryId: CategoryId
}

export function draftsFromParsed(
  rows: ParsedCsvRow[],
  personId: PersonId,
  defaultAccountId: AccountId,
): ReviewDraftRow[] {
  return rows.map((row, i) => {
    const accountId =
      row.suggestedAccountId === 'other'
        ? defaultAccountId
        : row.suggestedAccountId
    return {
      id: `draft-${Date.now()}-${i}`,
      date: row.date,
      amount: Math.abs(row.amount),
      merchant: row.merchant,
      categoryId: row.suggestedCategoryId,
      accountId,
      personId,
      isRefund: row.amount < 0 || row.isRefund === true,
      included: true,
      suggestedCategoryId: row.suggestedCategoryId,
    }
  })
}

export function countNeedsReview(rows: ReviewDraftRow[]): number {
  return rows.filter(
    (r) =>
      r.included &&
      (r.categoryId === 'other' || r.categoryId !== r.suggestedCategoryId),
  ).length
}
