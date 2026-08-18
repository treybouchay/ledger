import { applyBackup, buildBackup, parseBackup, type HouseholdBackup } from './backup'
import {
  getBudgetOverrides,
  getCustomCategories,
  getIncomeOverrides,
  replaceBudgetOverrides,
  replaceCustomCategories,
  replaceIncomeOverrides,
} from './customCategories'
import {
  getCustomAccounts,
  replaceCustomAccounts,
} from './customAccounts'
import { loadGearState, saveGearState } from './gearStorage'
import { loadLearnedRules, saveLearnedRules, type LearnedRule } from './learnedRules'
import {
  loadStatementFile,
  saveStatementFile,
  statementFileNames,
  statementFilePartKey,
  type StoredStatementFile,
} from './statementFiles'
import { loadImports, loadTransactions } from './storage'
import {
  getCachedHouseholdId,
  getSupabase,
  isSupabaseConfigured,
  setCachedHouseholdId,
  STATEMENT_FILES_BUCKET,
  type AuthSession,
} from './supabase'
import type {
  Account,
  BudgetLine,
  Category,
  GearState,
  PersonId,
  StatementImport,
  Transaction,
} from '../types'

export type CloudSyncState =
  | 'disabled'
  | 'signed_out'
  | 'loading'
  | 'ready'
  | 'syncing'
  | 'error'

export interface CloudContext {
  session: AuthSession
  householdId: string
  email: string
}

function storagePath(householdId: string, importId: string, fileName: string): string {
  const safeName = fileName.replace(/[/\\]/g, '_')
  return `${householdId}/${importId}/${safeName}`
}

export async function getCurrentSession(): Promise<AuthSession | null> {
  const sb = getSupabase()
  if (!sb) return null
  const { data } = await sb.auth.getSession()
  return data.session
}

export async function signInWithMagicLink(email: string): Promise<string | null> {
  const sb = getSupabase()
  if (!sb) return 'Supabase is not configured on this deployment.'
  const redirectTo = window.location.origin + window.location.pathname
  const { error } = await sb.auth.signInWithOtp({
    email: email.trim(),
    options: { emailRedirectTo: redirectTo },
  })
  return error?.message ?? null
}

export async function signOutCloud(): Promise<void> {
  const sb = getSupabase()
  if (sb) await sb.auth.signOut()
  setCachedHouseholdId(null)
}

