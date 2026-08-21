import { useEffect, useMemo, useState } from 'react'
import { PEOPLE } from '../data/seed'
import { CategoryPicker } from './CategoryPicker'
import {
  accountOptionLabel,
  personOptionLabel,
} from '../lib/labels'
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
  /** Every uploaded file (a screenshot batch keeps all pages browsable). */
  files?: File[]
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
  const [sourceFiles, setSourceFiles] = useState<File[]>([])
  const [parsedRows, setParsedRows] = useState<
    Parameters<typeof draftsFromParsed>[0]
  >([])
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
  const [previewUrls, setPreviewUrls] = useState<string[]>([])
  /** Which uploaded screenshot is open in the full-size viewer. */
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  /** Review rows narrowed to one screenshot (`all` shows every source). */
  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const [pendingUpload, setPendingUpload] = useState<
    | {
        kind: 'statement'
        file: File
      }
    | {
        kind: 'screenshot'
        files: File[]
        mode: 'replace' | 'append'
      }
    | null
  >(null)

  useEffect(() => {
    if (viewerIndex == null) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setViewerIndex(null)
      if (e.key === 'ArrowRight') stepViewer(1)
      if (e.key === 'ArrowLeft') stepViewer(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewerIndex, previewUrls.length])

  const included = useMemo(
    () => drafts.filter((d) => d.included),
    [drafts],
  )
  const needsReview = useMemo(() => countNeedsReview(drafts), [drafts])
  const duplicateCount = useMemo(() => countDuplicates(drafts), [drafts])
  const visibleDrafts = useMemo(() => {
    const byLook = filterByNeedsLook(drafts, needsLookFilter)
    if (sourceFilter === 'all') return byLook
    return byLook.filter((d) => d.sourceLabel === sourceFilter)
  }, [drafts, needsLookFilter, sourceFilter])
  /** Parsed-row count per uploaded screenshot, for thumbnail captions. */
  const rowsPerSource = useMemo(() => {
    const counts = new Map<string, number>()
    for (const row of drafts) {
      if (!row.sourceLabel) continue
      counts.set(row.sourceLabel, (counts.get(row.sourceLabel) ?? 0) + 1)
    }
    return counts
  }, [drafts])
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

  const personDisplay = personOptionLabel(personId)
  const personAccounts = accountsForPerson(personId)
  const accountDisplay = accountOptionLabel(defaultAccountId)
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
    setParsedRows(rows)
    setDrafts(
      draftsFromParsed(rows, nextPerson, nextAccount, existingTransactions),
    )
  }

  function revokePreviewUrls(urls: string[]) {
    for (const url of urls) URL.revokeObjectURL(url)
  }

  function stepViewer(delta: number) {
    setViewerIndex((current) => {
      if (current == null || previewUrls.length === 0) return current
      const next = (current + delta + previewUrls.length) % previewUrls.length
      return next
    })
  }

  function labelForFiles(files: File[]): string {
    if (files.length === 0) return ''
    if (files.length === 1) return files[0].name
    if (files.length <= 3) return files.map((f) => f.name).join(' + ')
    return `${files.length} screenshots (${files[0].name} + ${files.length - 1} more)`
  }

  function requestStatementUpload(file: File | null) {
    if (!file) return
    setPendingUpload({ kind: 'statement', file })
  }

  function requestScreenshotUpload(
    fileList: FileList | File[] | null,
    mode: 'replace' | 'append' = 'replace',
  ) {
    const incoming = Array.from(fileList ?? []).filter((f) =>
      isImageMime(f.type, f.name),
    )
    if (incoming.length === 0) return
    // Adding more screenshots to an open queue already chose person/account.
    if (mode === 'append' && sourceKind === 'screenshot' && drafts.length > 0) {
      void onScreenshotFiles(incoming, 'append')
      return
    }
    setPendingUpload({ kind: 'screenshot', files: incoming, mode: 'replace' })
  }

  function cancelPendingUpload() {
    setPendingUpload(null)
  }

  function confirmPendingUpload() {
    if (!pendingUpload) return
    const next = pendingUpload
    setPendingUpload(null)
    if (next.kind === 'statement') {
      void onStatementFile(next.file)
      return
    }
    void onScreenshotFiles(next.files, next.mode)
  }

  async function onStatementFile(file: File | null) {
    if (!file) return
    setBusy(true)
    setBusyLabel('Reading statement…')
    setError(null)
    setWarning(undefined)
    setPreviewUrls((prev) => {
      revokePreviewUrls(prev)
      return []
    })
    try {
      const result = await parseStatementFile(file)
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
      setSourceFiles([file])
      setSourceKind(kind ?? 'statement')
      setWarning(parseWarning)
      setNeedsLookFilter('all')
      setSourceFilter('all')
      setViewerIndex(null)

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
      setParsedRows([])
      setSourceFile(null)
      setSourceFiles([])
      setSourceKind(undefined)
      setDetectionNote(undefined)
      setError(
        err instanceof Error
          ? err.message
          : 'Could not read that file. Try CSV if the PDF is a scan, or a clearer screenshot.',
      )
    } finally {
      setBusy(false)
    }
  }

  async function onScreenshotFiles(
    fileList: FileList | File[] | null,
    mode: 'replace' | 'append' = 'replace',
  ) {
    const incoming = Array.from(fileList ?? []).filter((f) =>
      isImageMime(f.type, f.name),
    )
    if (incoming.length === 0) return

    const append = mode === 'append' && sourceKind === 'screenshot'
    setBusy(true)
    setError(null)
    if (!append) setWarning(undefined)

    const total = incoming.length
    setBusyLabel(
      total === 1
        ? 'Reading screenshot (OCR)…'
        : `Reading screenshots (OCR) 1/${total}…`,
    )

    try {
      const collected: Parameters<typeof draftsFromParsed>[0] = []
      const warnings: string[] = []
      let detectedPersonId: PersonId | undefined
      let detectionNoteLocal: string | undefined
      let suggestedAccountId: AccountId | undefined
      // Amex/TD lists are newest-first; carry the last (oldest) charge date into
      // the next screenshot so mid-scroll pages don’t get stamped as today.
      let carryDate: string | null = null

      for (let i = 0; i < incoming.length; i += 1) {
        const file = incoming[i]
        setBusyLabel(
          total === 1
            ? 'Reading screenshot (OCR)…'
            : `Reading screenshots (OCR) ${i + 1}/${total}…`,
        )
        const result = await parseStatementFile(file, {
          initialDate: carryDate,
          onOcrProgress: (status, progress) => {
            const pct = Math.round(progress * 100)
            const prefix =
              total === 1
                ? 'Reading screenshot'
                : `Screenshot ${i + 1}/${total}`
            setBusyLabel(
              pct > 0
                ? `${prefix} — OCR ${pct}% — ${status}`
                : `${prefix} — ${status}`,
            )
          },
        })
        collected.push(
          ...result.rows.map((row) => ({
            ...row,
            sourceLabel: row.sourceLabel ?? file.name,
          })),
        )
        if (result.rows.length > 0) {
          const last = result.rows[result.rows.length - 1]?.date?.slice(0, 10)
          if (last && /^\d{4}-\d{2}-\d{2}$/.test(last)) carryDate = last
        }
        if (result.warning) {
          warnings.push(
            total === 1 ? result.warning : `${file.name}: ${result.warning}`,
          )
        }
        if (!detectedPersonId && result.detectedPersonId) {
          detectedPersonId = result.detectedPersonId
          detectionNoteLocal = result.detectionNote
        }
        if (!suggestedAccountId && result.suggestedAccountId) {
          suggestedAccountId = result.suggestedAccountId
        }
      }

      const nextFiles = append ? [...sourceFiles, ...incoming] : incoming
      const nextRows = append ? [...parsedRows, ...collected] : collected
      const nextPreviews = nextFiles.map((f) => URL.createObjectURL(f))

      setPreviewUrls((prev) => {
        revokePreviewUrls(prev)
        return nextPreviews
      })
      setSourceFiles(nextFiles)
      setSourceFile(nextFiles[0] ?? null)
      setFileName(labelForFiles(nextFiles))
      setSourceKind('screenshot')
      setWarning(
        warnings.length > 0
          ? warnings.join(' ')
          : nextFiles.length > 1
            ? `OCR’d ${nextRows.length} charge${nextRows.length === 1 ? '' : 's'} from ${nextFiles.length} screenshots — review every amount and date.`
            : undefined,
      )
      setNeedsLookFilter('all')
      setSourceFilter('all')
      setViewerIndex(null)

      if (append) {
        rebuildDrafts(nextRows, personId, defaultAccountId)
      } else {
        const nextPerson = detectedPersonId ?? personId
        const nextAccount = resolveAccountForPerson(
          suggestedAccountId ?? defaultAccountId,
          nextPerson,
        )
        setPersonId(nextPerson)
        setDefaultAccountId(nextAccount)
        if (detectedPersonId) {
          setPersonSource('detected')
          setDetectionNote(detectionNoteLocal)
        } else {
          setPersonSource('manual')
          setDetectionNote(undefined)
        }
        rebuildDrafts(nextRows, nextPerson, nextAccount)
      }
    } catch (err) {
      if (!append) {
        setDrafts([])
        setParsedRows([])
        setSourceFile(null)
        setSourceFiles([])
        setSourceKind(undefined)
        setDetectionNote(undefined)
        setPreviewUrls((prev) => {
          revokePreviewUrls(prev)
          return []
        })
      }
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
        sourceLabel: row.sourceLabel,
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
    setParsedRows([])
    setFileName('')
    setSourceFile(null)
    setSourceFiles([])
    setSourceKind(undefined)
    setWarning(undefined)
    setError(null)
    setNeedsLookFilter('all')
    setSourceFilter('all')
    setViewerIndex(null)
    setDetectionNote(undefined)
    setPersonSource('manual')
    setPreviewUrls((prev) => {
      revokePreviewUrls(prev)
      return []
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
        `Import ${stamped.length} of ${drafts.length} rows?\n\n${excluded} will be skipped (${parts.join(', ') || 'unchecked'}).\n\nThese will post as ${personDisplay} · ${accountDisplay}.\n\nCancel to go back and use Include all, or re-check rows you want.`,
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
    const name =
      fileName ||
      (sourceKind === 'screenshot'
        ? sourceFiles.length > 1
          ? `${sourceFiles.length} screenshots`
          : 'Screenshot'
        : 'Statement')
    await onCommit(stamped, {
      fileName: name,
      personId,
      file,
      files: sourceFiles.length > 0 ? sourceFiles : file ? [file] : [],
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

      {pendingUpload ? (
        <div
          className="cash-link-modal-backdrop"
          role="presentation"
          onClick={cancelPendingUpload}
        >
          <div
            className="cash-link-modal upload-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="upload-confirm-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="cash-link-modal-header">
              <div>
                <h3 id="upload-confirm-title">Confirm upload</h3>
                <p>
                  {pendingUpload.kind === 'statement'
                    ? `Statement: ${pendingUpload.file.name}`
                    : pendingUpload.files.length === 1
                      ? `Screenshot: ${pendingUpload.files[0].name}`
                      : `${pendingUpload.files.length} screenshots`}
                </p>
              </div>
              <button
                type="button"
                className="ghost"
                onClick={cancelPendingUpload}
              >
                Cancel
              </button>
            </div>
            <div className="cash-link-modal-body upload-confirm-body">
              <p className="hint">
                Charges will post to this person and account. You can still
                change them after OCR / parse if needed.
              </p>
              <label>
                Profile
                <select
                  value={personId}
                  onChange={(e) => changePerson(e.target.value as PersonId)}
                >
                  {PEOPLE.map((p) => (
                    <option key={p.id} value={p.id}>
                      {personOptionLabel(p.id)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Account
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
              <p className="upload-confirm-summary" role="status">
                Uploading to <strong>{personDisplay}</strong>
                {' · '}
                <strong>{accountDisplay}</strong>
              </p>
            </div>
            <div className="cash-link-modal-actions">
              <button
                type="button"
                className="ghost"
                onClick={cancelPendingUpload}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                onClick={confirmPendingUpload}
              >
                Continue upload
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="upload-box">
        <p className="hint">
          Upload a bank PDF/CSV or phone screenshots of your activity list.
          Screenshots use on-device OCR — you can select several at once or add
          more after the first. Review every row (add or remove below).
          Already-logged charges show as duplicates and stay unchecked.
        </p>

        <div className="import-source-grid">
          <div className="import-source-card">
            <h3>Account screenshots</h3>
            <p className="hint">
              Photos of your activity list — OCR reads charges on-device.
              Select multiple, or add more after the first.
            </p>
            <label className="import-file-label">
              {sourceKind === 'screenshot' && drafts.length > 0
                ? 'Add screenshots'
                : 'Choose screenshots'}
              <input
                type="file"
                accept={SCREENSHOT_ACCEPT}
                multiple
                disabled={busy}
                onChange={(e) => {
                  const files = e.target.files
                  requestScreenshotUpload(
                    files,
                    sourceKind === 'screenshot' && drafts.length > 0
                      ? 'append'
                      : 'replace',
                  )
                  e.target.value = ''
                }}
              />
            </label>
          </div>
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
                  requestStatementUpload(e.target.files?.[0] ?? null)
                  e.target.value = ''
                }}
              />
            </label>
          </div>
        </div>

        <div className="upload-controls">
          <label>
            Whose statement?
            <select
              value={personId}
              onChange={(e) => changePerson(e.target.value as PersonId)}
            >
              {PEOPLE.map((p) => (
                <option key={p.id} value={p.id}>
                  {personOptionLabel(p.id)}
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

        {busy ? <p className="hint">{busyLabel}</p> : null}
        {error ? <p className="form-error">{error}</p> : null}
        {warning ? <p className="hint">{warning}</p> : null}

        {previewUrls.length > 0 ? (
          <div className="screenshot-strip">
            <div className="screenshot-strip-head">
              <h4>
                {previewUrls.length} uploaded{' '}
                {previewUrls.length === 1 ? 'image' : 'images'}
              </h4>
              <p className="hint">
                Tap one to view it full size — arrows move between screenshots.
              </p>
            </div>
            <div className="screenshot-strip-grid">
              {previewUrls.map((url, i) => {
                const name = sourceFiles[i]?.name ?? `screenshot ${i + 1}`
                const count = rowsPerSource.get(name) ?? 0
                return (
                  <button
                    key={url}
                    type="button"
                    className={`screenshot-thumb${
                      sourceFilter === name ? ' is-filtered' : ''
                    }`}
                    onClick={() => setViewerIndex(i)}
                    title={name}
                  >
                    <img src={url} alt={`Uploaded ${name}`} />
                    <span className="screenshot-thumb-meta">
                      <strong>{i + 1}</strong>
                      <span>
                        {count} charge{count === 1 ? '' : 's'}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
            {previewUrls.length > 1 && drafts.length > 0 ? (
              <div
                className="screenshot-strip-filters"
                role="group"
                aria-label="Filter review rows by screenshot"
              >
                <button
                  type="button"
                  className={`review-filter-chip${
                    sourceFilter === 'all' ? ' active' : ''
                  }`}
                  aria-pressed={sourceFilter === 'all'}
                  onClick={() => setSourceFilter('all')}
                >
                  All ({drafts.length})
                </button>
                {sourceFiles.map((file, i) => (
                  <button
                    key={`${file.name}-${i}`}
                    type="button"
                    className={`review-filter-chip${
                      sourceFilter === file.name ? ' active' : ''
                    }`}
                    aria-pressed={sourceFilter === file.name}
                    onClick={() =>
                      setSourceFilter((prev) =>
                        prev === file.name ? 'all' : file.name,
                      )
                    }
                  >
                    #{i + 1} ({rowsPerSource.get(file.name) ?? 0})
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {viewerIndex != null && previewUrls[viewerIndex] ? (
          <div
            className="cash-link-modal-backdrop"
            role="presentation"
            onClick={() => setViewerIndex(null)}
          >
            <div
              className="cash-link-modal screenshot-viewer"
              role="dialog"
              aria-modal="true"
              aria-label="Uploaded screenshot"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="cash-link-modal-header">
                <div>
                  <h3>
                    Screenshot {viewerIndex + 1} of {previewUrls.length}
                  </h3>
                  <p>
                    {sourceFiles[viewerIndex]?.name ?? 'screenshot'}
                    {' · '}
                    {rowsPerSource.get(
                      sourceFiles[viewerIndex]?.name ?? '',
                    ) ?? 0}{' '}
                    charges read
                  </p>
                </div>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setViewerIndex(null)}
                >
                  Close
                </button>
              </div>
              <div className="screenshot-viewer-image">
                <img
                  src={previewUrls[viewerIndex]}
                  alt={`Uploaded ${sourceFiles[viewerIndex]?.name ?? 'screenshot'}`}
                />
              </div>
              <div className="cash-link-modal-actions screenshot-viewer-actions">
                <button
                  type="button"
                  className="ghost"
                  disabled={previewUrls.length < 2}
                  onClick={() => stepViewer(-1)}
                >
                  ‹ Previous
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => {
                    const name = sourceFiles[viewerIndex]?.name
                    if (name) setSourceFilter(name)
                    setViewerIndex(null)
                  }}
                >
                  Review only this one
                </button>
                <button
                  type="button"
                  className="ghost"
                  disabled={previewUrls.length < 2}
                  onClick={() => stepViewer(1)}
                >
                  Next ›
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {drafts.length === 0 && !busy ? (
          <div className="empty-guide embedded">
            <p>
              Pick a statement or screenshots above to start. Or{' '}
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
                <strong>{personDisplay}</strong>
                {' · '}
                <strong>{accountDisplay}</strong>
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
                {needsLookFilter !== 'all' || sourceFilter !== 'all' ? (
                  <span className="review-filter-meta">
                    Showing {visibleDrafts.length} of {drafts.length}
                    {sourceFilter !== 'all' ? ` · ${sourceFilter}` : ''}
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
                        row.isRefund ? 'is-refund' : '',
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

                      {row.sourceLabel && sourceFiles.length > 1 ? (
                        <p className="preview-meta review-card-source">
                          From {row.sourceLabel}
                        </p>
                      ) : null}
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
                Import {included.length} as {personDisplay}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </section>
  )
}
