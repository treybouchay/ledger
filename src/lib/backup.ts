import {
  getCustomAccounts,
  replaceCustomAccounts,
} from './customAccounts'
import {
  getBudgetOverrides,
  getCustomCategories,
  getIncomeOverrides,
  replaceBudgetOverrides,
  replaceCustomCategories,
  replaceIncomeOverrides,
} from './customCategories'
import {
  loadGearState,
  migrateKeepList,
  migrateProjectedAttachedBuys,
  migrateProjectedManualRows,
  migrateProjectedTargets,
  saveGearState,
} from './gearStorage'
import { loadLearnedRules, saveLearnedRules, type LearnedRule } from './learnedRules'
import { loadImports, loadTransactions, saveImports, saveTransactions } from './storage'
import type {
  Account,
  BudgetLine,
  Category,
  GearState,
  PersonId,
  StatementImport,
  Transaction,
} from '../types'

export const BACKUP_VERSION = 1 as const

/**
 * JSON backup of ledger data (transactions, imports metadata, rules, budgets,
 * gear). Original statement PDF/CSV blobs live in IndexedDB and are intentionally
 * omitted — they can be multi‑MB and would bloat backup files. Re-upload on a
 * new device if you need the file preview again.
 */
export interface HouseholdBackup {
  version: typeof BACKUP_VERSION
  exportedAt: string
  transactions: Transaction[]
  imports: StatementImport[]
  learnedRules: LearnedRule[]
  customCategories: Category[]
  /** Optional on older backups — defaults to []. */
  customAccounts: Account[]
  budgetOverrides: BudgetLine[]
  incomes: Partial<Record<PersonId, number>>
  gear: GearState
}

export function buildBackup(input?: {
  transactions?: Transaction[]
  imports?: StatementImport[]
  learnedRules?: LearnedRule[]
  gear?: GearState
}): HouseholdBackup {
  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    transactions: input?.transactions ?? loadTransactions().transactions,
    imports: input?.imports ?? loadImports().imports,
    learnedRules: input?.learnedRules ?? loadLearnedRules(),
    customCategories: getCustomCategories(),
    customAccounts: getCustomAccounts(),
    budgetOverrides: getBudgetOverrides(),
    incomes: getIncomeOverrides(),
    gear: input?.gear ?? loadGearState(),
  }
}