/** Create or fetch the user's household membership. */
export async function ensureHousehold(
  userId: string,
): Promise<{ householdId: string | null; error?: string }> {
  const sb = getSupabase()
  if (!sb) return { householdId: null, error: 'Supabase not configured' }

  const cached = getCachedHouseholdId()
  if (cached) {
    const { data: member } = await sb
      .from('household_members')
      .select('household_id')
      .eq('user_id', userId)
      .eq('household_id', cached)
      .maybeSingle()
    if (member?.household_id) return { householdId: cached }
  }

  const { data: existing, error: existingErr } = await sb
    .from('household_members')
    .select('household_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle()

  if (existingErr) {
    console.error('[cloud] list household membership failed', existingErr)
  }

  if (existing?.household_id) {
    setCachedHouseholdId(existing.household_id)
    return { householdId: existing.household_id }
  }

  // Prefer RPC so insert…select isn’t blocked by RLS before membership exists.
  const { data: rpcId, error: rpcErr } = await sb.rpc('create_household', {
    p_name: 'Trevor & Kate',
  })

  if (!rpcErr && typeof rpcId === 'string' && rpcId.length > 0) {
    setCachedHouseholdId(rpcId)
    return { householdId: rpcId }
  }

  if (rpcErr) {
    console.error('[cloud] create_household rpc failed', rpcErr)
  }

  // Fallback for projects that haven’t run the RPC migration yet.
  const { data: household, error: hErr } = await sb
    .from('households')
    .insert({ name: 'Trevor & Kate' })
    .select('id')
    .single()

  if (hErr || !household?.id) {
    const msg =
      hErr?.message ??
      rpcErr?.message ??
      'Could not create household (run create_household SQL in Supabase).'
    console.error('[cloud] create household failed', hErr)
    return { householdId: null, error: msg }
  }

  const { error: mErr } = await sb.from('household_members').insert({
    household_id: household.id,
    user_id: userId,
  })

  if (mErr) {
    console.error('[cloud] add household member failed', mErr)
    return { householdId: null, error: mErr.message }
  }

  setCachedHouseholdId(household.id)
  return { householdId: household.id }
}

function rowToTransaction(row: Record<string, unknown>): Transaction {
  return {
    id: String(row.id),
    personId: row.person_id as PersonId,
    monthId: String(row.month_id),
    date: String(row.date).slice(0, 10),
    amount: Number(row.amount),
    merchant: String(row.merchant),
    accountId: String(row.account_id),
    categoryId: String(row.category_id),
    notes: row.notes ? String(row.notes) : undefined,
    isRefund: Boolean(row.is_refund),
    isCashIn: Boolean(row.is_cash_in),
    source: row.source as Transaction['source'],
    importId: row.import_id ? String(row.import_id) : undefined,
    sourceFile: row.source_file ? String(row.source_file) : undefined,
  }
}

function rowToImport(row: Record<string, unknown>): StatementImport {
  return {
    id: String(row.id),
    fileName: String(row.file_name),
    uploadedAt: String(row.uploaded_at),
    personId: row.person_id as PersonId,
    primaryAccountId: String(row.primary_account_id),
    monthIds: Array.isArray(row.month_ids) ? row.month_ids.map(String) : [],
    transactionCount: Number(row.transaction_count),
    netAmount: Number(row.net_amount),
    hasStoredFile: Boolean(row.has_stored_file),
    mimeType: row.mime_type ? String(row.mime_type) : undefined,
    sourceKind: row.source_kind as StatementImport['sourceKind'],
  }
}

function rowToRule(row: Record<string, unknown>): LearnedRule {
  return {
    id: String(row.id),
    pattern: String(row.pattern),
    categoryId: String(row.category_id),
    accountId: row.account_id ? String(row.account_id) : undefined,
    createdAt: String(row.created_at),
  }
}

export async function fetchCloudBackup(
  householdId: string,
): Promise<HouseholdBackup | null> {
  const sb = getSupabase()
  if (!sb) return null

  const [
    txRes,
    impRes,
    catRes,
    accRes,
    budRes,
    incRes,
    ruleRes,
    gearRes,
  ] = await Promise.all([
    sb.from('transactions').select('*').eq('household_id', householdId),
    sb.from('statement_imports').select('*').eq('household_id', householdId),
    sb.from('custom_categories').select('*').eq('household_id', householdId),
    sb.from('custom_accounts').select('*').eq('household_id', householdId),
    sb.from('budget_overrides').select('*').eq('household_id', householdId),
    sb.from('income_overrides').select('*').eq('household_id', householdId),
    sb.from('learned_rules').select('*').eq('household_id', householdId),
    sb.from('gear_state').select('*').eq('household_id', householdId).maybeSingle(),
  ])

  for (const res of [txRes, impRes, catRes, accRes, budRes, incRes, ruleRes]) {
    if (res.error) throw new Error(res.error.message)
  }
  if (gearRes.error) throw new Error(gearRes.error.message)

  const transactions = (txRes.data ?? []).map(rowToTransaction)
  const imports = (impRes.data ?? []).map(rowToImport)

  if (
    transactions.length === 0 &&
    imports.length === 0 &&
    (catRes.data ?? []).length === 0 &&
    !(gearRes.data?.cash as unknown[] | undefined)?.length
  ) {
    return null
  }

  const customCategories: Category[] = (catRes.data ?? []).map((row) => ({
    id: String(row.id),
    label: String(row.label),
    icon: String(row.icon),
    kind: row.kind as Category['kind'],
    ledgerTracked: Boolean(row.ledger_tracked),
  }))

  const customAccounts: Account[] = (accRes.data ?? []).map((row) => ({
    id: String(row.id),
    label: String(row.label),
    icon: String(row.icon),
    owner: row.owner as Account['owner'],
  }))

  const budgetOverrides: BudgetLine[] = (budRes.data ?? []).map((row) => ({
    personId: row.person_id as PersonId,
    categoryId: String(row.category_id),
    amount: Number(row.amount),
  }))

  const incomes: Partial<Record<PersonId, number>> = {}
  for (const row of incRes.data ?? []) {
    incomes[row.person_id as PersonId] = Number(row.amount)
  }

  const learnedRules = (ruleRes.data ?? []).map(rowToRule)

  const gearRow = gearRes.data
  const gear: GearState = gearRow
    ? {
        openingBalance: Number(gearRow.opening_balance),
        months: (gearRow.months as GearState['months']) ?? [],
        cash: (gearRow.cash as GearState['cash']) ?? [],
        keepList: (gearRow.keep_list as GearState['keepList']) ?? [],
        projectedTargets:
          (gearRow.projected_targets as GearState['projectedTargets']) ?? {},
        projectedManualRows:
          (gearRow.projected_manual_rows as GearState['projectedManualRows']) ??
          [],
        projectedAttachedBuys:
          (gearRow.projected_attached_buys as GearState['projectedAttachedBuys']) ??
          {},
      }
    : loadGearState()

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    transactions,
    imports,
    learnedRules,
    customCategories,
    customAccounts,
    budgetOverrides,
    incomes,
    gear,
  }
}

