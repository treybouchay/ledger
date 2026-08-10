/**
 * Client-side OCR for phone banking screenshots. Text feeds the same
 * statement parsers as PDF/CSV. Expect imperfect amounts — review queue is
 * the safety net.
 *
 * Dark-mode bank apps (white on navy) are inverted + upscaled before OCR so
 * Tesseract sees black text on white.
 *
 * Amex credits are green (`−$41.19`), and Amex often paints the *whole* credit
 * row green (merchant + phone + amount). Standard luma turns that green into
 * mid-gray that washes out. We gray with R/B (ignore G) and darken green
 * chroma so digits stay ink-dark — but the thin minus often still disappears.
 * Before OCR we ink a bold ASCII `-` just left of each rightmost green amount
 * cluster so credits survive as `-$41.19` for the refund parser.
 */
import { createWorker, PSM } from 'tesseract.js'

export async function extractTextFromImage(
  file: File | Blob,
  onProgress?: (status: string, progress: number) => void,
): Promise<string> {
  onProgress?.('Preparing image…', 0)
  const prepared = await prepareImageForOcr(file)

  const worker = await createWorker('eng', 1, {
    logger: (m) => {
      if (!onProgress) return
      if (m.status === 'recognizing text' && typeof m.progress === 'number') {
        onProgress('Reading text…', m.progress)
      } else if (typeof m.status === 'string') {
        onProgress(m.status, typeof m.progress === 'number' ? m.progress : 0)
      }
    },
  })

  try {
    await worker.setParameters({
      tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
      preserve_interword_spaces: '1',
    })
    onProgress?.('Starting OCR…', 0)
    const {
      data: { text },
    } = await worker.recognize(prepared)
    return text ?? ''
  } finally {
    await worker.terminate()
  }
}

/** True for Amex-style credit-green ink (not mint chrome). */
export function isCreditGreenPixel(r: number, g: number, b: number): boolean {
  const y = 0.299 * r + 0.587 * g + 0.114 * b
  if (y < 25 || y > 200) return false
  const greenness = g - (r + b) / 2
  return greenness > 12 && g > r + 12 && g > b + 8
}

/**
 * Map one sRGB pixel to OCR gray. Exported for unit tests.
 * Green Amex credit ink → near-black; mint/white chrome stays light.
 */
export function rgbaToOcrGray(r: number, g: number, b: number): number {
  // Ignore G so saturated credit-green does not lift into mid-gray.
  let y = 0.5 * r + 0.5 * b
  const greenness = g - (r + b) / 2
  if (greenness > 10) {
    y = Math.max(0, y - greenness * 2.2)
  }
  return y
}

/**
 * Find left edges of green amount clusters (typically right-aligned credits).
 * Returns anchors where a minus should be inked.
 *
 * Amex paints the *whole* credit row green (merchant + phone + −$amount).
 * Bucket by line, then take the rightmost amount-sized X-cluster so merchant
 * ink does not inflate the band past the width gate.
 */
export function findGreenCreditAnchors(
  colorData: Uint8ClampedArray,
  width: number,
  height: number,
): Array<{ x: number; y: number }> {
  // Bucket green pixels into horizontal bands (~one text line).
  const bandH = Math.max(6, Math.round(height * 0.012))
  type Band = {
    /** column → hit count within this band */
    cols: Map<number, number>
    minY: number
    maxY: number
    n: number
  }
  const bands = new Map<number, Band>()

  // Scan past mid-left chrome; amounts are right-aligned but merchant green
  // often continues well past 35% width on Amex credit rows.
  const xMin = Math.floor(width * 0.25)
  for (let y = 0; y < height; y += 1) {
    for (let x = xMin; x < width; x += 1) {
      const i = (y * width + x) * 4
      if (!isCreditGreenPixel(colorData[i], colorData[i + 1], colorData[i + 2])) {
        continue
      }
      const key = Math.floor(y / bandH)
      const b = bands.get(key)
      if (!b) {
        bands.set(key, {
          cols: new Map([[x, 1]]),
          minY: y,
          maxY: y,
          n: 1,
        })
      } else {
        b.cols.set(x, (b.cols.get(x) ?? 0) + 1)
        b.minY = Math.min(b.minY, y)
        b.maxY = Math.max(b.maxY, y)
        b.n += 1
      }
    }
  }

  const gapMerge = Math.max(8, Math.round(width * 0.02))
  const anchors: Array<{ x: number; y: number }> = []
  for (const b of bands.values()) {
    const bh = b.maxY - b.minY + 1
    if (b.n < 18 || bh < 4 || bh > bandH * 3) continue

    const xs = [...b.cols.keys()].sort((a, c) => a - c)
    if (xs.length === 0) continue

    // Contiguous column runs → merge digit-sized gaps into clusters.
    type Cluster = { minX: number; maxX: number; n: number }
    const clusters: Cluster[] = []
    let cur: Cluster = {
      minX: xs[0],
      maxX: xs[0],
      n: b.cols.get(xs[0]) ?? 0,
    }
    for (let i = 1; i < xs.length; i += 1) {
      const x = xs[i]
      const hits = b.cols.get(x) ?? 0
      if (x - cur.maxX <= gapMerge) {
        cur.maxX = x
        cur.n += hits
      } else {
        clusters.push(cur)
        cur = { minX: x, maxX: x, n: hits }
      }
    }
    clusters.push(cur)

    // Amount glyphs sit on the right; ignore left merchant/phone green.
    const amountish = clusters.filter((c) => {
      const bw = c.maxX - c.minX + 1
      return (
        c.n >= 12 &&
        bw >= 10 &&
        bw <= width * 0.35 &&
        c.minX >= width * 0.45
      )
    })
    if (amountish.length === 0) continue

    const amount = amountish.reduce((a, c) => (c.maxX > a.maxX ? c : a))
    const cx = Math.max(2, amount.minX - Math.max(6, Math.round(bh * 0.7)))
    const cy = Math.round((b.minY + b.maxY) / 2)
    anchors.push({ x: cx, y: cy })
  }

  // Merge anchors on nearly the same line (one minus per credit row).
  anchors.sort((a, b) => a.y - b.y || a.x - b.x)
  const merged: Array<{ x: number; y: number }> = []
  for (const a of anchors) {
    const prev = merged[merged.length - 1]
    if (prev && Math.abs(prev.y - a.y) <= bandH) {
      // Prefer the rightmost amount when two bands share a line.
      if (a.x > prev.x) {
        prev.x = a.x
        prev.y = Math.round((prev.y + a.y) / 2)
      }
      continue
    }
    merged.push({ ...a })
  }
  return merged
}

