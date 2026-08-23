import { useCallback, useEffect, useRef, useState } from 'react'
import {
  dismissRemoteRevision,
  fetchCloudRemoteStatus,
  migrateDeviceToCloud,
  pullCloudToDevice,
  syncSourceFromDeviceLabel,
  type CloudContext,
  type CloudRemoteStatus,
  type CloudSyncRelation,
} from '../lib/cloudSync'
import {
  DEMO_SYNC_EVENT,
  applyDemoSyncFromUrl,
  demoCloudContext,
  demoRemoteStatus,
  readDemoSyncRelation,
} from '../lib/demoSyncPreview'
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

function remoteWhoLabel(status: CloudRemoteStatus): {
  who: string | null
  source: 'phone' | 'desktop'
  when: string
} {
  const snap = status.latestSnapshot
  const who =
    snap?.personId != null
      ? personLabel(snap.personId)
      : snap?.isCurrentUser
        ? 'You'
        : snap?.createdBy
          ? 'Someone else'
          : null
  return {
    who,
    source: syncSourceFromDeviceLabel(snap?.deviceLabel),
    when: formatBannerTime(status.cloudUpdatedAt ?? snap?.createdAt ?? null),
  }
}

export function RemoteSyncBanner({
  cloud,
  syncEpoch = 0,
  buildLiveBackup,
  onPullApplied,
  onPushApplied,
  onOpenActivity,
  onSyncStatusChange,
}: {
  cloud: CloudContext | null
  /** Bump after local pull/save so the banner re-checks immediately. */
  syncEpoch?: number
  buildLiveBackup: () => HouseholdBackup
  onPullApplied: (backup: HouseholdBackup) => void
  /** Called after a successful banner upload so the shell can refresh. */
  onPushApplied?: () => void
  onOpenActivity: () => void
  /** Lets the shell show a nav badge / sync-first empty states. */
  onSyncStatusChange?: (relation: CloudSyncRelation) => void
}) {
  const [demoRelation, setDemoRelation] = useState<CloudSyncRelation | null>(
    () => {
      if (!import.meta.env.DEV) return null
      const fromUrl = applyDemoSyncFromUrl()
      if (fromUrl !== undefined) return fromUrl
      return readDemoSyncRelation()
    },
  )
  const [status, setStatus] = useState<CloudRemoteStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dismissedRelation, setDismissedRelation] =
    useState<CloudSyncRelation | null>(null)
  const [pollTick, setPollTick] = useState(0)
  const checkingRef = useRef(false)

  useEffect(() => {
    if (!import.meta.env.DEV) return
    function onDemo(e: Event) {
      const detail = (e as CustomEvent<CloudSyncRelation | null>).detail
      setDemoRelation(detail ?? null)
      setDismissedRelation(null)
      setError(null)
    }
    window.addEventListener(DEMO_SYNC_EVENT, onDemo)
    return () => window.removeEventListener(DEMO_SYNC_EVENT, onDemo)
  }, [])

  const effectiveCloud: CloudContext | null =
    demoRelation != null ? demoCloudContext() : cloud
  const isDemo = demoRelation != null

  const refresh = useCallback(async () => {
    if (demoRelation != null) {
      const next = demoRemoteStatus(demoRelation)
      setStatus(next)
      setError(null)
      onSyncStatusChange?.(next.relation)
      setDismissedRelation((prev) => (prev === next.relation ? prev : null))
      return
    }
    if (!cloud || checkingRef.current) return
    checkingRef.current = true
    try {
      const next = await fetchCloudRemoteStatus(cloud.householdId)
      setStatus(next)
      setError(null)
      onSyncStatusChange?.(next.relation)
      setDismissedRelation((prev) => (prev === next.relation ? prev : null))
    } catch (err) {
      console.warn('[cloud] remote status check failed', err)
    } finally {
      checkingRef.current = false
    }
  }, [cloud, demoRelation, onSyncStatusChange])

  useEffect(() => {
    if (!effectiveCloud) {
      setStatus(null)
      setDismissedRelation(null)
      onSyncStatusChange?.('up_to_date')
      return
    }
    void refresh()
    if (isDemo) return
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
  }, [effectiveCloud, isDemo, refresh, pollTick, syncEpoch, onSyncStatusChange])

  if (!effectiveCloud || !status) return null

  const relation = status.relation
  if (dismissedRelation === relation) return null

  const remote = status
  const snap = remote.latestSnapshot
  const { who, source, when } = remoteWhoLabel(remote)

  async function handlePull(confirmMessage: string) {
    if (!effectiveCloud) return
    if (isDemo) {
      setError('Demo preview — sync actions are disabled.')
      return
    }
    const ok = window.confirm(confirmMessage)
    if (!ok) return
    setBusy(true)
    setError(null)
    try {
      const backup = await pullCloudToDevice(effectiveCloud.householdId)
      if (!backup) {
        setError('Cloud ledger is empty — nothing to download.')
      } else {
        onPullApplied(backup)
        if (remote.cloudUpdatedAt) dismissRemoteRevision(remote.cloudUpdatedAt)
        setDismissedRelation(null)
        setPollTick((n) => n + 1)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed')
    }
    setBusy(false)
  }

  async function handlePush(confirmMessage: string) {
    if (!effectiveCloud) return
    if (isDemo) {
      setError('Demo preview — sync actions are disabled.')
      return
    }
    const ok = window.confirm(confirmMessage)
    if (!ok) return
    setBusy(true)
    setError(null)
    try {
      const backup = buildLiveBackup()
      const { refusedEmptyOverwrite } = await migrateDeviceToCloud(
        effectiveCloud.householdId,
        backup,
        {
          snapshot: true,
          allowEmptyOverwrite: backup.transactions.length === 0,
        },
      )
      if (refusedEmptyOverwrite) {
        setError(
          'Upload blocked: cloud still has transactions and this browser is empty.',
        )
      } else {
        if (remote.cloudUpdatedAt) dismissRemoteRevision(remote.cloudUpdatedAt)
        onPushApplied?.()
        setDismissedRelation(null)
        setPollTick((n) => n + 1)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed')
    }
    setBusy(false)
  }

  function handleDismiss() {
    if (relation === 'remote_ahead' && remote.cloudUpdatedAt) {
      dismissRemoteRevision(remote.cloudUpdatedAt)
      setPollTick((n) => n + 1)
    } else {
      setDismissedRelation(relation)
    }
  }

  const secondaryActions = (
    <>
      <button
        type="button"
        className="ghost"
        disabled={busy}
        onClick={onOpenActivity}
      >
        Notifications
      </button>
      <button
        type="button"
        className="ghost"
        disabled={busy}
        onClick={handleDismiss}
      >
        Dismiss
      </button>
    </>
  )

  if (relation === 'up_to_date') {
    return (
      <div
        className="callout ok remote-sync-banner remote-sync-banner-quiet"
        role="status"
      >
        <div className="remote-sync-banner-copy">
          <p>
            <span className="remote-sync-banner-lead">
              You’re all up to date.
            </span>{' '}
            This device matches the cloud ledger.
          </p>
        </div>
        <div className="callout-actions">
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

  if (relation === 'local_ahead') {
    return (
      <div className="callout remote-sync-banner" role="status">
        <div className="remote-sync-banner-copy">
          <p>
            <span className="remote-sync-banner-lead">
              You’ve made changes on this device
            </span>{' '}
            that aren’t on the cloud yet. Upload so your other devices can pick
            them up.
          </p>
          {error ? <p className="backup-msg warn">{error}</p> : null}
        </div>
        <div className="callout-actions">
          <button
            type="button"
            className="primary sync-btn sync-btn-save"
            disabled={busy}
            onClick={() =>
              void handlePush(
                'Upload this device’s ledger to the cloud?\n\nOther devices will get these local changes on their next sync.',
              )
            }
          >
            <SyncCloudArrowIcon direction="up" className="sync-btn-icon" />
            Upload to cloud
          </button>
          {secondaryActions}
        </div>
      </div>
    )
  }

  if (relation === 'diverged') {
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
              Both this device and the cloud have newer changes
              {who ? (
                <>
                  {' '}
                  (cloud from <strong>{who}</strong>
                  {snap?.deviceLabel ? (
                    <>
                      {' '}
                      on <strong>{snap.deviceLabel}</strong>
                    </>
                  ) : null}
                  {when ? <> · {when}</> : null})
                </>
              ) : when ? (
                <> (cloud · {when})</>
              ) : null}
              .
            </span>
          </p>
          {error ? <p className="backup-msg warn">{error}</p> : null}
        </div>
        <div className="callout-actions">
          <button
            type="button"
            className="primary sync-btn sync-btn-sync"
            disabled={busy}
            onClick={() =>
              void handlePull(
                'Download from cloud and replace this browser’s ledger?\n\nLocal unsynced edits on this device will be replaced.',
              )
            }
          >
            <SyncCloudArrowIcon direction="down" className="sync-btn-icon" />
            Download from cloud
          </button>
          <button
            type="button"
            className="sync-btn sync-btn-save"
            disabled={busy}
            onClick={() =>
              void handlePush(
                'Upload this device’s ledger to the cloud?\n\nCloud changes from the other device will be overwritten.',
              )
            }
          >
            <SyncCloudArrowIcon direction="up" className="sync-btn-icon" />
            Upload this device
          </button>
          {secondaryActions}
        </div>
      </div>
    )
  }

  // remote_ahead
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
          </span>
        </p>
        {error ? <p className="backup-msg warn">{error}</p> : null}
      </div>
      <div className="callout-actions">
        <button
          type="button"
          className="primary sync-btn sync-btn-sync"
          disabled={busy}
          onClick={() =>
            void handlePull(
              'Replace this browser’s ledger with the newer cloud copy?\n\nLocal transactions, imports, gear, and rules will be overwritten.',
            )
          }
        >
          <SyncCloudArrowIcon direction="down" className="sync-btn-icon" />
          Sync with cloud first
        </button>
        {secondaryActions}
      </div>
    </div>
  )
}
