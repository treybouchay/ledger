import { useEffect, useState } from 'react'
import {
  isImageMime,
  isPdfMime,
  isTextLikeMime,
  loadStatementFile,
  type StoredStatementFile,
} from '../lib/statementFiles'

type LoadState =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'error'; message: string }
  | { status: 'ready'; file: StoredStatementFile; url: string; textPreview?: string }

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

export function StatementFilePreview({
  importId,
  hasStoredFile,
  fileName,
}: {
  importId: string
  /** From StatementImport — false/undefined for legacy uploads. */
  hasStoredFile?: boolean
  fileName: string
}) {
  const [state, setState] = useState<LoadState>({ status: 'loading' })

  useEffect(() => {
    let cancelled = false
    let objectUrl: string | null = null

    async function run() {
      if (hasStoredFile === false) {
        setState({ status: 'missing' })
        return
      }
      setState({ status: 'loading' })
      try {
        const file = await loadStatementFile(importId)
        if (cancelled) return
        if (!file) {
          setState({ status: 'missing' })
          return
        }
        objectUrl = URL.createObjectURL(file.blob)
        let textPreview: string | undefined
        if (isTextLikeMime(file.mimeType, file.fileName)) {
          const raw = await file.blob.text()
          if (cancelled) return
          textPreview = raw.slice(0, 12_000)
        }
        setState({ status: 'ready', file, url: objectUrl, textPreview })
      } catch (err) {
        if (cancelled) return
        setState({
          status: 'error',
          message:
            err instanceof Error ? err.message : 'Could not load statement file',
        })
      }
    }

    void run()
    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [importId, hasStoredFile])

  return (
    <div className="statement-file-preview">
      <div className="statement-file-preview-header">
        <h3>Original file</h3>
        <p>
          {state.status === 'ready'
            ? `${state.file.fileName} · ${formatBytes(state.file.byteLength)}`
            : fileName}
        </p>
      </div>

      {state.status === 'loading' ? (
        <p className="statement-file-empty">Loading preview…</p>
      ) : null}

      {state.status === 'missing' ? (
        <p className="statement-file-empty">
          Original file wasn't saved for this upload.
        </p>
      ) : null}

      {state.status === 'error' ? (
        <p className="statement-file-empty">{state.message}</p>
      ) : null}

      {state.status === 'ready' ? (
        <PreviewBody
          file={state.file}
          url={state.url}
          textPreview={state.textPreview}
        />
      ) : null}
    </div>
  )
}

function PreviewBody({
  file,
  url,
  textPreview,
}: {
  file: StoredStatementFile
  url: string
  textPreview?: string
}) {
  if (isPdfMime(file.mimeType, file.fileName)) {
    return (
      <div className="statement-file-frame">
        <iframe
          title={`Statement PDF: ${file.fileName}`}
          src={url}
          className="statement-file-iframe"
        />
        <a className="statement-file-open" href={url} target="_blank" rel="noreferrer">
          Open PDF in new tab
        </a>
      </div>
    )
  }

  if (isImageMime(file.mimeType, file.fileName)) {
    return (
      <div className="statement-file-frame">
        <img
          src={url}
          alt={`Statement scan: ${file.fileName}`}
          className="statement-file-img"
        />
      </div>
    )
  }

  if (textPreview !== undefined) {
    return (
      <pre className="statement-file-text" tabIndex={0}>
        {textPreview}
        {textPreview.length >= 12_000 ? '\n\n… truncated …' : ''}
      </pre>
    )
  }

  return (
    <p className="statement-file-empty">
      Preview isn’t available for this file type.{" "}
      <a href={url} download={file.fileName}>
        Download {file.fileName}
      </a>
    </p>
  )
}
