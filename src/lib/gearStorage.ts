import {
  GEAR_CASH_SEED,
  GEAR_MONTHS_SEED,
  GEAR_OPENING_BALANCE,
} from '../data/gearSeed'
import {
  formatGearItemLabel,
  GEAR_KINDS,
  gearTagsEqual,
  kindLabel,
} from './gearTags'
import type {
  GearCashMove,
  GearItemTags,
  GearKeepItem,
  GearKind,
  GearListingStatus,
  GearMonth,
  GearProjectedManualRow,
  GearState,
} from '../types'

const GEAR_KEY = 'household-ledger.gear.v2'

const MONTH_SHORT = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

export function defaultGearState(): GearState {
  return {
    months: structuredClone(GEAR_MONTHS_SEED),
    openingBalance: GEAR_OPENING_BALANCE,
    cash: autoLinkCashMoves(structuredClone(GEAR_CASH_SEED)),
    keepList: [],
    projectedTargets: {},
    projectedManualRows: [],
    projectedAttachedBuys: {},
  }
}

export function emptyPlannerMonth(id: string, label?: string): GearMonth {
  const monthNum = Number(id.slice(5, 7))
  return {
    id,
    label:
      label ??
      (monthNum >= 1 && monthNum <= 12 ? MONTH_SHORT[monthNum - 1] : id),
    inventory: [],
    oldInventory: [],
    sales: [],
  }
}

/** Normalize projected sell targets (cashMoveId → amount). */
export function migrateProjectedTargets(
  raw: unknown,
): Record<string, number | null> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, number | null> = {}
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!key.trim()) continue
    if (value == null) {
      out[key] = null
      continue
    }
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
      out[key] = Math.round(value * 100) / 100
    }
  }
  return out
}

/** Normalize manual projected-profit rows from storage / backups. */
export function migrateProjectedManualRows(
  raw: unknown,
): GearProjectedManualRow[] {
  if (!Array.isArray(raw)) return []
  const out: GearProjectedManualRow[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const monthId =
      typeof r.monthId === 'string' && /^\d{4}-\d{2}$/.test(r.monthId.trim())
        ? r.monthId.trim()
        : ''
    const item = typeof r.item === 'string' ? r.item.trim() : ''
    const cost =
      typeof r.cost === 'number' && Number.isFinite(r.cost) && r.cost >= 0
        ? Math.round(r.cost * 100) / 100
        : NaN
    if (!monthId || !item || !Number.isFinite(cost)) continue
    let targetSold: number | null = null
    if (r.targetSold == null) {
      targetSold = null
    } else if (
      typeof r.targetSold === 'number' &&
      Number.isFinite(r.targetSold) &&
      r.targetSold >= 0
    ) {
      targetSold = Math.round(r.targetSold * 100) / 100
    } else {
      continue
    }
    out.push({
      id:
        typeof r.id === 'string' && r.id.trim()
          ? r.id.trim()
          : `proj-manual-${out.length + 1}`,
      monthId,
      item,
      cost,
      targetSold,
      date:
        typeof r.date === 'string' && r.date.trim() ? r.date.trim() : null,
    })
  }
  return out
}

/** Normalize monthId → cashMoveId[] pins from “Add from buys”. */
export function migrateProjectedAttachedBuys(
  raw: unknown,
): Record<string, string[]> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, string[]> = {}
  for (const [monthId, value] of Object.entries(
    raw as Record<string, unknown>,
  )) {
    if (!/^\d{4}-\d{2}$/.test(monthId)) continue
    if (!Array.isArray(value)) continue
    const ids: string[] = []
    const seen = new Set<string>()
    for (const entry of value) {
      if (typeof entry !== 'string') continue
      const id = entry.trim()
      if (!id || seen.has(id)) continue
      seen.add(id)
      ids.push(id)
    }
    if (ids.length > 0) out[monthId] = ids
  }
  return out
}

/**
 * Keep planner month shells in sync: always include Aug 2026, plus any
 * YYYY-MM that appears on a cash buy date or manual projected row.
 */
export function syncPlannerMonths(
  months: GearMonth[],
  cash: GearCashMove[],
  manualRows?: readonly GearProjectedManualRow[],
): GearMonth[] {
  const byId = new Map<string, GearMonth>()
  for (const m of months) {
    if (!m?.id) continue
    byId.set(m.id, m)
  }
  if (!byId.has('2026-08')) {
    byId.set('2026-08', emptyPlannerMonth('2026-08', 'Aug'))
  }
  for (const move of cash) {
    if (move.direction !== 'out') continue
    const ym = move.date?.slice(0, 7) ?? ''
    if (!/^\d{4}-\d{2}$/.test(ym)) continue
    if (!byId.has(ym)) byId.set(ym, emptyPlannerMonth(ym))
  }
  for (const row of manualRows ?? []) {
    const ym = row.monthId?.trim() ?? ''
    if (!/^\d{4}-\d{2}$/.test(ym)) continue
    if (!byId.has(ym)) byId.set(ym, emptyPlannerMonth(ym))
  }
  return [...byId.values()].sort((a, b) => a.id.localeCompare(b.id))
}

/** Same rule as the cash ledger UI: missing/null → not listed. */
export function effectiveListingStatus(
  move: GearCashMove,
): GearListingStatus {
  return move.listingStatus === 'listed' ? 'listed' : 'not_listed'
}

/**
 * Open flip inventory eligible for projected profit auto-include:
 * buy · not kept · not linked to a sell · listingStatus not listed.
 */
export function isOpenNotListedBuy(
  move: GearCashMove,
  moves: GearCashMove[],
  keepList: readonly GearKeepItem[],
): boolean {
  if (move.direction !== 'out') return false
  if (keptBuyIds(keepList).has(move.id)) return false
  if (cashGroupOpposites(moves, move).length > 0) return false
  return effectiveListingStatus(move) === 'not_listed'
}

/**
 * Cash buys that can be manually pinned onto a projected month sheet
 * (“Add from buys”): buy · not kept · not linked/sold. Includes listed
 * inventory (auto-include only covers not-listed).
 */
export function isEligibleProjectedAttachBuy(
  move: GearCashMove,
  moves: GearCashMove[],
  keepList: readonly GearKeepItem[],
): boolean {
  if (move.direction !== 'out') return false
  if (keptBuyIds(keepList).has(move.id)) return false
  if (cashGroupOpposites(moves, move).length > 0) return false
  return true
}

/**
 * Open flip inventory on hand: unsold buys not on the keep list
 * (listed and not-listed). Same eligibility as projected “Add from buys”.
 */
export function openInventoryBuys(
  moves: GearCashMove[],
  keepList: readonly GearKeepItem[],
): GearCashMove[] {
  return sortCashMoves(
    moves.filter((m) => isEligibleProjectedAttachBuy(m, moves, keepList)),
  )
}

export type OpenInventoryKindCount = {
  kind: GearKind
  label: string
  count: number
}

export type OpenInventoryProjectedSummary = {
  total: number
  byKind: OpenInventoryKindCount[]
  /** Sum of projectedTargets for open buys that have a target. */
  projectedCash: number
  /** Open buys that have a finite projected target. */
  pricedCount: number
}

/**
 * Stock counts by GearKind plus gross projected proceeds if open
 * inventory sells at projectedTargets (cash buy id → target sold).
 */
