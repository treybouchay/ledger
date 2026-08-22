import { useEffect, useMemo, useState } from 'react'
import {
  listLedgerSnapshots,
  syncSourceFromDeviceLabel,
  type CloudContext,
  type CloudSnapshotMeta,
} from '../lib/cloudSync'
import { formatMoney } from '../lib/compute'
import {
  netCashMadeForMonth,
  realizedFlipProfitForMonth,
} from '../lib/gearStorage'
import { SyncSourceIcon } from '../lib/categoryIcons'
import {
  accountLabel,
  personEmoji,
  personLabel,
} from '../lib/labels'
import type {
  GearCashMove,
  GearState,
  StatementImport,
  Transaction,
} from '../types'

function formatActivityTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('en-CA', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function monthLabel(monthId: string): string {
  const [y, m] = monthId.split('-').map(Number)
  if (!y || !m) return monthId
  return new Date(y, m - 1, 1).toLocaleString('en-CA', {
    month: 'long',
    year: 'numeric',
  })
}

function snapshotWho(snap: CloudSnapshotMeta): string {
  if (snap.personId) return personLabel(snap.personId)
  if (snap.isCurrentUser) return 'You'
  if (snap.createdByEmail) return snap.createdByEmail
  return 'Someone else'
}

function merchantsForImport(
  transactions: Transaction[],
  importId: string,
  limit = 3,
): string[] {
  const names: string[] = []
  const seen = new Set<string>()
  for (const t of transactions) {
    if (t.importId !== importId) continue
    const key = t.merchant.trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    names.push(t.merchant.trim())
    if (names.length >= limit) break
  }
  return names
}

type FeedItem =
  | {
      id: string
      sortAt: string
      kind: 'cloud'
      snap: CloudSnapshotMeta
    }
  | {
      id: string
      sortAt: string
      kind: 'import'
      item: StatementImport
      merchants: string[]
    }
  | {
      id: string
      sortAt: string
      kind: 'gear'
      monthId: string
      sold: number
      profit: number
      net: number
      sellCount: number
      flips: Array<{ label: string; profit: number; sold: number }>
    }

function recentGearMonthIds(cash: GearCashMove[], limit = 3): string[] {
  const months = new Set<string>()
  for (const m of cash) {
    const month = m.date?.trim().slice(0, 7) ?? ''
    if (/^\d{4}-\d{2}$/.test(month)) months.add(month)
  }
  return [...months].sort().reverse().slice(0, limit)
}

export function ActivityPanel({
  cloud,
  imports,
  transactions,
  gear,
  monthId,
  onOpenSettings,
  onOpenGear,
}: {
  cloud: CloudContext | null
  imports: StatementImport[]
  transactions: Transaction[]
  gear: GearState
  monthId: string
  onOpenSettings: () => void
  onOpenGear: () => void
}) {
  const [snapshots, setSnapshots] = useState<CloudSnapshotMeta[]>([])
  const [loadingSnapshots, setLoadingSnapshots] = useState(false)

  useEffect(() => {
    if (!cloud) {
      setSnapshots([])
      return
    }
    let cancelled = false
    setLoadingSnapshots(true)
    void listLedgerSnapshots(cloud.householdId)
      .then((rows) => {
        if (!cancelled) setSnapshots(rows)
      })
      .finally(() => {
        if (!cancelled) setLoadingSnapshots(false)
      })
    return () => {
      cancelled = true
    }
  }, [cloud])

  const feed = useMemo(() => {
    const items: FeedItem[] = []

    for (const snap of snapshots) {
      items.push({
        id: `cloud-${snap.id}`,
        sortAt: snap.createdAt,
        kind: 'cloud',
        snap,
      })
    }

    const importsSorted = [...imports].sort((a, b) =>
      a.uploadedAt < b.uploadedAt ? 1 : -1,
    )
    for (const item of importsSorted.slice(0, 12)) {
      items.push({
        id: `import-${item.id}`,
        sortAt: item.uploadedAt,
        kind: 'import',
        item,
        merchants: merchantsForImport(transactions, item.id),
      })
    }

    const gearMonths = new Set(recentGearMonthIds(gear.cash))
    gearMonths.add(monthId)
    for (const mid of [...gearMonths].sort().reverse().slice(0, 4)) {
      const cashMade = netCashMadeForMonth(gear.cash, mid)
      const flips = realizedFlipProfitForMonth(gear.cash, mid)
      if (cashMade.sold === 0 && flips.profit === 0 && flips.sellCount === 0) {
        continue
      }
      const latestSell = flips.flips[0]?.sellDate
      const sortAt = latestSell
        ? `${latestSell}T12:00:00.000Z`
        : `${mid}-28T12:00:00.000Z`
      items.push({
        id: `gear-${mid}`,
        sortAt,
        kind: 'gear',
        monthId: mid,
        sold: cashMade.sold,
        profit: flips.profit,
        net: cashMade.net,
        sellCount: flips.sellCount,
        flips: flips.flips.slice(0, 3).map((f) => ({
          label: f.label,
          profit: f.profit,
          sold: f.sold,
        })),
      })
    }

    items.sort((a, b) => (a.sortAt < b.sortAt ? 1 : -1))
    return items.slice(0, 24)
  }, [snapshots, imports, transactions, gear.cash, monthId])

  const latestCloud = snapshots[0] ?? null

  return (
    <div className="layout activity-layout">
      <div className="panel-header bare">
        <div>
          <h2>Activity</h2>
          <p>
            Who uploaded last, which accounts picked up charges, and gear cash
            made from flips
          </p>
        </div>
      </div>

      {latestCloud ? (
        <div className="activity-spotlight" role="status">
          <div className="activity-spotlight-who">
            <span className="activity-emoji" aria-hidden>
              {latestCloud.personId
                ? personEmoji(latestCloud.personId)
                : '☁️'}
            </span>
            <div>
              <p className="activity-spotlight-title">
                Last cloud upload:{' '}
                <strong>{snapshotWho(latestCloud)}</strong>
                {latestCloud.createdByEmail
                  ? ` · ${latestCloud.createdByEmail}`
                  : ''}
              </p>
              <p className="activity-spotlight-meta">
                {syncSourceFromDeviceLabel(latestCloud.deviceLabel) === 'phone'
                  ? 'Phone'
                  : 'Desktop'}
                {latestCloud.deviceLabel
                  ? ` · ${latestCloud.deviceLabel}`
                  : ''}
                {` · ${formatActivityTime(latestCloud.createdAt)}`}
                {` · ${latestCloud.transactionCount} charges · ${latestCloud.importCount} statements`}
              </p>
            </div>
          </div>
          <button type="button" className="ghost" onClick={onOpenSettings}>
            Cloud sync
          </button>
        </div>
      ) : cloud ? (
        <div className="callout">
          <p>
            {loadingSnapshots
              ? 'Loading cloud upload history…'
              : 'No cloud uploads yet. Save to cloud from Settings to start a shared history.'}
          </p>
          <div className="callout-actions">
            <button type="button" className="ghost" onClick={onOpenSettings}>
              Open cloud sync
            </button>
          </div>
        </div>
      ) : (
        <div className="callout">
          <p>
            Sign in under Settings to see who last uploaded from another device
            and get notified when the cloud is ahead of this browser.
          </p>
          <div className="callout-actions">
            <button type="button" className="primary" onClick={onOpenSettings}>
              Go to Settings
            </button>
          </div>
        </div>
      )}

      <section className="panel activity-panel">
        <div className="panel-header">
          <div>
            <h3>Recent activity</h3>
            <p>
              Cloud saves, statement imports (account + sample charges), and
              gear flip cash
            </p>
          </div>
        </div>

        {feed.length === 0 ? (
          <p className="activity-empty muted">
            Nothing to show yet. Import charges or save to cloud to fill this
            feed.
          </p>
        ) : (
          <ul className="activity-feed">
            {feed.map((entry) => {
              if (entry.kind === 'cloud') {
                const source = syncSourceFromDeviceLabel(
                  entry.snap.deviceLabel,
                )
                return (
                  <li key={entry.id} className="activity-feed-item">
                    <div className="activity-feed-icon" aria-hidden>
                      <SyncSourceIcon source={source} />
                    </div>
                    <div className="activity-feed-body">
                      <p className="activity-feed-title">
                        <span className="activity-emoji">
                          {entry.snap.personId
                            ? personEmoji(entry.snap.personId)
                            : '👤'}
                        </span>{' '}
                        <strong>{snapshotWho(entry.snap)}</strong> saved to
                        cloud
                        {entry.snap.createdByEmail
                          ? ` · ${entry.snap.createdByEmail}`
                          : ''}
                      </p>
                      <p className="activity-feed-detail">
                        {entry.snap.transactionCount} charges
                        {entry.snap.importCount > 0
                          ? ` · ${entry.snap.importCount} statements`
                          : ''}
                        {entry.snap.deviceLabel
                          ? ` · ${entry.snap.deviceLabel}`
                          : ''}
                      </p>
                      <time dateTime={entry.snap.createdAt}>
                        {formatActivityTime(entry.snap.createdAt)}
                      </time>
                    </div>
                  </li>
                )
              }

              if (entry.kind === 'import') {
                const { item, merchants } = entry
                return (
                  <li key={entry.id} className="activity-feed-item">
                    <div className="activity-feed-icon activity-feed-icon-import">
                      {personEmoji(item.personId)}
                    </div>
                    <div className="activity-feed-body">
                      <p className="activity-feed-title">
                        <strong>{personLabel(item.personId)}</strong> updated{' '}
                        <strong>{accountLabel(item.primaryAccountId)}</strong>
                      </p>
                      <p className="activity-feed-detail">
                        {item.transactionCount} charge
                        {item.transactionCount === 1 ? '' : 's'}
                        {item.sourceKind === 'screenshot'
                          ? ' from screenshot'
                          : ' from statement'}
                        {merchants.length > 0
                          ? ` · ${merchants.join(', ')}`
                          : ''}
                        {item.fileName ? ` · ${item.fileName}` : ''}
                      </p>
                      <time dateTime={item.uploadedAt}>
                        {formatActivityTime(item.uploadedAt)}
                      </time>
                    </div>
                  </li>
                )
              }

              return (
                <li key={entry.id} className="activity-feed-item">
                  <div className="activity-feed-icon activity-feed-icon-gear">
                    🏒
                  </div>
                  <div className="activity-feed-body">
                    <p className="activity-feed-title">
                      Gear cash made ·{' '}
                      <strong>{monthLabel(entry.monthId)}</strong>
                    </p>
                    <p className="activity-feed-detail">
                      {formatMoney(entry.sold)} sold
                      {entry.profit !== 0
                        ? ` · ${formatMoney(entry.profit)} flip profit`
                        : ''}
                      {entry.net !== entry.sold
                        ? ` · ${formatMoney(entry.net)} net after non-gear`
                        : ''}
                      {entry.sellCount > 0
                        ? ` · ${entry.sellCount} sell${entry.sellCount === 1 ? '' : 's'}`
                        : ''}
                    </p>
                    {entry.flips.length > 0 ? (
                      <ul className="activity-gear-flips">
                        {entry.flips.map((flip) => (
                          <li key={`${entry.id}-${flip.label}`}>
                            {flip.label} · {formatMoney(flip.sold)}
                            {flip.profit !== 0
                              ? ` (${formatMoney(flip.profit)})`
                              : ''}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <button
                      type="button"
                      className="linkish"
                      onClick={onOpenGear}
                    >
                      Open gear flips
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