export function downloadBackup(backup: HouseholdBackup): void {
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const stamp = backup.exportedAt.slice(0, 10)
  const a = document.createElement('a')
  a.href = url
  a.download = `household-ledger-backup-${stamp}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

export function parseBackup(raw: unknown): HouseholdBackup {
  if (!isObject(raw)) throw new Error('Backup file is not valid JSON object')
  if (raw.version !== 1) throw new Error('Unsupported backup version')
  if (!Array.isArray(raw.transactions)) throw new Error('Missing transactions')
  if (!Array.isArray(raw.imports)) throw new Error('Missing imports')
  if (!Array.isArray(raw.learnedRules)) throw new Error('Missing learnedRules')
  if (!Array.isArray(raw.customCategories)) {
    throw new Error('Missing customCategories')
  }
  // Older backups omit customAccounts — treat as empty.
  if (
    raw.customAccounts !== undefined &&
    !Array.isArray(raw.customAccounts)
  ) {
    throw new Error('Invalid customAccounts')
  }
  if (!Array.isArray(raw.budgetOverrides)) {
    throw new Error('Missing budgetOverrides')
  }
  if (!isObject(raw.incomes)) throw new Error('Missing incomes')
  if (!isObject(raw.gear)) throw new Error('Missing gear')
  if (!Array.isArray(raw.gear.months) || !Array.isArray(raw.gear.cash)) {
    throw new Error('Invalid gear data')
  }
  if (typeof raw.gear.openingBalance !== 'number') {
    throw new Error('Invalid gear opening balance')
  }

  const gear = {
    months: raw.gear.months,
    openingBalance: raw.gear.openingBalance,
    cash: raw.gear.cash,
    keepList: migrateKeepList(raw.gear.keepList),
    projectedTargets: migrateProjectedTargets(
      (raw.gear as { projectedTargets?: unknown }).projectedTargets,
    ),
    projectedManualRows: migrateProjectedManualRows(
      (raw.gear as { projectedManualRows?: unknown }).projectedManualRows,
    ),
    projectedAttachedBuys: migrateProjectedAttachedBuys(
      (raw.gear as { projectedAttachedBuys?: unknown }).projectedAttachedBuys,
    ),
  } as GearState

  return {
    version: BACKUP_VERSION,
    exportedAt:
      typeof raw.exportedAt === 'string'
        ? raw.exportedAt
        : new Date().toISOString(),
    transactions: raw.transactions as Transaction[],
    imports: raw.imports as StatementImport[],
    learnedRules: raw.learnedRules as LearnedRule[],
    customCategories: raw.customCategories as Category[],
    customAccounts: Array.isArray(raw.customAccounts)
      ? (raw.customAccounts as Account[])
      : [],
    budgetOverrides: raw.budgetOverrides as BudgetLine[],
    incomes: raw.incomes as Partial<Record<PersonId, number>>,
    gear,
  }
}

/** Write backup into localStorage + in-memory category/income caches. */
export function applyBackup(backup: HouseholdBackup): HouseholdBackup {
  const parsed = parseBackup(backup)
  replaceCustomCategories(parsed.customCategories)
  replaceCustomAccounts(parsed.customAccounts)
  replaceBudgetOverrides(parsed.budgetOverrides)
  replaceIncomeOverrides(parsed.incomes)
  saveLearnedRules(parsed.learnedRules)
  saveTransactions(parsed.transactions, { allowEmpty: true })
  saveImports(parsed.imports, { allowEmpty: true })
  saveGearState(parsed.gear)
  return parsed
}

export interface MergeBackupSummary {
  transactionsAdded: number
  importsAdded: number
  learnedRulesAdded: number
  customCategoriesAdded: number
  customAccountsAdded: number
  budgetsAdded: number
  incomesFilled: number
  gearCashAdded: number
  gearKeepAdded: number
}

export interface MergeBackupResult {
  backup: HouseholdBackup
  summary: MergeBackupSummary
}

function txnFingerprint(t: {
  personId: string
  merchant: string
  amount: number
  date: string
}): string {
  const merchant = t.merchant.trim().toLowerCase().replace(/\s+/g, ' ')
  const amount = Math.round(Math.abs(t.amount) * 100) / 100
  return `${t.personId}|${merchant}|${amount}|${t.date}`
}

function unionById<T extends { id: string }>(
  local: T[],
  incoming: T[],
): { merged: T[]; added: number } {
  const byId = new Map<string, T>()
  for (const row of local) byId.set(row.id, row)
  let added = 0
  for (const row of incoming) {
    if (byId.has(row.id)) continue
    byId.set(row.id, row)
    added += 1
  }
  return { merged: [...byId.values()], added }
}

function mergeLearnedRules(
  local: LearnedRule[],
  incoming: LearnedRule[],
): { merged: LearnedRule[]; added: number } {
  const byId = new Map<string, LearnedRule>()
  const byPatternCat = new Set<string>()
  for (const rule of local) {
    byId.set(rule.id, rule)
    byPatternCat.add(
      `${normalizePatternKey(rule.pattern)}|${rule.categoryId}`,
    )
  }
  let added = 0
  for (const rule of incoming) {
    if (byId.has(rule.id)) continue
    const key = `${normalizePatternKey(rule.pattern)}|${rule.categoryId}`
    if (byPatternCat.has(key)) continue
    byId.set(rule.id, rule)
    byPatternCat.add(key)
    added += 1
  }
  return { merged: [...byId.values()], added }
}

function normalizePatternKey(pattern: string): string {
  return pattern.trim().replace(/\s+/g, ' ').toLowerCase()
}

function mergeTransactions(
  local: Transaction[],
  incoming: Transaction[],
): { merged: Transaction[]; added: number } {
  const byId = new Map<string, Transaction>()
  const fingerprints = new Set<string>()
  for (const t of local) {
    byId.set(t.id, t)
    fingerprints.add(txnFingerprint(t))
  }
  let added = 0
  for (const t of incoming) {
    if (byId.has(t.id)) {
      // Same id: keep local (local wins on conflict).
      continue
    }
    const fp = txnFingerprint(t)
    if (fingerprints.has(fp)) {
      // Near-exact dupe (person + merchant + amount + date) — skip.
      continue
    }
    byId.set(t.id, t)
    fingerprints.add(fp)
    added += 1
  }
  return { merged: [...byId.values()], added }
}

function budgetKey(line: BudgetLine): string {
  return `${line.personId}|${line.categoryId}`
}

/** Local wins on conflict; add missing keys from incoming. */
function mergeBudgets(
  local: BudgetLine[],
  incoming: BudgetLine[],
): { merged: BudgetLine[]; added: number } {
  const byKey = new Map<string, BudgetLine>()
  for (const line of local) byKey.set(budgetKey(line), line)
  let added = 0
  for (const line of incoming) {
    const key = budgetKey(line)
    if (byKey.has(key)) continue
    byKey.set(key, line)
    added += 1
  }
  return { merged: [...byKey.values()], added }
}

/** Keep local if set (>0); otherwise take incoming when it has a value. */
function mergeIncomes(
  local: Partial<Record<PersonId, number>>,
  incoming: Partial<Record<PersonId, number>>,
): { merged: Partial<Record<PersonId, number>>; filled: number } {
  const merged: Partial<Record<PersonId, number>> = { ...local }
  let filled = 0
  for (const personId of ['trevor', 'kate'] as PersonId[]) {
    const localVal = local[personId]
    const incomingVal = incoming[personId]
    const localSet =
      typeof localVal === 'number' && Number.isFinite(localVal) && localVal > 0
    if (localSet) continue
    if (
      typeof incomingVal === 'number' &&
      Number.isFinite(incomingVal) &&
      incomingVal > 0
    ) {
      merged[personId] = incomingVal
      filled += 1
    }
  }
  return { merged, filled }
}

function mergeStringIdLists(
  local: string[] | undefined,
  incoming: string[] | undefined,
): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const id of [...(local ?? []), ...(incoming ?? [])]) {
    if (seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

function mergeGearMonths(
  local: GearState['months'],
  incoming: GearState['months'],
): GearState['months'] {
  const byId = new Map<string, GearState['months'][number]>()
  for (const month of local) byId.set(month.id, month)
  for (const month of incoming) {
    const existing = byId.get(month.id)
    if (!existing) {
      byId.set(month.id, month)
      continue
    }
    byId.set(month.id, {
      ...existing,
      label: existing.label || month.label,
      inventory: unionById(existing.inventory, month.inventory).merged,
      oldInventory: unionById(existing.oldInventory, month.oldInventory)
        .merged,
      sales: unionById(existing.sales, month.sales).merged,
    })
  }
  return [...byId.values()]
}

function mergeRecordLocalWins<T>(
  local: Record<string, T> | undefined,
  incoming: Record<string, T> | undefined,
): Record<string, T> {
  const out: Record<string, T> = { ...(incoming ?? {}) }
  for (const [key, value] of Object.entries(local ?? {})) {
    out[key] = value
  }
  return out
}

function mergeGear(local: GearState, incoming: GearState): {
  merged: GearState
  cashAdded: number
  keepAdded: number
} {
  const cash = unionById(local.cash, incoming.cash)
  const keep = unionById(local.keepList ?? [], incoming.keepList ?? [])
  const manual = unionById(
    local.projectedManualRows ?? [],
    incoming.projectedManualRows ?? [],
  )

  const attachedLocal = local.projectedAttachedBuys ?? {}
  const attachedIncoming = incoming.projectedAttachedBuys ?? {}
  const attachedKeys = new Set([
    ...Object.keys(attachedLocal),
    ...Object.keys(attachedIncoming),
  ])
  const projectedAttachedBuys: Record<string, string[]> = {}
  for (const monthId of attachedKeys) {
    projectedAttachedBuys[monthId] = mergeStringIdLists(
      attachedLocal[monthId],
      attachedIncoming[monthId],
    )
  }

  return {
    merged: {
      months: mergeGearMonths(local.months, incoming.months),
      openingBalance:
        typeof local.openingBalance === 'number' &&
        Number.isFinite(local.openingBalance)
          ? local.openingBalance
          : incoming.openingBalance,
      cash: cash.merged,
      keepList: keep.merged,
      projectedTargets: mergeRecordLocalWins(
        local.projectedTargets,
        incoming.projectedTargets,
      ),
      projectedManualRows: manual.merged,
      projectedAttachedBuys,
    },
    cashAdded: cash.added,
    keepAdded: keep.added,
  }
}

/**
 * Merge incoming backup into current local data.
 * Local wins on id/key conflicts; missing keys/rows are filled from incoming.
 * Near-exact transaction dupes (person+merchant+amount+date) are skipped.
 */
export function mergeBackup(
  incoming: HouseholdBackup,
  current: HouseholdBackup,
): MergeBackupResult {
  const parsedIncoming = parseBackup(incoming)
  const parsedCurrent = parseBackup(current)

  const transactions = mergeTransactions(
    parsedCurrent.transactions,
    parsedIncoming.transactions,
  )
  const imports = unionById(parsedCurrent.imports, parsedIncoming.imports)
  const learnedRules = mergeLearnedRules(
    parsedCurrent.learnedRules,
    parsedIncoming.learnedRules,
  )
  const customCategories = unionById(
    parsedCurrent.customCategories,
    parsedIncoming.customCategories,
  )
  const customAccounts = unionById(
    parsedCurrent.customAccounts,
    parsedIncoming.customAccounts,
  )
  const budgets = mergeBudgets(
    parsedCurrent.budgetOverrides,
    parsedIncoming.budgetOverrides,
  )
  const incomes = mergeIncomes(parsedCurrent.incomes, parsedIncoming.incomes)
  const gear = mergeGear(parsedCurrent.gear, parsedIncoming.gear)

  const backup: HouseholdBackup = {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    transactions: transactions.merged,
    imports: imports.merged,
    learnedRules: learnedRules.merged,
    customCategories: customCategories.merged,
    customAccounts: customAccounts.merged,
    budgetOverrides: budgets.merged,
    incomes: incomes.merged,
    gear: gear.merged,
  }

  return {
    backup,
    summary: {
      transactionsAdded: transactions.added,
      importsAdded: imports.added,
      learnedRulesAdded: learnedRules.added,
      customCategoriesAdded: customCategories.added,
      customAccountsAdded: customAccounts.added,
      budgetsAdded: budgets.added,
      incomesFilled: incomes.filled,
      gearCashAdded: gear.cashAdded,
      gearKeepAdded: gear.keepAdded,
    },
  }
}

/** Persist a merged backup; avoid allowEmpty wipe unless the merged set is empty. */
export function applyMergedBackup(backup: HouseholdBackup): HouseholdBackup {
  const parsed = parseBackup(backup)
  replaceCustomCategories(parsed.customCategories)
  replaceCustomAccounts(parsed.customAccounts)
  replaceBudgetOverrides(parsed.budgetOverrides)
  replaceIncomeOverrides(parsed.incomes)
  saveLearnedRules(parsed.learnedRules)
  saveTransactions(parsed.transactions, {
    allowEmpty: parsed.transactions.length === 0,
  })
  saveImports(parsed.imports, {
    allowEmpty: parsed.imports.length === 0,
  })
  saveGearState(parsed.gear)
  return parsed
}

export function formatMergeSummary(summary: MergeBackupSummary): string {
  const parts = [
    `+${summary.transactionsAdded} transaction${summary.transactionsAdded === 1 ? '' : 's'}`,
    `+${summary.importsAdded} statement${summary.importsAdded === 1 ? '' : 's'}`,
    `+${summary.learnedRulesAdded} rule${summary.learnedRulesAdded === 1 ? '' : 's'}`,
    `+${summary.customCategoriesAdded} categor${summary.customCategoriesAdded === 1 ? 'y' : 'ies'}`,
    `+${summary.customAccountsAdded} account${summary.customAccountsAdded === 1 ? '' : 's'}`,
    `+${summary.budgetsAdded} budget${summary.budgetsAdded === 1 ? '' : 's'}`,
    `+${summary.incomesFilled} income${summary.incomesFilled === 1 ? '' : 's'}`,
    `+${summary.gearCashAdded} gear cash`,
    `+${summary.gearKeepAdded} keep item${summary.gearKeepAdded === 1 ? '' : 's'}`,
  ]
  return `Merged: ${parts.join(', ')}.`
}

export async function readBackupFile(file: File): Promise<HouseholdBackup> {
  const text = await file.text()
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new Error('Could not parse backup JSON')
  }
  return parseBackup(raw)
}
