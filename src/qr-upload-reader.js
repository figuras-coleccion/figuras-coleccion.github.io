const JSQR_SCRIPT = 'https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.min.js'
const HTML5_QR_SCRIPT = 'https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js'

let jsQrPromise = null
let html5QrPromise = null
let activeFileKey = ''

function ensureStyles() {
  if (document.getElementById('panini-upload-reader-styles')) return

  const style = document.createElement('style')
  style.id = 'panini-upload-reader-styles'
  style.textContent = `
    .panini-upload-overlay {
      position: fixed;
      inset: 0;
      z-index: 2100;
      display: grid;
      place-items: center;
      padding: 20px;
      background: rgba(15, 23, 42, .66);
      backdrop-filter: blur(6px);
      -webkit-backdrop-filter: blur(6px);
    }
    .panini-upload-card {
      width: min(100%, 390px);
      padding: 28px 22px;
      border-radius: 24px;
      background: #fff;
      color: #111827;
      text-align: center;
      box-shadow: 0 24px 70px rgba(15, 23, 42, .34);
    }
    .panini-upload-spinner {
      width: 48px;
      height: 48px;
      margin: 0 auto 14px;
      border: 4px solid #dbe5ff;
      border-top-color: #315bdc;
      border-radius: 50%;
      animation: panini-upload-spin .75s linear infinite;
    }
    @keyframes panini-upload-spin { to { transform: rotate(360deg); } }
    .panini-upload-card h3 { margin: 0; font-size: 20px; line-height: 1.25; }
    .panini-upload-card p { margin: 9px 0 0; color: #64748b; font-size: 12px; font-weight: 700; line-height: 1.5; }
    .panini-upload-card.error h3 { color: #b42318; }
    .panini-upload-card button {
      width: 100%;
      min-height: 48px;
      margin-top: 18px;
      border-radius: 15px;
      background: #315bdc;
      color: #fff;
      font-size: 13px;
      font-weight: 900;
    }
    #panini-upload-html5-reader {
      position: fixed !important;
      left: -10000px !important;
      top: 0 !important;
      width: 1000px !important;
      height: 1000px !important;
      opacity: .01 !important;
      pointer-events: none !important;
      overflow: hidden !important;
      display: block !important;
    }
  `
  document.head.appendChild(style)
}

