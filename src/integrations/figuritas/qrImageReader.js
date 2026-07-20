let jsQrPromise = null
let html5QrPromise = null
let hiddenReaderSequence = 0

function loadJsQr() {
  if (!jsQrPromise) {
    jsQrPromise = import('../../vendor/jsQR.js').then(module => module.default || module)
  }
  return jsQrPromise
}

function loadHtml5Qr() {
  if (!html5QrPromise) {
    html5QrPromise = import('html5-qrcode').then(module => module.Html5Qrcode)
  }
  return html5QrPromise
}

const MAX_IMAGE_BYTES = 20 * 1024 * 1024
const MAX_CANDIDATES = 96
const FAST_CANDIDATE_LIMIT = 34
const ENHANCED_CANDIDATE_LIMIT = 58
const HTML5_CANDIDATE_LIMIT = 8

function normalizeDecodedText(value) {
  return String(value || '')
    .replace(/^\uFEFF/, '')
    .replace(/[\u200B-\u200D\u2060]/g, '')
    .trim()
}

async function loadBitmap(file) {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' })
    } catch {
      return createImageBitmap(file)
    }
  }

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

function normalizeCrop(bitmap, crop = null) {
  const { width, height } = getBitmapSize(bitmap)
  if (!crop) return { x: 0, y: 0, w: width, h: height }

  const x = Math.max(0, Math.min(width - 1, Number(crop.x) || 0))
  const y = Math.max(0, Math.min(height - 1, Number(crop.y) || 0))
  const w = Math.max(1, Math.min(width - x, Number(crop.w) || width))
  const h = Math.max(1, Math.min(height - y, Number(crop.h) || height))
  return { x, y, w, h }
}

function createCanvas(
  bitmap,
  crop = null,
  {
    maximumSide = 2800,
    minimumSide = 0,
    maximumUpscale = 7,
    paddingRatio = 0,
    smoothing = 'auto'
  } = {}
) {
  const area = normalizeCrop(bitmap, crop)
  const longestSide = Math.max(area.w, area.h)
  const downscale = Math.min(1, maximumSide / longestSide)
  const upscale = minimumSide > 0 && longestSide < minimumSide
    ? Math.min(maximumUpscale, minimumSide / longestSide)
    : 1
  const scale = Math.min(maximumUpscale, Math.max(downscale, upscale))
  const drawingWidth = Math.max(1, Math.round(area.w * scale))
  const drawingHeight = Math.max(1, Math.round(area.h * scale))
  const padding = Math.max(0, Math.round(Math.min(drawingWidth, drawingHeight) * paddingRatio))

  const canvas = document.createElement('canvas')
  canvas.width = drawingWidth + (padding * 2)
  canvas.height = drawingHeight + (padding * 2)

  const context = canvas.getContext('2d', {
    alpha: false,
    willReadFrequently: true
  })

  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)

  // En capturas pequeñas el suavizado mezcla los módulos blancos y negros.
  // Vecino más cercano conserva la cuadrícula del QR al ampliar.
  const enableSmoothing = smoothing === 'auto' ? scale <= 1.15 : Boolean(smoothing)
  context.imageSmoothingEnabled = enableSmoothing
  if (enableSmoothing) context.imageSmoothingQuality = 'high'

  context.drawImage(
    bitmap,
    area.x,
    area.y,
    area.w,
    area.h,
    padding,
    padding,
    drawingWidth,
    drawingHeight
  )

  return canvas
}

function cloneCanvas(source) {
  const canvas = document.createElement('canvas')
  canvas.width = source.width
  canvas.height = source.height
  const context = canvas.getContext('2d', {
    alpha: false,
    willReadFrequently: true
  })
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, canvas.width, canvas.height)
  context.drawImage(source, 0, 0)
  return canvas
}

function getGrayHistogram(imageData) {
  const histogram = new Uint32Array(256)
  const gray = new Uint8Array(imageData.width * imageData.height)
  const data = imageData.data

  for (let pixel = 0, offset = 0; offset < data.length; pixel += 1, offset += 4) {
    const value = Math.max(
      0,
      Math.min(
        255,
        Math.round(
          (data[offset] * 0.299) +
          (data[offset + 1] * 0.587) +
          (data[offset + 2] * 0.114)
        )
      )
    )
    gray[pixel] = value
    histogram[value] += 1
  }

  return { gray, histogram }
}

