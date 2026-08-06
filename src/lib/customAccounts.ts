import { ACCOUNTS } from '../data/seed'
import type { Account, AccountId, AccountOwner, PersonId } from '../types'

const ACCOUNTS_KEY = 'household-ledger.accounts.v1'

const BUILTIN_IDS = new Set<string>(ACCOUNTS.map((a) => a.id))

let customAccountsCache: Account[] = loadCustomAccountsFromStorage()

function isValidOwner(value: unknown): value is AccountOwner {
  return value === 'trevor' || value === 'kate' || value === 'shared'
}

function normalizeOwner(raw: Record<string, unknown>): AccountOwner {
  if (isValidOwner(raw.owner)) return raw.owner
  // Legacy / alternate field from early drafts
  if (raw.personId === 'trevor' || raw.personId === 'kate') return raw.personId
  if (raw.shared === true) return 'shared'
  return 'shared'
}

function isValidAccount(value: unknown): value is Account {
  if (!value || typeof value !== 'object') return false
  const raw = value as Record<string, unknown>
  return (
    typeof raw.id === 'string' &&
    raw.id.length > 0 &&
    typeof raw.label === 'string' &&
    raw.label.trim().length > 0 &&
    typeof raw.icon === 'string'
  )
}

function normalizeAccount(value: unknown): Account | null {
  if (!isValidAccount(value)) return null
  const raw = value as Account
  return {
    id: raw.id,
    label: raw.label.trim(),
    icon: raw.icon.trim() || '💳',
    owner: normalizeOwner(value as unknown as Record<string, unknown>),
  }
}

function loadCustomAccountsFromStorage(): Account[] {
  try {
    const raw = localStorage.getItem(ACCOUNTS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed
      .map(normalizeAccount)
      .filter((a): a is Account => a != null && !BUILTIN_IDS.has(a.id))
  } catch {
    return []
  }
}

export function isBuiltInAccountId(id: string): boolean {
  return BUILTIN_IDS.has(id)
}

export function getCustomAccounts(): Account[] {
  return customAccountsCache
}

export function getAllAccounts(): Account[] {
  return [...ACCOUNTS, ...customAccountsCache]
}

/**
 * Accounts visible when logging/importing for a person: their own, plus any
 * explicitly `shared` (joint) customs. Built-ins are person-owned — not shared.
 */
export function accountsForPerson(personId: PersonId): Account[] {
  return getAllAccounts().filter(
    (a) => a.owner === personId || a.owner === 'shared',
  )
}

function preferredAccountForPerson(personId: PersonId): AccountId {
  const available = accountsForPerson(personId)
  if (personId === 'kate') {
    return (
      available.find((a) => a.id === 'debit_kate')?.id ??
      available[0]?.id ??
      'debit_kate'
    )
  }
  return (
    available.find((a) => a.id === 'amex')?.id ??
    available.find((a) => a.id === 'debit')?.id ??
    available.find((a) => a.id === 'other')?.id ??
    available[0]?.id ??
    'other'
  )
}

/** Keep accountId if still valid for person; otherwise fall back to that person’s default. */
export function resolveAccountForPerson(
  accountId: AccountId,
  personId: PersonId,
): AccountId {
  const available = accountsForPerson(personId)
  if (available.some((a) => a.id === accountId)) return accountId
  return preferredAccountForPerson(personId)
}

export function accountOwnerLabel(owner: AccountOwner): string {
  if (owner === 'shared') return 'Shared'
  if (owner === 'trevor') return 'Trevor'
  return 'Kate'
}

/** Sync in-memory cache + localStorage. */
export function replaceCustomAccounts(next: Account[]): void {
  customAccountsCache = next
    .map(normalizeAccount)
    .filter((a): a is Account => a != null && !isBuiltInAccountId(a.id))
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(customAccountsCache))
}

export function slugifyAccountLabel(label: string): string {
  const base = label
    .trim()
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
  return base || 'account'
}

export function uniqueAccountId(
  label: string,
  owner: AccountOwner,
  existingIds: Set<string>,
): string {
  const base = slugifyAccountLabel(label)
  const prefix =
    owner === 'shared' ? `custom_${base}` : `custom_${owner}_${base}`
  if (!existingIds.has(prefix) && !isBuiltInAccountId(prefix)) {
    return prefix
  }
  let n = 2
  while (
    existingIds.has(`${prefix}_${n}`) ||
    isBuiltInAccountId(`${prefix}_${n}`)
  ) {
    n += 1
  }
  return `${prefix}_${n}`
}

export function createCustomAccount(input: {
  label: string
  owner: AccountOwner
  icon?: string
}): Account {
  const label = input.label.trim()
  const owner = isValidOwner(input.owner) ? input.owner : 'shared'
  const existing = new Set(getAllAccounts().map((a) => a.id))
  return {
    id: uniqueAccountId(label, owner, existing) as AccountId,
    label,
    icon: input.icon?.trim() || '💳',
    owner,
  }
}

export function removeCustomAccountData(accountId: string): void {
  replaceCustomAccounts(
    customAccountsCache.filter((a) => a.id !== accountId),
  )
}