function transactionRow(householdId: string, t: Transaction) {
  return {
    id: t.id,
    household_id: householdId,
    person_id: t.personId,
    month_id: t.monthId,
    date: t.date,
    amount: t.amount,
    merchant: t.merchant,
    account_id: t.accountId,
    category_id: t.categoryId,
    notes: t.notes ?? null,
    is_refund: Boolean(t.isRefund),
    is_cash_in: Boolean(t.isCashIn),
    source: t.source,
    import_id: t.importId ?? null,
    source_file: t.sourceFile ?? null,
    updated_at: new Date().toISOString(),
  }
}

function importRow(
  householdId: string,
  item: StatementImport,
  storagePathValue: string | null,
) {
  return {
    id: item.id,
    household_id: householdId,
    file_name: item.fileName,
    uploaded_at: item.uploadedAt,
    person_id: item.personId,
    primary_account_id: item.primaryAccountId,
    month_ids: item.monthIds,
    transaction_count: item.transactionCount,
    net_amount: item.netAmount,
    has_stored_file: Boolean(item.hasStoredFile),
    mime_type: item.mimeType ?? null,
    source_kind: item.sourceKind ?? null,
    storage_path: storagePathValue,
    updated_at: new Date().toISOString(),
  }
}

export async function pushCloudBackup(
  householdId: string,
  backup: HouseholdBackup,
): Promise<void> {
  const sb = getSupabase()
  if (!sb) return

  // Full replace for this household so Save/Download match one device's ledger
  // (upsert-only left stale phone rows in the cloud and skewed leftovers).
  const { error: delTxErr } = await sb
    .from('transactions')
    .delete()
    .eq('household_id', householdId)
  if (delTxErr) throw new Error(delTxErr.message)

  const { error: delImpErr } = await sb
    .from('statement_imports')
    .delete()
    .eq('household_id', householdId)
  if (delImpErr) throw new Error(delImpErr.message)

  const { error: delCatErr } = await sb
    .from('custom_categories')
    .delete()
    .eq('household_id', householdId)
  if (delCatErr) throw new Error(delCatErr.message)

  const { error: delAccErr } = await sb
    .from('custom_accounts')
    .delete()
    .eq('household_id', householdId)
  if (delAccErr) throw new Error(delAccErr.message)

  const { error: delBudErr } = await sb
    .from('budget_overrides')
    .delete()
    .eq('household_id', householdId)
  if (delBudErr) throw new Error(delBudErr.message)

  const { error: delIncErr } = await sb
    .from('income_overrides')
    .delete()
    .eq('household_id', householdId)
  if (delIncErr) throw new Error(delIncErr.message)

  const { error: delRuleErr } = await sb
    .from('learned_rules')
    .delete()
    .eq('household_id', householdId)
  if (delRuleErr) throw new Error(delRuleErr.message)

  const txRows = backup.transactions.map((t) => transactionRow(householdId, t))
  const impRows = backup.imports.map((item) => {
    const path =
      item.hasStoredFile
        ? storagePath(householdId, item.id, item.fileName)
        : null
    return importRow(householdId, item, path)
  })

  if (txRows.length > 0) {
    const { error } = await sb.from('transactions').insert(txRows)
    if (error) throw new Error(error.message)
  }

  if (impRows.length > 0) {
    const { error } = await sb.from('statement_imports').insert(impRows)
    if (error) throw new Error(error.message)
  }

  const catRows = backup.customCategories.map((c) => ({
    id: c.id,
    household_id: householdId,
    label: c.label,
    icon: c.icon,
    kind: c.kind,
    ledger_tracked: c.ledgerTracked,
    updated_at: new Date().toISOString(),
  }))
  if (catRows.length > 0) {
    const { error } = await sb.from('custom_categories').insert(catRows)
    if (error) throw new Error(error.message)
  }

  const accRows = backup.customAccounts.map((a) => ({
    id: a.id,
    household_id: householdId,
    label: a.label,
    icon: a.icon,
    owner: a.owner,
    updated_at: new Date().toISOString(),
  }))
  if (accRows.length > 0) {
    const { error } = await sb.from('custom_accounts').insert(accRows)
    if (error) throw new Error(error.message)
  }

  const budRows = backup.budgetOverrides.map((b) => ({
    household_id: householdId,
    person_id: b.personId,
    category_id: b.categoryId,
    amount: b.amount,
    updated_at: new Date().toISOString(),
  }))
  if (budRows.length > 0) {
    const { error } = await sb.from('budget_overrides').insert(budRows)
    if (error) throw new Error(error.message)
  }

  const incRows = (Object.entries(backup.incomes) as [PersonId, number][])
    .filter(([, amount]) => typeof amount === 'number')
    .map(([personId, amount]) => ({
      household_id: householdId,
      person_id: personId,
      amount,
      updated_at: new Date().toISOString(),
    }))
  if (incRows.length > 0) {
    const { error } = await sb.from('income_overrides').insert(incRows)
    if (error) throw new Error(error.message)
  }

  const ruleRows = backup.learnedRules.map((r) => ({
    id: r.id,
    household_id: householdId,
    pattern: r.pattern,
    category_id: r.categoryId,
    account_id: r.accountId ?? null,
    created_at: r.createdAt,
    updated_at: new Date().toISOString(),
  }))
  if (ruleRows.length > 0) {
    const { error } = await sb.from('learned_rules').insert(ruleRows)
    if (error) throw new Error(error.message)
  }

  const gear = backup.gear
  const { error: gearErr } = await sb.from('gear_state').upsert(
    {
      household_id: householdId,
      opening_balance: gear.openingBalance,
      months: gear.months,
      cash: gear.cash,
      keep_list: gear.keepList,
      projected_targets: gear.projectedTargets ?? {},
      projected_manual_rows: gear.projectedManualRows ?? [],
      projected_attached_buys: gear.projectedAttachedBuys ?? {},
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'household_id' },
  )
  if (gearErr) throw new Error(gearErr.message)
}