export function openInventoryProjectedSummary(
  moves: GearCashMove[],
  keepList: readonly GearKeepItem[],
  projectedTargets: Record<string, number | null> | undefined,
): OpenInventoryProjectedSummary {
  const open = openInventoryBuys(moves, keepList)
  const counts = new Map<GearKind, number>()
  let projectedCash = 0
  let pricedCount = 0
  const targets = projectedTargets ?? {}

  for (const buy of open) {
    const kind: GearKind =
      buy.tags?.kind && GEAR_KINDS.some((k) => k.id === buy.tags?.kind)
        ? buy.tags.kind
        : 'other'
    counts.set(kind, (counts.get(kind) ?? 0) + 1)
    const t = targets[buy.id]
    if (t != null && Number.isFinite(t)) {
      pricedCount += 1
      projectedCash += t
    }
  }

  const byKind: OpenInventoryKindCount[] = []
  for (const { id, label } of GEAR_KINDS) {
    const count = counts.get(id) ?? 0
    if (count > 0) byKind.push({ kind: id, label, count })
  }
  // Unknown kind ids (shouldn’t happen) — surface under Other.
  for (const [kind, count] of counts) {
    if (count > 0 && !byKind.some((b) => b.kind === kind)) {
      byKind.push({
        kind,
        label: kindLabel(kind) || 'Other',
        count,
      })
    }
  }

  return {
    total: open.length,
    byKind,
    projectedCash: Math.round(projectedCash * 100) / 100,
    pricedCount,
  }
}

/**
 * Month membership for projected profit sheets.
 *
 * Carry-forward (latest planner month only, e.g. August):
 *   Include open not-listed buys with buy YYYY-MM ≤ M, plus undated buys.
 *   Unsold inventory from prior months therefore appears on the current sheet.
 *
 * Past months:
 *   Include only buys whose buy month equals M. Undated buys never appear on
 *   past months. This avoids duplicating the same open buy when browsing an
 *   older sheet while it also carries forward onto the latest month.
 */
export function buyMatchesPlannerMonth(
  move: GearCashMove,
  monthId: string,
  latestMonthId: string,
): boolean {
  const ym = move.date?.slice(0, 7) || ''
  if (!ym) return monthId === latestMonthId
  if (monthId === latestMonthId) return ym <= monthId
  return ym === monthId
}

export function openNotListedBuysForMonth(
  moves: GearCashMove[],
  keepList: readonly GearKeepItem[],
  monthId: string,
  latestMonthId: string,
): GearCashMove[] {
  return sortCashMoves(
    moves.filter(
      (m) =>
        isOpenNotListedBuy(m, moves, keepList) &&
        buyMatchesPlannerMonth(m, monthId, latestMonthId),
    ),
  )
}

/**
 * Manually attached cash buys for a month that are still eligible and not
 * already present via auto open-not-listed include.
 */
export function attachedBuysForMonth(
  moves: GearCashMove[],
  keepList: readonly GearKeepItem[],
  monthId: string,
  latestMonthId: string,
  attached: Record<string, string[]> | undefined,
): GearCashMove[] {
  const ids = attached?.[monthId] ?? []
  if (ids.length === 0) return []
  const autoIds = new Set(
    openNotListedBuysForMonth(moves, keepList, monthId, latestMonthId).map(
      (m) => m.id,
    ),
  )
  const byId = new Map(moves.map((m) => [m.id, m]))
  const out: GearCashMove[] = []
  for (const id of ids) {
    if (autoIds.has(id)) continue
    const move = byId.get(id)
    if (!move) continue
    if (!isEligibleProjectedAttachBuy(move, moves, keepList)) continue
    out.push(move)
  }
  return sortCashMoves(out)
}

/** Eligible cash buys not already shown on this month’s projected sheet. */
export function buysAvailableToAttach(
  moves: GearCashMove[],
  keepList: readonly GearKeepItem[],
  monthId: string,
  latestMonthId: string,
  attached: Record<string, string[]> | undefined,
): GearCashMove[] {
  const shown = new Set([
    ...openNotListedBuysForMonth(moves, keepList, monthId, latestMonthId).map(
      (m) => m.id,
    ),
    ...(attached?.[monthId] ?? []),
  ])
  return sortCashMoves(
    moves.filter(
      (m) =>
        isEligibleProjectedAttachBuy(m, moves, keepList) && !shown.has(m.id),
    ),
  )
}

export function attachBuyToProjectedMonth(
  attached: Record<string, string[]>,
  monthId: string,
  cashMoveId: string,
): Record<string, string[]> {
  const existing = attached[monthId] ?? []
  if (existing.includes(cashMoveId)) return attached
  return { ...attached, [monthId]: [...existing, cashMoveId] }
}

export function detachBuyFromProjectedMonth(
  attached: Record<string, string[]>,
  monthId: string,
  cashMoveId: string,
): Record<string, string[]> {
  const existing = attached[monthId] ?? []
  const next = existing.filter((id) => id !== cashMoveId)
  if (next.length === existing.length) return attached
  const out = { ...attached }
  if (next.length === 0) delete out[monthId]
  else out[monthId] = next
  return out
}

/** Normalize keep-list rows from storage / backups (missing → []). */
export function migrateKeepList(raw: unknown): GearKeepItem[] {
  if (!Array.isArray(raw)) return []
  const out: GearKeepItem[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const item = typeof r.item === 'string' ? r.item.trim() : ''
    if (!item) continue
    const cost =
      typeof r.cost === 'number' && Number.isFinite(r.cost)
        ? Math.abs(r.cost)
        : null
    out.push({
      id: typeof r.id === 'string' && r.id.trim() ? r.id.trim() : `keep-${out.length + 1}`,
      item,
      notes:
        typeof r.notes === 'string' && r.notes.trim() ? r.notes.trim() : null,
      date: typeof r.date === 'string' && r.date.trim() ? r.date.trim() : null,
      cost,
      cashMoveId:
        typeof r.cashMoveId === 'string' && r.cashMoveId.trim()
          ? r.cashMoveId.trim()
          : null,
      createdAt: typeof r.createdAt === 'string' ? r.createdAt : null,
    })
  }
  return out
}

export function keptBuyIds(
  keepList: readonly GearKeepItem[],
): Set<string> {
  const ids = new Set<string>()
  for (const k of keepList) {
    if (k.cashMoveId) ids.add(k.cashMoveId)
  }
  return ids
}

function readLinkedMoveId(raw: unknown): string | null {
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null
}

function readLinkGroupId(raw: unknown): string | null {
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null
}

function readLinkLocked(raw: unknown): boolean {
  return raw === true
}

function readListingStatus(raw: unknown): GearListingStatus | null {
  if (raw === 'listed' || raw === 'not_listed') return raw
  return null
}

function readCashNotes(raw: unknown): string | null {
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null
}

function readCashTags(raw: unknown): GearItemTags | null {
  if (!raw || typeof raw !== 'object') return null
  return raw as GearItemTags
}

