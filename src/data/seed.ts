import type {
  Account,
  BudgetLine,
  CategorizationRule,
  Category,
  Person,
  Transaction,
} from '../types'

export const PEOPLE: Person[] = [
  { id: 'trevor', name: 'Trevor', monthlyIncome: 6050 },
  { id: 'kate', name: 'Kate', monthlyIncome: 4600 },
]

export const ACCOUNTS: Account[] = [
  { id: 'debit', label: 'Debit' },
  { id: 'td_cashback', label: 'TD Cashback' },
  { id: 'amex', label: 'Amex' },
  { id: 'first_class', label: 'First Class' },
  { id: 'other', label: 'Other' },
]

/** Categories mirrored from Expenses 2026 workbook. */
export const CATEGORIES: Category[] = [
  { id: 'water', label: 'Water', kind: 'fixed', ledgerTracked: false },
  { id: 'gas_utility', label: 'Gas (utility)', kind: 'fixed', ledgerTracked: false },
  { id: 'elexicon', label: 'Elexicon', kind: 'fixed', ledgerTracked: false },
  { id: 'car_payment', label: 'Car Payment', kind: 'fixed', ledgerTracked: false },
  { id: 'cellphone', label: 'Cellphone Bill', kind: 'fixed', ledgerTracked: false },
  { id: 'internet', label: 'Internet', kind: 'fixed', ledgerTracked: false },
  { id: 'mortgage', label: 'Mortgage', kind: 'fixed', ledgerTracked: false },
  { id: 'taxes', label: 'Taxes', kind: 'fixed', ledgerTracked: false },
  { id: 'home_car_insurance', label: 'Home + Car Insurance', kind: 'fixed', ledgerTracked: false },
  { id: 'trevor_car', label: "Trevor's Car", kind: 'fixed', ledgerTracked: false },
  { id: 'kate_car', label: "Kate's Car", kind: 'fixed', ledgerTracked: false },
  { id: 'daycare', label: 'Daycare', kind: 'fixed', ledgerTracked: false },
  { id: 'nanny', label: 'Nanny', kind: 'fixed', ledgerTracked: false },
  { id: 'pet_insurance', label: 'Pet Insurance', kind: 'fixed', ledgerTracked: false },
  { id: 'cj_food', label: 'CJ Food', kind: 'fixed', ledgerTracked: false },
  { id: 'spotify', label: 'Spotify', kind: 'fixed', ledgerTracked: false },
  { id: 'apple_tv', label: 'Apple TV', kind: 'fixed', ledgerTracked: false },
  { id: 'netflix', label: 'Netflix', kind: 'fixed', ledgerTracked: false },
  { id: 'amazon_prime', label: 'Amazon Prime', kind: 'fixed', ledgerTracked: false },
  { id: 'abilities', label: 'Abilities', kind: 'fixed', ledgerTracked: false },
  { id: 'gym', label: 'Gym Membership', kind: 'fixed', ledgerTracked: false },
  { id: 'factor', label: 'Factor', kind: 'fixed', ledgerTracked: false },
  { id: 'work_subscription', label: 'Work Subscription', kind: 'fixed', ledgerTracked: false },
  { id: 'therapy', label: 'Therapy', kind: 'variable', ledgerTracked: true },
  { id: 'lens', label: 'LENS Therapy', kind: 'variable', ledgerTracked: true },
  { id: 'groceries', label: 'Groceries', kind: 'variable', ledgerTracked: true },
  { id: 'coffee', label: 'Coffee', kind: 'variable', ledgerTracked: true },
  { id: 'liquor', label: 'LCBO / Liquor', kind: 'variable', ledgerTracked: true },
  { id: 'gas_vehicle', label: 'Gas (vehicle)', kind: 'variable', ledgerTracked: true },
  { id: 'entertainment', label: 'Entertainment', kind: 'variable', ledgerTracked: true },
  { id: 'restaurants', label: 'Restaurants', kind: 'variable', ledgerTracked: true },
  { id: 'take_out', label: 'Take Out', kind: 'variable', ledgerTracked: true },
  { id: 'amazon', label: 'Amazon', kind: 'variable', ledgerTracked: true },
  { id: 'isla', label: "Isla's Stuff", kind: 'variable', ledgerTracked: true },
  { id: 'clothes', label: 'Clothes / Winners', kind: 'variable', ledgerTracked: true },
  { id: 'one_time', label: '1-time expenses', kind: 'variable', ledgerTracked: true },
  { id: 'other', label: 'Other', kind: 'variable', ledgerTracked: true },
]

