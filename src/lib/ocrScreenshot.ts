import { createWorker, PSM } from 'tesseract.js'

/**
 * Client-side OCR for phone banking screenshots. Text feeds the same
 * statement parsers as PDF/CSV. Expect imperfect amounts — review queue is
 * the safety net.
 *
 * Dark-mode bank apps (white on navy) are inverted + upscaled before OCR so
 * Tesseract sees black text on white.
 */
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
    const { data } = imageData
    let lumaSum = 0
    const pixels = data.length / 4
    for (let i = 0; i < data.length; i += 4) {
      lumaSum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    }
    const avg = lumaSum / pixels
    const invert = avg < 128

    for (let i = 0; i < data.length; i += 4) {
      let y = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
      if (invert) y = 255 - y
      y = (y - 128) * 1.45 + 128
      y = Math.max(0, Math.min(255, y))
      data[i] = data[i + 1] = data[i + 2] = y
    }

    ctx.putImageData(imageData, 0, 0)
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/png'),
    )
    return blob ?? file
  } catch {
    return file
  }
}
