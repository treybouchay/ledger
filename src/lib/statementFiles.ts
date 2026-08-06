/**
 * Original statement uploads (PDF / CSV / text) live in IndexedDB, keyed by
 * import id. Metadata stays in localStorage via StatementImport; JSON backups
 * intentionally omit these binaries (they can be multi‑MB).
 */

const DB_NAME = 'household-ledger.statement-files'
const DB_VERSION = 1
const STORE = 'files'

export interface StoredStatementFile {
  importId: string
  fileName: string
  mimeType: string
  byteLength: number
  blob: Blob
  storedAt: string
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onerror = () =>
      reject(req.error ?? new Error('Could not open statement file store'))
    req.onsuccess = () => resolve(req.result)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'importId' })
      }
    }
  })
}

function idbReq<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result)
    req.onerror = () =>
      reject(req.error ?? new Error('IndexedDB request failed'))
  })
}

export async function saveStatementFile(
  importId: string,
  file: File | Blob,
  fileName: string,
): Promise<StoredStatementFile> {
  const lower = fileName.toLowerCase()
  const mimeType =
    file.type ||
    (lower.endsWith('.pdf')
      ? 'application/pdf'
      : lower.endsWith('.csv')
        ? 'text/csv'
        : lower.endsWith('.png')
          ? 'image/png'
          : lower.endsWith('.webp')
            ? 'image/webp'
            : lower.endsWith('.gif')
              ? 'image/gif'
              : /\.jpe?g$/.test(lower)
                ? 'image/jpeg'
                : 'application/octet-stream')
  const blob = file instanceof Blob ? file : new Blob([file], { type: mimeType })
  const record: StoredStatementFile = {
    importId,
    fileName,
    mimeType,
    byteLength: blob.size,
    blob,
    storedAt: new Date().toISOString(),
  }
  const db = await openDb()
  try {
    const tx = db.transaction(STORE, 'readwrite')
    await idbReq(tx.objectStore(STORE).put(record))
  } finally {
    db.close()
  }
  return record
}

export async function loadStatementFile(
  importId: string,
): Promise<StoredStatementFile | null> {
  const db = await openDb()
  try {
    const tx = db.transaction(STORE, 'readonly')
    const row = await idbReq(
      tx.objectStore(STORE).get(importId) as IDBRequest<
        StoredStatementFile | undefined
      >,
    )
    return row ?? null
  } finally {
    db.close()
  }
}

export async function deleteStatementFile(importId: string): Promise<void> {
  const db = await openDb()
  try {
    const tx = db.transaction(STORE, 'readwrite')
    await idbReq(tx.objectStore(STORE).delete(importId))
  } finally {
    db.close()
  }
}

export async function clearAllStatementFiles(): Promise<void> {
  const db = await openDb()
  try {
    const tx = db.transaction(STORE, 'readwrite')
    await idbReq(tx.objectStore(STORE).clear())
  } finally {
    db.close()
  }
}

export function isPdfMime(mimeType: string, fileName: string): boolean {
  return (
    mimeType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf')
  )
}

export function isImageMime(mimeType: string, fileName: string): boolean {
  if (mimeType.startsWith('image/')) return true
  return /\.(png|jpe?g|gif|webp|bmp)$/i.test(fileName)
}

export function isTextLikeMime(mimeType: string, fileName: string): boolean {
  if (
    mimeType.startsWith('text/') ||
    mimeType === 'application/csv' ||
    mimeType === 'text/csv'
  ) {
    return true
  }
  return /\.(csv|txt|tsv)$/i.test(fileName)
}
