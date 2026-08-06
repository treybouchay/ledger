import { CATEGORIZATION_RULES } from '../data/seed'
import type { CategorizationRule, CategoryId } from '../types'

const RULES_KEY = 'household-ledger.learned-rules.v1'

export interface LearnedRule extends CategorizationRule {
  id: string
  createdAt: string
}

export function loadLearnedRules(): LearnedRule[] {
  try {
    const raw = localStorage.getItem(RULES_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as LearnedRule[]
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (r) =>
        r &&
        typeof r.id === 'string' &&
        typeof r.pattern === 'string' &&
        r.pattern.trim().length > 0 &&
        typeof r.categoryId === 'string',
    )
  } catch {
    return []
  }
}

export function saveLearnedRules(rules: LearnedRule[]): void {
  localStorage.setItem(RULES_KEY, JSON.stringify(rules))
}

export function normalizePattern(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase()
}

/** Learned rules win over built-in ones (checked first). */
export function allCategorizationRules(
  learned: LearnedRule[] = loadLearnedRules(),
): CategorizationRule[] {
  return [...learned, ...CATEGORIZATION_RULES]
}

export function rulesForCategory(
  categoryId: CategoryId,
  learned: LearnedRule[],
): { learned: LearnedRule[]; builtIn: CategorizationRule[] } {
  return {
    learned: learned.filter((r) => r.categoryId === categoryId),
    builtIn: CATEGORIZATION_RULES.filter((r) => r.categoryId === categoryId),
  }
}

export function merchantMatchesPattern(
  merchant: string,
  pattern: string,
): boolean {
  const hay = merchant.toLowerCase()
  const needle = normalizePattern(pattern)
  return needle.length > 0 && hay.includes(needle)
}
