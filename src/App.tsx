import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { BootLoader } from './components/BootLoader'
import {
  bootstrapCloudSession,
  CloudSyncPanel,
} from './components/CloudSyncPanel'
import { BudgetPanel } from './components/BudgetPanel'
import { GearFlipsPanel } from './components/GearFlipsPanel'
import { ImportReviewQueue } from './components/ImportReviewQueue'
import { LearningPanel } from './components/LearningPanel'
import { LogExpenseForm } from './components/LogExpenseForm'
import { CategoryMatchers } from './components/CategoryMatchers'
import {
  MonthEndSummary,
  MONTH_END_SUMMARY_ID,
  monthEndReconcileHint,
} from './components/MonthEndSummary'
import { OnTrackBars } from './components/OnTrackBars'
import { UploadedStatements } from './components/UploadedStatements'
import { StatementFilePreview } from './components/StatementFilePreview'
import {
  ACCOUNTS,
  ACTIVE_MONTH_ID,
  PEOPLE,
} from './data/seed'
import {
  applyBackup,
  applyMergedBackup,
  buildBackup,
  downloadBackup,
  formatMergeSummary,
  mergeBackup,
  readBackupFile,
} from './lib/backup'
import {
  budgetFor,
  formatMoney,
  isMoneyIn,
  isVariableBudgetOver,
  monthEndSaveLines,
  onTrackToSave,
  rollupAccounts,
  rollupCategories,
  rollupMerchants,
  summarizeMonth,
} from './lib/compute'
import {
  createCustomCategory,
  getAllBudgets,
  getAllCategories,
  getBudgetOverrides,
  getCustomCategories,
  getIncomeOverrides,
  isBuiltInCategoryId,
  removeCustomCategoryData,
  replaceCustomCategories,
  upsertBudget,
} from './lib/customCategories'
import {
  accountsForPerson,
  getAllAccounts,
  getCustomAccounts,
  removeCustomAccountData,
} from './lib/customAccounts'
import {
  accountIcon,
  accountLabel,
  accountOptionLabel,
  categoryLabel,
  categoryOptionLabel,
  personOptionLabel,
} from './lib/labels'
import { CategoryLineIcon } from './lib/categoryIcons'
import {
  loadLearnedRules,
  merchantMatchesPattern,
  normalizePattern,
  saveLearnedRules,
  type LearnedRule,
} from './lib/learnedRules'
import {
  findNearDateDuplicateRemovals,
  findPossibleDuplicatePairs,
  possibleDuplicatePairKey,
  type PossibleDuplicatePair,
} from './lib/duplicates'
import { confirmRemove } from './lib/confirm'
import {
  ensureHousehold,
  migrateDeviceToCloud,
  type CloudContext,
} from './lib/cloudSync'
import { getSupabase, isSupabaseConfigured } from './lib/supabase'
import type { ReviewDraftRow } from './lib/reviewDraft'
import {
  bootstrapLedger,
  clearStoredImports,
  clearStoredTransactions,
  collectActivityMonthIds,
  findOrphanedImports,
  loadSideNavExpanded,
  peekLedgerCounts,
  pickInitialMonthId,
  restoreImportsFromLastGood,
  restoreTransactionsFromLastGood,
  saveImports,
  saveSideNavExpanded,
  saveTransactions,
  saveUiMonth,
  STORAGE_KEYS,
} from './lib/storage'
import {
  loadGearState,
  netCashMadeForMonth,
  realizedFlipProfitForMonth,
  resetGearState,
  saveGearState,
} from './lib/gearStorage'
import {
  clearAllStatementFiles,
  deleteStatementFile,
  loadStatementFile,
  saveStatementFile,
  saveStatementFileParts,
  type StoredStatementFile,
} from './lib/statementFiles'
import {
  readAppTab,
  writeAppTab,
  writeGearSubTab,
  BUDGETING_TABS,
  SIDE_NAV_ITEMS,
  defaultTabForSide,
  isBudgetingTab,
  sideNavForTab,
  type AppTab,
  type SideNavId,
} from './lib/nav'
import {
  SideNavIcon,
  SideNavLogo,
  SideNavToggleIcon,
} from './components/SideNavIcon'
import type {
  Account,
  Category,
  CategoryId,
  CategoryKind,
  CategoryRollup,
  GearState,
  PersonId,
  StatementImport,
  Transaction,
} from './types'

function monthLabel(monthId: string): string {
  const [y, m] = monthId.split('-').map(Number)
  if (!y || !m) return monthId
  return new Date(y, m - 1, 1).toLocaleString('en-CA', {
    month: 'long',
    year: 'numeric',
  })
}

