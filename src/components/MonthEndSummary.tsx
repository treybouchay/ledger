import {
  formatMoney,
  isVariableBudgetOver,
  type MonthEndSaveLine,
} from '../lib/compute'
import type { PersonId } from '../types'
import { OnTrackBars } from './OnTrackBars'

type PersonFilter = 'all' | PersonId

export const MONTH_END_SUMMARY_ID = 'month-end-summary'

function moneyRound(n: number): number {
  return Math.round(n * 100) / 100
}

function allocPercents(income: number, fixed: number, variable: number) {
  const leftover = moneyRound(income - fixed - variable)
  const base = Math.max(income, fixed + variable, 1)
  // Snap to hundredths so adjacent segments meet on whole CSS % stops (crisper joins).
  const fixedPct = Math.min(100, Math.round((fixed / base) * 10000) / 100)
  const variablePct = Math.min(
    100 - fixedPct,
    Math.round((variable / base) * 10000) / 100,
  )
  const leftoverPct = Math.max(
    0,
    Math.round((100 - fixedPct - variablePct) * 100) / 100,
  )
  return { leftover, fixedPct, variablePct, leftoverPct }
}

function savingsExplain(
  trevor: MonthEndSaveLine,
  kate: MonthEndSaveLine,
  both: MonthEndSaveLine,
): string {
  const trevorSave = trevor.onTrackToSave
  const kateSave = kate.onTrackToSave
  const bothSave = both.onTrackToSave

  if (trevorSave >= 0 && kateSave >= 0) {
    return `Both of you are on track on this metric. Household “on track to save” is ${formatMoney(bothSave)} — simply ${kate.label} + ${trevor.label}.`
  }

  if (trevorSave < 0 && kateSave < 0) {
    return `Both of you are short this month. Household “on track to save” is ${formatMoney(bothSave)} (${kate.label} + ${trevor.label}).`
  }

  const saver = kateSave >= 0 ? kate.label : trevor.label
  const overspender = kateSave < 0 ? kate.label : trevor.label
  const surplus = Math.max(trevorSave, kateSave)
  const deficit = Math.min(trevorSave, kateSave)

  if (bothSave >= 0) {
    return `${saver}’s surplus of ${formatMoney(surplus)} covers ${overspender}’s shortfall of ${formatMoney(deficit)}. Together you’re still on track to save ${formatMoney(bothSave)}.`
  }

  return `${saver} can look “on track” (${formatMoney(surplus)}), but that surplus doesn’t cover ${overspender}’s shortfall (${formatMoney(deficit)}). Both adds the two together → ${formatMoney(bothSave)}.`
}

/** Compact reconciliation line for the “What’s left to spend” card. */
export function monthEndReconcileHint(
  trevor: MonthEndSaveLine,
  kate: MonthEndSaveLine,
  both: MonthEndSaveLine,
): string {
  const trackWord = (v: number) => (v >= 0 ? 'on track' : 'short')
  const kateSave = kate.onTrackToSave
  const trevorSave = trevor.onTrackToSave
  const bothSave = both.onTrackToSave

  if (bothSave < 0 && (kateSave >= 0) !== (trevorSave >= 0)) {
    const saver = kateSave >= 0 ? kate : trevor
    const other = saver.id === 'kate' ? trevor : kate
    return `${saver.label} looks on track, but Both is ${formatMoney(bothSave)} — ${other.label}’s shortfall is larger`
  }

  if (bothSave >= 0 && (kateSave < 0 || trevorSave < 0)) {
    const short = kateSave < 0 ? kate : trevor
    return `${short.label} is short, but Both is still on track (${formatMoney(bothSave)})`
  }

  return `${kate.label} ${trackWord(kateSave)} · ${trevor.label} ${trackWord(trevorSave)} · Both ${formatMoney(bothSave)}`
}

function CompositionBar({
  label,
  income,
  fixed,
  variable,
  variableBudget,
  emphasize,
  muted,
}: {
  label: string
  income: number
  fixed: number
  variable: number
  variableBudget: number
  emphasize?: boolean
  muted?: boolean
}) {
  const { leftover, fixedPct, variablePct, leftoverPct } = allocPercents(
    income,
    fixed,
    variable,
  )
  const variableOver = isVariableBudgetOver(variable, variableBudget)
  const fixedEnd = fixedPct
  const variableEnd = fixedPct + variablePct
  const varStop = variableOver
    ? 'color-mix(in srgb, var(--bad) 85%, #7a2e24)'
    : '#6f9a82'
  const gradientStops: string[] = []
  if (fixedPct > 0) {
    gradientStops.push(`var(--accent) 0% ${fixedEnd}%`)
  }
  if (variablePct > 0) {
    gradientStops.push(`${varStop} ${fixedEnd}% ${variableEnd}%`)
  }
  if (leftoverPct > 0) {
    gradientStops.push(`#d2a66a ${variableEnd}% 100%`)
  }

  return (
    <div
      className={`month-end-comp${emphasize ? ' emphasize' : ''}${muted ? ' muted' : ''}`}
    >
      <div className="month-end-comp-head">
        <span>{label}</span>
        <strong className={leftover >= 0 ? 'good' : 'bad'}>
          {formatMoney(leftover)}
        </strong>
      </div>
      <div
        className="budget-alloc-bar month-end-comp-bar"
        role="img"
        aria-label={`${label}: fixed ${formatMoney(fixed)}, variable ${formatMoney(variable)}${variableOver ? ' (over budget)' : ''}, leftover ${formatMoney(leftover)}`}
        style={
          gradientStops.length > 0
            ? {
                backgroundImage: `linear-gradient(to right, ${gradientStops.join(', ')})`,
              }
            : undefined
        }
      />
      <ul className="month-end-comp-legend">
        <li>
          <span className="swatch fixed" aria-hidden />
          Fixed {formatMoney(fixed)}
        </li>
        <li className={variableOver ? 'bad' : undefined}>
          <span
            className={`swatch variable${variableOver ? ' over' : ''}`}
            aria-hidden
          />
          Variable {formatMoney(variable)}
          {variableOver ? ' (over)' : ''}
        </li>
        <li>
          <span className="swatch free" aria-hidden />
          Save {formatMoney(leftover)}
        </li>
      </ul>
    </div>
  )
}

