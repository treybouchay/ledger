/**
 * OCR preprocess checks: Amex green credit amounts must stay dark.
 * Run: npx tsx src/lib/ocrScreenshot.test.ts
 */
import assert from 'node:assert/strict'
import { processImageDataForOcr, rgbaToOcrGray } from './ocrScreenshot'

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
}

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

console.log('ocrScreenshot.test.ts: all assertions passed')
