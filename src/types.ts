export type PersonId = 'trevor' | 'kate'

export type CategoryKind = 'fixed' | 'variable'

export type CategoryId =
  | 'water'
  | 'gas_utility'
  | 'elexicon'
  | 'car_payment'
  | 'daycare'
  | 'nanny'
  | 'therapy'
  | 'lens'
  | 'one_time'
  | 'cj_food'
  | 'pet_insurance'
  | 'restaurants'
  | 'take_out'
  | 'coffee'
  | 'cellphone'
  | 'entertainment'
  | 'amazon'
  | 'internet'
  | 'mortgage'
  | 'taxes'
  | 'home_car_insurance'
  | 'gas_vehicle'
  | 'netflix'
  | 'amazon_prime'
  | 'abilities'
  | 'gym'
  | 'clothes'
  | 'isla'
  | 'liquor'
  | 'groceries'
  | 'factor'
  | 'spotify'
  | 'apple_tv'
  | 'work_subscription'
  | 'trevor_car'
  | 'kate_car'
  | 'other'

export type AccountId =
  | 'debit'
  | 'td_cashback'
  | 'amex'
  | 'first_class'
  | 'other'

export interface Person {
  id: PersonId
  name: string
  monthlyIncome: number
}

export interface Category {
  id: CategoryId
  label: string
  kind: CategoryKind
  /** When true, spent comes from tagged ledger transactions (sheet columns). */
  ledgerTracked: boolean
}

export interface Account {
  id: AccountId
  label: string
}

export interface BudgetLine {
  categoryId: CategoryId
  personId: PersonId
  amount: number
}

export interface Transaction {
  id: string
  personId: PersonId
  monthId: string
  date: string
  amount: number
  merchant: string
  accountId: AccountId
  categoryId: CategoryId
  notes?: string
  isRefund?: boolean
  source: 'seed' | 'manual' | 'csv'
}

export interface MonthPersonTotals {
  personId: PersonId
  grossSpend: number
  refunds: number
  netSpend: number
  categoryLeftover: number
  vsNecessitiesBudget: number
}

export interface CategoryRollup {
  categoryId: CategoryId
  label: string
  kind: CategoryKind
  budget: number
  spent: number
  leftover: number
}

export interface HouseholdMonthSummary {
  monthId: string
  label: string
  people: MonthPersonTotals[]
  combinedSpend: number
  combinedSalary: number
  leftover: number
  categories: CategoryRollup[]
}

export interface CategorizationRule {
  pattern: string
  categoryId: CategoryId
  accountId?: AccountId
}
