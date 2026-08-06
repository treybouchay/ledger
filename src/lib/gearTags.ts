import type { GearItemTags, GearKind, GearLevel } from '../types'

export const GEAR_KINDS: ReadonlyArray<{ id: GearKind; label: string }> = [
  { id: 'pads', label: 'Pads' },
  { id: 'blocker', label: 'Blocker' },
  { id: 'catcher', label: 'Catcher' },
  { id: 'chestie', label: 'Chestie' },
  { id: 'pants', label: 'Pants' },
  { id: 'set_gloves', label: 'Glove set' },
  { id: 'set_full', label: 'Full set' },
  { id: 'other', label: 'Other' },
]

export const GEAR_LEVELS: ReadonlyArray<{ id: GearLevel; label: string; short: string }> =
  [
    { id: 'intermediate', label: 'Intermediate', short: 'Int' },
    { id: 'senior', label: 'Senior', short: 'Sr' },
  ]

export const GEAR_BRANDS = [
  'Bauer',
  'CCM',
  'Warrior',
  "Brian's",
  'True',
  'Vaughn',
  'Lefevre',
  'Sherwood',
  'RBK',
  'STEP',
] as const

export const GEAR_COLOURS = [
  'White',
  'Black',
  'Navy',
  'Blue',
  'Red',
  'Maroon',
  'Green',
  'Grey',
  'White / Black',
] as const

const PAD_SIZES_INT = [
  '30+1',
  '31+1',
  '32+1',
  '32+2',
  '33+1',
  '33+2',
  '34+1',
] as const

const PAD_SIZES_SR = [
  '33+1',
  '33+2',
  '34+1',
  '34+2',
  '35+1',
  '35+2',
  '36+1',
  '36+2',
] as const

const LETTER_SIZES = ['XS', 'S', 'M', 'L', 'XL', 'XXL'] as const

export function emptyGearTags(): GearItemTags {
  return {
    kind: null,
    level: null,
    size: null,
    gloveSize: null,
    colour: null,
    brand: null,
    detail: null,
  }
}

export function hasGearTags(tags?: GearItemTags | null): boolean {
  if (!tags) return false
  return Boolean(
    tags.kind ||
      tags.level ||
      tags.size ||
      tags.gloveSize ||
      tags.colour ||
      tags.brand ||
      (tags.detail && tags.detail.trim()),
  )
}

export function isPadSizedKind(kind?: GearKind | null): boolean {
  return kind === 'pads' || kind === 'set_full'
}

export function isLetterSizedKind(kind?: GearKind | null): boolean {
  return (
    kind === 'blocker' ||
    kind === 'catcher' ||
    kind === 'chestie' ||
    kind === 'pants' ||
    kind === 'set_gloves'
  )
}

export function sizesForKind(
  kind?: GearKind | null,
  level?: GearLevel | null,
): readonly string[] {
  if (!kind || kind === 'other') return []
  if (isPadSizedKind(kind)) {
    return level === 'senior' ? PAD_SIZES_SR : PAD_SIZES_INT
  }
  if (isLetterSizedKind(kind)) return LETTER_SIZES
  return []
}

/** Blocker/catcher sizes — used alone or as the glove half of a full set. */
export function gloveSizes(): readonly string[] {
  return LETTER_SIZES
}

export function kindLabel(kind?: GearKind | null): string {
  return GEAR_KINDS.find((k) => k.id === kind)?.label ?? ''
}

export function levelShort(level?: GearLevel | null): string {
  return GEAR_LEVELS.find((l) => l.id === level)?.short ?? ''
}

function formatSizePart(tags: GearItemTags): string {
  if (tags.kind === 'set_full') {
    const pad = tags.size?.trim() || ''
    const glove = tags.gloveSize?.trim() || ''
    if (pad && glove) return `${pad} / ${glove}`
    return pad || glove
  }
  return tags.size?.trim() || ''
}

/** Canonical display / link name from structured tags. */
export function formatGearItemLabel(tags?: GearItemTags | null): string {
  if (!tags) return ''
  const parts: string[] = []
  if (tags.brand?.trim()) parts.push(tags.brand.trim())
  if (tags.kind && tags.kind !== 'other') parts.push(kindLabel(tags.kind))
  if (tags.level) parts.push(levelShort(tags.level))
  const sizePart = formatSizePart(tags)
  if (sizePart) parts.push(sizePart)
  if (tags.colour?.trim()) parts.push(tags.colour.trim())
  if (tags.detail?.trim()) parts.push(tags.detail.trim())
  else if (tags.kind === 'other' && !parts.length) return ''
  return parts.join(' ').replace(/\s+/g, ' ').trim()
}

export function gearTagsEqual(
  a?: GearItemTags | null,
  b?: GearItemTags | null,
): boolean {
  if (!a && !b) return true
  if (!a || !b) return false
  return (
    (a.kind ?? null) === (b.kind ?? null) &&
    (a.level ?? null) === (b.level ?? null) &&
    (a.size ?? null) === (b.size ?? null) &&
    (a.gloveSize ?? null) === (b.gloveSize ?? null) &&
    (a.colour ?? null) === (b.colour ?? null) &&
    (a.brand ?? null) === (b.brand ?? null) &&
    (a.detail ?? '').trim().toLowerCase() ===
      (b.detail ?? '').trim().toLowerCase()
  )
}

/** Compact chips for list rows. */
export function gearTagChips(tags?: GearItemTags | null): string[] {
  if (!tags) return []
  const chips: string[] = []
  if (tags.kind && tags.kind !== 'other') chips.push(kindLabel(tags.kind))
  if (tags.level) chips.push(levelShort(tags.level))
  const sizePart = formatSizePart(tags)
  if (sizePart) chips.push(sizePart)
  if (tags.colour) chips.push(tags.colour)
  if (tags.brand) chips.push(tags.brand)
  return chips
}
