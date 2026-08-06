import { useEffect, useRef, useState } from 'react'
import { getAllCategories } from '../lib/customCategories'
import { CategoryLineIcon } from '../lib/categoryIcons'
import type { CategoryId } from '../types'

interface CategoryPickerProps {
  value: CategoryId | ''
  onChange: (next: CategoryId | '') => void
  /** Allow clearing selection (bulk “Choose…”). */
  allowEmpty?: boolean
  emptyLabel?: string
  /** Tighter chips for table cells. */
  compact?: boolean
  id?: string
  'aria-label'?: string
}

function ChevronLeftIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M8.75 3.5 5.25 7l3.5 3.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ChevronRightIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path
        d="M5.25 3.5 8.75 7l-3.5 3.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function CategoryPicker({
  value,
  onChange,
  allowEmpty = false,
  emptyLabel = 'Choose…',
  compact = false,
  id,
  'aria-label': ariaLabel = 'Category',
}: CategoryPickerProps) {
  const categories = getAllCategories()
  const scrollerRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const updateScrollEdges = () => {
    const root = scrollerRef.current
    if (!root) return
    const maxScroll = root.scrollWidth - root.clientWidth
    setCanScrollLeft(root.scrollLeft > 2)
    setCanScrollRight(maxScroll - root.scrollLeft > 2)
  }

  useEffect(() => {
    const root = scrollerRef.current
    if (!root) return

    updateScrollEdges()
    root.addEventListener('scroll', updateScrollEdges, { passive: true })

    const resizeObserver = new ResizeObserver(updateScrollEdges)
    resizeObserver.observe(root)

    return () => {
      root.removeEventListener('scroll', updateScrollEdges)
      resizeObserver.disconnect()
    }
  }, [categories.length, allowEmpty, compact])

  useEffect(() => {
    const root = scrollerRef.current
    if (!root || !value) return
    const selected = root.querySelector<HTMLElement>(
      `[data-category-id="${CSS.escape(String(value))}"]`,
    )
    selected?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
      inline: 'center',
    })
    // Recheck edges after the scroll settles.
    const timer = window.setTimeout(updateScrollEdges, 280)
    return () => window.clearTimeout(timer)
  }, [value])

  const scrollByPage = (direction: -1 | 1) => {
    const root = scrollerRef.current
    if (!root) return
    const amount = Math.max(root.clientWidth * 0.7, 120)
    root.scrollBy({ left: direction * amount, behavior: 'smooth' })
  }

  return (
    <div
      className={`category-picker${compact ? ' is-compact' : ''}`}
      id={id}
    >
      <div className="category-picker-row">
        <button
          type="button"
          className="category-picker-arrow"
          aria-label="Scroll categories left"
          disabled={!canScrollLeft}
          onClick={() => scrollByPage(-1)}
        >
          <ChevronLeftIcon />
        </button>
        <div
          ref={scrollerRef}
          className="category-picker-track"
          role="listbox"
          aria-label={ariaLabel}
          aria-orientation="horizontal"
        >
          {allowEmpty ? (
            <button
              type="button"
              role="option"
              aria-selected={value === ''}
              className={`category-chip${value === '' ? ' is-selected' : ''}`}
              onClick={() => onChange('')}
            >
              <span className="category-chip-label">{emptyLabel}</span>
            </button>
          ) : null}
          {categories.map((c) => {
            const selected = value === c.id
            return (
              <button
                key={c.id}
                type="button"
                role="option"
                aria-selected={selected}
                data-category-id={c.id}
                className={`category-chip${selected ? ' is-selected' : ''}`}
                title={c.label}
                onClick={() => onChange(c.id)}
              >
                <CategoryLineIcon categoryId={c.id} size={compact ? 13 : 14} />
                <span className="category-chip-label">{c.label}</span>
              </button>
            )
          })}
        </div>
        <button
          type="button"
          className="category-picker-arrow"
          aria-label="Scroll categories right"
          disabled={!canScrollRight}
          onClick={() => scrollByPage(1)}
        >
          <ChevronRightIcon />
        </button>
      </div>
    </div>
  )
}
