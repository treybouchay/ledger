import { getAllAccounts } from './customAccounts'
import { getAllCategories } from './customCategories'
import { PEOPLE } from '../data/seed'
import type { AccountId, CategoryId, PersonId } from '../types'

/** Distinct emoji so Trevor vs Kate is obvious on upload / pickers. */
export function personEmoji(id: PersonId): string {
  return id === 'kate' ? '👩' : '🧔'
}

export function personLabel(id: PersonId): string {
  return PEOPLE.find((p) => p.id === id)?.name ?? id
}

export function personOptionLabel(id: PersonId): string {
  return `${personEmoji(id)} ${personLabel(id)}`
}

export function categoryIcon(id: CategoryId): string {
  return getAllCategories().find((c) => c.id === id)?.icon ?? '•'
}

export function categoryLabel(id: CategoryId): string {
  return getAllCategories().find((c) => c.id === id)?.label ?? id
}

export function accountIcon(id: AccountId): string {
  return getAllAccounts().find((a) => a.id === id)?.icon ?? '💳'
}

export function accountLabel(id: AccountId): string {
  return getAllAccounts().find((a) => a.id === id)?.label ?? id
}

export function categoryOptionLabel(id: CategoryId): string {
  return `${categoryIcon(id)} ${categoryLabel(id)}`
}

export function accountOptionLabel(id: AccountId): string {
  return `${accountIcon(id)} ${accountLabel(id)}`
}
