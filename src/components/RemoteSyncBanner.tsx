import { useCallback, useEffect, useRef, useState } from 'react'
import {
  dismissRemoteRevision,
  fetchCloudRemoteStatus,
  pullCloudToDevice,
  syncSourceFromDeviceLabel,
  type CloudContext,
  type CloudRemoteStatus,
} from '../lib/cloudSync'
import { SyncCloudArrowIcon, SyncSourceIcon } from '../lib/categoryIcons'
import { personEmoji, personLabel } from '../lib/labels'
import type { HouseholdBackup } from '../lib/backup'

function formatBannerTime(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('en-CA', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

const POLL_MS = 45_000

export function RemoteSyncBanner({
  cloud,
  syncEpoch = 0,
  onPullApplied,
  onOpenActivity,
}: {
  cloud: CloudContext | null
  /** Bump after local pull/save so the banner re-checks immediately. */
  syncEpoch?: number
  onPullApplied: (backup: HouseholdBackup) => void
  onOpenActivity: () => void
}) {
  const [status, setStatus] = useState<CloudRemoteStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dismissedTick, setDismissedTick] = useState(0)
  const checkingRef = useRef(false)

  const refresh = useCallback(async () => {
    if (!cloud || checkingRef.current) return
    checkingRef.current = true
    try {
      const next = await fetchCloudRemoteStatus(cloud.householdId)
      setStatus(next)
      setError(null)
    } catch (err) {
      console.warn('[cloud] remote status check failed', err)
    } finally {
      checkingRef.current = false
    }
  }, [cloud])

  useEffect(() => {
    if (!cloud) {
      setStatus(null)
      return
    }
    void refresh()
    const id = window.setInterval(() => {
      void refresh()
    }, POLL_MS)
    function onVisible() {
      if (document.visibilityState === 'visible') void refresh()
    }
    function onFocus() {
      void refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onFocus)
    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onFocus)
    }
  }, [cloud, refresh, dismissedTick, syncEpoch])

  if (!cloud || !status?.isRemoteNewer) return null

  const remote = status
  const snap = remote.latestSnapshot
  const who =
    snap?.personId != null
      ? personLabel(snap.personId)
      : snap?.isCurrentUser
        ? 'You'
        : snap?.createdBy
          ? 'Someone else'
          : null
  const source = syncSourceFromDeviceLabel(snap?.deviceLabel)
  const when = formatBannerTime(remote.cloudUpdatedAt ?? snap?.createdAt ?? null)

  async function handleSync() {
    if (!cloud) return
    const ok = window.confirm(
      'Replace this browser’s ledger with the newer cloud copy?\n\nLocal transactions, imports, gear, and rules will be overwritten.',
    )
    if (!ok) return
    setBusy(true)
    setError(null)
    try {
      const backup = await pullCloudToDevice(cloud.householdId)
      if (!backup) {
        setError('Cloud ledger is empty — nothing to download.')
      } else {
        onPullApplied(backup)
        if (remote.cloudUpdatedAt) dismissRemoteRevision(remote.cloudUpdatedAt)
        setStatus(null)
        setDismissedTick((n) => n + 1)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed')
    }
    setBusy(false)
  }

  function handleDismiss() {
    if (remote.cloudUpdatedAt) dismissRemoteRevision(remote.cloudUpdatedAt)
    setStatus(null)
    setDismissedTick((n) => n + 1)
  }

  return (
    <div className="callout warn remote-sync-banner" role="status">
      <div className="remote-sync-banner-copy">
        <p>
          <span className="remote-sync-banner-lead">
            {snap?.personId ? (
              <span className="activity-emoji" aria-hidden>
                {personEmoji(snap.personId)}
              </span>
            ) : (
              <SyncSourceIcon
                source={source}
                className="remote-sync-banner-device"
              />
            )}{' '}
            Cloud has a newer copy
            {who ? (
              <>
                {' '}
                from <strong>{who}</strong>
              </>
            ) : null}
            {snap?.deviceLabel ? (
              <>
                {' '}
                on <strong>{snap.deviceLabel}</strong>
              </>
            ) : (
              <> from another device</>
            )}
            {when ? <> · {when}</> : null}.
          </span>{' '}
          Sync with the cloud to make sure this browser has the latest ledger.
          {snap
            ? ` (${snap.transactionCount} charges · ${snap.importCount} statements)`
            : ''}
        </p>
        {error ? <p className="backup-msg warn">{error}</p> : null}
      </div>
      <div className="callout-actions">
        <button
          type="button"
          className="primary sync-btn sync-btn-sync"
          disabled={busy}
          onClick={() => void handleSync()}
        >
          <SyncCloudArrowIcon direction="down" className="sync-btn-icon" />
          Sync with cloud
        </button>
        <button
          type="button"
          className="ghost"
          disabled={busy}
          onClick={onOpenActivity}
        >
          Activity
        </button>
        <button
          type="button"
          className="ghost"
          disabled={busy}
          onClick={handleDismiss}
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