export function MonthEndSummary({
  lines,
  personFilter,
  personLeftoverVariable,
  personOnTrack,
  personLabel,
  chartReady = true,
}: {
  lines: MonthEndSaveLine[]
  personFilter: PersonFilter
  /** Person view “What’s left to spend” (variable budget leftover); null when viewing Both. */
  personLeftoverVariable: number | null
  personOnTrack: number | null
  personLabel: string | null
  /** False while boot splash is up — charts wait to animate. */
  chartReady?: boolean
}) {
  const trevor = lines.find((r) => r.id === 'trevor')
  const kate = lines.find((r) => r.id === 'kate')
  const both = lines.find((r) => r.id === 'both')
  if (!trevor || !kate || !both) return null

  return (
    <section
      id={MONTH_END_SUMMARY_ID}
      className="panel insight-section month-end-summary"
      aria-label="Month-end summary"
      tabIndex={-1}
    >
      <div className="panel-header">
        <div>
          <h2>Month-end summary</h2>
          <p>
            Why one person can look on track while Both looks underwater —
            same formula, summed across people
          </p>
        </div>
      </div>

      <div className="month-end-body">
        <div
          className={`month-end-callout${
            personFilter !== 'all' &&
            personOnTrack != null &&
            both.onTrackToSave < 0 &&
            personOnTrack >= 0
              ? ' warn'
              : ''
          }`}
          role="note"
        >
          <p className="month-end-callout-lead">
            “{savingsExplain(trevor, kate, both)}”
          </p>
          {personFilter !== 'all' &&
          personLabel &&
          personOnTrack != null &&
          personLeftoverVariable != null ? (
            <p className="month-end-callout-metric">
              Also: “What’s left to spend” for {personLabel} (
              {formatMoney(personLeftoverVariable)}) is leftover{' '}
              <em>variable budget</em> — not the same as on track to save (
              {formatMoney(personOnTrack)}).
            </p>
          ) : null}
        </div>

        <div className="month-end-chart-block">
          <h3 className="month-end-subhead">On track to save</h3>
          <OnTrackBars
            lines={lines}
            personFilter={personFilter}
            ready={chartReady}
          />
        </div>

        <div className="month-end-chart-block">
          <h3 className="month-end-subhead">How income was used</h3>
          <p className="month-end-hint">
            Planned fixed + variable spent + leftover (or overrun past income)
          </p>
          <div className="month-end-comps">
            {([trevor, kate, both] as const).map((row) => (
              <CompositionBar
                key={row.id}
                label={row.label}
                income={row.income}
                fixed={row.plannedFixed}
                variable={row.variableSpent}
                variableBudget={row.variableBudget}
                emphasize={
                  personFilter === 'all' ||
                  personFilter === row.id ||
                  row.id === 'both'
                }
                muted={
                  personFilter !== 'all' &&
                  row.id !== 'both' &&
                  row.id !== personFilter
                }
              />
            ))}
          </div>
        </div>

        <div className="month-end-table-wrap">
          <table className="month-end-table">
            <caption className="visually-hidden">
              Income, planned fixed, variable spent, and on track to save by
              person
            </caption>
            <thead>
              <tr>
                <th scope="col">Who</th>
                <th scope="col">Income</th>
                <th scope="col">Planned fixed</th>
                <th scope="col">Variable spent</th>
                <th scope="col">On track to save</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((row) => {
                const focused =
                  row.id === 'both'
                    ? personFilter === 'all'
                    : personFilter === 'all' || personFilter === row.id
                const muted =
                  personFilter !== 'all' &&
                  row.id !== 'both' &&
                  row.id !== personFilter
                const variableOver = isVariableBudgetOver(
                  row.variableSpent,
                  row.variableBudget,
                )
                return (
                  <tr
                    key={row.id}
                    className={`${row.id === 'both' ? 'is-both' : ''}${focused ? ' is-focus' : ''}${muted ? ' is-muted' : ''}`}
                  >
                    <th scope="row">{row.label}</th>
                    <td>{formatMoney(row.income)}</td>
                    <td>{formatMoney(row.plannedFixed)}</td>
                    <td className={variableOver ? 'bad' : undefined}>
                      {formatMoney(row.variableSpent)}
                    </td>
                    <td
                      className={
                        row.onTrackToSave >= 0 ? 'good' : 'bad'
                      }
                    >
                      {formatMoney(row.onTrackToSave)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <p className="month-end-footnote">
          <strong>Not the same as “What’s left to spend.”</strong> Person view
          leftover is unused <em>variable budget</em>; Both’s hero leftover is
          the pool left after fixed bills. “On track to save” always uses income
          − planned fixed − variable spent, and Both is the sum of each person.
        </p>
      </div>
    </section>
  )
}