function histogramPercentile(histogram, total, ratio) {
  const target = Math.max(0, Math.min(total - 1, Math.floor(total * ratio)))
  let accumulated = 0

  for (let value = 0; value < histogram.length; value += 1) {
    accumulated += histogram[value]
    if (accumulated > target) return value
  }

  return 255
}

function otsuThreshold(histogram, total) {
  let weightedSum = 0
  for (let value = 0; value < 256; value += 1) {
    weightedSum += value * histogram[value]
  }

  let backgroundWeight = 0
  let backgroundSum = 0
  let bestVariance = -1
  let threshold = 128

  for (let value = 0; value < 256; value += 1) {
    backgroundWeight += histogram[value]
    if (!backgroundWeight) continue

    const foregroundWeight = total - backgroundWeight
    if (!foregroundWeight) break

    backgroundSum += value * histogram[value]
    const backgroundMean = backgroundSum / backgroundWeight
    const foregroundMean = (weightedSum - backgroundSum) / foregroundWeight
    const variance = backgroundWeight * foregroundWeight *
      Math.pow(backgroundMean - foregroundMean, 2)

    if (variance > bestVariance) {
      bestVariance = variance
      threshold = value
    }
  }

  return threshold
}

function applyAdaptiveThreshold(gray, width, height, data) {
  const blockSize = Math.max(12, Math.round(Math.min(width, height) / 36))
  const bias = 8

  for (let blockY = 0; blockY < height; blockY += blockSize) {
    for (let blockX = 0; blockX < width; blockX += blockSize) {
      const endX = Math.min(width, blockX + blockSize)
      const endY = Math.min(height, blockY + blockSize)
      let sum = 0
      let count = 0

      for (let y = blockY; y < endY; y += 1) {
        const row = y * width
        for (let x = blockX; x < endX; x += 1) {
          sum += gray[row + x]
          count += 1
        }
      }

      const threshold = (sum / Math.max(1, count)) - bias

      for (let y = blockY; y < endY; y += 1) {
        const row = y * width
        for (let x = blockX; x < endX; x += 1) {
          const pixel = row + x
          const offset = pixel * 4
          const value = gray[pixel] <= threshold ? 0 : 255
          data[offset] = value
          data[offset + 1] = value
          data[offset + 2] = value
          data[offset + 3] = 255
        }
      }
    }
  }
}

function enhanceCanvas(source, mode) {
  const canvas = cloneCanvas(source)
  const context = canvas.getContext('2d', { willReadFrequently: true })
  const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
  const { gray, histogram } = getGrayHistogram(imageData)
  const total = gray.length
  const data = imageData.data

  if (mode === 'contrast') {
    const low = histogramPercentile(histogram, total, 0.02)
    const high = histogramPercentile(histogram, total, 0.98)
    const range = Math.max(20, high - low)

    for (let pixel = 0, offset = 0; pixel < gray.length; pixel += 1, offset += 4) {
      const stretched = Math.max(
        0,
        Math.min(255, Math.round(((gray[pixel] - low) * 255) / range))
      )
      data[offset] = stretched
      data[offset + 1] = stretched
      data[offset + 2] = stretched
      data[offset + 3] = 255
    }
  } else if (mode === 'threshold') {
    const threshold = otsuThreshold(histogram, total)

    for (let pixel = 0, offset = 0; pixel < gray.length; pixel += 1, offset += 4) {
      const value = gray[pixel] <= threshold ? 0 : 255
      data[offset] = value
      data[offset + 1] = value
      data[offset + 2] = value
      data[offset + 3] = 255
    }
  } else if (mode === 'adaptive') {
    applyAdaptiveThreshold(gray, imageData.width, imageData.height, data)
  } else if (mode === 'screen') {
    const low = histogramPercentile(histogram, total, 0.035)
    const high = histogramPercentile(histogram, total, 0.95)
    const range = Math.max(26, high - low)

    for (let pixel = 0, offset = 0; pixel < gray.length; pixel += 1, offset += 4) {
      const normalized = Math.max(0, Math.min(1, (gray[pixel] - low) / range))
      const curved = Math.pow(normalized, 0.72)
      const value = Math.max(0, Math.min(255, Math.round(curved * 255)))
      data[offset] = value
      data[offset + 1] = value
      data[offset + 2] = value
      data[offset + 3] = 255
    }
  }

  context.putImageData(imageData, 0, 0)
  return canvas
}

