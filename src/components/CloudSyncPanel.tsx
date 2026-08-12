import { useEffect, useState, type FormEvent } from 'react'
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
import { getSupabase, isSupabaseConfigured } from '../lib/supabase'
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
  const [sessionEmail, setSessionEmail] = useState<string | null>(null)
  const [setupError, setSetupError] = useState<string | null>(null)

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
      setSetupError('No active session. Send a new magic link and open it on this device.')
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
            cloud every few seconds while you’re signed in.
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

        {message ? (
          <p className="backup-msg">{message}</p>
        ) : (
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
  const { householdId } = await ensureHousehold(session.user.id)
  if (!householdId) return null
  return {
    session,
    householdId,
    email: session.user.email,
  }
}
