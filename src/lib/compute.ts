import { getAllAccounts } from './customAccounts'
import {
  getAllBudgets,
  getAllCategories,
  getPeople,
  getPersonIncome,
} from './customCategories'
import type {
  AccountId,
  CategoryId,
  CategoryRollup,
  HouseholdMonthSummary,
  MonthPersonTotals,
  PersonId,
  Transaction,
} from '../types'

export interface HouseholdFixedLine {
  categoryId: CategoryId
  label: string
  icon: string
  trevorBudget: number
  kateBudget: number
  budget: number
  trevorSpent: number
  kateSpent: number
  spent: number
}

function money(n: number): number {
  return Math.round(n * 100) / 100
}

/** Refund or cash deposit — money in, not spend. */
export function isMoneyIn(
  t: Pick<Transaction, 'isRefund' | 'isCashIn'>,
): boolean {
  return Boolean(t.isRefund || t.isCashIn)
}

export function budgetFor(personId: PersonId, categoryId: CategoryId): number {
  return (
    getAllBudgets().find(
      (b) => b.personId === personId && b.categoryId === categoryId,
    )?.amount ?? 0
  )
}

export function necessitiesBudget(personId: PersonId): number {
  return money(
    getAllBudgets()
      .filter((b) => b.personId === personId)
      .reduce((sum, b) => sum + b.amount, 0),
  )
}

export function budgetByKind(
  personId: PersonId,
  kind: 'fixed' | 'variable',
): number {
  const categories = getAllCategories()
  return money(
    getAllBudgets()
      .filter((b) => {
        if (b.personId !== personId) return false
        return categories.find((c) => c.id === b.categoryId)?.kind === kind
      })
      .reduce((sum, b) => sum + b.amount, 0),
  )
}

export function spendByKind(
  transactions: Transaction[],
  personId: PersonId,
  kind: 'fixed' | 'variable',
): number {
  const ids = new Set(
    getAllCategories()
      .filter((c) => c.kind === kind)
      .map((c) => c.id),
  )
  return money(
    transactions
      .filter(
        (t) =>
          t.personId === personId && ids.has(t.categoryId) && !isMoneyIn(t),
      )
      .reduce((sum, t) => sum + t.amount, 0),
  )
}

export function categorySpend(
  transactions: Transaction[],
  personId: PersonId,
  categoryId: CategoryId,
): number {
  return money(
    transactions
      .filter(
        (t) =>
          t.personId === personId &&
          t.categoryId === categoryId &&
          !isMoneyIn(t),
      )
      .reduce((sum, t) => sum + t.amount, 0),
  )
}

export function personRefunds(
  transactions: Transaction[],
  personId: PersonId,
): number {
  return money(
    transactions
      .filter((t) => t.personId === personId && t.isRefund)
      .reduce((sum, t) => sum + t.amount, 0),
  )
}

export function personCashIns(
  transactions: Transaction[],
  personId: PersonId,
): number {
  return money(
    transactions
      .filter((t) => t.personId === personId && t.isCashIn && !t.isRefund)
      .reduce((sum, t) => sum + t.amount, 0),
  )
}

export function personGrossSpend(
  transactions: Transaction[],
  personId: PersonId,
): number {
  return money(
    transactions
      .filter((t) => t.personId === personId && !isMoneyIn(t))
      .reduce((sum, t) => sum + t.amount, 0),
  )
}

export function rollupCategories(
  transactions: Transaction[],
  personId: PersonId,
): CategoryRollup[] {
  return getAllCategories()
    .map((cat) => {
      const budget = budgetFor(personId, cat.id)
      const spent = categorySpend(transactions, personId, cat.id)
      return {
        categoryId: cat.id,
        label: cat.label,
        icon: cat.icon,
        kind: cat.kind,
        budget,
        spent,
        leftover: money(budget - spent),
      }
    })
    .filter((row) => row.budget > 0 || row.spent > 0)
}

export interface AccountRollup {
  accountId: AccountId
  label: string
  icon: string
  grossSpend: number
  refunds: number
  cashIns: number
  netSpend: number
  transactionCount: number
  share: number
}

