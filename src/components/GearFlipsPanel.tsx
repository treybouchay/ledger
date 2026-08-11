import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { formatMoney } from '../lib/compute'
import { confirmRemove } from '../lib/confirm'
import {
  attachBuyToProjectedMonth,
  attachedBuysForMonth,
  autoLinkCashMoves,
  buysAvailableToAttach,
  cashBalance,
  cashGroupEconomics,
  cashGroupMembers,
  cashGroupOpposites,
  cashLinksChanged,
  cashTimeline,
  detachBuyFromProjectedMonth,
  effectiveListingStatus,
  gearSalesInsights,
  insertCashMoveSorted,
  keptBuyIds,
  linkCashMoves,
  normalizeCashItem,
  openInventoryProjectedSummary,
  openNotListedBuysForMonth,
  rankLinkCandidates,
  realizedFlipProfitForMonth,
  reconcileSeedCashDates,
  removeCashMove,
  sortCashMoves,
  suggestSellItemNames,
  sumNullable,
  syncPlannerMonths,
  unlinkCashMove,
  cashMoveNeedsInsightTags,
  type BrandProfitInsight,
  type CompletedFlipInsight,
  type GearInsightsPeriod,
  type SellItemSuggestion,
  type VolumeLeaderInsight,
} from '../lib/gearStorage'
import {
  emptyGearTags,
  formatGearItemLabel,
} from '../lib/gearTags'
import {
  readGearSubTab,
  writeGearSubTab,
  type GearSubTab,
} from '../lib/nav'
import { GearItemTagsFields, GearTagPills } from './GearItemTags'
import type {
  GearCashMove,
  GearItemTags,
  GearKeepItem,
  GearListingStatus,
  GearMonth,
  GearProjectedManualRow,
  GearSoldVia,
  GearState,
} from '../types'

const SOLD_VIA: {
  id: GearSoldVia
  label: string
  short: string
}[] = [
  { id: 'fb', label: 'Facebook', short: 'FB' },
  { id: 'kijiji', label: 'Kijiji', short: 'Kijiji' },
  { id: 'ss', label: 'SidelineSwap', short: 'SS' },
]

function moneyCell(n: number | null | undefined): string {
  if (n == null || Number.isNaN(n)) return '—'
  return formatMoney(n)
}

function cashMoveMatchesSearch(move: GearCashMove, q: string): boolean {
  if (!q) return true
  const tagBits = [
    move.tags?.kind,
    move.tags?.level,
    move.tags?.size,
    move.tags?.gloveSize,
    move.tags?.colour,
    move.tags?.brand,
    move.tags?.detail,
    move.tags?.kind === 'set_gloves' ? 'glove set blocker catcher' : '',
    move.tags?.kind === 'set_full' ? 'full set pads blocker catcher glove' : '',
  ]
    .filter(Boolean)
    .join(' ')
  const parts = [
    move.item ?? '',
    tagBits,
    move.type ?? '',
    move.date?.slice(0, 10) ?? '',
    String(move.amount),
    formatMoney(move.amount),
    move.direction === 'in' ? 'sell in' : 'buy out',
    move.soldVia ?? '',
    move.listingStatus === 'listed' ? 'listed' : '',
    move.listingStatus === 'not_listed' ? 'not listed' : '',
    move.notes ?? '',
  ]
  return parts.join(' ').toLowerCase().includes(q)
}

function tagsReady(tags: GearItemTags): boolean {
  if (!tags.kind) return false
  if (tags.kind !== 'other' && !tags.level) return false
  return Boolean(formatGearItemLabel(tags))
}

/** Visible cash-ledger description: date · item (date always included). */
function cashMoveDescLabel(
  item?: string | null,
  date?: string | null,
): string {
  const dateLabel = date?.slice(0, 10) || 'No date'
  const itemLabel = (item ?? '').trim() || 'Untitled'
  return `${dateLabel} · ${itemLabel}`
}

