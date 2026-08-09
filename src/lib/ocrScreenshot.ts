/**
 * Client-side OCR for phone banking screenshots. Text feeds the same
 * statement parsers as PDF/CSV. Expect imperfect amounts — review queue is
 * the safety net.
 *
 * Dark-mode bank apps (white on navy) are inverted + upscaled before OCR so
 * Tesseract sees black text on white.
 *
 * Amex credits are green (`−$41.19`). Standard luma turns that green into
 * mid-gray that contrast-stretch then washes out — twin Amazon returns lose
 * one amount. We gray with R/B (ignore G) and further darken green-chroma
 * pixels so credit amounts stay ink-dark.
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
    const greenness = g - (r + b) / 2
    // Mark Amex-style credit ink before invert so we can re-ink afterward.
    if (greenness > 10 && g > r + 8 && g > b + 5) {
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

    const imageData = ctx.getImageData(0, 0, width, height)
    processImageDataForOcr(imageData)

    ctx.putImageData(imageData, 0, 0)
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/png'),
    )
    return blob ?? file
  } catch {
    return file
  }
}
