import type { AuthSession } from './supabase'
import type {
  CloudContext,
  CloudRemoteStatus,
  CloudSnapshotMeta,
  CloudSyncRelation,
} from './cloudSync'

/** localStorage key + CustomEvent name for DEV banner preview. */
export const DEMO_SYNC_STORAGE_KEY = 'household-ledger.demo-sync'
export const DEMO_SYNC_EVENT = 'household-ledger:demo-sync'

const RELATION_ALIASES: Record<string, CloudSyncRelation> = {
  '1': 'remote_ahead',
  true: 'remote_ahead',
  ok: 'up_to_date',
  up_to_date: 'up_to_date',
  local: 'local_ahead',
  local_ahead: 'local_ahead',
  remote: 'remote_ahead',
  remote_ahead: 'remote_ahead',
  diverged: 'diverged',
}

export function parseDemoSyncParam(
  raw: string | null | undefined,
): CloudSyncRelation | null | undefined {
  if (raw == null || raw === '') return undefined
  const key = raw.trim().toLowerCase()
  if (key === '0' || key === 'false' || key === 'off' || key === 'clear') {
    return null
  }
  return RELATION_ALIASES[key]
}

export function readDemoSyncRelation(): CloudSyncRelation | null {
  if (!import.meta.env.DEV) return null
  try {
    const stored = localStorage.getItem(DEMO_SYNC_STORAGE_KEY)
    const parsed = parseDemoSyncParam(stored)
    return parsed === undefined ? null : parsed
  } catch {
    return null
  }
}

/**
 * Apply `?demoSync=` from the URL (DEV only). Returns the relation if the
 * param was present (including clear → null).
 */
export function applyDemoSyncFromUrl(
  search = typeof window !== 'undefined' ? window.location.search : '',
): CloudSyncRelation | null | undefined {
  if (!import.meta.env.DEV) return undefined
  const params = new URLSearchParams(search)
  if (!params.has('demoSync')) return undefined
  const parsed = parseDemoSyncParam(params.get('demoSync'))
  if (parsed === undefined) return undefined
  setDemoSyncRelation(parsed)
  return parsed
}

export function setDemoSyncRelation(relation: CloudSyncRelation | null): void {
  if (!import.meta.env.DEV) return
  try {
    if (relation) localStorage.setItem(DEMO_SYNC_STORAGE_KEY, relation)
    else localStorage.removeItem(DEMO_SYNC_STORAGE_KEY)
  } catch {
    /* ignore */
  }
  window.dispatchEvent(
    new CustomEvent(DEMO_SYNC_EVENT, { detail: relation }),
  )
}

export function clearDemoSyncRelation(): void {
  setDemoSyncRelation(null)
}

/** Minimal fake session so RemoteSyncBanner can render without Supabase. */
export function demoCloudContext(): CloudContext {
  return {
    householdId: 'demo-household',
    email: 'demo@localhost',
    session: {
      user: { id: 'demo-user', email: 'demo@localhost' },
    } as AuthSession,
  }
}

function demoSnapshot(relation: CloudSyncRelation): CloudSnapshotMeta | null {
  if (relation === 'up_to_date' || relation === 'local_ahead') return null
  const createdAt = new Date(Date.now() - 45 * 60_000).toISOString()
  return {
    id: 'demo-snapshot',
    createdAt,
    label: 'Demo cloud snapshot',
    deviceLabel: 'Kate’s iPhone',
    transactionCount: 42,
    importCount: 3,
    personId: 'kate',
    createdByEmail: 'kate@example.com',
    createdBy: 'demo-other-user',
    isCurrentUser: false,
  }
}

export function demoRemoteStatus(relation: CloudSyncRelation): CloudRemoteStatus {
  const latestSnapshot = demoSnapshot(relation)
  const isRemoteNewer =
    relation === 'remote_ahead' || relation === 'diverged'
  const isLocalDirty =
    relation === 'local_ahead' || relation === 'diverged'
  return {
    cloudUpdatedAt: latestSnapshot?.createdAt ?? new Date().toISOString(),
    latestSnapshot,
    isRemoteNewer,
    isLocalDirty,
    relation,
    isDifferentDevice: Boolean(latestSnapshot),
  }
}

export const DEMO_SYNC_PRESETS: {
  relation: CloudSyncRelation
  label: string
}[] = [
  { relation: 'up_to_date', label: 'Up to date' },
  { relation: 'local_ahead', label: 'Local ahead' },
  { relation: 'remote_ahead', label: 'Remote ahead' },
  { relation: 'diverged', label: 'Diverged' },
]