/**
 * Per-person budgets from "Updated info March 2024" reference table
 * (columns B = Kate, F = Trevor).
 */
export const BUDGETS: BudgetLine[] = [
  // Kate
  { personId: 'kate', categoryId: 'groceries', amount: 300 },
  { personId: 'kate', categoryId: 'water', amount: 110 },
  { personId: 'kate', categoryId: 'gas_utility', amount: 110 },
  { personId: 'kate', categoryId: 'elexicon', amount: 200 },
  { personId: 'kate', categoryId: 'daycare', amount: 700 },
  { personId: 'kate', categoryId: 'nanny', amount: 100 },
  { personId: 'kate', categoryId: 'one_time', amount: 400 },
  { personId: 'kate', categoryId: 'restaurants', amount: 100 },
  { personId: 'kate', categoryId: 'take_out', amount: 150 },
  { personId: 'kate', categoryId: 'coffee', amount: 50 },
  { personId: 'kate', categoryId: 'entertainment', amount: 50 },
  { personId: 'kate', categoryId: 'amazon', amount: 100 },
  { personId: 'kate', categoryId: 'mortgage', amount: 1200 },
  { personId: 'kate', categoryId: 'taxes', amount: 237.5 },
  { personId: 'kate', categoryId: 'gas_vehicle', amount: 100 },
  { personId: 'kate', categoryId: 'clothes', amount: 50 },
  { personId: 'kate', categoryId: 'isla', amount: 100 },
  { personId: 'kate', categoryId: 'liquor', amount: 100 },

  // Trevor
  { personId: 'trevor', categoryId: 'groceries', amount: 1000 },
  { personId: 'trevor', categoryId: 'car_payment', amount: 620 },
  { personId: 'trevor', categoryId: 'daycare', amount: 700 },
  { personId: 'trevor', categoryId: 'lens', amount: 0 },
  { personId: 'trevor', categoryId: 'one_time', amount: 400 },
  { personId: 'trevor', categoryId: 'cj_food', amount: 90 },
  { personId: 'trevor', categoryId: 'pet_insurance', amount: 114.55 },
  { personId: 'trevor', categoryId: 'restaurants', amount: 100 },
  { personId: 'trevor', categoryId: 'take_out', amount: 150 },
  { personId: 'trevor', categoryId: 'coffee', amount: 50 },
  { personId: 'trevor', categoryId: 'cellphone', amount: 166.9 },
  { personId: 'trevor', categoryId: 'entertainment', amount: 50 },
  { personId: 'trevor', categoryId: 'amazon', amount: 100 },
  { personId: 'trevor', categoryId: 'internet', amount: 85 },
  { personId: 'trevor', categoryId: 'mortgage', amount: 1200 },
  { personId: 'trevor', categoryId: 'taxes', amount: 237.5 },
  { personId: 'trevor', categoryId: 'home_car_insurance', amount: 688.04 },
  { personId: 'trevor', categoryId: 'gas_vehicle', amount: 200 },
  { personId: 'trevor', categoryId: 'netflix', amount: 18.63 },
  { personId: 'trevor', categoryId: 'amazon_prime', amount: 10 },
  { personId: 'trevor', categoryId: 'abilities', amount: 60 },
  { personId: 'trevor', categoryId: 'gym', amount: 66 },
  { personId: 'trevor', categoryId: 'clothes', amount: 50 },
  { personId: 'trevor', categoryId: 'isla', amount: 100 },
  { personId: 'trevor', categoryId: 'liquor', amount: 50 },
]

