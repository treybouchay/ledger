/**
 * Focused parser checks for Amex screenshot refund/credit detection.
 * Run: npx tsx src/lib/parseScreenshotText.test.ts
 */
import assert from 'node:assert/strict'
import { parseScreenshotText } from './parseScreenshotText'

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

console.log('parseScreenshotText.test.ts: all assertions passed')
