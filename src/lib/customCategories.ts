import { BUDGETS, CATEGORIES, PEOPLE } from '../data/seed'
import type {
  BudgetLine,
  Category,
  CategoryKind,
  Person,
  PersonId,
} from '../types'

const CATEGORIES_KEY = 'household-ledger.categories.v1'
const BUDGETS_KEY = 'household-ledger.budgets.v1'
const INCOMES_KEY = 'household-ledger.incomes.v1'

const BUILTIN_IDS = new Set<string>(CATEGORIES.map((c) => c.id))

type IncomeOverrides = Partial<Record<PersonId, number>>

let customCategoriesCache: Category[] = loadCustomCategoriesFromStorage()
let budgetOverridesCache: BudgetLine[] = loadBudgetOverridesFromStorage()
let incomeOverridesCache: IncomeOverrides = loadIncomeOverridesFromStorage()

function budgetKey(personId: PersonId, categoryId: string): string {
  return `${personId}:${categoryId}`
}

function isValidCategory(value: unknown): value is Category {
  if (!value || typeof value !== 'object') return false
  const c = value as Category
  return (
    typeof c.id === 'string' &&
    c.id.length > 0 &&
    typeof c.label === 'string' &&
    c.label.trim().length > 0 &&
    typeof c.icon === 'string' &&
    (c.kind === 'fixed' || c.kind === 'variable') &&
    typeof c.ledgerTracked === 'boolean'
  )
}

function isValidBudgetLine(value: unknown): value is BudgetLine {
  if (!value || typeof value !== 'object') return false
  const line = value as BudgetLine
  return (
    (line.personId === 'trevor' || line.personId === 'kate') &&
    typeof line.categoryId === 'string' &&
    line.categoryId.length > 0 &&
    typeof line.amount === 'number' &&
    Number.isFinite(line.amount) &&
    line.amount >= 0
  )
}

function loadCustomCategoriesFromStorage(): Category[] {
  try {
    const raw = localStorage.getItem(CATEGORIES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (c): c is Category =>
        isValidCategory(c) && !BUILTIN_IDS.has(c.id),
    )
  } catch {
    return []
  }
}

function loadBudgetOverridesFromStorage(): BudgetLine[] {
  try {
    const raw = localStorage.getItem(BUDGETS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isValidBudgetLine)
  } catch {
    return []
  }
}

function loadIncomeOverridesFromStorage(): IncomeOverrides {
  try {
    const raw = localStorage.getItem(INCOMES_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    const next: IncomeOverrides = {}
    for (const id of ['trevor', 'kate'] as const) {
      const value = (parsed as Record<string, unknown>)[id]
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
        next[id] = Math.round(value * 100) / 100
      }
    }
    return next
  } catch {
    return {}
  }
}

function seedBudgetAmount(personId: PersonId, categoryId: string): number {
  return (
    BUDGETS.find((b) => b.personId === personId && b.categoryId === categoryId)
      ?.amount ?? 0
  )
}

export function isBuiltInCategoryId(id: string): boolean {
  return BUILTIN_IDS.has(id)
}

export function getCustomCategories(): Category[] {
  return customCategoriesCache
}

export function getAllCategories(): Category[] {
  return [...CATEGORIES, ...customCategoriesCache]
}

/** Seed budgets merged with localStorage overrides (built-in + custom). */
export function getAllBudgets(): BudgetLine[] {
  const map = new Map<string, BudgetLine>()
  for (const b of BUDGETS) {
    map.set(budgetKey(b.personId, b.categoryId), { ...b })
  }
  for (const b of budgetOverridesCache) {
    map.set(budgetKey(b.personId, b.categoryId), { ...b })
  }
  return [...map.values()]
}

/** Overrides only — used for custom-category UI and reset detection. */
export function getBudgetOverrides(): BudgetLine[] {
  return budgetOverridesCache
}

/** @deprecated Prefer getBudgetOverrides / getAllBudgets; kept for call sites. */
export function getCustomBudgets(): BudgetLine[] {
  return budgetOverridesCache.filter((b) => !BUILTIN_IDS.has(b.categoryId))
}

export function getPeople(): Person[] {
  return PEOPLE.map((p) => ({
    ...p,
    monthlyIncome: incomeOverridesCache[p.id] ?? p.monthlyIncome,
  }))
}

export function getPersonIncome(personId: PersonId): number {
  return (
    incomeOverridesCache[personId] ??
    PEOPLE.find((p) => p.id === personId)?.monthlyIncome ??
    0
  )
}

export function hasIncomeOverrides(): boolean {
  return Object.keys(incomeOverridesCache).length > 0
}

export function getIncomeOverrides(): IncomeOverrides {
  return { ...incomeOverridesCache }
}

