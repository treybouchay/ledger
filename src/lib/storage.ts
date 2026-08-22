import type { StatementImport, Transaction } from '../types'

/** Primary keys — check these in DevTools → Application → Local Storage. */
export const TX_KEY = 'household-ledger.transactions.v1'
export const IMPORTS_KEY = 'household-ledger.imports.v1'
export const MONTH_KEY = 'household-ledger.ui-month.v1'
export const SIDE_NAV_EXPANDED_KEY = 'household-ledger.side-nav-expanded.v1'

/** Snapshots kept when data is non-empty; used to recover from accidental wipes. */
const TX_LAST_GOOD_KEY = 'household-ledger.transactions.last-good.v1'
const IMPORTS_LAST_GOOD_KEY = 'household-ledger.imports.last-good.v1'

export const STORAGE_KEYS = {
  transactions: TX_KEY,
  imports: IMPORTS_KEY,
  transactionsLastGood: TX_LAST_GOOD_KEY,
  importsLastGood: IMPORTS_LAST_GOOD_KEY,
  uiMonth: MONTH_KEY,
  sideNavExpanded: SIDE_NAV_EXPANDED_KEY,
} as const

export function loadSideNavExpanded(): boolean {
  try {
    return localStorage.getItem(SIDE_NAV_EXPANDED_KEY) === '1'
  } catch {
    return false
  }
}

export function saveSideNavExpanded(expanded: boolean): void {
  try {
    localStorage.setItem(SIDE_NAV_EXPANDED_KEY, expanded ? '1' : '0')
  } catch {
    /* ignore */
  }
}

function readJsonArray<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw) as T[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeJson(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value))
}

function hasNonEmptyStored(key: string): boolean {
  const raw = localStorage.getItem(key)
  if (!raw || raw === '[]') return false
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.length > 0
  } catch {
    return false
  }
}

function storedCount(key: string): number {
  return readJsonArray(key).length
}

/**
 * Empty by default — statements + manual logs are the source of truth.
 * Never falls back to seed data. If the primary key was wiped but a last-good
 * snapshot remains, restores it (guards against accidental empty overwrites).
 */
export function loadTransactions(): {
  transactions: Transaction[]
  recoveredFromLastGood: boolean
} {
  const primary = readJsonArray<Transaction>(TX_KEY)
  if (primary.length > 0) {
    return { transactions: primary, recoveredFromLastGood: false }
  }

  const lastGood = readJsonArray<Transaction>(TX_LAST_GOOD_KEY)
  if (lastGood.length > 0) {
    try {
      writeJson(TX_KEY, lastGood)
    } catch (err) {
      console.error('[household-ledger] restore transactions primary failed', err)
    }
    return { transactions: lastGood, recoveredFromLastGood: true }
  }
  return { transactions: [], recoveredFromLastGood: false }
}

/**
 * Persist transactions. Refuses to overwrite non-empty primary OR last-good
 * with [] unless `allowEmpty` is set (intentional clear / remove-last).
 * Non-empty writes always refresh the last-good snapshot.
 */
export function saveTransactions(
  transactions: Transaction[],
  options?: { allowEmpty?: boolean },
): { ok: boolean; refused?: boolean; error?: string } {
  try {
    if (
      transactions.length === 0 &&
      !options?.allowEmpty &&
      (hasNonEmptyStored(TX_KEY) || hasNonEmptyStored(TX_LAST_GOOD_KEY))
    ) {
      console.warn(
        '[household-ledger] Refused empty overwrite of transactions — use clear or allowEmpty',
      )
      // If primary is already empty but last-good exists, put it back.
      if (!hasNonEmptyStored(TX_KEY) && hasNonEmptyStored(TX_LAST_GOOD_KEY)) {
        try {
          writeJson(TX_KEY, readJsonArray(TX_LAST_GOOD_KEY))
        } catch {
          /* ignore */
        }
      }
      return { ok: false, refused: true }
    }

    writeJson(TX_KEY, transactions)
    if (transactions.length > 0) {
      writeJson(TX_LAST_GOOD_KEY, transactions)
    } else if (options?.allowEmpty) {
      // Intentional clear — only wipe last-good when caller confirmed.
      localStorage.removeItem(TX_LAST_GOOD_KEY)
    }
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'localStorage write failed'
    console.error('[household-ledger] saveTransactions failed', err)
    return { ok: false, error: message }
  }
}

export function clearStoredTransactions(): void {
  saveTransactions([], { allowEmpty: true })
}

export function loadImports(): {
  imports: StatementImport[]
  recoveredFromLastGood: boolean
} {
  const primary = readJsonArray<StatementImport>(IMPORTS_KEY)
  if (primary.length > 0) {
    return { imports: primary, recoveredFromLastGood: false }
  }

  const lastGood = readJsonArray<StatementImport>(IMPORTS_LAST_GOOD_KEY)
  if (lastGood.length > 0) {
    try {
      writeJson(IMPORTS_KEY, lastGood)
    } catch (err) {
      console.error('[household-ledger] restore imports primary failed', err)
    }
    return { imports: lastGood, recoveredFromLastGood: true }
  }
  return { imports: [], recoveredFromLastGood: false }
}