/** Merchant → category rules inferred from June sheet merchant labels. */
export const CATEGORIZATION_RULES: CategorizationRule[] = [
  { pattern: 'metro', categoryId: 'groceries' },
  { pattern: 'dollarama', categoryId: 'groceries' },
  { pattern: 'instacart', categoryId: 'groceries' },
  { pattern: 'tim hortons', categoryId: 'coffee' },
  { pattern: "tim's", categoryId: 'coffee' },
  { pattern: 'starbucks', categoryId: 'coffee' },
  { pattern: 'jacks', categoryId: 'coffee' },
  { pattern: 'lcbo', categoryId: 'liquor' },
  { pattern: 'amzn', categoryId: 'amazon' },
  { pattern: 'amazon', categoryId: 'amazon' },
  { pattern: 'old navy', categoryId: 'clothes' },
  { pattern: 'winners', categoryId: 'clothes' },
  { pattern: 'factor', categoryId: 'lens' },
  { pattern: 'petro', categoryId: 'gas_vehicle' },
  { pattern: 'esso', categoryId: 'gas_vehicle' },
  { pattern: 'shell', categoryId: 'gas_vehicle' },
  { pattern: 'canadian tire gas', categoryId: 'gas_vehicle' },
]

/**
 * Seed transactions for Trevor June 2026 — category totals that match the
 * spreadsheet rollups (ledger-tracked categories). Fixed costs are seeded
 * as single month charges so leftover math stays consistent.
 */
function tx(
  id: string,
  partial: Omit<Transaction, 'id' | 'personId' | 'monthId' | 'source'>,
): Transaction {
  return {
    id,
    personId: 'trevor',
    monthId: '2026-06',
    source: 'seed',
    ...partial,
  }
}

