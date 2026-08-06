import { getAllAccounts } from './customAccounts'
import { getAllCategories } from './customCategories'
import type { AccountId, CategoryId } from '../types'

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