export async function uploadStatementFilesFromDevice(
  householdId: string,
  imports: StatementImport[],
): Promise<number> {
  const sb = getSupabase()
  if (!sb) return 0

  let uploaded = 0
  for (const item of imports) {
    if (!item.hasStoredFile) continue
    const names = statementFileNames(item.fileName, item.storedFileNames)
    for (let i = 0; i < names.length; i += 1) {
      const partKey = statementFilePartKey(item.id, i)
      try {
        const local = await loadStatementFile(partKey)
        if (!local) continue
        // Part 0 keeps the legacy joined-label path so old uploads still resolve.
        const path = storagePath(
          householdId,
          partKey,
          i === 0 ? item.fileName : names[i],
        )
        const { error } = await sb.storage
          .from(STATEMENT_FILES_BUCKET)
          .upload(path, local.blob, {
            upsert: true,
            contentType: local.mimeType,
          })
        if (error) {
          console.error('[cloud] upload statement file failed', partKey, error)
          continue
        }
        uploaded += 1
      } catch (err) {
        console.error('[cloud] upload statement file error', partKey, err)
      }
    }
  }
  return uploaded
}

export async function downloadStatementFileFromCloud(
  householdId: string,
  importId: string,
  fileName: string,
): Promise<StoredStatementFile | null> {
  const sb = getSupabase()
  if (!sb) return null

  const path = storagePath(householdId, importId, fileName)
  const { data, error } = await sb.storage
    .from(STATEMENT_FILES_BUCKET)
    .download(path)

  if (error || !data) {
    console.warn('[cloud] download statement file failed', importId, error)
    return null
  }

  const mimeType = data.type || 'application/octet-stream'
  const record: StoredStatementFile = {
    importId,
    fileName,
    mimeType,
    byteLength: data.size,
    blob: data,
    storedAt: new Date().toISOString(),
  }

  try {
    await saveStatementFile(importId, data, fileName)
  } catch {
    /* cache optional */
  }

  return record
}