function migrateLegacyCash(raw: unknown): GearCashMove[] | null {
  if (!Array.isArray(raw)) return null
  const out: GearCashMove[] = []
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    if (typeof r.amount === 'number' && (r.direction === 'in' || r.direction === 'out')) {
      const soldVia =
        r.soldVia === 'fb' || r.soldVia === 'kijiji' || r.soldVia === 'ss'
          ? r.soldVia
          : null
      out.push({
        id: String(r.id ?? `cash-${out.length + 1}`),
        date: (r.date as string | null) ?? null,
        type: String(r.type ?? (r.direction === 'in' ? 'SELL' : 'BUY')),
        item: (r.item as string | null) ?? null,
        tags: readCashTags(r.tags),
        amount: Math.abs(r.amount),
        direction: r.direction,
        soldVia: r.direction === 'in' ? soldVia : null,
        linkGroupId: readLinkGroupId(r.linkGroupId),
        linkedMoveId: readLinkedMoveId(r.linkedMoveId),
        linkLocked: readLinkLocked(r.linkLocked),
        listingStatus:
          r.direction === 'out' ? readListingStatus(r.listingStatus) : null,
        notes: readCashNotes(r.notes),
        createdAt: typeof r.createdAt === 'string' ? r.createdAt : null,
      })
      continue
    }
    const cin = typeof r.cashIn === 'number' ? r.cashIn : null
    const cout = typeof r.cashOut === 'number' ? r.cashOut : null
    if (cin == null && cout == null) continue
    if (!r.type && !r.item) continue
    const direction: 'in' | 'out' = (cin ?? 0) > 0 ? 'in' : 'out'
    const amount = direction === 'in' ? (cin ?? 0) : (cout ?? 0)
    if (amount <= 0) continue
    out.push({
      id: String(r.id ?? `cash-${out.length + 1}`),
      date: (r.date as string | null) ?? null,
      type: String(r.type ?? (direction === 'in' ? 'SELL' : 'BUY')),
      item: (r.item as string | null) ?? null,
      tags: readCashTags(r.tags),
      amount,
      direction,
      linkGroupId: readLinkGroupId(r.linkGroupId),
      linkedMoveId: readLinkedMoveId(r.linkedMoveId),
      linkLocked: readLinkLocked(r.linkLocked),
      listingStatus:
        direction === 'out' ? readListingStatus(r.listingStatus) : null,
      notes: readCashNotes(r.notes),
      createdAt: typeof r.createdAt === 'string' ? r.createdAt : null,
    })
  }
  return out.length ? out : null
}

/** Turn legacy linkedMoveId pairs into shared linkGroupId values. */
export function migrateLegacyLinksToGroups(
  moves: GearCashMove[],
): GearCashMove[] {
  const next = moves.map((m) => ({
    ...m,
    linkGroupId: m.linkGroupId ?? null,
    linkedMoveId: m.linkedMoveId ?? null,
  }))
  const byId = new Map(next.map((m) => [m.id, m]))

  for (const m of next) {
    if (m.linkGroupId || !m.linkedMoveId) continue
    const partner = byId.get(m.linkedMoveId)
    if (!partner || partner.direction === m.direction) {
      m.linkedMoveId = null
      continue
    }
    const groupId =
      partner.linkGroupId || m.linkGroupId || `grp-${m.id}-${partner.id}`
    m.linkGroupId = groupId
    partner.linkGroupId = groupId
    m.linkedMoveId = null
    partner.linkedMoveId = null
  }

  return next.map((m) => ({ ...m, linkedMoveId: null }))
}

export function cashGroupMembers(
  moves: GearCashMove[],
  move: GearCashMove,
): GearCashMove[] {
  const groupId = move.linkGroupId
  if (!groupId) return []
  return moves.filter((m) => m.linkGroupId === groupId)
}

export function cashGroupOpposites(
  moves: GearCashMove[],
  move: GearCashMove,
): GearCashMove[] {
  return cashGroupMembers(moves, move).filter(
    (m) => m.id !== move.id && m.direction !== move.direction,
  )
}

export function cashGroupEconomics(
  moves: GearCashMove[],
  move: GearCashMove,
): {
  buys: GearCashMove[]
  sells: GearCashMove[]
  purchased: number
  sold: number
  profit: number
} | null {
  const members = cashGroupMembers(moves, move)
  if (members.length < 2) return null
  const buys = members.filter((m) => m.direction === 'out')
  const sells = members.filter((m) => m.direction === 'in')
  if (!buys.length || !sells.length) return null
  const purchased =
    Math.round(buys.reduce((s, m) => s + m.amount, 0) * 100) / 100
  const sold = Math.round(sells.reduce((s, m) => s + m.amount, 0) * 100) / 100
  return {
    buys,
    sells,
    purchased,
    sold,
    profit: Math.round((sold - purchased) * 100) / 100,
  }
}

export interface RealizedFlipMonthRow {
  linkGroupId: string
  /** Display name from sell item / gear tags. */
  label: string
  tags: GearItemTags | null
  sold: number
  purchased: number
  profit: number
  /** Earliest sell date in the month (YYYY-MM-DD). */
  sellDate: string
}

export interface RealizedFlipProfitMonth {
  /** Sum of (sell proceeds − linked buy cost) for groups sold this month. */
  profit: number
  sold: number
  purchased: number
  /** Linked groups attributed to this month. */
  groupCount: number
  /** Sell rows in this month that belong to those groups. */
  sellCount: number
  /** Per linked flip group sold this month. */
  flips: RealizedFlipMonthRow[]
}

function flipRowLabel(
  buys: GearCashMove[],
  sells: GearCashMove[],
): { label: string; tags: GearItemTags | null } {
  const fromMoves = (moves: GearCashMove[]) => {
    const labels: string[] = []
    let tags: GearItemTags | null = null
    for (const m of moves) {
      const fromTags = formatGearItemLabel(m.tags)
      const text = (m.item ?? '').trim() || fromTags
      if (text && !labels.includes(text)) labels.push(text)
      if (!tags && m.tags) tags = m.tags
    }
    return { labels, tags }
  }
  const sellSide = fromMoves(sells)
  if (sellSide.labels.length) {
    return { label: sellSide.labels.join(' · '), tags: sellSide.tags }
  }
  const buySide = fromMoves(buys)
  if (buySide.labels.length) {
    return { label: buySide.labels.join(' · '), tags: buySide.tags }
  }
  return { label: 'Untitled', tags: null }
}

/**
 * Realized gear-flip profit for a calendar month (YYYY-MM).
 * Uses gear cash link economics only — not household Transaction cash-ins.
 * Unlinked sells are omitted (no inventing cost). Multi-month flips: full
 * group profit is attributed when any sell date falls in `monthId` (deduped
 * by linkGroupId so a group is counted once per month view).
 */
