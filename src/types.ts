export type PersonId = 'trevor' | 'kate'

export type CategoryKind = 'fixed' | 'variable'

/** Seed sheet category IDs — kept for autocomplete; runtime IDs may be any string. */
export type BuiltInCategoryId =
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

/** Built-in seed IDs plus user-defined slugs (e.g. `custom_pets`). */
export type CategoryId = BuiltInCategoryId | (string & {})

export type BuiltInAccountId =
  | 'debit'
  | 'td_cashback'
  | 'amex'
  | 'first_class'
  | 'other'
  | 'debit_kate'

/** Built-in seed IDs plus user-defined slugs (e.g. `custom_kate_amex`). */
export type AccountId = BuiltInAccountId | (string & {})

/** Who can use the account in pickers — one person, or shared/joint. */
export type AccountOwner = PersonId | 'shared'

export interface Person {
  id: PersonId
  name: string
  monthlyIncome: number
}

export interface Category {
  id: CategoryId
  label: string
  icon: string
  kind: CategoryKind
  /** When true, spent comes from tagged ledger transactions (sheet columns). */
  ledgerTracked: boolean
}

export interface Account {
  id: AccountId
  label: string
  icon: string
  /** Trevor, Kate, or shared (visible to both). */
  owner: AccountOwner
}

/** User-defined account — same shape as Account; ids never collide with built-ins. */
export type CustomAccount = Account

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
  /** Money returned against a purchase (rebate / return). */
  isRefund?: boolean
  /** Extra cash deposited / received — not a purchase refund. */
  isCashIn?: boolean
  source: 'seed' | 'manual' | 'csv'
  /** Groups charges from one statement upload. */
  importId?: string
  sourceFile?: string
}

export interface MonthPersonTotals {
  personId: PersonId
  income: number
  grossSpend: number
  refunds: number
  cashIns: number
  netSpend: number
  fixedBudget: number
  variableBudget: number
  fixedSpent: number
  variableSpent: number
  /** Salary − fixed budgets — what the sheet treats as spendable after bills. */
  afterFixed: number
  /** Variable category budgets − variable spend. */
  categoryLeftover: number
  /** Variable budget caps − variable spend (aligned with planned variable pool). */
  stillAvailable: number
  vsNecessitiesBudget: number
}

export interface CategoryRollup {
  categoryId: CategoryId
  label: string
  icon: string
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
  fixedBudget: number
  variableBudget: number
  fixedSpent: number
  variableSpent: number
  afterFixed: number
  stillAvailable: number
  categories: CategoryRollup[]
}

export interface CategorizationRule {
  pattern: string
  categoryId: CategoryId
  accountId?: AccountId
}

/** One committed statement upload (CSV/PDF/screenshot review queue). */
export interface StatementImport {
  id: string
  fileName: string
  uploadedAt: string
  personId: PersonId
  primaryAccountId: AccountId
  monthIds: string[]
  transactionCount: number
  netAmount: number
  /**
   * True when the original PDF/CSV/image bytes were saved to IndexedDB under this id.
   * Missing/false on older imports — View statement shows an empty note.
   */
  hasStoredFile?: boolean
  /** MIME of the stored file when hasStoredFile is true. */
  mimeType?: string
  /** How the charges were captured — screenshot uses on-device OCR. */
  sourceKind?: 'statement' | 'screenshot'
}

/** Hockey gear flip tracker (from Profit Estimate + Sales sheets). */
export interface GearInventoryItem {
  id: string
  boughtDate?: string | null
  item: string
  targetSold?: number | null
  bought?: number | null
  projectedProfit?: number | null
}

export type GearSoldVia = 'fb' | 'kijiji' | 'ss'

/** Standardized flip catalog — pads / gloves / chest / pants / sets. */
export type GearKind =
  | 'pads'
  | 'blocker'
  | 'catcher'
  | 'chestie'
  | 'pants'
  /** Blocker + catcher sold together. */
  | 'set_gloves'
  /** Pads + blocker + catcher sold together. */
  | 'set_full'
  | 'other'

export type GearLevel = 'intermediate' | 'senior'

