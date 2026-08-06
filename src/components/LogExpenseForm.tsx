import type { FormEvent } from 'react'
import { useState } from 'react'
import { ACTIVE_MONTH_ID, PEOPLE } from '../data/seed'
import { CategoryPicker } from './CategoryPicker'
import {
  accountsForPerson,
  resolveAccountForPerson,
} from '../lib/customAccounts'
import { accountOptionLabel } from '../lib/labels'
import type { AccountId, CategoryId, PersonId, Transaction } from '../types'

interface LogExpenseFormProps {
  onSave: (tx: Transaction) => void
  onCancel?: () => void
  defaultPersonId?: PersonId
  /** When set, form edits this transaction instead of creating a new one. */
  initial?: Transaction
}

export function LogExpenseForm({
  onSave,
  onCancel,
  defaultPersonId = 'trevor',
  initial,
}: LogExpenseFormProps) {
  const editing = Boolean(initial)
  const [personId, setPersonId] = useState<PersonId>(
    initial?.personId ?? defaultPersonId,
  )
  const [date, setDate] = useState(
    () => initial?.date ?? `${ACTIVE_MONTH_ID}-15`,
  )
  const [merchant, setMerchant] = useState(initial?.merchant ?? '')
  const [amount, setAmount] = useState(
    initial != null ? String(initial.amount) : '',
  )
  const [categoryId, setCategoryId] = useState<CategoryId>(
    initial?.categoryId ?? 'other',
  )
  const [accountId, setAccountId] = useState<AccountId>(() =>
    resolveAccountForPerson(
      initial?.accountId ?? 'amex',
      initial?.personId ?? defaultPersonId,
    ),
  )
  const [notes, setNotes] = useState(initial?.notes ?? '')
  const [isRefund, setIsRefund] = useState(initial?.isRefund ?? false)

  const personAccounts = accountsForPerson(personId)

  function changePerson(next: PersonId) {
    setPersonId(next)
    setAccountId((current) => resolveAccountForPerson(current, next))
  }

  function submit(e: FormEvent) {
    e.preventDefault()
    const value = Number(amount)
    if (!merchant.trim() || !Number.isFinite(value) || value <= 0) return

    const monthId = date.slice(0, 7)
    const trimmedNotes = notes.trim()
    onSave({
      id: initial?.id ?? `manual-${Date.now()}`,
      personId,
      monthId: monthId || initial?.monthId || ACTIVE_MONTH_ID,
      date,
      amount: Math.round(value * 100) / 100,
      merchant: merchant.trim(),
      accountId: resolveAccountForPerson(accountId, personId),
      categoryId,
      notes: trimmedNotes || undefined,
      isRefund,
      source: initial?.source ?? 'manual',
      importId: initial?.importId,
      sourceFile: initial?.sourceFile,
    })

    if (!editing) {
      setMerchant('')
      setAmount('')
      setNotes('')
      setIsRefund(false)
    }
  }

  return (
    <form className="log-form" onSubmit={submit}>
      <div className="log-grid">
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
          Person
          <select
            value={personId}
            onChange={(e) => changePerson(e.target.value as PersonId)}
          >
            {PEOPLE.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Account
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value as AccountId)}
          >
            {personAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {accountOptionLabel(a.id)}
              </option>
            ))}
          </select>
        </label>
        <label className="span-full category-picker-field">
          Category
          <CategoryPicker
            value={categoryId}
            aria-label="Category"
            onChange={(next) => {
              if (next) setCategoryId(next)
            }}
          />
        </label>
        <label className="span-2">
          Merchant
          <input
            value={merchant}
            onChange={(e) => setMerchant(e.target.value)}
            placeholder="Metro, Starbucks…"
            required
          />
        </label>
        <label>
          Amount
          <input
            type="number"
            min="0.01"
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            required
          />
        </label>
        <label className="checkbox-row">
          <input
            type="checkbox"
            checked={isRefund}
            onChange={(e) => setIsRefund(e.target.checked)}
          />
          Refund / rebate
        </label>
        <label className="span-2">
          Note
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Optional"
          />
        </label>
      </div>
      <div className="log-actions">
        {onCancel ? (
          <button type="button" className="ghost" onClick={onCancel}>
            Cancel
          </button>
        ) : null}
        <button type="submit" className="primary">
          {editing ? 'Save changes' : 'Save expense'}
        </button>
      </div>
    </form>
  )
}