/** Load from IndexedDB, then Supabase Storage if logged in. */
export async function resolveStatementFile(
  importId: string,
  fileName: string,
  householdId: string | null,
): Promise<StoredStatementFile | null> {
  const local = await loadStatementFile(importId)
  if (local) return local
  if (!householdId || !isSupabaseConfigured()) return null
  return downloadStatementFileFromCloud(householdId, importId, fileName)
}

export function localDeviceHasData(): boolean {
  const tx = loadTransactions().transactions
  const imp = loadImports().imports
  return tx.length > 0 || imp.length > 0 || loadGearState().cash.length > 0
}

export function applyCloudBackupToLocal(backup: HouseholdBackup): void {
  applyBackup(backup)
}

export function buildBackupFromModules(input?: Parameters<typeof buildBackup>[0]): HouseholdBackup {
  return buildBackup(input)
}

const SNAPSHOT_KEEP = 10
const LAST_SAVED_KEY = 'household-ledger.cloud-last-saved.v1'
const LAST_DOWNLOADED_KEY = 'household-ledger.cloud-last-downloaded.v1'

export interface CloudSnapshotMeta {
  id: string
  createdAt: string
  label: string | null
  deviceLabel: string | null
  transactionCount: number
  importCount: number
  /** Signed-in person when this snapshot was saved (Trevor / Kate). */
  personId: PersonId | null
  /** Magic-link / login email that uploaded this snapshot. */
  createdByEmail: string | null
}

export function getLastCloudSavedAt(): string | null {
  try {
    return localStorage.getItem(LAST_SAVED_KEY)
  } catch {
    return null
  }
}

export function getLastCloudDownloadedAt(): string | null {
  try {
    return localStorage.getItem(LAST_DOWNLOADED_KEY)
  } catch {
    return null
  }
}

export function markCloudSavedNow(): string {
  const iso = new Date().toISOString()
  try {
    localStorage.setItem(LAST_SAVED_KEY, iso)
  } catch {
    /* ignore */
  }
  return iso
}

export function markCloudDownloadedNow(): string {
  const iso = new Date().toISOString()
  try {
    localStorage.setItem(LAST_DOWNLOADED_KEY, iso)
  } catch {
    /* ignore */
  }
  return iso
}

function shortDeviceLabel(): string {
  if (typeof navigator === 'undefined') return 'Unknown device'
  const ua = navigator.userAgent
  if (/iPhone|iPad/i.test(ua)) return 'iPhone / iPad'
  if (/Android/i.test(ua)) return 'Android'
  if (/Mac/i.test(ua)) return 'Mac'
  if (/Windows/i.test(ua)) return 'Windows'
  if (/Linux/i.test(ua)) return 'Linux'
  return 'Browser'
}

/** Map stored snapshot device labels to phone vs desktop for UI icons. */
export function syncSourceFromDeviceLabel(
  label: string | null | undefined,
): 'phone' | 'desktop' {
  if (!label) return 'desktop'
  if (/iphone|ipad|android|phone|mobile/i.test(label)) return 'phone'
  return 'desktop'
}

function formatSnapshotLabel(backup: HouseholdBackup): string {
  return `${backup.transactions.length} tx · ${backup.imports.length} imports`
}

function asPersonId(value: unknown): PersonId | null {
  return value === 'trevor' || value === 'kate' ? value : null
}

function personIdFromEmail(email: string | null | undefined): PersonId | null {
  if (!email) return null
  const local = email.split('@')[0] ?? ''
  if (/kate/i.test(local) || /kate/i.test(email)) return 'kate'
  if (/trevor|trey/i.test(local) || /trevor|trey/i.test(email)) return 'trevor'
  return null
}

function snapshotIdentityLabel(
  personId: PersonId | null,
  email: string | null,
): string | null {
  const who = personId === 'kate' ? 'Kate' : personId === 'trevor' ? 'Trevor' : null
  const parts = [who, email].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : null
}

function parseIdentityFromLabel(label: string | null): {
  personId: PersonId | null
  email: string | null
} {
  if (!label) return { personId: null, email: null }
  if (/\btx\b/i.test(label) && /\bimports?\b/i.test(label)) {
    return { personId: null, email: null }
  }
  const email = label.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? null
  const personId = asPersonId(
    /kate/i.test(label) ? 'kate' : /trevor/i.test(label) ? 'trevor' : null,
  ) ?? personIdFromEmail(email)
  return { personId, email }
}

