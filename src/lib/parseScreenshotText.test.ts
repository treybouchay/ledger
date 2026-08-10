/**
 * Focused parser checks for Amex screenshot refund/credit detection.
 * Run: npx tsx src/lib/parseScreenshotText.test.ts
 */
import assert from 'node:assert/strict'
import { parseScreenshotText } from './parseScreenshotText'
import { draftsFromParsed } from './reviewDraft'

function byMerchant(text: string) {
  return Object.fromEntries(
    parseScreenshotText(text).map((r) => [
      r.merchant.toLowerCase(),
      { amount: r.amount, isRefund: Boolean(r.isRefund) },
    ]),
  )
}

const amexCreditBadge = `
SimplyCash Preferred Card
American Express

5 Aug
AMAZON.COM AMZN.COM/BILL
Credit
$42.18
SEATTLE

4 Aug
STARBUCKS #2841
$7.45
WHITBY
`

{
  const rows = byMerchant(amexCreditBadge)
  assert.equal(rows['amazon.com amzn.com/bill']?.isRefund, true)
  assert.equal(rows['amazon.com amzn.com/bill']?.amount, 42.18)
  assert.equal(rows['starbucks']?.isRefund, false)
  assert.equal(rows['starbucks']?.amount, 7.45)
  assert.equal(rows['credit'], undefined)
}

const amexCreditAfterAmount = `
SimplyCash Preferred Card
5 Aug
NORDSTROM
$120.00
Credit
SEATTLE
`

{
  const rows = byMerchant(amexCreditAfterAmount)
  assert.equal(rows['nordstrom']?.isRefund, true)
  assert.equal(rows['nordstrom']?.amount, 120)
}

const signedAndParen = `
SimplyCash Preferred Card
5 Aug
OLD NAVY #512
-$28.50
WHITBY
FACTOR MEALS
($64.99)
TEAM TOWN HOCKEY $55.00 CR
`

{
  const rows = byMerchant(signedAndParen)
  assert.equal(rows['old navy']?.isRefund, true)
  assert.equal(rows['old navy']?.amount, 28.5)
  assert.equal(rows['factor meals']?.isRefund, true)
  assert.equal(rows['factor meals']?.amount, 64.99)
  assert.equal(rows['team town hockey']?.isRefund, true)
  assert.equal(rows['team town hockey']?.amount, 55)
}

const inlineCreditWord = `
SimplyCash Preferred Card
5 Aug
AMAZON MARKETPLACE Credit $19.99
`

{
  const rows = parseScreenshotText(inlineCreditWord)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].isRefund, true)
  assert.equal(rows[0].amount, 19.99)
}

// Ordinary Amex charges must stay non-refunds.
const amexCharges = `
SimplyCash Preferred Card
3 Aug
LCBO WHITBY WHITBY $25.62
WHITBY
TIM HORTONS #22045 WHITBY $3.97
WHITBY
LANDMARK WEB TICKETING $37.31
403-262-4255
`

{
  const rows = parseScreenshotText(amexCharges)
  assert.ok(rows.length >= 3)
  assert.ok(rows.every((r) => !r.isRefund))
  const landmark = rows.find((r) => /landmark/i.test(r.merchant))
  assert.ok(landmark)
  assert.equal(landmark!.amount, 37.31)
}

// TD-style sectioned activity should still parse spends (not credits).
const tdSample = `
TD First Class Travel Visa Infinite
Tuesday August 4, 2026
STARBUCKS #2841
$6.25
METRO 205
$41.10
`

{
  const rows = parseScreenshotText(tdSample)
  assert.ok(rows.some((r) => /starbucks/i.test(r.merchant) && !r.isRefund))
  assert.ok(rows.some((r) => /metro/i.test(r.merchant) && !r.isRefund))
}

// Two Amazon credits on one screenshot — different amounts, both import.
const twoAmazonDifferent = `
SimplyCash Preferred Card
American Express

8 Aug
AMAZON.COM AMZN.COM/BILL
Credit
$42.18
SEATTLE
AMAZON.COM AMZN.COM/BILL
Credit
$19.99
SEATTLE
STARBUCKS #2841
$7.45
WHITBY
`

