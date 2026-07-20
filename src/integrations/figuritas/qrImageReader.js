const JSQR_SCRIPT = 'https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.min.js'
const MAX_IMAGE_BYTES = 20 * 1024 * 1024
const MAX_CANDIDATES = 32
let jsQrPromise = null

function loadJsQr() {
  if (globalThis.jsQR) return Promise.resolve(globalThis.jsQR)
  if (jsQrPromise) return jsQrPromise

  jsQrPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${JSQR_SCRIPT}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve(globalThis.jsQR), { once: true })
      existing.addEventListener('error', () => reject(new Error('No se pudo cargar el lector QR.')), { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = JSQR_SCRIPT
    script.async = true
    script.crossOrigin = 'anonymous'
    script.onload = () => resolve(globalThis.jsQR)
    script.onerror = () => reject(new Error('No se pudo cargar el lector QR.'))
    document.head.appendChild(script)
  })

  return jsQrPromise
}

async function loadBitmap(file) {
  if ('createImageBitmap' in window) return createImageBitmap(file)

  const objectUrl = URL.createObjectURL(file)
  try {
    const image = new Image()
    image.decoding = 'async'
    image.src = objectUrl
    await image.decode()
    return image
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000)
  }
}

function drawCanvas(bitmap, crop = null, outputSize = 0) {
  const sourceWidth = bitmap.width || bitmap.naturalWidth
  const sourceHeight = bitmap.height || bitmap.naturalHeight
  const area = crop || { x: 0, y: 0, w: sourceWidth, h: sourceHeight }
  const scale = outputSize
    ? outputSize / Math.max(area.w, area.h)
    : Math.min(1, 2000 / Math.max(area.w, area.h))
  const width = Math.max(1, Math.round(area.w * scale))
  const height = Math.max(1, Math.round(area.h * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { alpha: false, willReadFrequently: true })
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(bitmap, area.x, area.y, area.w, area.h, 0, 0, width, height)
  return canvas
}

function buildCandidateCanvases(bitmap) {
  const width = bitmap.width || bitmap.naturalWidth
  const height = bitmap.height || bitmap.naturalHeight
  const minSide = Math.min(width, height)
  const candidates = [drawCanvas(bitmap)]

  for (const factor of [0.92, 0.78, 0.64, 0.5, 0.38]) {
    const side = Math.max(180, minSide * factor)
    const maxX = Math.max(0, width - side)
    const maxY = Math.max(0, height - side)
    const xSteps = factor >= 0.78 ? 2 : 3
    const ySteps = height > width ? (factor >= 0.78 ? 4 : 6) : 3

    for (let xIndex = 0; xIndex < xSteps; xIndex += 1) {
      for (let yIndex = 0; yIndex < ySteps; yIndex += 1) {
        const x = xSteps === 1 ? 0 : maxX * (xIndex / (xSteps - 1))
        const y = ySteps === 1 ? 0 : maxY * (yIndex / (ySteps - 1))
        candidates.push(
          drawCanvas(bitmap, { x, y, w: side, h: side }, factor <= 0.64 ? 1500 : 1200)
        )
        if (candidates.length >= MAX_CANDIDATES) return candidates
      }
    }
  }

  return candidates
}

async function detectWithBarcodeDetector(canvases) {
  if (!('BarcodeDetector' in window)) return ''

  try {
    const detector = new window.BarcodeDetector({ formats: ['qr_code'] })
    for (const canvas of canvases) {
      const results = await detector.detect(canvas)
      if (results?.[0]?.rawValue) return results[0].rawValue
    }
  } catch {
    // jsQR remains available as a fallback.
  }

  return ''
}

async function detectWithJsQr(canvases) {
  const jsQR = await loadJsQr()

  for (const canvas of canvases) {
    const context = canvas.getContext('2d', { willReadFrequently: true })
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
    const result = jsQR(
      imageData.data,
      imageData.width,
      imageData.height,
      { inversionAttempts: 'attemptBoth' }
    )

    if (result?.data) return result.data
    await new Promise(resolve => window.setTimeout(resolve, 0))
  }

  return ''
}

export async function decodeQrFromImageFile(file) {
  if (!(file instanceof File)) {
    throw new Error('Selecciona una captura que contenga el QR.')
  }

  if (!file.type.startsWith('image/')) {
    throw new Error('El archivo seleccionado no es una imagen.')
  }

  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error('La imagen supera el límite de 20 MB.')
  }

  const bitmap = await loadBitmap(file)

  try {
    const candidates = buildCandidateCanvases(bitmap)
    const nativeResult = await detectWithBarcodeDetector(candidates)
    if (nativeResult) return nativeResult

    const jsQrResult = await detectWithJsQr(candidates)
    if (jsQrResult) return jsQrResult

    throw new Error(
      'No se encontró un QR legible. Usa una captura completa, nítida y sin recortar los bordes del código.'
    )
  } finally {
    bitmap?.close?.()
  }
}
