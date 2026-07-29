import { useMemo, useState } from 'react'
import { ACCOUNTS, CATEGORIES, PEOPLE } from '../data/seed'
import { formatMoney } from '../lib/compute'
import { parseStatementCsv } from '../lib/parseCsv'
import {
  countNeedsReview,
  draftsFromParsed,
  type ReviewDraftRow,
} from '../lib/reviewDraft'
import type { AccountId, CategoryId, PersonId } from '../types'

interface ImportReviewQueueProps {
  onCommit: (rows: ReviewDraftRow[]) => void
}

export function ImportReviewQueue({ onCommit }: ImportReviewQueueProps) {
  const [personId, setPersonId] = useState<PersonId>('trevor')
  const [defaultAccountId, setDefaultAccountId] =
    useState<AccountId>('amex')
  const [drafts, setDrafts] = useState<ReviewDraftRow[]>([])
  const [bulkCategory, setBulkCategory] = useState<CategoryId | ''>('')
  const [fileName, setFileName] = useState<string>('')

  const included = useMemo(
    () => drafts.filter((d) => d.included),
    [drafts],
  )
  const needsReview = useMemo(() => countNeedsReview(drafts), [drafts])
  const importTotal = useMemo(
    () =>
      included.reduce(
        (sum, d) => sum + (d.isRefund ? -d.amount : d.amount),
        0,
      ),
    [included],
  )

  async function onFile(file: File | null) {
    if (!file) return
    const text = await file.text()
    const parsed = parseStatementCsv(text)
    setFileName(file.name)
    setDrafts(draftsFromParsed(parsed, personId, defaultAccountId))
  }

  function updateDraft(id: string, patch: Partial<ReviewDraftRow>) {
    setDrafts((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    )
  }

  function setAllIncluded(included: boolean) {
    setDrafts((prev) => prev.map((row) => ({ ...row, included })))
  }

  function applyDefaultAccountToIncluded() {
    setDrafts((prev) =>
      prev.map((row) =>
        row.included ? { ...row, accountId: defaultAccountId } : row,
      ),
    )
  }

  function applyBulkCategory() {
    if (!bulkCategory) return
    setDrafts((prev) =>
      prev.map((row) =>
        row.included ? { ...row, categoryId: bulkCategory } : row,
      ),
    )
  }

  function applyPersonToDrafts() {
    setDrafts((prev) => prev.map((row) => ({ ...row, personId })))
  }

  function clearQueue() {
    setDrafts([])
    setFileName('')
  }

  function commit() {
    const rows = drafts.filter((d) => d.included)
    if (rows.length === 0) return
    onCommit(rows)
    clearQueue()
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Upload & review</h2>
        <p>Fix categories before they hit the month totals</p>
      </div>

      <div className="upload-box">
        <p className="hint">
          CSV headers like <code>Date,Description,Amount</code>. Negative amounts
          and “refund/return” merchants are marked as refunds. Unmatched merchants
          land in <strong>Other</strong> so you can assign them here.
        </p>

        <div className="upload-controls">
          <label>
            Person
            <select
              value={personId}
              onChange={(e) => {
                const next = e.target.value as PersonId
                setPersonId(next)
                setDrafts((prev) =>
                  prev.map((row) => ({ ...row, personId: next })),
                )
              }}
            >
              {PEOPLE.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Default account
            <select
              value={defaultAccountId}
              onChange={(e) =>
                setDefaultAccountId(e.target.value as AccountId)
              }
            >
              {ACCOUNTS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              ))}
            </select>
          </label>

          <label>
            CSV file
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>

        {drafts.length === 0 ? (
          <p className="hint">No statement loaded yet.</p>
        ) : (
          <>
            <div className="review-toolbar">
              <div className="review-stats">
                <span>
                  <strong>{fileName}</strong> · {included.length}/{drafts.length}{' '}
                  included
                </span>
                <span>
                  Net selected:{' '}
                  <strong
                    className={importTotal >= 0 ? undefined : 'leftover good'}
                  >
                    {formatMoney(importTotal)}
                  </strong>
                </span>
                {needsReview > 0 ? (
                  <span className="review-pill">
                    {needsReview} need a look
                  </span>
                ) : (
                  <span className="review-pill good">All categorized</span>
                )}
              </div>

              <div className="review-actions">
                <button type="button" className="ghost" onClick={() => setAllIncluded(true)}>
                  Include all
                </button>
                <button type="button" className="ghost" onClick={() => setAllIncluded(false)}>
                  Exclude all
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={applyDefaultAccountToIncluded}
                >
                  Apply account
                </button>
                <button type="button" className="ghost" onClick={applyPersonToDrafts}>
                  Apply person
                </button>
                <label className="inline-label">
                  Bulk category
                  <select
                    value={bulkCategory}
                    onChange={(e) =>
                      setBulkCategory(e.target.value as CategoryId | '')
                    }
                  >
                    <option value="">Choose…</option>
                    {CATEGORIES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </label>
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
                    <th>Account</th>
                    <th>Category</th>
                    <th>Refund</th>
                    <th className="num">Amount</th>
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
                          {row.suggestedCategoryId !== row.categoryId ? (
                            <div className="preview-meta">
                              suggested:{' '}
                              {CATEGORIES.find(
                                (c) => c.id === row.suggestedCategoryId,
                              )?.label ?? row.suggestedCategoryId}
                            </div>
                          ) : null}
                        </td>
                        <td>
                          <select
                            value={row.accountId}
                            onChange={(e) =>
                              updateDraft(row.id, {
                                accountId: e.target.value as AccountId,
                              })
                            }
                          >
                            {ACCOUNTS.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <select
                            value={row.categoryId}
                            onChange={(e) =>
                              updateDraft(row.id, {
                                categoryId: e.target.value as CategoryId,
                              })
                            }
                          >
                            {CATEGORIES.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.label}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <input
                            type="checkbox"
                            checked={row.isRefund}
                            aria-label={`Refund ${row.merchant}`}
                            onChange={(e) =>
                              updateDraft(row.id, {
                                isRefund: e.target.checked,
                              })
                            }
                          />
                        </td>
                        <td className="num">
                          <input
                            className="cell-input amount-input"
                            type="number"
                            min="0"
                            step="0.01"
                            value={row.amount}
                            onChange={(e) =>
                              updateDraft(row.id, {
                                amount: Number(e.target.value) || 0,
                              })
                            }
                          />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="review-footer">
              <button type="button" className="ghost" onClick={clearQueue}>
                Clear queue
              </button>
              <button
                type="button"
                className="primary"
                disabled={included.length === 0}
                onClick={commit}
              >
                Import {included.length} transaction
                {included.length === 1 ? '' : 's'}
              </button>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
