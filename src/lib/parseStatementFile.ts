import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist'
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import type { AccountId, PersonId } from '../types'
import {
  detectStatementOwner,
  suggestAccountFromStatement,
  type OwnerConfidence,
} from './detectStatementOwner'
import { looksLikeAmex, parseAmexStatement } from './parseAmex'
import { parseStatementCsv, type ParsedCsvRow } from './parseCsv'
import {
  parseStatementText,
  type ParsedStatementRow,
} from './parseStatementText'
import {
  looksLikeTd,
  looksLikeTdChequing,
  looksLikeTdCredit,
  parseTdStatement,
  suggestTdAccount,
  tdEmptyParseHint,
} from './parseTd'
import { extractTextFromImage } from './ocrScreenshot'
import { parseScreenshotText } from './parseScreenshotText'
import { isImageMime } from './statementFiles'

GlobalWorkerOptions.workerSrc = pdfWorker

export type { ParsedStatementRow }

export type ImportSourceKind = 'statement' | 'screenshot'

export interface ParseStatementResult {
  rows: ParsedStatementRow[]
  warning?: string
  /** Best-effort whose statement — UI may override. */
  detectedPersonId?: PersonId
  detectionConfidence?: OwnerConfidence
  detectionNote?: string
  /** Bank-type default when distinguishable (Amex → amex, TD chequing → debit). */
  suggestedAccountId?: AccountId
  /** How the file was read — screenshot uses OCR. */
  sourceKind?: ImportSourceKind
}

export async function parseStatementFile(
  file: File,
  options?: {
    onOcrProgress?: (status: string, progress: number) => void
  },
): Promise<ParseStatementResult> {
  const name = file.name.toLowerCase()
  const isPdf = file.type === 'application/pdf' || name.endsWith('.pdf')
  const isImage = isImageMime(file.type, file.name)

  if (isImage) {
    const text = await extractTextFromImage(file, options?.onOcrProgress)
    if (!text.trim()) {
      return {
        rows: [],
        sourceKind: 'screenshot',
        warning:
          'Couldn’t read any text from that photo. Try a sharper screenshot or export CSV from the bank app.',
        ...ownerMeta(text, file.name, []),
      }
    }

    if (looksLikeTd(text)) {
      const tdRows = parseTdStatement(text)
      if (tdRows.length > 0) {
        return {
          rows: tdRows,
          sourceKind: 'screenshot',
          warning: `OCR’d ${tdRows.length} TD-looking lines from screenshot — double-check every amount and date before importing.`,
          ...ownerMeta(text, file.name, tdRows, suggestTdAccount(text)),
        }
      }
    }

    if (looksLikeAmex(text) || name.includes('amex')) {
      const rows = parseAmexStatement(text)
      if (rows.length > 0) {
        return {
          rows,
          sourceKind: 'screenshot',
          warning: `OCR’d ${rows.length} Amex-looking charges from screenshot — review amounts carefully.`,
          ...ownerMeta(text, file.name, rows),
        }
      }
    }

    const rows = parseScreenshotText(text)
    return {
      rows,
      sourceKind: 'screenshot',
      warning:
        rows.length === 0
          ? 'OCR ran but found no transactions. Crop to the activity list and try again, or use a PDF/CSV statement.'
          : `OCR’d ${rows.length} posted charge${rows.length === 1 ? '' : 's'} from screenshot (Pending rows skipped) — review every amount and date.`,
      ...ownerMeta(text, file.name, rows),
    }
  }

  if (isPdf) {
    const text = await extractPdfText(file)
    if (!text.trim()) {
      return {
        rows: [],
        sourceKind: 'statement',
        warning:
          'No text found in this PDF (it may be a scan). Upload a screenshot of the activity list, or export CSV from your bank.',
        ...ownerMeta(text, file.name, []),
      }
    }

    if (looksLikeTd(text)) {
      const tdRows = parseTdStatement(text)
      const isCredit = looksLikeTdCredit(text)
      const isChequing = looksLikeTdChequing(text)
      const kind = isCredit
        ? 'TD credit'
        : isChequing
          ? 'TD chequing'
          : 'TD'
      return {
        rows: tdRows,
        sourceKind: 'statement',
        warning:
          tdRows.length === 0
            ? tdEmptyParseHint(text)
            : isCredit
              ? `Parsed ${tdRows.length} ${kind} charges (posting date) — payments are unchecked by default; review categories before importing.`
              : `Parsed ${tdRows.length} ${kind} lines — deposits/transfers-in are unchecked by default.`,
        ...ownerMeta(text, file.name, tdRows, suggestTdAccount(text)),
      }
    }

    if (looksLikeAmex(text) || name.includes('amex')) {
      const rows = parseAmexStatement(text)
      const monthCounts = new Map<string, number>()
      for (const row of rows) {
        const id = row.date.slice(0, 7)
        if (/^\d{4}-\d{2}$/.test(id)) {
          monthCounts.set(id, (monthCounts.get(id) ?? 0) + 1)
        }
      }
      const monthHint =
        monthCounts.size > 1
          ? ` Posts across ${[...monthCounts.entries()]
              .sort((a, b) => a[0].localeCompare(b[0]))
              .map(([id, n]) => `${id} (${n})`)
              .join(', ')}.`
          : ''
      return {
        rows,
        sourceKind: 'statement',
        warning:
          rows.length === 0
            ? 'Recognized an Amex PDF but couldn’t parse charges. Try Activity → Export CSV in Amex online.'
            : `Parsed ${rows.length} Amex charges (posting date when both appear; cashback pages win on merge) — review categories before importing.${monthHint}`,
        ...ownerMeta(text, file.name, rows),
      }
    }

    const rows = parseStatementText(text)
    return {
      rows,
      sourceKind: 'statement',
      warning:
        rows.length === 0
          ? 'No transactions detected in this PDF. Try a CSV export from your bank.'
          : 'PDF layouts vary by bank — review every row before importing.',
      ...ownerMeta(text, file.name, rows),
    }
  }

  const text = await file.text()
  const header = text.split(/\r?\n/, 1)[0]?.toLowerCase() ?? ''
  const looksCsv =
    header.includes(',') &&
    (header.includes('date') ||
      header.includes('amount') ||
      header.includes('description') ||
      header.includes('merchant'))

  const csvRows = fromCsv(parseStatementCsv(text))
  const rows = looksCsv
    ? csvRows
    : csvRows.length > 0
      ? csvRows
      : parseStatementText(text)

  return {
    rows,
    sourceKind: 'statement',
    warning:
      rows.length === 0
        ? 'No transactions detected. Use Date, Description, Amount columns.'
        : undefined,
    ...ownerMeta(text, file.name, rows),
  }
}