function shiftMonthId(monthId: string, delta: number): string {
  const [y, m] = monthId.split('-').map(Number)
  if (!y || !m) return monthId
  const d = new Date(y, m - 1 + delta, 1)
  const yy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${yy}-${mm}`
}

function formatProfitMonthLabel(monthId: string): string {
  const [y, m] = monthId.split('-').map(Number)
  if (!y || !m) return monthId
  return new Date(y, m - 1, 1).toLocaleString('en-CA', {
    month: 'long',
    year: 'numeric',
  })
}

function CashMoveDesc({
  item,
  date,
  tags,
}: {
  item?: string | null
  date?: string | null
  tags?: GearItemTags | null
}) {
  const dateLabel = date?.slice(0, 10) || 'No date'
  const itemLabel = (item ?? '').trim() || 'Untitled'
  return (
    <>
      <div className="cash-move-item">
        <time
          className="cash-move-desc-date"
          dateTime={date?.slice(0, 10) || undefined}
        >
          {dateLabel}
        </time>
        <span className="cash-move-desc-sep" aria-hidden>
          ·
        </span>
        <span className="cash-move-desc-text">{itemLabel}</span>
      </div>
      <GearTagPills tags={tags} />
    </>
  )
}

function suggestionSearchBits(s: SellItemSuggestion): string[] {
  return [
    s.label,
    s.tags?.kind,
    s.tags?.level,
    s.tags?.size,
    s.tags?.gloveSize,
    s.tags?.colour,
    s.tags?.brand,
    s.tags?.detail,
  ].filter((v): v is string => Boolean(v && String(v).trim()))
}

/** Higher is a better match for the typed query. 0 = no match. */
function scoreSuggestionMatch(s: SellItemSuggestion, qRaw: string): number {
  const q = qRaw.trim().toLowerCase()
  if (!q) return 0

  const label = s.label.toLowerCase()
  const bits = suggestionSearchBits(s).map((b) => b.toLowerCase())
  const haystack = bits.join(' ')

  let score = 0
  if (label === q) score += 100
  else if (label.startsWith(q)) score += 70
  else if (label.includes(q)) score += 45

  for (const bit of bits) {
    if (bit === q) score += 40
    else if (bit.startsWith(q)) score += 25
    else if (bit.includes(q)) score += 12
  }

  const qTokens = q.split(/\s+/).filter((t) => t.length > 1)
  if (qTokens.length > 1) {
    let overlap = 0
    for (const t of qTokens) {
      if (haystack.includes(t)) overlap += 1
    }
    if (overlap === qTokens.length) score += 30
    else if (overlap > 0) score += 8 * overlap
  }

  if (score === 0 && haystack.includes(q)) score = 5
  return score
}

function suggestionMatchesQuery(
  s: SellItemSuggestion,
  qRaw: string,
): boolean {
  const q = qRaw.trim()
  if (!q) return true
  return scoreSuggestionMatch(s, q) > 0
}

/** Top matches for an inline search query (empty query → none). */
function rankSuggestionMatches(
  suggestions: SellItemSuggestion[],
  qRaw: string,
  limit: number,
): SellItemSuggestion[] {
  const q = qRaw.trim()
  if (!q) return []
  return suggestions
    .map((s) => ({ s, score: scoreSuggestionMatch(s, q) }))
    .filter((x) => x.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score || a.s.label.localeCompare(b.s.label),
    )
    .slice(0, limit)
    .map((x) => x.s)
}

/** Search + browse open inventory when matching a sell to a buy. */
function InventoryMatchPicker({
  suggestions,
  selectedKey,
  onPick,
  onClear,
  onEnterManually,
}: {
  suggestions: SellItemSuggestion[]
  selectedKey: string
  onPick: (s: SellItemSuggestion) => void
  onClear?: () => void
  /** Skip matching and fill tags yourself (compose sell flow). */
  onEnterManually?: () => void
}) {
  const [query, setQuery] = useState('')
  const [browseOpen, setBrowseOpen] = useState(false)
  const [browseQuery, setBrowseQuery] = useState('')

  const qTrimmed = query.trim()
  const preview = rankSuggestionMatches(suggestions, query, 3)
  const browseFiltered = suggestions.filter((s) =>
    suggestionMatchesQuery(s, browseQuery),
  )
  const selected = suggestions.find((s) => s.key === selectedKey) ?? null

  useEffect(() => {
    if (!browseOpen) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setBrowseOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [browseOpen])

  function renderRow(s: SellItemSuggestion, compact = false) {
    const active = selectedKey === s.key
    return (
      <button
        key={s.key}
        type="button"
        className={`inventory-match-row${active ? ' active' : ''}${compact ? ' compact' : ''}`}
        aria-pressed={active}
        onClick={() => {
          onPick(s)
          setBrowseOpen(false)
          setQuery('')
        }}
      >
        <span className="inventory-match-row-main">
          <span className="inventory-match-row-label">
            {s.label}
          </span>
          <GearTagPills tags={s.tags} />
          <span className="inventory-match-row-meta">
            Open value {formatMoney(s.remaining)}
          </span>
        </span>
        <span className="inventory-match-row-check" aria-hidden>
          {active ? '✓' : ''}
        </span>
      </button>
    )
  }

  return (
    <div className="inventory-match">
      <div className="inventory-match-header">
        <span className="inventory-match-title">Match inventory</span>
        {selected ? (
          <button
            type="button"
            className="ghost inventory-match-clear"
            onClick={() => {
              onClear?.()
              setQuery('')
            }}
          >
            Clear match
          </button>
        ) : null}
      </div>
      {selected ? (
        <div className="inventory-match-selected">
          <strong>{selected.label}</strong>
          <GearTagPills tags={selected.tags} />
          <span className="inventory-match-row-meta">
            Open value {formatMoney(selected.remaining)}
          </span>
        </div>
      ) : null}
      <label className="inventory-match-search">
        <span className="visually-hidden">Search inventory</span>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search brand, type, model, size…"
          autoComplete="off"
        />
      </label>
      {suggestions.length === 0 ? (
        <p className="hint">No open buys to match yet.</p>
      ) : qTrimmed && preview.length === 0 ? (
        <p className="hint">No inventory matches this search.</p>
      ) : preview.length > 0 ? (
        <div className="inventory-match-list" role="list">
          {preview.map((s) => renderRow(s, true))}
        </div>
      ) : null}
      <div className="inventory-match-actions">
        {suggestions.length > 0 ? (
          <button
            type="button"
            className="ghost inventory-match-browse"
            onClick={() => {
              setBrowseQuery(query)
              setBrowseOpen(true)
            }}
          >
            Browse all inventory
          </button>
        ) : null}
        {onEnterManually ? (
          <button
            type="button"
            className="ghost inventory-match-manual"
            onClick={onEnterManually}
          >
            Enter manually
          </button>
        ) : null}
      </div>

      {browseOpen ? (
        <div
          className="cash-link-modal-backdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setBrowseOpen(false)
          }}
        >
          <div
            className="cash-link-modal inventory-browse-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="inventory-browse-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="cash-link-modal-header">
              <div>
                <h3 id="inventory-browse-title">Browse inventory</h3>
                <p>Pick a buy to match this sell</p>
              </div>
              <button
                type="button"
                className="icon-btn"
                title="Close"
                aria-label="Close"
                onClick={() => setBrowseOpen(false)}
              >
                <IconClose />
              </button>
            </div>
            <label className="inventory-match-search inventory-browse-search">
              <span className="visually-hidden">Search inventory</span>
              <input
                type="search"
                value={browseQuery}
                onChange={(e) => setBrowseQuery(e.target.value)}
                placeholder="Search brand, type, model, size…"
                autoComplete="off"
                autoFocus
              />
            </label>
            <div className="cash-link-modal-body">
              {browseFiltered.length === 0 ? (
                <p className="empty-note">No inventory matches this search.</p>
              ) : (
                <div className="inventory-match-list browse" role="list">
                  {browseFiltered.map((s) => renderRow(s))}
                </div>
              )}
            </div>
            <div className="cash-link-modal-actions">
              <button
                type="button"
                className="ghost"
                onClick={() => setBrowseOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                onClick={() => setBrowseOpen(false)}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function IconEdit() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden focusable="false">
      <path
        fill="currentColor"
        d="M11.13 2.19a1.75 1.75 0 0 1 2.47 2.47L5.9 12.36a1 1 0 0 1-.45.26l-2.7.67a.5.5 0 0 1-.6-.6l.67-2.7a1 1 0 0 1 .26-.45l7.7-7.7Zm1.41 1.06a.75.75 0 0 0-1.06 0L4.3 10.43l-.3 1.22 1.22-.3 7.18-7.18a.75.75 0 0 0 0-1.06ZM3 13.5h10a.5.5 0 0 1 0 1H3a.5.5 0 0 1 0-1Z"
      />
    </svg>
  )
}

/** Sticky note — open cash-move notes editor. */
function IconNote() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      <path d="M3.25 2.75h7.5L12.75 5v8.25H3.25V2.75Z" />
      <path d="M10.75 2.75V5h2" />
      <path d="M5.5 7.25h5M5.5 9.5h5M5.5 11.75h3" />
    </svg>
  )
}

function IconClose() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden focusable="false">
      <path
        fill="currentColor"
        d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 1 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"
      />
    </svg>
  )
}

/** Outline ledger — jump-to-linked partner (soft teal via .cash-pair-link). */
function IconLedger() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      <rect x="3.25" y="2.25" width="9.5" height="11.5" rx="1.25" />
      <path d="M5.75 5.5h4.5M5.75 8h4.5M5.75 10.5h2.75" />
    </svg>
  )
}

/** Receipt slip — open cash activity from Cash on hand. */
function IconReceipt() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      <path d="M4.25 2.25h7.5v11.5l-1.25-.9-1.25.9-1.25-.9-1.25.9-1.25-.9-1.25.9V2.25Z" />
      <path d="M6 5.5h4M6 8h4M6 10.5h2.5" />
    </svg>
  )
}

/** Chain / link — link-mode entry (neutral grey via .icon-btn). */
function IconLink() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden focusable="false">
      <path
        fill="currentColor"
        d="M9.83 6.17a2.75 2.75 0 0 1 0 3.89l-1.5 1.5a2.75 2.75 0 1 1-3.89-3.89l.75-.75a.75.75 0 0 1 1.06 1.06l-.75.75a1.25 1.25 0 1 0 1.77 1.77l1.5-1.5a1.25 1.25 0 0 0-1.77-1.77.75.75 0 1 1-1.06-1.06 2.75 2.75 0 0 1 3.89 0Zm-3.66 3.66a2.75 2.75 0 0 1 0-3.89l1.5-1.5a2.75 2.75 0 0 1 3.89 3.89l-.75.75a.75.75 0 0 1-1.06-1.06l.75-.75a1.25 1.25 0 1 0-1.77-1.77l-1.5 1.5a1.25 1.25 0 0 0 1.77 1.77.75.75 0 1 1 1.06 1.06 2.75 2.75 0 0 1-3.89 0Z"
      />
    </svg>
  )
}

function IconUnlink() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden focusable="false">
      <path
        fill="currentColor"
        d="M4.22 4.22a.75.75 0 0 1 1.06 0L8 6.94l2.72-2.72a.75.75 0 1 1 1.06 1.06L9.06 8l.97.97a2.75 2.75 0 0 1-3.89 3.89l-1.5-1.5a.75.75 0 0 1 1.06-1.06l1.5 1.5a1.25 1.25 0 1 0 1.77-1.77L8.53 8.53 4.22 4.22a.75.75 0 0 1 0-1.06Zm7.56 0a2.75 2.75 0 0 1 0 3.89l-.22.22-.97-.97.22-.22a1.25 1.25 0 0 0-1.77-1.77l-.22.22-.97-.97.22-.22a2.75 2.75 0 0 1 3.89 0ZM3.28 12.72l1.5-1.5a.75.75 0 0 1 1.06 1.06l-1.5 1.5a.75.75 0 1 1-1.06-1.06Z"
      />
    </svg>
  )
}

function IconTrash() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden focusable="false">
      <path
        fill="currentColor"
        d="M6.5 2a.5.5 0 0 0-.5.5V3H3.75a.75.75 0 0 0 0 1.5h.38l.55 7.15A1.75 1.75 0 0 0 6.42 13h3.16a1.75 1.75 0 0 0 1.74-1.35l.55-7.15h.38a.75.75 0 0 0 0-1.5H10v-.5a.5.5 0 0 0-.5-.5h-3Zm1 1.5h1V3h-1v.5ZM5.64 4.5l.53 6.9a.25.25 0 0 0 .25.2h3.16a.25.25 0 0 0 .25-.2l.53-6.9H5.64Z"
      />
    </svg>
  )
}

function IconCheck() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden focusable="false">
      <path
        fill="currentColor"
        d="M12.78 4.22a.75.75 0 0 1 0 1.06l-5.25 5.25a.75.75 0 0 1-1.06 0L3.22 7.28a.75.75 0 0 1 1.06-1.06L7 8.94l4.72-4.72a.75.75 0 0 1 1.06 0Z"
      />
    </svg>
  )
}

function IconUndo() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden focusable="false">
      <path
        fill="currentColor"
        d="M6.78 2.22a.75.75 0 0 1 0 1.06L4.81 5.25H9.5A4.75 4.75 0 1 1 4.75 10a.75.75 0 0 1 0-1.5 3.25 3.25 0 1 0 3.25-3.25H4.81l1.97 1.97a.75.75 0 1 1-1.06 1.06l-3.25-3.25a.75.75 0 0 1 0-1.06l3.25-3.25a.75.75 0 0 1 1.06 0Z"
      />
    </svg>
  )
}

function IconKeep() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden focusable="false">
      <path
        fill="currentColor"
        d="M4.5 2.25A1.75 1.75 0 0 0 2.75 4v9.25a.75.75 0 0 0 1.2.6L8 11.06l4.05 2.79a.75.75 0 0 0 1.2-.6V4A1.75 1.75 0 0 0 11.5 2.25h-7ZM4.25 4c0-.14.11-.25.25-.25h7c.14 0 .25.11.25.25v7.94l-3.3-2.27a.75.75 0 0 0-.9 0l-3.3 2.27V4Z"
      />
    </svg>
  )
}

function CashMoveRail({ tone }: { tone: 'in' | 'out' | 'neutral' }) {
  return <span className={`cash-move-rail ${tone}`} aria-hidden />
}

function IconEye() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden focusable="false">
      <path
        fill="currentColor"
        d="M8 3.25c2.7 0 4.86 1.55 6.32 3.7a.75.75 0 0 1 0 .8C12.86 9.9 10.7 11.45 8 11.45S3.14 9.9 1.68 7.75a.75.75 0 0 1 0-.8C3.14 4.8 5.3 3.25 8 3.25Zm0 1.5c-2.05 0-3.8 1.12-5.05 2.85C4.2 9.33 5.95 10 8 10s3.8-.67 5.05-1.9C11.8 5.87 10.05 4.75 8 4.75ZM8 6a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z"
      />
    </svg>
  )
}

function IconEyeOff() {
  return (
    <svg viewBox="0 0 16 16" width="15" height="15" aria-hidden focusable="false">
      <path
        fill="currentColor"
        d="M2.22 2.22a.75.75 0 0 1 1.06 0l10.5 10.5a.75.75 0 1 1-1.06 1.06l-1.7-1.7C9.98 12.5 9.02 12.7 8 12.7c-2.7 0-4.86-1.55-6.32-3.7a.75.75 0 0 1 0-.8c.66-.97 1.5-1.82 2.48-2.45L2.22 3.28a.75.75 0 0 1 0-1.06Zm3.4 3.4 1.02 1.02a2 2 0 0 0 2.68 2.68l1.02 1.02A3.48 3.48 0 0 1 8 11.2c-2.05 0-3.8-.67-5.05-1.9C4.2 7.87 5.95 6.75 8 6.75c.22 0 .43.02.63.05ZM8 4.55c.86 0 1.67.14 2.42.4l-1.12 1.12A2 2 0 0 0 7.18 7.2L6.06 6.07c.55-.33 1.2-.52 1.94-.52Zm5.05 1.4c.6.4 1.14.88 1.59 1.4a.75.75 0 0 1 0 .8c-.5.73-1.12 1.38-1.84 1.9l-1.08-1.08c.5-.35.93-.77 1.28-1.22C11.8 6.87 10.05 5.75 8 5.75c-.2 0-.4.01-.59.04L6.3 4.68c.54-.09 1.1-.13 1.7-.13 2.05 0 3.8 1.12 5.05 2.4Z"
      />
    </svg>
  )
}

/** Magnifying glass — cash filter search fields. */
function IconSearch() {
  return (
    <svg
      viewBox="0 0 16 16"
      width="15"
      height="15"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
    >
      <circle cx="7" cy="7" r="4.25" />
      <path d="M10.5 10.5 13.25 13.25" />
    </svg>
  )
}

function CashSearchField({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (value: string) => void
  placeholder: string
}) {
  return (
    <div className="cash-search-field">
      <span className="cash-search-field-icon">
        <IconSearch />
      </span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
      />
    </div>
  )
}

type CashDateSort = 'asc' | 'desc'
type CashSearchScope = 'both' | 'buys' | 'sells'
/** Gear item tags quality filter (Insights → Cash CTA). */
type ItemTagFilter = 'all' | 'needs_tags'

/** Same priority as status tags on buy rows (keep → sold → listing). */
type BuyCashTag = 'not_listed' | 'listed' | 'sold' | 'kept'
type BuyTagFilter = 'all' | BuyCashTag

const BUY_TAG_FILTER_OPTIONS: readonly {
  id: BuyTagFilter
  label: string
  title: string
}[] = [
  { id: 'all', label: 'All', title: 'All buys' },
  {
    id: 'not_listed',
    label: 'Not listed',
    title: 'Not listed for sale',
  },
  { id: 'listed', label: 'Listed', title: 'Listed for sale' },
  { id: 'sold', label: 'Sold', title: 'Sold — linked to a sell' },
  { id: 'kept', label: 'Kept', title: 'Kept — not for sale' },
]

const ITEM_TAG_FILTER_OPTIONS: readonly {
  id: ItemTagFilter
  label: string
  title: string
}[] = [
  { id: 'all', label: 'All', title: 'All rows' },
  {
    id: 'needs_tags',
    label: 'Needs tags',
    title: 'Untagged or missing a brand',
  },
]

function buyCashTag(
  move: GearCashMove,
  moves: GearCashMove[],
  keptIds: ReadonlySet<string>,
): BuyCashTag {
  if (keptIds.has(move.id)) return 'kept'
  if (cashGroupOpposites(moves, move).length > 0) return 'sold'
  return effectiveListingStatus(move)
}

/** Display-only: asc matches sortCashMoves; desc reverses dated rows, undated last. */
function sortCashMovesForDisplay(
  moves: GearCashMove[],
  order: CashDateSort,
): GearCashMove[] {
  const asc = sortCashMoves(moves)
  if (order === 'asc') return asc
  const dated: GearCashMove[] = []
  const undated: GearCashMove[] = []
  for (const m of asc) {
    if (m.date?.slice(0, 10)) dated.push(m)
    else undated.push(m)
  }
  return [...dated.reverse(), ...undated]
}

function CashDateSortControl({
  value,
  onChange,
  label,
}: {
  value: CashDateSort
  onChange: (next: CashDateSort) => void
  label: string
}) {
  return (
    <div className="cash-date-sort" role="group" aria-label={`Sort ${label} by date`}>
      <span className="cash-date-sort-label">Date</span>
      <button
        type="button"
        className={`cash-date-sort-btn${value === 'asc' ? ' active' : ''}`}
        aria-pressed={value === 'asc'}
        title="Oldest → newest"
        onClick={() => onChange('asc')}
      >
        Asc
      </button>
      <button
        type="button"
        className={`cash-date-sort-btn${value === 'desc' ? ' active' : ''}`}
        aria-pressed={value === 'desc'}
        title="Newest → oldest"
        onClick={() => onChange('desc')}
      >
        Desc
      </button>
    </div>
  )
}

function CashBuyTagFilter({
  value,
  onChange,
}: {
  value: BuyTagFilter
  onChange: (next: BuyTagFilter) => void
}) {
  return (
    <div
      className="cash-date-sort cash-buy-tag-filter"
      role="group"
      aria-label="Filter buys by tag"
    >
      <span className="cash-date-sort-label">Tag</span>
      {BUY_TAG_FILTER_OPTIONS.map((opt) => (
        <button
          key={opt.id}
          type="button"
          className={`cash-date-sort-btn${value === opt.id ? ' active' : ''}`}
          aria-pressed={value === opt.id}
          title={opt.title}
          onClick={() => onChange(opt.id)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function CashItemTagFilter({
  value,
  onChange,
}: {
  value: ItemTagFilter
  onChange: (next: ItemTagFilter) => void
}) {
  return (
    <div
      className="cash-date-sort cash-buy-tag-filter"
      role="group"
      aria-label="Filter by item tags"
    >
      <span className="cash-date-sort-label">Item tags</span>
      {ITEM_TAG_FILTER_OPTIONS.map((opt) => (
        <button
          key={opt.id}
          type="button"
          className={`cash-date-sort-btn${value === opt.id ? ' active' : ''}`}
          aria-pressed={value === opt.id}
          title={opt.title}
          onClick={() => onChange(opt.id)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

function SoldViaPicker({
  value,
  onChange,
}: {
  value: GearSoldVia | null | undefined
  onChange: (next: GearSoldVia | null) => void
}) {
  const [editing, setEditing] = useState(false)
  const selected = SOLD_VIA.find((s) => s.id === value)

  if (selected && !editing) {
    return (
      <button
        type="button"
        className={`sold-via-compact ${selected.id}`}
        title={`${selected.label} — tap to change`}
        aria-label={`Sold on ${selected.label}. Tap to change.`}
        onClick={(e) => {
          e.stopPropagation()
          setEditing(true)
        }}
      >
        {selected.short}
      </button>
    )
  }

  return (
    <div
      className="sold-via"
      role="group"
      aria-label="Sold on"
      onClick={(e) => e.stopPropagation()}
    >
      {SOLD_VIA.map((opt) => (
        <button
          key={opt.id}
          type="button"
          className={`sold-via-btn ${opt.id}${value === opt.id ? ' active' : ''}`}
          title={opt.label}
          aria-pressed={value === opt.id}
          onClick={() => {
            if (value === opt.id) {
              onChange(null)
              setEditing(true)
              return
            }
            onChange(opt.id)
            setEditing(false)
          }}
        >
          <span className="sold-via-icon" aria-hidden>
            {opt.id === 'fb' ? 'f' : opt.id === 'kijiji' ? 'K' : 'S'}
          </span>
          <span className="sold-via-text">{opt.short}</span>
        </button>
      ))}
    </div>
  )
}

type ProjectedDisplayRow =
  | {
      kind: 'cash'
      id: string
      date: string | null
      move: GearCashMove
      /** True when shown via “Add from buys”, not auto open-not-listed. */
      attached: boolean
    }
  | {
      kind: 'manual'
      id: string
      date: string | null
      row: GearProjectedManualRow
    }

function projectedManualMatchesSearch(
  row: GearProjectedManualRow,
  q: string,
): boolean {
  if (!q) return true
  const tagBits = [
    row.tags?.kind,
    row.tags?.level,
    row.tags?.size,
    row.tags?.gloveSize,
    row.tags?.colour,
    row.tags?.brand,
    row.tags?.detail,
    row.tags?.kind === 'set_gloves' ? 'glove set blocker catcher' : '',
    row.tags?.kind === 'set_full' ? 'full set pads blocker catcher glove' : '',
  ]
    .filter(Boolean)
    .join(' ')
  const parts = [
    row.item ?? '',
    tagBits,
    row.date?.slice(0, 10) ?? '',
    String(row.cost),
    formatMoney(row.cost),
    row.targetSold != null ? String(row.targetSold) : '',
    row.targetSold != null ? formatMoney(row.targetSold) : '',
    'manual',
  ]
  return parts.join(' ').toLowerCase().includes(q)
}

function ProjectedProfitView({
  months,
  monthId,
  onMonthId,
  cash,
  keepList,
  targets,
  onChangeTargets,
  manualRows,
  onChangeManualRows,
  attachedBuys,
  onChangeAttachedBuys,
}: {
  months: GearMonth[]
  monthId: string
  onMonthId: (id: string) => void
  cash: GearCashMove[]
  keepList: GearKeepItem[]
  targets: Record<string, number | null>
  onChangeTargets: (next: Record<string, number | null>) => void
  manualRows: GearProjectedManualRow[]
  onChangeManualRows: (next: GearProjectedManualRow[]) => void
  attachedBuys: Record<string, string[]>
  onChangeAttachedBuys: (next: Record<string, string[]>) => void
}) {
  const [filterSearch, setFilterSearch] = useState('')
  const [addDate, setAddDate] = useState('')
  const [addTags, setAddTags] = useState<GearItemTags>(() => emptyGearTags())
  const [addCost, setAddCost] = useState('')
  const [addTarget, setAddTarget] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDate, setEditDate] = useState('')
  const [editTags, setEditTags] = useState<GearItemTags>(() => emptyGearTags())
  const [editCost, setEditCost] = useState('')
  const [editTarget, setEditTarget] = useState('')
  const [pickFromBuysOpen, setPickFromBuysOpen] = useState(false)
  const [pickSearch, setPickSearch] = useState('')

  const latestMonthId = months[months.length - 1]?.id ?? monthId
  const month =
    months.find((m) => m.id === monthId) ?? months[months.length - 1]
  const isLatestMonth = Boolean(month && month.id === latestMonthId)

  const autoCashRows = useMemo(() => {
    if (!month) return []
    return openNotListedBuysForMonth(
      cash,
      keepList,
      month.id,
      latestMonthId,
    )
  }, [cash, keepList, month, latestMonthId])

  const pinnedCashRows = useMemo(() => {
    if (!month) return []
    return attachedBuysForMonth(
      cash,
      keepList,
      month.id,
      latestMonthId,
      attachedBuys,
    )
  }, [cash, keepList, month, latestMonthId, attachedBuys])

  const availableToAttach = useMemo(() => {
    if (!month) return []
    return buysAvailableToAttach(
      cash,
      keepList,
      month.id,
      latestMonthId,
      attachedBuys,
    )
  }, [cash, keepList, month, latestMonthId, attachedBuys])

  const monthManualRows = useMemo(() => {
    if (!month) return []
    return manualRows.filter((r) => r.monthId === month.id)
  }, [manualRows, month])

  const displayRows = useMemo((): ProjectedDisplayRow[] => {
    const autoIds = new Set(autoCashRows.map((m) => m.id))
    const cashDisplay: ProjectedDisplayRow[] = [
      ...autoCashRows.map((move) => ({
        kind: 'cash' as const,
        id: move.id,
        date: move.date?.slice(0, 10) || null,
        move,
        attached: false,
      })),
      ...pinnedCashRows
        .filter((move) => !autoIds.has(move.id))
        .map((move) => ({
          kind: 'cash' as const,
          id: move.id,
          date: move.date?.slice(0, 10) || null,
          move,
          attached: true,
        })),
    ]
    const manualDisplay: ProjectedDisplayRow[] = monthManualRows.map(
      (row) => ({
        kind: 'manual',
        id: row.id,
        date: row.date?.slice(0, 10) || null,
        row,
      }),
    )
    return [...cashDisplay, ...manualDisplay].sort((a, b) => {
      const ad = a.date || ''
      const bd = b.date || ''
      if (!ad && !bd) return a.id.localeCompare(b.id)
      if (!ad) return 1
      if (!bd) return -1
      if (ad !== bd) return ad.localeCompare(bd)
      return a.id.localeCompare(b.id)
    })
  }, [autoCashRows, pinnedCashRows, monthManualRows])

  const filtered = useMemo(() => {
    const q = filterSearch.trim().toLowerCase()
    if (!q) return displayRows
    return displayRows.filter((entry) =>
      entry.kind === 'cash'
        ? cashMoveMatchesSearch(entry.move, q)
        : projectedManualMatchesSearch(entry.row, q),
    )
  }, [displayRows, filterSearch])

  const pickFiltered = useMemo(() => {
    const q = pickSearch.trim().toLowerCase()
    if (!q) return availableToAttach
    return availableToAttach.filter((m) => cashMoveMatchesSearch(m, q))
  }, [availableToAttach, pickSearch])

  const totals = useMemo(() => {
    let cost = 0
    let targetSum = 0
    let profit = 0
    let withTarget = 0
    for (const entry of filtered) {
      if (entry.kind === 'cash') {
        cost += entry.move.amount
        const t = targets[entry.move.id]
        if (t != null && Number.isFinite(t)) {
          withTarget += 1
          targetSum += t
          profit += t - entry.move.amount
        }
      } else {
        cost += entry.row.cost
        const t = entry.row.targetSold
        if (t != null && Number.isFinite(t)) {
          withTarget += 1
          targetSum += t
          profit += t - entry.row.cost
        }
      }
    }
    return {
      cost: Math.round(cost * 100) / 100,
      /** Sum of target sold amounts — projected cash coming in from priced rows. */
      cashGenerated: Math.round(targetSum * 100) / 100,
      profit: Math.round(profit * 100) / 100,
      withTarget,
      open: filtered.length,
    }
  }, [filtered, targets])

  function setCashTarget(cashMoveId: string, value: number | null) {
    const next = { ...targets }
    if (value == null) delete next[cashMoveId]
    else next[cashMoveId] = value
    onChangeTargets(next)
  }

  function setManualTarget(id: string, value: number | null) {
    onChangeManualRows(
      manualRows.map((r) =>
        r.id === id ? { ...r, targetSold: value } : r,
      ),
    )
  }

  function submitManual(e: FormEvent) {
    e.preventDefault()
    if (!month) return
    if (!tagsReady(addTags)) return
    const name = formatGearItemLabel(addTags)
    const costN = Number(addCost)
    if (!name || !Number.isFinite(costN) || costN < 0) return
    const targetRaw = addTarget.trim()
    let targetSold: number | null = null
    if (targetRaw !== '') {
      const t = Number(targetRaw)
      if (!Number.isFinite(t) || t < 0) return
      targetSold = Math.round(t * 100) / 100
    }
    const entry: GearProjectedManualRow = {
      id: `proj-manual-${Date.now().toString(36)}`,
      monthId: month.id,
      item: name,
      tags: { ...addTags },
      cost: Math.round(costN * 100) / 100,
      targetSold,
      date: addDate.trim() || null,
    }
    onChangeManualRows([...manualRows, entry])
    setAddTags(emptyGearTags())
    setAddCost('')
    setAddTarget('')
    setAddDate('')
  }

  function startEditManual(row: GearProjectedManualRow) {
    setEditingId(row.id)
    setEditDate(row.date?.slice(0, 10) ?? '')
    setEditTags(row.tags ? { ...row.tags } : emptyGearTags())
    setEditCost(String(row.cost))
    setEditTarget(row.targetSold != null ? String(row.targetSold) : '')
  }

  function cancelEditManual() {
    setEditingId(null)
  }

  function saveEditManual(row: GearProjectedManualRow) {
    if (!tagsReady(editTags)) return
    const name = formatGearItemLabel(editTags)
    const costN = Number(editCost)
    if (!name || !Number.isFinite(costN) || costN < 0) return
    const targetRaw = editTarget.trim()
    let targetSold: number | null = null
    if (targetRaw !== '') {
      const t = Number(targetRaw)
      if (!Number.isFinite(t) || t < 0) return
      targetSold = Math.round(t * 100) / 100
    }
    onChangeManualRows(
      manualRows.map((r) =>
        r.id === row.id
          ? {
              ...r,
              item: name,
              tags: { ...editTags },
              cost: Math.round(costN * 100) / 100,
              targetSold,
              date: editDate.trim() || null,
            }
          : r,
      ),
    )
    setEditingId(null)
  }

  function removeManual(id: string) {
    const row = manualRows.find((r) => r.id === id)
    const label = row?.item?.trim() || 'this manual row'
    const ok = confirmRemove(`Remove “${label}” from the projected sheet?`)
    if (!ok) return
    if (editingId === id) setEditingId(null)
    onChangeManualRows(manualRows.filter((r) => r.id !== id))
  }

  function attachBuy(move: GearCashMove) {
    if (!month) return
    onChangeAttachedBuys(
      attachBuyToProjectedMonth(attachedBuys, month.id, move.id),
    )
  }

  function detachBuy(cashMoveId: string) {
    if (!month) return
    const ok = confirmRemove(
      'Remove this buy from the projected sheet? It stays in Cash on hand.',
    )
    if (!ok) return
    onChangeAttachedBuys(
      detachBuyFromProjectedMonth(attachedBuys, month.id, cashMoveId),
    )
  }

  function closePickFromBuys() {
    setPickFromBuysOpen(false)
    setPickSearch('')
  }

  if (!month) {
    return <p className="empty-note">No planner months yet.</p>
  }

  const carryHint = isLatestMonth
    ? 'Open not-listed buys from this month and earlier (unsold inventory carries forward).'
    : 'Open not-listed buys dated in this month only — carry-forward applies on the latest month.'

  return (
    <div className="layout">
      {pickFromBuysOpen ? (
        <div
          className="cash-link-modal-backdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) closePickFromBuys()
          }}
        >
          <div
            className="cash-link-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="projected-add-buys-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="cash-link-modal-header">
              <div>
                <h3 id="projected-add-buys-title">Add from buys</h3>
                <p>
                  Pick open cash buys not already on {month.label}. Listed
                  inventory and buys outside this sheet’s auto list are
                  eligible.
                </p>
              </div>
              <button
                type="button"
                className="icon-btn"
                title="Close"
                aria-label="Close"
                onClick={closePickFromBuys}
              >
                <IconClose />
              </button>
            </div>

            <div className="cash-link-modal-body">
              <label className="cash-filter-search projected-pick-search">
                Search
                <input
                  type="search"
                  value={pickSearch}
                  onChange={(e) => setPickSearch(e.target.value)}
                  placeholder="Item, amount…"
                  autoComplete="off"
                />
              </label>
              {pickFiltered.length === 0 ? (
                <p className="empty-note">
                  {availableToAttach.length === 0
                    ? 'Every eligible buy is already on this sheet.'
                    : 'No buys match this search.'}
                </p>
              ) : (
                <div className="cash-link-section">
                  <h4>
                    {pickFiltered.length} buy
                    {pickFiltered.length === 1 ? '' : 's'}
                  </h4>
                  <ul className="cash-link-candidates">
                    {pickFiltered.map((move) => {
                      const listing = effectiveListingStatus(move)
                      return (
                        <li key={move.id}>
                          <button
                            type="button"
                            className="cash-link-candidate"
                            onClick={() => {
                              attachBuy(move)
                            }}
                          >
                            <span
                              className="cash-link-candidate-check"
                              aria-hidden="true"
                            >
                              +
                            </span>
                            <span className="cash-link-candidate-main">
                              <span className="cash-link-candidate-item">
                                {cashMoveDescLabel(move.item, move.date)}
                              </span>
                              <GearTagPills tags={move.tags} />
                              <span className="cash-link-candidate-meta">
                                {listing === 'listed'
                                  ? 'Listed'
                                  : 'Not listed'}
                              </span>
                            </span>
                            <span className="cash-link-candidate-amt out">
                              −{formatMoney(move.amount)}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}
            </div>

            <div className="cash-link-modal-actions">
              <button
                type="button"
                className="ghost"
                onClick={closePickFromBuys}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary"
                onClick={closePickFromBuys}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="cash-hero projected-hero">
        <div className="cash-hero-grid projected-hero-grid">
          <div>
            <span className="stat-label">Projected profit</span>
            <div
              className={`stat-value ${
                totals.withTarget === 0
                  ? ''
                  : totals.profit >= 0
                    ? 'good'
                    : 'bad'
              }`}
            >
              {totals.withTarget === 0 ? '—' : moneyCell(totals.profit)}
            </div>
            <p className="stat-sub">
              {totals.withTarget > 0
                ? `${totals.withTarget} of ${totals.open} priced · cost ${formatMoney(totals.cost)}`
                : `${totals.open} open · cost ${formatMoney(totals.cost)} · enter targets`}
            </p>
          </div>
          <div>
            <span className="stat-label">Cash generated</span>
            <div
              className={`stat-value ${
                totals.withTarget === 0 ? '' : 'good'
              }`}
            >
              {totals.withTarget === 0
                ? '—'
                : moneyCell(totals.cashGenerated)}
            </div>
            <p className="stat-sub">
              Sum of target sold
              {totals.withTarget > 0
                ? ` · inventory out ${formatMoney(totals.cost)}`
                : ''}
            </p>
          </div>
          <label className="cash-opening projected-month-pick">
            Month
            <select
              value={month.id}
              onChange={(e) => onMonthId(e.target.value)}
            >
              {months.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} {m.id.slice(0, 4)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="cash-filters">
        <label className="cash-filter-search">
          Search
          <input
            type="search"
            value={filterSearch}
            onChange={(e) => setFilterSearch(e.target.value)}
            placeholder="Item, amount…"
            autoComplete="off"
          />
        </label>
        {filterSearch.trim() ? (
          <button
            type="button"
            className="ghost"
            onClick={() => setFilterSearch('')}
          >
            Clear
          </button>
        ) : null}
      </div>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Add projected item</h2>
            <p>
              Freeform row, or pull an existing cash buy onto this month’s
              sheet
            </p>
          </div>
          <div className="panel-filters">
            <button
              type="button"
              className="ghost"
              onClick={() => setPickFromBuysOpen(true)}
            >
              Add from buys
            </button>
          </div>
        </div>
        <form className="cash-compose projected-compose" onSubmit={submitManual}>
          <div className="cash-compose-fields">
            <label>
              Date
              <input
                type="date"
                value={addDate}
                onChange={(e) => setAddDate(e.target.value)}
              />
            </label>
            <label>
              Cost
              <div className="cash-amount-wrap">
                <span className="out">−</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={addCost}
                  onChange={(e) => setAddCost(e.target.value)}
                  placeholder="0.00"
                  required
                />
              </div>
            </label>
            <label>
              Target sold
              <div className="cash-amount-wrap">
                <span className="in">+</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={addTarget}
                  onChange={(e) => setAddTarget(e.target.value)}
                  placeholder="Optional"
                />
              </div>
            </label>
          </div>
          <GearItemTagsFields value={addTags} onChange={setAddTags} />
          <div className="cash-compose-actions">
            <p className="hint">Adds to {month.label} only</p>
            <button
              type="submit"
              className="primary"
              disabled={!tagsReady(addTags)}
            >
              Add
            </button>
          </div>
        </form>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>{month.label} · projected inventory</h2>
            <p>
              {carryHint} Manual rows and buys added from the ledger appear
              here too.
            </p>
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="empty-note">
            {displayRows.length === 0
              ? 'Nothing for this month yet. Add a buy on Cash ledger, use Add from buys, or add a freeform row above.'
              : 'No rows match this search.'}
          </p>
        ) : (
          <ul className="cash-timeline projected-list">
            {filtered.map((entry) => {
              if (entry.kind === 'cash') {
                const move = entry.move
                const target = targets[move.id] ?? null
                const profit =
                  target != null
                    ? Math.round((target - move.amount) * 100) / 100
                    : null
                const undated = !move.date?.slice(0, 10)
                const listing = effectiveListingStatus(move)
                const buyYm = move.date?.slice(0, 7) || ''
                const carriedIn =
                  !entry.attached &&
                  isLatestMonth &&
                  Boolean(buyYm) &&
                  buyYm < month.id
                return (
                  <li
                    key={`cash-${move.id}`}
                    className="cash-move buy-row projected-row"
                  >
                    <CashMoveRail tone="out" />
                    <div className="cash-move-main">
                      <CashMoveDesc
                        item={move.item}
                        date={move.date}
                        tags={move.tags}
                      />
                      <div className="cash-move-meta">
                        <span
                          className={
                            listing === 'listed'
                              ? 'status-tag status-tag-listed'
                              : 'status-tag status-tag-not-listed'
                          }
                        >
                          {listing === 'listed' ? 'Listed' : 'Not listed'}
                        </span>
                        <span className="projected-source-hint">
                          {entry.attached ? 'Added from buys' : 'From buy'}
                        </span>
                        {carriedIn ? (
                          <span className="projected-undated-hint">
                            Carried from {buyYm}
                          </span>
                        ) : null}
                        {undated ? (
                          <span className="projected-undated-hint">
                            Undated · latest month
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="cash-move-side projected-side">
                      <div className="projected-figures">
                        <div className="projected-field">
                          <span className="projected-field-label">Cost</span>
                          <span className="cash-delta out">
                            −{formatMoney(move.amount)}
                          </span>
                        </div>
                        <label className="projected-field">
                          <span className="projected-field-label">
                            Target sold
                          </span>
                          <div className="cash-amount-wrap projected-target-wrap">
                            <span className="in">+</span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              className="projected-target-input"
                              value={target ?? ''}
                              placeholder="—"
                              aria-label={`Target sold for ${move.item || 'item'}`}
                              onChange={(e) => {
                                const raw = e.target.value
                                if (raw === '') {
                                  setCashTarget(move.id, null)
                                  return
                                }
                                const n = Number(raw)
                                if (!Number.isFinite(n) || n < 0) return
                                setCashTarget(
                                  move.id,
                                  Math.round(n * 100) / 100,
                                )
                              }}
                            />
                          </div>
                        </label>
                        <div className="projected-field">
                          <span className="projected-field-label">Profit</span>
                          <span
                            className={`cash-delta ${
                              profit == null
                                ? 'muted'
                                : profit >= 0
                                  ? 'in'
                                  : 'out'
                            }`}
                          >
                            {profit == null
                              ? '—'
                              : `${profit >= 0 ? '+' : '−'}${formatMoney(Math.abs(profit))}`}
                          </span>
                        </div>
                      </div>
                      {entry.attached ? (
                        <div className="cash-move-actions">
                          <button
                            type="button"
                            className="icon-btn danger"
                            title="Remove from sheet"
                            aria-label="Remove from projected sheet"
                            onClick={() => detachBuy(move.id)}
                          >
                            <IconTrash />
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </li>
                )
              }

              const row = entry.row
              const target = row.targetSold ?? null
              const profit =
                target != null
                  ? Math.round((target - row.cost) * 100) / 100
                  : null
              const isEditing = editingId === row.id
              return (
                <li
                  key={`manual-${row.id}`}
                  className={`cash-move buy-row projected-row projected-manual-row${
                    isEditing ? ' is-editing' : ''
                  }`}
                >
                  <CashMoveRail tone="out" />
                  <div className="cash-move-main">
                    <div className="cash-move-item">{row.item}</div>
                    <GearTagPills tags={row.tags} />
                    <div className="cash-move-meta">
                      <time className="cash-move-date">
                        {row.date?.slice(0, 10) || 'No date'}
                      </time>
                      <span className="status-tag status-tag-manual">
                        Manual
                      </span>
                    </div>
                  </div>
                  <div className="cash-move-side projected-side">
                    <div className="projected-figures">
                      <div className="projected-field">
                        <span className="projected-field-label">Cost</span>
                        <span className="cash-delta out">
                          −{formatMoney(row.cost)}
                        </span>
                      </div>
                      <label className="projected-field">
                        <span className="projected-field-label">
                          Target sold
                        </span>
                        <div className="cash-amount-wrap projected-target-wrap">
                          <span className="in">+</span>
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            className="projected-target-input"
                            value={target ?? ''}
                            placeholder="—"
                            aria-label={`Target sold for ${row.item}`}
                            onChange={(e) => {
                              const raw = e.target.value
                              if (raw === '') {
                                setManualTarget(row.id, null)
                                return
                              }
                              const n = Number(raw)
                              if (!Number.isFinite(n) || n < 0) return
                              setManualTarget(
                                row.id,
                                Math.round(n * 100) / 100,
                              )
                            }}
                          />
                        </div>
                      </label>
                      <div className="projected-field">
                        <span className="projected-field-label">Profit</span>
                        <span
                          className={`cash-delta ${
                            profit == null
                              ? 'muted'
                              : profit >= 0
                                ? 'in'
                                : 'out'
                          }`}
                        >
                          {profit == null
                            ? '—'
                            : `${profit >= 0 ? '+' : '−'}${formatMoney(Math.abs(profit))}`}
                        </span>
                      </div>
                    </div>
                    <div className="cash-move-actions">
                      <button
                        type="button"
                        className={`icon-btn${isEditing ? ' active-toggle' : ''}`}
                        aria-pressed={isEditing}
                        title={isEditing ? 'Close edit' : 'Edit'}
                        aria-label={isEditing ? 'Close edit' : 'Edit'}
                        onClick={() =>
                          isEditing ? cancelEditManual() : startEditManual(row)
                        }
                      >
                        {isEditing ? <IconClose /> : <IconEdit />}
                      </button>
                      <button
                        type="button"
                        className="icon-btn danger"
                        title="Remove"
                        aria-label="Remove manual row"
                        onClick={() => removeManual(row.id)}
                      >
                        <IconTrash />
                      </button>
                    </div>
                  </div>
                  {isEditing ? (
                    <form
                      className="cash-move-edit"
                      onSubmit={(e) => {
                        e.preventDefault()
                        saveEditManual(row)
                      }}
                    >
                      <div className="cash-move-edit-fields">
                        <label>
                          Date
                          <input
                            type="date"
                            value={editDate}
                            onChange={(e) => setEditDate(e.target.value)}
                          />
                        </label>
                        <label>
                          Cost
                          <div className="cash-amount-wrap">
                            <span className="out">−</span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={editCost}
                              onChange={(e) => setEditCost(e.target.value)}
                              required
                            />
                          </div>
                        </label>
                        <label>
                          Target sold
                          <div className="cash-amount-wrap">
                            <span className="in">+</span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={editTarget}
                              onChange={(e) => setEditTarget(e.target.value)}
                              placeholder="Optional"
                            />
                          </div>
                        </label>
                      </div>
                      <GearItemTagsFields value={editTags} onChange={setEditTags} />
                      <div className="cash-move-edit-actions">
                        <button
                          type="button"
                          className="icon-btn"
                          title="Cancel"
                          aria-label="Cancel"
                          onClick={cancelEditManual}
                        >
                          <IconClose />
                        </button>
                        <button
                          type="submit"
                          className="icon-btn primary"
                          title="Save"
                          aria-label="Save"
                          disabled={!tagsReady(editTags)}
                        >
                          <IconCheck />
                        </button>
                      </div>
                    </form>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}

        {filtered.length > 0 ? (
          <div className="projected-footer">
            <span className="projected-footer-label">
              Month projected profit
              {totals.withTarget < filtered.length
                ? ` (${totals.withTarget} of ${filtered.length} priced)`
                : ''}
              {totals.withTarget > 0
                ? ` · cash generated ${formatMoney(totals.cashGenerated)}`
                : ''}
            </span>
            <div className="projected-footer-figures">
              <span className="projected-footer-spacer" />
              <span className="projected-footer-spacer" />
              <strong
                className={
                  totals.withTarget === 0
                    ? ''
                    : totals.profit >= 0
                      ? 'leftover good'
                      : 'leftover bad'
                }
              >
                {totals.withTarget === 0 ? '—' : moneyCell(totals.profit)}
              </strong>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  )
}

function CashLedger({
  openingBalance,
  moves,
  keepList,
  projectedTargets,
  onChangeOpening,
  onChangeMoves,
  onKeepBuy,
  onViewReceipt,
  itemTagFilter,
  onItemTagFilterChange,
}: {
  openingBalance: number
  moves: GearCashMove[]
  keepList: GearKeepItem[]
  projectedTargets: Record<string, number | null>
  onChangeOpening: (n: number) => void
  onChangeMoves: (moves: GearCashMove[]) => void
  onKeepBuy: (move: GearCashMove) => void
  onViewReceipt: () => void
  itemTagFilter: ItemTagFilter
  onItemTagFilterChange: (next: ItemTagFilter) => void
}) {
  const [mode, setMode] = useState<'in' | 'out'>('out')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [tags, setTags] = useState<GearItemTags>(() => emptyGearTags())
  const [amount, setAmount] = useState('')
  const [soldVia, setSoldVia] = useState<GearSoldVia | null>(null)
  /** When set, new sell is linked to this buy after insert. */
  const [matchBuyId, setMatchBuyId] = useState<string | null>(null)
  const [matchKey, setMatchKey] = useState('')
  const [sellDetailsOpen, setSellDetailsOpen] = useState(false)
  const [showBuys, setShowBuys] = useState(true)
  const [showSells, setShowSells] = useState(true)
  /** Newest first — date is part of the default description. */
  const [buyDateSort, setBuyDateSort] = useState<CashDateSort>('desc')
  const [sellDateSort, setSellDateSort] = useState<CashDateSort>('desc')
  const [buyTagFilter, setBuyTagFilter] = useState<BuyTagFilter>('all')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterItem, setFilterItem] = useState('')
  const [filterSearch, setFilterSearch] = useState('')
  const [filterSearchBuys, setFilterSearchBuys] = useState('')
  const [filterSearchSells, setFilterSearchSells] = useState('')
  const [filterSearchScope, setFilterSearchScope] =
    useState<CashSearchScope>('both')
  /** Independent buy vs sell queries (only when scope is Both). */
  const [searchSplit, setSearchSplit] = useState(false)
  const [highlightId, setHighlightId] = useState<string | null>(null)
  const [highlightSourceId, setHighlightSourceId] = useState<string | null>(
    null,
  )
  // Row tap expands summary on that row only; ledger icon uses highlight* to jump.
  const [summaryId, setSummaryId] = useState<string | null>(null)
  const [pairAnimating, setPairAnimating] = useState(false)
  const [linkingId, setLinkingId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editDate, setEditDate] = useState('')
  const [editTags, setEditTags] = useState<GearItemTags>(() => emptyGearTags())
  const [editAmount, setEditAmount] = useState('')
  const [editSoldVia, setEditSoldVia] = useState<GearSoldVia | null>(null)
  const [editNotes, setEditNotes] = useState('')
  const [notesId, setNotesId] = useState<string | null>(null)
  const [draftNotes, setDraftNotes] = useState('')
  const [composeNotes, setComposeNotes] = useState('')
  const [cashMathOpen, setCashMathOpen] = useState(false)
  const [profitMonthId, setProfitMonthId] = useState(
    () => new Date().toISOString().slice(0, 7),
  )
  const [pendingJump, setPendingJump] = useState<{
    id: string
    direction: 'in' | 'out'
    sourceId?: string
  } | null>(null)

  const buys = useMemo(
    () => sortCashMoves(moves.filter((m) => m.direction === 'out')),
    [moves],
  )
  const sells = useMemo(
    () => sortCashMoves(moves.filter((m) => m.direction === 'in')),
    [moves],
  )
  const itemOptions = useMemo(() => {
    const seen = new Map<string, string>()
    for (const m of moves) {
      const key = normalizeCashItem(m.item)
      if (!key || seen.has(key)) continue
      seen.set(key, (m.item ?? '').trim())
    }
    return [...seen.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([key, label]) => ({ key, label }))
  }, [moves])

  const excludedBuys = useMemo(() => keptBuyIds(keepList), [keepList])

  const sellItemSuggestions = useMemo(
    () => suggestSellItemNames(moves, excludedBuys),
    [moves, excludedBuys],
  )

  function applySellSuggestion(
    s: SellItemSuggestion,
    apply: (next: GearItemTags) => void,
  ) {
    if (s.tags) {
      apply({ ...s.tags })
      return
    }
    apply({
      ...emptyGearTags(),
      kind: 'other',
      detail: s.label,
    })
  }

  function pickInventoryMatch(s: SellItemSuggestion) {
    applySellSuggestion(s, setTags)
    setMatchKey(s.key)
    setMatchBuyId(s.buyId ?? null)
    setSellDetailsOpen(false)
  }

  function clearInventoryMatch() {
    setMatchKey('')
    setMatchBuyId(null)
    setTags(emptyGearTags())
    setSellDetailsOpen(false)
  }

  function resetComposeForMode(next: 'in' | 'out') {
    setMode(next)
    setMatchKey('')
    setMatchBuyId(null)
    setSellDetailsOpen(false)
    if (next === 'out') setSoldVia(null)
  }

  const buySearchQuery = searchSplit
    ? filterSearchBuys
    : filterSearchScope === 'sells'
      ? ''
      : filterSearch
  const sellSearchQuery = searchSplit
    ? filterSearchSells
    : filterSearchScope === 'buys'
      ? ''
      : filterSearch

  const filteredBuys = useMemo(() => {
    const q = buySearchQuery.trim().toLowerCase()
    const filtered = buys.filter((move) => {
      if (filterDateFrom) {
        const d = move.date?.slice(0, 10) || ''
        if (!d || d < filterDateFrom) return false
      }
      if (filterItem && normalizeCashItem(move.item) !== filterItem) return false
      if (q && !cashMoveMatchesSearch(move, q)) return false
      if (buyTagFilter !== 'all') {
        const tag = buyCashTag(move, moves, excludedBuys)
        if (tag !== buyTagFilter) return false
      }
      if (
        itemTagFilter === 'needs_tags' &&
        !cashMoveNeedsInsightTags(move)
      ) {
        return false
      }
      return true
    })
    return sortCashMovesForDisplay(filtered, buyDateSort)
  }, [
    buySearchQuery,
    buys,
    buyDateSort,
    buyTagFilter,
    excludedBuys,
    filterDateFrom,
    filterItem,
    itemTagFilter,
    moves,
  ])

  const filteredSells = useMemo(() => {
    const q = sellSearchQuery.trim().toLowerCase()
    const filtered = sells.filter((move) => {
      if (filterDateFrom) {
        const d = move.date?.slice(0, 10) || ''
        if (!d || d < filterDateFrom) return false
      }
      if (filterItem && normalizeCashItem(move.item) !== filterItem) return false
      if (q && !cashMoveMatchesSearch(move, q)) return false
      if (
        itemTagFilter === 'needs_tags' &&
        !cashMoveNeedsInsightTags(move)
      ) {
        return false
      }
      return true
    })
    return sortCashMovesForDisplay(filtered, sellDateSort)
  }, [
    sellSearchQuery,
    sells,
    sellDateSort,
    filterDateFrom,
    filterItem,
    itemTagFilter,
  ])

  const filtersActive = Boolean(
    filterDateFrom ||
      filterItem ||
      filterSearch.trim() ||
      filterSearchBuys.trim() ||
      filterSearchSells.trim() ||
      filterSearchScope !== 'both' ||
      searchSplit ||
      itemTagFilter !== 'all',
  )
  const searchAppliesToBuys = Boolean(buySearchQuery.trim())
  const searchAppliesToSells = Boolean(sellSearchQuery.trim())

  function enableSearchSplit() {
    const shared = filterSearch
    setFilterSearchBuys(shared)
    setFilterSearchSells(shared)
    setFilterSearchScope('both')
    setSearchSplit(true)
  }

  function combineSearchSplit() {
    const buysQ = filterSearchBuys.trim()
    const sellsQ = filterSearchSells.trim()
    const shared =
      buysQ && sellsQ && buysQ !== sellsQ
        ? buysQ
        : buysQ || sellsQ || filterSearch
    setFilterSearch(shared)
    setFilterSearchBuys('')
    setFilterSearchSells('')
    setSearchSplit(false)
  }

  function changeSearchScope(next: CashSearchScope) {
    if (searchSplit && next !== 'both') {
      const fromSplit =
        next === 'buys' ? filterSearchBuys : filterSearchSells
      setFilterSearch(fromSplit || filterSearch)
      setFilterSearchBuys('')
      setFilterSearchSells('')
      setSearchSplit(false)
    }
    setFilterSearchScope(next)
  }

  function clearCashFilters() {
    setFilterDateFrom('')
    setFilterItem('')
    setFilterSearch('')
    setFilterSearchBuys('')
    setFilterSearchSells('')
    setFilterSearchScope('both')
    setSearchSplit(false)
    onItemTagFilterChange('all')
  }
  const buyFiltersActive =
    Boolean(filterDateFrom || filterItem || searchAppliesToBuys) ||
    buyTagFilter !== 'all' ||
    itemTagFilter !== 'all'
  const sellFiltersActive = Boolean(
    filterDateFrom || filterItem || searchAppliesToSells || itemTagFilter !== 'all',
  )
  const filteredMoneyOut = sumNullable(filteredBuys.map((m) => m.amount))
  const filteredMoneyIn = sumNullable(filteredSells.map((m) => m.amount))

  const movesById = useMemo(
    () => new Map(moves.map((m) => [m.id, m])),
    [moves],
  )
  const linkingFrom = linkingId ? (movesById.get(linkingId) ?? null) : null
  const linkCandidates = useMemo(
    () => (linkingFrom ? rankLinkCandidates(moves, linkingFrom) : []),
    [moves, linkingFrom],
  )
  const timeline = useMemo(
    () => cashTimeline(openingBalance, moves),
    [openingBalance, moves],
  )
  const balance = cashBalance(openingBalance, moves)
  const moneyIn = sumNullable(sells.map((m) => m.amount))
  const moneyOut = sumNullable(buys.map((m) => m.amount))
  const inventorySummary = useMemo(
    () => openInventoryProjectedSummary(moves, keepList, projectedTargets),
    [moves, keepList, projectedTargets],
  )
  const monthFlipProfit = useMemo(
    () => realizedFlipProfitForMonth(moves, profitMonthId),
    [moves, profitMonthId],
  )
  const profitMonthLabel = useMemo(
    () => formatProfitMonthLabel(profitMonthId),
    [profitMonthId],
  )

  useEffect(() => {
    if (!pendingJump) return
    const { id, direction, sourceId } = pendingJump
    const visible =
      direction === 'out' ? showBuys : showSells
    if (!visible) return
    const el = document.getElementById(`cash-move-${id}`)
    if (!el) return
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    setHighlightId(id)
    setHighlightSourceId(sourceId ?? null)
    setPairAnimating(false)
    const kick = window.requestAnimationFrame(() => {
      setPairAnimating(true)
    })
    setPendingJump(null)
    const t = window.setTimeout(() => {
      setPairAnimating(false)
    }, 1250)
    return () => {
      window.cancelAnimationFrame(kick)
      window.clearTimeout(t)
    }
  }, [pendingJump, showBuys, showSells])

  useEffect(() => {
    if (linkingId && !movesById.has(linkingId)) setLinkingId(null)
    if (editingId && !movesById.has(editingId)) setEditingId(null)
    if (notesId && !movesById.has(notesId)) setNotesId(null)
  }, [linkingId, editingId, notesId, movesById])

  useEffect(() => {
    if (!linkingId) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setLinkingId(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [linkingId])

  // Keep pairs linked, seed dates honest, and ledger in date order.
  useEffect(() => {
    const next = autoLinkCashMoves(reconcileSeedCashDates(moves))
    if (cashLinksChanged(moves, next)) onChangeMoves(next)
  }, [moves, onChangeMoves])

  function jumpToPair(
    id: string,
    direction: 'in' | 'out',
    sourceId?: string,
  ) {
    setSummaryId(null)
    if (direction === 'out') setShowBuys(true)
    else setShowSells(true)
    setPendingJump({ id, direction, sourceId })
  }

  function oppositesOf(move: GearCashMove): GearCashMove[] {
    return cashGroupOpposites(moves, move)
  }

  function membersOf(move: GearCashMove): GearCashMove[] {
    return cashGroupMembers(moves, move)
  }

  function isLinked(move: GearCashMove): boolean {
    return oppositesOf(move).length > 0
  }

  function startLink(move: GearCashMove) {
    setEditingId(null)
    setNotesId(null)
    setSummaryId(null)
    setLinkingId(move.id)
  }

  function startEdit(move: GearCashMove) {
    setLinkingId(null)
    setNotesId(null)
    setSummaryId(null)
    setEditingId(move.id)
    setEditDate(move.date?.slice(0, 10) || '')
    setEditTags(
      move.tags
        ? { ...move.tags }
        : {
            ...emptyGearTags(),
            kind: 'other',
            detail: move.item || null,
          },
    )
    setEditAmount(String(move.amount))
    setEditSoldVia(move.soldVia ?? null)
    setEditNotes(move.notes ?? '')
  }

  function cancelEdit() {
    setEditingId(null)
  }

  function startNotes(move: GearCashMove) {
    setLinkingId(null)
    setEditingId(null)
    setSummaryId(null)
    setNotesId(move.id)
    setDraftNotes(move.notes ?? '')
  }

  function cancelNotes() {
    setNotesId(null)
    setDraftNotes('')
  }

  function saveNotes(move: GearCashMove) {
    const next = draftNotes.trim() || null
    patchMove(move.id, { notes: next })
    setNotesId(null)
    setDraftNotes('')
  }

  function saveEdit(move: GearCashMove) {
    const n = Number(editAmount)
    if (!Number.isFinite(n) || n <= 0) return
    if (!tagsReady(editTags)) return
    const nextDate = editDate || null
    const nextItem = formatGearItemLabel(editTags) || null
    const patched = moves.map((m) =>
      m.id === move.id
        ? {
            ...m,
            date: nextDate,
            item: nextItem,
            tags: { ...editTags },
            amount: n,
            soldVia: m.direction === 'in' ? editSoldVia : null,
            notes: editNotes.trim() || null,
            // Allow same-name rematch after edits.
            linkLocked: false,
          }
        : m,
    )
    onChangeMoves(autoLinkCashMoves(sortCashMoves(patched)))
    setEditingId(null)
  }

  function cancelLink() {
    setLinkingId(null)
  }

  function toggleLinkCandidate(target: GearCashMove) {
    if (!linkingFrom) return
    if (target.direction === linkingFrom.direction) return
    const already =
      Boolean(linkingFrom.linkGroupId) &&
      target.linkGroupId === linkingFrom.linkGroupId
    if (already) {
      onChangeMoves(unlinkCashMove(moves, target.id))
      return
    }
    onChangeMoves(linkCashMoves(moves, linkingFrom.id, target.id))
  }

  function unlink(id: string) {
    onChangeMoves(unlinkCashMove(moves, id))
    if (linkingId === id) setLinkingId(null)
  }

  function activateRow(move: GearCashMove) {
    if (linkingFrom) return
    if (editingId) return
    if (notesId) return
    const opposites = oppositesOf(move)
    if (opposites.length) {
      // Expand summary on this row only — partner stays collapsed.
      setSummaryId((cur) => (cur === move.id ? null : move.id))
      setHighlightId(null)
      setHighlightSourceId(null)
      setPairAnimating(false)
      return
    }
    setSummaryId(null)
    setHighlightId(null)
    setHighlightSourceId(null)
    setPairAnimating(false)
  }

  function pairSummaryLabel(move: GearCashMove): string | undefined {
    if (!oppositesOf(move).length) return undefined
    return 'Show purchase / sale summary'
  }

  function toggleListingStatus(move: GearCashMove) {
    if (move.direction !== 'out') return
    if (excludedBuys.has(move.id)) return
    const next: GearListingStatus =
      effectiveListingStatus(move) === 'listed' ? 'not_listed' : 'listed'
    patchMove(move.id, { listingStatus: next })
  }

  function renderPairSummary(move: GearCashMove) {
    const members = membersOf(move)
    const fromChainJump =
      highlightId === move.id ||
      highlightSourceId === move.id ||
      (move.linkGroupId != null &&
        members.some(
          (m) => m.id === highlightId || m.id === highlightSourceId,
        ))
    const fromRowTap = summaryId === move.id
    if (!fromChainJump && !fromRowTap) return null
    const stats = cashGroupEconomics(moves, move)
    if (!stats) return null
    const profit = stats.profit
    return (
      <div
        className="cash-pair-summary"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cash-pair-summary-row">
          <span>
            Purchased
            {stats.buys.length > 1 ? ` · ${stats.buys.length}` : ''}
          </span>
          <strong className="out">{formatMoney(stats.purchased)}</strong>
        </div>
        <div className="cash-pair-summary-row">
          <span>
            Sold
            {stats.sells.length > 1 ? ` · ${stats.sells.length}` : ''}
          </span>
          <strong className="in">{formatMoney(stats.sold)}</strong>
        </div>
        <div className="cash-pair-summary-row result">
          <span>{profit >= 0 ? 'Profit' : 'Loss'}</span>
          <strong className={profit >= 0 ? 'in' : 'out'}>
            {profit >= 0 ? '+' : '−'}
            {formatMoney(Math.abs(profit))}
          </strong>
        </div>
      </div>
    )
  }

  function renderPairLink(move: GearCashMove) {
    const opposites = oppositesOf(move)
    if (!opposites.length) return null
    return (
      <span className="cash-pair-links">
        {opposites.map((partner) => {
          const noun = move.direction === 'out' ? 'sell' : 'buy'
          const label = `Jump to linked ${noun} · ${partner.item || 'Untitled'}`
          return (
            <button
              key={partner.id}
              type="button"
              className="cash-pair-link"
              title={label}
              aria-label={label}
              onClick={(e) => {
                e.stopPropagation()
                jumpToPair(partner.id, partner.direction, move.id)
              }}
            >
              <IconLedger />
            </button>
          )
        })}
      </span>
    )
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    const n = Number(amount)
    if (!Number.isFinite(n) || n <= 0) return
    if (!tagsReady(tags)) return
    const label = formatGearItemLabel(tags)
    const move: GearCashMove = {
      id: `cash-${Date.now()}`,
      date: date || null,
      type: mode === 'in' ? 'SELL' : 'BUY',
      item: label || null,
      tags: { ...tags },
      amount: n,
      direction: mode,
      soldVia: mode === 'in' ? soldVia : null,
      linkGroupId: null,
      linkedMoveId: null,
      listingStatus: mode === 'out' ? 'not_listed' : null,
      notes: composeNotes.trim() || null,
      createdAt: new Date().toISOString(),
    }
    let next = autoLinkCashMoves(insertCashMoveSorted(moves, move))
    if (mode === 'in' && matchBuyId) {
      next = linkCashMoves(next, move.id, matchBuyId)
    }
    onChangeMoves(next)
    setTags(emptyGearTags())
    setAmount('')
    setComposeNotes('')
    setMatchKey('')
    setMatchBuyId(null)
    setSellDetailsOpen(false)
    if (mode === 'in') setSoldVia(null)
  }

  function removeMove(id: string) {
    const move = moves.find((m) => m.id === id)
    const label = move?.item?.trim() || 'this cash move'
    const ok = confirmRemove(`Remove “${label}” from Cash on hand?`)
    if (!ok) return
    if (linkingId === id) setLinkingId(null)
    if (editingId === id) setEditingId(null)
    if (notesId === id) setNotesId(null)
    if (summaryId === id) setSummaryId(null)
    if (
      highlightId === id ||
      highlightSourceId === id
    ) {
      setHighlightId(null)
      setHighlightSourceId(null)
      setPairAnimating(false)
    }
    onChangeMoves(removeCashMove(moves, id))
  }

  function patchMove(id: string, patch: Partial<GearCashMove>) {
    onChangeMoves(moves.map((m) => (m.id === id ? { ...m, ...patch } : m)))
  }

  function rowClass(move: GearCashMove, base: string) {
    const members = membersOf(move)
    const inFocusedGroup =
      move.linkGroupId != null &&
      members.some(
        (m) => m.id === highlightId || m.id === highlightSourceId,
      )
    const isTarget = highlightId === move.id
    const isSource = highlightSourceId === move.id
    const isHighlight = isTarget || isSource || inFocusedGroup
    const tone = move.direction === 'in' ? 'in' : 'out'
    const flash = isHighlight
      ? ` pair-highlight pair-highlight-${tone}${isTarget && pairAnimating ? ' pair-animating' : ''}`
      : ''
    const interactive =
      !editingId && isLinked(move) ? ' is-interactive' : ''
    const editing = editingId === move.id ? ' is-editing' : ''
    const noting = notesId === move.id ? ' is-noting' : ''
    return `${base}${flash}${interactive}${editing}${noting}`
  }

  function renderMoveActions(move: GearCashMove) {
    const opposites = oppositesOf(move)
    const paired = opposites.length > 0
    const sameNamePair =
      paired &&
      opposites.every(
        (p) => normalizeCashItem(move.item) === normalizeCashItem(p.item),
      )
    const isEditing = editingId === move.id
    const isLinking = linkingFrom?.id === move.id
    const isNotesOpen = notesId === move.id
    const hasNote = Boolean(move.notes?.trim())
    const isBuy = move.direction === 'out'
    const alreadyKept = isBuy && excludedBuys.has(move.id)
    return (
      <div
        className="cash-move-actions"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className={`icon-btn${isEditing ? ' active-toggle' : ''}`}
          aria-pressed={isEditing}
          title={isEditing ? 'Close edit' : 'Edit'}
          aria-label={isEditing ? 'Close edit' : 'Edit'}
          onClick={() => (isEditing ? cancelEdit() : startEdit(move))}
        >
          {isEditing ? <IconClose /> : <IconEdit />}
        </button>
        <button
          type="button"
          className={`icon-btn${isNotesOpen ? ' active-toggle' : ''}${hasNote ? ' has-note' : ''}`}
          aria-pressed={isNotesOpen}
          title={
            isNotesOpen
              ? 'Close notes'
              : hasNote
                ? 'View / edit notes'
                : 'Add notes'
          }
          aria-label={
            isNotesOpen
              ? 'Close notes'
              : hasNote
                ? 'View or edit notes'
                : 'Add notes'
          }
          onClick={() => (isNotesOpen ? cancelNotes() : startNotes(move))}
        >
          <IconNote />
        </button>
        {isBuy && !alreadyKept ? (
          <button
            type="button"
            className="icon-btn"
            title="Keep (not for sale)"
            aria-label="Keep — not for sale"
            onClick={() => onKeepBuy(move)}
          >
            <IconKeep />
          </button>
        ) : null}
        {paired && !sameNamePair ? (
          <button
            type="button"
            className="icon-btn"
            title="Unlink from group"
            aria-label="Unlink from group"
            onClick={() => unlink(move.id)}
          >
            <IconUnlink />
          </button>
        ) : null}
        <button
          type="button"
          className={`icon-btn${isLinking ? ' active-toggle' : ''}`}
          aria-pressed={isLinking}
          title={
            isLinking ? 'Done linking' : paired ? 'Add to link group' : 'Link'
          }
          aria-label={
            isLinking ? 'Done linking' : paired ? 'Add to link group' : 'Link'
          }
          onClick={() => (isLinking ? cancelLink() : startLink(move))}
        >
          {isLinking ? <IconCheck /> : <IconLink />}
        </button>
        <button
          type="button"
          className="icon-btn danger"
          title="Remove"
          aria-label="Remove"
          onClick={() => removeMove(move.id)}
        >
          <IconTrash />
        </button>
      </div>
    )
  }

  function renderEditSection(move: GearCashMove) {
    if (editingId !== move.id) return null
    return (
      <form
        className="cash-move-edit"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          saveEdit(move)
        }}
      >
        <div className="cash-move-edit-fields">
          <label>
            Date
            <input
              type="date"
              value={editDate}
              onChange={(e) => setEditDate(e.target.value)}
            />
          </label>
          <label>
            Amount
            <div className="cash-amount-wrap">
              <span className={move.direction}>
                {move.direction === 'in' ? '+' : '−'}
              </span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={editAmount}
                onChange={(e) => setEditAmount(e.target.value)}
                required
              />
            </div>
          </label>
          <label className="span-2">
            Notes
            <textarea
              className="cash-notes-input"
              rows={2}
              value={editNotes}
              onChange={(e) => setEditNotes(e.target.value)}
              placeholder="Optional"
            />
          </label>
        </div>
        <GearItemTagsFields value={editTags} onChange={setEditTags} />
        {move.direction === 'in' ? (
          <>
            <InventoryMatchPicker
              suggestions={sellItemSuggestions}
              selectedKey={normalizeCashItem(formatGearItemLabel(editTags))}
              onPick={(s) => applySellSuggestion(s, setEditTags)}
            />
            <label className="cash-via-field">
              Sold on
              <SoldViaPicker value={editSoldVia} onChange={setEditSoldVia} />
            </label>
          </>
        ) : null}
        <div className="cash-move-edit-actions">
          <button
            type="button"
            className="icon-btn"
            title="Cancel"
            aria-label="Cancel"
            onClick={cancelEdit}
          >
            <IconClose />
          </button>
          <button
            type="submit"
            className="icon-btn primary"
            title="Save"
            aria-label="Save"
            disabled={!tagsReady(editTags)}
          >
            <IconCheck />
          </button>
        </div>
      </form>
    )
  }

  function renderNotesSection(move: GearCashMove) {
    if (notesId !== move.id) return null
    return (
      <form
        className="cash-move-notes"
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault()
          saveNotes(move)
        }}
      >
        <label>
          Notes
          <textarea
            className="cash-notes-input"
            rows={3}
            value={draftNotes}
            onChange={(e) => setDraftNotes(e.target.value)}
            placeholder="Optional note for this buy or sell"
            autoFocus
          />
        </label>
        <div className="cash-move-edit-actions">
          <button
            type="button"
            className="icon-btn"
            title="Cancel"
            aria-label="Cancel"
            onClick={cancelNotes}
          >
            <IconClose />
          </button>
          <button
            type="submit"
            className="icon-btn primary"
            title="Save notes"
            aria-label="Save notes"
          >
            <IconCheck />
          </button>
        </div>
      </form>
    )
  }

  function renderListCard(move: GearCashMove) {
    const isSell = move.direction === 'in'
    const isBuy = !isSell
    const alreadyKept = isBuy && excludedBuys.has(move.id)
    const hasLinkedSell = isBuy && !alreadyKept && isLinked(move)
    const listing =
      isBuy && !alreadyKept && !hasLinkedSell
        ? effectiveListingStatus(move)
        : null
    return (
      <li
        key={move.id}
        id={`cash-move-${move.id}`}
        className={rowClass(
          move,
          `cash-move ${isSell ? 'sell-row' : 'buy-row'}`,
        )}
        title={pairSummaryLabel(move)}
        onClick={() => activateRow(move)}
      >
        <CashMoveRail tone={isSell ? 'in' : 'out'} />
        <div className="cash-move-main">
          <CashMoveDesc item={move.item} date={move.date} tags={move.tags} />
          <div className="cash-move-meta">
            {isSell ? (
              <SoldViaPicker
                value={move.soldVia}
                onChange={(next) => patchMove(move.id, { soldVia: next })}
              />
            ) : alreadyKept ? (
              <span className="status-tag status-tag-kept" title="Kept — not for sale">
                Kept
              </span>
            ) : hasLinkedSell ? (
              <span
                className="status-tag status-tag-sold"
                title="Sold — linked to a sell"
              >
                Sold
              </span>
            ) : listing ? (
              <button
                type="button"
                className={`status-tag status-tag-${listing === 'listed' ? 'listed' : 'not-listed'} is-toggle`}
                title={
                  listing === 'listed'
                    ? 'Listed for sale — click to mark not listed'
                    : 'Not listed — click to mark listed'
                }
                aria-pressed={listing === 'listed'}
                onClick={(e) => {
                  e.stopPropagation()
                  toggleListingStatus(move)
                }}
              >
                {listing === 'listed' ? 'Listed' : 'Not listed'}
              </button>
            ) : null}
            {renderPairLink(move)}
          </div>
        </div>
        <div className="cash-move-side">
          <div className={`cash-delta ${isSell ? 'in' : 'out'}`}>
            {isSell ? '+' : '−'}
            {formatMoney(move.amount)}
          </div>
          {renderMoveActions(move)}
        </div>
        {renderPairSummary(move)}
        {renderEditSection(move)}
        {renderNotesSection(move)}
      </li>
    )
  }

  function renderLinkModal() {
    if (!linkingFrom) return null
    const source = linkingFrom
    const suggested = linkCandidates.filter((c) => c.suggested)
    const others = linkCandidates.filter((c) => !c.suggested)
    const sourceNoun = source.direction === 'out' ? 'buy' : 'sell'
    const targetNoun = source.direction === 'out' ? 'sell' : 'buy'
    const inGroupCount = linkCandidates.filter(
      (c) =>
        source.linkGroupId && c.move.linkGroupId === source.linkGroupId,
    ).length

    function renderCandidate(entry: (typeof linkCandidates)[number]) {
      const { move, suggested: isSuggested } = entry
      const selected =
        Boolean(source.linkGroupId) &&
        move.linkGroupId === source.linkGroupId
      return (
        <li key={move.id}>
          <button
            type="button"
            className={`cash-link-candidate${selected ? ' selected' : ''}${isSuggested ? ' suggested' : ''}`}
            aria-pressed={selected}
            onClick={() => toggleLinkCandidate(move)}
          >
            <span className="cash-link-candidate-check" aria-hidden="true">
              {selected ? '✓' : ''}
            </span>
            <span className="cash-link-candidate-main">
              <span className="cash-link-candidate-item">
                {cashMoveDescLabel(move.item, move.date)}
              </span>
              <GearTagPills tags={move.tags} />
              <span className="cash-link-candidate-meta">
                {move.direction === 'in' && move.soldVia
                  ? move.soldVia.toUpperCase()
                  : ''}
                {selected
                  ? `${move.direction === 'in' && move.soldVia ? ' · ' : ''}in group`
                  : ''}
              </span>
            </span>
            <span
              className={`cash-link-candidate-amt ${move.direction === 'in' ? 'in' : 'out'}`}
            >
              {move.direction === 'in' ? '+' : '−'}
              {formatMoney(move.amount)}
            </span>
          </button>
        </li>
      )
    }

    return (
      <div
        className="cash-link-modal-backdrop"
        role="presentation"
        onClick={(e) => {
          if (e.target === e.currentTarget) cancelLink()
        }}
      >
        <div
          className="cash-link-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cash-link-modal-title"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="cash-link-modal-header">
            <div>
              <h3 id="cash-link-modal-title">Link {sourceNoun}</h3>
              <p>
                Tap {targetNoun}s to add or remove them from this group
                {inGroupCount > 0 ? ` · ${inGroupCount} linked` : ''}
              </p>
            </div>
            <button
              type="button"
              className="icon-btn"
              title="Close"
              aria-label="Close"
              onClick={cancelLink}
            >
              <IconClose />
            </button>
          </div>

          <div className="cash-link-source">
            <span className="cash-link-source-label">
              {sourceNoun === 'buy' ? 'Buy' : 'Sell'}
            </span>
            <div className="cash-link-source-body">
              <strong>{cashMoveDescLabel(source.item, source.date)}</strong>
              <GearTagPills tags={source.tags} />
              <span className={source.direction === 'in' ? 'in' : 'out'}>
                {source.direction === 'in' ? '+' : '−'}
                {formatMoney(source.amount)}
              </span>
            </div>
          </div>

          <div className="cash-link-modal-body">
            {linkCandidates.length === 0 ? (
              <p className="empty-note">
                No opposite {targetNoun}s to link yet.
              </p>
            ) : (
              <>
                {suggested.length > 0 ? (
                  <div className="cash-link-section">
                    <h4>Suggested</h4>
                    <ul className="cash-link-candidates">
                      {suggested.map(renderCandidate)}
                    </ul>
                  </div>
                ) : null}
                {others.length > 0 ? (
                  <div className="cash-link-section">
                    <h4>{suggested.length > 0 ? 'Other' : `All ${targetNoun}s`}</h4>
                    <ul className="cash-link-candidates">
                      {others.map(renderCandidate)}
                    </ul>
                  </div>
                ) : null}
              </>
            )}
          </div>

          <div className="cash-link-modal-actions">
            <button type="button" className="ghost" onClick={cancelLink}>
              Cancel
            </button>
            <button type="button" className="primary" onClick={cancelLink}>
              Done
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="layout">
      {renderLinkModal()}
      <div className={`cash-hero${cashMathOpen ? ' is-open' : ''}`}>
        <div className="cash-hero-grid">
          <div className="cash-on-hand-block">
            <button
              type="button"
              className="cash-on-hand-toggle"
              aria-expanded={cashMathOpen}
              aria-controls="cash-on-hand-math"
              onClick={() => setCashMathOpen((v) => !v)}
            >
              <span className="cash-on-hand-toggle-copy">
                <span className="stat-label">Cash on hand</span>
                <span className={`stat-value ${balance >= 0 ? 'good' : 'bad'}`}>
                  {formatMoney(balance)}
                </span>
                <span className="stat-sub">
                  Opening {formatMoney(openingBalance)} + sold{' '}
                  {formatMoney(moneyIn)} − bought {formatMoney(moneyOut)}
                </span>
              </span>
              <span
                className={`cash-on-hand-chevron${cashMathOpen ? ' open' : ''}`}
                aria-hidden
              >
                ›
              </span>
            </button>
            <button
              type="button"
              className="ghost cash-receipt-btn"
              onClick={onViewReceipt}
            >
              <IconReceipt />
              Receipt
            </button>
          </div>
          <label className="cash-opening">
            Opening balance
            <input
              type="number"
              step="0.01"
              value={openingBalance}
              onChange={(e) => onChangeOpening(Number(e.target.value) || 0)}
            />
          </label>
        </div>
        {cashMathOpen ? (
          <ul id="cash-on-hand-math" className="cash-on-hand-math">
            <li className="cash-math-row">
              <div className="cash-math-main">
                <span className="cash-math-item">Opening balance</span>
              </div>
              <div className="cash-math-figures">
                <span className="cash-math-delta muted">
                  {formatMoney(openingBalance)}
                </span>
                <span className="cash-math-run">
                  {formatMoney(openingBalance)}
                </span>
              </div>
            </li>
            {timeline.map(({ move, delta, balance: after }) => {
              const isSell = move.direction === 'in'
              return (
                <li key={move.id} className="cash-math-row">
                  <div className="cash-math-main">
                    <span className="cash-math-item">
                      {cashMoveDescLabel(move.item, move.date)}
                    </span>
                    <span className="cash-math-meta">
                      <span className={`cash-type ${isSell ? 'in' : 'out'}`}>
                        {isSell ? 'Sell' : 'Buy'}
                      </span>
                      <GearTagPills tags={move.tags} />
                    </span>
                  </div>
                  <div className="cash-math-figures">
                    <span
                      className={`cash-math-delta ${delta >= 0 ? 'in' : 'out'}`}
                    >
                      {delta >= 0 ? '+' : '−'}
                      {formatMoney(Math.abs(delta))}
                    </span>
                    <span className="cash-math-run">{formatMoney(after)}</span>
                  </div>
                </li>
              )
            })}
            <li className="cash-math-row cash-math-total">
              <div className="cash-math-main">
                <span className="cash-math-item">Cash on hand</span>
              </div>
              <div className="cash-math-figures">
                <span
                  className={`cash-math-run total ${balance >= 0 ? 'good' : 'bad'}`}
                >
                  {formatMoney(balance)}
                </span>
              </div>
            </li>
          </ul>
        ) : null}

        <div className="cash-hero-details">
          {inventorySummary.total === 0 ? (
            <p className="stat-sub cash-inventory-empty">In stock: none</p>
          ) : (
            <>
              <p className="stat-sub cash-inventory-kinds">
                In stock:{' '}
                {inventorySummary.byKind
                  .map((k) => `${k.label} ${k.count}`)
                  .join(' · ')}
              </p>
              <p className="stat-sub cash-inventory-projected">
                {inventorySummary.pricedCount === 0 ? (
                  <>Projected if sold: —</>
                ) : (
                  <>
                    Projected if sold:{' '}
                    <span className="cash-inventory-projected-value good">
                      +{formatMoney(inventorySummary.projectedCash)}
                    </span>
                    {inventorySummary.pricedCount < inventorySummary.total
                      ? ` (${inventorySummary.pricedCount} of ${inventorySummary.total} priced)`
                      : null}
                  </>
                )}
              </p>
              <p className="stat-sub cash-inventory-potential">
                Potential cash on hand:{' '}
                <span className="cash-inventory-projected-value">
                  {formatMoney(balance + inventorySummary.projectedCash)}
                </span>
              </p>
            </>
          )}
        </div>
      </div>

      <div className="cash-hero cash-profit-card">
        <div className="cash-hero-grid cash-profit-header">
          <div className="cash-profit-metrics">
            <div>
              <span className="stat-label">Profit</span>
              <div
                className={`stat-value${
                  monthFlipProfit.profit > 0
                    ? ' good'
                    : monthFlipProfit.profit < 0
                      ? ' bad'
                      : ''
                }`}
              >
                {monthFlipProfit.profit > 0 ? '+' : ''}
                {formatMoney(monthFlipProfit.profit)}
              </div>
            </div>
            <div>
              <span className="stat-label">Total cash made</span>
              <div className="stat-value">
                {formatMoney(monthFlipProfit.sold)}
              </div>
            </div>
            <p className="stat-sub cash-profit-metrics-sub">
              Cost {formatMoney(monthFlipProfit.purchased)}
              {monthFlipProfit.sellCount > 0
                ? ` · ${monthFlipProfit.sellCount} sell${
                    monthFlipProfit.sellCount === 1 ? '' : 's'
                  }`
                : ''}
              {' · '}
              Linked flips
            </p>
          </div>
          <div
            className="cash-profit-month-nav"
            role="group"
            aria-label="Profit month"
          >
            <button
              type="button"
              className="cash-date-sort-btn"
              aria-label="Previous month"
              onClick={() =>
                setProfitMonthId((id) => shiftMonthId(id, -1))
              }
            >
              ‹
            </button>
            <span className="cash-profit-month-label">{profitMonthLabel}</span>
            <button
              type="button"
              className="cash-date-sort-btn"
              aria-label="Next month"
              onClick={() =>
                setProfitMonthId((id) => shiftMonthId(id, 1))
              }
            >
              ›
            </button>
          </div>
        </div>

        {monthFlipProfit.flips.length === 0 ? (
          <p className="stat-sub cash-profit-empty">
            No linked sells in {profitMonthLabel}.
          </p>
        ) : (
          <ul className="cash-profit-flips">
            {monthFlipProfit.flips.map((flip) => (
              <li key={flip.linkGroupId} className="cash-math-row">
                <div className="cash-math-main">
                  <span className="cash-math-item">{flip.label}</span>
                  <span className="cash-math-meta">
                    {flip.sellDate ? (
                      <time dateTime={flip.sellDate}>{flip.sellDate}</time>
                    ) : null}
                    <GearTagPills tags={flip.tags} />
                  </span>
                </div>
                <div className="cash-math-figures">
                  <span className="cash-math-delta muted">
                    Sold {formatMoney(flip.sold)}
                  </span>
                  <span
                    className={`cash-math-run${
                      flip.profit > 0
                        ? ' total good'
                        : flip.profit < 0
                          ? ' total bad'
                          : ''
                    }`}
                  >
                    {flip.profit > 0 ? '+' : flip.profit < 0 ? '−' : ''}
                    {formatMoney(Math.abs(flip.profit))}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Add a cash move</h2>
            <p>Buys and sells stay on separate rows</p>
          </div>
          <div className="lot-toggles">
            <button
              type="button"
              className={`icon-btn${showBuys ? ' active-toggle' : ''}`}
              aria-pressed={showBuys}
              title={showBuys ? 'Hide buys' : 'Show buys'}
              aria-label={showBuys ? 'Hide buys' : 'Show buys'}
              onClick={() => setShowBuys((v) => !v)}
            >
              {showBuys ? <IconEye /> : <IconEyeOff />}
              <span className="icon-btn-badge out">B</span>
            </button>
            <button
              type="button"
              className={`icon-btn${showSells ? ' active-toggle' : ''}`}
              aria-pressed={showSells}
              title={showSells ? 'Hide sells' : 'Show sells'}
              aria-label={showSells ? 'Hide sells' : 'Show sells'}
              onClick={() => setShowSells((v) => !v)}
            >
              {showSells ? <IconEye /> : <IconEyeOff />}
              <span className="icon-btn-badge in">S</span>
            </button>
          </div>
        </div>
        <form className="cash-compose" onSubmit={submit}>
          <div className="cash-mode-toggle" role="group" aria-label="Direction">
            <button
              type="button"
              className={`cash-mode out${mode === 'out' ? ' active' : ''}`}
              onClick={() => resetComposeForMode('out')}
            >
              Buy / spend
              <span>Money out</span>
            </button>
            <button
              type="button"
              className={`cash-mode in${mode === 'in' ? ' active' : ''}`}
              onClick={() => resetComposeForMode('in')}
            >
              Sell / deposit
              <span>Money in</span>
            </button>
          </div>
          <div className="cash-compose-fields">
            <label>
              Date
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
              />
            </label>
            <label>
              Amount
              <div className="cash-amount-wrap">
                <span className={mode}>{mode === 'in' ? '+' : '−'}</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  required
                />
              </div>
            </label>
          </div>

          {mode === 'in' ? (
            <div className="gear-tag-step cash-compose-step">
              <InventoryMatchPicker
                suggestions={sellItemSuggestions}
                selectedKey={matchKey}
                onPick={pickInventoryMatch}
                onClear={clearInventoryMatch}
                onEnterManually={
                  !matchKey && !sellDetailsOpen
                    ? () => setSellDetailsOpen(true)
                    : undefined
                }
              />
            </div>
          ) : null}

          {mode === 'out' ||
          matchKey ||
          sellDetailsOpen ||
          Boolean(tags.kind) ? (
            <div className="gear-tag-step cash-compose-step">
              {mode === 'in' && matchKey && !sellDetailsOpen ? (
                <button
                  type="button"
                  className="ghost cash-compose-reveal"
                  onClick={() => setSellDetailsOpen(true)}
                >
                  Adjust item details
                </button>
              ) : (
                <GearItemTagsFields
                  value={tags}
                  onChange={(next) => {
                    setTags(next)
                    if (matchKey) {
                      const label = formatGearItemLabel(next)
                      if (normalizeCashItem(label) !== matchKey) {
                        setMatchKey('')
                        setMatchBuyId(null)
                      }
                    }
                  }}
                  progressive
                />
              )}
            </div>
          ) : null}

          {mode === 'in' && tagsReady(tags) ? (
            <div className="gear-tag-step cash-compose-step">
              <label className="cash-via-field">
                Sold on
                <SoldViaPicker value={soldVia} onChange={setSoldVia} />
              </label>
            </div>
          ) : null}

          <div className="gear-tag-step cash-compose-step">
            <label className="cash-via-field">
              Notes
              <textarea
                className="cash-notes-input"
                rows={2}
                value={composeNotes}
                onChange={(e) => setComposeNotes(e.target.value)}
                placeholder="Optional"
              />
            </label>
          </div>

          <div className="cash-compose-actions">
            <p className="hint">
              {mode === 'in'
                ? 'Match inventory or enter tags · creates a sell row'
                : 'Fill brand → model → type step-by-step · creates a buy row'}
            </p>
            <button
              type="submit"
              className="primary"
              disabled={!tagsReady(tags)}
            >
              {mode === 'in' ? 'Add sell' : 'Add buy'}
            </button>
          </div>
        </form>
      </section>

      {!showBuys && !showSells ? (
        <p className="empty-note">Turn on Buys and/or Sells to see lists.</p>
      ) : (
        <>
          <div className="cash-filters">
            <label>
              From date
              <input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
              />
            </label>
            <label className="cash-filter-item">
              Item
              <select
                value={filterItem}
                onChange={(e) => setFilterItem(e.target.value)}
              >
                <option value="">All items</option>
                {itemOptions.map((opt) => (
                  <option key={opt.key} value={opt.key}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            {searchSplit ? (
              <div className="cash-filter-search cash-filter-search-split">
                <label>
                  Search buys
                  <CashSearchField
                    value={filterSearchBuys}
                    onChange={setFilterSearchBuys}
                    placeholder="Buys: item, type, amount…"
                  />
                </label>
                <label>
                  Search sells
                  <CashSearchField
                    value={filterSearchSells}
                    onChange={setFilterSearchSells}
                    placeholder="Sells: item, type, amount…"
                  />
                </label>
                <button
                  type="button"
                  className="ghost compact cash-filter-action"
                  onClick={combineSearchSplit}
                  title="Use one shared search for buys and sells"
                >
                  One search
                </button>
              </div>
            ) : (
              <label className="cash-filter-search">
                Search
                <div className="cash-search-row">
                  <CashSearchField
                    value={filterSearch}
                    onChange={setFilterSearch}
                    placeholder="Item, type, amount…"
                  />
                  <select
                    aria-label="Search in buys, sells, or both"
                    value={filterSearchScope}
                    onChange={(e) =>
                      changeSearchScope(e.target.value as CashSearchScope)
                    }
                  >
                    <option value="both">Both</option>
                    <option value="buys">Only buys</option>
                    <option value="sells">Only sells</option>
                  </select>
                  {filterSearchScope === 'both' ? (
                    <button
                      type="button"
                      className="ghost compact cash-filter-action"
                      onClick={enableSearchSplit}
                      title="Search buys and sells with different text"
                    >
                      Split
                    </button>
                  ) : null}
                </div>
              </label>
            )}
            <CashItemTagFilter
              value={itemTagFilter}
              onChange={onItemTagFilterChange}
            />
            {filtersActive ? (
              <button
                type="button"
                className="ghost compact cash-filter-action"
                onClick={clearCashFilters}
              >
                Clear filters
              </button>
            ) : null}
          </div>
          <div
            className={`cash-split${!showBuys || !showSells ? ' single' : ''}`}
          >
            {showBuys ? (
              <section className="panel">
                <div className="panel-header">
                  <div>
                    <h2>Buys</h2>
                    <p>
                      {filteredBuys.length}
                      {buyFiltersActive ? ` of ${buys.length}` : ''} rows ·{' '}
                      {formatMoney(filteredMoneyOut)} out
                    </p>
                  </div>
                  <div className="cash-buys-header-controls">
                    <CashBuyTagFilter
                      value={buyTagFilter}
                      onChange={setBuyTagFilter}
                    />
                    <CashDateSortControl
                      value={buyDateSort}
                      onChange={setBuyDateSort}
                      label="buys"
                    />
                  </div>
                </div>
                {filteredBuys.length === 0 ? (
                  <p className="empty-note">
                    {buys.length === 0
                      ? 'No buys yet.'
                      : 'No buys match these filters.'}
                  </p>
                ) : (
                  <ul className="cash-timeline">
                    {filteredBuys.map((move) => renderListCard(move))}
                  </ul>
                )}
              </section>
            ) : null}

            {showSells ? (
              <section className="panel">
                <div className="panel-header">
                  <div>
                    <h2>Sells</h2>
                    <p>
                      {filteredSells.length}
                      {sellFiltersActive ? ` of ${sells.length}` : ''} rows ·{' '}
                      {formatMoney(filteredMoneyIn)} in
                    </p>
                  </div>
                  <CashDateSortControl
                    value={sellDateSort}
                    onChange={setSellDateSort}
                    label="sells"
                  />
                </div>
                {filteredSells.length === 0 ? (
                  <p className="empty-note">
                    {sells.length === 0
                      ? 'No sells yet.'
                      : 'No sells match these filters.'}
                  </p>
                ) : (
                  <ul className="cash-timeline">
                    {filteredSells.map((move) => renderListCard(move))}
                  </ul>
                )}
              </section>
            ) : null}
          </div>
        </>
      )}

    </div>
  )
}

function formatAddedAt(iso?: string | null): string {
  if (!iso) return 'From sheet'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return 'From sheet'
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatMarginPct(margin: number | null): string {
  if (margin == null || Number.isNaN(margin)) return '—'
  return `${Math.round(margin * 1000) / 10}%`
}

function formatDaysToSell(days: number | null): string {
  if (days == null) return '—'
  if (days === 0) return 'Same day'
  if (days === 1) return '1 day'
  return `${days} days`
}

function InsightsFlipRow({ flip }: { flip: CompletedFlipInsight }) {
  return (
    <li className="cash-math-row gear-insight-row">
      <div className="cash-math-main">
        <span className="cash-math-item">{flip.label}</span>
        <span className="cash-math-meta">
          <GearTagPills tags={flip.tags} />
          {flip.sellDate ? (
            <time dateTime={flip.sellDate}>Sold {flip.sellDate}</time>
          ) : null}
        </span>
      </div>
      <div className="cash-math-figures">
        <span
          className={`cash-math-run total${
            flip.profit > 0 ? ' good' : flip.profit < 0 ? ' bad' : ''
          }`}
        >
          {flip.profit > 0 ? '+' : flip.profit < 0 ? '−' : ''}
          {formatMoney(Math.abs(flip.profit))}
        </span>
        <span className="cash-math-delta muted">
          Sold {formatMoney(flip.sold)} · Cost {formatMoney(flip.purchased)}
          {flip.margin != null ? ` · ${formatMarginPct(flip.margin)}` : ''}
        </span>
      </div>
    </li>
  )
}

function InsightsVolumeRow({ row }: { row: VolumeLeaderInsight }) {
  return (
    <li className="cash-math-row gear-insight-row">
      <div className="cash-math-main">
        <span className="cash-math-item">{row.label}</span>
        <span className="cash-math-meta">
          {row.sellCount} sell{row.sellCount === 1 ? '' : 's'}
        </span>
      </div>
      <div className="cash-math-figures">
        <span className="cash-math-run total">{formatMoney(row.totalSold)}</span>
        <span className="cash-math-delta muted">Total sold</span>
      </div>
    </li>
  )
}

function InsightBarRow({
  label,
  meta,
  valueLabel,
  pct,
  tone = 'accent',
}: {
  label: string
  meta?: string
  valueLabel: string
  pct: number
  tone?: 'accent' | 'good' | 'bad'
}) {
  const widthPct = Math.max(0, Math.min(100, Math.round(pct)))
  return (
    <div className="gear-insight-bar">
      <div className="gear-insight-bar-text">
        <span className="gear-insight-bar-label">{label}</span>
        {meta ? <span className="gear-insight-bar-meta">{meta}</span> : null}
      </div>
      <div
        className="gear-insight-bar-track"
        role="img"
        aria-label={`${label} ${valueLabel}`}
      >
        <span
          className={`gear-insight-bar-fill ${tone}`}
          style={{ width: `${widthPct}%` }}
        />
      </div>
      <strong
        className={`gear-insight-bar-value${
          tone === 'good' ? ' good' : tone === 'bad' ? ' bad' : ''
        }`}
      >
        {valueLabel}
      </strong>
    </div>
  )
}

function InsightsBrandCharts({
  byBrand,
  brandProfit,
}: {
  byBrand: VolumeLeaderInsight[]
  brandProfit: BrandProfitInsight[]
}) {
  const volumeRows = byBrand.slice(0, 10)
  const profitRows = brandProfit.slice(0, 10)
  const maxSold = Math.max(...volumeRows.map((r) => r.totalSold), 0)
  const maxCount = Math.max(...volumeRows.map((r) => r.sellCount), 0)
  const maxProfitAbs = Math.max(
    ...profitRows.map((r) => Math.abs(r.profit)),
    0,
  )

  if (volumeRows.length === 0 && profitRows.length === 0) {
    return (
      <p className="empty-note">
        No branded sells yet. Tag buys and sells with a brand to see what sells
        well.
      </p>
    )
  }

  return (
    <div className="gear-insights-brand-charts">
      <div className="month-end-chart-block">
        <h3 className="gear-insights-subhead">Brand sell volume ($)</h3>
        {volumeRows.length === 0 ? (
          <p className="empty-note tight">No branded sell volume yet.</p>
        ) : (
          <div className="gear-insight-bars" aria-label="Brand sell volume dollars">
            {volumeRows.map((row) => (
              <InsightBarRow
                key={`$vol-${row.key}`}
                label={row.label}
                meta={`${row.sellCount} sell${row.sellCount === 1 ? '' : 's'}`}
                valueLabel={formatMoney(row.totalSold)}
                pct={maxSold > 0 ? (row.totalSold / maxSold) * 100 : 0}
                tone="accent"
              />
            ))}
          </div>
        )}
      </div>

      <div className="month-end-chart-block">
        <h3 className="gear-insights-subhead">Brand sell count</h3>
        {volumeRows.length === 0 ? (
          <p className="empty-note tight">No branded sell counts yet.</p>
        ) : (
          <div className="gear-insight-bars" aria-label="Brand sell counts">
            {[...volumeRows]
              .sort((a, b) => {
                if (b.sellCount !== a.sellCount) return b.sellCount - a.sellCount
                if (b.totalSold !== a.totalSold) return b.totalSold - a.totalSold
                return a.label.localeCompare(b.label)
              })
              .map((row) => (
                <InsightBarRow
                  key={`cnt-${row.key}`}
                  label={row.label}
                  meta={formatMoney(row.totalSold)}
                  valueLabel={`${row.sellCount}`}
                  pct={maxCount > 0 ? (row.sellCount / maxCount) * 100 : 0}
                  tone="accent"
                />
              ))}
          </div>
        )}
      </div>

      <div className="month-end-chart-block gear-insights-brand-profit">
        <h3 className="gear-insights-subhead">Brand profit (linked flips)</h3>
        {profitRows.length === 0 ? (
          <p className="empty-note tight">
            No linked branded flips yet. Link buys to sells to rank brand profit.
          </p>
        ) : (
          <div className="gear-insight-bars" aria-label="Brand profit">
            {profitRows.map((row) => (
              <InsightBarRow
                key={`profit-${row.key}`}
                label={row.label}
                meta={`${row.flipCount} flip${row.flipCount === 1 ? '' : 's'} · sold ${formatMoney(row.sold)}`}
                valueLabel={`${row.profit > 0 ? '+' : row.profit < 0 ? '−' : ''}${formatMoney(Math.abs(row.profit))}`}
                pct={
                  maxProfitAbs > 0
                    ? (Math.abs(row.profit) / maxProfitAbs) * 100
                    : 0
                }
                tone={row.profit >= 0 ? 'good' : 'bad'}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function InsightsPanel({
  moves,
  onTagUntagged,
}: {
  moves: GearCashMove[]
  onTagUntagged: () => void
}) {
  const [period, setPeriod] = useState<GearInsightsPeriod>('all')
  const insights = useMemo(
    () => gearSalesInsights(moves, period),
    [moves, period],
  )
  const periodNote =
    period === 'all'
      ? 'All time · linked flips for profit & speed; all sells for volume'
      : 'This month · by sell date'
  const needsTags = insights.needsTagCount

  return (
    <div className="layout gear-insights">
      {needsTags > 0 ? (
        <div className="callout gear-insights-tag-callout">
          <p>
            <strong>
              {needsTags} buy/sell row{needsTags === 1 ? '' : 's'}
            </strong>{' '}
            {needsTags === 1 ? 'is' : 'are'} untagged or missing a brand.
            Tagging improves Insights accuracy — especially brand charts.
          </p>
          <div className="callout-actions">
            <button type="button" className="primary" onClick={onTagUntagged}>
              Tag on Cash ledger
            </button>
          </div>
        </div>
      ) : null}

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Insights</h2>
            <p>What flips well, what moves volume, and what turns fastest</p>
          </div>
          <div className="lot-toggles" role="group" aria-label="Period">
            <button
              type="button"
              className={`ghost${period === 'all' ? ' active-toggle' : ''}`}
              aria-pressed={period === 'all'}
              onClick={() => setPeriod('all')}
            >
              All time
            </button>
            <button
              type="button"
              className={`ghost${period === 'month' ? ' active-toggle' : ''}`}
              aria-pressed={period === 'month'}
              onClick={() => setPeriod('month')}
            >
              This month
            </button>
          </div>
        </div>
        <p className="empty-note tight gear-insights-note">{periodNote}</p>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Brands that sell well</h2>
            <p>Volume and linked-flip profit by brand tag</p>
          </div>
        </div>
        <div className="gear-insights-brand-wrap">
          <InsightsBrandCharts
            byBrand={insights.byBrand}
            brandProfit={insights.brandProfit}
          />
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Most successful</h2>
            <p>Highest profit among completed linked flips</p>
          </div>
        </div>
        {insights.mostSuccessful.length === 0 ? (
          <p className="empty-note">
            No completed linked flips yet. Link a buy and sell on Cash ledger.
          </p>
        ) : (
          <ul className="gear-insights-list">
            {insights.mostSuccessful.slice(0, 15).map((flip) => (
              <InsightsFlipRow key={flip.linkGroupId} flip={flip} />
            ))}
          </ul>
        )}
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>What sells the most</h2>
            <p>Volume leaders by type and by brand / model</p>
          </div>
        </div>
        {insights.byKind.length === 0 && insights.byBrandModel.length === 0 ? (
          <p className="empty-note">No sells yet.</p>
        ) : (
          <div className="gear-insights-volume">
            <div>
              <h3 className="gear-insights-subhead">By type</h3>
              {insights.byKind.length === 0 ? (
                <p className="empty-note tight">No typed sells.</p>
              ) : (
                <ul className="gear-insights-list">
                  {insights.byKind.slice(0, 12).map((row) => (
                    <InsightsVolumeRow key={row.key} row={row} />
                  ))}
                </ul>
              )}
            </div>
            <div>
              <h3 className="gear-insights-subhead">By brand / model</h3>
              {insights.byBrandModel.length === 0 ? (
                <p className="empty-note tight">No branded sells.</p>
              ) : (
                <ul className="gear-insights-list">
                  {insights.byBrandModel.slice(0, 12).map((row) => (
                    <InsightsVolumeRow key={row.key} row={row} />
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>What sells the fastest</h2>
            <p>Shortest buy → sell among linked flips with dates</p>
          </div>
        </div>
        {insights.fastest.length === 0 ? (
          <p className="empty-note">
            No dated linked flips yet. Add buy and sell dates on Cash ledger.
          </p>
        ) : (
          <ul className="gear-insights-list">
            {insights.fastest.slice(0, 15).map((flip) => (
              <li key={flip.linkGroupId} className="cash-math-row gear-insight-row">
                <div className="cash-math-main">
                  <span className="cash-math-item">{flip.label}</span>
                  <span className="cash-math-meta">
                    <GearTagPills tags={flip.tags} />
                    {flip.buyDate && flip.sellDate ? (
                      <span>
                        {flip.buyDate} → {flip.sellDate}
                      </span>
                    ) : null}
                  </span>
                </div>
                <div className="cash-math-figures">
                  <span className="cash-math-run total">
                    {formatDaysToSell(flip.daysToSell)}
                  </span>
                  <span className="cash-math-delta muted">
                    {flip.profit > 0 ? '+' : flip.profit < 0 ? '−' : ''}
                    {formatMoney(Math.abs(flip.profit))} profit
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function KeepListPanel({
  keepList,
  onChange,
}: {
  keepList: GearKeepItem[]
  onChange: (next: GearKeepItem[]) => void
}) {
  const [tags, setTags] = useState<GearItemTags>(() => emptyGearTags())
  const [notes, setNotes] = useState('')
  const [date, setDate] = useState('')
  const [cost, setCost] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTags, setEditTags] = useState<GearItemTags>(() => emptyGearTags())
  const [editNotes, setEditNotes] = useState('')
  const [editDate, setEditDate] = useState('')
  const [editCost, setEditCost] = useState('')

  const sorted = useMemo(() => {
    return [...keepList].sort((a, b) => {
      const ad = a.date?.slice(0, 10) || ''
      const bd = b.date?.slice(0, 10) || ''
      if (ad && bd && ad !== bd) return bd.localeCompare(ad)
      if (ad !== bd) return ad ? -1 : 1
      const ac = a.createdAt || ''
      const bc = b.createdAt || ''
      if (ac && bc && ac !== bc) return bc.localeCompare(ac)
      return a.item.localeCompare(b.item)
    })
  }, [keepList])

  function submitAdd(e: FormEvent) {
    e.preventDefault()
    if (!tagsReady(tags)) return
    const name = formatGearItemLabel(tags)
    if (!name) return
    const parsedCost = cost.trim() ? Number(cost) : null
    const entry: GearKeepItem = {
      id: `keep-${Date.now().toString(36)}`,
      item: name,
      tags: { ...tags },
      notes: notes.trim() || null,
      date: date.trim() || null,
      cost:
        parsedCost != null && Number.isFinite(parsedCost) && parsedCost >= 0
          ? Math.round(parsedCost * 100) / 100
          : null,
      cashMoveId: null,
      createdAt: new Date().toISOString(),
    }
    onChange([entry, ...keepList])
    setTags(emptyGearTags())
    setNotes('')
    setDate('')
    setCost('')
  }

  function startEdit(row: GearKeepItem) {
    setEditingId(row.id)
    setEditTags(
      row.tags
        ? { ...row.tags }
        : { ...emptyGearTags(), kind: 'other', detail: row.item },
    )
    setEditNotes(row.notes ?? '')
    setEditDate(row.date?.slice(0, 10) ?? '')
    setEditCost(row.cost != null ? String(row.cost) : '')
  }

  function cancelEdit() {
    setEditingId(null)
  }

  function saveEdit(row: GearKeepItem) {
    if (!tagsReady(editTags)) return
    const name = formatGearItemLabel(editTags)
    if (!name) return
    const parsedCost = editCost.trim() ? Number(editCost) : null
    onChange(
      keepList.map((k) =>
        k.id === row.id
          ? {
              ...k,
              item: name,
              tags: { ...editTags },
              notes: editNotes.trim() || null,
              date: editDate.trim() || null,
              cost:
                parsedCost != null &&
                Number.isFinite(parsedCost) &&
                parsedCost >= 0
                  ? Math.round(parsedCost * 100) / 100
                  : null,
            }
          : k,
      ),
    )
    setEditingId(null)
  }

  function remove(id: string) {
    const row = keepList.find((k) => k.id === id)
    const label = row?.item?.trim() || 'this keep-list item'
    const ok = confirmRemove(`Remove “${label}” from the keep list?`)
    if (!ok) return
    onChange(keepList.filter((k) => k.id !== id))
  }

  return (
    <div className="layout">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Keep list</h2>
            <p>Gear you decided to keep — not for flipping</p>
          </div>
        </div>

        <form className="cash-compose keep-compose" onSubmit={submitAdd}>
          <div className="cash-compose-fields">
            <label>
              Date
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <label>
              Cost
              <div className="cash-amount-wrap">
                <span className="out">−</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  placeholder="Optional"
                />
              </div>
            </label>
            <label className="span-2">
              Notes
              <input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional"
              />
            </label>
          </div>
          <GearItemTagsFields value={tags} onChange={setTags} />
          <div className="cash-compose-actions">
            <button
              type="submit"
              className="primary"
              disabled={!tagsReady(tags)}
            >
              Add to keep list
            </button>
          </div>
        </form>

        {sorted.length === 0 ? (
          <p className="empty-note">
            Nothing kept yet. Add an item above, or tap Keep on a buy in Cash
            ledger.
          </p>
        ) : (
          <ul className="cash-timeline keep-list">
            {sorted.map((row) => {
              const isEditing = editingId === row.id
              return (
                <li
                  key={row.id}
                  className={`cash-move keep-row${isEditing ? ' is-editing' : ''}`}
                >
                  <CashMoveRail tone="out" />
                  <div className="cash-move-main">
                    <div className="cash-move-item">{row.item}</div>
                    <GearTagPills tags={row.tags} />
                    <div className="cash-move-meta">
                      <time className="cash-move-date">
                        {row.date?.slice(0, 10) || 'No date'}
                      </time>
                      {row.notes ? (
                        <span className="keep-notes">{row.notes}</span>
                      ) : null}
                      <span className="status-tag status-tag-kept">Kept</span>
                      {row.cashMoveId ? (
                        <span className="keep-from-buy">From buy</span>
                      ) : null}
                    </div>
                  </div>
                  <div className="cash-move-side">
                    {row.cost != null ? (
                      <div className="cash-delta out">
                        −{formatMoney(row.cost)}
                      </div>
                    ) : (
                      <div className="cash-delta muted">—</div>
                    )}
                    <div className="cash-move-actions">
                      <button
                        type="button"
                        className={`icon-btn${isEditing ? ' active-toggle' : ''}`}
                        aria-pressed={isEditing}
                        title={isEditing ? 'Close edit' : 'Edit'}
                        aria-label={isEditing ? 'Close edit' : 'Edit'}
                        onClick={() =>
                          isEditing ? cancelEdit() : startEdit(row)
                        }
                      >
                        {isEditing ? <IconClose /> : <IconEdit />}
                      </button>
                      <button
                        type="button"
                        className="icon-btn danger"
                        title="Remove"
                        aria-label="Remove from keep list"
                        onClick={() => remove(row.id)}
                      >
                        <IconTrash />
                      </button>
                    </div>
                  </div>
                  {isEditing ? (
                    <form
                      className="cash-move-edit"
                      onSubmit={(e) => {
                        e.preventDefault()
                        saveEdit(row)
                      }}
                    >
                      <div className="cash-move-edit-fields">
                        <label>
                          Date
                          <input
                            type="date"
                            value={editDate}
                            onChange={(e) => setEditDate(e.target.value)}
                          />
                        </label>
                        <label>
                          Cost
                          <div className="cash-amount-wrap">
                            <span className="out">−</span>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={editCost}
                              onChange={(e) => setEditCost(e.target.value)}
                            />
                          </div>
                        </label>
                        <label className="span-2">
                          Notes
                          <input
                            value={editNotes}
                            onChange={(e) => setEditNotes(e.target.value)}
                          />
                        </label>
                      </div>
                      <GearItemTagsFields
                        value={editTags}
                        onChange={setEditTags}
                      />
                      <div className="cash-move-edit-actions">
                        <button
                          type="button"
                          className="icon-btn"
                          title="Cancel"
                          aria-label="Cancel"
                          onClick={cancelEdit}
                        >
                          <IconClose />
                        </button>
                        <button
                          type="submit"
                          className="icon-btn primary"
                          title="Save"
                          aria-label="Save"
                          disabled={!tagsReady(editTags)}
                        >
                          <IconCheck />
                        </button>
                      </div>
                    </form>
                  ) : null}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}

function CashHistory({
  openingBalance,
  moves,
  onChangeMoves,
  onBackToCash,
}: {
  openingBalance: number
  moves: GearCashMove[]
  onChangeMoves: (moves: GearCashMove[]) => void
  onBackToCash: () => void
}) {
  const [kind, setKind] = useState<'all' | 'out' | 'in'>('all')
  const [undone, setUndone] = useState<GearCashMove[]>([])

  const timeline = useMemo(
    () => cashTimeline(openingBalance, moves),
    [openingBalance, moves],
  )

  const historyRows = useMemo(() => {
    if (kind === 'all') {
      return timeline.map(({ move, balance: run }) => ({ move, run }))
    }
    return timeline
      .filter(({ move }) => move.direction === kind)
      .map(({ move }) => ({ move, run: null as number | null }))
  }, [timeline, kind])

  function undoMove(move: GearCashMove) {
    setUndone((stack) => [move, ...stack].slice(0, 20))
    onChangeMoves(removeCashMove(moves, move.id))
  }

  function restoreLast() {
    const [top, ...rest] = undone
    if (!top) return
    setUndone(rest)
    if (moves.some((m) => m.id === top.id)) return
    onChangeMoves(autoLinkCashMoves(insertCashMoveSorted(moves, top)))
  }

  function restoreOne(id: string) {
    const entry = undone.find((m) => m.id === id)
    if (!entry) return
    setUndone((stack) => stack.filter((m) => m.id !== id))
    if (moves.some((m) => m.id === entry.id)) return
    onChangeMoves(autoLinkCashMoves(insertCashMoveSorted(moves, entry)))
  }

  return (
    <div className="layout">
      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Cash receipt</h2>
            <p>
              Cash out from buys and cash in from sells, by date — with running
              balance
            </p>
          </div>
          <div className="cash-receipt-header-actions">
            <button type="button" className="ghost" onClick={onBackToCash}>
              ← Cash ledger
            </button>
            <div className="lot-toggles">
              <button
                type="button"
                className={`ghost${kind === 'all' ? ' active-toggle' : ''}`}
                aria-pressed={kind === 'all'}
                onClick={() => setKind('all')}
              >
                All
              </button>
              <button
                type="button"
                className={`ghost${kind === 'out' ? ' active-toggle' : ''}`}
                aria-pressed={kind === 'out'}
                onClick={() => setKind('out')}
              >
                Buys
              </button>
              <button
                type="button"
                className={`ghost${kind === 'in' ? ' active-toggle' : ''}`}
                aria-pressed={kind === 'in'}
                onClick={() => setKind('in')}
              >
                Sells
              </button>
            </div>
          </div>
        </div>

        {undone.length > 0 ? (
          <div className="cash-history-undo-bar" role="status">
            <p>
              Undid <strong>{undone[0].item || 'Untitled'}</strong>
              {undone.length > 1 ? ` · ${undone.length} in undo stack` : ''}
            </p>
            <button type="button" className="primary" onClick={restoreLast}>
              Restore
            </button>
          </div>
        ) : null}

        {historyRows.length === 0 ? (
          <p className="empty-note">No cash moves yet.</p>
        ) : (
          <ul className="cash-timeline cash-history-list">
            {kind === 'all' ? (
              <li className="cash-move opening-row">
                <CashMoveRail tone="neutral" />
                <div className="cash-move-main">
                  <div className="cash-move-item">
                    <span className="cash-move-desc-text">Opening balance</span>
                  </div>
                </div>
                <div className="cash-move-side">
                  <div className="cash-delta muted">
                    {formatMoney(openingBalance)}
                  </div>
                  <div className="cash-history-run">
                    {formatMoney(openingBalance)}
                  </div>
                </div>
              </li>
            ) : null}
            {historyRows.map(({ move, run }) => {
              const isSell = move.direction === 'in'
              return (
                <li
                  key={move.id}
                  className={`cash-move ${isSell ? 'sell-row' : 'buy-row'}`}
                >
                  <CashMoveRail tone={isSell ? 'in' : 'out'} />
                  <div className="cash-move-main">
                    <CashMoveDesc
                      item={move.item}
                      date={move.date}
                      tags={move.tags}
                    />
                    <div className="cash-move-meta">
                      <span className={`cash-type ${isSell ? 'in' : 'out'}`}>
                        {isSell ? 'Sell · in' : 'Buy · out'}
                      </span>
                      {isSell && move.soldVia ? (
                        <span className={`sold-via-pill ${move.soldVia}`}>
                          {SOLD_VIA.find((s) => s.id === move.soldVia)?.short}
                        </span>
                      ) : null}
                      <span className="cash-history-added">
                        Added {formatAddedAt(move.createdAt)}
                      </span>
                    </div>
                  </div>
                  <div className="cash-move-side">
                    <div className={`cash-delta ${isSell ? 'in' : 'out'}`}>
                      {isSell ? '+' : '−'}
                      {formatMoney(move.amount)}
                    </div>
                    {run != null ? (
                      <div className="cash-history-run">{formatMoney(run)}</div>
                    ) : null}
                    <div className="cash-move-actions">
                      <button
                        type="button"
                        className="icon-btn"
                        title="Undo transaction"
                        aria-label={`Undo ${isSell ? 'sell' : 'buy'}`}
                        onClick={() => undoMove(move)}
                      >
                        <IconUndo />
                      </button>
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      {undone.length > 0 ? (
        <section className="panel">
          <div className="panel-header">
            <div>
              <h2>Undone</h2>
              <p>Restore a transaction you removed from history</p>
            </div>
          </div>
          <ul className="cash-timeline cash-history-list">
            {undone.map((move) => {
              const isSell = move.direction === 'in'
              return (
                <li
                  key={`undone-${move.id}`}
                  className={`cash-move ${isSell ? 'sell-row' : 'buy-row'} cash-history-undone`}
                >
                  <CashMoveRail tone={isSell ? 'in' : 'out'} />
                  <div className="cash-move-main">
                    <CashMoveDesc
                      item={move.item}
                      date={move.date}
                      tags={move.tags}
                    />
                    <div className="cash-move-meta">
                      <span className={`cash-type ${isSell ? 'in' : 'out'}`}>
                        {isSell ? 'Sell · in' : 'Buy · out'}
                      </span>
                    </div>
                  </div>
                  <div className="cash-move-side">
                    <div className={`cash-delta ${isSell ? 'in' : 'out'}`}>
                      {isSell ? '+' : '−'}
                      {formatMoney(move.amount)}
                    </div>
                    <button
                      type="button"
                      className="ghost"
                      onClick={() => restoreOne(move.id)}
                    >
                      Restore
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      ) : null}
    </div>
  )
}

export function GearFlipsPanel({
  state,
  onChange,
  onReset,
}: {
  state: GearState
  onChange: (next: GearState) => void
  onReset: () => void
}) {
  const [sub, setSub] = useState<GearSubTab>(() => readGearSubTab())
  const [cashItemTagFilter, setCashItemTagFilter] =
    useState<ItemTagFilter>('all')
  const [monthId, setMonthId] = useState(() => {
    if (state.months.some((m) => m.id === '2026-08')) return '2026-08'
    return state.months[state.months.length - 1]?.id ?? state.months[0]?.id ?? ''
  })

  useEffect(() => {
    writeGearSubTab(sub)
  }, [sub])

  useEffect(() => {
    if (!monthId || state.months.some((m) => m.id === monthId)) return
    const fallback =
      state.months.find((m) => m.id === '2026-08')?.id ??
      state.months[state.months.length - 1]?.id ??
      ''
    if (fallback) setMonthId(fallback)
  }, [state.months, monthId])

  const keepList = state.keepList ?? []
  const projectedTargets = state.projectedTargets ?? {}
  const projectedManualRows = state.projectedManualRows ?? []
  const projectedAttachedBuys = state.projectedAttachedBuys ?? {}

  function keepBuy(move: GearCashMove) {
    if (move.direction !== 'out') return
    if (keepList.some((k) => k.cashMoveId === move.id)) return
    const entry: GearKeepItem = {
      id: `keep-${Date.now().toString(36)}`,
      item: (move.item ?? '').trim() || 'Untitled',
      tags: move.tags ? { ...move.tags } : null,
      notes: move.notes?.trim() || null,
      date: move.date?.slice(0, 10) ?? null,
      cost: move.amount,
      cashMoveId: move.id,
      createdAt: new Date().toISOString(),
    }
    const cash = state.cash.map((m) =>
      m.id === move.id ? { ...m, linkLocked: true } : m,
    )
    onChange({
      ...state,
      cash,
      keepList: [entry, ...keepList],
    })
  }

  function changeKeepList(next: GearKeepItem[]) {
    const prevIds = keptBuyIds(keepList)
    const nextIds = keptBuyIds(next)
    let cash = state.cash
    let changed = false
    cash = cash.map((m) => {
      const wasKept = prevIds.has(m.id)
      const isKept = nextIds.has(m.id)
      if (wasKept && !isKept && m.linkLocked) {
        changed = true
        return { ...m, linkLocked: false }
      }
      if (!wasKept && isKept && !m.linkLocked) {
        changed = true
        return { ...m, linkLocked: true }
      }
      return m
    })
    if (changed) cash = autoLinkCashMoves(cash)
    onChange({ ...state, cash, keepList: next })
  }

  function changeCash(cash: GearCashMove[]) {
    onChange({
      ...state,
      cash,
      months: syncPlannerMonths(
        state.months,
        cash,
        state.projectedManualRows ?? [],
      ),
    })
  }

  function changeManualRows(next: GearProjectedManualRow[]) {
    onChange({
      ...state,
      projectedManualRows: next,
      months: syncPlannerMonths(state.months, state.cash, next),
    })
  }

  function changeAttachedBuys(next: Record<string, string[]>) {
    onChange({ ...state, projectedAttachedBuys: next })
  }

  return (
    <div className="layout">
      <div className="panel-header bare">
        <div>
          <h2>Gear flips</h2>
          <p>
            Projected profit, cash ledger, keep list, and sales insights
          </p>
        </div>
        <div className="panel-filters">
          <div className="tabs gear-subtabs" aria-label="Gear sections">
            <button
              type="button"
              className="tab"
              aria-selected={sub === 'month'}
              onClick={() => setSub('month')}
            >
              Projected profit
            </button>
            <button
              type="button"
              className="tab"
              aria-selected={sub === 'cash'}
              onClick={() => setSub('cash')}
            >
              Cash ledger
            </button>
            <button
              type="button"
              className="tab"
              aria-selected={sub === 'history'}
              onClick={() => setSub('history')}
            >
              History
            </button>
            <button
              type="button"
              className="tab"
              aria-selected={sub === 'keep'}
              onClick={() => setSub('keep')}
            >
              Keep list
            </button>
            <button
              type="button"
              className="tab"
              aria-selected={sub === 'insights'}
              onClick={() => setSub('insights')}
            >
              Insights
            </button>
          </div>
          <button
            type="button"
            className="ghost danger"
            onClick={() => {
              const ok = confirmRemove(
                'Reset gear data to the shared Google Sheet seed?',
              )
              if (ok) onReset()
            }}
          >
            Reset from sheet
          </button>
        </div>
      </div>

      {sub === 'month' ? (
        <ProjectedProfitView
          months={state.months}
          monthId={monthId}
          onMonthId={setMonthId}
          cash={state.cash}
          keepList={keepList}
          targets={projectedTargets}
          onChangeTargets={(projectedTargets) =>
            onChange({ ...state, projectedTargets })
          }
          manualRows={projectedManualRows}
          onChangeManualRows={changeManualRows}
          attachedBuys={projectedAttachedBuys}
          onChangeAttachedBuys={changeAttachedBuys}
        />
      ) : null}

      {sub === 'cash' ? (
        <CashLedger
          openingBalance={state.openingBalance}
          moves={state.cash}
          keepList={keepList}
          projectedTargets={projectedTargets}
          onChangeOpening={(openingBalance) =>
            onChange({ ...state, openingBalance })
          }
          onChangeMoves={changeCash}
          onKeepBuy={keepBuy}
          onViewReceipt={() => setSub('history')}
          itemTagFilter={cashItemTagFilter}
          onItemTagFilterChange={setCashItemTagFilter}
        />
      ) : null}

      {sub === 'history' ? (
        <CashHistory
          openingBalance={state.openingBalance}
          moves={state.cash}
          onChangeMoves={changeCash}
          onBackToCash={() => setSub('cash')}
        />
      ) : null}

      {sub === 'keep' ? (
        <KeepListPanel keepList={keepList} onChange={changeKeepList} />
      ) : null}

      {sub === 'insights' ? (
        <InsightsPanel
          moves={state.cash}
          onTagUntagged={() => {
            setCashItemTagFilter('needs_tags')
            setSub('cash')
          }}
        />
      ) : null}
    </div>
  )
}