{
  const rows = parseScreenshotText(twoAmazonDifferent)
  const amazons = rows.filter((r) => /amazon/i.test(r.merchant))
  assert.equal(amazons.length, 2)
  assert.ok(amazons.every((r) => r.isRefund))
  assert.deepEqual(
    amazons.map((r) => r.amount).sort((a, b) => a - b),
    [19.99, 42.18],
  )
  const drafts = draftsFromParsed(rows, 'trevor', 'amex', [])
  const amazonDrafts = drafts.filter((d) => /amazon/i.test(d.merchant))
  assert.equal(amazonDrafts.length, 2)
  assert.ok(amazonDrafts.every((d) => d.included && d.isRefund))
}

// Credit badge after city subtitle (OCR order) still marks refunds.
const cityBeforeCredit = `
SimplyCash Preferred Card
8 Aug
AMAZON.COM AMZN.COM/BILL
$42.18
SEATTLE
Credit
AMAZON.COM AMZN.COM/BILL
$19.99
SEATTLE
Credit
`

{
  const rows = parseScreenshotText(cityBeforeCredit)
  const amazons = rows.filter((r) => /amazon/i.test(r.merchant))
  assert.equal(amazons.length, 2)
  assert.ok(amazons.every((r) => r.isRefund))
}

// Exact same refund twice in one file → second is a duplicate (re-import).
const twoAmazonSameAmount = `
SimplyCash Preferred Card
8 Aug
AMAZON.COM AMZN.COM/BILL
Credit
$29.99
SEATTLE
AMAZON.COM AMZN.COM/BILL
Credit
$29.99
SEATTLE
`

{
  const rows = parseScreenshotText(twoAmazonSameAmount)
  assert.equal(rows.length, 2)
  assert.ok(rows.every((r) => r.isRefund && r.amount === 29.99))
  const drafts = draftsFromParsed(rows, 'trevor', 'amex', [])
  assert.equal(drafts.length, 2)
  assert.equal(drafts[0].matchStatus, 'new')
  assert.equal(drafts[0].included, true)
  assert.equal(drafts[1].matchStatus, 'duplicate')
  assert.equal(drafts[1].included, false)
}

// Near-amount refunds must not collapse into one.
const twoAmazonNearAmount = `
SimplyCash Preferred Card
8 Aug
AMAZON.COM AMZN.COM/BILL
Credit
$15.80
SEATTLE
AMAZON.COM AMZN.COM/BILL
Credit
$15.81
SEATTLE
`

{
  const rows = parseScreenshotText(twoAmazonNearAmount)
  assert.equal(rows.length, 2)
  assert.ok(rows.every((r) => r.isRefund))
}

// Real Amex SimplyCash layout: twin AMZN MKTP CA credits with unicode minus
// (−$41.19 and −$29.37) plus spends — five posted rows (Pending skipped).
const amexAug6TwinAmazonReturns = `
SimplyCash Preferred Card
American Express

6 Aug
TIM HORTONS
$9.13
Pending
AMZN MKTP CA 866-216-1072
−$41.19
AMZN MKTP CA 866-216-1072
−$29.37
OPENAI CHATGPT SUBSCR
SAN FRANCISCO
$32.61
PETRO-CANADA 65696 WHITBY
$15.80
PETRO-CANADA 65696 WHITBY
$65.06
`

{
  const rows = parseScreenshotText(amexAug6TwinAmazonReturns)
  assert.equal(rows.length, 5, `expected 5 posted, got ${rows.length}`)
  const amazons = rows.filter((r) => /amzn/i.test(r.merchant))
  assert.equal(amazons.length, 2)
  assert.ok(amazons.every((r) => r.isRefund))
  assert.deepEqual(
    amazons.map((r) => r.amount).sort((a, b) => a - b),
    [29.37, 41.19],
  )
  assert.ok(rows.some((r) => /openai/i.test(r.merchant) && r.amount === 32.61))
  const petros = rows.filter((r) => /petro/i.test(r.merchant))
  assert.equal(petros.length, 2)
  assert.ok(rows.every((r) => !/tim\s*hort/i.test(r.merchant)))
  const drafts = draftsFromParsed(rows, 'trevor', 'amex', [])
  assert.equal(drafts.filter((d) => d.included).length, 5)
}