export default function App() {
  const [tab, setTab] = useState<AppTab>(() => readAppTab())
  const [lastBudgetingTab, setLastBudgetingTab] = useState<AppTab>(() => {
    const initial = readAppTab()
    return isBudgetingTab(initial) ? initial : 'overview'
  })
  const activeSide = sideNavForTab(tab)
  const [sideNavExpanded, setSideNavExpanded] = useState(() =>
    loadSideNavExpanded(),
  )
  const [ledgerBoot] = useState(() => bootstrapLedger())
  const [bootReady, setBootReady] = useState(false)
  const [showBootLoader, setShowBootLoader] = useState(true)
  const [transactions, setTransactions] = useState<Transaction[]>(
    () => ledgerBoot.transactions,
  )
  const [imports, setImports] = useState<StatementImport[]>(
    () => ledgerBoot.imports,
  )
  const [learnedRules, setLearnedRules] = useState<LearnedRule[]>(() =>
    loadLearnedRules(),
  )
  const [customCategories, setCustomCategories] = useState<Category[]>(() =>
    getCustomCategories(),
  )
  const [customAccounts, setCustomAccounts] = useState<Account[]>(() =>
    getCustomAccounts(),
  )
  const [customBudgetTick, setCustomBudgetTick] = useState(0)
  const [monthId, setMonthId] = useState(() =>
    pickInitialMonthId(
      ledgerBoot.transactions,
      ACTIVE_MONTH_ID,
      ledgerBoot.imports,
    ),
  )
  const [storageWarning, setStorageWarning] = useState<string | null>(() => {
    if (ledgerBoot.recoveredFromLastGood) {
      const n = ledgerBoot.transactions.length
      return `Restored ${n} transaction${n === 1 ? '' : 's'} from a backup snapshot after the primary store looked empty.`
    }
    if (ledgerBoot.recoveredCount > 0) {
      return `Restored ${ledgerBoot.recoveredCount} charge${ledgerBoot.recoveredCount === 1 ? '' : 's'} from a backup snapshot that matched your uploaded statements.`
    }
    const stillOrphaned = findOrphanedImports(
      ledgerBoot.transactions,
      ledgerBoot.imports,
    )
    if (stillOrphaned.length > 0) {
      return `${stillOrphaned.length} uploaded statement${stillOrphaned.length === 1 ? '' : 's'} still listed under Manage statements, but the matching charges are missing from this browser. Re-upload the file, or restore a backup if you have one.`
    }
    return null
  })
  const [personFilter, setPersonFilter] = useState<PersonId | 'all'>('all')
  const [categoryPerson, setCategoryPerson] = useState<PersonId>('trevor')
  const [selectedCategoryId, setSelectedCategoryId] =
    useState<CategoryId | null>(null)
  const [whereItWentCategoryId, setWhereItWentCategoryId] =
    useState<CategoryId | null>(null)
  const [expandedAccountId, setExpandedAccountId] = useState<string | null>(
    null,
  )
  const [transactionCategoryFilter, setTransactionCategoryFilter] = useState<
    CategoryId | 'all'
  >('all')
  const [viewingImportId, setViewingImportId] = useState<string | null>(null)
  const [dupeCheckOpen, setDupeCheckOpen] = useState(false)
  const [dupeCheckKept, setDupeCheckKept] = useState<Set<string>>(
    () => new Set(),
  )
  const [showAddCategory, setShowAddCategory] = useState(false)
  const [editingCategoryId, setEditingCategoryId] = useState<CategoryId | null>(
    null,
  )
  const [overviewOpen, setOverviewOpen] = useState({
    payflow: false,
    people: false,
    cashIns: true,
    accounts: true,
    statements: false,
  })
  const [gear, setGear] = useState<GearState>(() => loadGearState())
  const [cloudContext, setCloudContext] = useState<CloudContext | null>(null)
  const cloudPushTimerRef = useRef<number | null>(null)
  const [backupMessage, setBackupMessage] = useState<string | null>(null)
  const backupFileRef = useRef<HTMLInputElement>(null)
  const backupActionRef = useRef<'restore' | 'merge'>('restore')
  const [statementUndo, setStatementUndo] = useState<{
    imports: StatementImport[]
    transactions: Transaction[]
    files: StoredStatementFile[]
    label: string
  } | null>(null)
  const statementUndoTimerRef = useRef<number | null>(null)
  const [importSuccess, setImportSuccess] = useState<string | null>(null)
  const importSuccessTimerRef = useRef<number | null>(null)
  /** Skip persist-on-mount so Strict Mode / HMR never write before load settles. */
  const txPersistReadyRef = useRef(false)
  const importsPersistReadyRef = useRef(false)
  const skipNextTxPersistRef = useRef(false)
  const skipNextImportsPersistRef = useRef(false)

  // Mark boot ready after first paint — ledger already loaded sync via bootstrapLedger.
  useEffect(() => {
    setBootReady(true)
  }, [])

  function toggleOverview(
    key: keyof typeof overviewOpen,
  ) {
    setOverviewOpen((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  function exportBackup() {
    const backup = buildBackup({
      transactions,
      imports,
      learnedRules,
      gear,
    })
    downloadBackup(backup)
    setBackupMessage('Backup downloaded — keep this file to restore on another device.')
  }

  async function importBackupFile(file: File | null) {
    if (!file) return
    const action = backupActionRef.current
    try {
      const parsed = await readBackupFile(file)
      if (action === 'merge') {
        const ok = confirmRemove(
          'Merge this backup into your local data?\n\nYour existing transactions, statements, rules, budgets, and gear stay. Missing pieces from the file are added; on conflicts your local values win. Near-duplicate charges (same person, merchant, amount, and date) are skipped.',
        )
        if (!ok) return
        const current = buildBackup({
          transactions,
          imports,
          learnedRules,
          gear,
        })
        // Prefer live React state for categories/budgets/incomes when available.
        current.customCategories = getCustomCategories()
        current.customAccounts = getCustomAccounts()
        current.budgetOverrides = getBudgetOverrides()
        current.incomes = getIncomeOverrides()
        const { backup: merged, summary } = mergeBackup(parsed, current)
        const applied = applyMergedBackup(merged)
        skipNextTxPersistRef.current = true
        skipNextImportsPersistRef.current = true
        setTransactions(applied.transactions)
        setImports(applied.imports)
        setLearnedRules(applied.learnedRules)
        setCustomCategories(getCustomCategories())
        setCustomAccounts(getCustomAccounts())
        setCustomBudgetTick((n) => n + 1)
        setGear(applied.gear)
        setViewingImportId(null)
        setMonthId(
          pickInitialMonthId(
            applied.transactions,
            ACTIVE_MONTH_ID,
            applied.imports,
          ),
        )
        const message = formatMergeSummary(summary)
        setBackupMessage(message)
        window.alert(message)
        return
      }

      const ok = confirmRemove(
        'Replace all data in this browser with the backup? Current transactions, statements, learning rules, and gear flips will be overwritten.',
      )
      if (!ok) return
      const applied = applyBackup(parsed)
      skipNextTxPersistRef.current = true
      skipNextImportsPersistRef.current = true
      setTransactions(applied.transactions)
      setImports(applied.imports)
      setLearnedRules(applied.learnedRules)
      setCustomCategories(getCustomCategories())
      setCustomAccounts(getCustomAccounts())
      setCustomBudgetTick((n) => n + 1)
      setGear(applied.gear)
      setViewingImportId(null)
      setMonthId(
        pickInitialMonthId(
          applied.transactions,
          ACTIVE_MONTH_ID,
          applied.imports,
        ),
      )
      setBackupMessage(
        `Restored backup from ${applied.exportedAt.slice(0, 10)}.`,
      )
    } catch (err) {
      setBackupMessage(
        err instanceof Error ? err.message : 'Could not import backup.',
      )
    } finally {
      if (backupFileRef.current) backupFileRef.current.value = ''
      backupActionRef.current = 'restore'
    }
  }

  function openBackupPicker(action: 'restore' | 'merge') {
    backupActionRef.current = action
    backupFileRef.current?.click()
  }

  const categories = useMemo(
    () => getAllCategories(),
    [customCategories],
  )

  const accounts = useMemo(
    () => getAllAccounts(),
    [customAccounts],
  )

  useEffect(() => {
    if (!txPersistReadyRef.current) {
      txPersistReadyRef.current = true
      return
    }
    if (skipNextTxPersistRef.current) {
      skipNextTxPersistRef.current = false
      return
    }
    // Effect must never persist [] — only confirmed clears (allowEmpty) may.
    if (transactions.length === 0) {
      const counts = peekLedgerCounts()
      if (counts.transactionsLastGood > 0 || counts.transactions > 0) {
        const rows = restoreTransactionsFromLastGood()
        if (rows.length > 0) {
          skipNextTxPersistRef.current = true
          setTransactions(rows)
          setStorageWarning(
            `Prevented a wipe of your transactions — restored ${rows.length} from a backup snapshot.`,
          )
        }
      }
      return
    }
    const result = saveTransactions(transactions)
    if (result.refused) {
      const rows = restoreTransactionsFromLastGood()
      if (rows.length > 0) {
        skipNextTxPersistRef.current = true
        setTransactions(rows)
        setStorageWarning(
          `Prevented a wipe of your transactions — restored ${rows.length} from a backup snapshot.`,
        )
      }
      return
    }
    if (!result.ok && result.error) {
      setStorageWarning(
        `Could not save transactions (${result.error}). Download a backup now.`,
      )
    }
  }, [transactions])

  useEffect(() => {
    if (!importsPersistReadyRef.current) {
      importsPersistReadyRef.current = true
      return
    }
    if (skipNextImportsPersistRef.current) {
      skipNextImportsPersistRef.current = false
      return
    }
    if (imports.length === 0) {
      const counts = peekLedgerCounts()
      if (counts.importsLastGood > 0 || counts.imports > 0) {
        const rows = restoreImportsFromLastGood()
        if (rows.length > 0) {
          skipNextImportsPersistRef.current = true
          setImports(rows)
          setStorageWarning(
            `Prevented a wipe of your statements — restored ${rows.length} from a backup snapshot.`,
          )
        }
      }
      return
    }
    const result = saveImports(imports)
    if (result.refused) {
      const rows = restoreImportsFromLastGood()
      if (rows.length > 0) {
        skipNextImportsPersistRef.current = true
        setImports(rows)
        setStorageWarning(
          `Prevented a wipe of your statements — restored ${rows.length} from a backup snapshot.`,
        )
      }
      return
    }
    if (!result.ok && result.error) {
      setStorageWarning(
        `Could not save statements (${result.error}). Download a backup now.`,
      )
    }
  }, [imports])

  useEffect(() => {
    saveLearnedRules(learnedRules)
  }, [learnedRules])

  useEffect(() => {
    saveGearState(gear)
  }, [gear])

  useEffect(() => {
    writeAppTab(tab)
    if (isBudgetingTab(tab)) setLastBudgetingTab(tab)
  }, [tab])

  useEffect(() => {
    saveSideNavExpanded(sideNavExpanded)
  }, [sideNavExpanded])

  useEffect(() => {
    return () => {
      if (statementUndoTimerRef.current != null) {
        window.clearTimeout(statementUndoTimerRef.current)
      }
      if (importSuccessTimerRef.current != null) {
        window.clearTimeout(importSuccessTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    saveUiMonth(monthId)
  }, [monthId])

  // Supabase auth + household bootstrap
  useEffect(() => {
    if (!isSupabaseConfigured()) return
    void bootstrapCloudSession().then(setCloudContext)
    const sb = getSupabase()
    if (!sb) return
    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((_event, session) => {
      if (session?.user?.email) {
        void ensureHousehold(session.user.id).then(({ householdId, error }) => {
          if (householdId) {
            setCloudContext({
              session,
              householdId,
              email: session.user.email!,
            })
          } else {
            console.error('[cloud] signed in but household failed', error)
            setCloudContext(null)
          }
        })
      } else {
        setCloudContext(null)
      }
    })
    return () => subscription.unsubscribe()
  }, [])

  // Debounced auto-save to cloud while signed in
  useEffect(() => {
    if (!cloudContext) return
    if (cloudPushTimerRef.current != null) {
      window.clearTimeout(cloudPushTimerRef.current)
    }
    cloudPushTimerRef.current = window.setTimeout(() => {
      void (async () => {
        try {
          const backup = buildBackup({
            transactions,
            imports,
            learnedRules,
            gear,
          })
          backup.customCategories = getCustomCategories()
          backup.customAccounts = getCustomAccounts()
          backup.budgetOverrides = getBudgetOverrides()
          backup.incomes = getIncomeOverrides()
          await migrateDeviceToCloud(cloudContext.householdId, backup, {
            snapshot: false,
          })
        } catch (err) {
          console.error('[cloud] auto sync failed', err)
        }
      })()
    }, 3000)
    return () => {
      if (cloudPushTimerRef.current != null) {
        window.clearTimeout(cloudPushTimerRef.current)
      }
    }
  }, [
    cloudContext,
    transactions,
    imports,
    learnedRules,
    gear,
    customBudgetTick,
    customCategories,
    customAccounts,
  ])

  function applyCloudPull(backup: ReturnType<typeof buildBackup>) {
    skipNextTxPersistRef.current = true
    skipNextImportsPersistRef.current = true
    setTransactions(backup.transactions)
    setImports(backup.imports)
    setLearnedRules(backup.learnedRules)
    setCustomCategories(getCustomCategories())
    setCustomAccounts(getCustomAccounts())
    setCustomBudgetTick((n) => n + 1)
    setGear(backup.gear)
    setViewingImportId(null)
    setMonthId(
      pickInitialMonthId(
        backup.transactions,
        ACTIVE_MONTH_ID,
        backup.imports,
      ),
    )
  }

  // Another tab wrote ledger keys — reload so we don't overwrite newer data.
  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (
        !event.key ||
        (event.key !== STORAGE_KEYS.transactions &&
          event.key !== STORAGE_KEYS.imports &&
          event.key !== STORAGE_KEYS.transactionsLastGood &&
          event.key !== STORAGE_KEYS.importsLastGood)
      ) {
        return
      }
      const boot = bootstrapLedger()
      skipNextTxPersistRef.current = true
      skipNextImportsPersistRef.current = true
      setTransactions(boot.transactions)
      setImports(boot.imports)
      if (boot.recoveredFromLastGood || boot.recoveredCount > 0) {
        setStorageWarning(
          `Synced from another tab / snapshot — ${boot.transactions.length} transaction${boot.transactions.length === 1 ? '' : 's'} loaded.`,
        )
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const availableMonths = useMemo(() => {
    const ids = new Set(collectActivityMonthIds(transactions, imports))
    ids.add(monthId)
    if (ids.size === 0) ids.add(ACTIVE_MONTH_ID)
    return [...ids].sort().reverse()
  }, [transactions, imports, monthId])

  const latestActivityMonthId = useMemo(() => {
    const months = collectActivityMonthIds(transactions, imports)
    return months.length > 0 ? months[months.length - 1] : null
  }, [transactions, imports])

  const monthTransactions = useMemo(
    () => transactions.filter((t) => t.monthId === monthId),
    [transactions, monthId],
  )

  /** Manual / imported “Cash in” rows — not gear sells. */
  const monthLedgerCashIns = useMemo(() => {
    return sortTransactionsMostRecent(
      monthTransactions.filter(
        (t) =>
          Boolean(t.isCashIn) &&
          !t.isRefund &&
          (personFilter === 'all' || t.personId === personFilter),
      ),
    )
  }, [monthTransactions, personFilter])
  const monthLedgerCashInTotal = useMemo(
    () =>
      Math.round(
        monthLedgerCashIns.reduce((sum, t) => sum + t.amount, 0) * 100,
      ) / 100,
    [monthLedgerCashIns],
  )

  const monthImports = useMemo(
    () => imports.filter((item) => item.monthIds.includes(monthId)),
    [imports, monthId],
  )

  const monthNearDateDuplicateRemovals = useMemo(
    () => findNearDateDuplicateRemovals(monthTransactions),
    [monthTransactions],
  )

  /** Other months that have charges while the selected month looks empty. */
  const alternateMonthsWithCharges = useMemo(() => {
    if (monthTransactions.length > 0) return []
    return collectActivityMonthIds(transactions, [])
      .filter((id) => id !== monthId)
      .reverse()
  }, [transactions, monthId, monthTransactions.length])

  const alternateMonthsWithStatements = useMemo(() => {
    if (monthTransactions.length > 0) return []
    return collectActivityMonthIds([], imports)
      .filter((id) => id !== monthId)
      .reverse()
  }, [imports, monthId, monthTransactions.length])

  const summary = useMemo(
    () => summarizeMonth(monthId, monthLabel(monthId), transactions),
    [monthId, transactions, customCategories, customBudgetTick],
  )

  const accountRows = useMemo(
    () => rollupAccounts(monthTransactions),
    [monthTransactions],
  )

  const personCategoryRows = useMemo(
    () => rollupCategories(monthTransactions, categoryPerson),
    [monthTransactions, categoryPerson, customCategories, customBudgetTick],
  )

  const householdCategorySpend = useMemo(() => {
    const map = new Map<
      string,
      {
        categoryId: CategoryId
        label: string
        icon: string
        spent: number
      }
    >()
    const personIds: PersonId[] =
      personFilter === 'all' ? ['trevor', 'kate'] : [personFilter]
    for (const personId of personIds) {
      for (const row of rollupCategories(monthTransactions, personId)) {
        if (row.kind === 'fixed' || row.spent <= 0) continue
        const prev = map.get(row.categoryId)
        map.set(row.categoryId, {
          categoryId: row.categoryId,
          label: row.label,
          icon: row.icon,
          spent: Math.round(((prev?.spent ?? 0) + row.spent) * 100) / 100,
        })
      }
    }
    return [...map.values()]
      .sort((a, b) => b.spent - a.spent)
      .map((r) => {
        const cap = Math.round(
          personIds.reduce(
            (sum, personId) => sum + budgetFor(personId, r.categoryId),
            0,
          ) * 100,
        ) / 100
        const ofCap =
          cap > 0 ? Math.round((r.spent / cap) * 1000) / 10 : null
        return {
          ...r,
          cap,
          ofCap,
          leftover:
            cap > 0 ? Math.round((cap - r.spent) * 100) / 100 : null,
        }
      })
  }, [monthTransactions, personFilter, customCategories, customBudgetTick])

  const recentVariableCharges = useMemo(() => {
    const variableIds = new Set(
      getAllCategories()
        .filter((c) => c.kind === 'variable')
        .map((c) => c.id),
    )
    return sortTransactionsMostRecent(
      monthTransactions.filter(
        (t) =>
          variableIds.has(t.categoryId) &&
          (personFilter === 'all' || t.personId === personFilter),
      ),
    ).slice(0, 5)
  }, [monthTransactions, personFilter, customCategories, customBudgetTick])

  const linkableTransactions = useMemo(() => {
    return monthTransactions
      .filter((t) => t.personId === categoryPerson)
      .sort(
        (a, b) =>
          b.date.localeCompare(a.date) || b.id.localeCompare(a.id),
      )
  }, [monthTransactions, categoryPerson])

  const visibleTx = useMemo(() => {
    return monthTransactions
      .filter((t) =>
        personFilter === 'all' ? true : t.personId === personFilter,
      )
      .filter((t) =>
        transactionCategoryFilter === 'all'
          ? true
          : t.categoryId === transactionCategoryFilter,
      )
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [monthTransactions, personFilter, transactionCategoryFilter])

  const viewingImport = useMemo(
    () => imports.find((item) => item.id === viewingImportId) ?? null,
    [imports, viewingImportId],
  )

  const statementTransactions = useMemo(() => {
    if (!viewingImportId) return []
    return transactions
      .filter((t) => t.importId === viewingImportId)
      .sort(
        (a, b) =>
          b.date.localeCompare(a.date) || b.id.localeCompare(a.id),
      )
  }, [transactions, viewingImportId])

  const statementMonthBreakdown = useMemo(() => {
    const counts = new Map<string, number>()
    for (const t of statementTransactions) {
      counts.set(t.monthId, (counts.get(t.monthId) ?? 0) + 1)
    }
    return [...counts.entries()]
      .map(([id, count]) => ({ monthId: id, count }))
      .sort((a, b) => a.monthId.localeCompare(b.monthId))
  }, [statementTransactions])

  const importLiveCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const t of transactions) {
      if (!t.importId) continue
      counts.set(t.importId, (counts.get(t.importId) ?? 0) + 1)
    }
    return counts
  }, [transactions])

  /** Charges from statements that touch this month but were dated in other months. */
  const spilloverFromMonthImports = useMemo(() => {
    const relatedImportIds = new Set(
      imports
        .filter((imp) => imp.monthIds.includes(monthId))
        .map((imp) => imp.id),
    )
    if (relatedImportIds.size === 0) return [] as { monthId: string; count: number }[]
    const otherMonthCounts = new Map<string, number>()
    for (const t of transactions) {
      if (!t.importId || !relatedImportIds.has(t.importId)) continue
      if (t.monthId === monthId) continue
      otherMonthCounts.set(
        t.monthId,
        (otherMonthCounts.get(t.monthId) ?? 0) + 1,
      )
    }
    return [...otherMonthCounts.entries()]
      .map(([id, count]) => ({ monthId: id, count }))
      .sort((a, b) => b.monthId.localeCompare(a.monthId))
  }, [imports, transactions, monthId])

  const seedCount = useMemo(
    () => transactions.filter((t) => t.source === 'seed').length,
    [transactions],
  )
  const hasDuplicatesRisk =
    seedCount > 0 && transactions.some((t) => t.source === 'csv')

  const nearDateDuplicateRemovals = useMemo(
    () => findNearDateDuplicateRemovals(transactions),
    [transactions],
  )

  const possibleDuplicatePairs = useMemo(
    () =>
      findPossibleDuplicatePairs(transactions, {
        monthId,
        personId: tab === 'transactions' ? personFilter : 'all',
      }),
    [transactions, monthId, tab, personFilter],
  )

  const visibleDupeCheckPairs = useMemo(
    () =>
      possibleDuplicatePairs.filter(
        (p) => !dupeCheckKept.has(possibleDuplicatePairKey(p)),
      ),
    [possibleDuplicatePairs, dupeCheckKept],
  )

  const snapshotCounts = peekLedgerCounts()
  const canRestoreSnapshot =
    transactions.length === 0 &&
    (snapshotCounts.transactionsLastGood > 0 ||
      snapshotCounts.importsLastGood > 0)

  const trevor = summary.people.find((p) => p.personId === 'trevor')!
  const kate = summary.people.find((p) => p.personId === 'kate')!

  const overviewInsight =
    personFilter === 'trevor'
      ? trevor
      : personFilter === 'kate'
        ? kate
        : null
  const insightVariableSpent =
    overviewInsight?.variableSpent ?? summary.variableSpent
  const insightVariableBudget =
    overviewInsight?.variableBudget ?? summary.variableBudget
  const insightFixedBudget =
    overviewInsight?.fixedBudget ?? summary.fixedBudget
  // Overview always focuses on variable caps; fixed bills are assumed paid.
  const insightStillAvailable =
    Math.round((insightVariableBudget - insightVariableSpent) * 100) / 100
  const insightSpendCap = Math.max(insightVariableBudget, 0)
  const insightPersonLabel =
    personFilter === 'all'
      ? 'household'
      : (PEOPLE.find((p) => p.id === personFilter)?.name ?? personFilter)

  // Month income allocation: assume fixed bills at budget (planned), variable at actual spend.
  // Differs from Income & bills planned bar (which uses variable budget caps, not spend).
  const actualIncome =
    overviewInsight?.income ?? summary.combinedSalary
  const assumedFixedBills =
    overviewInsight?.fixedBudget ?? summary.fixedBudget
  const actualVariableSpent = insightVariableSpent
  const actualLeftover = onTrackToSave({
    income: actualIncome,
    fixedBudget: assumedFixedBills,
    variableSpent: actualVariableSpent,
  })
  // Gear flip profit is display-only from gear cash economics — not Transaction cash-ins.
  const monthFlipProfit = realizedFlipProfitForMonth(gear.cash, monthId)
  const monthCashMade = netCashMadeForMonth(gear.cash, monthId)
  const flipProfitPositive = Math.max(0, monthFlipProfit.profit)
  const showFlipProfit =
    monthFlipProfit.groupCount > 0 ||
    monthFlipProfit.sellCount > 0 ||
    monthCashMade.nonGear > 0
  const showLedgerCashIn = monthLedgerCashIns.length > 0
  // Hypothetical: net cash made (gross sold − non-gear spends) infused into variable budget.
  const variableBudgetIfCashMade =
    Math.round((insightVariableBudget + monthCashMade.net) * 100) / 100
  const leftOfVariableIfCashMade =
    Math.round((variableBudgetIfCashMade - insightVariableSpent) * 100) / 100
  // Bar = uses of salary (fixed / variable / leftover) plus a distinct gear-flip
  // infusion segment. Leftover card stays income − fixed − variable (no flips).
  // Base expands by positive flip profit so segments still sum to ~100%:
  //   fixed + variable + max(0, salary leftover) + flipProfit = income + flipProfit
  //   (when overspent on salary: leftover segment is 0; flips still appear in full).
  const actualAllocBase = Math.max(
    actualIncome + flipProfitPositive,
    assumedFixedBills + actualVariableSpent + flipProfitPositive,
    1,
  )
  const actualFixedPct = Math.min(
    100,
    (assumedFixedBills / actualAllocBase) * 100,
  )
  const actualVariablePct = Math.min(
    100,
    (actualVariableSpent / actualAllocBase) * 100,
  )
  const actualFlipPct =
    flipProfitPositive > 0
      ? Math.min(100, (flipProfitPositive / actualAllocBase) * 100)
      : 0
  const actualLeftoverPct = Math.max(
    0,
    100 - actualFixedPct - actualVariablePct - actualFlipPct,
  )

  const monthEndLines = monthEndSaveLines(summary.people)

  async function commitReviewed(
    rows: ReviewDraftRow[],
    meta: {
      fileName: string
      personId: PersonId
      file: File | null
      files?: File[]
      totalParsed: number
      skippedDuplicates: number
      skippedOther: number
      sourceKind?: 'statement' | 'screenshot'
    },
  ) {
    const stamp = Date.now()
    const importId = `import-${stamp}`
    const next: Transaction[] = rows.map((row, i) => ({
      id: `csv-${stamp}-${i}`,
      personId: row.personId,
      monthId: row.date.slice(0, 7) || monthId,
      date: row.date,
      amount: row.amount,
      merchant: row.merchant,
      accountId: row.accountId,
      categoryId: row.categoryId,
      isRefund: row.isRefund ?? false,
      isCashIn: row.isCashIn ?? false,
      source: 'csv',
      importId,
      sourceFile: meta.fileName,
    }))

    const accountCounts = new Map<string, number>()
    for (const t of next) {
      accountCounts.set(t.accountId, (accountCounts.get(t.accountId) ?? 0) + 1)
    }
    const primaryAccountId =
      ([...accountCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] as
        | Transaction['accountId']
        | undefined) ?? 'other'

    const monthCounts = new Map<string, number>()
    for (const t of next) {
      monthCounts.set(t.monthId, (monthCounts.get(t.monthId) ?? 0) + 1)
    }
    const monthIds = [...monthCounts.keys()].sort()
    const primaryMonth =
      [...monthCounts.entries()].sort(
        (a, b) => b[1] - a[1] || b[0].localeCompare(a[0]),
      )[0]?.[0] ?? monthIds[monthIds.length - 1]
    const netAmount = next.reduce(
      (sum, t) => sum + (isMoneyIn(t) ? -t.amount : t.amount),
      0,
    )

    let hasStoredFile = false
    let mimeType: string | undefined
    let storedFileNames: string[] | undefined
    const uploadedFiles =
      meta.files && meta.files.length > 0
        ? meta.files
        : meta.file
          ? [meta.file]
          : []
    if (uploadedFiles.length > 1) {
      // Screenshot batch — keep every page so the viewer can browse them.
      try {
        const stored = await saveStatementFileParts(importId, uploadedFiles)
        hasStoredFile = stored.length > 0
        mimeType = stored[0]?.mimeType
        storedFileNames = stored.map((s) => s.fileName)
      } catch (err) {
        console.error('[household-ledger] statement files save failed', err)
      }
    } else if (meta.file) {
      try {
        const stored = await saveStatementFile(
          importId,
          meta.file,
          meta.fileName,
        )
        hasStoredFile = true
        mimeType = stored.mimeType
      } catch (err) {
        console.error('[household-ledger] statement file save failed', err)
      }
    }

    const record: StatementImport = {
      id: importId,
      fileName: meta.fileName,
      uploadedAt: new Date(stamp).toISOString(),
      personId: meta.personId,
      primaryAccountId,
      monthIds,
      transactionCount: next.length,
      netAmount,
      hasStoredFile,
      mimeType,
      storedFileNames,
      sourceKind: meta.sourceKind,
    }

    // Persist immediately (don't wait for effects) so a refresh mid-commit can't drop data.
    setImports((prev) => {
      const merged = [record, ...prev]
      const saved = saveImports(merged)
      if (!saved.ok && saved.error) {
        setStorageWarning(
          `Could not save statement (${saved.error}). Download a backup now.`,
        )
      }
      return merged
    })
    setTransactions((prev) => {
      const merged = [...prev, ...next]
      const saved = saveTransactions(merged)
      if (!saved.ok && saved.error) {
        setStorageWarning(
          `Could not save transactions (${saved.error}). Download a backup now.`,
        )
      }
      return merged
    })
    teachFromReviewRows(rows)

    const skipParts: string[] = []
    if (meta.skippedDuplicates > 0) {
      skipParts.push(
        `skipped ${meta.skippedDuplicates} duplicate${meta.skippedDuplicates === 1 ? '' : 's'}`,
      )
    }
    if (meta.skippedOther > 0) {
      skipParts.push(
        `excluded ${meta.skippedOther} other row${meta.skippedOther === 1 ? '' : 's'}`,
      )
    }
    const monthParts = [...monthCounts.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([id, n]) => `${n} in ${monthLabel(id)}`)
      .join(', ')
    const fileNote =
      meta.file && !hasStoredFile
        ? 'original file could not be saved for preview'
        : null
    const successText = [
      `Imported ${next.length} of ${meta.totalParsed} from ${meta.fileName}`,
      `as ${personOptionLabel(meta.personId)}`,
      skipParts.length > 0 ? skipParts.join(', ') : null,
      monthParts ? `posted as ${monthParts}` : null,
      primaryMonth
        ? `switched to ${monthLabel(primaryMonth)} (most charges)`
        : null,
      fileNote,
    ]
      .filter(Boolean)
      .join(' — ') + '.'
    setBackupMessage(successText)
    if (importSuccessTimerRef.current != null) {
      window.clearTimeout(importSuccessTimerRef.current)
    }
    setImportSuccess(successText)
    importSuccessTimerRef.current = window.setTimeout(() => {
      setImportSuccess(null)
      importSuccessTimerRef.current = null
    }, 6500)

    if (primaryMonth) setMonthId(primaryMonth)
    setPersonFilter(meta.personId)
    setTransactionCategoryFilter('all')
    setViewingImportId(importId)
    setTab('transactions')
  }

  function closeStatementView() {
    setViewingImportId(null)
  }

  function openStatement(importId: string) {
    const item = imports.find((row) => row.id === importId)
    const linked = transactions.filter((t) => t.importId === importId)
    if (linked.length > 0) {
      const counts = new Map<string, number>()
      for (const t of linked) {
        counts.set(t.monthId, (counts.get(t.monthId) ?? 0) + 1)
      }
      const majority = [...counts.entries()].sort(
        (a, b) => b[1] - a[1] || b[0].localeCompare(a[0]),
      )[0]?.[0]
      if (majority) setMonthId(majority)
    } else if (item?.monthIds.length) {
      const sorted = [...item.monthIds].sort()
      const latest = sorted[sorted.length - 1]
      if (latest) setMonthId(latest)
    }
    if (item) setPersonFilter(item.personId)
    setTransactionCategoryFilter('all')
    setViewingImportId(importId)
  }

  useEffect(() => {
    if (!viewingImportId) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setViewingImportId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [viewingImportId])

  function clearStatementUndoTimer() {
    if (statementUndoTimerRef.current != null) {
      window.clearTimeout(statementUndoTimerRef.current)
      statementUndoTimerRef.current = null
    }
  }

  function armStatementUndo(payload: {
    imports: StatementImport[]
    transactions: Transaction[]
    files: StoredStatementFile[]
    label: string
  }) {
    clearStatementUndoTimer()
    setStatementUndo(payload)
    statementUndoTimerRef.current = window.setTimeout(() => {
      setStatementUndo(null)
      statementUndoTimerRef.current = null
    }, 12000)
  }

  async function loadStoredFilesForImports(
    items: StatementImport[],
  ): Promise<StoredStatementFile[]> {
    const files: StoredStatementFile[] = []
    for (const item of items) {
      if (!item.hasStoredFile) continue
      try {
        const stored = await loadStatementFile(item.id)
        if (stored) files.push(stored)
      } catch (err) {
        console.error(
          '[household-ledger] could not snapshot statement file for undo',
          err,
        )
      }
    }
    return files
  }

  async function undoStatementRemoval() {
    if (!statementUndo) return
    const snap = statementUndo
    clearStatementUndoTimer()
    setStatementUndo(null)

    setImports((prev) => {
      const byId = new Map(prev.map((item) => [item.id, item]))
      for (const item of snap.imports) byId.set(item.id, item)
      const next = [...byId.values()].sort((a, b) =>
        b.uploadedAt.localeCompare(a.uploadedAt),
      )
      saveImports(next)
      return next
    })
    setTransactions((prev) => {
      const byId = new Map(prev.map((t) => [t.id, t]))
      for (const t of snap.transactions) byId.set(t.id, t)
      const next = [...byId.values()]
      saveTransactions(next)
      return next
    })

    let filesRestored = 0
    for (const file of snap.files) {
      try {
        await saveStatementFile(file.importId, file.blob, file.fileName)
        filesRestored += 1
      } catch (err) {
        console.error('[household-ledger] statement file undo failed', err)
      }
    }

    const missingFiles =
      snap.imports.filter((item) => item.hasStoredFile).length - filesRestored
    setBackupMessage(
      missingFiles > 0
        ? `Restored ${snap.label}. ${missingFiles} original PDF/CSV file${missingFiles === 1 ? '' : 's'} could not be recovered — re-upload if you need to view the statement.`
        : `Restored ${snap.label}.`,
    )
  }

  async function removeImport(importId: string) {
    const item = imports.find((row) => row.id === importId)
    if (!item) return
    const linked = transactions.filter((t) => t.importId === importId)
    const count = linked.length > 0 ? linked.length : item.transactionCount
    const ok = confirmRemove(
      `Remove “${item.fileName}” and its ${count} transaction${count === 1 ? '' : 's'}?\n\nManual logs stay. You can undo for a few seconds after.`,
    )
    if (!ok) return

    const files = await loadStoredFilesForImports([item])

    setImports((prev) => {
      const next = prev.filter((row) => row.id !== importId)
      saveImports(next, { allowEmpty: next.length === 0 })
      return next
    })
    setTransactions((prev) => {
      const next = prev.filter((t) => t.importId !== importId)
      saveTransactions(next, { allowEmpty: next.length === 0 })
      return next
    })
    void deleteStatementFile(importId).catch((err) => {
      console.error('[household-ledger] statement file delete failed', err)
    })
    setViewingImportId((current) => (current === importId ? null : current))

    armStatementUndo({
      imports: [item],
      transactions: linked,
      files,
      label: `${item.fileName} (${count} charge${count === 1 ? '' : 's'})`,
    })
  }

  async function clearStatementsOnly() {
    const statementCount = imports.length
    const csvTxs = transactions.filter((t) => t.source === 'csv')
    const csvCount = csvTxs.length
    if (csvCount === 0 && statementCount === 0) return
    const ok = confirmRemove(
      `Remove ${statementCount || 'all'} uploaded statement${statementCount === 1 ? '' : 's'} and ${csvCount} imported charge${csvCount === 1 ? '' : 's'}?\n\nManual log entries stay. You can undo for a few seconds after.`,
    )
    if (!ok) return

    const removedImports = [...imports]
    const files = await loadStoredFilesForImports(removedImports)

    clearStoredImports()
    skipNextImportsPersistRef.current = true
    setImports([])
    setTransactions((prev) => {
      const next = prev.filter((t) => t.source !== 'csv')
      saveTransactions(next, { allowEmpty: next.length === 0 })
      return next
    })
    void clearAllStatementFiles().catch((err) => {
      console.error('[household-ledger] statement files clear failed', err)
    })
    setViewingImportId(null)

    armStatementUndo({
      imports: removedImports,
      transactions: csvTxs,
      files,
      label: `${statementCount} statement${statementCount === 1 ? '' : 's'} · ${csvCount} charge${csvCount === 1 ? '' : 's'}`,
    })
  }

  async function clearStatementsForMonth(targetMonthId: string) {
    const monthImports = imports.filter((item) =>
      item.monthIds.includes(targetMonthId),
    )
    const dropImportIds = new Set(monthImports.map((item) => item.id))
    const removedTxs = transactions.filter(
      (t) =>
        t.source === 'csv' &&
        (t.monthId === targetMonthId ||
          (t.importId != null && dropImportIds.has(t.importId))),
    )
    const monthCsvCount = transactions.filter(
      (t) => t.source === 'csv' && t.monthId === targetMonthId,
    ).length
    if (monthImports.length === 0 && monthCsvCount === 0) return

    const multiMonth = monthImports.filter((item) => item.monthIds.length > 1)
    const ok = confirmRemove(
      `Remove ${monthImports.length} statement${monthImports.length === 1 ? '' : 's'} linked to ${monthLabel(targetMonthId)} and ${monthCsvCount} imported charge${monthCsvCount === 1 ? '' : 's'} from that month?${
        multiMonth.length > 0
          ? `\n\n${multiMonth.length} statement${multiMonth.length === 1 ? '' : 's'} also cover other months — those files and all their charges will be removed.`
          : ''
      }\n\nManual log entries stay. You can undo for a few seconds after.`,
    )
    if (!ok) return

    const files = await loadStoredFilesForImports(monthImports)

    setImports((prev) => {
      const next = prev.filter((item) => !dropImportIds.has(item.id))
      saveImports(next, { allowEmpty: next.length === 0 })
      return next
    })
    setTransactions((prev) => {
      const next = prev.filter(
        (t) =>
          !(
            t.source === 'csv' &&
            (t.monthId === targetMonthId ||
              (t.importId != null && dropImportIds.has(t.importId)))
          ),
      )
      saveTransactions(next, { allowEmpty: next.length === 0 })
      return next
    })
    for (const id of dropImportIds) {
      void deleteStatementFile(id).catch((err) => {
        console.error('[household-ledger] statement file delete failed', err)
      })
    }
    setViewingImportId((current) =>
      current && dropImportIds.has(current) ? null : current,
    )

    armStatementUndo({
      imports: monthImports,
      transactions: removedTxs,
      files,
      label: `${monthImports.length} statement${monthImports.length === 1 ? '' : 's'} from ${monthLabel(targetMonthId)}`,
    })
  }

  function removeNearDateDuplicates() {
    const { pairs, removeIds } = findNearDateDuplicateRemovals(transactions)
    if (removeIds.length === 0) return
    const sample = pairs
      .slice(0, 5)
      .map(
        (p) =>
          `• ${p.remove.merchant} ${p.remove.date} (keep ${p.keep.date})`,
      )
      .join('\n')
    const more =
      pairs.length > 5 ? `\n…and ${pairs.length - 5} more` : ''
    const ok = confirmRemove(
      `Remove ${removeIds.length} near-duplicate charge${removeIds.length === 1 ? '' : 's'}?\n\nSame merchant + amount within ±1 day (keeps the later / posting date):\n${sample}${more}\n\nThis cannot be undone except via backup.`,
    )
    if (!ok) return
    const drop = new Set(removeIds)
    setTransactions((prev) => {
      const next = prev.filter((t) => !drop.has(t.id))
      saveTransactions(next, { allowEmpty: next.length === 0 })
      return next
    })
  }

  function openDupeCheck() {
    setDupeCheckKept(new Set())
    setDupeCheckOpen(true)
  }

  function closeDupeCheck() {
    setDupeCheckOpen(false)
  }

  function keepBothDuplicate(pair: PossibleDuplicatePair) {
    setDupeCheckKept((prev) => {
      const next = new Set(prev)
      next.add(possibleDuplicatePairKey(pair))
      return next
    })
  }

  function removeEarlierDuplicate(pair: PossibleDuplicatePair) {
    const ok = confirmRemove(
      `Remove earlier charge?\n\n${pair.merchant} ${formatMoney(pair.keep.amount)}\nKeep ${pair.keep.date}, remove ${pair.remove.date}.\n\nThis cannot be undone except via backup.`,
    )
    if (!ok) return
    setTransactions((prev) => {
      const next = prev.filter((t) => t.id !== pair.remove.id)
      saveTransactions(next, { allowEmpty: next.length === 0 })
      return next
    })
  }

  function removeAllFlaggedDuplicates(pairs: PossibleDuplicatePair[]) {
    if (pairs.length === 0) return
    const sample = pairs
      .slice(0, 5)
      .map(
        (p) =>
          `• ${p.merchant} ${formatMoney(p.keep.amount)} — keep ${p.keep.date}, remove ${p.remove.date}`,
      )
      .join('\n')
    const more = pairs.length > 5 ? `\n…and ${pairs.length - 5} more` : ''
    const ok = confirmRemove(
      `Remove ${pairs.length} flagged duplicate${pairs.length === 1 ? '' : 's'} (keep later date)?\n\n${sample}${more}\n\nThis cannot be undone except via backup.`,
    )
    if (!ok) return
    const drop = new Set(pairs.map((p) => p.remove.id))
    setTransactions((prev) => {
      const next = prev.filter((t) => !drop.has(t.id))
      saveTransactions(next, { allowEmpty: next.length === 0 })
      return next
    })
    setDupeCheckOpen(false)
  }

  function saveManual(tx: Transaction) {
    setTransactions((prev) => {
      const merged = [tx, ...prev]
      saveTransactions(merged)
      return merged
    })
    setMonthId(tx.monthId)
    setTab('transactions')
  }

  function startFresh() {
    const ok = confirmRemove(
      'Clear ALL transactions (statements + manual logs)? Categories and budgets from your sheet stay.',
    )
    if (!ok) return
    clearStoredTransactions()
    clearStoredImports()
    skipNextTxPersistRef.current = true
    skipNextImportsPersistRef.current = true
    setTransactions([])
    setImports([])
    setSelectedCategoryId(null)
    setTransactionCategoryFilter('all')
    setViewingImportId(null)
    setMonthId(ACTIVE_MONTH_ID)
    setTab('upload')
  }

  function tryRestoreLastGood() {
    const txs = restoreTransactionsFromLastGood()
    const imps = restoreImportsFromLastGood()
    if (txs.length === 0 && imps.length === 0) {
      setStorageWarning(
        'No backup snapshot found in this browser. Restore a downloaded JSON backup if you have one.',
      )
      return
    }
    if (txs.length > 0) {
      skipNextTxPersistRef.current = true
      setTransactions(txs)
    }
    if (imps.length > 0) {
      skipNextImportsPersistRef.current = true
      setImports(imps)
    }
    setMonthId(
      pickInitialMonthId(
        txs.length > 0 ? txs : transactions,
        ACTIVE_MONTH_ID,
        imps.length > 0 ? imps : imports,
      ),
    )
    setStorageWarning(
      `Restored ${txs.length} transaction${txs.length === 1 ? '' : 's'} and ${imps.length} statement${imps.length === 1 ? '' : 's'} from a backup snapshot.`,
    )
  }

  function openCategory(categoryId: CategoryId) {
    setSelectedCategoryId((current) =>
      current === categoryId ? null : categoryId,
    )
  }

  function addLearnedRules(
    lessons: { pattern: string; categoryId: CategoryId }[],
  ): number {
    const stamp = Date.now()
    let changed = 0
    setLearnedRules((prev) => {
      let next = prev
      let i = 0
      changed = 0
      for (const lesson of lessons) {
        const normalized = normalizePattern(lesson.pattern)
        if (!normalized || lesson.categoryId === 'other') continue
        const existingIdx = next.findIndex(
          (r) => normalizePattern(r.pattern) === normalized,
        )
        if (existingIdx >= 0) {
          if (next[existingIdx].categoryId === lesson.categoryId) continue
          if (next === prev) next = [...prev]
          next[existingIdx] = {
            ...next[existingIdx],
            categoryId: lesson.categoryId,
          }
          changed += 1
        } else {
          if (next === prev) next = [...prev]
          next = [
            {
              id: `rule-${stamp}-${i++}`,
              pattern: normalized,
              categoryId: lesson.categoryId,
              createdAt: new Date().toISOString(),
            },
            ...next,
          ]
          changed += 1
        }
      }
      return next
    })
    return changed
  }

  function addLearnedRule(pattern: string, categoryId: CategoryId) {
    addLearnedRules([{ pattern, categoryId }])
  }

  function teachFromReviewRows(rows: ReviewDraftRow[]) {
    addLearnedRules(
      rows
        .filter((row) => row.categoryId !== 'other')
        .map((row) => ({
          pattern: row.merchant,
          categoryId: row.categoryId,
        })),
    )
  }

  function removeLearnedRule(ruleId: string) {
    const rule = learnedRules.find((r) => r.id === ruleId)
    const label = rule?.pattern?.trim() || 'this learning rule'
    const ok = confirmRemove(
      `Remove the learning rule for “${label}”? New matching charges won’t auto-categorize with it.`,
    )
    if (!ok) return
    setLearnedRules((prev) => prev.filter((r) => r.id !== ruleId))
  }

  function assignTransactionToCategory(
    transactionId: string,
    categoryId: CategoryId,
    pattern: string,
  ) {
    const normalized = normalizePattern(pattern)
    addLearnedRule(normalized, categoryId)
    setTransactions((prev) =>
      prev.map((t) => {
        if (t.id === transactionId) return { ...t, categoryId }
        if (normalized && merchantMatchesPattern(t.merchant, normalized)) {
          return { ...t, categoryId }
        }
        return t
      }),
    )
  }

  function updateTransaction(tx: Transaction) {
    setTransactions((prev) => {
      const next = prev.map((t) => (t.id === tx.id ? tx : t))
      saveTransactions(next)
      return next
    })
    if (tx.monthId) setMonthId(tx.monthId)
  }

  function reassignStatementAccount(
    importId: string,
    accountId: Transaction['accountId'],
  ) {
    setTransactions((prev) => {
      const next = prev.map((t) =>
        t.importId === importId ? { ...t, accountId } : t,
      )
      saveTransactions(next)
      return next
    })
    setImports((prev) => {
      const next = prev.map((item) =>
        item.id === importId
          ? { ...item, primaryAccountId: accountId }
          : item,
      )
      saveImports(next)
      return next
    })
  }

  function viewCategoryInTransactions(
    categoryId: CategoryId,
    person: PersonId | 'all' = categoryPerson,
  ) {
    setTransactionCategoryFilter(categoryId)
    setPersonFilter(person)
    setViewingImportId(null)
    setTab('transactions')
  }

  function commitCustomCategories(next: Category[]) {
    replaceCustomCategories(next)
    setCustomCategories(next)
  }

  function addCategory(input: {
    label: string
    kind: CategoryKind
    icon: string
    budgetAmount: number
  }) {
    const created = createCustomCategory(input)
    commitCustomCategories([...getCustomCategories(), created])
    if (input.budgetAmount > 0) {
      upsertBudget(categoryPerson, created.id, input.budgetAmount)
      setCustomBudgetTick((n) => n + 1)
    }
    setShowAddCategory(false)
    setSelectedCategoryId(created.id)
  }

  function updateCustomCategory(
    categoryId: CategoryId,
    patch: { label: string; kind: CategoryKind; icon: string },
  ) {
    if (isBuiltInCategoryId(categoryId)) return
    const next = getCustomCategories().map((c) =>
      c.id === categoryId
        ? {
            ...c,
            label: patch.label.trim(),
            kind: patch.kind,
            icon: patch.icon.trim() || '•',
          }
        : c,
    )
    commitCustomCategories(next)
    setEditingCategoryId(null)
  }

  function removeCustomCategory(categoryId: CategoryId) {
    if (isBuiltInCategoryId(categoryId)) return
    const usingCount = transactions.filter((t) => t.categoryId === categoryId)
      .length
    const ruleCount = learnedRules.filter((r) => r.categoryId === categoryId)
      .length
    const label = categoryLabel(categoryId)
    const ok = confirmRemove(
      usingCount > 0 || ruleCount > 0
        ? `Remove “${label}”? ${usingCount} transaction${usingCount === 1 ? '' : 's'} will move to Other${ruleCount > 0 ? `, and ${ruleCount} learned rule${ruleCount === 1 ? '' : 's'} will be deleted` : ''}. Sheet categories stay.`
        : `Remove custom category “${label}”?`,
    )
    if (!ok) return

    if (usingCount > 0) {
      setTransactions((prev) =>
        prev.map((t) =>
          t.categoryId === categoryId ? { ...t, categoryId: 'other' } : t,
        ),
      )
    }
    if (ruleCount > 0) {
      setLearnedRules((prev) =>
        prev.filter((r) => r.categoryId !== categoryId),
      )
    }
    removeCustomCategoryData(categoryId)
    setCustomCategories(getCustomCategories())
    setCustomBudgetTick((n) => n + 1)
    setSelectedCategoryId((current) =>
      current === categoryId ? null : current,
    )
    setEditingCategoryId((current) =>
      current === categoryId ? null : current,
    )
    setTransactionCategoryFilter((current) =>
      current === categoryId ? 'all' : current,
    )
  }

  function removeCustomAccount(accountId: string) {
    const usingCount = transactions.filter((t) => t.accountId === accountId)
      .length
    const importCount = imports.filter((i) => i.primaryAccountId === accountId)
      .length
    const label = accountLabel(accountId)
    const ok = confirmRemove(
      usingCount > 0 || importCount > 0
        ? `Remove “${label}”? ${usingCount} transaction${usingCount === 1 ? '' : 's'}${importCount > 0 ? ` and ${importCount} statement${importCount === 1 ? '' : 's'}` : ''} will move to Other.`
        : `Remove custom account “${label}”?`,
    )
    if (!ok) return

    if (usingCount > 0) {
      setTransactions((prev) =>
        prev.map((t) =>
          t.accountId === accountId ? { ...t, accountId: 'other' } : t,
        ),
      )
    }
    if (importCount > 0) {
      setImports((prev) =>
        prev.map((item) =>
          item.primaryAccountId === accountId
            ? { ...item, primaryAccountId: 'other' }
            : item,
        ),
      )
    }
    removeCustomAccountData(accountId)
    setCustomAccounts(getCustomAccounts())
  }

  return (
    <>
      {showBootLoader ? (
        <BootLoader
          ready={bootReady}
          onDismiss={() => setShowBootLoader(false)}
        />
      ) : null}
      <div
        className={`shell${sideNavExpanded ? ' side-nav-expanded' : ''}`}
        aria-hidden={showBootLoader || undefined}
      >
      <nav className="side-nav" aria-label="App areas">
        <div className="side-nav-brand">
          <SideNavLogo expanded={sideNavExpanded} />
          <span className="visually-hidden">Ledger</span>
        </div>
        <div className="side-nav-items">
          {SIDE_NAV_ITEMS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              className="side-nav-btn"
              aria-label={label}
              title={label}
              aria-current={activeSide === id ? 'page' : undefined}
              onClick={() => {
                if (id === 'budgeting') {
                  setTab(
                    isBudgetingTab(lastBudgetingTab)
                      ? lastBudgetingTab
                      : 'overview',
                  )
                  return
                }
                setTab(defaultTabForSide(id as SideNavId))
              }}
            >
              <SideNavIcon id={id} />
              <span className="side-nav-label">{label}</span>
            </button>
          ))}
        </div>
        <button
          type="button"
          className="side-nav-toggle"
          aria-expanded={sideNavExpanded}
          aria-label={sideNavExpanded ? 'Collapse navigation' : 'Expand navigation'}
          title={sideNavExpanded ? 'Collapse' : 'Expand'}
          onClick={() => setSideNavExpanded((v) => !v)}
        >
          <SideNavToggleIcon expanded={sideNavExpanded} />
          {sideNavExpanded ? (
            <span className="side-nav-label">Collapse</span>
          ) : null}
        </button>
      </nav>
      <div className="app">
      <header className="hero hero-hello">
        <h1 className="brand brand-hello">
          Hello{' '}
          {personFilter === 'all'
            ? PEOPLE.map((p) => p.name).join(' & ')
            : (PEOPLE.find((p) => p.id === personFilter)?.name ?? 'there')}{' '}
          <span aria-hidden>☀️</span>
        </h1>
        <p className="hello-saying">{financialSayingForToday()}</p>
      </header>

      {statementUndo ? (
        <div className="statement-undo-toast" role="status">
          <p>Removed {statementUndo.label}.</p>
          <div className="statement-undo-actions">
            <button
              type="button"
              className="primary"
              onClick={() => {
                void undoStatementRemoval()
              }}
            >
              Undo
            </button>
            <button
              type="button"
              className="ghost"
              onClick={() => {
                clearStatementUndoTimer()
                setStatementUndo(null)
              }}
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : null}

      {importSuccess ? (
        <div className="import-success-toast" role="status">
          <p>{importSuccess}</p>
          <button
            type="button"
            className="ghost"
            onClick={() => {
              if (importSuccessTimerRef.current != null) {
                window.clearTimeout(importSuccessTimerRef.current)
                importSuccessTimerRef.current = null
              }
              setImportSuccess(null)
            }}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      {storageWarning ? (
        <div className="callout warn">
          <p>{storageWarning}</p>
          <div className="callout-actions">
            <button
              type="button"
              className="ghost"
              onClick={() => setStorageWarning(null)}
            >
              Dismiss
            </button>
            <button type="button" className="primary" onClick={exportBackup}>
              Download backup
            </button>
          </div>
        </div>
      ) : null}

      {activeSide === 'budgeting' && transactions.length === 0 && (
        <div className="callout">
          <p>
            {canRestoreSnapshot
              ? 'Nothing in memory, but a backup snapshot is still in this browser.'
              : 'Nothing logged yet. Start by uploading a statement, or add a one-off expense — then assign categories in the review queue.'}
          </p>
          <div className="callout-actions">
            {canRestoreSnapshot ? (
              <button
                type="button"
                className="primary"
                onClick={tryRestoreLastGood}
              >
                Restore {snapshotCounts.transactionsLastGood || snapshotCounts.importsLastGood} from snapshot
              </button>
            ) : (
              <button
                type="button"
                className="primary"
                onClick={() => setTab('upload')}
              >
                Import charges
              </button>
            )}
            <button
              type="button"
              className="ghost"
              onClick={() => openBackupPicker('restore')}
            >
              Restore JSON backup
            </button>
            {!canRestoreSnapshot ? (
              <button
                type="button"
                className="ghost"
                onClick={() => setTab('log')}
              >
                Log expense
              </button>
            ) : null}
          </div>
        </div>
      )}

      {activeSide === 'budgeting' ? (
        <nav className="tabs" aria-label="Budgeting sections">
          {BUDGETING_TABS.map(([id, label]) => (
            <button
              key={id}
              className="tab"
              type="button"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
            >
              {label}
            </button>
          ))}
        </nav>
      ) : null}

      <input
        ref={backupFileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => void importBackupFile(e.target.files?.[0] ?? null)}
      />

      {tab === 'overview' && (
        <div className="layout overview-layout">
          <div className="panel-header bare overview-page-header">
            <div>
              <h2>{monthLabel(monthId)}</h2>
              <p>
                What’s left this month after income, fixed bills, and spending
              </p>
            </div>
            <div className="panel-filters">
              <label>
                Month{' '}
                <select
                  value={monthId}
                  onChange={(e) => setMonthId(e.target.value)}
                >
                  {availableMonths.map((id) => (
                    <option key={id} value={id}>
                      {monthLabel(id)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {spilloverFromMonthImports.length > 0 ? (
            <div className="callout">
              <p>
                This month’s statements also posted{' '}
                {spilloverFromMonthImports.reduce((s, r) => s + r.count, 0)}{' '}
                charge
                {spilloverFromMonthImports.reduce((s, r) => s + r.count, 0) === 1
                  ? ''
                  : 's'}{' '}
                in{' '}
                {spilloverFromMonthImports
                  .map((r) => `${monthLabel(r.monthId)} (${r.count})`)
                  .join(', ')}
                . Month overview only counts the selected month — open the
                statement or switch months to see the rest.
              </p>
              <div className="callout-actions">
                {spilloverFromMonthImports.slice(0, 3).map((r) => (
                  <button
                    key={r.monthId}
                    type="button"
                    className="ghost"
                    onClick={() => setMonthId(r.monthId)}
                  >
                    Go to {monthLabel(r.monthId)}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {monthTransactions.length === 0 ? (
            <div className="empty-guide">
              <p>
                {transactions.length === 0
                  ? 'No charges yet. Upload a statement or log an expense to see spending here.'
                  : `No charges in ${monthLabel(monthId)} yet. Pick another month, or add activity for this one.`}
              </p>
              {alternateMonthsWithCharges.length > 0 ? (
                <p className="empty-note">
                  You have charges in{' '}
                  {alternateMonthsWithCharges
                    .slice(0, 3)
                    .map(monthLabel)
                    .join(', ')}
                  {alternateMonthsWithCharges.length > 3 ? '…' : ''}. Overview
                  only shows the selected month — switch the month picker above.
                </p>
              ) : alternateMonthsWithStatements.length > 0 ? (
                <p className="empty-note">
                  Manage statements lists uploads for{' '}
                  {alternateMonthsWithStatements
                    .slice(0, 3)
                    .map(monthLabel)
                    .join(', ')}
                  , but this month has no matching charges. Try switching month,
                  or re-open the statement under Uploaded statements.
                </p>
              ) : null}
              <div className="empty-guide-actions">
                {latestActivityMonthId &&
                latestActivityMonthId !== monthId ? (
                  <button
                    type="button"
                    className="primary"
                    onClick={() => setMonthId(latestActivityMonthId)}
                  >
                    Switch to {monthLabel(latestActivityMonthId)}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="primary"
                    onClick={() => setTab('upload')}
                  >
                    Import charges
                  </button>
                )}
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setTab('log')}
                >
                  Log expense
                </button>
              </div>
            </div>
          ) : null}

          <section className="insight-block" aria-label="Month at a glance">
            <div
              className="insight-person-tabs review-filter"
              role="group"
              aria-label="Filter overview by person"
            >
              {(
                [
                  { id: 'all' as const, label: 'Both' },
                  { id: 'trevor' as const, label: 'Trevor' },
                  { id: 'kate' as const, label: 'Kate' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={
                    personFilter === opt.id
                      ? 'review-filter-chip active'
                      : 'review-filter-chip'
                  }
                  aria-pressed={personFilter === opt.id}
                  onClick={() => setPersonFilter(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="insight-hero">
              <div className="insight-primary">
                <span className="stat-label">What’s left to spend</span>
                <div
                  className={`insight-figure ${insightStillAvailable >= 0 ? 'good' : 'bad'}`}
                >
                  {formatMoney(insightStillAvailable)}
                </div>
                <p
                  className={`stat-sub${
                    insightStillAvailable < 0 ? ' bad' : ''
                  }`}
                >
                  {insightStillAvailable >= 0
                    ? 'Left of your variable budgets'
                    : 'Over your variable budget caps'}
                </p>
                <SpendMeter
                  used={insightVariableSpent}
                  total={Math.max(insightSpendCap, 0)}
                  caption={`${formatMoney(insightVariableSpent)} spent of ${formatMoney(insightVariableBudget)} planned`}
                />
                {(() => {
                  const trevorLine = monthEndLines.find((r) => r.id === 'trevor')
                  const kateLine = monthEndLines.find((r) => r.id === 'kate')
                  const bothLine = monthEndLines.find((r) => r.id === 'both')
                  if (!trevorLine || !kateLine || !bothLine) return null
                  return (
                    <div className="insight-reconcile">
                      <div className="insight-on-track">
                        <span className="stat-label">On track to save</span>
                        <OnTrackBars
                          lines={monthEndLines}
                          personFilter={personFilter}
                          compact
                          ready={!showBootLoader}
                        />
                      </div>
                      <div className="insight-reconcile-footer">
                        <p className="insight-reconcile-hint">
                          {monthEndReconcileHint(
                            trevorLine,
                            kateLine,
                            bothLine,
                          )}
                        </p>
                        <button
                          type="button"
                          className="ghost insight-see-more"
                          onClick={() => {
                            const el = document.getElementById(
                              MONTH_END_SUMMARY_ID,
                            )
                            if (!(el instanceof HTMLElement)) return
                            el.scrollIntoView({
                              behavior: 'smooth',
                              block: 'start',
                            })
                            el.focus({ preventScroll: true })
                          }}
                        >
                          See more
                        </button>
                      </div>
                    </div>
                  )
                })()}
              </div>
              <div className="insight-side">
                <div
                  className={`insight-card${
                    isVariableBudgetOver(
                      insightVariableSpent,
                      insightVariableBudget,
                    )
                      ? ' is-over'
                      : ''
                  }`}
                >
                  <div className="insight-card-top">
                    <span className="stat-label">Variable budget used</span>
                    <BudgetStatus
                      spent={insightVariableSpent}
                      budget={insightVariableBudget}
                    />
                  </div>
                  <div
                    className={`insight-figure-sm${
                      isVariableBudgetOver(
                        insightVariableSpent,
                        insightVariableBudget,
                      )
                        ? ' bad'
                        : ''
                    }`}
                  >
                    {formatMoney(insightVariableSpent)}
                  </div>
                  <p
                    className={`stat-sub${
                      isVariableBudgetOver(
                        insightVariableSpent,
                        insightVariableBudget,
                      )
                        ? ' bad'
                        : ''
                    }`}
                  >
                    of {formatMoney(insightVariableBudget)} planned this month
                  </p>
                  <SpendMeter
                    used={insightVariableSpent}
                    total={insightVariableBudget}
                  />
                  {recentVariableCharges.length > 0 ? (
                    <div className="insight-recent">
                      <span className="stat-label">Most recent</span>
                      <RecentChargeList charges={recentVariableCharges} />
                    </div>
                  ) : null}
                </div>
                <div className="insight-card">
                  <div className="insight-card-top">
                    <span className="stat-label">On track to save</span>
                  </div>
                  <div
                    className={`insight-figure-sm ${actualLeftover >= 0 ? 'good' : 'bad'}`}
                  >
                    {formatMoney(actualLeftover)}
                  </div>
                  <p className="stat-sub">
                    Income − fixed (assumed paid) − variable spent
                  </p>
                </div>
              </div>
            </div>
            <div className="budget-alloc overview-actual-alloc">
              <p className="budget-alloc-lead">
                How this month’s income was used
                {personFilter === 'all'
                  ? ''
                  : ` · ${insightPersonLabel}`}
                {' '}
                <span className="budget-alloc-hint">
                  {showFlipProfit && flipProfitPositive > 0
                    ? '(fixed bills assumed paid · includes gear flip profit)'
                    : '(fixed bills assumed paid)'}
                </span>
              </p>
              <div
                className="budget-alloc-bar"
                role="img"
                aria-label={`Fixed bills assumed paid ${formatMoney(assumedFixedBills)}, variable spent ${formatMoney(actualVariableSpent)}${
                  flipProfitPositive > 0 || monthCashMade.net !== 0
                    ? `, gear flip profit ${formatMoney(flipProfitPositive)}, total cash made ${formatMoney(monthCashMade.net)}`
                    : ''
                }, leftover ${formatMoney(actualLeftover)}`}
              >
                {actualFixedPct > 0 ? (
                  <span
                    className="seg fixed"
                    style={{ width: `${actualFixedPct}%` }}
                    title="Fixed bills (assumed paid)"
                  />
                ) : null}
                {actualVariablePct > 0 ? (
                  <span
                    className={`seg variable${isVariableBudgetOver(actualVariableSpent, insightVariableBudget) ? ' over' : ''}`}
                    style={{ width: `${actualVariablePct}%` }}
                    title={
                      isVariableBudgetOver(
                        actualVariableSpent,
                        insightVariableBudget,
                      )
                        ? 'Variable spent (over budget)'
                        : 'Variable spent (actual)'
                    }
                  />
                ) : null}
                {actualLeftoverPct > 0 ? (
                  <span
                    className="seg free"
                    style={{ width: `${actualLeftoverPct}%` }}
                    title="Leftover — income left after planned fixed bills and actual variable spend"
                  />
                ) : null}
                {actualFlipPct > 0 ? (
                  <span
                    className="seg flip"
                    style={{ width: `${actualFlipPct}%` }}
                    title="Cash infusion · gear flip profit & total cash made (sells − non-gear spends)"
                  />
                ) : null}
              </div>
              <ul className="budget-alloc-legend">
                <li>
                  <span className="swatch fixed" aria-hidden />
                  Fixed bills (assumed paid){' '}
                  <strong>{formatMoney(assumedFixedBills)}</strong>
                </li>
                <li>
                  <span
                    className={`swatch variable${isVariableBudgetOver(actualVariableSpent, insightVariableBudget) ? ' over' : ''}`}
                    aria-hidden
                  />
                  Variable spent{' '}
                  <strong
                    className={
                      isVariableBudgetOver(
                        actualVariableSpent,
                        insightVariableBudget,
                      )
                        ? 'bad'
                        : undefined
                    }
                  >
                    {formatMoney(actualVariableSpent)}
                  </strong>
                </li>
                <li>
                  <span className="swatch free" aria-hidden />
                  Leftover{' '}
                  <strong className={actualLeftover < 0 ? 'bad' : undefined}>
                    {formatMoney(actualLeftover)}
                  </strong>
                </li>
                {flipProfitPositive > 0 || monthCashMade.nonGear > 0 ? (
                  <li>
                    <span className="swatch flip" aria-hidden />
                    Gear flips{' '}
                    <strong className="good">
                      {formatMoney(flipProfitPositive)}
                    </strong>{' '}
                    profit
                    <span className="legend-cash-made">
                      {' '}
                      · {formatMoney(monthCashMade.net)} total cash made
                      {monthCashMade.nonGear > 0
                        ? ` (−${formatMoney(monthCashMade.nonGear)} non-gear)`
                        : ''}
                    </span>
                  </li>
                ) : null}
              </ul>
            </div>
          </section>

          <div
            className={[
              'overview-quiet-strip',
              showFlipProfit ? 'with-flip' : '',
              showLedgerCashIn ? 'with-cash-in' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            aria-label="Income context"
          >
            <div>
              <span className="stat-label">
                {personFilter === 'all' ? 'Household income' : `${insightPersonLabel} income`}
              </span>
              <strong>{formatMoney(actualIncome)}</strong>
              {personFilter === 'all' ? (
                <p className="stat-sub">
                  Trevor {formatMoney(trevor.income)} · Kate{' '}
                  {formatMoney(kate.income)}
                </p>
              ) : (
                <p className="stat-sub">Monthly take-home used in this view</p>
              )}
            </div>
            {showLedgerCashIn ? (
              <div>
                <span className="stat-label">Cash added</span>
                <strong className="good">
                  +{formatMoney(monthLedgerCashInTotal)}
                </strong>
                <p className="stat-sub">
                  {monthLedgerCashIns.length} ledger cash-in
                  {monthLedgerCashIns.length === 1 ? '' : 's'} this month · not
                  gear
                </p>
              </div>
            ) : null}
            {showFlipProfit ? (
              <div>
                <span className="stat-label">Cash infusion · Gear flips</span>
                <div className="quiet-strip-pair" role="group">
                  <div>
                    <span className="stat-micro-label">Profit</span>
                    <strong
                      className={
                        monthFlipProfit.profit > 0
                          ? 'good'
                          : monthFlipProfit.profit < 0
                            ? 'bad'
                            : undefined
                      }
                    >
                      {monthFlipProfit.profit > 0 ? '+' : ''}
                      {formatMoney(monthFlipProfit.profit)}
                    </strong>
                  </div>
                  <div>
                    <span className="stat-micro-label">Total cash made</span>
                    <strong
                      className={
                        monthCashMade.net < 0
                          ? 'bad'
                          : monthCashMade.net > 0
                            ? 'good'
                            : undefined
                      }
                    >
                      {formatMoney(monthCashMade.net)}
                    </strong>
                  </div>
                </div>
                <p className="stat-sub">
                  Cost {formatMoney(monthFlipProfit.purchased)}
                  {monthFlipProfit.sellCount > 0
                    ? ` · ${monthFlipProfit.sellCount} sell${
                        monthFlipProfit.sellCount === 1 ? '' : 's'
                      }`
                    : ''}
                  {monthCashMade.nonGear > 0
                    ? ` · −${formatMoney(monthCashMade.nonGear)} non-gear`
                    : ''}
                  {' · '}
                  <button
                    type="button"
                    className="text-link quiet-strip-link"
                    onClick={() => {
                      writeGearSubTab('cash')
                      setTab('gear')
                    }}
                  >
                    Open Gear flips
                  </button>
                </p>
              </div>
            ) : null}
            <div>
              <span className="stat-label">Variable budget</span>
              <strong>{formatMoney(insightVariableBudget)}</strong>
              <p className="stat-sub">
                {personFilter === 'all'
                  ? `Trevor ${formatMoney(trevor.variableBudget)} · Kate ${formatMoney(kate.variableBudget)}`
                  : 'Planned variable caps this month'}
              </p>
              {showFlipProfit &&
              (monthCashMade.net !== 0 || monthCashMade.sold > 0) ? (
                <p className="stat-sub what-if-cash-made">
                  If + total cash made →{' '}
                  {formatMoney(variableBudgetIfCashMade)}
                  {' · '}
                  <span
                    className={
                      leftOfVariableIfCashMade >= 0 ? 'good' : 'bad'
                    }
                  >
                    {formatMoney(leftOfVariableIfCashMade)} left
                  </span>
                </p>
              ) : null}
            </div>
            <div>
              <span className="stat-label">Left of variable</span>
              <strong
                className={insightStillAvailable >= 0 ? 'good' : 'bad'}
              >
                {formatMoney(insightStillAvailable)}
              </strong>
              <p className="stat-sub">
                Fixed bills assumed paid ({formatMoney(insightFixedBudget)})
              </p>
            </div>
          </div>

          {householdCategorySpend.length > 0 ? (
            <section className="panel insight-section">
              <div className="panel-header">
                <div>
                  <h2>Where it went</h2>
                  <p>
                    Variable {insightPersonLabel} spend vs category caps this
                    month
                  </p>
                </div>
              </div>
              <ul className="share-list">
                {householdCategorySpend.slice(0, 8).map((row) => {
                  const expanded = row.categoryId === whereItWentCategoryId
                  const categoryTx = expanded
                    ? sortTransactionsMostRecent(
                        monthTransactions.filter(
                          (t) =>
                            t.categoryId === row.categoryId &&
                            (personFilter === 'all' ||
                              t.personId === personFilter),
                        ),
                      )
                    : []
                  const hasCap = row.cap > 0
                  const overCap = hasCap && row.spent > row.cap
                  const barWidth = hasCap
                    ? Math.min(row.ofCap ?? 0, 100)
                    : 0
                  const barTone = !hasCap
                    ? 'uncapped'
                    : overCap
                      ? 'over'
                      : (row.ofCap ?? 0) >= 90
                        ? 'tight'
                        : 'ok'
                  return (
                    <li
                      key={row.categoryId}
                      className={`share-list-row${expanded ? ' selected' : ''}`}
                    >
                      <button
                        type="button"
                        className="share-list-toggle"
                        aria-expanded={expanded}
                        onClick={() =>
                          setWhereItWentCategoryId(
                            expanded ? null : row.categoryId,
                          )
                        }
                      >
                        <span
                          className={`expand-chevron${expanded ? ' open' : ''}`}
                          aria-hidden
                        >
                          ›
                        </span>
                        <div className="share-list-body">
                          <div className="share-list-top">
                            <span className="share-list-name">
                              <span className="category-line-icon" aria-hidden>
                                <CategoryLineIcon
                                  categoryId={row.categoryId}
                                />
                              </span>{' '}
                              {row.label}
                            </span>
                            <strong className="num">
                              {formatMoney(row.spent)}
                            </strong>
                          </div>
                          <div
                            className={`share-cell tone-${barTone}`}
                            aria-label={
                              hasCap
                                ? `${formatMoney(row.spent)} spent of ${formatMoney(row.cap)} cap${overCap ? ', over cap' : ''}`
                                : `${formatMoney(row.spent)} spent, no cap set`
                            }
                          >
                            <div className="share-bar" aria-hidden>
                              <span style={{ width: `${barWidth}%` }} />
                            </div>
                            <span className="share-pct">
                              {hasCap ? `${row.ofCap}%` : '—'}
                            </span>
                          </div>
                          <p className="share-list-meta">
                            {hasCap
                              ? `cap ${formatMoney(row.cap)} · ${
                                  overCap
                                    ? `${formatMoney(Math.abs(row.leftover ?? 0))} over`
                                    : `${formatMoney(row.leftover ?? 0)} left`
                                }`
                              : 'No category cap set'}
                          </p>
                        </div>
                      </button>
                      {expanded ? (
                        <div className="share-list-detail">
                          {categoryTx.length > 0 ? (
                            <div className="recent-charge-block">
                              <h4 className="recent-charge-heading">
                                Charges · most recent
                              </h4>
                              <RecentChargeList
                                charges={categoryTx.slice(0, 12)}
                                showPerson={personFilter === 'all'}
                              />
                              <button
                                type="button"
                                className="text-link where-it-went-link"
                                onClick={() =>
                                  viewCategoryInTransactions(
                                    row.categoryId,
                                    personFilter,
                                  )
                                }
                              >
                                Open in Transactions
                              </button>
                            </div>
                          ) : (
                            <p className="empty-note tight">
                              No charges in this category yet.
                            </p>
                          )}
                        </div>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            </section>
          ) : null}

          {monthEndLines.length === 3 ? (
            <MonthEndSummary
              lines={monthEndLines}
              personFilter={personFilter}
              chartReady={!showBootLoader}
              personLeftoverVariable={
                overviewInsight ? insightStillAvailable : null
              }
              personOnTrack={
                overviewInsight
                  ? onTrackToSave(overviewInsight)
                  : null
              }
              personLabel={
                personFilter === 'all'
                  ? null
                  : (PEOPLE.find((p) => p.id === personFilter)?.name ?? null)
              }
            />
          ) : null}

          <OverviewSection
            id="overview-payflow"
            title="How leftover is calculated"
            summary="Secondary math — income → bills → spend → available"
            open={overviewOpen.payflow}
            onToggle={() => toggleOverview('payflow')}
          >
            <div className="payflow-stack">
              {(
                [
                  [
                    'Salary',
                    trevor.income,
                    kate.income,
                    summary.combinedSalary,
                    false,
                  ],
                  [
                    'Fixed bills (assumed paid)',
                    trevor.fixedBudget,
                    kate.fixedBudget,
                    summary.fixedBudget,
                    false,
                  ],
                  [
                    'Left for variable',
                    trevor.afterFixed,
                    kate.afterFixed,
                    summary.afterFixed,
                    true,
                  ],
                  [
                    'Variable budgets',
                    trevor.variableBudget,
                    kate.variableBudget,
                    summary.variableBudget,
                    false,
                  ],
                  [
                    'Variable spent',
                    trevor.variableSpent,
                    kate.variableSpent,
                    summary.variableSpent,
                    false,
                  ],
                  [
                    'Still available',
                    trevor.stillAvailable,
                    kate.stillAvailable,
                    Math.round(
                      (summary.variableBudget - summary.variableSpent) * 100,
                    ) / 100,
                    true,
                  ],
                ] as const
              ).map(([label, tVal, kVal, hVal, emphasize]) => {
                const tone =
                  emphasize
                    ? hVal >= 0
                      ? 'leftover good'
                      : 'leftover bad'
                    : ''
                return (
                  <div
                    key={label}
                    className={`payflow-row${emphasize ? ' emphasize' : ''}`}
                  >
                    <div className="payflow-label">{label}</div>
                    <div className={`payflow-household ${tone}`}>
                      <strong>{formatMoney(hVal)}</strong>
                    </div>
                    <div className="payflow-people">
                      <span>
                        Trevor{' '}
                        <span className={emphasize ? tone : ''}>
                          {formatMoney(tVal)}
                        </span>
                      </span>
                      <span>
                        Kate{' '}
                        <span className={emphasize ? tone : ''}>
                          {formatMoney(kVal)}
                        </span>
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
            <p className="empty-note tight payflow-note">
              Fixed amounts come from Income &amp; bills. Variable spend comes
              from logged and imported charges.
            </p>
          </OverviewSection>

          <OverviewSection
            id="overview-people"
            title="By person"
            summary={`Trevor ${formatMoney(trevor.stillAvailable)} · Kate ${formatMoney(kate.stillAvailable)} still available`}
            open={overviewOpen.people}
            onToggle={() => toggleOverview('people')}
          >
            <div className="people-split">
              <PersonCard name="Trevor" totals={trevor} />
              <PersonCard name="Kate" totals={kate} />
            </div>
          </OverviewSection>

          <OverviewSection
            id="overview-cash-ins"
            title="Cash added"
            summary={
              showLedgerCashIn
                ? `+${formatMoney(monthLedgerCashInTotal)} · ${monthLedgerCashIns.length} ${
                    monthLedgerCashIns.length === 1 ? 'entry' : 'entries'
                  }`
                : 'No ledger cash-ins this month'
            }
            open={overviewOpen.cashIns}
            onToggle={() => toggleOverview('cashIns')}
          >
            {!showLedgerCashIn ? (
              <div className="empty-guide embedded">
                <p>
                  Cash in from Log expense (ATM, e-transfer, gifts) lands here —
                  separate from gear sells. It cuts net spend for the month and
                  shows on your accounts, but it is not gear cash made.
                </p>
                <div className="empty-guide-actions">
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => setTab('log')}
                  >
                    Log cash in
                  </button>
                </div>
              </div>
            ) : (
              <div className="overview-cash-ins">
                <p className="stat-sub overview-cash-ins-lead">
                  Ledger cash-ins only — not gear sells or non-gear spends from
                  Gear flips.
                </p>
                <RecentChargeList
                  charges={monthLedgerCashIns}
                  showPerson={personFilter === 'all'}
                />
                <div className="empty-guide-actions">
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => setTab('log')}
                  >
                    Log another cash in
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => setTab('transactions')}
                  >
                    Open transactions
                  </button>
                </div>
              </div>
            )}
          </OverviewSection>

          <OverviewSection
            id="overview-accounts"
            title="By account"
            summary={
              accountRows.length === 0
                ? 'No card or bank charges this month'
                : `${accountRows.length} account${accountRows.length === 1 ? '' : 's'} · net ${formatMoney(accountRows.reduce((s, r) => s + r.netSpend, 0))}`
            }
            open={overviewOpen.accounts}
            onToggle={() => toggleOverview('accounts')}
          >
            {accountRows.length === 0 ? (
              <div className="empty-guide embedded">
                <p>
                  Once you upload statements or log expenses, spend by Amex, TD,
                  and other accounts shows up here.
                </p>
                <div className="empty-guide-actions">
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => setTab('upload')}
                  >
                    Import charges
                  </button>
                </div>
              </div>
            ) : (
              <ul className="account-spend-list">
                {accountRows.map((row) => {
                  const expanded = expandedAccountId === row.accountId
                  const accountCharges = expanded
                    ? sortTransactionsMostRecent(
                        monthTransactions.filter(
                          (t) =>
                            t.accountId === row.accountId &&
                            (personFilter === 'all' ||
                              t.personId === personFilter),
                        ),
                      )
                    : []
                  return (
                    <li
                      key={row.accountId}
                      className={`account-spend-row${expanded ? ' selected' : ''}`}
                    >
                      <button
                        type="button"
                        className="account-spend-toggle"
                        aria-expanded={expanded}
                        onClick={() =>
                          setExpandedAccountId(
                            expanded ? null : row.accountId,
                          )
                        }
                      >
                        <span
                          className={`expand-chevron${expanded ? ' open' : ''}`}
                          aria-hidden
                        >
                          ›
                        </span>
                        <div className="account-spend-body">
                          <div className="account-spend-top">
                            <span className="account-spend-name">
                              <span className="icon" aria-hidden>
                                {row.icon}
                              </span>{' '}
                              {row.label}
                            </span>
                            <strong className="num">
                              {formatMoney(row.netSpend)}
                            </strong>
                          </div>
                          <div className="share-cell">
                            <div className="share-bar" aria-hidden>
                              <span
                                style={{
                                  width: `${Math.min(row.share, 100)}%`,
                                }}
                              />
                            </div>
                            <span className="share-pct">
                              {row.share > 0 ? `${row.share}%` : '—'}
                            </span>
                          </div>
                          <p className="account-spend-meta">
                            {row.transactionCount} charge
                            {row.transactionCount === 1 ? '' : 's'}
                            {row.refunds > 0
                              ? ` · refunds ${formatMoney(row.refunds)}`
                              : ''}
                            {row.cashIns > 0
                              ? ` · cash in ${formatMoney(row.cashIns)}`
                              : ''}
                            {' · '}
                            {expanded ? 'Hide' : 'Most recent'}
                          </p>
                        </div>
                      </button>
                      {expanded ? (
                        <div className="account-spend-detail">
                          {accountCharges.length > 0 ? (
                            <RecentChargeList
                              charges={accountCharges.slice(0, 15)}
                              showPerson={personFilter === 'all'}
                            />
                          ) : (
                            <p className="empty-note tight">
                              No charges for this account this month.
                            </p>
                          )}
                        </div>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )}
          </OverviewSection>

          {(imports.length > 0 ||
            transactions.some((t) => t.source === 'csv')) && (
            <OverviewSection
              id="overview-statements"
              title="Uploaded statements"
              summary={
                imports.length === 0
                  ? 'Imported charges on file'
                  : `${imports.length} file${imports.length === 1 ? '' : 's'} — reopen anytime`
              }
              open={overviewOpen.statements}
              onToggle={() => toggleOverview('statements')}
            >
              <UploadedStatements
                imports={imports}
                onRemove={(importId) => {
                  void removeImport(importId)
                }}
                onClearAll={() => {
                  void clearStatementsOnly()
                }}
                onViewStatement={openStatement}
                liveCounts={importLiveCounts}
              />
            </OverviewSection>
          )}
        </div>
      )}

      {tab === 'budget' && (
        <BudgetPanel
          onChange={() => {
            setCustomBudgetTick((n) => n + 1)
            setCustomAccounts(getCustomAccounts())
          }}
          onRemoveCustomAccount={removeCustomAccount}
        />
      )}

      {tab === 'categories' && (
        <div className="layout">
          <div className="panel-header bare">
            <div>
              <h2>Categories</h2>
              <p>
                {monthLabel(monthId)} — budget vs spend; tap a row for its
                charges
              </p>
            </div>
            <div className="panel-filters">
              <label>
                Month{' '}
                <select
                  value={monthId}
                  onChange={(e) => {
                    setMonthId(e.target.value)
                    setSelectedCategoryId(null)
                  }}
                >
                  {availableMonths.map((id) => (
                    <option key={id} value={id}>
                      {monthLabel(id)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Person{' '}
                <select
                  value={categoryPerson}
                  onChange={(e) => {
                    setCategoryPerson(e.target.value as PersonId)
                    setSelectedCategoryId(null)
                  }}
                >
                  {PEOPLE.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="primary"
                onClick={() => {
                  setShowAddCategory((open) => !open)
                  setEditingCategoryId(null)
                }}
              >
                {showAddCategory ? 'Cancel' : 'Add category'}
              </button>
            </div>
          </div>

          {monthTransactions.length === 0 ? (
            <div className="empty-guide">
              <p>
                {transactions.length === 0
                  ? 'No charges yet. Upload a statement or log an expense to see categories here.'
                  : `No charges in ${monthLabel(monthId)}. Categories only show the selected month.`}
              </p>
              {alternateMonthsWithCharges.length > 0 ||
              alternateMonthsWithStatements.length > 0 ? (
                <p className="empty-note">
                  Activity exists in{' '}
                  {(alternateMonthsWithCharges.length > 0
                    ? alternateMonthsWithCharges
                    : alternateMonthsWithStatements
                  )
                    .slice(0, 3)
                    .map(monthLabel)
                    .join(', ')}
                  .
                </p>
              ) : null}
              <div className="empty-guide-actions">
                {latestActivityMonthId &&
                latestActivityMonthId !== monthId ? (
                  <button
                    type="button"
                    className="primary"
                    onClick={() => setMonthId(latestActivityMonthId)}
                  >
                    Switch to {monthLabel(latestActivityMonthId)}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="primary"
                    onClick={() => setTab('upload')}
                  >
                    Import charges
                  </button>
                )}
              </div>
            </div>
          ) : null}

          {showAddCategory ? (
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>Add category</h2>
                  <p>
                    Custom categories are saved in this browser and available in
                    budgets, logging, upload review, and learning.
                  </p>
                </div>
              </div>
              <CategoryEditorForm
                personName={
                  PEOPLE.find((p) => p.id === categoryPerson)?.name ??
                  categoryPerson
                }
                onSubmit={addCategory}
                onCancel={() => setShowAddCategory(false)}
              />
            </section>
          ) : null}

          {customCategories.length > 0 ? (
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h2>Your custom categories</h2>
                  <p>
                    Sheet categories can’t be removed. Deleting a custom one
                    moves its transactions to Other.
                  </p>
                </div>
              </div>
              <ul className="custom-category-list">
                {customCategories.map((cat) => {
                  const budget = getAllBudgets().find(
                    (b) =>
                      b.personId === categoryPerson && b.categoryId === cat.id,
                  )?.amount
                  const editing = editingCategoryId === cat.id
                  return (
                    <li key={cat.id} className="custom-category-item">
                      {editing ? (
                        <CategoryEditorForm
                          initial={{
                            label: cat.label,
                            kind: cat.kind,
                            icon: cat.icon,
                            budgetAmount: budget ?? 0,
                          }}
                          personName={
                            PEOPLE.find((p) => p.id === categoryPerson)?.name ??
                            categoryPerson
                          }
                          submitLabel="Save"
                          showBudget
                          onSubmit={(input) => {
                            updateCustomCategory(cat.id, input)
                            upsertBudget(
                              categoryPerson,
                              cat.id,
                              input.budgetAmount,
                            )
                            setCustomBudgetTick((n) => n + 1)
                          }}
                          onCancel={() => setEditingCategoryId(null)}
                        />
                      ) : (
                        <>
                          <div className="custom-category-meta">
                            <span className="category-name">
                              <span className="category-line-icon" aria-hidden>
                                <CategoryLineIcon categoryId={cat.id} />
                              </span>{' '}
                              {cat.label}
                            </span>
                            <span className="preview-meta">
                              {cat.kind}
                              {budget != null && budget > 0
                                ? ` · ${categoryPerson} budget ${formatMoney(budget)}`
                                : ''}
                            </span>
                          </div>
                          <div className="custom-category-actions">
                            <button
                              type="button"
                              className="ghost"
                              onClick={() => {
                                setEditingCategoryId(cat.id)
                                setShowAddCategory(false)
                              }}
                            >
                              Edit
                            </button>
                            <button
                              type="button"
                              className="ghost danger"
                              onClick={() => removeCustomCategory(cat.id)}
                            >
                              Remove
                            </button>
                          </div>
                        </>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>
          ) : null}

          {(['variable', 'fixed'] as const).map((kind) => {
            const rows = personCategoryRows.filter((row) => row.kind === kind)
            const budget = rows.reduce((sum, row) => sum + row.budget, 0)
            const spent = rows.reduce((sum, row) => sum + row.spent, 0)
            const leftover = budget - spent
            return (
              <section className="panel" key={kind}>
                <div className="panel-header">
                  <div>
                    <h2>
                      {kind === 'fixed' ? 'Fixed bills' : 'Variable spending'}
                    </h2>
                    <p>
                      {rows.length === 0
                        ? kind === 'fixed'
                          ? 'No fixed categories with budget or spend yet'
                          : 'No variable categories with budget or spend yet'
                        : `${rows.length} categor${rows.length === 1 ? 'y' : 'ies'} · planned vs actual`}
                    </p>
                  </div>
                  <div className="section-summary">
                    <BudgetStatus spent={spent} budget={budget} />
                    <div
                      className={`section-leftover ${leftover >= 0 ? 'good' : 'bad'}`}
                    >
                      {formatMoney(leftover)}
                    </div>
                    <p className="stat-sub">left of budget</p>
                  </div>
                </div>
                {rows.length > 0 ? (
                  <div className="kind-meter-banner">
                    <SpendMeter
                      used={spent}
                      total={budget}
                      caption={`${formatMoney(spent)} spent of ${formatMoney(budget)} planned`}
                    />
                  </div>
                ) : null}
                {rows.length === 0 ? (
                  <div className="empty-guide embedded">
                    <p>
                      {kind === 'fixed'
                        ? 'Set fixed budgets under Income & bills, or upload charges tagged to a fixed category.'
                        : 'Set variable budgets or import spending — leftover appears here once there’s a budget or spend.'}
                    </p>
                    <div className="empty-guide-actions">
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => setTab('budget')}
                      >
                        Edit budgets
                      </button>
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => setTab('upload')}
                      >
                        Import charges
                      </button>
                    </div>
                  </div>
                ) : (
                  <ul className="category-meter-list">
                    {rows.map((row) => {
                      const expanded = row.categoryId === selectedCategoryId
                      const rowsForCategory = expanded
                        ? monthTransactions
                            .filter((t) => t.personId === categoryPerson)
                            .filter((t) => t.categoryId === row.categoryId)
                            .sort(
                              (a, b) =>
                                b.date.localeCompare(a.date) ||
                                b.id.localeCompare(a.id),
                            )
                        : []
                      return (
                        <CategoryAccordionRow
                          key={row.categoryId}
                          row={row}
                          expanded={expanded}
                          transactions={rowsForCategory}
                          linkableTransactions={linkableTransactions.filter(
                            (t) => t.categoryId !== row.categoryId,
                          )}
                          learnedRules={learnedRules}
                          onToggle={() => openCategory(row.categoryId)}
                          onOpenInTransactions={() =>
                            viewCategoryInTransactions(row.categoryId)
                          }
                          onAddRule={addLearnedRule}
                          onRemoveRule={removeLearnedRule}
                          onAssignTransaction={assignTransactionToCategory}
                          onUpdateTransaction={updateTransaction}
                        />
                      )
                    })}
                  </ul>
                )}
              </section>
            )
          })}
        </div>
      )}

      {tab === 'transactions' && (
        <div className="layout">
              <div className="panel-header bare">
                <div>
                  <h2>Transactions</h2>
                  <p>
                    {visibleTx.length === monthTransactions.length
                      ? `${monthTransactions.length} charge${monthTransactions.length === 1 ? '' : 's'} for ${monthLabel(monthId)}, grouped by account`
                      : `Showing ${visibleTx.length} of ${monthTransactions.length} for ${monthLabel(monthId)} — check Person / Category filters`}
                  </p>
                </div>
                <div className="panel-filters">
                  <label>
                    Month{' '}
                    <select
                      value={monthId}
                      onChange={(e) => setMonthId(e.target.value)}
                    >
                      {availableMonths.map((id) => (
                        <option key={id} value={id}>
                          {monthLabel(id)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Person{' '}
                    <select
                      value={personFilter}
                      onChange={(e) =>
                        setPersonFilter(e.target.value as PersonId | 'all')
                      }
                    >
                      <option value="all">Both</option>
                      {PEOPLE.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Category{' '}
                    <select
                      value={transactionCategoryFilter}
                      onChange={(e) =>
                        setTransactionCategoryFilter(
                          e.target.value as CategoryId | 'all',
                        )
                      }
                    >
                      <option value="all">All categories</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {categoryOptionLabel(c.id)}
                        </option>
                      ))}
                    </select>
                  </label>
                  {(personFilter !== 'all' ||
                    transactionCategoryFilter !== 'all') && (
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => {
                        setPersonFilter('all')
                        setTransactionCategoryFilter('all')
                      }}
                    >
                      Clear filters
                    </button>
                  )}
                  <button type="button" className="ghost" onClick={openDupeCheck}>
                    Check for duplicates
                    {possibleDuplicatePairs.length > 0
                      ? ` (${possibleDuplicatePairs.length})`
                      : ''}
                  </button>
                </div>
              </div>

              {spilloverFromMonthImports.length > 0 ? (
                <div className="callout">
                  <p>
                    Statements that include {monthLabel(monthId)} also have{' '}
                    {spilloverFromMonthImports.reduce((s, r) => s + r.count, 0)}{' '}
                    charge
                    {spilloverFromMonthImports.reduce((s, r) => s + r.count, 0) ===
                    1
                      ? ''
                      : 's'}{' '}
                    dated in{' '}
                    {spilloverFromMonthImports
                      .map((r) => `${monthLabel(r.monthId)} (${r.count})`)
                      .join(', ')}
                    . Month view uses each charge’s date, not the statement
                    period — open the statement to see every imported row.
                  </p>
                  <div className="callout-actions">
                    {spilloverFromMonthImports.slice(0, 3).map((r) => (
                      <button
                        key={r.monthId}
                        type="button"
                        className="ghost"
                        onClick={() => setMonthId(r.monthId)}
                      >
                        Go to {monthLabel(r.monthId)}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              {imports.length > 0 ? (
                <div className="statement-picker">
                  <label>
                    View uploaded statement{' '}
                    <select
                      value=""
                      onChange={(e) => {
                        const id = e.target.value
                        if (id) openStatement(id)
                      }}
                    >
                      <option value="">Choose a file…</option>
                      {imports.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.fileName} (
                          {item.monthIds.map(monthLabel).join(', ')})
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ) : null}

              {visibleTx.length === 0 ? (
                <div className="empty-guide">
                  <p>
                    {monthTransactions.length === 0
                      ? `Nothing in ${monthLabel(monthId)} yet. Upload a statement or log an expense.`
                      : 'No charges match these filters. Try another person or category, or clear the category filter.'}
                  </p>
                  {monthTransactions.length === 0 &&
                  (alternateMonthsWithCharges.length > 0 ||
                    alternateMonthsWithStatements.length > 0) ? (
                    <p className="empty-note">
                      {alternateMonthsWithCharges.length > 0
                        ? `Charges exist in ${alternateMonthsWithCharges
                            .slice(0, 3)
                            .map(monthLabel)
                            .join(', ')} — switch the month picker above.`
                        : `Statements list ${alternateMonthsWithStatements
                            .slice(0, 3)
                            .map(monthLabel)
                            .join(', ')}, but matching charges aren’t in this month.`}
                    </p>
                  ) : null}
                  <div className="empty-guide-actions">
                    {monthTransactions.length === 0 ? (
                      <>
                        {latestActivityMonthId &&
                        latestActivityMonthId !== monthId ? (
                          <button
                            type="button"
                            className="primary"
                            onClick={() => setMonthId(latestActivityMonthId)}
                          >
                            Switch to {monthLabel(latestActivityMonthId)}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="primary"
                            onClick={() => setTab('upload')}
                          >
                            Import charges
                          </button>
                        )}
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => setTab('log')}
                        >
                          Log expense
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        className="ghost"
                        onClick={() => {
                          setPersonFilter('all')
                          setTransactionCategoryFilter('all')
                        }}
                      >
                        Clear filters
                      </button>
                    )}
                  </div>
                </div>
              ) : null}

              {visibleTx.length > 0 ? (
                <div className="tx-summary-chips" aria-label="Account totals">
                  {accounts.map((account) => {
                    const rows = visibleTx.filter(
                      (t) => t.accountId === account.id,
                    )
                    if (rows.length === 0) return null
                    const spent = rows
                      .filter((t) => !isMoneyIn(t))
                      .reduce((sum, t) => sum + t.amount, 0)
                    const refunds = rows
                      .filter((t) => t.isRefund)
                      .reduce((sum, t) => sum + t.amount, 0)
                    const cashIns = rows
                      .filter((t) => t.isCashIn && !t.isRefund)
                      .reduce((sum, t) => sum + t.amount, 0)
                    const net = Math.round((spent - refunds - cashIns) * 100) / 100
                    const monthNet = visibleTx.reduce((sum, t) => {
                      return sum + (isMoneyIn(t) ? -t.amount : t.amount)
                    }, 0)
                    const share =
                      monthNet > 0
                        ? Math.round((net / monthNet) * 1000) / 10
                        : 0
                    return (
                      <div key={account.id} className="tx-summary-chip">
                        <div className="tx-summary-chip-top">
                          <span>
                            <span className="icon" aria-hidden>
                              {account.icon}
                            </span>{' '}
                            {account.label}
                          </span>
                          <strong>{formatMoney(spent)}</strong>
                        </div>
                        <div className="share-cell">
                          <div className="share-bar" aria-hidden>
                            <span
                              style={{
                                width: `${Math.min(Math.max(share, 0), 100)}%`,
                              }}
                            />
                          </div>
                          <span className="share-pct">
                            {rows.length} tx
                            {share > 0 ? ` · ${share}%` : ''}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : null}

              {accounts.map((account) => {
                const rows = visibleTx.filter((t) => t.accountId === account.id)
                if (visibleTx.length === 0) return null
                // Built-ins always list; custom accounts only when they have charges.
                if (
                  rows.length === 0 &&
                  !ACCOUNTS.some((a) => a.id === account.id)
                ) {
                  return null
                }
                const spent = rows
                  .filter((t) => !isMoneyIn(t))
                  .reduce((sum, t) => sum + t.amount, 0)
                const refunds = rows
                  .filter((t) => t.isRefund)
                  .reduce((sum, t) => sum + t.amount, 0)
                const cashIns = rows
                  .filter((t) => t.isCashIn && !t.isRefund)
                  .reduce((sum, t) => sum + t.amount, 0)
                return (
                  <section className="panel" key={account.id}>
                    <div className="panel-header">
                      <div>
                        <h2>
                          <span className="icon" aria-hidden>
                            {account.icon}
                          </span>{' '}
                          {account.label}
                        </h2>
                        <p>
                          {rows.length === 0
                            ? 'No charges with current filters'
                            : `${rows.length} transaction${rows.length === 1 ? '' : 's'}${
                                refunds > 0
                                  ? ` · refunds ${formatMoney(refunds)}`
                                  : ''
                              }${
                                cashIns > 0
                                  ? ` · cash in ${formatMoney(cashIns)}`
                                  : ''
                              }`}
                        </p>
                      </div>
                      <div className="section-leftover">
                        {formatMoney(spent)}
                      </div>
                    </div>
                    {rows.length === 0 ? (
                      <p className="empty-note">
                        Nothing on this account for the filters above.
                      </p>
                    ) : (
                      <TransactionTable
                        transactions={rows}
                        showCategory
                        showAccount={false}
                        onUpdate={updateTransaction}
                      />
                    )}
                  </section>
                )
              })}
        </div>
      )}

      {tab === 'log' && (
        <div className="layout">
          <div className="panel-header bare">
            <div>
              <h2>Log entry</h2>
              <p>
                Add an expense, refund, or cash in — leftover updates as soon as
                you save
              </p>
            </div>
          </div>
          <section className="panel log-entry-panel">
            <div className="upload-box">
              <LogExpenseForm onSave={saveManual} />
            </div>
          </section>
        </div>
      )}

      {tab === 'upload' && (
        <div className="layout">
          <div className="panel-header bare">
            <div>
              <h2>Import charges</h2>
              <p>
                Import from a bank statement or phone screenshots of your
                activity, check categories, then add them to the ledger
              </p>
            </div>
          </div>
          <ImportReviewQueue
            existingTransactions={transactions}
            onCommit={commitReviewed}
          />
          <UploadedStatements
            imports={imports}
                onRemove={(importId) => {
                  void removeImport(importId)
                }}
                onClearAll={() => {
                  void clearStatementsOnly()
                }}
                onViewStatement={openStatement}
                liveCounts={importLiveCounts}
              />
        </div>
      )}

      {tab === 'learning' && (
        <LearningPanel
          learnedRules={learnedRules}
          onSaveLessons={addLearnedRules}
          onRemoveRule={removeLearnedRule}
        />
      )}

      {tab === 'gear' && (
        <GearFlipsPanel
          state={gear}
          onChange={setGear}
          onReset={() => setGear(resetGearState())}
        />
      )}

      {tab === 'settings' && (
        <div className="layout">
          <div className="panel-header bare">
            <div>
              <h2>Settings</h2>
              <p>
                Manage saved charges and statements, or back up this browser’s
                ledger data
              </p>
            </div>
          </div>

          <CloudSyncPanel
            cloud={cloudContext}
            onCloudChange={setCloudContext}
            onPullApplied={applyCloudPull}
            buildLiveBackup={() => {
              const backup = buildBackup({
                transactions,
                imports,
                learnedRules,
                gear,
              })
              backup.customCategories = getCustomCategories()
              backup.customAccounts = getCustomAccounts()
              backup.budgetOverrides = getBudgetOverrides()
              backup.incomes = getIncomeOverrides()
              return backup
            }}
          />

          <section
            className={`panel settings-panel${hasDuplicatesRisk ? ' warn-panel' : ''}`}
          >
            <div className="panel-header">
              <div>
                <h3>Data in this browser</h3>
                <p>
                  {hasDuplicatesRisk
                    ? 'Sheet seed totals and statement line items are both loaded — that double-counts. Clear transactions, then re-upload statements so each charge lands in a category once.'
                    : transactions.length > 0 || imports.length > 0
                      ? `${transactions.length} transaction${transactions.length === 1 ? '' : 's'}${
                          imports.length > 0
                            ? ` · ${imports.length} statement${imports.length === 1 ? '' : 's'}`
                            : ''
                        } saved here. Budgets stay if you clear charges.`
                      : 'Nothing saved in this browser yet.'}
                  {!hasDuplicatesRisk &&
                  nearDateDuplicateRemovals.removeIds.length > 0
                    ? ` ${nearDateDuplicateRemovals.removeIds.length} look like ±1 day doubles (same merchant + amount) — often Amex transaction vs posting date.`
                    : ''}
                </p>
              </div>
            </div>
            <div className="settings-section-body">
              <div className="callout-actions settings-actions">
                <button type="button" className="ghost" onClick={openDupeCheck}>
                  Check for duplicates
                  {possibleDuplicatePairs.length > 0
                    ? ` (${possibleDuplicatePairs.length})`
                    : ''}
                </button>
                {nearDateDuplicateRemovals.removeIds.length > 0 ? (
                  <button
                    type="button"
                    className="ghost"
                    onClick={removeNearDateDuplicates}
                  >
                    Remove ±1 day duplicates (
                    {nearDateDuplicateRemovals.removeIds.length})
                  </button>
                ) : null}
                {imports.length > 0 ||
                transactions.some((t) => t.source === 'csv') ? (
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => {
                      void clearStatementsOnly()
                    }}
                  >
                    Clear all uploaded statements
                  </button>
                ) : null}
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setTab('upload')}
                >
                  Upload / manage statements
                </button>
                <button
                  type="button"
                  className="ghost danger"
                  onClick={startFresh}
                >
                  Clear everything
                </button>
              </div>
            </div>
          </section>

          <section className="panel settings-panel">
            <div className="panel-header">
              <div>
                <h3>Statements by month</h3>
                <p>
                  Check and manage uploads linked to the month you’re viewing
                </p>
              </div>
              <div className="panel-filters">
                <label>
                  Month{' '}
                  <select
                    value={monthId}
                    onChange={(e) => setMonthId(e.target.value)}
                  >
                    {availableMonths.map((id) => (
                      <option key={id} value={id}>
                        {monthLabel(id)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
            <div className="settings-section-body">
              <p className="settings-month-summary">
                {monthTransactions.length} transaction
                {monthTransactions.length === 1 ? '' : 's'}
                {monthImports.length > 0
                  ? ` · ${monthImports.length} statement${monthImports.length === 1 ? '' : 's'}`
                  : ' · no statements'}{' '}
                for {monthLabel(monthId)}
                {monthNearDateDuplicateRemovals.removeIds.length > 0
                  ? ` · ${monthNearDateDuplicateRemovals.removeIds.length} ±1 day duplicate${monthNearDateDuplicateRemovals.removeIds.length === 1 ? '' : 's'} in this month`
                  : ''}
                {possibleDuplicatePairs.length > 0
                  ? ` · ${possibleDuplicatePairs.length} possible duplicate pair${possibleDuplicatePairs.length === 1 ? '' : 's'}`
                  : ''}
              </p>
              <div className="callout-actions settings-actions">
                <button type="button" className="ghost" onClick={openDupeCheck}>
                  Check duplicates in {monthLabel(monthId)}
                  {possibleDuplicatePairs.length > 0
                    ? ` (${possibleDuplicatePairs.length})`
                    : ''}
                </button>
                {monthImports.length > 0 ||
                monthTransactions.some((t) => t.source === 'csv') ? (
                  <button
                    type="button"
                    className="ghost danger"
                    onClick={() => {
                      void clearStatementsForMonth(monthId)
                    }}
                  >
                    Clear {monthLabel(monthId)} statements
                  </button>
                ) : null}
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setTab('upload')}
                >
                  Import charges
                </button>
              </div>
              <UploadedStatements
                imports={monthImports}
                onRemove={(importId) => {
                  void removeImport(importId)
                }}
                onViewStatement={openStatement}
                embedded
                liveCounts={importLiveCounts}
              />
            </div>
          </section>

          <section className="panel settings-panel">
            <div className="panel-header">
              <div>
                <h3>Backup &amp; restore</h3>
                <p>
                  JSON export covers transactions, learning rules, budgets, and
                  gear. Statement PDF/CSV originals stay in this browser’s
                  IndexedDB and are not included.
                </p>
              </div>
            </div>
            <div className="settings-backup">
              <div className="backup-bar">
                <button type="button" className="primary" onClick={exportBackup}>
                  Download backup
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => openBackupPicker('restore')}
                >
                  Restore backup
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => openBackupPicker('merge')}
                >
                  Merge backup
                </button>
              </div>
              {storageWarning ? (
                <p className="backup-msg warn">{storageWarning}</p>
              ) : backupMessage ? (
                <p className="backup-msg">{backupMessage}</p>
              ) : (
                <p className="backup-msg muted">
                  Use Download to move data to DigitalOcean or another browser.
                  Restore replaces everything in this browser; Merge keeps your
                  local data and fills in what’s missing from the file.
                </p>
              )}
            </div>
          </section>
        </div>
      )}

      {viewingImport ? (
        <div
          className="cash-link-modal-backdrop"
          role="presentation"
          onClick={closeStatementView}
        >
          <div
            className="cash-link-modal statement-import-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="statement-import-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="cash-link-modal-header">
              <div>
                <h3 id="statement-import-modal-title">
                  {viewingImport.sourceKind === 'screenshot'
                    ? 'Screenshot'
                    : 'Statement'}
                  : {viewingImport.fileName}
                </h3>
                <p>
                  {PEOPLE.find((p) => p.id === viewingImport.personId)?.name ??
                    viewingImport.personId}
                  {' · '}
                  {statementTransactions.length} charge
                  {statementTransactions.length === 1 ? '' : 's'}
                  {' · '}
                  net {formatMoney(viewingImport.netAmount)}
                  {' · '}
                  {statementMonthBreakdown.length > 1
                    ? statementMonthBreakdown
                        .map(
                          (row) =>
                            `${row.count} in ${monthLabel(row.monthId)}`,
                        )
                        .join(' · ')
                    : viewingImport.monthIds.map(monthLabel).join(', ')}
                </p>
              </div>
              <div className="import-actions">
                <label className="statement-account-field">
                  Account
                  <select
                    value={viewingImport.primaryAccountId}
                    onChange={(e) =>
                      reassignStatementAccount(
                        viewingImport.id,
                        e.target.value as Transaction['accountId'],
                      )
                    }
                    aria-label="Account for these charges"
                  >
                    {(() => {
                      const forPerson = accountsForPerson(
                        viewingImport.personId,
                      )
                      const ids = new Set(forPerson.map((a) => a.id))
                      const options = [...forPerson]
                      if (!ids.has(viewingImport.primaryAccountId)) {
                        const orphan = getAllAccounts().find(
                          (a) => a.id === viewingImport.primaryAccountId,
                        )
                        if (orphan) options.unshift(orphan)
                      }
                      return options.map((a) => (
                        <option key={a.id} value={a.id}>
                          {accountOptionLabel(a.id)}
                        </option>
                      ))
                    })()}
                  </select>
                </label>
                <button
                  type="button"
                  className="ghost"
                  onClick={closeStatementView}
                >
                  Close
                </button>
                <button
                  type="button"
                  className="ghost danger"
                  onClick={() => {
                    void removeImport(viewingImport.id)
                  }}
                >
                  Remove
                </button>
              </div>
            </div>

            <div className="cash-link-modal-body statement-import-modal-body">
              {statementMonthBreakdown.length > 1 ? (
                <div className="callout">
                  <p>
                    This import’s {statementTransactions.length} charges span{' '}
                    {statementMonthBreakdown
                      .map((row) => `${row.count} in ${monthLabel(row.monthId)}`)
                      .join(', ')}
                    . Month overview / Categories only show one month at a time
                    — use the buttons below or the month picker.
                    {statementMonthBreakdown.some((row) => {
                      const y = Number(row.monthId.slice(0, 4))
                      const nowY = new Date().getFullYear()
                      return y < nowY - 1 || y > nowY + 1
                    })
                      ? ' Dates far from this year usually mean a bad PDF year guess — remove this import and re-upload after the fix.'
                      : ''}
                  </p>
                  <div className="callout-actions">
                    {statementMonthBreakdown.map((row) => (
                      <button
                        key={row.monthId}
                        type="button"
                        className="ghost"
                        onClick={() => {
                          setMonthId(row.monthId)
                          closeStatementView()
                        }}
                      >
                        {monthLabel(row.monthId)} ({row.count})
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="statement-view-with-file">
                <StatementFilePreview
                  importId={viewingImport.id}
                  hasStoredFile={viewingImport.hasStoredFile}
                  fileName={viewingImport.fileName}
                  storedFileNames={viewingImport.storedFileNames}
                  householdId={cloudContext?.householdId ?? null}
                />
                <div className="statement-charges">
                  {statementTransactions.length === 0 ? (
                    <p className="empty-note">
                      No charges found for this import (it may have been
                      removed).
                    </p>
                  ) : (
                    <TransactionTable
                      transactions={statementTransactions}
                      showCategory
                      showAccount
                      onUpdate={updateTransaction}
                    />
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {dupeCheckOpen ? (
        <div
          className="cash-link-modal-backdrop"
          role="presentation"
          onClick={closeDupeCheck}
        >
          <div
            className="cash-link-modal dupe-check-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="dupe-check-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="cash-link-modal-header">
              <div>
                <h3 id="dupe-check-title">Possible duplicates</h3>
                <p>
                  {visibleDupeCheckPairs.length === 0
                    ? possibleDuplicatePairs.length === 0
                      ? `No possible duplicate pairs in ${monthLabel(monthId)}.`
                      : 'All flagged pairs kept for now.'
                    : `Found ${visibleDupeCheckPairs.length} possible duplicate pair${visibleDupeCheckPairs.length === 1 ? '' : 's'} in ${monthLabel(monthId)}.`}
                </p>
              </div>
              <button
                type="button"
                className="ghost"
                onClick={closeDupeCheck}
              >
                Close
              </button>
            </div>

            <div className="cash-link-modal-body dupe-check-body">
              {visibleDupeCheckPairs.length === 0 ? (
                <p className="dupe-check-empty">
                  Coffee-like merchants (Tim Hortons, Starbucks, Good Earth,
                  etc.) only flag when two identical charges sit 1 day apart.
                  Other merchants flag at 1–3 days. Three or more of the same
                  amount in the month are treated as recurring and skipped.
                </p>
              ) : (
                <ul className="dupe-check-list">
                  {visibleDupeCheckPairs.map((pair) => (
                    <li
                      key={possibleDuplicatePairKey(pair)}
                      className="dupe-check-row"
                    >
                      <div className="dupe-check-row-main">
                        <strong>{pair.merchant}</strong>
                        <span className="dupe-check-amount">
                          {formatMoney(pair.keep.amount)}
                        </span>
                      </div>
                      <p className="dupe-check-meta">
                        {pair.remove.date} → {pair.keep.date} · {pair.gapDays}{' '}
                        day{pair.gapDays === 1 ? '' : 's'} apart
                        {pair.coffeeLike ? ' · coffee-like' : ''}
                      </p>
                      <p className="dupe-check-reason">{pair.reason}</p>
                      <div className="dupe-check-row-actions">
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => keepBothDuplicate(pair)}
                        >
                          Keep both
                        </button>
                        <button
                          type="button"
                          className="ghost danger"
                          onClick={() => removeEarlierDuplicate(pair)}
                        >
                          Remove earlier ({pair.remove.date})
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="cash-link-modal-actions">
              {visibleDupeCheckPairs.length > 0 ? (
                <button
                  type="button"
                  className="ghost danger"
                  onClick={() =>
                    removeAllFlaggedDuplicates(visibleDupeCheckPairs)
                  }
                >
                  Remove flagged duplicates (keep later date)
                </button>
              ) : null}
              <button type="button" className="primary" onClick={closeDupeCheck}>
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
    </div>
    </>
  )
}

function CategoryAccordionRow({
  row,
  expanded,
  transactions,
  linkableTransactions,
  learnedRules,
  onToggle,
  onOpenInTransactions,
  onAddRule,
  onRemoveRule,
  onAssignTransaction,
  onUpdateTransaction,
}: {
  row: CategoryRollup
  expanded: boolean
  transactions: Transaction[]
  linkableTransactions: Transaction[]
  learnedRules: LearnedRule[]
  onToggle: () => void
  onOpenInTransactions: () => void
  onAddRule: (pattern: string, categoryId: CategoryId) => void
  onRemoveRule: (ruleId: string) => void
  onAssignTransaction: (
    transactionId: string,
    categoryId: CategoryId,
    pattern: string,
  ) => void
  onUpdateTransaction: (tx: Transaction) => void
}) {
  const [showAllTransactions, setShowAllTransactions] = useState(false)
  const refunds = transactions
    .filter((t) => t.isRefund)
    .reduce((sum, t) => sum + t.amount, 0)
  const cashIns = transactions
    .filter((t) => t.isCashIn && !t.isRefund)
    .reduce((sum, t) => sum + t.amount, 0)
  const merchantRows = useMemo(
    () => rollupMerchants(transactions),
    [transactions],
  )

  return (
    <li className={`category-meter-item${expanded ? ' selected' : ''}`}>
      <button
        type="button"
        className="category-meter-toggle"
        aria-expanded={expanded}
        onClick={onToggle}
      >
        <span className={`expand-chevron${expanded ? ' open' : ''}`} aria-hidden>
          ›
        </span>
        <div className="category-meter-main">
          <div className="category-meter-top">
            <span className="category-name">
              <span className="category-line-icon" aria-hidden>
                <CategoryLineIcon categoryId={row.categoryId} />
              </span>{' '}
              {row.label}
            </span>
            <BudgetStatus spent={row.spent} budget={row.budget} />
          </div>
          <SpendMeter
            used={row.spent}
            total={row.budget}
            caption={
              row.budget > 0
                ? `${formatMoney(row.spent)} of ${formatMoney(row.budget)} · ${formatMoney(row.leftover)} left`
                : row.spent > 0
                  ? `${formatMoney(row.spent)} spent · no budget set`
                  : 'No budget or spend'
            }
          />
        </div>
      </button>
      {expanded ? (
        <div className="category-detail">
          <div className="category-detail-header">
            <p>
              {transactions.length} transaction
              {transactions.length === 1 ? '' : 's'}
              {refunds > 0 ? ` · refunds ${formatMoney(refunds)}` : ''}
              {cashIns > 0 ? ` · cash in ${formatMoney(cashIns)}` : ''}
            </p>
            <button
              type="button"
              className="ghost"
              onClick={onOpenInTransactions}
            >
              Open in Transactions
            </button>
          </div>
          {merchantRows.length > 0 ? (
            <div className="merchant-breakdown">
              <div className="merchant-breakdown-heading">
                <span className="category-line-icon" aria-hidden>
                  <IconMerchant />
                </span>
                <h4>Top merchants</h4>
              </div>
              <ol className="merchant-rank-list">
                {merchantRows.map((m, index) => {
                  const barPct = Math.min(Math.max(m.share, 0), 100)
                  const overBudget =
                    row.budget > 0 && row.spent > row.budget
                  return (
                    <li key={m.merchant}>
                      <span className="merchant-rank" aria-hidden>
                        {index + 1}
                      </span>
                      <div className="merchant-rank-main">
                        <span className="merchant-rank-name">{m.merchant}</span>
                        <span className="merchant-rank-meta">
                          {m.share > 0 ? `${m.share}% · ` : ''}
                          {m.transactionCount} tx
                          {m.refunds > 0
                            ? ` · refunds ${formatMoney(m.refunds)}`
                            : ''}
                        </span>
                      </div>
                      <div
                        className={`merchant-rank-bar${overBudget ? ' tone-over' : ''}`}
                        aria-hidden
                      >
                        <span style={{ width: `${barPct}%` }} />
                      </div>
                      <span className="cash-delta out merchant-rank-amount">
                        −{formatMoney(m.spent)}
                      </span>
                    </li>
                  )
                })}
              </ol>
            </div>
          ) : null}
          {transactions.length === 0 ? (
            <p className="empty-note tight">
              No transactions logged in this category yet.
            </p>
          ) : (
            <div className="category-tx-collapse">
              <button
                type="button"
                className="category-tx-toggle"
                aria-expanded={showAllTransactions}
                onClick={() => setShowAllTransactions((open) => !open)}
              >
                {showAllTransactions
                  ? 'Hide transactions'
                  : `Show all transactions (${transactions.length})`}
              </button>
              {showAllTransactions ? (
                <TransactionTable
                  transactions={transactions}
                  showCategory={false}
                  onUpdate={onUpdateTransaction}
                />
              ) : null}
            </div>
          )}
          <CategoryMatchers
            categoryId={row.categoryId}
            categoryLabel={row.label}
            learnedRules={learnedRules}
            linkableTransactions={linkableTransactions}
            onAddRule={onAddRule}
            onRemoveRule={onRemoveRule}
            onAssignTransaction={onAssignTransaction}
          />
        </div>
      ) : null}
    </li>
  )
}

function IconMerchant() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      <path d="M4 7h16l-1.2 12.2a2 2 0 0 1-2 1.8H7.2a2 2 0 0 1-2-1.8L4 7Z" />
      <path d="M8 7V5.5A4 4 0 0 1 12 1.5 4 4 0 0 1 16 5.5V7" />
    </svg>
  )
}

function IconTxEdit() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden focusable="false">
      <path
        fill="currentColor"
        d="M11.13 2.19a1.75 1.75 0 0 1 2.47 2.47L5.9 12.36a1 1 0 0 1-.45.26l-2.7.67a.5.5 0 0 1-.6-.6l.67-2.7a1 1 0 0 1 .26-.45l7.7-7.7Zm1.41 1.06a.75.75 0 0 0-1.06 0L4.3 10.43l-.3 1.22 1.22-.3 7.18-7.18a.75.75 0 0 0 0-1.06ZM3 13.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1 0-1Z"
      />
    </svg>
  )
}

function IconTxClose() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden focusable="false">
      <path
        fill="currentColor"
        d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 1 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"
      />
    </svg>
  )
}

function TransactionTable({
  transactions,
  showCategory,
  showAccount = true,
  onUpdate,
}: {
  transactions: Transaction[]
  showCategory: boolean
  showAccount?: boolean
  onUpdate?: (tx: Transaction) => void
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const editable = Boolean(onUpdate)

  return (
    <ul className="tx-timeline">
      {transactions.map((t) => {
        const isEditing = editingId === t.id
        return (
          <li
            key={t.id}
            className={`tx-row${isMoneyIn(t) ? ' is-refund' : ''}${isEditing ? ' is-editing' : ''}`}
          >
            <span
              className={`tx-rail${isMoneyIn(t) ? ' in' : ' out'}`}
              aria-hidden
            />
            <div className="tx-main">
              <div className="tx-item">
                {t.merchant}
                {t.isRefund ? (
                  <span className="cash-type in">Refund</span>
                ) : null}
                {t.isCashIn && !t.isRefund ? (
                  <span className="cash-type in">Cash in</span>
                ) : null}
              </div>
              <div className="tx-meta">
                <time className="cash-move-date">{t.date}</time>
                {showAccount ? (
                  <span>
                    <span className="icon" aria-hidden>
                      {accountIcon(t.accountId)}
                    </span>{' '}
                    {accountLabel(t.accountId)}
                  </span>
                ) : null}
                {showCategory ? (
                  <span>
                    <span className="category-line-icon" aria-hidden>
                      <CategoryLineIcon categoryId={t.categoryId} />
                    </span>{' '}
                    {categoryLabel(t.categoryId)}
                  </span>
                ) : null}
                {t.notes ? <span>{t.notes}</span> : null}
              </div>
            </div>
            <div className="tx-side">
              <span
                className={`cash-delta${isMoneyIn(t) ? ' in' : ' out'}`}
              >
                {isMoneyIn(t) ? '+' : '−'}
                {formatMoney(t.amount)}
              </span>
              {editable ? (
                <button
                  type="button"
                  className={`icon-btn${isEditing ? ' active-toggle' : ''}`}
                  aria-pressed={isEditing}
                  title={isEditing ? 'Close edit' : 'Edit'}
                  aria-label={isEditing ? 'Close edit' : 'Edit transaction'}
                  onClick={() =>
                    setEditingId(isEditing ? null : t.id)
                  }
                >
                  {isEditing ? <IconTxClose /> : <IconTxEdit />}
                </button>
              ) : null}
            </div>
            {isEditing && onUpdate ? (
              <div className="tx-edit">
                <LogExpenseForm
                  key={t.id}
                  initial={t}
                  defaultPersonId={t.personId}
                  onCancel={() => setEditingId(null)}
                  onSave={(next) => {
                    onUpdate(next)
                    setEditingId(null)
                  }}
                />
              </div>
            ) : null}
          </li>
        )
      })}
    </ul>
  )
}

function CategoryEditorForm({
  initial,
  personName,
  submitLabel = 'Add category',
  showBudget = true,
  onSubmit,
  onCancel,
}: {
  initial?: {
    label: string
    kind: CategoryKind
    icon: string
    budgetAmount: number
  }
  personName: string
  submitLabel?: string
  showBudget?: boolean
  onSubmit: (input: {
    label: string
    kind: CategoryKind
    icon: string
    budgetAmount: number
  }) => void
  onCancel: () => void
}) {
  const [label, setLabel] = useState(initial?.label ?? '')
  const [kind, setKind] = useState<CategoryKind>(initial?.kind ?? 'variable')
  const [icon, setIcon] = useState(initial?.icon ?? '')
  const [budgetAmount, setBudgetAmount] = useState(
    initial?.budgetAmount != null && initial.budgetAmount > 0
      ? String(initial.budgetAmount)
      : '',
  )

  return (
    <form
      className="log-form category-editor"
      onSubmit={(e) => {
        e.preventDefault()
        if (!label.trim()) return
        const amount = Number(budgetAmount)
        onSubmit({
          label: label.trim(),
          kind,
          icon: icon.trim() || '•',
          budgetAmount:
            Number.isFinite(amount) && amount > 0
              ? Math.round(amount * 100) / 100
              : 0,
        })
      }}
    >
      <div className="log-grid">
        <label className="span-2">
          Label
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Pet food, Parking…"
            required
          />
        </label>
        <label>
          Kind
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as CategoryKind)}
          >
            <option value="variable">Variable</option>
            <option value="fixed">Fixed</option>
          </select>
        </label>
        <label>
          Icon
          <input
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            placeholder="•"
            maxLength={4}
          />
        </label>
        {showBudget ? (
          <label className="span-2">
            Budget for {personName}{' '}
            <span className="preview-meta">(optional)</span>
            <input
              type="number"
              min="0"
              step="0.01"
              value={budgetAmount}
              onChange={(e) => setBudgetAmount(e.target.value)}
              placeholder="0.00"
            />
          </label>
        ) : null}
      </div>
      <p className="hint">
        Built-in sheet categories can’t be deleted. Removing a custom category
        reassigns its transactions to Other.
      </p>
      <div className="log-actions">
        <button type="button" className="ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="primary" disabled={!label.trim()}>
          {submitLabel}
        </button>
      </div>
    </form>
  )
}

function OverviewSection({
  id,
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  id: string
  title: string
  summary?: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <section className={`panel overview-section${open ? ' open' : ''}`}>
      <button
        type="button"
        className="overview-section-toggle"
        aria-expanded={open}
        aria-controls={id}
        onClick={onToggle}
      >
        <div className="overview-section-copy">
          <h2>{title}</h2>
          {summary ? <p>{summary}</p> : null}
        </div>
        <span
          className={`overview-chevron${open ? ' open' : ''}`}
          aria-hidden
        >
          ›
        </span>
      </button>
      {open ? (
        <div id={id} className="overview-section-body">
          {children}
        </div>
      ) : null}
    </section>
  )
}

const FINANCIAL_SAYINGS = [
  'Small steps today become big savings tomorrow.',
  'A budget is telling your money where to go.',
  'Spend with intention — keep what matters.',
  'Track a little, stress a little less.',
  'Every charge has a story — make yours count.',
  'Wealth grows quietly when you watch the details.',
  'Know where it went, and what’s left feels clearer.',
  'Pay yourself first, then enjoy the rest.',
] as const

function financialSayingForToday(now = new Date()): string {
  const start = new Date(now.getFullYear(), 0, 0)
  const dayOfYear = Math.floor(
    (now.getTime() - start.getTime()) / 86_400_000,
  )
  return FINANCIAL_SAYINGS[dayOfYear % FINANCIAL_SAYINGS.length]
}

function sortTransactionsMostRecent(transactions: Transaction[]): Transaction[] {
  return [...transactions].sort(
    (a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id),
  )
}

function formatChargeDate(iso: string): string {
  const raw = iso?.slice(0, 10) || ''
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return iso || '—'
  const d = new Date(`${raw}T12:00:00`)
  if (Number.isNaN(d.getTime())) return raw
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function RecentChargeList({
  charges,
  showPerson = false,
}: {
  charges: Transaction[]
  showPerson?: boolean
}) {
  if (charges.length === 0) return null
  return (
    <ul className="recent-charge-list">
      {charges.map((t) => {
        const personName = PEOPLE.find((p) => p.id === t.personId)?.name
        return (
          <li key={t.id}>
            <time dateTime={t.date.slice(0, 10)}>{formatChargeDate(t.date)}</time>
            <span className="recent-charge-merchant">
              {t.merchant}
              {showPerson && personName ? (
                <span className="recent-charge-person"> · {personName}</span>
              ) : null}
              {t.isRefund ? (
                <span className="cash-type in"> Refund</span>
              ) : null}
              {t.isCashIn && !t.isRefund ? (
                <span className="cash-type in"> Cash in</span>
              ) : null}
            </span>
            <span
              className={`recent-charge-amount ${isMoneyIn(t) ? 'in' : 'out'}`}
            >
              {isMoneyIn(t) ? '+' : '−'}
              {formatMoney(t.amount)}
            </span>
          </li>
        )
      })}
    </ul>
  )
}

function PersonCard({
  name,
  totals,
}: {
  name: string
  totals: {
    income: number
    grossSpend: number
    refunds: number
    cashIns?: number
    netSpend: number
    fixedBudget: number
    afterFixed: number
    variableBudget: number
    variableSpent: number
    stillAvailable: number
    categoryLeftover: number
  }
}) {
  return (
    <article className="person-card">
      <div className="person-card-hero">
        <h3>{name}</h3>
        <BudgetStatus
          spent={totals.variableSpent}
          budget={totals.variableBudget}
          underLabel="On track"
          overLabel="Over budget"
        />
      </div>
      <div
        className={`insight-figure-sm ${totals.stillAvailable >= 0 ? 'good' : 'bad'}`}
      >
        {formatMoney(totals.stillAvailable)}
      </div>
      <p className="stat-sub">Left of your variable budgets</p>
      <SpendMeter
        used={totals.variableSpent}
        total={totals.variableBudget}
        caption={`${formatMoney(totals.variableSpent)} of ${formatMoney(totals.variableBudget)} planned`}
      />
      <dl className="person-card-quiet">
        <div>
          <dt>Salary</dt>
          <dd>{formatMoney(totals.income)}</dd>
        </div>
        <div>
          <dt>Fixed bills</dt>
          <dd>{formatMoney(totals.fixedBudget)}</dd>
        </div>
        {(totals.cashIns ?? 0) > 0 ? (
          <div>
            <dt>Cash in</dt>
            <dd className="leftover good">
              +{formatMoney(totals.cashIns ?? 0)}
            </dd>
          </div>
        ) : null}
        <div>
          <dt>Variable budget left</dt>
          <dd
            className={
              totals.categoryLeftover >= 0 ? 'leftover good' : 'leftover bad'
            }
          >
            {formatMoney(totals.categoryLeftover)}
          </dd>
        </div>
      </dl>
    </article>
  )
}

function clampPct(used: number, total: number): number {
  if (total <= 0) return used > 0 ? 100 : 0
  return Math.min(100, Math.round((used / total) * 1000) / 10)
}

/** Width % for remaining/save meters: clamp(0, leftover/afterFixed, 1) * 100. */
function remainingPct(leftover: number, afterFixed: number): number {
  if (leftover < 0 || afterFixed <= 0) return 0
  return Math.min(100, Math.max(0, (leftover / afterFixed) * 100))
}

function SpendMeter({
  used,
  total,
  caption,
  mode = 'spent',
}: {
  used: number
  total: number
  caption?: string
  /** spent: fill grows with use. remaining: fill = leftover/afterFixed (shrinks as spend grows). */
  mode?: 'spent' | 'remaining'
}) {
  let pct: number
  let over: boolean
  let tone: 'ok' | 'tight' | 'over'
  let width: number

  if (mode === 'remaining') {
    // Call site must pass used=leftover, total=afterFixed (income − planned fixed).
    // Do NOT pass variable spent here — that would fill up as spend grows.
    const afterFixed = Math.max(total, 0)
    const leftover = used
    over = leftover < 0
    pct = Math.round(remainingPct(leftover, afterFixed) * 10) / 10
    tone = over ? 'over' : 'ok'
    // Empty/minimal stub when over — not a full red “spent” bar
    width = over ? 4 : pct
  } else {
    pct = clampPct(used, total)
    over = used > 0 && (total <= 0 || used > total)
    tone = over ? 'over' : pct >= 90 ? 'tight' : 'ok'
    width = over && total > 0 ? 100 : pct
  }

  return (
    <div className={`spend-meter tone-${tone}`}>
      <div
        className="spend-meter-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        aria-label={
          caption ??
          (mode === 'remaining' ? `${pct}% still to save` : `${pct}% used`)
        }
      >
        <span style={{ width: `${width}%` }} />
      </div>
      {caption ? <p className="spend-meter-caption">{caption}</p> : null}
    </div>
  )
}

function BudgetStatus({
  spent,
  budget,
  underLabel = 'Under',
  overLabel = 'Over',
}: {
  spent: number
  budget: number
  underLabel?: string
  overLabel?: string
}) {
  if (budget <= 0 && spent <= 0) return null
  const over = budget > 0 ? spent > budget : spent > 0
  const label = over
    ? overLabel
    : budget > 0
      ? underLabel
      : null
  if (!label) return null
  return (
    <span className={`budget-status ${over ? 'over' : 'under'}`}>{label}</span>
  )
}