async function currentMemberIdentity(
  householdId: string,
  userId: string,
  email: string | null,
): Promise<{ personId: PersonId | null; email: string | null }> {
  const sb = getSupabase()
  let personId: PersonId | null = null
  if (sb) {
    const { data } = await sb
      .from('household_members')
      .select('person_id')
      .eq('household_id', householdId)
      .eq('user_id', userId)
      .maybeSingle()
    personId = asPersonId(data?.person_id)
  }
  if (!personId) personId = personIdFromEmail(email)
  return { personId, email }
}

async function householdMemberIdentities(
  householdId: string,
): Promise<Map<string, { personId: PersonId | null; email: string | null }>> {
  const map = new Map<string, { personId: PersonId | null; email: string | null }>()
  const sb = getSupabase()
  if (!sb) return map

  const { data: rpc, error: rpcErr } = await sb.rpc('household_member_identities')
  if (!rpcErr && Array.isArray(rpc)) {
    for (const row of rpc as Record<string, unknown>[]) {
      const userId = row.user_id ? String(row.user_id) : ''
      if (!userId) continue
      map.set(userId, {
        personId: asPersonId(row.person_id) ?? personIdFromEmail(String(row.email ?? '')),
        email: row.email ? String(row.email) : null,
      })
    }
    return map
  }

  const { data } = await sb
    .from('household_members')
    .select('user_id, person_id')
    .eq('household_id', householdId)
  for (const row of data ?? []) {
    map.set(String(row.user_id), {
      personId: asPersonId(row.person_id),
      email: null,
    })
  }
  return map
}

/** Point-in-time snapshot after explicit Save / Upload (not every auto-save). */
export async function saveLedgerSnapshot(
  householdId: string,
  backup: HouseholdBackup,
  label?: string,
): Promise<void> {
  const sb = getSupabase()
  if (!sb) return

  const {
    data: { user },
  } = await sb.auth.getUser()

  const identity = user
    ? await currentMemberIdentity(
        householdId,
        user.id,
        user.email ?? null,
      )
    : { personId: null, email: null }
  const identityLabel = snapshotIdentityLabel(identity.personId, identity.email)
  const labelParts = [identityLabel, label].filter(Boolean)
  const row = {
    household_id: householdId,
    created_by: user?.id ?? null,
    label: labelParts.length > 0 ? labelParts.join(' · ') : formatSnapshotLabel(backup),
    device_label: shortDeviceLabel(),
    transaction_count: backup.transactions.length,
    import_count: backup.imports.length,
    payload: backup,
  }

  let { error } = await sb.from('ledger_snapshots').insert({
    ...row,
    created_by_email: identity.email,
    person_id: identity.personId,
  })
  if (
    error &&
    /created_by_email|person_id|schema cache|column/i.test(error.message)
  ) {
    ;({ error } = await sb.from('ledger_snapshots').insert(row))
  }

  if (error) {
    console.warn('[cloud] snapshot save skipped', error.message)
    return
  }

  const { data: rows, error: listErr } = await sb
    .from('ledger_snapshots')
    .select('id')
    .eq('household_id', householdId)
    .order('created_at', { ascending: false })

  if (listErr || !rows || rows.length <= SNAPSHOT_KEEP) return

  const dropIds = rows.slice(SNAPSHOT_KEEP).map((r) => String(r.id))
  if (dropIds.length === 0) return
  const { error: delErr } = await sb
    .from('ledger_snapshots')
    .delete()
    .in('id', dropIds)
  if (delErr) console.warn('[cloud] snapshot prune failed', delErr.message)
}