export function rollupAccounts(transactions: Transaction[]): AccountRollup[] {
  const byId = new Map(
    getAllAccounts().map((a) => [a.id, a] as const),
  )
  for (const t of transactions) {
    if (!byId.has(t.accountId)) {
      byId.set(t.accountId, {
        id: t.accountId,
        label: t.accountId,
        icon: '💳',
        owner: 'shared',
      })
    }
  }

  const rows = [...byId.values()].map((account) => {
    const rowsForAccount = transactions.filter((t) => t.accountId === account.id)
    const grossSpend = money(
      rowsForAccount
        .filter((t) => !isMoneyIn(t))
        .reduce((sum, t) => sum + t.amount, 0),
    )
    const refunds = money(
      rowsForAccount
        .filter((t) => t.isRefund)
        .reduce((sum, t) => sum + t.amount, 0),
    )
    const cashIns = money(
      rowsForAccount
        .filter((t) => t.isCashIn && !t.isRefund)
        .reduce((sum, t) => sum + t.amount, 0),
    )
    return {
      accountId: account.id,
      label: account.label,
      icon: account.icon,
      grossSpend,
      refunds,
      cashIns,
      netSpend: money(grossSpend - refunds - cashIns),
      transactionCount: rowsForAccount.length,
      share: 0,
    }
  }).filter((row) => row.transactionCount > 0)

  const totalNet = money(rows.reduce((sum, row) => sum + Math.max(row.netSpend, 0), 0))
  return rows
    .map((row) => ({
      ...row,
      share:
        totalNet > 0 && row.netSpend > 0
          ? money((row.netSpend / totalNet) * 100)
          : 0,
    }))
    .sort((a, b) => b.netSpend - a.netSpend)
}

export interface MerchantRollup {
  merchant: string
  spent: number
  refunds: number
  cashIns: number
  transactionCount: number
  share: number
}

/** Rank merchants by gross spend within a category (or any tx set). */
export function rollupMerchants(transactions: Transaction[]): MerchantRollup[] {
  const byMerchant = new Map<
    string,
    { spent: number; refunds: number; cashIns: number; transactionCount: number }
  >()

  for (const t of transactions) {
    const key = t.merchant.trim() || 'Unknown'
    const current = byMerchant.get(key) ?? {
      spent: 0,
      refunds: 0,
      cashIns: 0,
      transactionCount: 0,
    }
    if (t.isRefund) {
      current.refunds = money(current.refunds + t.amount)
    } else if (t.isCashIn) {
      current.cashIns = money(current.cashIns + t.amount)
    } else {
      current.spent = money(current.spent + t.amount)
    }
    current.transactionCount += 1
    byMerchant.set(key, current)
  }

  const totalSpent = money(
    [...byMerchant.values()].reduce((sum, row) => sum + row.spent, 0),
  )

  return [...byMerchant.entries()]
    .map(([merchant, row]) => ({
      merchant,
      spent: row.spent,
      refunds: row.refunds,
      cashIns: row.cashIns,
      transactionCount: row.transactionCount,
      share:
        totalSpent > 0 && row.spent > 0
          ? money((row.spent / totalSpent) * 100)
          : 0,
    }))
    .sort(
      (a, b) =>
        b.spent - a.spent ||
        b.transactionCount - a.transactionCount ||
        a.merchant.localeCompare(b.merchant),
    )
}

export function personTotals(
  transactions: Transaction[],
  personId: PersonId,
): MonthPersonTotals {
  const income = getPersonIncome(personId)
  const grossSpend = personGrossSpend(transactions, personId)
  const refunds = personRefunds(transactions, personId)
  const cashIns = personCashIns(transactions, personId)
  const netSpend = money(grossSpend - refunds - cashIns)
  const categories = rollupCategories(transactions, personId)
  const fixedBudget = budgetByKind(personId, 'fixed')
  const variableBudget = budgetByKind(personId, 'variable')
  const fixedSpent = spendByKind(transactions, personId, 'fixed')
  const variableSpent = spendByKind(transactions, personId, 'variable')
  const afterFixed = money(income - fixedBudget)
  const categoryLeftover = money(
    categories
      .filter((c) => c.kind === 'variable')
      .reduce((sum, c) => sum + c.leftover, 0),
  )
  return {
    personId,
    income,
    grossSpend,
    refunds,
    cashIns,
    netSpend,
    fixedBudget,
    variableBudget,
    fixedSpent,
    variableSpent,
    afterFixed,
    categoryLeftover,
    stillAvailable: money(variableBudget - variableSpent),
    vsNecessitiesBudget: money(necessitiesBudget(personId) - netSpend),
  }
}

