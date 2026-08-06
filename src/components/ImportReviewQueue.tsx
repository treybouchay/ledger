import { useMemo, useState } from 'react'
import { PEOPLE } from '../data/seed'
import { CategoryPicker } from './CategoryPicker'
import { accountLabel, accountOptionLabel } from '../lib/labels'
import { formatMoney } from '../lib/compute'
import { confirmRemove } from '../lib/confirm'
import {
  accountsForPerson,
  resolveAccountForPerson,
} from '../lib/customAccounts'
import { parseStatementFile } from '../lib/parseStatementFile'
import { isImageMime } from '../lib/statementFiles'
import {
  countDuplicates,
  countNeedsReview,
  draftsFromParsed,
  filterByNeedsLook,
  rowNeedsReview,
  type NeedsLookFilter,
  type ReviewDraftRow,
} from '../lib/reviewDraft'
import type { AccountId, CategoryId, PersonId, Transaction } from '../types'

const STATEMENT_ACCEPT =
  '.csv,.txt,text/csv,text/plain,application/pdf,.pdf'
const SCREENSHOT_ACCEPT =
  'image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif'

export interface ImportCommitMeta {
  fileName: string
  personId: PersonId
  /** Original upload — persisted to IndexedDB on commit for View statement. */
  file: File | null
  /** Rows in the review queue (parsed). */
  totalParsed: number
  /** Unchecked rows marked duplicate. */
  skippedDuplicates: number
  /** Unchecked for any other reason (deposits, manual). */
  skippedOther: number
  /** Statement PDF/CSV vs phone screenshot OCR. */
  sourceKind?: 'statement' | 'screenshot'
}

interface ImportReviewQueueProps {
  existingTransactions: Transaction[]
  onCommit: (
    rows: ReviewDraftRow[],
    meta: ImportCommitMeta,
  ) => void | Promise<void>
}