export async function listLedgerSnapshots(
  householdId: string,
): Promise<CloudSnapshotMeta[]> {
  const sb = getSupabase()
  if (!sb) return []

  const withIdentity =
    'id, created_at, label, device_label, transaction_count, import_count, created_by, created_by_email, person_id'
  const withoutExtra =
    'id, created_at, label, device_label, transaction_count, import_count, created_by'

  const first = await sb
    .from('ledger_snapshots')
    .select(withIdentity)
    .eq('household_id', householdId)
    .order('created_at', { ascending: false })
    .limit(SNAPSHOT_KEEP)

  let rows: Record<string, unknown>[] | null = null
  let error = first.error
  if (
    error &&
    /created_by_email|person_id|schema cache|column/i.test(error.message)
  ) {
    const fallback = await sb
      .from('ledger_snapshots')
      .select(withoutExtra)
      .eq('household_id', householdId)
      .order('created_at', { ascending: false })
      .limit(SNAPSHOT_KEEP)
    error = fallback.error
    rows = (fallback.data ?? null) as Record<string, unknown>[] | null
  } else {
    rows = (first.data ?? null) as Record<string, unknown>[] | null
  }

  if (error) {
    console.warn('[cloud] list snapshots failed', error.message)
    return []
  }

  const members = await householdMemberIdentities(householdId)

  return (rows ?? []).map((row) => {
    const createdBy = row.created_by ? String(row.created_by) : null
    const fromMember = createdBy ? members.get(createdBy) : undefined
    const fromLabel = parseIdentityFromLabel(
      row.label ? String(row.label) : null,
    )
    const createdByEmail =
      (row.created_by_email ? String(row.created_by_email) : null) ??
      fromMember?.email ??
      fromLabel.email
    const personId =
      asPersonId(row.person_id) ??
      fromMember?.personId ??
      fromLabel.personId ??
      personIdFromEmail(createdByEmail)
    return {
      id: String(row.id),
      createdAt: String(row.created_at),
      label: row.label ? String(row.label) : null,
      deviceLabel: row.device_label ? String(row.device_label) : null,
      transactionCount: Number(row.transaction_count),
      importCount: Number(row.import_count),
      personId,
      createdByEmail,
    }
  })
}

export async function restoreLedgerSnapshot(
  householdId: string,
  snapshotId: string,
  options?: { pushAsCurrent?: boolean },
): Promise<HouseholdBackup> {
  const sb = getSupabase()
  if (!sb) throw new Error('Supabase not configured')

  const { data, error } = await sb
    .from('ledger_snapshots')
    .select('payload')
    .eq('household_id', householdId)
    .eq('id', snapshotId)
    .single()

  if (error || !data?.payload) {
    throw new Error(error?.message ?? 'Snapshot not found')
  }

  const backup = parseBackup(data.payload)
  applyCloudBackupToLocal(backup)
  markCloudDownloadedNow()

  if (options?.pushAsCurrent) {
    await pushCloudBackup(householdId, backup)
    await saveLedgerSnapshot(
      householdId,
      backup,
      `Restored · ${formatSnapshotLabel(backup)}`,
    )
    markCloudSavedNow()
  }

  return backup
}

/** Upload everything on this device to the cloud. */
export async function migrateDeviceToCloud(
  householdId: string,
  backup?: HouseholdBackup,
  options?: { snapshot?: boolean },
): Promise<{ filesUploaded: number }> {
  const payload =
    backup ??
    buildBackup({
      transactions: loadTransactions().transactions,
      imports: loadImports().imports,
      learnedRules: loadLearnedRules(),
      gear: loadGearState(),
    })
  payload.customCategories = getCustomCategories()
  payload.customAccounts = getCustomAccounts()
  payload.budgetOverrides = getBudgetOverrides()
  payload.incomes = getIncomeOverrides()

  await pushCloudBackup(householdId, payload)
  const filesUploaded = await uploadStatementFilesFromDevice(
    householdId,
    payload.imports,
  )
  // Default: snapshot on explicit migrate; callers pass snapshot:false for auto-save.
  if (options?.snapshot !== false) {
    await saveLedgerSnapshot(householdId, payload)
  }
  markCloudSavedNow()
  return { filesUploaded }
}

/** Pull cloud data into this browser (overwrites local ledger stores). */
export async function pullCloudToDevice(householdId: string): Promise<HouseholdBackup | null> {
  const backup = await fetchCloudBackup(householdId)
  if (!backup) return null
  applyCloudBackupToLocal(backup)
  markCloudDownloadedNow()
  return backup
}

export function persistModulesFromBackup(backup: HouseholdBackup): void {
  replaceCustomCategories(backup.customCategories)
  replaceCustomAccounts(backup.customAccounts)
  replaceBudgetOverrides(backup.budgetOverrides)
  replaceIncomeOverrides(backup.incomes)
  saveLearnedRules(backup.learnedRules)
  saveGearState(backup.gear)
}