function ownerMeta(
  text: string,
  fileName: string,
  rows: ParsedStatementRow[],
  accountOverride?: AccountId | null,
): Pick<
  ParseStatementResult,
  | 'detectedPersonId'
  | 'detectionConfidence'
  | 'detectionNote'
  | 'suggestedAccountId'
> {
  const owner = detectStatementOwner(text, fileName)
  const suggestedAccountId =
    accountOverride ??
    suggestAccountFromStatement(
      text,
      fileName,
      rows.map((r) => r.suggestedAccountId),
    ) ??
    undefined
  return {
    detectedPersonId: owner.personId ?? undefined,
    detectionConfidence: owner.personId ? owner.confidence : undefined,
    detectionNote: owner.reason,
    suggestedAccountId,
  }
}

async function extractPdfText(file: File): Promise<string> {
  const data = new Uint8Array(await file.arrayBuffer())
  const pdf = await getDocument({ data }).promise
  const pages: string[] = []

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum += 1) {
    const page = await pdf.getPage(pageNum)
    const content = await page.getTextContent()
    pages.push(itemsToText(content.items))
  }

  return pages.join('\n')
}

/** Rebuild reading-order text from pdf.js positioned glyphs. */
function itemsToText(items: Array<unknown>): string {
  type TextItem = { str?: string; transform?: number[]; hasEOL?: boolean }
  const rows = new Map<number, { x: number; str: string }[]>()

  for (const raw of items) {
    const item = raw as TextItem
    if (!item.str || !item.transform) continue
    const y = Math.round(item.transform[5])
    const x = item.transform[4]
    const bucket = rows.get(y) ?? []
    bucket.push({ x, str: item.str })
    rows.set(y, bucket)
    if (item.hasEOL) {
      // keep row break via separate y usually; ignore
    }
  }

  const sortedYs = [...rows.keys()].sort((a, b) => b - a)
  const lines: string[] = []
  for (const y of sortedYs) {
    const parts = (rows.get(y) ?? []).sort((a, b) => a.x - b.x)
    let line = ''
    let prevX: number | null = null
    for (const part of parts) {
      if (prevX !== null && part.x - prevX > 2) line += ' '
      line += part.str
      prevX = part.x + part.str.length * 4
    }
    lines.push(line.trimEnd())
  }

  // Also keep a newline-joined raw string for Amex fragment repair
  const rawJoined = items
    .map((raw) => {
      const item = raw as TextItem
      return item.str ?? ''
    })
    .join('\n')

  return `${lines.join('\n')}\n${rawJoined}`
}

function fromCsv(rows: ParsedCsvRow[]): ParsedStatementRow[] {
  return rows.map((row) => ({
    date: row.date,
    amount: row.amount,
    merchant: row.merchant,
    suggestedCategoryId: row.suggestedCategoryId,
    suggestedAccountId: row.suggestedAccountId,
    isRefund: row.isRefund,
  }))
}