export function ImportReviewQueue({
  existingTransactions,
  onCommit,
}: ImportReviewQueueProps) {
  const [personId, setPersonId] = useState<PersonId>('trevor')
  const [defaultAccountId, setDefaultAccountId] =
    useState<AccountId>('amex')
  const [drafts, setDrafts] = useState<ReviewDraftRow[]>([])
  const [bulkCategory, setBulkCategory] = useState<CategoryId | ''>('')
  const [fileName, setFileName] = useState('')
  const [sourceFile, setSourceFile] = useState<File | null>(null)
  const [warning, setWarning] = useState<string | undefined>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [needsLookFilter, setNeedsLookFilter] =
    useState<NeedsLookFilter>('all')
  const [detectionNote, setDetectionNote] = useState<string | undefined>()
  const [personSource, setPersonSource] = useState<'detected' | 'manual'>(
    'manual',
  )
  const [busyLabel, setBusyLabel] = useState('Reading file…')
  const [sourceKind, setSourceKind] = useState<
    'statement' | 'screenshot' | undefined
  >()
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const included = useMemo(
    () => drafts.filter((d) => d.included),
    [drafts],
  )
  const needsReview = useMemo(() => countNeedsReview(drafts), [drafts])
  const duplicateCount = useMemo(() => countDuplicates(drafts), [drafts])
  const visibleDrafts = useMemo(
    () => filterByNeedsLook(drafts, needsLookFilter),
    [drafts, needsLookFilter],
  )
  const importTotal = useMemo(
    () =>
      included.reduce(
        (sum, d) => sum + (d.isRefund ? -d.amount : d.amount),
        0,
      ),
    [included],
  )
  const excludedCount = drafts.length - included.length
  const depositExcluded = useMemo(
    () =>
      drafts.filter(
        (d) => !d.included && /deposit|transfer in/i.test(d.matchReason ?? ''),
      ).length,
    [drafts],
  )
  const monthLanding = useMemo(() => {
    const counts = new Map<string, number>()
    for (const row of included) {
      const id = row.date.slice(0, 7)
      if (!/^\d{4}-\d{2}$/.test(id)) continue
      counts.set(id, (counts.get(id) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [included])

  const personName =
    PEOPLE.find((p) => p.id === personId)?.name ?? personId
  const personAccounts = accountsForPerson(personId)
  const accountName = accountLabel(defaultAccountId)
  const draftsPersonMismatch = useMemo(
    () => drafts.some((d) => d.personId !== personId),
    [drafts, personId],
  )

  function monthLabelShort(id: string): string {
    const [y, m] = id.split('-').map(Number)
    if (!y || !m) return id
    return new Date(y, m - 1, 1).toLocaleString('en-US', {
      month: 'short',
      year: 'numeric',
    })
  }

  function rebuildDrafts(
    rows: Parameters<typeof draftsFromParsed>[0],
    nextPerson: PersonId,
    nextAccount: AccountId,
  ) {
    setDrafts(
      draftsFromParsed(rows, nextPerson, nextAccount, existingTransactions),
    )
  }

  async function onFile(file: File | null) {
    if (!file) return
    const asScreenshot = isImageMime(file.type, file.name)
    setBusy(true)
    setBusyLabel(
      asScreenshot ? 'Reading screenshot (OCR)…' : 'Reading statement…',
    )
    setError(null)
    setWarning(undefined)
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return asScreenshot ? URL.createObjectURL(file) : null
    })
    try {
      const result = await parseStatementFile(file, {
        onOcrProgress: (status, progress) => {
          const pct = Math.round(progress * 100)
          setBusyLabel(
            pct > 0
              ? `OCR ${pct}% — ${status}`
              : `Reading screenshot — ${status}`,
          )
        },
      })
      const {
        rows,
        warning: parseWarning,
        detectedPersonId,
        detectionNote: note,
        suggestedAccountId,
        sourceKind: kind,
      } = result

      setFileName(file.name)
      setSourceFile(file)
      setSourceKind(kind ?? (asScreenshot ? 'screenshot' : 'statement'))
      setWarning(parseWarning)
      setNeedsLookFilter('all')

      const nextPerson = detectedPersonId ?? personId
      const nextAccount = resolveAccountForPerson(
        suggestedAccountId ?? defaultAccountId,
        nextPerson,
      )
      setPersonId(nextPerson)
      setDefaultAccountId(nextAccount)
      if (detectedPersonId) {
        setPersonSource('detected')
        setDetectionNote(note)
      } else {
        setPersonSource('manual')
        setDetectionNote(undefined)
      }
      rebuildDrafts(rows, nextPerson, nextAccount)
    } catch (err) {
      setDrafts([])
      setSourceFile(null)
      setSourceKind(undefined)
      setDetectionNote(undefined)
      setPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return null
      })
      setError(
        err instanceof Error
          ? err.message
          : 'Could not read that file. Try CSV if the PDF is a scan, or a clearer screenshot.',
      )
    } finally {
      setBusy(false)
    }
  }

  function updateDraft(id: string, patch: Partial<ReviewDraftRow>) {
    setDrafts((prev) =>
      prev.map((row) => (row.id === id ? { ...row, ...patch } : row)),
    )
  }

  function setAllIncluded(next: boolean) {
    setDrafts((prev) => prev.map((row) => ({ ...row, included: next })))
  }

  function excludeDuplicates() {
    setDrafts((prev) =>
      prev.map((row) =>
        row.matchStatus === 'duplicate' ? { ...row, included: false } : row,
      ),
    )
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

  /** Rematch duplicates after person changes (same merchant+amount for Kate ≠ Trevor). */
  function rematchPersonOnDrafts(
    rows: ReviewDraftRow[],
    nextPerson: PersonId,
  ): ReviewDraftRow[] {
    return rows.map((row) => {
      if (row.personId === nextPerson) return row
      const rematch = draftsFromParsed(
        [
          {
            date: row.date,
            amount: row.isRefund ? -row.amount : row.amount,
            merchant: row.merchant,
            suggestedCategoryId: row.suggestedCategoryId,
            suggestedAccountId: row.accountId,
            isRefund: row.isRefund,
          },
        ],
        nextPerson,
        row.accountId,
        existingTransactions,
      )[0]
      return {
        ...row,
        personId: nextPerson,
        matchStatus: rematch.matchStatus,
        matchedTransactionId: rematch.matchedTransactionId,
        matchReason: rematch.matchReason,
        included:
          rematch.matchStatus === 'duplicate' ? false : row.included,
      }
    })
  }

  function changePerson(next: PersonId) {
    setPersonId(next)
    setPersonSource('manual')
    setDetectionNote(undefined)
    const nextAccount = resolveAccountForPerson(defaultAccountId, next)
    setDefaultAccountId(nextAccount)
    if (drafts.length > 0) {
      setDrafts((prev) =>
        rematchPersonOnDrafts(prev, next).map((row) => ({
          ...row,
          accountId: resolveAccountForPerson(row.accountId, next),
        })),
      )
    }
  }

  function changeDefaultAccount(next: AccountId) {
    setDefaultAccountId(next)
  }

  function removeDraft(id: string) {
    setDrafts((prev) => prev.filter((row) => row.id !== id))
  }

  function addManualRow() {
    const today = new Date()
    const y = today.getFullYear()
    const m = String(today.getMonth() + 1).padStart(2, '0')
    const d = String(today.getDate()).padStart(2, '0')
    const id = `draft-manual-${Date.now()}`
    setDrafts((prev) => [
      ...prev,
      {
        id,
        date: `${y}-${m}-${d}`,
        amount: 0,
        merchant: '',
        categoryId: 'other',
        accountId: defaultAccountId,
        personId,
        isRefund: false,
        included: true,
        suggestedCategoryId: 'other',
        matchStatus: 'new',
        matchReason: 'Added manually',
      },
    ])
    setNeedsLookFilter('all')
    if (!fileName) setFileName('Manual entry')
  }

  function clearQueue() {
    setDrafts([])
    setFileName('')
    setSourceFile(null)
    setSourceKind(undefined)
    setWarning(undefined)
    setError(null)
    setNeedsLookFilter('all')
    setDetectionNote(undefined)
    setPersonSource('manual')
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev)
      return null
    })
  }

  async function commit() {
    const rows = drafts.filter((d) => d.included)
    if (rows.length === 0) return

    // Ensure every included row carries the picker person (banner choice wins).
    const stamped = rematchPersonOnDrafts(rows, personId)

    const skippedDuplicates = drafts.filter(
      (d) => !d.included && d.matchStatus === 'duplicate',
    ).length
    const excluded = drafts.length - stamped.length
    const skippedOther = excluded - skippedDuplicates
    if (excluded > 0) {
      const deposits = drafts.filter(
        (d) => !d.included && d.matchReason?.toLowerCase().includes('deposit'),
      ).length
      const parts: string[] = []
      if (skippedDuplicates > 0)
        parts.push(
          `${skippedDuplicates} duplicate${skippedDuplicates === 1 ? '' : 's'}`,
        )
      if (deposits > 0)
        parts.push(`${deposits} deposit${deposits === 1 ? '' : 's'}`)
      const other = skippedOther - deposits
      if (other > 0) parts.push(`${other} unchecked`)
      const ok = confirmRemove(
        `Import ${stamped.length} of ${drafts.length} rows?\n\n${excluded} will be skipped (${parts.join(', ') || 'unchecked'}).\n\nThese will post as ${personName}'s expenses (${accountName}).\n\nCancel to go back and use Include all, or re-check rows you want.`,
      )
      if (!ok) return
    }
    const monthCounts = new Map<string, number>()
    for (const row of stamped) {
      const m = row.date.slice(0, 7)
      if (!m) continue
      monthCounts.set(m, (monthCounts.get(m) ?? 0) + 1)
    }
    if (monthCounts.size > 1) {
      const breakdown = [...monthCounts.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([m, n]) => `${n} → ${m}`)
        .join(', ')
      const ok = confirmRemove(
        `These charges span multiple months (${breakdown}).\n\nEach charge posts to the month of its transaction date — not a single statement month. Continue?`,
      )
      if (!ok) return
    }
    const file = sourceFile
    const name = fileName || (sourceKind === 'screenshot' ? 'Screenshot' : 'Statement')
    await onCommit(stamped, {
      fileName: name,
      personId,
      file,
      totalParsed: drafts.length,
      skippedDuplicates,
      skippedOther,
      sourceKind,
    })
    clearQueue()
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Review &amp; add</h2>
          <p>
            Choose whose account, check categories, then add selected charges
            to the ledger
          </p>
        </div>
      </div>

      <div className="upload-box">
        <p className="hint">
          Upload a bank PDF/CSV or a phone screenshot of your activity list.
          Screenshots use on-device OCR — review every row (you can add or remove
          rows below). Already-logged charges show as duplicates and stay
          unchecked.
        </p>

        <div className="upload-controls">
          <label>
            Whose statement?
            <select
              value={personId}
              onChange={(e) => changePerson(e.target.value as PersonId)}
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
                changeDefaultAccount(e.target.value as AccountId)
              }
            >
              {personAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {accountOptionLabel(a.id)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="import-source-grid">
          <div className="import-source-card">
            <h3>Bank statement</h3>
            <p className="hint">PDF or CSV from Amex, TD, or your bank export</p>
            <label className="import-file-label">
              Choose statement
              <input
                type="file"
                accept={STATEMENT_ACCEPT}
                disabled={busy}
                onChange={(e) => {
                  void onFile(e.target.files?.[0] ?? null)
                  e.target.value = ''
                }}
              />
            </label>
          </div>
          <div className="import-source-card">
            <h3>Account screenshot</h3>
            <p className="hint">
              Photo of your activity list — OCR reads charges on-device
            </p>
            <label className="import-file-label">
              Choose screenshot
              <input
                type="file"
                accept={SCREENSHOT_ACCEPT}
                disabled={busy}
                onChange={(e) => {
                  void onFile(e.target.files?.[0] ?? null)
                  e.target.value = ''
                }}
              />
            </label>
          </div>
        </div>

        {busy ? <p className="hint">{busyLabel}</p> : null}
        {error ? <p className="form-error">{error}</p> : null}
        {warning ? <p className="hint">{warning}</p> : null}

        {previewUrl ? (
          <div className="screenshot-preview">
            <img src={previewUrl} alt={`Uploaded ${fileName || 'screenshot'}`} />
          </div>
        ) : null}

        {drafts.length === 0 && !busy ? (
          <div className="empty-guide embedded">
            <p>
              Pick a statement or screenshot above to start. Or{' '}
              <button type="button" className="linkish" onClick={addManualRow}>
                add a row manually
              </button>
              .
            </p>
          </div>
        ) : null}

        {drafts.length > 0 ? (
          <>
            <div
              className="statement-owner-banner"
              role="status"
              aria-live="polite"
            >
              <p>
                These charges will post to{' '}
                <strong>{personName}</strong>
                {' · '}
                <strong>{accountName}</strong>
              </p>
              <p className="statement-owner-meta">
                {personSource === 'detected' && detectionNote
                  ? `Detected: ${detectionNote}. Change “Whose statement?” anytime.`
                  : 'Set with the picker above — applies to every row on import.'}
                {draftsPersonMismatch
                  ? ' Updating person rematches duplicates for that person.'
                  : null}
              </p>
            </div>

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
                {monthLanding.length > 0 ? (
                  <span>
                    Posts to{' '}
                    {monthLanding
                      .map(([id, n]) => `${monthLabelShort(id)} (${n})`)
                      .join(', ')}
                  </span>
                ) : null}
                {duplicateCount > 0 ? (
                  <span className="review-pill muted">
                    {duplicateCount} duplicate
                    {duplicateCount === 1 ? '' : 's'}
                  </span>
                ) : null}
                {excludedCount > 0 ? (
                  <span className="review-pill muted">
                    {excludedCount} excluded
                    {depositExcluded > 0
                      ? ` (${depositExcluded} deposit${depositExcluded === 1 ? '' : 's'})`
                      : ''}{' '}
                    — won’t import unless checked
                  </span>
                ) : null}
                {needsReview > 0 ? (
                  <span className="review-pill">
                    {needsReview} need a look
                  </span>
                ) : (
                  <span className="review-pill good">Ready to import</span>
                )}
              </div>

              <div
                className="review-filter"
                role="group"
                aria-label="Filter by need a look"
              >
                {(
                  [
                    { id: 'all', label: 'All' },
                    { id: 'needs_look', label: 'Need a look' },
                    { id: 'hide_needs_look', label: 'Hide need a look' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={
                      needsLookFilter === opt.id
                        ? 'review-filter-chip active'
                        : 'review-filter-chip'
                    }
                    aria-pressed={needsLookFilter === opt.id}
                    onClick={() => setNeedsLookFilter(opt.id)}
                  >
                    {opt.label}
                    {opt.id === 'needs_look' && needsReview > 0
                      ? ` (${needsReview})`
                      : null}
                  </button>
                ))}
                {needsLookFilter !== 'all' ? (
                  <span className="review-filter-meta">
                    Showing {visibleDrafts.length} of {drafts.length}
                  </span>
                ) : null}
              </div>

              <div className="review-actions">
                <button
                  type="button"
                  className="ghost"
                  onClick={addManualRow}
                >
                  Add row
                </button>
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
                <button
                  type="button"
                  className="ghost"
                  onClick={excludeDuplicates}
                >
                  Exclude duplicates
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={applyDefaultAccountToIncluded}
                >
                  Apply account
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

            <div className="review-card-list" role="list">
              {visibleDrafts.length === 0 ? (
                <p className="review-filter-empty">No rows match this filter.</p>
              ) : (
                visibleDrafts.map((row) => {
                  const flagged = rowNeedsReview(row)
                  return (
                    <article
                      key={row.id}
                      role="listitem"
                      className={[
                        'review-card',
                        !row.included ? 'excluded' : '',
                        flagged ? 'needs-review' : '',
                        row.matchStatus === 'duplicate' ? 'is-duplicate' : '',
                        row.matchStatus === 'possible' ? 'is-possible' : '',
                      ]
                        .filter(Boolean)
                        .join(' ')}
                    >
                      <header className="review-card-top">
                        <label className="review-card-keep">
                          <input
                            type="checkbox"
                            checked={row.included}
                            aria-label={`Include ${row.merchant || 'row'}`}
                            onChange={(e) =>
                              updateDraft(row.id, {
                                included: e.target.checked,
                              })
                            }
                          />
                          <span>Keep</span>
                        </label>
                        <span className={`match-tag ${row.matchStatus}`}>
                          {row.matchStatus}
                        </span>
                        <button
                          type="button"
                          className="ghost danger compact review-remove-btn"
                          aria-label={`Remove ${row.merchant || 'row'}`}
                          title="Remove this row"
                          onClick={() => removeDraft(row.id)}
                        >
                          ✕
                        </button>
                      </header>

                      <div className="review-card-main">
                        <label className="review-field review-field-merchant">
                          <span>Merchant</span>
                          <input
                            className="cell-input merchant-input"
                            value={row.merchant}
                            onChange={(e) =>
                              updateDraft(row.id, {
                                merchant: e.target.value,
                              })
                            }
                          />
                        </label>
                        <label className="review-field review-field-amount">
                          <span>Amount</span>
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
                        </label>
                      </div>

                      <div className="review-card-meta">
                        <label className="review-field">
                          <span>Date</span>
                          <input
                            className="cell-input"
                            type="date"
                            value={row.date}
                            onChange={(e) =>
                              updateDraft(row.id, { date: e.target.value })
                            }
                          />
                        </label>
                        <label className="review-field">
                          <span>Account</span>
                          <select
                            value={row.accountId}
                            onChange={(e) =>
                              updateDraft(row.id, {
                                accountId: e.target.value as AccountId,
                              })
                            }
                          >
                            {personAccounts.map((a) => (
                              <option key={a.id} value={a.id}>
                                {accountOptionLabel(a.id)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="review-card-refund">
                          <input
                            type="checkbox"
                            checked={row.isRefund}
                            aria-label={`Refund ${row.merchant || 'row'}`}
                            onChange={(e) =>
                              updateDraft(row.id, {
                                isRefund: e.target.checked,
                              })
                            }
                          />
                          <span>Refund</span>
                        </label>
                      </div>

                      <label className="review-field review-field-category">
                        <span>Category</span>
                        <CategoryPicker
                          value={row.categoryId}
                          compact
                          aria-label={`Category for ${row.merchant || 'row'}`}
                          onChange={(categoryId) => {
                            if (!categoryId) return
                            updateDraft(row.id, { categoryId })
                          }}
                        />
                      </label>

                      {row.matchReason ? (
                        <p className="preview-meta review-card-reason">
                          {row.matchReason}
                        </p>
                      ) : null}
                    </article>
                  )
                })
              )}
            </div>

            <div className="review-footer">
              <div className="review-footer-left">
                <button
                  type="button"
                  className="ghost"
                  onClick={addManualRow}
                >
                  Add row
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    const ok = confirmRemove(
                      'Clear the review queue? Unsaved statement rows will be discarded.',
                    )
                    if (!ok) return
                    clearQueue()
                  }}
                >
                  Clear queue
                </button>
              </div>
              <button
                type="button"
                className="primary"
                disabled={included.length === 0}
                onClick={commit}
              >
                Import {included.length} as {personName}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </section>
  )
}
