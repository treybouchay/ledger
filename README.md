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

## Phase 2 — import review queue

- Editable category, account, merchant, date, amount per row
- Include / exclude rows before import
- Bulk apply category / account / person
- Refund detection (negative amounts + refund/return merchants)
- Highlight rows still on **Other** or changed from the suggestion

## Deploy (DigitalOcean App Platform)

This app is a static Vite build (`dist/`). Data lives in the browser’s `localStorage`, so each device/browser has its own copy.

### 1. Push the repo to GitHub

There is no remote yet. Create a private GitHub repo, then:

```bash
git remote add origin git@github.com:treybouchay/ledger.git
git push -u origin main
```

### 2. Create the App Platform static site

1. Open [cloud.digitalocean.com/apps](https://cloud.digitalocean.com/apps) → **Create App**
2. Connect GitHub and select `household-ledger` (`main`)
3. Set resource type to **Static Site**
4. Build command: `npm ci && npm run build`
5. Output directory: `dist`
6. Catchall document: `index.html`
7. Choose the free **Starter** plan (static sites)

Spec file for CLI deploys: [`.do/app.yaml`](.do/app.yaml) — replace `REPLACE_ME/household-ledger` with your repo, then:

```bash
brew install doctl
doctl auth init
doctl apps create --spec .do/app.yaml
```

### 3. After first deploy

- Confirm the `*.ondigitalocean.app` URL loads
- Optional: attach a custom domain under the app’s **Settings**

## Next

- Learn merchant → category rules from your corrections
- Per-merchant line items instead of rolled seed totals
- Editable budgets UI
- Persist to localStorage / backend
- Bank-specific CSV column maps
