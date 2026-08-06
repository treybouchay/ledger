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

  return (
    <ul className="import-list">
      {items.map((item) => {
        const person =
          PEOPLE.find((p) => p.id === item.personId)?.name ?? item.personId
        const account =
          getAllAccounts().find((a) => a.id === item.primaryAccountId) ?? null
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
