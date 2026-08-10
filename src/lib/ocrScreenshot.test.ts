/**
 * OCR preprocess checks: Amex green credit amounts must stay dark,
 * and a minus must be inked so Tesseract keeps the credit sign.
 * Run: npx tsx src/lib/ocrScreenshot.test.ts
 */
import assert from 'node:assert/strict'
import {
  closeBinaryMask,
  findGreenCreditAnchors,
  inkMinusAt,
  isCreditGreenPixel,
  prepareImageDataForOcr,
  processImageDataForOcr,
  rgbaToOcrGray,
} from './ocrScreenshot'

// Synthetic Amex credit green (typical app ink) → near black.
{
  const y = rgbaToOcrGray(40, 150, 85)
  assert.ok(y < 40, `expected dark credit green, got ${y}`)
}

// Black merchant text stays dark.
{
  const y = rgbaToOcrGray(28, 28, 28)
  assert.ok(y < 40, `expected dark black text, got ${y}`)
}

// Mint / light chrome stays light (must not become black blobs).
{
  const y = rgbaToOcrGray(228, 239, 233)
  assert.ok(y > 200, `expected light mint chrome, got ${y}`)
  assert.equal(isCreditGreenPixel(228, 239, 233), false)
}

assert.equal(isCreditGreenPixel(40, 150, 85), true)
assert.equal(isCreditGreenPixel(28, 28, 28), false)

// White stays white.
{
  assert.ok(rgbaToOcrGray(255, 255, 255) > 250)
}

// Green credit is darker than the same luminance gray (luma-equivalent).
{
  const green = rgbaToOcrGray(46, 140, 90)
  const gray = rgbaToOcrGray(106, 106, 106)
  assert.ok(green < gray - 20, `green ${green} should beat gray ${gray}`)
}

function makeImageData(
  pixels: Array<[number, number, number]>,
  width: number,
): ImageData {
  const data = new Uint8ClampedArray(pixels.length * 4)
  for (let i = 0; i < pixels.length; i += 1) {
    const [r, g, b] = pixels[i]
    data[i * 4] = r
    data[i * 4 + 1] = g
    data[i * 4 + 2] = b
    data[i * 4 + 3] = 255
  }
  return { data, width, height: Math.ceil(pixels.length / width) } as ImageData
}

// Light Amex screenshot: mostly mint, green credit pixel stays ink-dark.
{
  const mint: [number, number, number] = [228, 239, 233]
  const pixels: Array<[number, number, number]> = Array.from(
    { length: 40 },
    () => mint,
  )
  pixels[10] = [40, 150, 85]
  const imageData = makeImageData(pixels, 8)
  processImageDataForOcr(imageData)
  const greenOut = imageData.data[10 * 4]
  const mintOut = imageData.data[0]
  assert.ok(greenOut < 50, `processed green ${greenOut}`)
  assert.ok(mintOut > 180, `processed mint ${mintOut}`)
  assert.ok(greenOut < mintOut - 80)
}

// Dark-mode frame: green credit must stay dark after invert (not wash to white).
{
  const navy: [number, number, number] = [15, 18, 25]
  const pixels: Array<[number, number, number]> = Array.from(
    { length: 40 },
    () => navy,
  )
  pixels[10] = [40, 150, 85]
  pixels[11] = [240, 240, 240] // white label
  const imageData = makeImageData(pixels, 8)
  processImageDataForOcr(imageData)
  const greenOut = imageData.data[10 * 4]
  const whiteOut = imageData.data[11 * 4]
  assert.ok(greenOut < 60, `dark-mode green should stay ink, got ${greenOut}`)
  assert.ok(
    whiteOut < 80,
    `dark-mode white label should invert to dark, got ${whiteOut}`,
  )
}

// Two green amount blobs on the right → two minus anchors (twin Amazon credits).
{
  const w = 120
  const h = 80
  const data = new Uint8ClampedArray(w * h * 4)
  // mint background
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 232
    data[i + 1] = 241
    data[i + 2] = 236
    data[i + 3] = 255
  }
  const paintGreenRect = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const i = (y * w + x) * 4
        data[i] = 40
        data[i + 1] = 150
        data[i + 2] = 85
      }
    }
  }
  // Right-side amount-sized green runs (two rows)
  paintGreenRect(70, 20, 105, 32)
  paintGreenRect(70, 45, 105, 57)

  const anchors = findGreenCreditAnchors(data, w, h)
  assert.equal(anchors.length, 2, `expected 2 anchors, got ${anchors.length}`)
  assert.ok(anchors[0].x < 70)
  assert.ok(anchors[1].x < 70)

  const color = { data: new Uint8ClampedArray(data), width: w, height: h } as ImageData
  const prepared = prepareImageDataForOcr(color)
  // Pixels at inked minus should be black
  for (const a of anchors) {
    const i = (a.y * w + a.x) * 4
    assert.ok(
      prepared.data[i] < 40,
      `expected inked minus at (${a.x},${a.y}), got ${prepared.data[i]}`,
    )
  }
}

// Amex paints merchant+phone+amount green on the same row — still two anchors.
{
  const w = 200
  const h = 100
  const data = new Uint8ClampedArray(w * h * 4)
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 15
    data[i + 1] = 18
    data[i + 2] = 25
    data[i + 3] = 255
  }
  const paintGreenRect = (x0: number, y0: number, x1: number, y1: number) => {
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const i = (y * w + x) * 4
        data[i] = 40
        data[i + 1] = 150
        data[i + 2] = 85
      }
    }
  }
  // Full-row green: left merchant/phone + right amount (two credit rows)
  paintGreenRect(10, 20, 110, 32) // merchant
  paintGreenRect(150, 20, 190, 32) // −$41.19
  paintGreenRect(10, 50, 110, 62)
  paintGreenRect(150, 50, 190, 62) // −$29.37

  const anchors = findGreenCreditAnchors(data, w, h)
  assert.equal(
    anchors.length,
    2,
    `full-row green must yield 2 amount anchors, got ${anchors.length}`,
  )
  assert.ok(anchors[0].x >= 130 && anchors[0].x < 150, `anchor0 x=${anchors[0].x}`)
  assert.ok(anchors[1].x >= 130 && anchors[1].x < 150, `anchor1 x=${anchors[1].x}`)
}

// inkMinusAt writes black bar
{
  const w = 40
  const h = 20
  const data = new Uint8ClampedArray(w * h * 4).fill(255)
  inkMinusAt(data, w, h, 20, 10)
  assert.ok(data[(10 * w + 20) * 4] === 0)
}

// Morph close fills 1px gaps in green credit masks (anti-alias speckles).
{
  const w = 5
  const h = 5
  const mask = new Uint8Array(w * h)
  mask[2 * w + 1] = 1
  mask[2 * w + 3] = 1
  const closed = closeBinaryMask(mask, w, h, 1)
  assert.equal(closed[2 * w + 2], 1, 'gap between green hits should close')
}

console.log('ocrScreenshot.test.ts: all assertions passed')