/** Fixed bill lines for household overview — budget + spent per person. */
export function rollupHouseholdFixed(
  transactions: Transaction[],
): HouseholdFixedLine[] {
  return getAllCategories()
    .filter((cat) => cat.kind === 'fixed')
    .map((cat) => {
      const trevorBudget = budgetFor('trevor', cat.id)
      const kateBudget = budgetFor('kate', cat.id)
      const trevorSpent = categorySpend(transactions, 'trevor', cat.id)
      const kateSpent = categorySpend(transactions, 'kate', cat.id)
      const budget = money(trevorBudget + kateBudget)
      const spent = money(trevorSpent + kateSpent)
      return {
        categoryId: cat.id,
        label: cat.label,
        icon: cat.icon,
        trevorBudget,
        kateBudget,
        budget,
        trevorSpent,
        kateSpent,
        spent,
      }
    })
    .filter((row) => row.budget > 0 || row.spent > 0)
}

/** Income − planned fixed bills − variable spent (“On track to save”). */
export function onTrackToSave(row: {
  income: number
  fixedBudget: number
  variableSpent: number
}): number {
  return money(row.income - row.fixedBudget - row.variableSpent)
}

export interface MonthEndSaveLine {
  id: 'trevor' | 'kate' | 'both'
  label: string
  income: number
  plannedFixed: number
  variableBudget: number
  variableSpent: number
  onTrackToSave: number
}

/** Same OVER rule as Variable budget used insight cards: spent past the planned cap. */
export function isVariableBudgetOver(
  variableSpent: number,
  variableBudget: number,
): boolean {
  return variableBudget > 0
    ? variableSpent > variableBudget
    : variableSpent > 0
}

/** Per-person + household rows for the Month-end summary reconciliation. */
export function monthEndSaveLines(
  people: MonthPersonTotals[],
): MonthEndSaveLine[] {
  const trevor = people.find((p) => p.personId === 'trevor')
  const kate = people.find((p) => p.personId === 'kate')
  if (!trevor || !kate) return []

  const trevorSave = onTrackToSave(trevor)
  const kateSave = onTrackToSave(kate)

  return [
    {
      id: 'trevor',
      label: 'Trevor',
      income: trevor.income,
      plannedFixed: trevor.fixedBudget,
      variableBudget: trevor.variableBudget,
      variableSpent: trevor.variableSpent,
      onTrackToSave: trevorSave,
    },
    {
      id: 'kate',
      label: 'Kate',
      income: kate.income,
      plannedFixed: kate.fixedBudget,
      variableBudget: kate.variableBudget,
      variableSpent: kate.variableSpent,
      onTrackToSave: kateSave,
    },
    {
      id: 'both',
      label: 'Both',
      income: money(trevor.income + kate.income),
      plannedFixed: money(trevor.fixedBudget + kate.fixedBudget),
      variableBudget: money(trevor.variableBudget + kate.variableBudget),
      variableSpent: money(trevor.variableSpent + kate.variableSpent),
      onTrackToSave: money(trevorSave + kateSave),
    },
  ]
}

export function summarizeMonth(
  monthId: string,
  label: string,
  transactions: Transaction[],
): HouseholdMonthSummary {
  const monthTx = transactions.filter((t) => t.monthId === monthId)
  const people = getPeople().map((p) => personTotals(monthTx, p.id))
  const combinedSpend = money(people.reduce((sum, p) => sum + p.netSpend, 0))
  const combinedSalary = money(
    getPeople().reduce((sum, p) => sum + p.monthlyIncome, 0),
  )
  const fixedBudget = money(people.reduce((sum, p) => sum + p.fixedBudget, 0))
  const variableBudget = money(
    people.reduce((sum, p) => sum + p.variableBudget, 0),
  )
  const fixedSpent = money(people.reduce((sum, p) => sum + p.fixedSpent, 0))
  const variableSpent = money(
    people.reduce((sum, p) => sum + p.variableSpent, 0),
  )
  const afterFixed = money(combinedSalary - fixedBudget)
  // Household category view: Trevor's detailed categories (primary ledger)
  const categories = rollupCategories(monthTx, 'trevor')

  return {
    monthId,
    label,
    people,
    combinedSpend,
    combinedSalary,
    leftover: money(combinedSalary - combinedSpend),
    fixedBudget,
    variableBudget,
    fixedSpent,
    variableSpent,
    afterFixed,
    stillAvailable: money(afterFixed - variableSpent),
    categories,
  }
}

export function formatMoney(n: number): string {
  const abs = Math.abs(n).toLocaleString('en-CA', {
    style: 'currency',
    currency: 'CAD',
  })
  return n < 0 ? `−${abs}` : abs
}
