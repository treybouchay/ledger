import type { ReactNode } from 'react'
import {
  GEAR_BRANDS,
  GEAR_COLOURS,
  GEAR_KINDS,
  GEAR_LEVELS,
  emptyGearTags,
  formatGearItemLabel,
  gearTagChips,
  gloveSizes,
  isCustomSizedKind,
  kindNeedsSize,
  sizesForKind,
} from '../lib/gearTags'
import type { GearItemTags, GearKind, GearLevel } from '../types'

function GearTagStep({
  show,
  children,
}: {
  show: boolean
  children: ReactNode
}) {
  if (!show) return null
  return <div className="gear-tag-step">{children}</div>
}

export function GearItemTagsFields({
  value,
  onChange,
  required = true,
  progressive = false,
}: {
  value: GearItemTags
  onChange: (next: GearItemTags) => void
  required?: boolean
  /** Reveal fields step-by-step as earlier choices are made. */
  progressive?: boolean
}) {
  const tags = value ?? emptyGearTags()
  const sizes = sizesForKind(tags.kind, tags.level)
  const gloveSizeOptions = gloveSizes()
  const needsLevel = Boolean(tags.kind && tags.kind !== 'other')
  const needsSize = kindNeedsSize(tags.kind)
  const needsGloveSize = tags.kind === 'set_full'
  const customOnlySize = isCustomSizedKind(tags.kind)
  const hasBrand = Boolean(tags.brand?.trim())

  // Progressive: Brand → Model → Type → Level → Size → Colour
  const showModel = !progressive || hasBrand
  const showType = !progressive || hasBrand
  const showLevel = !progressive || Boolean(tags.kind && needsLevel)
  const showSize =
    !progressive || (Boolean(tags.level) && (needsSize || needsGloveSize))
  const showColour =
    !progressive ||
    (tags.kind === 'other'
      ? Boolean(tags.kind)
      : Boolean(tags.level))

  const preview = formatGearItemLabel(tags)
  const customColour =
    tags.colour &&
    !(GEAR_COLOURS as readonly string[]).includes(tags.colour)
      ? tags.colour
      : ''
  const customBrand =
    tags.brand && !(GEAR_BRANDS as readonly string[]).includes(tags.brand)
      ? tags.brand
      : ''
  const customSize =
    !customOnlySize &&
    tags.size &&
    needsSize &&
    sizes.length > 0 &&
    !sizes.includes(tags.size)
      ? tags.size
      : ''
  const customGloveSize =
    tags.gloveSize &&
    needsGloveSize &&
    !gloveSizeOptions.includes(tags.gloveSize)
      ? tags.gloveSize
      : ''
  const sizeInputValue = customOnlySize ? (tags.size ?? '') : customSize

  function patch(partial: Partial<GearItemTags>) {
    const next = { ...tags, ...partial }
    if (partial.kind !== undefined || partial.level !== undefined) {
      const nextSizes = sizesForKind(next.kind, next.level)
      if (next.size) {
        if (!kindNeedsSize(next.kind)) {
          next.size = null
        } else if (
          nextSizes.length > 0 &&
          !nextSizes.includes(next.size) &&
          !isCustomSizedKind(next.kind)
        ) {
          next.size = null
        }
      }
      if (next.kind !== 'set_full') {
        next.gloveSize = null
      }
      if (next.kind === 'other') {
        next.level = null
        next.size = null
        next.gloveSize = null
      }
    }
    onChange(next)
  }

  function toggleChip<T extends string>(
    field: keyof GearItemTags,
    id: T,
    current: T | null | undefined,
  ) {
    patch({ [field]: current === id ? null : id } as Partial<GearItemTags>)
  }

  const sizeLabel =
    tags.kind === 'set_full'
      ? tags.level === 'senior'
        ? 'Pad size (senior)'
        : 'Pad size (intermediate)'
      : tags.kind === 'pads'
        ? tags.level === 'senior'
          ? 'Size (senior pads)'
          : 'Size (intermediate pads)'
        : tags.kind === 'set_gloves'
          ? 'Glove size'
          : 'Size'

  return (
    <div className={`gear-tags${progressive ? ' is-progressive' : ''}`}>
      <div className="gear-tag-group">
        <span className="gear-tag-label">Brand</span>
        <div className="gear-tag-chips" role="group" aria-label="Brand">
          {GEAR_BRANDS.map((b) => (
            <button
              key={b}
              type="button"
              className={`gear-tag-chip${tags.brand === b ? ' active' : ''}`}
              aria-pressed={tags.brand === b}
              onClick={() => toggleChip('brand', b, tags.brand)}
            >
              {b}
            </button>
          ))}
        </div>
        <input
          className="gear-tag-custom"
          value={customBrand}
          onChange={(e) =>
            patch({ brand: e.target.value.trim() ? e.target.value : null })
          }
          placeholder="Other brand"
        />
        {progressive && !hasBrand ? (
          <p className="hint gear-tag-step-hint">Pick a brand to continue</p>
        ) : null}
      </div>

      <GearTagStep show={showModel}>
        <label className="gear-tag-detail">
          Model / detail
          <input
            value={tags.detail ?? ''}
            onChange={(e) => patch({ detail: e.target.value || null })}
            placeholder="e.g. Hyperlite 2, eflex 6.9, FULL RIGHT"
            autoComplete="off"
          />
        </label>
      </GearTagStep>

      <GearTagStep show={showType}>
        <div className="gear-tag-group">
          <span className="gear-tag-label">Type{required ? ' *' : ''}</span>
          <div className="gear-tag-chips" role="group" aria-label="Gear type">
            {GEAR_KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                className={`gear-tag-chip${tags.kind === k.id ? ' active' : ''}`}
                aria-pressed={tags.kind === k.id}
                title={
                  k.id === 'set_gloves'
                    ? 'Blocker + catcher'
                    : k.id === 'set_full'
                      ? 'Pads + blocker + catcher'
                      : undefined
                }
                onClick={() => toggleChip('kind', k.id as GearKind, tags.kind)}
              >
                {k.label}
              </button>
            ))}
          </div>
          {tags.kind === 'set_gloves' || tags.kind === 'set_full' ? (
            <p className="hint gear-tag-set-hint">
              {tags.kind === 'set_gloves'
                ? 'Blocker + catcher as one listing'
                : 'Pads + blocker + catcher as one listing'}
            </p>
          ) : null}
          {progressive && hasBrand && !tags.kind ? (
            <p className="hint gear-tag-step-hint">Pick a type to continue</p>
          ) : null}
        </div>
      </GearTagStep>

      <GearTagStep show={showLevel && needsLevel}>
        <div className="gear-tag-group">
          <span className="gear-tag-label">Level{required ? ' *' : ''}</span>
          <div className="gear-tag-chips" role="group" aria-label="Level">
            {GEAR_LEVELS.map((l) => (
              <button
                key={l.id}
                type="button"
                className={`gear-tag-chip${tags.level === l.id ? ' active' : ''}`}
                aria-pressed={tags.level === l.id}
                onClick={() =>
                  toggleChip('level', l.id as GearLevel, tags.level)
                }
              >
                {l.label}
              </button>
            ))}
          </div>
          {progressive && tags.kind && !tags.level ? (
            <p className="hint gear-tag-step-hint">
              Senior or intermediate?
            </p>
          ) : null}
        </div>
      </GearTagStep>

      <GearTagStep show={showSize && needsSize}>
        <div className="gear-tag-group">
          <span className="gear-tag-label">{sizeLabel}</span>
          {!customOnlySize && sizes.length > 0 ? (
            <div className="gear-tag-chips" role="group" aria-label={sizeLabel}>
              {sizes.map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`gear-tag-chip${tags.size === s ? ' active' : ''}`}
                  aria-pressed={tags.size === s}
                  onClick={() => toggleChip('size', s, tags.size)}
                >
                  {s}
                </button>
              ))}
            </div>
          ) : null}
          <input
            className="gear-tag-custom"
            value={sizeInputValue}
            onChange={(e) =>
              patch({ size: e.target.value.trim() ? e.target.value : null })
            }
            placeholder={customOnlySize ? 'Size (optional)' : 'Custom size'}
          />
        </div>
      </GearTagStep>

      <GearTagStep show={showSize && needsGloveSize}>
        <div className="gear-tag-group">
          <span className="gear-tag-label">Glove size (blocker / catcher)</span>
          <div
            className="gear-tag-chips"
            role="group"
            aria-label="Glove size"
          >
            {gloveSizeOptions.map((s) => (
              <button
                key={s}
                type="button"
                className={`gear-tag-chip${
                  tags.gloveSize === s ? ' active' : ''
                }`}
                aria-pressed={tags.gloveSize === s}
                onClick={() => toggleChip('gloveSize', s, tags.gloveSize)}
              >
                {s}
              </button>
            ))}
          </div>
          <input
            className="gear-tag-custom"
            value={customGloveSize}
            onChange={(e) =>
              patch({
                gloveSize: e.target.value.trim() ? e.target.value : null,
              })
            }
            placeholder="Custom glove size"
          />
        </div>
      </GearTagStep>

      <GearTagStep show={showColour}>
        <div className="gear-tag-group">
          <span className="gear-tag-label">Colour</span>
          <div className="gear-tag-chips" role="group" aria-label="Colour">
            {GEAR_COLOURS.map((c) => (
              <button
                key={c}
                type="button"
                className={`gear-tag-chip${tags.colour === c ? ' active' : ''}`}
                aria-pressed={tags.colour === c}
                onClick={() => toggleChip('colour', c, tags.colour)}
              >
                {c}
              </button>
            ))}
          </div>
          <input
            className="gear-tag-custom"
            value={customColour}
            onChange={(e) =>
              patch({ colour: e.target.value.trim() ? e.target.value : null })
            }
            placeholder="Or type a colour"
          />
        </div>
      </GearTagStep>

      {preview ? (
        <p className="gear-tag-preview">
          Label: <strong>{preview}</strong>
        </p>
      ) : (
        <p className="hint gear-tag-preview">
          {progressive && !hasBrand
            ? 'Pick a brand to build a standard label'
            : `Pick type${needsLevel ? ' and level' : ''} to build a standard label`}
        </p>
      )}
    </div>
  )
}

export function GearTagPills({ tags }: { tags?: GearItemTags | null }) {
  const chips = gearTagChips(tags)
  if (!chips.length) return null
  return (
    <div className="gear-tag-pills">
      {chips.map((c) => (
        <span key={c} className="gear-tag-pill">
          {c}
        </span>
      ))}
    </div>
  )
}
