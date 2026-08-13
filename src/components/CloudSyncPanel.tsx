import { useEffect, useState, type FormEvent } from 'react'
import {
  ensureHousehold,
  fetchCloudBackup,
  getCurrentSession,
  getLastCloudDownloadedAt,
  getLastCloudSavedAt,
  listLedgerSnapshots,
  localDeviceHasData,
  migrateDeviceToCloud,
  pullCloudToDevice,
  restoreLedgerSnapshot,
  signInWithMagicLink,
  signOutCloud,
  type CloudContext,
  type CloudSnapshotMeta,
} from '../lib/cloudSync'
import { getSupabase, isSupabaseConfigured } from '../lib/supabase'
import type { HouseholdBackup } from '../lib/backup'

function formatSyncTime(iso: string | null): string {
  if (!iso) return 'Never on this device'
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

export function CloudSyncPanel({
  cloud,
  onCloudChange,
  onPullApplied,
  buildLiveBackup,
}: {
  cloud: CloudContext | null
  onCloudChange: (ctx: CloudContext | null) => void
  onPullApplied: (backup: HouseholdBackup) => void
  buildLiveBackup: () => HouseholdBackup
}) {
  const [email, setEmail] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [cloudEmpty, setCloudEmpty] = useState<boolean | null>(null)
  const [sessionEmail, setSessionEmail] = useState<string | null>(null)
  const [setupError, setSetupError] = useState<string | null>(null)
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(() =>
    getLastCloudSavedAt(),
  )
  const [lastDownloadedAt, setLastDownloadedAt] = useState<string | null>(() =>
    getLastCloudDownloadedAt(),
  )
  const [snapshots, setSnapshots] = useState<CloudSnapshotMeta[]>([])

  useEffect(() => {
    if (!isSupabaseConfigured()) return
    void getCurrentSession().then((session) => {
      setSessionEmail(session?.user?.email ?? null)
    })
    const sb = getSupabase()
    if (!sb) return
    const {
      data: { subscription },
    } = sb.auth.onAuthStateChange((_event, session) => {
      setSessionEmail(session?.user?.email ?? null)
    })
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!cloud) {
      setSnapshots([])
      return
    }
    void listLedgerSnapshots(cloud.householdId).then(setSnapshots)
  }, [cloud])

  if (!isSupabaseConfigured()) {
    return (
      <section className="panel settings-panel cloud-sync-panel">
        <div className="panel-header">
          <div>
            <h3>Cloud sync</h3>
            <p>
              Supabase is not configured on this deployment. Add{' '}
              <code>VITE_SUPABASE_URL</code> and{' '}
              <code>VITE_SUPABASE_ANON_KEY</code> in DigitalOcean environment
              variables, then redeploy. See <code>SUPABASE_SETUP.md</code> in
              the repo.
            </p>
          </div>
        </div>
      </section>
    )
  }

  async function refreshCloudEmpty(householdId: string) {
    try {
      const backup = await fetchCloudBackup(householdId)
      setCloudEmpty(!backup)
    } catch {
      setCloudEmpty(null)
    }
  }

  async function refreshSnapshots(householdId: string) {
    setSnapshots(await listLedgerSnapshots(householdId))
  }

  async function handleSignIn(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    setSetupError(null)
    const err = await signInWithMagicLink(email)
    setBusy(false)
    if (err) {
      setMessage(err)
      return
    }
    setMessage(
      'Check your email for a sign-in link. Open it on this same device. After it loads the app, come back to Settings — you should see “Signed in as …”.',
    )
  }

  async function handleRetrySetup() {
    setBusy(true)
    setSetupError(null)
    setMessage(null)
    const session = await getCurrentSession()
    if (!session?.user?.email) {
      setBusy(false)
      setSetupError(
        'No active session. Send a new magic link and open it on this device.',
      )
      return
    }
    const { householdId, error } = await ensureHousehold(session.user.id)
    setBusy(false)
    if (!householdId) {
      setSetupError(
        error ??
          'Could not finish household setup. Run supabase/fix-create-household.sql in the Supabase SQL Editor, then try again.',
      )
      return
    }
    onCloudChange({
      session,
      householdId,
      email: session.user.email,
    })
    setMessage('Signed in and household ready.')
  }

  async function handleSignOut() {
    setBusy(true)
    await signOutCloud()
    onCloudChange(null)
    setCloudEmpty(null)
    setSessionEmail(null)
    setSetupError(null)
    setSnapshots([])
    setMessage('Signed out. This browser keeps its local copy.')
    setBusy(false)
  }

  async function handleUploadDevice() {
    if (!cloud) return
    setBusy(true)
    setMessage(null)
    try {
      const backup = buildLiveBackup()
      const { filesUploaded } = await migrateDeviceToCloud(
        cloud.householdId,
        backup,
        { snapshot: true },
      )
      setCloudEmpty(false)
      setLastSavedAt(getLastCloudSavedAt())
      await refreshSnapshots(cloud.householdId)
      setMessage(
        `Uploaded to cloud: ${backup.transactions.length} transactions, ${backup.imports.length} imports, ${filesUploaded} statement file${filesUploaded === 1 ? '' : 's'}. Snapshot saved.`,
      )
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Upload failed')
    }
    setBusy(false)
  }

  async function handlePullCloud() {
    if (!cloud) return
    const ok = window.confirm(
      'Replace this browser’s ledger with the cloud copy?\n\nLocal transactions, imports, gear, and rules will be overwritten. Statement files download from cloud when you view them.',
    )
    if (!ok) return
    setBusy(true)
    setMessage(null)
    try {
      const backup = await pullCloudToDevice(cloud.householdId)
      if (!backup) {
        setMessage('Cloud ledger is empty — nothing to download.')
      } else {
        onPullApplied(backup)
        setLastDownloadedAt(getLastCloudDownloadedAt())
        setMessage(
          `Downloaded from cloud: ${backup.transactions.length} transactions, ${backup.imports.length} imports.`,
        )
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Download failed')
    }
    setBusy(false)
  }

  async function handlePushNow() {
    if (!cloud) return
    setBusy(true)
    setMessage(null)
    try {
      const backup = buildLiveBackup()
      await migrateDeviceToCloud(cloud.householdId, backup, { snapshot: true })
      setCloudEmpty(false)
      setLastSavedAt(getLastCloudSavedAt())
      await refreshSnapshots(cloud.householdId)
      setMessage('Saved to cloud (and snapshot stored in history).')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Sync failed')
    }
    setBusy(false)
  }

  async function handleRestoreSnapshot(
    snap: CloudSnapshotMeta,
    pushAsCurrent: boolean,
  ) {
    if (!cloud) return
    const ok = window.confirm(
      pushAsCurrent
        ? `Restore snapshot from ${formatSyncTime(snap.createdAt)} into this device AND make it the current cloud copy?\n\nThis replaces local data and overwrites the live cloud ledger.`
        : `Restore snapshot from ${formatSyncTime(snap.createdAt)} into this device only?\n\nThis replaces local data. Cloud stays unchanged until you Save.`,
    )
    if (!ok) return
    setBusy(true)
    setMessage(null)
    try {
      const backup = await restoreLedgerSnapshot(cloud.householdId, snap.id, {
        pushAsCurrent,
      })
      onPullApplied(backup)
      setLastDownloadedAt(getLastCloudDownloadedAt())
      if (pushAsCurrent) {
        setLastSavedAt(getLastCloudSavedAt())
        await refreshSnapshots(cloud.householdId)
      }
      setMessage(
        pushAsCurrent
          ? `Restored snapshot and set it as current cloud (${backup.transactions.length} tx).`
          : `Restored snapshot on this device (${backup.transactions.length} tx). Save to cloud when you want it to be current.`,
      )
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Restore failed')
    }
    setBusy(false)
  }

  if (!cloud) {
    return (
      <section className="panel settings-panel cloud-sync-panel">
        <div className="panel-header">
          <div>
            <h3>Cloud sync</h3>
            <p>
              {sessionEmail
                ? `Auth session found for ${sessionEmail}, but household setup did not finish.`
                : 'Sign in to sync this ledger between devices. Your existing data stays in this browser until you upload it.'}
            </p>
          </div>
        </div>
        <div className="settings-section-body">
          {sessionEmail ? (
            <div className="callout cloud-migrate-callout">
              <p>
                You’re signed in as <strong>{sessionEmail}</strong>, but the app
                couldn’t create your household (a database permission issue).
                Run <code>fix-create-household.sql</code> in Supabase SQL
                Editor, then tap Retry below.
              </p>
              <div className="callout-actions">
                <button
                  type="button"
                  className="primary"
                  onClick={() => void handleRetrySetup()}
                  disabled={busy}
                >
                  Retry household setup
                </button>
                <button
                  type="button"
                  className="ghost"
                  onClick={() => void handleSignOut()}
                  disabled={busy}
                >
                  Sign out
                </button>
              </div>
            </div>
          ) : (
            <form
              className="cloud-sign-in-form"
              onSubmit={(e) => void handleSignIn(e)}
            >
              <label>
                Email{' '}
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                />
              </label>
              <button type="submit" className="primary" disabled={busy}>
                Send magic link
              </button>
            </form>
          )}
          {setupError ? <p className="backup-msg warn">{setupError}</p> : null}
          {message ? <p className="backup-msg">{message}</p> : null}
        </div>
      </section>
    )
  }

  if (cloudEmpty === null) {
    void refreshCloudEmpty(cloud.householdId)
  }

  const hasLocal = localDeviceHasData()

  return (
    <section className="panel settings-panel cloud-sync-panel">
      <div className="panel-header">
        <div>
          <h3>Cloud sync</h3>
          <p>
            Signed in as <strong>{cloud.email}</strong>. Changes auto-save to the
            cloud every few seconds while you’re signed in. Snapshots are saved
            when you tap Save / Upload (last 10 kept).
          </p>
        </div>
        <button
          type="button"
          className="ghost"
          onClick={() => void handleSignOut()}
          disabled={busy}
        >
          Sign out
        </button>
      </div>
      <div className="settings-section-body">
        <p className="cloud-sync-meta">
          <span>
            Last saved from this device:{' '}
            <strong>{formatSyncTime(lastSavedAt)}</strong>
          </span>
          <span>
            Last downloaded to this device:{' '}
            <strong>{formatSyncTime(lastDownloadedAt)}</strong>
          </span>
        </p>

        {cloudEmpty && hasLocal ? (
          <div className="callout cloud-migrate-callout">
            <p>
              <strong>This device has your ledger</strong> but the cloud is
              empty. Upload once from the browser where your statements and
              screenshots live — that copies everything including PDF/image
              files.
            </p>
            <div className="callout-actions">
              <button
                type="button"
                className="primary sync-btn sync-btn-upload"
                onClick={() => void handleUploadDevice()}
                disabled={busy}
              >
                Upload this device to cloud
              </button>
            </div>
          </div>
        ) : null}

        <div className="callout-actions settings-actions sync-actions">
          <button
            type="button"
            className="sync-btn sync-btn-sync"
            onClick={() => void handlePullCloud()}
            disabled={busy}
          >
            Sync with cloud
          </button>
          <button
            type="button"
            className="sync-btn sync-btn-save"
            onClick={() => void handlePushNow()}
            disabled={busy}
          >
            Save to cloud
          </button>
        </div>

        <div className="cloud-snapshot-history">
          <h4>Sync history</h4>
          <p className="muted">
            Point-in-time copies from Save / Upload. Restore into this device,
            or restore and make it the live cloud copy. Statement PDF/screenshot
            files are not versioned — only ledger data.
          </p>
          {snapshots.length === 0 ? (
            <p className="backup-msg muted">
              No snapshots yet. Tap Save to cloud (after running{' '}
              <code>add-ledger-snapshots.sql</code> in Supabase if this list
              stays empty).
            </p>
          ) : (
            <ul className="cloud-snapshot-list">
              {snapshots.map((snap) => (
                <li key={snap.id} className="cloud-snapshot-row">
                  <div>
                    <strong>{formatSyncTime(snap.createdAt)}</strong>
                    <span className="cloud-snapshot-detail">
                      {snap.deviceLabel ?? 'Device'}
                      {snap.label ? ` · ${snap.label}` : ''}
                      {` · ${snap.transactionCount} tx · ${snap.importCount} imports`}
                    </span>
                  </div>
                  <div className="callout-actions">
                    <button
                      type="button"
                      className="sync-btn sync-btn-restore-cloud"
                      disabled={busy}
                      onClick={() => void handleRestoreSnapshot(snap, true)}
                    >
                      Restore + set cloud
                    </button>
                    <button
                      type="button"
                      className="sync-btn sync-btn-restore"
                      disabled={busy}
                      onClick={() => void handleRestoreSnapshot(snap, false)}
                    >
                      Restore here
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {message ? (
          <p className="backup-msg">{message}</p>
        ) : (
          <p className="backup-msg muted">
            Phone → Save to cloud, then laptop → Sync with cloud (or the
            reverse). Trevor and Kate share one household.
          </p>
        )}
      </div>
    </section>
  )
}

export async function bootstrapCloudSession(): Promise<CloudContext | null> {
  if (!isSupabaseConfigured()) return null
  const session = await getCurrentSession()
  if (!session?.user?.email) return null
  const { householdId } = await ensureHousehold(session.user.id)
  if (!householdId) return null
  return {
    session,
    householdId,
    email: session.user.email,
  }
}
