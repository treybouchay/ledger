import { useMemo, useState } from 'react'
import { CategoryPicker } from './CategoryPicker'
import { formatMoney } from '../lib/compute'
import { CategoryLineIcon } from '../lib/categoryIcons'
import { categoryLabel } from '../lib/labels'
import {
  normalizePattern,
  type LearnedRule,
} from '../lib/learnedRules'
import { parseStatementFile } from '../lib/parseStatementFile'
import type { CategoryId } from '../types'

interface TrainRow {
  id: string
  date: string
  amount: number
  merchant: string
  categoryId: CategoryId
  suggestedCategoryId: CategoryId
  isRefund: boolean
  included: boolean
}

export function LearningPanel({
  learnedRules,
  onSaveLessons,
  onRemoveRule,
}: {
  learnedRules: LearnedRule[]
  onSaveLessons: (
    lessons: { pattern: string; categoryId: CategoryId }[],
  ) => number
  onRemoveRule: (ruleId: string) => void
}) {
  const [drafts, setDrafts] = useState<TrainRow[]>([])
  const [bulkCategory, setBulkCategory] = useState<CategoryId | ''>('')
  const [fileName, setFileName] = useState('')
  const [warning, setWarning] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)

  const included = useMemo(
    () => drafts.filter((d) => d.included),
    [drafts],
  )
  const teachable = useMemo(
    () =>
      included.filter(
        (d) =>
          d.categoryId !== 'other' && normalizePattern(d.merchant).length > 0,
      ),
    [included],
  )

  async function onFile(file: File | null) {
    if (!file) return
    setBusy(true)
    setError(null)
    setWarning(undefined)
    setSaveMessage(null)
    try {
      const { rows, warning: parseWarning } = await parseStatementFile(file)
      setFileName(file.name)
      setWarning(parseWarning)
      const stamp = Date.now()
      setDrafts(
        rows.map((row, i) => {
          const isRefund = row.amount < 0 || row.isRefund === true
          return {
            id: `train-${stamp}-${i}`,
            date: row.date,
            amount: Math.abs(row.amount),
            merchant: row.merchant,
            categoryId: row.suggestedCategoryId,
            suggestedCategoryId: row.suggestedCategoryId,
            isRefund,
            included: !row.likelyDeposit,
          }
        }),
      )
    } catch (err) {
      setDrafts([])
      setError(
        err instanceof Error
          ? err.message
          : 'Could not read that file. Try CSV if the PDF is a scan.',
      )
    } finally {
      setBusy(false)
    }
  }

  function updateDraft(id: string, patch: Partial<TrainRow>) {
    setDrafts((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    )
    setSaveMessage(null)
  }

  function setAllIncluded(next: boolean) {
    setDrafts((prev) => prev.map((row) => ({ ...row, included: next })))
    setSaveMessage(null)
  }

  function applyBulkCategory() {
    if (!bulkCategory) return
    setDrafts((prev) =>
      prev.map((row) =>
        row.included ? { ...row, categoryId: bulkCategory } : row,
      ),
    )
    setSaveMessage(null)
  }

  function clearQueue() {
    setDrafts([])
    setFileName('')
    setWarning(undefined)
    setError(null)
    setSaveMessage(null)
  }

  function saveLessons() {
    const lessons = teachable.map((row) => ({
      pattern: normalizePattern(row.merchant),
      categoryId: row.categoryId,
    }))
    const added = onSaveLessons(lessons)
    setSaveMessage(
      added === 0
        ? 'No new lessons — those patterns were already saved.'
        : `Saved ${added} lesson${added === 1 ? '' : 's'}. Future uploads will use them.`,
    )
  }

  const sortedRules = useMemo(
    () =>
      [...learnedRules].sort((a, b) =>
        a.pattern.localeCompare(b.pattern) ||
        a.categoryId.localeCompare(b.categoryId),
      ),
    [learnedRules],
  )

  return (
    <div className="layout">
      <div className="panel-header bare">
        <div>
          <h2>Learning</h2>
          <p>
            Teach merchant → category shortcuts so future uploads fill in
            themselves
          </p>
        </div>
      </div>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Train from a statement or screenshot</h2>
            <p>
              Upload a past file or account photo, assign categories, and save
              lessons — nothing is added to the ledger
            </p>
          </div>
        </div>

        <div className="upload-box">
          <p className="hint">
            Same parsers as Import charges (including OCR for screenshots).
            Assign real categories (not Other), then save so the next import
            auto-fills better.
          </p>

          <div className="upload-controls">
            <label>
              Past statement or screenshot
              <input
                type="file"
                accept=".csv,.txt,text/csv,text/plain,application/pdf,.pdf,image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif"
                disabled={busy}
                onChange={(e) => onFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>

          {busy ? <p className="hint">Reading file…</p> : null}
          {error ? <p className="form-error">{error}</p> : null}
          {warning ? <p className="hint">{warning}</p> : null}

          {drafts.length === 0 && !busy ? (
            <div className="empty-guide embedded">
              <p>
                Choose a past statement to practice. You’ll save merchant
                patterns — not transactions.
              </p>
            </div>
          ) : null}

          {drafts.length > 0 ? (
            <>
              <div className="review-toolbar">
                <div className="review-stats">
                  <span>
                    <strong>{fileName}</strong> · {included.length}/
                    {drafts.length} included
                  </span>
                  <span className="review-pill">
                    {teachable.length} ready to teach
                  </span>
                </div>

                <div className="review-actions">
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => setAllIncluded(true)}
                  >
                    Include all
                  </button>
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => setAllIncluded(false)}
                  >
                    Exclude all
                  </button>
                  <div className="bulk-category-picker">
                    <span>Bulk category</span>
                    <CategoryPicker
                      value={bulkCategory}
                      allowEmpty
                      emptyLabel="Choose…"
                      compact
                      aria-label="Bulk category"
                      onChange={setBulkCategory}
                    />
                  </div>
                  <button
                    type="button"
                    className="ghost"
                    disabled={!bulkCategory}
                    onClick={applyBulkCategory}
                  >
                    Apply category
                  </button>
                </div>
              </div>

              <div className="review-table-wrap">
                <table className="review-table">
                  <thead>
                    <tr>
                      <th>Keep</th>
                      <th>Date</th>
                      <th>Merchant</th>
                      <th>Category</th>
                      <th className="num col-amount">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {drafts.map((row) => {
                      const flagged =
                        row.included &&
                        (row.categoryId === 'other' ||
                          row.categoryId !== row.suggestedCategoryId)
                      return (
                        <tr
                          key={row.id}
                          className={[
                            !row.included ? 'excluded' : '',
                            flagged ? 'needs-review' : '',
                          ]
                            .filter(Boolean)
                            .join(' ')}
                        >
                          <td>
                            <input
                              type="checkbox"
                              checked={row.included}
                              aria-label={`Include ${row.merchant}`}
                              onChange={(e) =>
                                updateDraft(row.id, {
                                  included: e.target.checked,
                                })
                              }
                            />
                          </td>
                          <td>
                            <input
                              className="cell-input"
                              type="date"
                              value={row.date}
                              onChange={(e) =>
                                updateDraft(row.id, { date: e.target.value })
                              }
                            />
                          </td>
                          <td>
                            <input
                              className="cell-input merchant-input"
                              value={row.merchant}
                              onChange={(e) =>
                                updateDraft(row.id, {
                                  merchant: e.target.value,
                                })
                              }
                            />
                          </td>
                          <td className="category-cell">
                            <CategoryPicker
                              value={row.categoryId}
                              compact
                              aria-label={`Category for ${row.merchant}`}
                              onChange={(categoryId) => {
                                if (!categoryId) return
                                updateDraft(row.id, { categoryId })
                              }}
                            />
                          </td>
                          <td className="num col-amount">
                            {row.isRefund ? '−' : ''}
                            {formatMoney(row.amount)}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="review-footer">
                <button type="button" className="ghost" onClick={clearQueue}>
                  Clear
                </button>
                <button
                  type="button"
                  className="primary"
                  disabled={teachable.length === 0}
                  onClick={saveLessons}
                >
                  Save {teachable.length} lesson
                  {teachable.length === 1 ? '' : 's'}
                </button>
              </div>
              {saveMessage ? <p className="hint">{saveMessage}</p> : null}
            </>
          ) : null}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Saved lessons</h2>
            <p>
              {sortedRules.length === 0
                ? 'No lessons yet — train from a past statement above'
                : `${sortedRules.length} merchant pattern${sortedRules.length === 1 ? '' : 's'} remembered in this browser`}
            </p>
          </div>
        </div>
        {sortedRules.length > 0 ? (
          <ul className="matcher-list learning-rules-list">
            {sortedRules.map((rule) => (
              <li key={rule.id}>
                <code>{rule.pattern}</code>
                <span className="matcher-tag">
                  <CategoryLineIcon categoryId={rule.categoryId} size={13} />{' '}
                  {categoryLabel(rule.categoryId)}
                </span>
                <button
                  type="button"
                  className="ghost danger"
                  onClick={() => onRemoveRule(rule.id)}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="empty-guide embedded">
            <p>
              Lessons appear here after you save them. They auto-suggest
              categories on the next upload.
            </p>
          </div>
        )}
      </section>
    </div>
  )
}
