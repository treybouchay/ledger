import { useState, type FormEvent } from 'react'
import {
  ensureHousehold,
  fetchCloudBackup,
  getCurrentSession,
  localDeviceHasData,
  migrateDeviceToCloud,
  pullCloudToDevice,
  pushCloudBackup,
  signInWithMagicLink,
  signOutCloud,
  type CloudContext,
} from '../lib/cloudSync'
import { isSupabaseConfigured } from '../lib/supabase'
import type { HouseholdBackup } from '../lib/backup'

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

  async function handleSignIn(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setMessage(null)
    const err = await signInWithMagicLink(email)
    setBusy(false)
    if (err) {
      setMessage(err)
      return
    }
    setMessage(
      'Check your email for a sign-in link. After you click it, return here — this page will reload signed in.',
    )
  }

  async function handleSignOut() {
    setBusy(true)
    await signOutCloud()
    onCloudChange(null)
    setCloudEmpty(null)
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
      )
      setCloudEmpty(false)
      setMessage(
        `Uploaded to cloud: ${backup.transactions.length} transactions, ${backup.imports.length} imports, ${filesUploaded} statement file${filesUploaded === 1 ? '' : 's'}.`,
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
      await pushCloudBackup(cloud.householdId, backup)
      await migrateDeviceToCloud(cloud.householdId, backup)
      setMessage('Saved to cloud.')
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Sync failed')
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
              Sign in to sync this ledger between devices. Your existing data
              stays in this browser until you upload it.
            </p>
          </div>
        </div>
        <div className="settings-section-body">
          <form className="cloud-sign-in-form" onSubmit={(e) => void handleSignIn(e)}>
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
            Signed in as {cloud.email}. Changes auto-save to the cloud every few
            seconds while you’re signed in.
          </p>
        </div>
        <button type="button" className="ghost" onClick={() => void handleSignOut()} disabled={busy}>
          Sign out
        </button>
      </div>
      <div className="settings-section-body">
        {cloudEmpty && hasLocal ? (
          <div className="callout cloud-migrate-callout">
            <p>
              <strong>This device has your ledger</strong> ({hasLocal ? 'transactions or imports found' : ''})
              but the cloud is empty. Upload once from the browser where your
              statements and screenshots live — that copies everything including
              PDF/image files.
            </p>
            <div className="callout-actions">
              <button
                type="button"
                className="primary"
                onClick={() => void handleUploadDevice()}
                disabled={busy}
              >
                Upload this device to cloud
              </button>
            </div>
          </div>
        ) : null}

        <div className="callout-actions settings-actions">
          <button
            type="button"
            className="ghost"
            onClick={() => void handlePushNow()}
            disabled={busy}
          >
            Save to cloud now
          </button>
          <button
            type="button"
            className="ghost"
            onClick={() => void handlePullCloud()}
            disabled={busy}
          >
            Download from cloud
          </button>
        </div>

        {message ? <p className="backup-msg">{message}</p> : (
          <p className="backup-msg muted">
            Trevor and Kate share one household ledger. The second person signs
            in with their email, then taps Download from cloud.
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
  const householdId = await ensureHousehold(session.user.id)
  if (!householdId) return null
  return {
    session,
    householdId,
    email: session.user.email,
  }
}