function cropKey(crop) {
  if (!crop) return 'full'
  return [crop.x, crop.y, crop.w, crop.h]
    .map(value => Math.round(value))
    .join(':')
}

function buildCandidateCrops(bitmap) {
  const { width, height } = getBitmapSize(bitmap)
  const minimumSide = Math.min(width, height)
  const candidates = [null]
  const seen = new Set(['full'])

  const addCrop = crop => {
    if (candidates.length >= MAX_CANDIDATES) return
    const normalized = normalizeCrop(bitmap, crop)
    const key = cropKey(normalized)
    if (seen.has(key)) return
    seen.add(key)
    candidates.push(normalized)
  }

  const addSquare = (sideFactor, xRatio, yRatio) => {
    const side = Math.max(130, Math.min(minimumSide, minimumSide * sideFactor))
    addCrop({
      x: Math.max(0, width - side) * xRatio,
      y: Math.max(0, height - side) * yRatio,
      w: side,
      h: side
    })
  }

  const addRectangle = (widthFactor, heightFactor, xRatio, yRatio) => {
    const cropWidth = Math.max(180, Math.min(width, width * widthFactor))
    const cropHeight = Math.max(180, Math.min(height, height * heightFactor))
    addCrop({
      x: Math.max(0, width - cropWidth) * xRatio,
      y: Math.max(0, height - cropHeight) * yRatio,
      w: cropWidth,
      h: cropHeight
    })
  }

  // Capturas verticales de Figuritas: el QR aparece normalmente centrado
  // y en la mitad superior. Estas ventanas van primero.
  if (height > width * 1.25) {
    for (const factor of [0.78, 0.7, 0.62, 0.56, 0.5]) {
      for (const yRatio of [0.06, 0.12, 0.18, 0.24, 0.31, 0.39, 0.48, 0.58]) {
        addSquare(factor, 0.5, yRatio)
      }
    }

    for (const widthFactor of [0.96, 0.84, 0.72]) {
      for (const heightFactor of [0.44, 0.52, 0.62]) {
        for (const yRatio of [0.04, 0.12, 0.22, 0.34, 0.48]) {
          addRectangle(widthFactor, heightFactor, 0.5, yRatio)
        }
      }
    }
  }

  // Fotografías de pantallas, publicaciones y recortes desplazados.
  for (const factor of [0.94, 0.82, 0.7, 0.6, 0.52, 0.44, 0.36]) {
    for (const xRatio of [0.08, 0.28, 0.5, 0.72, 0.92]) {
      for (const yRatio of [0.06, 0.22, 0.42, 0.62, 0.82, 0.96]) {
        addSquare(factor, xRatio, yRatio)
        if (candidates.length >= MAX_CANDIDATES) return candidates
      }
    }
  }

  return candidates
}

async function detectWithBarcodeDetector(source) {
  if (!('BarcodeDetector' in window)) return ''

  try {
    const detector = new window.BarcodeDetector({ formats: ['qr_code'] })
    const results = await detector.detect(source)
    return normalizeDecodedText(
      results?.find(result => result?.rawValue)?.rawValue || ''
    )
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
  return normalizeDecodedText(result?.data || '')
}

async function canvasToFile(canvas, name) {
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      value => value
        ? resolve(value)
        : reject(new Error('No se pudo preparar una variante del QR.')),
      'image/png',
      1
    )
  })

  return new File([blob], name, { type: 'image/png' })
}

async function detectWithHtml5Qr(file, timeoutMs = 4200) {
  let host = null
  let scanner = null
  let timeoutId = null

  try {
    const Html5Qrcode = await loadHtml5Qr()
    const elementId =
      `figuritas-hidden-qr-reader-${Date.now()}-${hiddenReaderSequence += 1}`

    host = document.createElement('div')
    host.id = elementId
    host.setAttribute('aria-hidden', 'true')
    host.style.position = 'fixed'
    host.style.left = '-10000px'
    host.style.top = '0'
    host.style.width = '8px'
    host.style.height = '8px'
    host.style.overflow = 'hidden'
    document.body.appendChild(host)

    scanner = new Html5Qrcode(elementId, false)
    const scanPromise = scanner
      .scanFile(file, true)
      .then(normalizeDecodedText)
      .catch(() => '')

    const timeoutPromise = new Promise(resolve => {
      timeoutId = window.setTimeout(() => resolve(''), timeoutMs)
    })

    return await Promise.race([scanPromise, timeoutPromise])
  } catch {
    return ''
  } finally {
    if (timeoutId) window.clearTimeout(timeoutId)

    if (scanner) {
      try {
        await scanner.clear()
      } catch {
        // La limpieza nunca debe reemplazar el resultado de lectura.
      }
    }

    host?.remove()
  }
}