function loadScript(src, globalName) {
  if (window[globalName]) return Promise.resolve(window[globalName])

  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`)
    if (existing) {
      if (window[globalName]) {
        resolve(window[globalName])
        return
      }
      existing.addEventListener('load', () => resolve(window[globalName]), { once: true })
      existing.addEventListener('error', () => reject(new Error('No se pudo cargar el lector QR.')), { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = src
    script.async = true
    script.crossOrigin = 'anonymous'
    script.onload = () => resolve(window[globalName])
    script.onerror = () => reject(new Error('No se pudo cargar el lector QR.'))
    document.head.appendChild(script)
  })
}

function ensureJsQr() {
  if (!jsQrPromise) jsQrPromise = loadScript(JSQR_SCRIPT, 'jsQR')
  return jsQrPromise
}

function ensureHtml5Qr() {
  if (!html5QrPromise) html5QrPromise = loadScript(HTML5_QR_SCRIPT, 'Html5Qrcode')
  return html5QrPromise
}

function parsePartnerId(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''

  try {
    return String(new URL(raw).searchParams.get('qrUser') || '').trim()
  } catch {
    if (raw.startsWith('PANINI2026:')) return raw.slice('PANINI2026:'.length).trim()
    return /^[a-zA-Z0-9_-]{10,}$/.test(raw) ? raw : ''
  }
}

function showOverlay() {
  document.querySelector('.panini-upload-overlay')?.remove()
  const overlay = document.createElement('div')
  overlay.className = 'panini-upload-overlay'
  overlay.innerHTML = `
    <div class="panini-upload-card">
      <div class="panini-upload-spinner"></div>
      <h3>Buscando el código QR…</h3>
      <p>Analizando la captura y localizando el QR automáticamente.</p>
    </div>
  `
  document.body.appendChild(overlay)
  return overlay
}

function showError(overlay, message) {
  const card = overlay.querySelector('.panini-upload-card')
  card?.classList.add('error')
  overlay.querySelector('.panini-upload-spinner')?.remove()
  const title = overlay.querySelector('h3')
  const detail = overlay.querySelector('p')
  if (title) title.textContent = 'No se pudo leer el QR'
  if (detail) detail.textContent = message || 'Prueba con otra captura donde el código se vea completo.'

  if (card && !card.querySelector('button')) {
    const close = document.createElement('button')
    close.type = 'button'
    close.textContent = 'Cerrar'
    close.addEventListener('click', () => overlay.remove())
    card.appendChild(close)
  }
}

function openMatchWithoutReload(partnerId) {
  const url = new URL(window.location.href)
  const basePath = '/panini2026/'
  url.pathname = `${basePath}trade`
  url.searchParams.set('qrUser', partnerId)

  window.history.pushState({ ...(window.history.state || {}), paniniQrPartner: partnerId }, '', url.toString())
  window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }))
  window.dispatchEvent(new CustomEvent('panini:qr-partner', { detail: { partnerId } }))
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
    : Math.min(1, 1900 / Math.max(area.w, area.h))
  const width = Math.max(1, Math.round(area.w * scale))
  const height = Math.max(1, Math.round(area.h * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d', { alpha: false, willReadFrequently: true })
  context.fillStyle = '#fff'
  context.fillRect(0, 0, width, height)
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(bitmap, area.x, area.y, area.w, area.h, 0, 0, width, height)
  return canvas
}

function buildCandidateCanvases(bitmap) {
  const width = bitmap.width || bitmap.naturalWidth
  const height = bitmap.height || bitmap.naturalHeight
  const candidates = [drawCanvas(bitmap)]
  const minSide = Math.min(width, height)

  for (const factor of [0.9, 0.72, 0.54, 0.4]) {
    const side = Math.max(160, minSide * factor)
    const maxX = Math.max(0, width - side)
    const maxY = Math.max(0, height - side)
    const xSteps = factor >= 0.72 ? 2 : 3
    const ySteps = height > width ? (factor >= 0.72 ? 4 : 6) : 3

    for (let xi = 0; xi < xSteps; xi += 1) {
      for (let yi = 0; yi < ySteps; yi += 1) {
        const x = xSteps === 1 ? 0 : maxX * (xi / (xSteps - 1))
        const y = ySteps === 1 ? 0 : maxY * (yi / (ySteps - 1))
        candidates.push(drawCanvas(bitmap, { x, y, w: side, h: side }, factor <= 0.54 ? 1350 : 1100))
        if (candidates.length >= 30) return candidates
      }
    }
  }

  return candidates
}

async function detectNative(canvases) {
  if (!('BarcodeDetector' in window)) return ''
  try {
    const detector = new window.BarcodeDetector({ formats: ['qr_code'] })
    for (const canvas of canvases) {
      const results = await detector.detect(canvas)
      if (results?.[0]?.rawValue) return results[0].rawValue
    }
  } catch {
    // Se continúa con los lectores alternativos.
  }
  return ''
}

async function detectJsQr(canvases) {
  const jsQR = await ensureJsQr().catch(() => null)
  if (!jsQR) return ''

  for (const canvas of canvases) {
    const context = canvas.getContext('2d', { willReadFrequently: true })
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height)
    const result = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'attemptBoth' })
    if (result?.data) return result.data
    await new Promise(resolve => window.setTimeout(resolve, 0))
  }
  return ''
}

async function safeClear(scanner) {
  if (!scanner || typeof scanner.clear !== 'function') return
  try {
    const result = scanner.clear()
    if (result && typeof result.then === 'function') await result
  } catch {
    // El lector puede no haberse montado todavía.
  }
}

async function detectHtml5(file) {
  const Html5Qrcode = await ensureHtml5Qr().catch(() => null)
  if (!Html5Qrcode) return ''

  let reader = document.getElementById('panini-upload-html5-reader')
  if (!reader) {
    reader = document.createElement('div')
    reader.id = 'panini-upload-html5-reader'
    document.body.appendChild(reader)
  }

  const scanner = new Html5Qrcode('panini-upload-html5-reader', false)
  try {
    const decoded = await scanner.scanFile(file, true)
    await safeClear(scanner)
    return decoded || ''
  } catch {
    await safeClear(scanner)
    return ''
  }
}

async function decodeUploadedImage(file) {
  const bitmap = await loadBitmap(file)
  try {
    const canvases = buildCandidateCanvases(bitmap)
    const nativeResult = await detectNative(canvases)
    if (nativeResult) return nativeResult

    const jsResult = await detectJsQr(canvases)
    if (jsResult) return jsResult

    const html5Result = await detectHtml5(file)
    if (html5Result) return html5Result

    throw new Error('No se encontró un código QR legible dentro de la imagen.')
  } finally {
    bitmap?.close?.()
  }
}

async function processFile(file) {
  const key = `${file.name}:${file.size}:${file.lastModified}`
  if (activeFileKey === key) return
  activeFileKey = key

  document.querySelector('.qr-scanner-head button')?.click()
  const overlay = showOverlay()

  try {
    const decoded = await decodeUploadedImage(file)
    const partnerId = parsePartnerId(decoded)
    if (!partnerId) throw new Error('El QR fue leído, pero no pertenece a una cuenta válida de Panini 2026.')

    overlay.querySelector('.panini-upload-spinner')?.remove()
    const title = overlay.querySelector('h3')
    const detail = overlay.querySelector('p')
    if (title) title.textContent = 'QR leído correctamente'
    if (detail) detail.textContent = 'Conectando las dos cuentas y comparando álbumes…'

    openMatchWithoutReload(partnerId)
    window.setTimeout(() => overlay.remove(), 450)
  } catch (error) {
    console.error('Error leyendo la captura QR:', error)
    showError(overlay, error?.message || 'Prueba con otra captura donde el QR se vea completo.')
  } finally {
    window.setTimeout(() => {
      if (activeFileKey === key) activeFileKey = ''
    }, 1000)
  }
}

function handleUploadedQr(event) {
  const input = event.target
  if (!(input instanceof HTMLInputElement) || !input.classList.contains('qr-file-input')) return

  const file = input.files?.[0]
  input.value = ''
  if (!file) return

  event.preventDefault()
  event.stopImmediatePropagation()
  void processFile(file)
}

ensureStyles()
document.addEventListener('change', handleUploadedQr, true)