/** Structured product tags so entries stay comparable across flips. */
export interface GearItemTags {
  kind?: GearKind | null
  level?: GearLevel | null
  /** Pads / full set: 34+2 etc. Chest/pants/glove set: S–XXL or custom. Blocker/catcher: custom only. */
  size?: string | null
  /** Blocker/catcher size on a full set (pads use `size`). */
  gloveSize?: string | null
  colour?: string | null
  brand?: string | null
  /** Model / extra detail (e.g. Hyperlite 2, eflex 6.9). */
  detail?: string | null
}

export interface GearSale {
  id: string
  soldDate?: string | null
  item?: string | null
  soldPrice?: number | null
  boughtPrice?: number | null
  profit?: number | null
  actualSold?: number | null
  actualProfit?: number | null
  bucket?: 'new' | 'old'
  /** Where it sold — Facebook Marketplace, Kijiji, or SidelineSwap. */
  soldVia?: GearSoldVia | null
  /** Links this sale to an inventory buy row. */
  inventoryId?: string | null
}

export interface GearMonth {
  id: string
  label: string
  inventory: GearInventoryItem[]
  oldInventory: GearInventoryItem[]
  sales: GearSale[]
}

export type GearCashType = 'DEPOSIT' | 'BUY' | 'SELL' | 'FEE' | 'SHIP' | string

/** Buy inventory listing status for flip organization (not used on sells). */
export type GearListingStatus = 'listed' | 'not_listed'

/** One clear money move — amount is always positive; direction says in or out. */
export interface GearCashMove {
  id: string
  date?: string | null
  type: GearCashType
  item?: string | null
  /** Structured product tags — preferred over free-text alone. */
  tags?: GearItemTags | null
  amount: number
  direction: 'in' | 'out'
  /** Where a sell happened — Facebook, Kijiji, or SidelineSwap. */
  soldVia?: GearSoldVia | null
  /** Shared link group — one buy can link to many sells (and vice versa). */
  linkGroupId?: string | null
  /** @deprecated Legacy 1:1 link; migrated into linkGroupId on load. */
  linkedMoveId?: string | null
  /**
   * When true, auto name-matching must not change this row’s link
   * (manual link or intentional unlink).
   */
  linkLocked?: boolean
  /**
   * Flip inventory listing for buys: listed for sale vs not yet listed.
   * Ignored when the buy is on the keep list; null/undefined displays as not listed.
   */
  listingStatus?: GearListingStatus | null
  /** Optional free-text note on a buy or sell row. */
  notes?: string | null
  /** When the row was added to the ledger (ISO). */
  createdAt?: string | null
}

/** Personal gear the user decided to keep (not flip / sell). */
export interface GearKeepItem {
  id: string
  item: string
  tags?: GearItemTags | null
  notes?: string | null
  date?: string | null
  cost?: number | null
  /** Cash buy row this keep came from, if any. */
  cashMoveId?: string | null
  createdAt?: string | null
}

/**
 * Manual projected-profit row — not tied to a cash ledger buy.
 * Lives on a planner month; cost/target are sheet-local.
 */
export interface GearProjectedManualRow {
  id: string
  monthId: string
  item: string
  tags?: GearItemTags | null
  cost: number
  targetSold?: number | null
  date?: string | null
}

export interface GearState {
  months: GearMonth[]
  openingBalance: number
  cash: GearCashMove[]
  /** Items kept for personal use — not open flip inventory. */
  keepList: GearKeepItem[]
  /**
   * Projected sell targets keyed by cash buy move id.
   * Used by the Projected profit planner; empty/missing = no target yet.
   */
  projectedTargets?: Record<string, number | null>
  /** Manual projected-profit rows (not linked to cash buys). */
  projectedManualRows?: GearProjectedManualRow[]
  /**
   * Cash buy move ids manually pinned onto a projected month sheet
   * (monthId → cashMoveIds). Used by “Add from buys” for listed or
   * otherwise non-auto rows; auto open-not-listed rows are not stored here.
   */
  projectedAttachedBuys?: Record<string, string[]>
}
