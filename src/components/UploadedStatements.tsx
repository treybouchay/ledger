import { PEOPLE } from '../data/seed'
import { formatMoney } from '../lib/compute'
import { getAllAccounts } from '../lib/customAccounts'
import { accountIcon, accountLabel } from '../lib/labels'
import { isImageMime } from '../lib/statementFiles'
import type { StatementImport } from '../types'

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
              const person =
                PEOPLE.find((p) => p.id === item.personId)?.name ?? item.personId
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
  const sorted = [...imports].sort((a, b) =>
    b.uploadedAt.localeCompare(a.uploadedAt),
  )
  const screenshots = sorted.filter(isScreenshotImport)
  const statements = sorted.filter((item) => !isScreenshotImport(item))

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
          emptyText="No statement imports yet."
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
          emptyText="No screenshot imports yet."
        />
      </div>
    </div>
  )

  if (embedded) {
    return (
      <div className="statements-embedded">
        {sorted.length > 0 && onClearAll ? (
          <div className="statements-toolbar">
            <button type="button" className="ghost danger" onClick={onClearAll}>
              Clear all imports
            </button>
          </div>
        ) : null}
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
          <p>
            {sorted.length === 0
              ? 'Nothing imported in this browser yet'
              : `${sorted.length} import${sorted.length === 1 ? '' : 's'} — statements and screenshots listed separately`}
          </p>
        </div>
        {sorted.length > 0 && onClearAll ? (
          <button type="button" className="ghost danger" onClick={onClearAll}>
            Clear all imports
          </button>
        ) : null}
      </div>
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
