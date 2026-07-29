import { BUDGETS, CATEGORIES, PEOPLE } from '../data/seed'
import type {
  CategoryId,
  CategoryRollup,
  HouseholdMonthSummary,
  MonthPersonTotals,
  PersonId,
  Transaction,
} from '../types'

function money(n: number): number {
  return Math.round(n * 100) / 100
}

export function budgetFor(personId: PersonId, categoryId: CategoryId): number {
  return (
    BUDGETS.find((b) => b.personId === personId && b.categoryId === categoryId)
      ?.amount ?? 0
  )
}

export function necessitiesBudget(personId: PersonId): number {
  return money(
    BUDGETS.filter((b) => b.personId === personId).reduce(
      (sum, b) => sum + b.amount,
      0,
    ),
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
          !t.isRefund,
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

export function personGrossSpend(
  transactions: Transaction[],
  personId: PersonId,
): number {
  return money(
    transactions
      .filter((t) => t.personId === personId && !t.isRefund)
      .reduce((sum, t) => sum + t.amount, 0),
  )
}

export function rollupCategories(
  transactions: Transaction[],
  personId: PersonId,
): CategoryRollup[] {
  return CATEGORIES.map((cat) => {
    const budget = budgetFor(personId, cat.id)
    const spent = categorySpend(transactions, personId, cat.id)
    return {
      categoryId: cat.id,
      label: cat.label,
      kind: cat.kind,
      budget,
      spent,
      leftover: money(budget - spent),
    }
  }).filter((row) => row.budget > 0 || row.spent > 0)
}

export function personTotals(
  transactions: Transaction[],
  personId: PersonId,
): MonthPersonTotals {
  const grossSpend = personGrossSpend(transactions, personId)
  const refunds = personRefunds(transactions, personId)
  const netSpend = money(grossSpend - refunds)
  const categories = rollupCategories(transactions, personId)
  const categoryLeftover = money(
    categories
      .filter((c) => c.kind === 'variable')
      .reduce((sum, c) => sum + c.leftover, 0),
  )
  return {
    personId,
    grossSpend,
    refunds,
    netSpend,
    categoryLeftover,
    vsNecessitiesBudget: money(necessitiesBudget(personId) - netSpend),
  }
}

export function summarizeMonth(
  monthId: string,
  label: string,
  transactions: Transaction[],
): HouseholdMonthSummary {
  const monthTx = transactions.filter((t) => t.monthId === monthId)
  const people = PEOPLE.map((p) => personTotals(monthTx, p.id))
  const combinedSpend = money(people.reduce((sum, p) => sum + p.netSpend, 0))
  const combinedSalary = money(
    PEOPLE.reduce((sum, p) => sum + p.monthlyIncome, 0),
  )
  // Household category view: Trevor's detailed categories (primary ledger)
  const categories = rollupCategories(monthTx, 'trevor')

  return {
    monthId,
    label,
    people,
    combinedSpend,
    combinedSalary,
    leftover: money(combinedSalary - combinedSpend),
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
