let jsQrPromise = null

function loadJsQr() {
  if (!jsQrPromise) {
    jsQrPromise = import('../../vendor/jsQR.js').then(module => module.default || module)
  }
  return jsQrPromise
}

const MAX_IMAGE_BYTES = 20 * 1024 * 1024
const MAX_CANDIDATES = 30

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

function getBitmapSize(bitmap) {
  return {
    width: bitmap.width || bitmap.naturalWidth,
    height: bitmap.height || bitmap.naturalHeight
  }
}

function createCanvas(bitmap, crop = null, maximumSide = 2600) {
  const { width: sourceWidth, height: sourceHeight } = getBitmapSize(bitmap)
  const area = crop || { x: 0, y: 0, w: sourceWidth, h: sourceHeight }
  const longestSide = Math.max(area.w, area.h)
  const scale = Math.min(1, maximumSide / longestSide)
  const width = Math.max(1, Math.round(area.w * scale))
  const height = Math.max(1, Math.round(area.h * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const context = canvas.getContext('2d', {
    alpha: false,
    willReadFrequently: true
  })

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, width, height)
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(
    bitmap,
    area.x,
    area.y,
    area.w,
    area.h,
    0,
    0,
    width,
    height
  )

  return canvas
}

function cropKey(crop) {
  return [crop.x, crop.y, crop.w, crop.h]
    .map(value => Math.round(value))
    .join(':')
}

function buildCandidateCrops(bitmap) {
  const { width, height } = getBitmapSize(bitmap)
  const minimumSide = Math.min(width, height)
  const candidates = [null]
  const seen = new Set()

  const addSquare = (sideFactor, xRatio, yRatio) => {
    if (candidates.length >= MAX_CANDIDATES) return

    const side = Math.max(240, Math.min(minimumSide, minimumSide * sideFactor))
    const crop = {
      x: Math.max(0, width - side) * xRatio,
      y: Math.max(0, height - side) * yRatio,
      w: side,
      h: side
    }
    const key = cropKey(crop)
    if (seen.has(key)) return
    seen.add(key)
    candidates.push(crop)
  }

  // Capturas verticales de Figuritas: QR centrado en zona media o inferior.
  for (const yRatio of [0.18, 0.32, 0.46, 0.58, 0.68, 0.78, 0.9]) {
    addSquare(0.72, 0.5, yRatio)
  }
  for (const yRatio of [0.12, 0.3, 0.48, 0.64, 0.8, 1]) {
    addSquare(0.88, 0.5, yRatio)
  }
  for (const yRatio of [0.2, 0.42, 0.62, 0.82]) {
    addSquare(0.58, 0.5, yRatio)
  }

  // Barrido adicional para capturas recortadas o QR desplazados.
  for (const factor of [0.78, 0.62, 0.48]) {
    for (const xRatio of [0.12, 0.5, 0.88]) {
      for (const yRatio of height > width ? [0.18, 0.5, 0.82] : [0.12, 0.5, 0.88]) {
        addSquare(factor, xRatio, yRatio)
        if (candidates.length >= MAX_CANDIDATES) return candidates
      }
    }
  }

  return candidates
}

async function detectWithBarcodeDetector(canvas) {
  if (!('BarcodeDetector' in window)) return ''

  try {
    const detector = new window.BarcodeDetector({ formats: ['qr_code'] })
    const results = await detector.detect(canvas)
    return results?.find(result => result?.rawValue)?.rawValue || ''
  } catch {
    return ''
  }
}

async function detectWithJsQr(canvas) {
  const jsQR = await loadJsQr()
  const context = canvas.getContext('2d', { willReadFrequently: true })
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
  const result = jsQR(
    imageData.data,
    imageData.width,
    imageData.height,
    { inversionAttempts: 'attemptBoth' }
  )
  return result?.data || ''
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
    const crops = buildCandidateCrops(bitmap)

    for (let index = 0; index < crops.length; index += 1) {
      const crop = crops[index]
      const canvas = createCanvas(bitmap, crop, crop ? 1900 : 2800)

      const nativeResult = await detectWithBarcodeDetector(canvas)
      if (nativeResult) return nativeResult

      const jsQrResult = await detectWithJsQr(canvas)
      if (jsQrResult) return jsQrResult

      canvas.width = 1
      canvas.height = 1
      await new Promise(resolve => window.setTimeout(resolve, 0))
    }

    throw new Error(
      'No se encontró un QR legible dentro de la captura. Verifica que el código se vea completo, nítido y con sus cuatro bordes.'
    )
  } finally {
    bitmap?.close?.()
  }
}