export function realizedFlipProfitForMonth(
  cash: GearCashMove[],
  monthId: string,
): RealizedFlipProfitMonth {
  const empty: RealizedFlipProfitMonth = {
    profit: 0,
    sold: 0,
    purchased: 0,
    groupCount: 0,
    sellCount: 0,
    flips: [],
  }
  if (!/^\d{4}-\d{2}$/.test(monthId)) return empty

  const sellsInMonth = cash.filter(
    (m) =>
      m.direction === 'in' &&
      Boolean(m.linkGroupId) &&
      (m.date?.trim().slice(0, 7) ?? '') === monthId,
  )
  if (sellsInMonth.length === 0) return empty

  const seen = new Set<string>()
  let profit = 0
  let sold = 0
  let purchased = 0
  let groupCount = 0
  let sellCount = 0
  const flips: RealizedFlipMonthRow[] = []

  for (const sell of sellsInMonth) {
    const groupId = sell.linkGroupId
    if (!groupId || seen.has(groupId)) continue
    seen.add(groupId)
    const stats = cashGroupEconomics(cash, sell)
    if (!stats) continue
    const monthSells = stats.sells.filter(
      (s) => (s.date?.trim().slice(0, 7) ?? '') === monthId,
    )
    groupCount += 1
    sellCount += monthSells.length
    profit += stats.profit
    sold += stats.sold
    purchased += stats.purchased
    const { label, tags } = flipRowLabel(stats.buys, stats.sells)
    const sellDates = monthSells
      .map((s) => s.date?.trim().slice(0, 10) ?? '')
      .filter(Boolean)
      .sort()
    flips.push({
      linkGroupId: groupId,
      label,
      tags,
      sold: stats.sold,
      purchased: stats.purchased,
      profit: stats.profit,
      sellDate: sellDates[0] ?? sell.date?.trim().slice(0, 10) ?? '',
    })
  }

  flips.sort((a, b) => {
    if (a.sellDate !== b.sellDate) return a.sellDate < b.sellDate ? 1 : -1
    return a.label.localeCompare(b.label)
  })

  return {
    profit: Math.round(profit * 100) / 100,
    sold: Math.round(sold * 100) / 100,
    purchased: Math.round(purchased * 100) / 100,
    groupCount,
    sellCount,
    flips,
  }
}

export type GearInsightsPeriod = 'all' | 'month'

export interface CompletedFlipInsight {
  linkGroupId: string
  label: string
  tags: GearItemTags | null
  sold: number
  purchased: number
  profit: number
  /** Profit ÷ cost as a fraction (0.25 = 25%). Null when cost is 0. */
  margin: number | null
  buyDate: string
  sellDate: string
  /** Calendar days from earliest buy date to earliest sell date. */
  daysToSell: number | null
}

export interface VolumeLeaderInsight {
  key: string
  label: string
  sellCount: number
  totalSold: number
}

export interface GearSalesInsights {
  mostSuccessful: CompletedFlipInsight[]
  byKind: VolumeLeaderInsight[]
  byBrandModel: VolumeLeaderInsight[]
  fastest: CompletedFlipInsight[]
}

function parseYmd(value?: string | null): string {
  return value?.trim().slice(0, 10) ?? ''
}

function daysBetweenYmd(start: string, end: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) {
    return null
  }
  const a = Date.UTC(
    Number(start.slice(0, 4)),
    Number(start.slice(5, 7)) - 1,
    Number(start.slice(8, 10)),
  )
  const b = Date.UTC(
    Number(end.slice(0, 4)),
    Number(end.slice(5, 7)) - 1,
    Number(end.slice(8, 10)),
  )
  return Math.round((b - a) / 86_400_000)
}

