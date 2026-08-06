import { useMemo, useState } from 'react'
import { formatMoney } from '../lib/compute'
import {
  merchantMatchesPattern,
  normalizePattern,
  rulesForCategory,
  type LearnedRule,
} from '../lib/learnedRules'
import type { CategoryId, Transaction } from '../types'

export function CategoryMatchers({
  categoryId,
  categoryLabel,
  learnedRules,
  linkableTransactions,
  onAddRule,
  onRemoveRule,
  onAssignTransaction,
}: {
  categoryId: CategoryId
  categoryLabel: string
  learnedRules: LearnedRule[]
  linkableTransactions: Transaction[]
  onAddRule: (pattern: string, categoryId: CategoryId) => void
  onRemoveRule: (ruleId: string) => void
  onAssignTransaction: (
    transactionId: string,
    categoryId: CategoryId,
    pattern: string,
  ) => void
}) {
  const [patternDraft, setPatternDraft] = useState('')
  const [selectedTxId, setSelectedTxId] = useState('')
  const { learned, builtIn } = useMemo(
    () => rulesForCategory(categoryId, learnedRules),
    [categoryId, learnedRules],
  )

  const selectedTx = linkableTransactions.find((t) => t.id === selectedTxId)

  function submitPattern(e: React.FormEvent) {
    e.preventDefault()
    const pattern = normalizePattern(patternDraft)
    if (!pattern) return
    onAddRule(pattern, categoryId)
    setPatternDraft('')
  }

  function assignSelected() {
    if (!selectedTx) return
    const pattern =
      normalizePattern(patternDraft) ||
      normalizePattern(selectedTx.merchant)
    if (!pattern) return
    onAssignTransaction(selectedTx.id, categoryId, pattern)
    setSelectedTxId('')
    setPatternDraft('')
  }

  return (
    <div className="matcher-box">
      <div className="matcher-heading">
        <strong>Statement names for {categoryLabel}</strong>
        <p>
          Teach the app what this bill looks like on Amex/TD so future uploads
          land here automatically.
        </p>
      </div>

      {(learned.length > 0 || builtIn.length > 0) && (
        <ul className="matcher-list">
          {learned.map((rule) => (
            <li key={rule.id}>
              <code>{rule.pattern}</code>
              <span className="matcher-tag">yours</span>
              <button
                type="button"
                className="ghost danger"
                onClick={() => onRemoveRule(rule.id)}
              >
                Remove
              </button>
            </li>
          ))}
          {builtIn.map((rule) => (
            <li key={`built-${rule.pattern}`}>
              <code>{rule.pattern}</code>
              <span className="matcher-tag muted">built-in</span>
            </li>
          ))}
        </ul>
      )}

      <form className="matcher-form" onSubmit={submitPattern}>
        <label>
          Add statement name
          <input
            value={patternDraft}
            onChange={(e) => setPatternDraft(e.target.value)}
            placeholder="e.g. toyota, scotia auto, elexicon"
          />
        </label>
        <button
          type="submit"
          className="ghost"
          disabled={!normalizePattern(patternDraft)}
        >
          Save name
        </button>
      </form>

      {linkableTransactions.length > 0 ? (
        <div className="matcher-link">
          <label>
            Or assign an existing charge
            <select
              value={selectedTxId}
              onChange={(e) => {
                setSelectedTxId(e.target.value)
                const tx = linkableTransactions.find(
                  (t) => t.id === e.target.value,
                )
                if (tx && !patternDraft) {
                  setPatternDraft(tx.merchant)
                }
              }}
            >
              <option value="">Pick a transaction…</option>
              {linkableTransactions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.date} · {t.merchant} · {formatMoney(t.amount)}
                  {t.categoryId !== categoryId ? ` (${t.categoryId})` : ''}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="primary"
            disabled={!selectedTxId}
            onClick={assignSelected}
          >
            Assign to {categoryLabel}
          </button>
          {selectedTx && patternDraft ? (
            <p className="hint">
              Saves “{normalizePattern(patternDraft)}” as a match
              {linkableTransactions.some(
                (t) =>
                  t.id !== selectedTx.id &&
                  merchantMatchesPattern(t.merchant, patternDraft),
              )
                ? ' and moves other matching charges too'
                : ''}
              .
            </p>
          ) : null}
        </div>
      ) : (
        <p className="hint">
          Upload a statement first, then pick the bill charge from the list
          here.
        </p>
      )}
    </div>
  )
}
