import { useEffect, useState } from 'react'
import type { CloudSyncRelation } from '../lib/cloudSync'
import {
  DEMO_SYNC_EVENT,
  DEMO_SYNC_PRESETS,
  clearDemoSyncRelation,
  readDemoSyncRelation,
  setDemoSyncRelation,
} from '../lib/demoSyncPreview'

/** DEV-only Settings controls to force RemoteSyncBanner states without Supabase. */
export function DemoSyncPreviewPanel() {
  const [active, setActive] = useState<CloudSyncRelation | null>(() =>
    readDemoSyncRelation(),
  )

  useEffect(() => {
    function onDemo(e: Event) {
      setActive((e as CustomEvent<CloudSyncRelation | null>).detail ?? null)
    }
    window.addEventListener(DEMO_SYNC_EVENT, onDemo)
    return () => window.removeEventListener(DEMO_SYNC_EVENT, onDemo)
  }, [])

  if (!import.meta.env.DEV) return null

  return (
    <section className="panel settings-panel cloud-sync-panel demo-sync-preview-panel">
      <div className="panel-header">
        <div>
          <h3>Preview sync banners</h3>
          <p>
            Dev only — forces the top RemoteSyncBanner without signing in to
            Supabase. Real cloud sync is unchanged when preview is off.
          </p>
        </div>
      </div>
      <div className="settings-section-body">
        <div className="callout-actions demo-sync-preview-actions">
          {DEMO_SYNC_PRESETS.map(({ relation, label }) => (
            <button
              key={relation}
              type="button"
              className={active === relation ? 'primary' : 'ghost'}
              onClick={() => setDemoSyncRelation(relation)}
            >
              {label}
            </button>
          ))}
          <button
            type="button"
            className="ghost"
            disabled={active == null}
            onClick={() => clearDemoSyncRelation()}
          >
            Clear preview
          </button>
        </div>
        {active ? (
          <p className="backup-msg muted">
            Previewing <code>{active}</code>. Banner is at the top of the page
            (any tab). Clear preview or open without{' '}
            <code>?demoSync=…</code> to restore normal behavior.
          </p>
        ) : (
          <p className="backup-msg muted">
            Or open{' '}
            <code>?demoSync=ok|local|remote|diverged</code> — e.g.{' '}
            <code>/?demoSync=remote&amp;tab=settings</code>
          </p>
        )}
      </div>
    </section>
  )
}
