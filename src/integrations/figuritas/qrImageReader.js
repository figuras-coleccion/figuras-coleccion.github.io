const HTML5_QR_SCRIPT = 'https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js'
const JSQR_SCRIPT = 'https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.min.js'
const MAX_IMAGE_BYTES = 20 * 1024 * 1024
const MAX_CANVAS_CANDIDATES = 36
const MAX_HTML5_CANDIDATES = 18
let html5QrPromise = null
let jsQrPromise = null

function loadScriptOnce(src, globalName, currentPromise, setPromise, errorMessage) {
  if (globalThis[globalName]) return Promise.resolve(globalThis[globalName])
  if (currentPromise) return currentPromise

  const promise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`)
    if (existing) {
      if (globalThis[globalName]) {
        resolve(globalThis[globalName])
        return
      }
      existing.addEventListener('load', () => resolve(globalThis[globalName]), { once: true })
      existing.addEventListener('error', () => reject(new Error(errorMessage)), { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.crossOrigin = 'anonymous'
    script.onload = () => resolve(globalThis[globalName])
    script.onerror = () => reject(new Error(errorMessage))
    document.head.appendChild(script)
  })

  setPromise(promise)
  return promise
}

function loadHtml5Qr() {
  return loadScriptOnce(
    HTML5_QR_SCRIPT,
    'Html5Qrcode',
    html5QrPromise,
    value => { html5QrPromise = value },
    'No se pudo cargar el lector avanzado de QR.'
  )
}

function loadJsQr() {
  return loadScriptOnce(
    JSQR_SCRIPT,
    'jsQR',
    jsQrPromise,
    value => { jsQrPromise = value },
    'No se pudo cargar el lector QR alternativo.'
  )
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
  const longestSide = Math.max(area.w, area.h)
  const targetLongestSide = outputSize || Math.min(2800, Math.max(1800, longestSide))
  const scale = targetLongestSide / longestSide
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

function uniqueCropKey(crop) {
  return [crop.x, crop.y, crop.w, crop.h].map(value => Math.round(value)).join(':')
}

function buildCandidateCanvases(bitmap) {
  const width = bitmap.width || bitmap.naturalWidth
  const height = bitmap.height || bitmap.naturalHeight
  const minSide = Math.min(width, height)
  const candidates = [drawCanvas(bitmap, null, Math.min(3000, Math.max(width, height)))]
  const seen = new Set()

  const addSquare = (sideFactor, xRatio, yRatio, outputSize = 1800) => {
    if (candidates.length >= MAX_CANVAS_CANDIDATES) return
    const side = Math.max(220, Math.min(minSide, minSide * sideFactor))
    const maxX = Math.max(0, width - side)
    const maxY = Math.max(0, height - side)
    const crop = {
      x: maxX * xRatio,
      y: maxY * yRatio,
      w: side,
      h: side
    }
    const key = uniqueCropKey(crop)
    if (seen.has(key)) return
    seen.add(key)
    candidates.push(drawCanvas(bitmap, crop, outputSize))
  }

  // Capturas verticales de apps: el QR suele ocupar el centro superior.
  for (const yRatio of [0.12, 0.18, 0.24, 0.3, 0.38, 0.48]) {
    addSquare(0.66, 0.5, yRatio, 2000)
  }
  for (const yRatio of [0.08, 0.18, 0.28, 0.4]) {
    addSquare(0.78, 0.5, yRatio, 1900)
  }
  for (const yRatio of [0.08, 0.2, 0.34, 0.5]) {
    addSquare(0.56, 0.5, yRatio, 2100)
  }

  // Barrido adicional para capturas recortadas o QR desplazados.
  for (const factor of [0.88, 0.7, 0.5, 0.38]) {
    const xRatios = factor >= 0.7 ? [0, 0.5, 1] : [0.15, 0.5, 0.85]
    const yRatios = height > width
      ? [0, 0.18, 0.36, 0.58, 0.82]
      : [0, 0.5, 1]

    for (const xRatio of xRatios) {
      for (const yRatio of yRatios) {
        addSquare(factor, xRatio, yRatio, factor <= 0.5 ? 2200 : 1800)
        if (candidates.length >= MAX_CANVAS_CANDIDATES) return candidates
      }
    }
  }

  return candidates
}

function canvasToFile(canvas, index) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) {
        reject(new Error('No se pudo preparar una región de la captura.'))
        return
      }
      resolve(new File([blob], `qr-region-${index}.png`, { type: 'image/png' }))
    }, 'image/png', 1)
  })
}

function createHiddenReaderHost() {
  const id = `figuritas-qr-reader-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const host = document.createElement('div')
  host.id = id
  host.setAttribute('aria-hidden', 'true')
  Object.assign(host.style, {
    position: 'fixed',
    left: '-10000px',
    top: '0',
    width: '2px',
    height: '2px',
    overflow: 'hidden',
    opacity: '0',
    pointerEvents: 'none'
  })
  document.body.appendChild(host)
  return { id, host }
}

async function detectWithHtml5Qr(file, canvases) {
  let Html5Qrcode
  try {
    Html5Qrcode = await loadHtml5Qr()
  } catch {
    return ''
  }
  if (!Html5Qrcode) return ''

  const { id, host } = createHiddenReaderHost()
  const scanner = new Html5Qrcode(id, false)

  try {
    try {
      const result = await scanner.scanFile(file, false)
      if (result) return result
    } catch {
      // La captura completa puede contener demasiada interfaz. Se prueban regiones.
    }

    const candidateCount = Math.min(canvases.length, MAX_HTML5_CANDIDATES)
    for (let index = 1; index < candidateCount; index += 1) {
      try {
        const candidateFile = await canvasToFile(canvases[index], index)
        const result = await scanner.scanFile(candidateFile, false)
        if (result) return result
      } catch {
        // Es normal que varias regiones no contengan el QR.
      }
      await new Promise(resolve => window.setTimeout(resolve, 0))
    }
  } finally {
    try {
      await scanner.clear()
    } catch {
      // La limpieza no debe ocultar una lectura correcta.
    }
    host.remove()
  }

  return ''
}

async function detectWithBarcodeDetector(canvases) {
  if (!('BarcodeDetector' in window)) return ''

  try {
    const detector = new window.BarcodeDetector({ formats: ['qr_code'] })
    for (const canvas of canvases) {
      const results = await detector.detect(canvas)
      const rawValue = results?.find(result => result?.rawValue)?.rawValue
      if (rawValue) return rawValue
      await new Promise(resolve => window.setTimeout(resolve, 0))
    }
  } catch {
    // Los otros motores permanecen disponibles.
  }

  return ''
}

async function detectWithJsQr(canvases) {
  let jsQR
  try {
    jsQR = await loadJsQr()
  } catch {
    return ''
  }
  if (!jsQR) return ''

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

    // Mismo motor empleado por Trueque QR, primero sobre la captura completa
    // y luego sobre recortes automáticos de la pantalla.
    const html5Result = await detectWithHtml5Qr(file, candidates)
    if (html5Result) return html5Result

    const nativeResult = await detectWithBarcodeDetector(candidates)
    if (nativeResult) return nativeResult

    const jsQrResult = await detectWithJsQr(candidates)
    if (jsQrResult) return jsQrResult

    throw new Error(
      'No se encontró un QR legible dentro de la captura. Verifica que el código se vea completo, nítido y con sus cuatro bordes.'
    )
  } finally {
    bitmap?.close?.()
  }
}