function currentMonthId(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function sellInPeriod(
  sell: GearCashMove,
  period: GearInsightsPeriod,
  monthId: string,
): boolean {
  if (period === 'all') return true
  return (sell.date?.trim().slice(0, 7) ?? '') === monthId
}

function earliestDate(moves: GearCashMove[]): string {
  return moves
    .map((m) => parseYmd(m.date))
    .filter(Boolean)
    .sort()[0] ?? ''
}

function completedFlips(
  cash: GearCashMove[],
  period: GearInsightsPeriod,
  monthId: string,
): CompletedFlipInsight[] {
  const linkedSells = cash.filter(
    (m) =>
      m.direction === 'in' &&
      Boolean(m.linkGroupId) &&
      sellInPeriod(m, period, monthId),
  )
  const seen = new Set<string>()
  const flips: CompletedFlipInsight[] = []

  for (const sell of linkedSells) {
    const groupId = sell.linkGroupId
    if (!groupId || seen.has(groupId)) continue
    seen.add(groupId)
    const stats = cashGroupEconomics(cash, sell)
    if (!stats) continue
    const { label, tags } = flipRowLabel(stats.buys, stats.sells)
    const buyDate = earliestDate(stats.buys)
    const sellDate = earliestDate(stats.sells)
    const daysToSell = daysBetweenYmd(buyDate, sellDate)
    const margin =
      stats.purchased > 0
        ? Math.round((stats.profit / stats.purchased) * 1000) / 1000
        : null
    flips.push({
      linkGroupId: groupId,
      label,
      tags,
      sold: stats.sold,
      purchased: stats.purchased,
      profit: stats.profit,
      margin,
      buyDate,
      sellDate,
      daysToSell:
        daysToSell != null && daysToSell >= 0 ? daysToSell : null,
    })
  }

  return flips
}

function volumeLeaders(
  sells: GearCashMove[],
  keyOf: (sell: GearCashMove) => { key: string; label: string } | null,
): VolumeLeaderInsight[] {
  const map = new Map<string, VolumeLeaderInsight>()
  for (const sell of sells) {
    const keyed = keyOf(sell)
    if (!keyed) continue
    const prev = map.get(keyed.key)
    if (prev) {
      prev.sellCount += 1
      prev.totalSold =
        Math.round((prev.totalSold + sell.amount) * 100) / 100
    } else {
      map.set(keyed.key, {
        key: keyed.key,
        label: keyed.label,
        sellCount: 1,
        totalSold: Math.round(sell.amount * 100) / 100,
      })
    }
  }
  return [...map.values()].sort((a, b) => {
    if (b.sellCount !== a.sellCount) return b.sellCount - a.sellCount
    if (b.totalSold !== a.totalSold) return b.totalSold - a.totalSold
    return a.label.localeCompare(b.label)
  })
}

function brandModelKey(
  sell: GearCashMove,
): { key: string; label: string } | null {
  const brand = sell.tags?.brand?.trim() || ''
  const model = sell.tags?.detail?.trim() || ''
  if (brand || model) {
    const label = [brand, model].filter(Boolean).join(' ')
    return {
      key: `bm:${brand.toLowerCase()}|${model.toLowerCase()}`,
      label,
    }
  }
  const fromTags = formatGearItemLabel(sell.tags)
  const text = (sell.item ?? '').trim() || fromTags
  if (!text) return null
  return { key: `item:${normalizeCashItem(text)}`, label: text }
}

function kindVolumeKey(
  sell: GearCashMove,
): { key: string; label: string } | null {
  const kind = sell.tags?.kind
  if (kind && kind !== 'other') {
    return { key: `kind:${kind}`, label: kindLabel(kind) }
  }
  if (kind === 'other') {
    return { key: 'kind:other', label: 'Other' }
  }
  const type = (sell.type ?? '').trim()
  if (type && type !== 'SELL' && type !== 'BUY') {
    return { key: `type:${type.toLowerCase()}`, label: type }
  }
  return { key: 'kind:unknown', label: 'Untagged' }
}

/**
 * Sales insights from gear cash ledger moves.
 * Profit / speed use completed linked flips only; volume uses sell rows.
 */
export function gearSalesInsights(
  cash: GearCashMove[],
  period: GearInsightsPeriod = 'all',
  now = new Date(),
): GearSalesInsights {
  const monthId = currentMonthId(now)
  const flips = completedFlips(cash, period, monthId)
  const sells = cash.filter(
    (m) => m.direction === 'in' && sellInPeriod(m, period, monthId),
  )

  const mostSuccessful = [...flips].sort((a, b) => {
    if (b.profit !== a.profit) return b.profit - a.profit
    const am = a.margin ?? -Infinity
    const bm = b.margin ?? -Infinity
    if (bm !== am) return bm - am
    return a.label.localeCompare(b.label)
  })

  const fastest = flips
    .filter((f) => f.daysToSell != null)
    .sort((a, b) => {
      const ad = a.daysToSell ?? Infinity
      const bd = b.daysToSell ?? Infinity
      if (ad !== bd) return ad - bd
      if (b.profit !== a.profit) return b.profit - a.profit
      return a.label.localeCompare(b.label)
    })

  return {
    mostSuccessful,
    byKind: volumeLeaders(sells, kindVolumeKey),
    byBrandModel: volumeLeaders(sells, brandModelKey),
    fastest,
  }
}

export function normalizeCashItem(item?: string | null): string {
  return (item ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

/**
 * Score how likely an opposite-direction row is a good link partner.
 * Higher is better. Used to sort the link popup candidate list.
 */
export function scoreLinkCandidate(
  source: GearCashMove,
  candidate: GearCashMove,
): number {
  if (source.direction === candidate.direction) return -Infinity

  let score = 0
  const srcItem = normalizeCashItem(source.item)
  const candItem = normalizeCashItem(candidate.item)

  if (srcItem && candItem) {
    if (srcItem === candItem) score += 100
    else if (srcItem.includes(candItem) || candItem.includes(srcItem)) score += 55
    else {
      // Token overlap (e.g. "Nike Phantom" vs "Phantom FG")
      const srcTokens = new Set(srcItem.split(' ').filter((t) => t.length > 2))
      const candTokens = candItem.split(' ').filter((t) => t.length > 2)
      let overlap = 0
      for (const t of candTokens) {
        if (srcTokens.has(t)) overlap += 1
      }
      if (overlap > 0) score += 20 + overlap * 12
    }
  }

  const srcTags = source.tags
  const candTags = candidate.tags
  if (srcTags?.kind && candTags?.kind) {
    if (gearTagsEqual(srcTags, candTags)) score += 90
    else {
      if (srcTags.kind === candTags.kind) score += 25
      if (srcTags.level && srcTags.level === candTags.level) score += 15
      if (srcTags.size && srcTags.size === candTags.size) score += 20
      if (srcTags.brand && srcTags.brand === candTags.brand) score += 15
      if (srcTags.colour && srcTags.colour === candTags.colour) score += 10
    }
  }

  const maxAmt = Math.max(source.amount, candidate.amount, 0.01)
  const amtRatio = Math.abs(source.amount - candidate.amount) / maxAmt
  if (amtRatio <= 0.02) score += 45
  else if (amtRatio <= 0.1) score += 30
  else if (amtRatio <= 0.25) score += 15
  else if (amtRatio <= 0.5) score += 5

  const sameGroup =
    Boolean(source.linkGroupId) &&
    source.linkGroupId === candidate.linkGroupId
  if (sameGroup) {
    score += 8 // already linked — keep near top so they’re easy to see
  } else if (!candidate.linkGroupId) {
    score += 35 // prefer free opposite rows
  } else {
    score += 8 // partially linked elsewhere — still usable (group merge)
  }

  const srcDate = source.date?.slice(0, 10) || ''
  const candDate = candidate.date?.slice(0, 10) || ''
  if (srcDate && candDate) {
    const dayMs = 86_400_000
    const diffDays = Math.abs(
      (Date.parse(srcDate) - Date.parse(candDate)) / dayMs,
    )
    if (Number.isFinite(diffDays)) {
      if (diffDays <= 3) score += 25
      else if (diffDays <= 14) score += 15
      else if (diffDays <= 45) score += 8
      else if (diffDays <= 120) score += 3
    }
  } else if (candDate) {
    // Prefer more recent undated-source candidates lightly via createdAt/date
    score += 2
  }

  const created = candidate.createdAt ? Date.parse(candidate.createdAt) : NaN
  if (Number.isFinite(created)) {
    const ageDays = (Date.now() - created) / 86_400_000
    if (ageDays <= 7) score += 10
    else if (ageDays <= 30) score += 5
  }

  return score
}

/** Opposite-direction candidates for linking, highest score first. */
export function rankLinkCandidates(
  moves: GearCashMove[],
  source: GearCashMove,
): Array<{ move: GearCashMove; score: number; suggested: boolean }> {
  const scored = moves
    .filter((m) => m.id !== source.id && m.direction !== source.direction)
    .map((move) => {
      const score = scoreLinkCandidate(source, move)
      return { move, score, suggested: score >= 60 }
    })
  scored.sort(
    (a, b) =>
      b.score - a.score ||
      (b.move.date || '').localeCompare(a.move.date || '') ||
      a.move.id.localeCompare(b.move.id),
  )
  return scored
}

/** Distinct buy item names useful when logging a sell (inventory still open). */
export type SellItemSuggestion = {
  key: string
  label: string
  /** Buy value still unmatched by linked sells. */
  remaining: number
  /** Structured tags from a matching buy, when available. */
  tags?: GearItemTags | null
  /** Preferred buy row to link when logging this sell. */
  buyId?: string | null
}

/**
 * Suggest inventory names for a new/edited sell from prior buys.
 * Prefers unlinked buys, then linked groups where purchased > sold.
 * Fully matched groups (sold ≥ purchased) are omitted.
 * Buys on the keep list (via cashMoveId) are excluded.
 */
export function suggestSellItemNames(
  moves: GearCashMove[],
  excludeBuyIds?: ReadonlySet<string> | readonly string[],
): SellItemSuggestion[] {
  type Acc = {
    label: string
    remaining: number
    priority: number
    tags?: GearItemTags | null
    buyId?: string | null
  }
  const byKey = new Map<string, Acc>()
  const excluded =
    excludeBuyIds instanceof Set
      ? excludeBuyIds
      : new Set(excludeBuyIds ?? [])

  function bump(
    label: string,
    remaining: number,
    priority: number,
    tags?: GearItemTags | null,
    buyId?: string | null,
  ) {
    const key = normalizeCashItem(label)
    const trimmed = label.trim()
    if (!key || !trimmed || remaining <= 0) return
    const prev = byKey.get(key)
    if (!prev) {
      byKey.set(key, { label: trimmed, remaining, priority, tags, buyId })
      return
    }
    byKey.set(key, {
      label: prev.label,
      remaining:
        Math.round((prev.remaining + remaining) * 100) / 100,
      priority: Math.max(prev.priority, priority),
      tags: prev.tags ?? tags,
      buyId: prev.buyId ?? buyId ?? null,
    })
  }

  for (const buy of moves) {
    if (buy.direction !== 'out' || buy.linkGroupId) continue
    if (excluded.has(buy.id)) continue
    const label = (buy.item ?? '').trim()
    if (!label) continue
    bump(label, buy.amount, 2, buy.tags, buy.id)
  }

  const groups = new Map<string, GearCashMove[]>()
  for (const m of moves) {
    if (!m.linkGroupId) continue
    const list = groups.get(m.linkGroupId) ?? []
    list.push(m)
    groups.set(m.linkGroupId, list)
  }

  for (const members of groups.values()) {
    const groupBuys = members.filter(
      (m) => m.direction === 'out' && !excluded.has(m.id),
    )
    const groupSells = members.filter((m) => m.direction === 'in')
    if (!groupBuys.length) continue
    const purchased = sumNullable(groupBuys.map((m) => m.amount))
    const sold = sumNullable(groupSells.map((m) => m.amount))
    const remaining = Math.round((purchased - sold) * 100) / 100
    if (remaining <= 0) continue

    const namedBuys = groupBuys.filter((b) => normalizeCashItem(b.item))
    const namedPurchased = sumNullable(namedBuys.map((m) => m.amount))
    if (namedPurchased <= 0) continue

    const priority = groupSells.length === 0 ? 2 : 1
    const nameTotals = new Map<
      string,
      {
        label: string
        amount: number
        tags?: GearItemTags | null
        buyId?: string | null
      }
    >()
    for (const b of namedBuys) {
      const label = (b.item ?? '').trim()
      const key = normalizeCashItem(label)
      const prev = nameTotals.get(key)
      if (prev) prev.amount = Math.round((prev.amount + b.amount) * 100) / 100
      else
        nameTotals.set(key, {
          label,
          amount: b.amount,
          tags: b.tags,
          buyId: b.id,
        })
    }

    for (const { label, amount, tags, buyId } of nameTotals.values()) {
      const share =
        Math.round(remaining * (amount / namedPurchased) * 100) / 100
      bump(label, share, priority, tags, buyId)
    }
  }

  return [...byKey.entries()]
    .map(([key, v]) => ({
      key,
      label: v.label,
      remaining: v.remaining,
      priority: v.priority,
      tags: v.tags,
      buyId: v.buyId,
    }))
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        b.remaining - a.remaining ||
        a.label.localeCompare(b.label),
    )
    .map(({ key, label, remaining, tags, buyId }) => ({
      key,
      label,
      remaining,
      tags: tags ?? null,
      buyId: buyId ?? null,
    }))
}

/** Typing prediction for the buy item field (brand / model / full name). */
export type BuyItemSuggestion = {
  key: string
  /** Chip text shown in the UI. */
  label: string
  /** Value written into the item field on select. */
  value: string
  kind: 'full' | 'brand' | 'model'
  count: number
}

function isBrandLikeToken(token: string): boolean {
  const t = token.trim()
  if (t.length < 2 || t.length > 24) return false
  // Skip pure numbers / sizes like "34+2", "6.9", "s29"
  if (/^[\d.+x×/-]+$/i.test(t)) return false
  if (/^[a-z]?\d/i.test(t) && !/^[A-Z]{2,}$/.test(t)) return false
  return true
}

  function matchStrength(haystack: string, needle: string): number {
  if (!needle || !haystack) return -1
  if (haystack === needle) return 3
  if (haystack.startsWith(needle)) return 2
  const parts = haystack.split(' ')
  if (parts.some((p) => p.startsWith(needle))) return 1
  // Avoid weak 1–2 char substring noise (e.g. "e" inside "6.9").
  if (needle.length >= 3 && haystack.includes(needle)) return 0
  return -1
}

/**
 * Soft typing predictions for buy item names from past cash moves + keep list.
 * Frequency-ranked; prefers full-name matches, then brand tokens, then model
 * fragments once a known brand is already typed. No NLP.
 */
export function suggestBuyItemNames(
  moves: GearCashMove[],
  keepList: readonly { item: string }[],
  query: string,
  limit = 10,
): BuyItemSuggestion[] {
  const qRaw = query.trim()
  const q = normalizeCashItem(qRaw)
  if (!q) return []

  type Acc = { label: string; count: number }
  const fullByKey = new Map<string, Acc>()
  const brandByKey = new Map<string, Acc>()

  function bump(map: Map<string, Acc>, label: string, weight: number) {
    const trimmed = label.trim()
    const key = normalizeCashItem(trimmed)
    if (!key || !trimmed) return
    const prev = map.get(key)
    if (!prev) {
      map.set(key, { label: trimmed, count: weight })
      return
    }
    map.set(key, {
      // Prefer the casing from the higher-weighted / longer label.
      label:
        weight > prev.count ||
        (weight === prev.count && trimmed.length > prev.label.length)
          ? trimmed
          : prev.label,
      count: prev.count + weight,
    })
  }

  for (const m of moves) {
    const label = (m.item ?? '').trim()
    if (!label) continue
    const weight = m.direction === 'out' ? 2 : 1
    bump(fullByKey, label, weight)
    const first = label.split(/\s+/)[0] ?? ''
    if (isBrandLikeToken(first)) bump(brandByKey, first, weight)
  }
  for (const k of keepList) {
    const label = (k.item ?? '').trim()
    if (!label) continue
    bump(fullByKey, label, 1)
    const first = label.split(/\s+/)[0] ?? ''
    if (isBrandLikeToken(first)) bump(brandByKey, first, 1)
  }

  const qTokens = q.split(' ').filter(Boolean)
  const typingFirstToken = qTokens.length <= 1 && !/\s$/.test(query)
  const brandPrefix = qTokens[0] ?? ''
  const knownBrand = brandByKey.get(brandPrefix)
  const remainder = qTokens.slice(1).join(' ')
  const afterBrand =
    Boolean(knownBrand) && (qTokens.length > 1 || /\s$/.test(query))

  type Cand = BuyItemSuggestion & { strength: number; rank: number }
  const out = new Map<string, Cand>()

  function consider(s: BuyItemSuggestion, strength: number, kindBoost: number) {
    if (strength < 0) return
    // Skip exact current value — not useful as a prediction.
    if (normalizeCashItem(s.value) === q) return
    const rank = strength * 1000 + kindBoost * 100 + s.count
    const dedupeKey = normalizeCashItem(s.value)
    const prev = out.get(dedupeKey)
    if (prev && prev.rank >= rank) return
    out.set(dedupeKey, { ...s, strength, rank })
  }

  for (const [key, { label, count }] of fullByKey) {
    if (afterBrand && knownBrand) {
      const brandKey = normalizeCashItem(knownBrand.label)
      if (key === brandKey || !key.startsWith(brandKey + ' ')) continue
      const modelLabel = label.slice(knownBrand.label.length).trim()
      if (!modelLabel) continue
      const modelKey = normalizeCashItem(modelLabel)
      const modelStrength = remainder
        ? matchStrength(modelKey, remainder)
        : 2
      if (modelStrength < 0) continue
      consider(
        {
          key: `model:${key}`,
          label: modelLabel,
          value: label,
          kind: 'model',
          count,
        },
        modelStrength,
        2,
      )
      continue
    }

    const strength = matchStrength(key, q)
    if (strength >= 0) {
      consider(
        { key: `full:${key}`, label, value: label, kind: 'full', count },
        strength,
        3,
      )
    }
  }

  if (typingFirstToken) {
    for (const [key, { label, count }] of brandByKey) {
      const strength = matchStrength(key, q)
      if (strength < 0) continue
      // Avoid a brand chip that duplicates a full-name chip with the same text.
      if (fullByKey.has(key) && strength < 2) continue
      consider(
        { key: `brand:${key}`, label, value: label, kind: 'brand', count },
        strength,
        1,
      )
    }
  }

  return [...out.values()]
    .sort(
      (a, b) =>
        b.rank - a.rank ||
        a.label.localeCompare(b.label) ||
        a.key.localeCompare(b.key),
    )
    .slice(0, limit)
    .map(({ key, label, value, kind, count }) => ({
      key,
      label,
      value,
      kind,
      count,
    }))
}

/** Dated entries first (ascending); undated entries after all dated ones. */
export function compareCashDates(
  a?: string | null,
  b?: string | null,
): number {
  const ad = a?.slice(0, 10) || ''
  const bd = b?.slice(0, 10) || ''
  if (!ad && !bd) return 0
  if (!ad) return 1
  if (!bd) return -1
  return ad.localeCompare(bd)
}

export function insertCashMoveSorted(
  moves: GearCashMove[],
  move: GearCashMove,
): GearCashMove[] {
  const next = [...moves]
  let i = 0
  while (i < next.length && compareCashDates(next[i].date, move.date) <= 0) {
    i += 1
  }
  next.splice(i, 0, move)
  return next
}

/** Keep cash ledger ordered by date ascending (newest at bottom; undated last). */
export function sortCashMoves(moves: GearCashMove[]): GearCashMove[] {
  return [...moves].sort((a, b) => {
    const byDate = compareCashDates(a.date, b.date)
    if (byDate !== 0) return byDate
    const ac = a.createdAt || ''
    const bc = b.createdAt || ''
    if (ac && bc && ac !== bc) return ac.localeCompare(bc)
    if (ac !== bc) return ac ? 1 : -1
    return a.id.localeCompare(b.id)
  })
}

function newLinkGroupId(aId: string, bId: string): string {
  return `grp-${aId}-${bId}-${Date.now().toString(36)}`
}

/** True when a group still has at least one buy and one sell. */
function groupHasOpposites(members: GearCashMove[]): boolean {
  let hasIn = false
  let hasOut = false
  for (const m of members) {
    if (m.direction === 'in') hasIn = true
    else hasOut = true
    if (hasIn && hasOut) return true
  }
  return false
}

/**
 * Keep valid existing groups, then 1:1 match remaining buy/sell rows
 * that share a normalized item name into new link groups.
 * Prefers pairing a buy with the nearest sell on/after its date.
 * Locked rows are left alone; same-name unlocked pairs always link.
 */
export function autoLinkCashMoves(moves: GearCashMove[]): GearCashMove[] {
  const migrated = migrateLegacyLinksToGroups(moves)
  const byId = new Map(
    migrated.map((m) => [
      m.id,
      {
        ...m,
        linkGroupId: m.linkGroupId ?? null,
        linkedMoveId: null,
        linkLocked: m.linkLocked === true,
      } as GearCashMove,
    ]),
  )

  // Drop invalid / singleton groups so auto-match can reclaim unlocked rows.
  const byGroup = new Map<string, GearCashMove[]>()
  for (const m of byId.values()) {
    if (!m.linkGroupId) continue
    const list = byGroup.get(m.linkGroupId) ?? []
    list.push(m)
    byGroup.set(m.linkGroupId, list)
  }
  for (const members of byGroup.values()) {
    if (members.length >= 2 && groupHasOpposites(members)) continue
    for (const m of members) {
      if (m.linkLocked) continue
      m.linkGroupId = null
    }
    const remaining = members.filter((m) => m.linkGroupId)
    if (remaining.length < 2 || !groupHasOpposites(remaining)) {
      for (const m of remaining) m.linkGroupId = null
    }
  }

  const used = new Set<string>()
  for (const m of byId.values()) {
    if (m.linkGroupId) used.add(m.id)
  }

  const buysByName = new Map<string, GearCashMove[]>()
  const sellsByName = new Map<string, GearCashMove[]>()
  for (const original of migrated) {
    const m = byId.get(original.id)!
    if (used.has(m.id) || m.linkLocked) continue
    const key = normalizeCashItem(m.item)
    if (!key) continue
    if (m.direction === 'out') {
      const list = buysByName.get(key) ?? []
      list.push(m)
      buysByName.set(key, list)
    } else {
      const list = sellsByName.get(key) ?? []
      list.push(m)
      sellsByName.set(key, list)
    }
  }

  for (const buyList of buysByName.values()) {
    const key = normalizeCashItem(buyList[0]?.item)
    const sellList = [...(sellsByName.get(key) ?? [])]
    if (!sellList.length) continue
    buyList.sort(
      (a, b) => compareCashDates(a.date, b.date) || a.id.localeCompare(b.id),
    )
    sellList.sort(
      (a, b) => compareCashDates(a.date, b.date) || a.id.localeCompare(b.id),
    )

    const takenSells = new Set<string>()
    for (const buy of buyList) {
      if (used.has(buy.id)) continue
      let bestIdx = -1
      for (let i = 0; i < sellList.length; i += 1) {
        const sell = sellList[i]
        if (takenSells.has(sell.id) || used.has(sell.id)) continue
        const buyDate = buy.date?.slice(0, 10) || ''
        const sellDate = sell.date?.slice(0, 10) || ''
        if (buyDate && sellDate && sellDate < buyDate) {
          if (bestIdx < 0) bestIdx = i
          continue
        }
        bestIdx = i
        break
      }
      if (bestIdx < 0) continue
      const sell = sellList[bestIdx]
      takenSells.add(sell.id)
      used.add(buy.id)
      used.add(sell.id)
      const groupId = newLinkGroupId(buy.id, sell.id)
      buy.linkGroupId = groupId
      sell.linkGroupId = groupId
      buy.linkedMoveId = null
      sell.linkedMoveId = null
      buy.linkLocked = false
      sell.linkLocked = false
    }
  }

  return sortCashMoves(migrated.map((m) => byId.get(m.id)!))
}

export function cashLinksChanged(
  before: GearCashMove[],
  after: GearCashMove[],
): boolean {
  if (before.length !== after.length) return true
  for (let i = 0; i < before.length; i += 1) {
    if (before[i].id !== after[i].id) return true
    if ((before[i].linkGroupId ?? null) !== (after[i].linkGroupId ?? null)) {
      return true
    }
    if ((before[i].linkedMoveId ?? null) !== (after[i].linkedMoveId ?? null)) {
      return true
    }
    if (Boolean(before[i].linkLocked) !== Boolean(after[i].linkLocked)) {
      return true
    }
  }
  return false
}

/**
 * Merge two opposite-direction rows into one link group.
 * Joins into an existing group when either already belongs to one;
 * merges both groups when they differ.
 */
export function linkCashMoves(
  moves: GearCashMove[],
  aId: string,
  bId: string,
): GearCashMove[] {
  if (aId === bId) return moves
  const a = moves.find((m) => m.id === aId)
  const b = moves.find((m) => m.id === bId)
  if (!a || !b || a.direction === b.direction) return moves

  const aGroup = a.linkGroupId ?? null
  const bGroup = b.linkGroupId ?? null
  const groupId =
    aGroup || bGroup || newLinkGroupId(aId, bId)
  const absorbed = aGroup && bGroup && aGroup !== bGroup ? bGroup : null

  return moves.map((m) => {
    const inMerge =
      m.id === aId ||
      m.id === bId ||
      (aGroup != null && m.linkGroupId === aGroup) ||
      (absorbed != null && m.linkGroupId === absorbed) ||
      (bGroup != null && !aGroup && m.linkGroupId === bGroup)
    if (!inMerge) return m
    return {
      ...m,
      linkGroupId: groupId,
      linkedMoveId: null,
      linkLocked: true,
    }
  })
}

/**
 * Remove one row from its group and lock it so auto-match won’t rejoin.
 * Remaining members keep the group if ≥1 buy and ≥1 sell stay; otherwise clear.
 */
export function unlinkCashMove(
  moves: GearCashMove[],
  id: string,
): GearCashMove[] {
  const victim = moves.find((m) => m.id === id)
  if (!victim) return moves
  const groupId = victim.linkGroupId
  if (!groupId) {
    return moves.map((m) =>
      m.id === id
        ? { ...m, linkedMoveId: null, linkGroupId: null, linkLocked: true }
        : m,
    )
  }

  const remaining = moves.filter(
    (m) => m.id !== id && m.linkGroupId === groupId,
  )
  const keepGroup =
    remaining.length >= 2 && groupHasOpposites(remaining)

  return moves.map((m) => {
    if (m.id === id) {
      return {
        ...m,
        linkGroupId: null,
        linkedMoveId: null,
        linkLocked: true,
      }
    }
    if (m.linkGroupId === groupId && !keepGroup) {
      return {
        ...m,
        linkGroupId: null,
        linkedMoveId: null,
        linkLocked: true,
      }
    }
    return m
  })
}

function linksChanged(before: GearCashMove[], after: GearCashMove[]): boolean {
  return cashLinksChanged(before, after)
}

/**
 * Sheet-origin rows (no createdAt) keep dates aligned with the seed,
 * so bad local years (e.g. 2026-12-24 vs seed 2025-12-24) sort correctly.
 */
export function reconcileSeedCashDates(moves: GearCashMove[]): GearCashMove[] {
  const seedById = new Map(GEAR_CASH_SEED.map((m) => [m.id, m]))
  let changed = false
  const next = moves.map((m) => {
    if (m.createdAt) return m
    const seed = seedById.get(m.id)
    if (!seed) return m
    const seedDate = seed.date ?? null
    const curDate = m.date ?? null
    if (seedDate === curDate) return m
    changed = true
    return { ...m, date: seedDate }
  })
  return changed ? next : moves
}

export function loadGearState(): GearState {
  try {
    const raw =
      localStorage.getItem(GEAR_KEY) ??
      localStorage.getItem('household-ledger.gear.v1')
    if (!raw) return defaultGearState()
    const parsed = JSON.parse(raw) as Partial<GearState> & {
      cash?: unknown
      keepList?: unknown
      projectedTargets?: unknown
      projectedManualRows?: unknown
      projectedAttachedBuys?: unknown
    }
    if (!parsed?.months?.length) return defaultGearState()
    const migrated =
      migrateLegacyCash(parsed.cash) ?? structuredClone(GEAR_CASH_SEED)
    const grouped = migrateLegacyLinksToGroups(migrated)
    const reconciled = reconcileSeedCashDates(grouped)
    const cash = autoLinkCashMoves(reconciled)
    const keepList = migrateKeepList(parsed.keepList)
    const hadKeepList = Array.isArray(parsed.keepList)
    const projectedManualRows = migrateProjectedManualRows(
      parsed.projectedManualRows,
    )
    const hadProjectedManualRows = Array.isArray(parsed.projectedManualRows)
    const months = syncPlannerMonths(
      parsed.months,
      cash,
      projectedManualRows,
    )
    const monthsChanged =
      months.length !== parsed.months.length ||
      months.some((m, i) => m.id !== parsed.months![i]?.id)
    const hadProjectedTargets = parsed.projectedTargets != null
    const projectedTargets = migrateProjectedTargets(parsed.projectedTargets)
    const hadProjectedAttachedBuys = parsed.projectedAttachedBuys != null
    const projectedAttachedBuys = migrateProjectedAttachedBuys(
      parsed.projectedAttachedBuys,
    )
    const state: GearState = {
      months,
      openingBalance:
        typeof parsed.openingBalance === 'number'
          ? parsed.openingBalance
          : GEAR_OPENING_BALANCE,
      cash,
      keepList,
      projectedTargets,
      projectedManualRows,
      projectedAttachedBuys,
    }
    if (
      linksChanged(migrated, cash) ||
      linksChanged(grouped, cash) ||
      linksChanged(reconciled, cash) ||
      !hadKeepList ||
      !hadProjectedTargets ||
      !hadProjectedManualRows ||
      !hadProjectedAttachedBuys ||
      monthsChanged
    ) {
      saveGearState(state)
    } else if (reconciled !== grouped || grouped !== migrated) {
      saveGearState(state)
    }
    return state
  } catch {
    return defaultGearState()
  }
}

export function saveGearState(state: GearState): void {
  localStorage.setItem(GEAR_KEY, JSON.stringify(state))
}

export function resetGearState(): GearState {
  const next = defaultGearState()
  saveGearState(next)
  return next
}

export function sumNullable(values: Array<number | null | undefined>): number {
  return Math.round(values.reduce<number>((s, v) => s + (v ?? 0), 0) * 100) / 100
}

export function signedCashAmount(move: GearCashMove): number {
  return move.direction === 'in' ? move.amount : -move.amount
}

export function cashBalance(opening: number, moves: GearCashMove[]): number {
  return (
    Math.round(
      (opening + moves.reduce((s, m) => s + signedCashAmount(m), 0)) * 100,
    ) / 100
  )
}

/** Remove a cash row; dissolve its group if leftovers are invalid, then re-auto-link. */
export function removeCashMove(
  moves: GearCashMove[],
  id: string,
): GearCashMove[] {
  const victim = moves.find((m) => m.id === id)
  let next = moves.filter((m) => m.id !== id)
  const groupId = victim?.linkGroupId
  if (groupId) {
    const remaining = next.filter((m) => m.linkGroupId === groupId)
    const keepGroup =
      remaining.length >= 2 && groupHasOpposites(remaining)
    if (!keepGroup) {
      next = next.map((m) =>
        m.linkGroupId === groupId
          ? { ...m, linkGroupId: null, linkedMoveId: null, linkLocked: false }
          : m,
      )
    }
  }
  return autoLinkCashMoves(next)
}

/** Newest added first; falls back to transaction date, then id. */
export function compareCashHistory(
  a: GearCashMove,
  b: GearCashMove,
): number {
  // Ascending: oldest / earliest at top, most recent at bottom.
  const ac = a.createdAt || ''
  const bc = b.createdAt || ''
  if (ac && bc && ac !== bc) return ac.localeCompare(bc)
  if (ac && !bc) return 1
  if (!ac && bc) return -1
  const byDate = compareCashDates(a.date, b.date)
  if (byDate !== 0) return byDate
  return a.id.localeCompare(b.id)
}

export function cashTimeline(opening: number, moves: GearCashMove[]) {
  let run = opening
  return sortCashMoves(moves).map((move) => {
    const delta = signedCashAmount(move)
    run = Math.round((run + delta) * 100) / 100
    return { move, delta, balance: run }
  })
}