export function saveImports(
  imports: StatementImport[],
  options?: { allowEmpty?: boolean },
): { ok: boolean; refused?: boolean; error?: string } {
  try {
    if (
      imports.length === 0 &&
      !options?.allowEmpty &&
      (hasNonEmptyStored(IMPORTS_KEY) || hasNonEmptyStored(IMPORTS_LAST_GOOD_KEY))
    ) {
      console.warn(
        '[household-ledger] Refused empty overwrite of imports — use clear or allowEmpty',
      )
      if (!hasNonEmptyStored(IMPORTS_KEY) && hasNonEmptyStored(IMPORTS_LAST_GOOD_KEY)) {
        try {
          writeJson(IMPORTS_KEY, readJsonArray(IMPORTS_LAST_GOOD_KEY))
        } catch {
          /* ignore */
        }
      }
      return { ok: false, refused: true }
    }

    writeJson(IMPORTS_KEY, imports)
    if (imports.length > 0) {
      writeJson(IMPORTS_LAST_GOOD_KEY, imports)
    } else if (options?.allowEmpty) {
      localStorage.removeItem(IMPORTS_LAST_GOOD_KEY)
    }
    return { ok: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'localStorage write failed'
    console.error('[household-ledger] saveImports failed', err)
    return { ok: false, error: message }
  }
}

export function clearStoredImports(): void {
  saveImports([], { allowEmpty: true })
}

/** Peek counts without mutating storage (for UI / diagnostics). */
export function peekLedgerCounts(): {
  transactions: number
  imports: number
  transactionsLastGood: number
  importsLastGood: number
} {
  return {
    transactions: storedCount(TX_KEY),
    imports: storedCount(IMPORTS_KEY),
    transactionsLastGood: storedCount(TX_LAST_GOOD_KEY),
    importsLastGood: storedCount(IMPORTS_LAST_GOOD_KEY),
  }
}

/**
 * Force-restore from last-good into primary + return the rows.
 * Used when the UI state looks empty but a snapshot still exists.
 */
export function restoreTransactionsFromLastGood(): Transaction[] {
  const lastGood = readJsonArray<Transaction>(TX_LAST_GOOD_KEY)
  if (lastGood.length === 0) return []
  try {
    writeJson(TX_KEY, lastGood)
  } catch (err) {
    console.error('[household-ledger] manual last-good tx restore failed', err)
  }
  return lastGood
}

export function restoreImportsFromLastGood(): StatementImport[] {
  const lastGood = readJsonArray<StatementImport>(IMPORTS_LAST_GOOD_KEY)
  if (lastGood.length === 0) return []
  try {
    writeJson(IMPORTS_KEY, lastGood)
  } catch (err) {
    console.error('[household-ledger] manual last-good imports restore failed', err)
  }
  return lastGood
}

export function loadUiMonth(fallback: string): string {
  try {
    const raw = localStorage.getItem(MONTH_KEY)
    if (raw && /^\d{4}-\d{2}$/.test(raw)) return raw
  } catch {
    /* ignore */
  }
  return fallback
}

export function saveUiMonth(monthId: string): void {
  try {
    if (/^\d{4}-\d{2}$/.test(monthId)) {
      localStorage.setItem(MONTH_KEY, monthId)
    }
  } catch {
    /* ignore */
  }
}

/** Months that have charges and/or uploaded statement metadata. */
export function collectActivityMonthIds(
  transactions: Transaction[],
  imports: StatementImport[] = [],
): string[] {
  const ids = new Set<string>()
  for (const t of transactions) {
    if (t.monthId && /^\d{4}-\d{2}$/.test(t.monthId)) ids.add(t.monthId)
  }
  for (const item of imports) {
    for (const monthId of item.monthIds ?? []) {
      if (monthId && /^\d{4}-\d{2}$/.test(monthId)) ids.add(monthId)
    }
  }
  return [...ids].sort()
}

/** Calendar YYYY-MM for “today” (browser local timezone). */
export function calendarMonthId(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

/**
 * Prefer a remembered month only if it still has activity. Otherwise jump to
 * the latest month with transactions or imported statements — never strand the
 * user on a stale seed month while newer data exists. With no activity yet,
 * prefer the current calendar month over the hardcoded seed fallback.
 */
export function pickInitialMonthId(
  transactions: Transaction[],
  fallback: string,
  imports: StatementImport[] = [],
): string {
  const months = collectActivityMonthIds(transactions, imports)
  const stored = loadUiMonth('')
  if (stored && months.includes(stored)) return stored
  if (months.length > 0) return months[months.length - 1]
  if (stored) return stored
  const calendar = calendarMonthId()
  if (/^\d{4}-\d{2}$/.test(calendar)) return calendar
  return fallback
}

/**
 * Imports that claim charges but have no matching rows in `transactions`.
 * Common after a partial wipe where statement metadata survived.
 */
export function findOrphanedImports(
  transactions: Transaction[],
  imports: StatementImport[],
): StatementImport[] {
  const present = new Set(
    transactions.map((t) => t.importId).filter((id): id is string => Boolean(id)),
  )
  return imports.filter(
    (item) => item.transactionCount > 0 && !present.has(item.id),
  )
}

/**
 * If statement records exist without matching transactions, pull those rows
 * back from the last-good snapshot (when still available).
 */
export function recoverOrphanedImportTransactions(
  transactions: Transaction[],
  imports: StatementImport[],
): { transactions: Transaction[]; recoveredCount: number } {
  const orphaned = findOrphanedImports(transactions, imports)
  if (orphaned.length === 0) {
    return { transactions, recoveredCount: 0 }
  }

  const lastGood = readJsonArray<Transaction>(TX_LAST_GOOD_KEY)
  if (lastGood.length === 0) {
    return { transactions, recoveredCount: 0 }
  }

  const orphanIds = new Set(orphaned.map((item) => item.id))
  const existingIds = new Set(transactions.map((t) => t.id))
  const added = lastGood.filter(
    (t) =>
      t.importId &&
      orphanIds.has(t.importId) &&
      !existingIds.has(t.id),
  )
  if (added.length === 0) {
    return { transactions, recoveredCount: 0 }
  }

  const merged = [...transactions, ...added]
  try {
    writeJson(TX_KEY, merged)
    writeJson(TX_LAST_GOOD_KEY, merged)
  } catch (err) {
    console.error('[household-ledger] orphan recovery write failed', err)
  }
  return { transactions: merged, recoveredCount: added.length }
}

/**
 * Screenshot imports sometimes stamped undated Amex rows with the upload day.
 * When the same import also has real section dates that are older, move those
 * upload-day rows back to the newest real charge date in that import.
 */
export function repairUploadDayChargeDates(
  transactions: Transaction[],
  imports: StatementImport[],
): { transactions: Transaction[]; repairedCount: number } {
  const importById = new Map(imports.map((row) => [row.id, row]))
  const byImport = new Map<string, Transaction[]>()
  for (const t of transactions) {
    if (!t.importId) continue
    const list = byImport.get(t.importId)
    if (list) list.push(t)
    else byImport.set(t.importId, [t])
  }

  const fixes = new Map<string, string>()
  for (const [importId, txs] of byImport) {
    const imp = importById.get(importId)
    if (!imp || imp.sourceKind === 'statement') continue
    const uploadedDay = (imp.uploadedAt || '').slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(uploadedDay)) continue

    const otherDates = txs
      .map((t) => t.date.slice(0, 10))
      .filter(
        (d) => d !== uploadedDay && /^\d{4}-\d{2}-\d{2}$/.test(d),
      )
    if (otherDates.length === 0) continue
    const maxReal = otherDates.reduce((a, b) => (a > b ? a : b))
    // Only rewrite when upload day is clearly newer than every dated charge —
    // those rows were almost certainly OCR-defaulted to "today".
    if (uploadedDay <= maxReal) continue

    for (const t of txs) {
      if (t.date.slice(0, 10) === uploadedDay) fixes.set(t.id, maxReal)
    }
  }

  if (fixes.size === 0) {
    return { transactions, repairedCount: 0 }
  }

  return {
    transactions: transactions.map((t) => {
      const nextDate = fixes.get(t.id)
      if (!nextDate) return t
      return { ...t, date: nextDate, monthId: nextDate.slice(0, 7) }
    }),
    repairedCount: fixes.size,
  }
}

/** Load txs + imports together and attempt orphan / last-good recovery. */
export function bootstrapLedger(): {
  transactions: Transaction[]
  imports: StatementImport[]
  recoveredCount: number
  recoveredFromLastGood: boolean
  repairedUploadDates: number
} {
  const loadedImports = loadImports()
  const loadedTx = loadTransactions()
  const { transactions, recoveredCount } = recoverOrphanedImportTransactions(
    loadedTx.transactions,
    loadedImports.imports,
  )
  const repaired = repairUploadDayChargeDates(
    transactions,
    loadedImports.imports,
  )
  if (repaired.repairedCount > 0) {
    const saved = saveTransactions(repaired.transactions)
    if (!saved.ok) {
      console.warn(
        '[household-ledger] could not persist upload-day date repair',
        saved.error,
      )
    }
  }
  return {
    transactions: repaired.transactions,
    imports: loadedImports.imports,
    recoveredCount,
    recoveredFromLastGood:
      loadedTx.recoveredFromLastGood || loadedImports.recoveredFromLastGood,
    repairedUploadDates: repaired.repairedCount,
  }
}