// Same-line merchant + phone + unicode-minus credit (OCR often flattens rows).
const amexInlineTwinAmazon = `
SimplyCash Preferred Card
6 Aug
TIM HORTONS $9.13 Pending
AMZN MKTP CA 866-216-1072 −$41.19
AMZN MKTP CA 866-216-1072 −$29.37
OPENAI CHATGPT SUBSCR SAN FRANCISCO $32.61
PETRO-CANADA 65696 WHITBY $15.80
PETRO-CANADA 65696 WHITBY $65.06
`

{
  const rows = parseScreenshotText(amexInlineTwinAmazon)
  assert.equal(rows.length, 5)
  const amazons = rows.filter((r) => /amzn/i.test(r.merchant))
  assert.equal(amazons.length, 2)
  assert.deepEqual(
    amazons.map((r) => r.amount).sort((a, b) => a - b),
    [29.37, 41.19],
  )
  assert.ok(amazons.every((r) => r.isRefund))
}

// OCR often replaces a washed-out minus with ~ / = / _ before $credits.
const amexGlyphMinusCredits = `
SimplyCash Preferred Card
6 Aug
AMZN MKTP CA 866-216-1072
~$41.19
AMZN MKTP CA 866-216-1072
=$29.37
OPENAI CHATGPT SUBSCR SAN FRANCISCO $32.61
`

{
  const rows = parseScreenshotText(amexGlyphMinusCredits)
  const amazons = rows.filter((r) => /amzn/i.test(r.merchant))
  assert.equal(amazons.length, 2)
  assert.ok(amazons.every((r) => r.isRefund))
  assert.deepEqual(
    amazons.map((r) => r.amount).sort((a, b) => a - b),
    [29.37, 41.19],
  )
}

// Phone-only subtitle under the payee must still allow Credit detection.
const phoneOnlySubtitleCredit = `
SimplyCash Preferred Card
8 Aug
AMAZON.COM AMZN.COM/BILL
$42.18
866-216-1072
Credit
SEATTLE
STARBUCKS #2841
$7.45
WHITBY
`

{
  const rows = parseScreenshotText(phoneOnlySubtitleCredit)
  const amazon = rows.find((r) => /amazon/i.test(r.merchant))
  assert.ok(amazon)
  assert.equal(amazon!.isRefund, true)
  assert.equal(amazon!.amount, 42.18)
}

// Regression: green OCR often loses the thin minus → positive $amounts.
// Pipeline must ink `-` before green clusters; once present, both are refunds.
const amexOcrAfterGreenMinusInk = `
SimplyCash Preferred Card
American Express
6 Aug
TIM HORTONS
$9.13
Pending
AMZN MKTP CA 866-216-1072
-$41.19
AMZN MKTP CA 866-216-1072
-$29.37
OPENAI CHATGPT SUBSCR
SAN FRANCISCO
$32.61
PETRO-CANADA 65696 WHITBY
$15.80
PETRO-CANADA 65696 WHITBY
$65.06
`

{
  const rows = parseScreenshotText(amexOcrAfterGreenMinusInk)
  assert.equal(rows.length, 5)
  const amazons = rows.filter((r) => /amzn/i.test(r.merchant))
  assert.equal(amazons.length, 2)
  assert.ok(
    amazons.every((r) => r.isRefund),
    'both Amazon credits must be refunds after minus-ink OCR',
  )
  assert.deepEqual(
    amazons.map((r) => r.amount).sort((a, b) => a - b),
    [29.37, 41.19],
  )
  const drafts = draftsFromParsed(rows, 'trevor', 'amex', [])
  assert.ok(drafts.filter((d) => /amzn/i.test(d.merchant)).every((d) => d.isRefund))
}

// Real Amex OCR often loses Tim Hortons' amount (`Dele`) so Pending sits
// alone above the first Amazon — must not steal that posted refund.
const amexOrphanedPendingStealsAmazon = `
SimplyCash Preferred Card
6 Aug
TIM HORTONS                           Dele
Pending
AMZN MKTP CA 866-216-1072           -$41.19
AMZN MKTP CA 866-216-1072                -$29.37
OPENAI *CHATGPT SUBSCR SAN              $32.61
FRANCISCO
PETRO-CANADA 65036 WHITBY               $15.80
PETRO-CANADA 65036 WHITBY               $65.06
`

