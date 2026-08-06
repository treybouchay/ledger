import { useMemo, useState, type FormEvent } from 'react'
import { PEOPLE } from '../data/seed'
import { CategoryLineIcon } from '../lib/categoryIcons'
import { formatMoney } from '../lib/compute'
import { confirmRemove } from '../lib/confirm'
import {
  accountOwnerLabel,
  createCustomAccount,
  getAllAccounts,
  getCustomAccounts,
  isBuiltInAccountId,
  replaceCustomAccounts,
} from '../lib/customAccounts'
import {
  getAllBudgets,
  getAllCategories,
  getPersonIncome,
  hasBudgetOverrides,
  hasIncomeOverrides,
  resetBudgetOverrides,
  resetIncomeOverrides,
  setPersonIncome,
  upsertBudget,
} from '../lib/customCategories'
import type { Account, AccountOwner, CategoryKind, PersonId } from '../types'

function moneyInputValue(n: number): string {
  if (!Number.isFinite(n)) return ''
  return String(n)
}

function parseMoneyInput(raw: string): number {
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.round(n * 100) / 100
}

export function BudgetPanel({
  onChange,
  onRemoveCustomAccount,
}: {
  onChange: () => void
  /** App remaps transactions/imports, then removes the custom account. */
  onRemoveCustomAccount: (accountId: string) => void
}) {
  const [personFocus, setPersonFocus] = useState<PersonId | 'both'>('both')
  const [draftTick, setDraftTick] = useState(0)
  const [showAddAccount, setShowAddAccount] = useState(false)
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null)

  const people = useMemo(
    () =>
      PEOPLE.map((p) => ({
        ...p,
        monthlyIncome: getPersonIncome(p.id),
      })),
    [draftTick],
  )

  const categories = useMemo(() => getAllCategories(), [draftTick])
  const budgets = useMemo(() => getAllBudgets(), [draftTick])
  // Read live from storage so parent-driven removes refresh without an extra tick.
  const customAccounts = getCustomAccounts()
  const allAccounts = getAllAccounts()

  const combinedIncome = people.reduce((sum, p) => sum + p.monthlyIncome, 0)

  const fixedTotal = useMemo(() => {
    return categories
      .filter((c) => c.kind === 'fixed')
      .reduce((sum, cat) => {
        const trevor =
          budgets.find(
            (b) => b.personId === 'trevor' && b.categoryId === cat.id,
          )?.amount ?? 0
        const kate =
          budgets.find(
            (b) => b.personId === 'kate' && b.categoryId === cat.id,
          )?.amount ?? 0
        return sum + trevor + kate
      }, 0)
  }, [categories, budgets])

  const variableTotal = useMemo(() => {
    return categories
      .filter((c) => c.kind === 'variable')
      .reduce((sum, cat) => {
        const trevor =
          budgets.find(
            (b) => b.personId === 'trevor' && b.categoryId === cat.id,
          )?.amount ?? 0
        const kate =
          budgets.find(
            (b) => b.personId === 'kate' && b.categoryId === cat.id,
          )?.amount ?? 0
        return sum + trevor + kate
      }, 0)
  }, [categories, budgets])

  const unallocated =
    Math.round((combinedIncome - fixedTotal - variableTotal) * 100) / 100

  const allocBase = Math.max(combinedIncome, fixedTotal + variableTotal, 1)
  const fixedPct = Math.min(100, (fixedTotal / allocBase) * 100)
  const variablePct = Math.min(100, (variableTotal / allocBase) * 100)
  const unallocPct = Math.max(0, 100 - fixedPct - variablePct)

  const personPlans = useMemo(() => {
    return people.map((person) => {
      const income = person.monthlyIncome
      const fixed = categories
        .filter((c) => c.kind === 'fixed')
        .reduce(
          (sum, cat) =>
            sum +
            (budgets.find(
              (b) => b.personId === person.id && b.categoryId === cat.id,
            )?.amount ?? 0),
          0,
        )
      const variable = categories
        .filter((c) => c.kind === 'variable')
        .reduce(
          (sum, cat) =>
            sum +
            (budgets.find(
              (b) => b.personId === person.id && b.categoryId === cat.id,
            )?.amount ?? 0),
          0,
        )
      const leftover = Math.round((income - fixed - variable) * 100) / 100
      const base = Math.max(income, fixed + variable, 1)
      const pFixed = Math.min(100, Math.round((fixed / base) * 10000) / 100)
      const pVariable = Math.min(
        100 - pFixed,
        Math.round((variable / base) * 10000) / 100,
      )
      const pLeftover = Math.max(
        0,
        Math.round((100 - pFixed - pVariable) * 100) / 100,
      )
      return {
        id: person.id,
        label: person.name,
        income,
        fixed,
        variable,
        leftover,
        fixedPct: pFixed,
        variablePct: pVariable,
        leftoverPct: pLeftover,
      }
    })
  }, [people, categories, budgets])

  function budgetAmount(personId: PersonId, categoryId: string): number {
    return (
      budgets.find(
        (b) => b.personId === personId && b.categoryId === categoryId,
      )?.amount ?? 0
    )
  }

  function bump() {
    setDraftTick((n) => n + 1)
    onChange()
  }

  function updateIncome(personId: PersonId, raw: string) {
    setPersonIncome(personId, parseMoneyInput(raw))
    bump()
  }

  function updateBudget(
    personId: PersonId,
    categoryId: string,
    raw: string,
  ) {
    upsertBudget(personId, categoryId, parseMoneyInput(raw))
    bump()
  }

  function resetAll() {
    const ok = confirmRemove(
      'Reset salaries and all budget amounts to the sheet defaults?',
    )
    if (!ok) return
    resetIncomeOverrides()
    resetBudgetOverrides()
    bump()
  }

  function commitAccounts(next: Account[]) {
    replaceCustomAccounts(next)
    bump()
  }

  function addAccount(input: {
    label: string
    owner: AccountOwner
    icon: string
  }) {
    const created = createCustomAccount(input)
    commitAccounts([...getCustomAccounts(), created])
    setShowAddAccount(false)
  }

  function updateAccount(
    accountId: string,
    patch: { label: string; owner: AccountOwner; icon: string },
  ) {
    if (isBuiltInAccountId(accountId)) return
    const next = getCustomAccounts().map((a) =>
      a.id === accountId
        ? {
            ...a,
            label: patch.label.trim(),
            owner: patch.owner,
            icon: patch.icon.trim() || '💳',
          }
        : a,
    )
    commitAccounts(next)
    setEditingAccountId(null)
  }

  const dirty = hasIncomeOverrides() || hasBudgetOverrides()

  return (
    <div className="layout">
      <div className="panel-header bare">
        <div>
          <h2>Income &amp; bills</h2>
          <p>
            Set monthly salaries, category budgets, and accounts — used for
            leftover on Month overview and statement posting
          </p>
        </div>
        <div className="panel-filters">
          <label>
            Show{' '}
            <select
              value={personFocus}
              onChange={(e) =>
                setPersonFocus(e.target.value as PersonId | 'both')
              }
            >
              <option value="both">Both people</option>
              <option value="trevor">Trevor</option>
              <option value="kate">Kate</option>
            </select>
          </label>
          {dirty ? (
            <button type="button" className="ghost" onClick={resetAll}>
              Reset to sheet defaults
            </button>
          ) : null}
        </div>
      </div>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Monthly salary</h2>
            <p>Take-home income that feeds leftover math</p>
          </div>
          <div className="section-leftover">{formatMoney(combinedIncome)}</div>
        </div>
        <div className="budget-income-grid">
          {people.map((person) => (
            <label key={person.id} className="budget-income-field">
              <span>{person.name}</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={moneyInputValue(person.monthlyIncome)}
                onChange={(e) => updateIncome(person.id, e.target.value)}
                placeholder={String(
                  PEOPLE.find((p) => p.id === person.id)?.monthlyIncome ?? 0,
                )}
              />
            </label>
          ))}
          <div className="budget-income-total">
            <span>Household total</span>
            <strong>{formatMoney(combinedIncome)}</strong>
          </div>
        </div>
        <div className="budget-alloc">
          <p className="budget-alloc-lead">
            How income is planned across fixed bills and variable caps
          </p>
          <div
            className="budget-alloc-bar"
            role="img"
            aria-label={`Fixed ${formatMoney(fixedTotal)}, variable ${formatMoney(variableTotal)}, leftover ${formatMoney(unallocated)}`}
          >
            {fixedPct > 0 ? (
              <span
                className="seg fixed"
                style={{ width: `${fixedPct}%` }}
                title="Fixed bills"
              />
            ) : null}
            {variablePct > 0 ? (
              <span
                className="seg variable"
                style={{ width: `${variablePct}%` }}
                title="Variable budgets"
              />
            ) : null}
            {unallocPct > 0 ? (
              <span
                className="seg free"
                style={{ width: `${unallocPct}%` }}
                title="Leftover — income not yet assigned to bills or budgets"
              />
            ) : null}
          </div>
          <ul className="budget-alloc-legend">
            <li>
              <span className="swatch fixed" aria-hidden />
              Fixed bills <strong>{formatMoney(fixedTotal)}</strong>
              <span className="budget-alloc-pct">
                {Math.round(fixedPct)}%
              </span>
            </li>
            <li>
              <span className="swatch variable" aria-hidden />
              Variable caps <strong>{formatMoney(variableTotal)}</strong>
              <span className="budget-alloc-pct">
                {Math.round(variablePct)}%
              </span>
            </li>
            <li>
              <span className="swatch free" aria-hidden />
              Leftover{' '}
              <strong className={unallocated < 0 ? 'bad' : undefined}>
                {formatMoney(unallocated)}
              </strong>
              <span className="budget-alloc-pct">
                {Math.round(unallocPct)}%
              </span>
            </li>
          </ul>

          <div className="budget-person-plans">
            <p className="budget-alloc-lead">Breakdown by person</p>
            <div className="budget-person-plan-grid">
              {personPlans.map((plan) => {
                const fixedEnd = plan.fixedPct
                const variableEnd = plan.fixedPct + plan.variablePct
                const stops: string[] = []
                if (plan.fixedPct > 0) {
                  stops.push(`var(--accent) 0% ${fixedEnd}%`)
                }
                if (plan.variablePct > 0) {
                  stops.push(`#6f9a82 ${fixedEnd}% ${variableEnd}%`)
                }
                if (plan.leftoverPct > 0) {
                  stops.push(`#d2a66a ${variableEnd}% 100%`)
                }
                const focused =
                  personFocus === 'both' || personFocus === plan.id
                return (
                  <div
                    key={plan.id}
                    className={`budget-person-plan${focused ? ' emphasize' : ' muted'}`}
                  >
                    <div className="budget-person-plan-head">
                      <span>{plan.label}</span>
                      <strong className={plan.leftover >= 0 ? 'good' : 'bad'}>
                        {formatMoney(plan.leftover)} left
                      </strong>
                    </div>
                    <p className="budget-person-plan-income">
                      of {formatMoney(plan.income)} income
                    </p>
                    <div
                      className="budget-alloc-bar budget-person-plan-bar"
                      role="img"
                      aria-label={`${plan.label}: fixed ${formatMoney(plan.fixed)} (${Math.round(plan.fixedPct)}%), variable ${formatMoney(plan.variable)} (${Math.round(plan.variablePct)}%), leftover ${formatMoney(plan.leftover)} (${Math.round(plan.leftoverPct)}%)`}
                      style={
                        stops.length > 0
                          ? {
                              backgroundImage: `linear-gradient(to right, ${stops.join(', ')})`,
                            }
                          : undefined
                      }
                    />
                    <ul className="budget-person-plan-legend">
                      <li>
                        <span className="swatch fixed" aria-hidden />
                        Bills{' '}
                        <strong>{Math.round(plan.fixedPct)}%</strong>
                        <span>{formatMoney(plan.fixed)}</span>
                      </li>
                      <li>
                        <span className="swatch variable" aria-hidden />
                        Variable caps{' '}
                        <strong>{Math.round(plan.variablePct)}%</strong>
                        <span>{formatMoney(plan.variable)}</span>
                      </li>
                      <li>
                        <span className="swatch free" aria-hidden />
                        Leftover{' '}
                        <strong className={plan.leftover < 0 ? 'bad' : undefined}>
                          {Math.round(plan.leftoverPct)}%
                        </strong>
                        <span className={plan.leftover < 0 ? 'bad' : undefined}>
                          {formatMoney(plan.leftover)}
                        </span>
                      </li>
                    </ul>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <div>
            <h2>Accounts</h2>
            <p>
              Built-ins are person-owned (Trevor’s cards + Kate Debit). Add more
              Trevor-, Kate-, or shared accounts so pickers stay person-specific.
            </p>
          </div>
          <div className="panel-filters">
            <button
              type="button"
              className="primary"
              onClick={() => {
                setShowAddAccount((open) => !open)
                setEditingAccountId(null)
              }}
            >
              {showAddAccount ? 'Cancel' : 'Add account'}
            </button>
          </div>
        </div>

        {showAddAccount ? (
          <div className="mint-form">
            <AccountEditorForm
              defaultOwner={
                personFocus === 'both' ? 'trevor' : personFocus
              }
              onSubmit={addAccount}
              onCancel={() => setShowAddAccount(false)}
            />
          </div>
        ) : null}

        <ul className="custom-category-list account-list">
          {allAccounts.map((account) => {
            const custom = !isBuiltInAccountId(account.id)
            const editing = editingAccountId === account.id
            return (
              <li key={account.id} className="custom-category-item">
                {editing && custom ? (
                  <AccountEditorForm
                    initial={{
                      label: account.label,
                      owner: account.owner,
                      icon: account.icon,
                    }}
                    submitLabel="Save"
                    onSubmit={(input) => updateAccount(account.id, input)}
                    onCancel={() => setEditingAccountId(null)}
                  />
                ) : (
                  <>
                    <div className="custom-category-meta">
                      <span className="category-name">
                        <span className="icon" aria-hidden>
                          {account.icon}
                        </span>{' '}
                        {account.label}
                      </span>
                      <span className="preview-meta">
                        {accountOwnerLabel(account.owner)}
                        {custom ? '' : ' · built-in'}
                      </span>
                    </div>
                    {custom ? (
                      <div className="custom-category-actions">
                        <button
                          type="button"
                          className="ghost"
                          onClick={() => {
                            setEditingAccountId(account.id)
                            setShowAddAccount(false)
                          }}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="ghost danger"
                          onClick={() => onRemoveCustomAccount(account.id)}
                        >
                          Remove
                        </button>
                      </div>
                    ) : null}
                  </>
                )}
              </li>
            )
          })}
        </ul>
        {customAccounts.length === 0 && !showAddAccount ? (
          <p className="empty-note account-list-hint">
            Example: add “Kate’s Amex” owned by Kate — it only appears when
            Whose statement? / Person is Kate. Mark joint accounts as Shared.
          </p>
        ) : null}
      </section>

      {(['fixed', 'variable'] as const).map((kind) => (
        <BudgetKindTable
          key={kind}
          kind={kind}
          personFocus={personFocus}
          categories={categories.filter((c) => c.kind === kind)}
          budgetAmount={budgetAmount}
          onUpdate={updateBudget}
        />
      ))}
    </div>
  )
}

function AccountEditorForm({
  initial,
  defaultOwner = 'trevor',
  submitLabel = 'Add account',
  onSubmit,
  onCancel,
}: {
  initial?: { label: string; owner: AccountOwner; icon: string }
  defaultOwner?: AccountOwner
  submitLabel?: string
  onSubmit: (input: {
    label: string
    owner: AccountOwner
    icon: string
  }) => void
  onCancel: () => void
}) {
  const [label, setLabel] = useState(initial?.label ?? '')
  const [owner, setOwner] = useState<AccountOwner>(
    initial?.owner ?? defaultOwner,
  )
  const [icon, setIcon] = useState(initial?.icon ?? '')

  function submit(e: FormEvent) {
    e.preventDefault()
    if (!label.trim()) return
    onSubmit({
      label: label.trim(),
      owner,
      icon: icon.trim() || '💳',
    })
  }

  return (
    <form className="log-form category-editor" onSubmit={submit}>
      <div className="log-grid">
        <label className="span-2">
          Name
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Kate’s Amex, Joint chequing…"
            required
            autoFocus
          />
        </label>
        <label>
          Owner
          <select
            value={owner}
            onChange={(e) => setOwner(e.target.value as AccountOwner)}
          >
            <option value="trevor">Trevor</option>
            <option value="kate">Kate</option>
            <option value="shared">Shared / joint</option>
          </select>
        </label>
        <label>
          Icon
          <input
            value={icon}
            onChange={(e) => setIcon(e.target.value)}
            placeholder="💳"
            maxLength={4}
          />
        </label>
      </div>
      <div className="log-actions">
        <button type="button" className="ghost" onClick={onCancel}>
          Cancel
        </button>
        <button type="submit" className="primary">
          {submitLabel}
        </button>
      </div>
    </form>
  )
}

function BudgetKindTable({
  kind,
  personFocus,
  categories,
  budgetAmount,
  onUpdate,
}: {
  kind: CategoryKind
  personFocus: PersonId | 'both'
  categories: ReturnType<typeof getAllCategories>
  budgetAmount: (personId: PersonId, categoryId: string) => number
  onUpdate: (personId: PersonId, categoryId: string, raw: string) => void
}) {
  const showTrevor = personFocus === 'both' || personFocus === 'trevor'
  const showKate = personFocus === 'both' || personFocus === 'kate'

  const rows = categories.map((cat) => {
    const trevor = budgetAmount('trevor', cat.id)
    const kate = budgetAmount('kate', cat.id)
    return {
      ...cat,
      trevor,
      kate,
      total: Math.round((trevor + kate) * 100) / 100,
    }
  })

  const kindTotal = rows.reduce((sum, row) => sum + row.total, 0)
  const trevorTotal = Math.round(
    rows.reduce((sum, row) => sum + row.trevor, 0) * 100,
  ) / 100
  const kateTotal = Math.round(
    rows.reduce((sum, row) => sum + row.kate, 0) * 100,
  ) / 100

  return (
    <section className="panel">
      <div className="panel-header">
        <div>
          <h2>{kind === 'fixed' ? 'Fixed bills' : 'Variable budgets'}</h2>
          <p>
            {kind === 'fixed'
              ? 'Recurring necessities — rent, utilities, insurance'
              : 'Discretionary spending caps per person'}
          </p>
        </div>
        <div className="section-leftover">{formatMoney(kindTotal)}</div>
      </div>
      {rows.length === 0 ? (
        <div className="empty-guide embedded">
          <p>
            No {kind === 'fixed' ? 'fixed' : 'variable'} categories yet. Add one
            under Categories if you need a new line.
          </p>
        </div>
      ) : (
        <table className="budget-edit-table">
          <thead>
            <tr>
              <th>Category</th>
              {showTrevor ? <th className="num">Trevor</th> : null}
              {showKate ? <th className="num">Kate</th> : null}
              {personFocus === 'both' ? (
                <th className="num">Total</th>
              ) : null}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>
                  <span className="category-name">
                    <span className="category-line-icon" aria-hidden>
                      <CategoryLineIcon categoryId={row.id} />
                    </span>{' '}
                    {row.label}
                  </span>
                </td>
                {showTrevor ? (
                  <td className="num">
                    <input
                      className="budget-cell-input"
                      type="number"
                      min="0"
                      step="0.01"
                      value={moneyInputValue(row.trevor)}
                      onChange={(e) =>
                        onUpdate('trevor', row.id, e.target.value)
                      }
                      aria-label={`${row.label} Trevor budget`}
                    />
                  </td>
                ) : null}
                {showKate ? (
                  <td className="num">
                    <input
                      className="budget-cell-input"
                      type="number"
                      min="0"
                      step="0.01"
                      value={moneyInputValue(row.kate)}
                      onChange={(e) =>
                        onUpdate('kate', row.id, e.target.value)
                      }
                      aria-label={`${row.label} Kate budget`}
                    />
                  </td>
                ) : null}
                {personFocus === 'both' ? (
                  <td className="num">{formatMoney(row.total)}</td>
                ) : null}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td>Total</td>
              {showTrevor ? (
                <td className="num">{formatMoney(trevorTotal)}</td>
              ) : null}
              {showKate ? (
                <td className="num">{formatMoney(kateTotal)}</td>
              ) : null}
              {personFocus === 'both' ? (
                <td className="num">{formatMoney(kindTotal)}</td>
              ) : null}
            </tr>
          </tfoot>
        </table>
      )}
    </section>
  )
}
