# Household Ledger

Expense tracker that recreates your **Expenses 2026** Google Sheet workflow: per-person months, category budgets, leftover math, and household salary rollup — plus CSV statement upload with merchant categorization rules.

## Quick start

```bash
npm install
npm run dev
```

## What’s seeded

From your sheet’s **Updated info March 2024** and **TrevorJune / Kate June** tabs:

- People & incomes (Trevor $6,050 / Kate $4,600)
- Category budgets (Kate + Trevor reference table)
- June 2026 seed transactions matching spreadsheet category totals
- Merchant → category rules (Metro, Starbucks, Amazon, LCBO, gas, etc.)

## Phase 1 scope

- Month overview (combined salary / spend / leftover)
- Category leftover table (budget − spent)
- Transaction list
- CSV upload → auto-suggest categories → import

## Next

- Per-merchant line items instead of rolled seed totals
- Editable budgets UI
- Persist to localStorage / backend
- Bank-specific CSV column maps