export const SEED_TRANSACTIONS: Transaction[] = [
  // Fixed / recurring (Trevor June amounts from sheet col C)
  tx('t-car-payment', {
    date: '2026-06-01',
    amount: 622,
    merchant: 'Car Payment',
    accountId: 'debit',
    categoryId: 'car_payment',
  }),
  tx('t-cell', {
    date: '2026-06-01',
    amount: 166.9,
    merchant: 'Cellphone',
    accountId: 'debit',
    categoryId: 'cellphone',
  }),
  tx('t-internet', {
    date: '2026-06-01',
    amount: 85,
    merchant: 'Internet',
    accountId: 'debit',
    categoryId: 'internet',
  }),
  tx('t-mortgage', {
    date: '2026-06-01',
    amount: 1500,
    merchant: 'Mortgage',
    accountId: 'debit',
    categoryId: 'mortgage',
  }),
  tx('t-trevor-car', {
    date: '2026-06-01',
    amount: 352,
    merchant: "Trevor's Car",
    accountId: 'debit',
    categoryId: 'trevor_car',
  }),
  tx('t-kate-car', {
    date: '2026-06-01',
    amount: 127.04,
    merchant: "Kate's Car",
    accountId: 'debit',
    categoryId: 'kate_car',
  }),
  tx('t-home-ins', {
    date: '2026-06-01',
    amount: 209,
    merchant: 'Home insurance',
    accountId: 'debit',
    categoryId: 'home_car_insurance',
  }),
  tx('t-spotify', {
    date: '2026-06-01',
    amount: 18.07,
    merchant: 'Spotify',
    accountId: 'td_cashback',
    categoryId: 'spotify',
  }),
  tx('t-pet', {
    date: '2026-06-01',
    amount: 138.54,
    merchant: 'Pet Insurance',
    accountId: 'debit',
    categoryId: 'pet_insurance',
  }),
  tx('t-cj', {
    date: '2026-06-01',
    amount: 124.29,
    merchant: 'CJ Food',
    accountId: 'debit',
    categoryId: 'cj_food',
  }),
  tx('t-apple-tv', {
    date: '2026-06-01',
    amount: 14.68,
    merchant: 'Apple TV',
    accountId: 'td_cashback',
    categoryId: 'apple_tv',
  }),
  tx('t-netflix', {
    date: '2026-06-01',
    amount: 27.11,
    merchant: 'Netflix',
    accountId: 'td_cashback',
    categoryId: 'netflix',
  }),
  tx('t-abilities', {
    date: '2026-06-01',
    amount: 60,
    merchant: 'Abilities',
    accountId: 'debit',
    categoryId: 'abilities',
  }),
  tx('t-gym', {
    date: '2026-06-01',
    amount: 62.88,
    merchant: 'Gym',
    accountId: 'debit',
    categoryId: 'gym',
  }),
  tx('t-work-sub', {
    date: '2026-06-01',
    amount: 89.26,
    merchant: 'Work Subscription',
    accountId: 'amex',
    categoryId: 'work_subscription',
  }),
  tx('t-family-sub', {
    date: '2026-06-01',
    amount: 14.99,
    merchant: 'Family Subscriptions',
    accountId: 'other',
    categoryId: 'other',
  }),
  tx('t-hayu', {
    date: '2026-06-01',
    amount: 7.9,
    merchant: 'Hayu',
    accountId: 'other',
    categoryId: 'other',
  }),
  tx('t-kickers', {
    date: '2026-06-01',
    amount: 22.6,
    merchant: 'Little Kickers',
    accountId: 'other',
    categoryId: 'other',
  }),
  tx('t-youtube', {
    date: '2026-06-01',
    amount: 14.68,
    merchant: 'YouTube',
    accountId: 'other',
    categoryId: 'other',
  }),
  tx('t-chatgpt', {
    date: '2026-06-01',
    amount: 32.06,
    merchant: 'ChatGPT',
    accountId: 'amex',
    categoryId: 'other',
  }),

  // Ledger category rollups (matches sheet Category Totals row)
  tx('t-groceries', {
    date: '2026-06-28',
    amount: 830.92,
    merchant: 'Grocery total (seed)',
    accountId: 'amex',
    categoryId: 'groceries',
  }),
  tx('t-coffee', {
    date: '2026-06-28',
    amount: 289.77,
    merchant: 'Coffee total (seed)',
    accountId: 'amex',
    categoryId: 'coffee',
  }),
  tx('t-gas', {
    date: '2026-06-28',
    amount: 311.59,
    merchant: 'Gas total (seed)',
    accountId: 'amex',
    categoryId: 'gas_vehicle',
  }),
  tx('t-ent', {
    date: '2026-06-28',
    amount: 76.86,
    merchant: 'Entertainment total (seed)',
    accountId: 'amex',
    categoryId: 'entertainment',
  }),
  tx('t-rest', {
    date: '2026-06-28',
    amount: 226.23,
    merchant: 'Restaurants total (seed)',
    accountId: 'amex',
    categoryId: 'restaurants',
  }),
  tx('t-takeout', {
    date: '2026-06-28',
    amount: 359.91,
    merchant: 'Take Out total (seed)',
    accountId: 'amex',
    categoryId: 'take_out',
  }),
  tx('t-amazon', {
    date: '2026-06-28',
    amount: 710.14,
    merchant: 'Amazon total (seed)',
    accountId: 'amex',
    categoryId: 'amazon',
  }),
  tx('t-onetime', {
    date: '2026-06-28',
    amount: 1263.56,
    merchant: '1-time total (seed)',
    accountId: 'amex',
    categoryId: 'one_time',
  }),
  tx('t-lens', {
    date: '2026-06-28',
    amount: 289.78,
    merchant: 'LENS / Factor / Therapy (seed)',
    accountId: 'amex',
    categoryId: 'lens',
  }),

  // Refunds
  tx('t-refund-oldnavy', {
    date: '2026-06-20',
    amount: 50.49,
    merchant: 'Old Navy refund',
    accountId: 'amex',
    categoryId: 'clothes',
    isRefund: true,
  }),
  tx('t-refund-factor', {
    date: '2026-06-20',
    amount: 144.89,
    merchant: 'Factor refund',
    accountId: 'amex',
    categoryId: 'factor',
    isRefund: true,
  }),
  tx('t-refund-teamtown', {
    date: '2026-06-20',
    amount: 126.48,
    merchant: 'Team Town refund',
    accountId: 'amex',
    categoryId: 'one_time',
    isRefund: true,
  }),
  tx('t-refund-amazon', {
    date: '2026-06-20',
    amount: 22.48,
    merchant: 'Amazon return',
    accountId: 'amex',
    categoryId: 'amazon',
    isRefund: true,
  }),
  tx('t-refund-extra', {
    date: '2026-06-20',
    amount: 32.19,
    merchant: 'Other rebate',
    accountId: 'other',
    categoryId: 'other',
    isRefund: true,
  }),

  // Kate June — single net spend placeholder matching sheet C61 = 5346.03
  {
    id: 'k-june-net',
    personId: 'kate',
    monthId: '2026-06',
    date: '2026-06-28',
    amount: 5346.03,
    merchant: 'Kate June net total (seed)',
    accountId: 'other',
    categoryId: 'other',
    source: 'seed',
  },
]

export const ACTIVE_MONTH_ID = '2026-06'
export const ACTIVE_MONTH_LABEL = 'June 2026'
