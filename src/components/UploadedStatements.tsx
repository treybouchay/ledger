import { useState } from 'react'
import { PEOPLE } from '../data/seed'
import { formatMoney } from '../lib/compute'
import { getAllAccounts } from '../lib/customAccounts'
import {
  accountIcon,
  accountLabel,
  personEmoji,
  personLabel,
} from '../lib/labels'
import { isImageMime } from '../lib/statementFiles'
import type { PersonId, StatementImport } from '../types'

type UploadPersonFilter = PersonId | 'all'

const PERSON_FILTER_OPTIONS: {
  id: UploadPersonFilter
  label: string
}[] = [
  { id: 'all', label: 'All' },
  { id: 'trevor', label: 'Trevor' },
  { id: 'kate', label: 'Kate' },
]

function monthLabel(monthId: string): string {
  const [y, m] = monthId.split('-').map(Number)
  if (!y || !m) return monthId
  return new Date(y, m - 1, 1).toLocaleString('en-CA', {
    month: 'short',
    year: 'numeric',
  })
}

function uploadedLabel(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-CA', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

/** Local calendar day key (YYYY-MM-DD) from an upload ISO timestamp. */
function uploadDayKey(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) {
    const fallback = iso.slice(0, 10)
    return /^\d{4}-\d{2}-\d{2}$/.test(fallback) ? fallback : 'unknown'
  }
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function uploadDayLabel(dayKey: string): string {
  const [y, m, d] = dayKey.split('-').map(Number)
  if (!y || !m || !d) return dayKey
  return new Date(y, m - 1, d).toLocaleString('en-CA', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

/** Group already-sorted (newest-first) imports by local upload day; preserves order. */
function groupByUploadDay(
  items: StatementImport[],
): { dayKey: string; label: string; items: StatementImport[] }[] {
  const map = new Map<string, StatementImport[]>()
  for (const item of items) {
    const key = uploadDayKey(item.uploadedAt)
    const list = map.get(key)
    if (list) list.push(item)
    else map.set(key, [item])
  }
  return [...map.entries()].map(([dayKey, groupItems]) => ({
    dayKey,
    label: uploadDayLabel(dayKey),
    items: groupItems,
  }))
}

function isScreenshotImport(item: StatementImport): boolean {
  if (item.sourceKind === 'screenshot') return true
  if (item.sourceKind === 'statement') return false
  return isImageMime(item.mimeType ?? '', item.fileName)
}

function isAttributedPerson(id: unknown): id is PersonId {
  return id === 'trevor' || id === 'kate'
}

/** Trevor/Kate chips hide imports without a valid personId; All shows everything. */
function matchesUploadPersonFilter(
  item: StatementImport,
  filter: UploadPersonFilter,
): boolean {
  if (filter === 'all') return true
  return isAttributedPerson(item.personId) && item.personId === filter
}

function ImportList({
  items,
  onRemove,
  onViewStatement,
  liveCounts,
  emptyText,
}: {
  items: StatementImport[]
  onRemove: (importId: string) => void
  onViewStatement: (importId: string) => void
  liveCounts?: Map<string, number>
  emptyText: string
}) {
  if (items.length === 0) {
    return (
      <div className="empty-guide embedded">
        <p>{emptyText}</p>
      </div>
    )
  }

  const groups = groupByUploadDay(items)

  return (
    <div className="import-day-groups">
      {groups.map((group) => (
        <div key={group.dayKey} className="import-day-group">
          <h4 className="import-day-label">{group.label}</h4>
          <ul className="import-list">
            {group.items.map((item) => {
              const person = isAttributedPerson(item.personId)
                ? `${personEmoji(item.personId)} ${personLabel(item.personId)}`
                : (PEOPLE.find((p) => p.id === item.personId)?.name ??
                  item.personId)
              const account =
                getAllAccounts().find((a) => a.id === item.primaryAccountId) ??
                null
              const live = liveCounts?.get(item.id)
              const count = live ?? item.transactionCount
              const countMismatch =
                live !== undefined && live !== item.transactionCount
              return (
                <li key={item.id} className="import-row">
                  <div className="import-main">
                    <button
                      type="button"
                      className="import-title-btn"
                      onClick={() => onViewStatement(item.id)}
                    >
                      {item.fileName}
                    </button>
                    <div className="import-meta">
                      {person}
                      {' · '}
                      <span className="icon" aria-hidden>
                        {account?.icon ?? accountIcon(item.primaryAccountId)}
                      </span>{' '}
                      {account?.label ?? accountLabel(item.primaryAccountId)}
                      {' · '}
                      {count} charge{count === 1 ? '' : 's'}
                      {countMismatch
                        ? ` (${item.transactionCount} recorded at import)`
                        : ''}
                      {' · '}
                      {formatMoney(Math.abs(item.netAmount))}
                      {item.netAmount < 0 ? ' net credit' : ''}
                      {' · '}
                      {item.monthIds.map(monthLabel).join(', ')}
                      {' · '}
                      {uploadedLabel(item.uploadedAt)}
                    </div>
                  </div>
                  <div className="import-actions">
                    <button
                      type="button"
                      className="primary"
                      onClick={() => onViewStatement(item.id)}
                    >
                      View
                    </button>
                    <button
                      type="button"
                      className="ghost danger"
                      onClick={() => onRemove(item.id)}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </div>
  )
}

function PersonFilterChips({
  value,
  onChange,
}: {
  value: UploadPersonFilter
  onChange: (next: UploadPersonFilter) => void
}) {
  return (
    <div
      className="review-filter statements-person-filter"
      role="group"
      aria-label="Filter uploads by person"
    >
      {PERSON_FILTER_OPTIONS.map((opt) => (
        <button
          key={opt.id}
          type="button"
          className={
            value === opt.id ? 'review-filter-chip active' : 'review-filter-chip'
          }
          aria-pressed={value === opt.id}
          onClick={() => onChange(opt.id)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

export function UploadedStatements({
  imports,
  onRemove,
  onClearAll,
  onViewStatement,
  embedded = false,
  liveCounts,
}: {
  imports: StatementImport[]
  onRemove: (importId: string) => void
  onClearAll?: () => void
  onViewStatement: (importId: string) => void
  embedded?: boolean
  liveCounts?: Map<string, number>
}) {
  const [personFilter, setPersonFilter] = useState<UploadPersonFilter>('all')

  const sorted = [...imports].sort((a, b) =>
    b.uploadedAt.localeCompare(a.uploadedAt),
  )
  const filtered = sorted.filter((item) =>
    matchesUploadPersonFilter(item, personFilter),
  )
  const screenshots = filtered.filter(isScreenshotImport)
  const statements = filtered.filter((item) => !isScreenshotImport(item))
  const filterLabel =
    personFilter === 'all'
      ? null
      : (PEOPLE.find((p) => p.id === personFilter)?.name ?? personFilter)

  const emptyForFilter = filterLabel
    ? `No statement imports for ${filterLabel} yet.`
    : 'No statement imports yet.'
  const emptyScreenshotsForFilter = filterLabel
    ? `No screenshot imports for ${filterLabel} yet.`
    : 'No screenshot imports yet.'

  const showFilter = sorted.length > 0
  const toolbar =
    showFilter || onClearAll ? (
      <div className="statements-toolbar">
        {showFilter ? (
          <PersonFilterChips value={personFilter} onChange={setPersonFilter} />
        ) : (
          <span />
        )}
        {sorted.length > 0 && onClearAll ? (
          <button type="button" className="ghost danger" onClick={onClearAll}>
            Clear all imports
          </button>
        ) : null}
      </div>
    ) : null

  const body = (
    <div className="import-kind-sections">
      <div className="import-kind-section">
        <h3>Statements</h3>
        <p className="hint">PDF / CSV imports</p>
        <ImportList
          items={statements}
          onRemove={onRemove}
          onViewStatement={onViewStatement}
          liveCounts={liveCounts}
          emptyText={emptyForFilter}
        />
      </div>
      <div className="import-kind-section">
        <h3>Screenshots</h3>
        <p className="hint">Phone activity photos read with OCR</p>
        <ImportList
          items={screenshots}
          onRemove={onRemove}
          onViewStatement={onViewStatement}
          liveCounts={liveCounts}
          emptyText={emptyScreenshotsForFilter}
        />
      </div>
    </div>
  )

  const summaryText =
    sorted.length === 0
      ? embedded
        ? null
        : 'Nothing imported in this browser yet'
      : personFilter === 'all'
        ? `${sorted.length} import${sorted.length === 1 ? '' : 's'} — statements and screenshots listed separately`
        : `${filtered.length} of ${sorted.length} import${sorted.length === 1 ? '' : 's'} for ${filterLabel}`

  if (embedded) {
    return (
      <div className="statements-embedded">
        {toolbar}
        {sorted.length === 0 ? (
          <div className="empty-guide embedded">
            <p>
              After you review and add a file below, it shows up here so you can
              reopen those charges anytime.
            </p>
          </div>
        ) : (
          body
        )}
      </div>
    )
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>Already uploaded</h2>
          {summaryText ? <p>{summaryText}</p> : null}
        </div>
      </div>
      {toolbar}
      {sorted.length === 0 ? (
        <div className="empty-guide embedded">
          <p>
            After you review and add a file below, it shows up here so you can
            reopen those charges anytime.
          </p>
        </div>
      ) : (
        body
      )}
    </section>
  )
}