function releaseCanvas(canvas) {
  if (!canvas) return
  canvas.width = 1
  canvas.height = 1
}

async function tryCanvas(canvas, enhanced = false) {
  const nativeResult = await detectWithBarcodeDetector(canvas)
  if (nativeResult) return nativeResult

  const jsQrResult = await detectWithJsQr(canvas)
  if (jsQrResult) return jsQrResult

  if (!enhanced) return ''

  for (const mode of ['contrast', 'screen', 'threshold', 'adaptive']) {
    const enhancedCanvas = enhanceCanvas(canvas, mode)

    try {
      const nativeEnhanced = await detectWithBarcodeDetector(enhancedCanvas)
      if (nativeEnhanced) return nativeEnhanced

      const result = await detectWithJsQr(enhancedCanvas)
      if (result) return result
    } finally {
      releaseCanvas(enhancedCanvas)
    }
  }

  return ''
}

function createCandidateCanvas(bitmap, crop, { enhanced = false } = {}) {
  const isCrop = Boolean(crop)

  return createCanvas(bitmap, crop, {
    maximumSide: isCrop ? 1900 : 3000,
    minimumSide: isCrop ? (enhanced ? 1250 : 1050) : 0,
    maximumUpscale: isCrop ? 7 : 1,
    paddingRatio: isCrop ? (enhanced ? 0.14 : 0.105) : 0,
    smoothing: isCrop ? false : 'auto'
  })
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
    const nativeBitmapResult = await detectWithBarcodeDetector(bitmap)
    if (nativeBitmapResult) return nativeBitmapResult

    const crops = buildCandidateCrops(bitmap)

    // Ruta rápida local. En recortes pequeños utiliza vecino más cercano para
    // conservar módulos QR que ocupan pocos píxeles en capturas comprimidas.
    for (
      let index = 0;
      index < Math.min(FAST_CANDIDATE_LIMIT, crops.length);
      index += 1
    ) {
      const canvas = createCandidateCanvas(bitmap, crops[index])

      try {
        const result = await tryCanvas(canvas, false)
        if (result) return result
      } finally {
        releaseCanvas(canvas)
      }

      if (index % 3 === 2) {
        await new Promise(resolve => window.setTimeout(resolve, 0))
      }
    }

    // ZXing sobre la imagen original puede resolver perspectiva o logotipo
    // central cuando jsQR no lo consigue.
    const html5Original = await detectWithHtml5Qr(file)
    if (html5Original) return html5Original

    // Ruta exhaustiva con contraste, umbral global y umbral adaptativo.
    for (
      let index = 0;
      index < Math.min(ENHANCED_CANDIDATE_LIMIT, crops.length);
      index += 1
    ) {
      const canvas = createCandidateCanvas(bitmap, crops[index], { enhanced: true })

      try {
        const result = await tryCanvas(canvas, true)
        if (result) return result
      } finally {
        releaseCanvas(canvas)
      }

      if (index % 2 === 1) {
        await new Promise(resolve => window.setTimeout(resolve, 0))
      }
    }

    // Último respaldo: ZXing sobre los recortes prioritarios ya ampliados y
    // con borde blanco. Se limita el número para no bloquear Safari/Brave.
    for (
      let index = 1;
      index < Math.min(HTML5_CANDIDATE_LIMIT + 1, crops.length);
      index += 1
    ) {
      const canvas = createCandidateCanvas(bitmap, crops[index], { enhanced: true })

      try {
        const candidateFile = await canvasToFile(
          canvas,
          `figuritas-qr-candidate-${index}.png`
        )
        const result = await detectWithHtml5Qr(candidateFile, 2600)
        if (result) return result
      } finally {
        releaseCanvas(canvas)
      }
    }

    throw new Error(
      'No se encontró un código QR legible dentro de la imagen. Usa una captura donde el QR se vea completo, con sus cuatro bordes, o una foto enfocada de la pantalla.'
    )
  } finally {
    bitmap?.close?.()
  }
}