{
  const rows = parseScreenshotText(amexOrphanedPendingStealsAmazon)
  assert.equal(rows.length, 5, `expected 5 posted, got ${rows.length}`)
  const amazons = rows.filter((r) => /amzn/i.test(r.merchant))
  assert.equal(amazons.length, 2, 'orphaned Pending must not drop first Amazon')
  assert.ok(amazons.every((r) => r.isRefund))
  assert.deepEqual(
    amazons.map((r) => r.amount).sort((a, b) => a - b),
    [29.37, 41.19],
  )
  assert.ok(rows.every((r) => !/tim\s*hort/i.test(r.merchant)))
}

// Twin different-amount Amazon refunds stay included (not collapsed / not dupes).
{
  const drafts = draftsFromParsed(
    parseScreenshotText(twoAmazonDifferent),
    'trevor',
    'amex',
    [],
  )
  const amazonDrafts = drafts.filter((d) => /amazon/i.test(d.merchant))
  assert.equal(amazonDrafts.length, 2)
  assert.ok(amazonDrafts.every((d) => d.included && d.isRefund))
  assert.ok(amazonDrafts.every((d) => d.matchStatus === 'new'))
}

// Exact same refund vs an already-logged ledger credit → duplicate.
{
  const existing = [
    {
      id: 'tx-existing-amazon-refund',
      personId: 'trevor' as const,
      monthId: '2026-08',
      date: '2026-08-08',
      amount: 29.99,
      merchant: 'AMAZON.COM AMZN.COM/BILL',
      accountId: 'amex' as const,
      categoryId: 'amazon' as const,
      isRefund: true,
      source: 'csv' as const,
    },
  ]
  const rows = parseScreenshotText(`
SimplyCash Preferred Card
8 Aug
AMAZON.COM AMZN.COM/BILL
Credit
$29.99
SEATTLE
`)
  const drafts = draftsFromParsed(rows, 'trevor', 'amex', existing)
  assert.equal(drafts.length, 1)
  assert.equal(drafts[0].matchStatus, 'duplicate')
  assert.equal(drafts[0].included, false)
  assert.ok(/duplicate refund/i.test(drafts[0].matchReason ?? ''))
}

// Uber Eats Toronto-style multi-line OCR must become a charge.
const uberEatsToronto = `
SimplyCash Preferred Card
American Express
7 Aug
UBER EATS
TORONTO
$48.23
STARBUCKS #2841
$7.45
WHITBY
`

{
  const rows = parseScreenshotText(uberEatsToronto)
  const uber = rows.find((r) => /uber/i.test(r.merchant))
  assert.ok(uber, 'UBER EATS + TORONTO must parse to a charge')
  assert.equal(uber!.amount, 48.23)
  assert.equal(uber!.isRefund, false)
  assert.match(uber!.merchant, /uber\s*eats/i)
}

// OCR-glued UBEREATS + city/province must not be dropped as a "city".
const uberEatsGlued = `
SimplyCash Preferred Card
7 Aug
UBEREATS
TORONTO ON
$52.18
PETRO-CANADA 65696 WHITBY
$15.80
`

{
  const rows = parseScreenshotText(uberEatsGlued)
  const uber = rows.find((r) => /uber/i.test(r.merchant))
  assert.ok(uber, 'glued UBEREATS must not be skipped as a city subtitle')
  assert.equal(uber!.amount, 52.18)
  assert.match(uber!.merchant, /uber\s*eats/i)
  assert.ok(!/toronto/i.test(uber!.merchant))
}

// HELP.UBER.COM / order id under the payee must not steal the merchant.
const uberEatsHelpUrl = `
SimplyCash Preferred Card
7 Aug
UBER *EATS
HELP.UBER.COM
TORONTO ON CA
$61.99
`

{
  const rows = parseScreenshotText(uberEatsHelpUrl)
  assert.equal(rows.length, 1)
  assert.match(rows[0].merchant, /uber\s*eats/i)
  assert.equal(rows[0].amount, 61.99)
  assert.ok(!/help\.uber|toronto/i.test(rows[0].merchant))
}

// Split "UBER" / "EATS" lines still resolve to Uber Eats.
const uberEatsSplitLines = `
SimplyCash Preferred Card
7 Aug
UBER
EATS
TORONTO
$48.23
`

{
  const rows = parseScreenshotText(uberEatsSplitLines)
  assert.equal(rows.length, 1)
  assert.match(rows[0].merchant, /uber\s*eats/i)
  assert.equal(rows[0].amount, 48.23)
}

console.log('parseScreenshotText.test.ts: all assertions passed')
