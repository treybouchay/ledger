const TABS = [
  'overview',
  'budget',
  'categories',
  'transactions',
  'log',
  'upload',
  'learning',
  'gear',
  'settings',
] as const

export type AppTab = (typeof TABS)[number]

export type SideNavId = 'budgeting' | 'learning' | 'gear' | 'settings'

/** Horizontal tabs shown while Budgeting is selected in the side rail. */
export const BUDGETING_TABS = [
  ['overview', 'Month overview'],
  ['budget', 'Income & bills'],
  ['categories', 'Categories'],
  ['transactions', 'Transactions'],
  ['log', 'Log entry'],
  ['upload', 'Import charges'],
] as const satisfies ReadonlyArray<readonly [AppTab, string]>

export const SIDE_NAV_ITEMS = [
  ['budgeting', 'Budgeting'],
  ['learning', 'Learning'],
  ['gear', 'Gear flips'],
  ['settings', 'Settings'],
] as const satisfies ReadonlyArray<readonly [SideNavId, string]>

const BUDGETING_TAB_IDS: ReadonlySet<string> = new Set(
  BUDGETING_TABS.map(([id]) => id),
)

const GEAR_SUBS = ['month', 'cash', 'history', 'keep'] as const

export type GearSubTab = (typeof GEAR_SUBS)[number]

function isAppTab(value: string): value is AppTab {
  return (TABS as readonly string[]).includes(value)
}

function isGearSubTab(value: string): value is GearSubTab {
  return (GEAR_SUBS as readonly string[]).includes(value)
}

export function sideNavForTab(tab: AppTab): SideNavId {
  if (tab === 'learning') return 'learning'
  if (tab === 'gear') return 'gear'
  if (tab === 'settings') return 'settings'
  return 'budgeting'
}

export function isBudgetingTab(tab: AppTab): boolean {
  return BUDGETING_TAB_IDS.has(tab)
}

export function defaultTabForSide(side: SideNavId): AppTab {
  switch (side) {
    case 'learning':
      return 'learning'
    case 'gear':
      return 'gear'
    case 'settings':
      return 'settings'
    default:
      return 'overview'
  }
}

function currentPath(): string {
  return (
    window.location.pathname + window.location.search + window.location.hash
  )
}

function replaceSearch(mutate: (params: URLSearchParams) => void): void {
  const url = new URL(window.location.href)
  mutate(url.searchParams)
  const next = url.pathname + url.search + url.hash
  if (next !== currentPath()) {
    window.history.replaceState(null, '', next)
  }
}

/** Active main app tab from `?tab=`. Defaults to overview. */
export function readAppTab(): AppTab {
  try {
    const tab = new URLSearchParams(window.location.search).get('tab')
    if (tab && isAppTab(tab)) return tab
  } catch {
    /* ignore */
  }
  return 'overview'
}

export function writeAppTab(tab: AppTab): void {
  replaceSearch((params) => {
    if (tab === 'overview') params.delete('tab')
    else params.set('tab', tab)
  })
}

/** Gear Flips sub-tab from `?gear=`. Defaults to month. */
export function readGearSubTab(): GearSubTab {
  try {
    const gear = new URLSearchParams(window.location.search).get('gear')
    if (gear && isGearSubTab(gear)) return gear
  } catch {
    /* ignore */
  }
  return 'month'
}

export function writeGearSubTab(sub: GearSubTab): void {
  replaceSearch((params) => {
    if (sub === 'month') params.delete('gear')
    else params.set('gear', sub)
  })
}