/** Draw a thick horizontal minus into grayscale ImageData. */
export function inkMinusAt(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  cx: number,
  cy: number,
): void {
  const thickness = Math.max(2, Math.round(height * 0.003))
  const halfW = Math.max(4, Math.round(height * 0.008))
  for (let dy = -thickness; dy <= thickness; dy += 1) {
    const y = cy + dy
    if (y < 0 || y >= height) continue
    for (let dx = -halfW; dx <= halfW; dx += 1) {
      const x = cx + dx
      if (x < 0 || x >= width) continue
      const i = (y * width + x) * 4
      data[i] = data[i + 1] = data[i + 2] = 0
    }
  }
}

/** Mutates ImageData in place: grayscale + invert-if-dark + contrast. */
export function processImageDataForOcr(imageData: ImageData): void {
  const { data } = imageData
  let lumaSum = 0
  const pixels = data.length / 4
  const gray = new Float32Array(pixels)
  const wasCreditGreen = new Uint8Array(pixels)

  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    const r = data[i]
    const g = data[i + 1]
    const b = data[i + 2]
    if (isCreditGreenPixel(r, g, b) || (g - (r + b) / 2 > 10 && g > r + 8 && g > b + 5)) {
      wasCreditGreen[p] = 1
    }
    const y = rgbaToOcrGray(r, g, b)
    gray[p] = y
    lumaSum += y
  }

  const avg = lumaSum / pixels
  const invert = avg < 128

  for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
    let y = gray[p]
    if (invert) y = 255 - y
    // After invert, former green credits would flip to white — force ink.
    if (wasCreditGreen[p]) {
      y = Math.min(y, 28)
    }
    y = (y - 128) * 1.45 + 128
    y = Math.max(0, Math.min(255, y))
    data[i] = data[i + 1] = data[i + 2] = y
  }
}

/**
 * Full preprocess: color → gray (green-aware) → ink `-` before green credits.
 * Exported for tests with synthetic ImageData pairs.
 */
export function prepareImageDataForOcr(color: ImageData): ImageData {
  const { width, height } = color
  const colorCopy = new Uint8ClampedArray(color.data)
  const gray = {
    data: new Uint8ClampedArray(color.data),
    width,
    height,
  } as ImageData
  processImageDataForOcr(gray)

  const anchors = findGreenCreditAnchors(colorCopy, width, height)
  for (const a of anchors) {
    inkMinusAt(gray.data, width, height, a.x, a.y)
  }
  return gray
}

async function prepareImageForOcr(file: File | Blob): Promise<Blob> {
  if (typeof createImageBitmap !== 'function') return file

  try {
    const bitmap = await createImageBitmap(file)
    const scale = bitmap.width < 900 ? 2.5 : bitmap.width < 1400 ? 1.75 : 1.25
    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) {
      bitmap.close()
      return file
    }

    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()

    const color = ctx.getImageData(0, 0, width, height)
    const prepared = prepareImageDataForOcr(color)
    ctx.putImageData(prepared, 0, 0)
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/png'),
    )
    return blob ?? file
  } catch {
    return file
  }
}
