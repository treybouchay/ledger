import { useMemo, useState } from 'react'
import {
  ACCOUNTS,
  ACTIVE_MONTH_ID,
  ACTIVE_MONTH_LABEL,
  CATEGORIES,
  PEOPLE,
  SEED_TRANSACTIONS,
} from './data/seed'
import { formatMoney, summarizeMonth } from './lib/compute'
import { parseStatementCsv, type ParsedCsvRow } from './lib/parseCsv'
import type { AccountId, PersonId, Transaction } from './types'

type Tab = 'overview' | 'categories' | 'transactions' | 'upload'

export default function App() {
  const [tab, setTab] = useState<Tab>('overview')
  const [transactions, setTransactions] =
    useState<Transaction[]>(SEED_TRANSACTIONS)
  const [personFilter, setPersonFilter] = useState<PersonId | 'all'>('trevor')

  const summary = useMemo(
    () => summarizeMonth(ACTIVE_MONTH_ID, ACTIVE_MONTH_LABEL, transactions),
    [transactions],
  )

  const visibleTx = useMemo(() => {
    return transactions
      .filter((t) => t.monthId === ACTIVE_MONTH_ID)
      .filter((t) => (personFilter === 'all' ? true : t.personId === personFilter))
      .sort((a, b) => b.date.localeCompare(a.date))
  }, [transactions, personFilter])

  const trevor = summary.people.find((p) => p.personId === 'trevor')!
  const kate = summary.people.find((p) => p.personId === 'kate')!

  function importRows(
    rows: ParsedCsvRow[],
    personId: PersonId,
    accountId: AccountId,
  ) {
    const next: Transaction[] = rows.map((row, i) => ({
      id: `csv-${Date.now()}-${i}`,
      personId,
      monthId: ACTIVE_MONTH_ID,
      date: row.date,
      amount: row.amount,
      merchant: row.merchant,
      accountId: row.suggestedAccountId === 'other' ? accountId : row.suggestedAccountId,
      categoryId: row.suggestedCategoryId,
      source: 'csv',
    }))
    setTransactions((prev) => [...prev, ...next])
    setTab('transactions')
  }

  return (
    <div className="app">
      <header className="hero">
        <h1 className="brand">Household Ledger</h1>
        <p className="lede">
          Your sheet’s month math — budgets, category leftover, Kate ↔ Trevor
          rollup — without rewriting formulas every month. Seeded from June 2026.
        </p>
      </header>

      <nav className="tabs" aria-label="Sections">
        {(
          [
            ['overview', 'Month overview'],
            ['categories', 'Categories'],
            ['transactions', 'Transactions'],
            ['upload', 'Upload statement'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            className="tab"
            type="button"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>

      {tab === 'overview' && (
        <div className="layout">
          <div className="summary-grid">
            <div className="stat">
              <span className="stat-label">Combined salary</span>
              <div className="stat-value">{formatMoney(summary.combinedSalary)}</div>
            </div>
            <div className="stat">
              <span className="stat-label">Household spend</span>
              <div className="stat-value">{formatMoney(summary.combinedSpend)}</div>
            </div>
            <div className="stat">
              <span className="stat-label">Leftover vs salary</span>
              <div
                className={`stat-value ${summary.leftover >= 0 ? 'good' : 'bad'}`}
              >
                {formatMoney(summary.leftover)}
              </div>
            </div>
            <div className="stat">
              <span className="stat-label">Month</span>
              <div className="stat-value" style={{ fontSize: '1.35rem' }}>
                {summary.label}
              </div>
            </div>
          </div>

          <div className="people-split">
            <PersonCard name="Trevor" totals={trevor} />
            <PersonCard name="Kate" totals={kate} />
          </div>
        </div>
      )}

      {tab === 'categories' && (
        <section className="panel">
          <div className="panel-header">
            <h2>Trevor · category leftover</h2>
            <p>Budget − spent, same idea as your Leftover column</p>
          </div>
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th className="num">Budget</th>
                <th className="num">Spent</th>
                <th className="num">Leftover</th>
              </tr>
            </thead>
            <tbody>
              {summary.categories.map((row) => (
                <tr key={row.categoryId}>
                  <td>
                    {row.label}
                    <div className="preview-meta">{row.kind}</div>
                  </td>
                  <td className="num">{formatMoney(row.budget)}</td>
                  <td className="num">{formatMoney(row.spent)}</td>
                  <td
                    className={`num leftover ${row.leftover >= 0 ? 'good' : 'bad'}`}
                  >
                    {formatMoney(row.leftover)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {tab === 'transactions' && (
        <section className="panel">
          <div className="panel-header">
            <h2>Transactions</h2>
            <label>
              Person{' '}
              <select
                value={personFilter}
                onChange={(e) =>
                  setPersonFilter(e.target.value as PersonId | 'all')
                }
              >
                <option value="all">Both</option>
                {PEOPLE.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Merchant</th>
                <th>Account</th>
                <th>Category</th>
                <th className="num">Amount</th>
              </tr>
            </thead>
            <tbody>
              {visibleTx.map((t) => (
                <tr key={t.id}>
                  <td>{t.date}</td>
                  <td>
                    {t.merchant}
                    {t.isRefund ? (
                      <div className="preview-meta">refund</div>
                    ) : null}
                  </td>
                  <td>
                    {ACCOUNTS.find((a) => a.id === t.accountId)?.label ?? t.accountId}
                  </td>
                  <td>
                    {CATEGORIES.find((c) => c.id === t.categoryId)?.label ??
                      t.categoryId}
                  </td>
                  <td className={`num ${t.isRefund ? 'leftover good' : ''}`}>
                    {t.isRefund ? '−' : ''}
                    {formatMoney(t.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {tab === 'upload' && <UploadPanel onImport={importRows} />}
    </div>
  )
}

function PersonCard({
  name,
  totals,
}: {
  name: string
  totals: {
    grossSpend: number
    refunds: number
    netSpend: number
    categoryLeftover: number
    vsNecessitiesBudget: number
  }
}) {
  return (
    <article className="person-card">
      <h3>{name}</h3>
      <dl>
        <div>
          <dt>Gross spend</dt>
          <dd>{formatMoney(totals.grossSpend)}</dd>
        </div>
        <div>
          <dt>Refunds</dt>
          <dd>{formatMoney(totals.refunds)}</dd>
        </div>
        <div>
          <dt>Net after refunds</dt>
          <dd>
            <strong>{formatMoney(totals.netSpend)}</strong>
          </dd>
        </div>
        <div>
          <dt>Vs necessities budget</dt>
          <dd
            className={
              totals.vsNecessitiesBudget >= 0 ? 'leftover good' : 'leftover bad'
            }
          >
            {formatMoney(totals.vsNecessitiesBudget)}
          </dd>
        </div>
      </dl>
    </article>
  )
}

function UploadPanel({
  onImport,
}: {
  onImport: (
    rows: ParsedCsvRow[],
    personId: PersonId,
    accountId: AccountId,
  ) => void
}) {
  const [personId, setPersonId] = useState<PersonId>('trevor')
  const [accountId, setAccountId] = useState<AccountId>('amex')
  const [preview, setPreview] = useState<ParsedCsvRow[]>([])

  async function onFile(file: File | null) {
    if (!file) return
    const text = await file.text()
    setPreview(parseStatementCsv(text))
  }

  return (
    <section className="panel">
      <div className="panel-header">
        <h2>Upload statement CSV</h2>
        <p>Date, merchant, amount — rules suggest categories</p>
      </div>
      <div className="upload-box">
        <p className="hint">
          Example headers: <code>Date,Description,Amount</code>. Matching rules
          cover Metro, Starbucks, Amazon, LCBO, gas stations, and more from your
          June merchants.
        </p>
        <label>
          Person
          <select
            value={personId}
            onChange={(e) => setPersonId(e.target.value as PersonId)}
          >
            {PEOPLE.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Account / card
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value as AccountId)}
          >
            {ACCOUNTS.map((a) => (
              <option key={a.id} value={a.id}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          CSV file
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => onFile(e.target.files?.[0] ?? null)}
          />
        </label>

        {preview.length > 0 && (
          <>
            <div className="preview-list">
              {preview.slice(0, 40).map((row, i) => (
                <div className="preview-row" key={`${row.merchant}-${i}`}>
                  <div>
                    <strong>{row.merchant}</strong>
                    <div className="preview-meta">
                      {row.date} ·{' '}
                      {CATEGORIES.find((c) => c.id === row.suggestedCategoryId)
                        ?.label ?? row.suggestedCategoryId}
                    </div>
                  </div>
                  <div className="num">{formatMoney(row.amount)}</div>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="primary"
              onClick={() => onImport(preview, personId, accountId)}
            >
              Import {preview.length} transactions
            </button>
          </>
        )}
      </div>
    </section>
  )
}