export function replaceIncomeOverrides(next: IncomeOverrides): void {
  const cleaned: IncomeOverrides = {}
  for (const person of PEOPLE) {
    const value = next[person.id]
    if (typeof value !== 'number' || !Number.isFinite(value)) continue
    const amount = Math.round(Math.max(0, value) * 100) / 100
    if (amount === person.monthlyIncome) continue
    cleaned[person.id] = amount
  }
  incomeOverridesCache = cleaned
  if (Object.keys(cleaned).length === 0) {
    localStorage.removeItem(INCOMES_KEY)
  } else {
    localStorage.setItem(INCOMES_KEY, JSON.stringify(cleaned))
  }
}

export function hasBudgetOverrides(): boolean {
  return budgetOverridesCache.length > 0
}

/** Sync in-memory cache + localStorage. Call before setState so labels/compute see updates. */
export function replaceCustomCategories(next: Category[]): void {
  customCategoriesCache = next.filter((c) => !isBuiltInCategoryId(c.id))
  localStorage.setItem(CATEGORIES_KEY, JSON.stringify(customCategoriesCache))
}

export function replaceBudgetOverrides(next: BudgetLine[]): void {
  budgetOverridesCache = next.filter(isValidBudgetLine)
  localStorage.setItem(BUDGETS_KEY, JSON.stringify(budgetOverridesCache))
}

/** @deprecated Prefer replaceBudgetOverrides. */
export function replaceCustomBudgets(next: BudgetLine[]): void {
  replaceBudgetOverrides(next)
}

export function setPersonIncome(personId: PersonId, amount: number): void {
  const cleaned = Math.round(Math.max(0, amount) * 100) / 100
  const seed = PEOPLE.find((p) => p.id === personId)?.monthlyIncome ?? 0
  const next: IncomeOverrides = { ...incomeOverridesCache }
  if (cleaned === seed) {
    delete next[personId]
  } else {
    next[personId] = cleaned
  }
  incomeOverridesCache = next
  if (Object.keys(next).length === 0) {
    localStorage.removeItem(INCOMES_KEY)
  } else {
    localStorage.setItem(INCOMES_KEY, JSON.stringify(next))
  }
}

export function resetIncomeOverrides(): void {
  incomeOverridesCache = {}
  localStorage.removeItem(INCOMES_KEY)
}

export function resetBudgetOverrides(): void {
  budgetOverridesCache = []
  localStorage.removeItem(BUDGETS_KEY)
}

export function slugifyCategoryLabel(label: string): string {
  const base = label
    .trim()
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
  return base || 'custom'
}

export function uniqueCategoryId(label: string, existingIds: Set<string>): string {
  const base = slugifyCategoryLabel(label)
  const candidate = `custom_${base}`
  if (!existingIds.has(candidate) && !isBuiltInCategoryId(candidate)) {
    return candidate
  }
  let n = 2
  while (
    existingIds.has(`${candidate}_${n}`) ||
    isBuiltInCategoryId(`${candidate}_${n}`)
  ) {
    n += 1
  }
  return `${candidate}_${n}`
}

export function createCustomCategory(input: {
  label: string
  kind: CategoryKind
  icon?: string
}): Category {
  const label = input.label.trim()
  const existing = new Set(getAllCategories().map((c) => c.id))
  return {
    id: uniqueCategoryId(label, existing),
    label,
    icon: input.icon?.trim() || '•',
    kind: input.kind,
    ledgerTracked: true,
  }
}

/**
 * Upsert a budget override for any category (built-in or custom).
 * Matches seed → drop override; otherwise persist.
 */
export function upsertBudget(
  personId: PersonId,
  categoryId: string,
  amount: number,
): void {
  const cleaned = Math.round(Math.max(0, amount) * 100) / 100
  const next = budgetOverridesCache.filter(
    (b) => !(b.personId === personId && b.categoryId === categoryId),
  )
  const seedAmount = seedBudgetAmount(personId, categoryId)
  if (cleaned !== seedAmount) {
    next.push({ personId, categoryId, amount: cleaned })
  }
  replaceBudgetOverrides(next)
}

/** @deprecated Prefer upsertBudget — same behavior for custom + built-in. */
export function upsertCustomBudget(
  personId: PersonId,
  categoryId: string,
  amount: number,
): void {
  upsertBudget(personId, categoryId, amount)
}

export function removeCustomCategoryData(categoryId: string): void {
  replaceCustomCategories(
    customCategoriesCache.filter((c) => c.id !== categoryId),
  )
  replaceBudgetOverrides(
    budgetOverridesCache.filter((b) => b.categoryId !== categoryId),
  )
}
