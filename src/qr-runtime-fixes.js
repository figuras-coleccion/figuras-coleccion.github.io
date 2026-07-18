const QR_SCANNER_SCRIPT = 'https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js'
let runtimeQrLibraryPromise = null
let processingFileKey = ''

function ensureRuntimeStyles() {
  if (document.getElementById('panini-qr-runtime-styles')) return
  const style = document.createElement('style')
  style.id = 'panini-qr-runtime-styles'
  style.textContent = `
    .qr-file-reader,
    #panini-runtime-file-reader {
      position: fixed !important;
      left: -10000px !important;
      top: 0 !important;
      width: 420px !important;
      height: 420px !important;
      min-width: 420px !important;
      min-height: 420px !important;
      overflow: hidden !important;
      opacity: .01 !important;
      pointer-events: none !important;
      z-index: -1 !important;
      display: block !important;
    }
    .qr-runtime-actions {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 9px;
      margin-top: 10px;
    }
    .qr-runtime-actions button {
      width: 100%;
      min-height: 48px;
      padding: 10px 12px;
      border-radius: 15px;
      font-size: 12px;
      font-weight: 900;
      touch-action: manipulation;
    }
    .qr-runtime-settings {
      border: 1px solid #315bdc;
      background: #315bdc;
      color: #fff;
    }
    .qr-runtime-retry {
      border: 1px solid #cbd5e1;
      background: #fff;
      color: #334155;
    }
    .qr-runtime-overlay,
    .qr-runtime-guide-overlay {
      position: fixed;
      inset: 0;
      z-index: 1400;
      display: grid;
      place-items: center;
      padding: 20px;
      background: rgba(15,23,42,.62);
      backdrop-filter: blur(5px);
    }
    .qr-runtime-card,
    .qr-runtime-guide {
      width: min(100%, 390px);
      border-radius: 24px;
      background: #fff;
      box-shadow: 0 24px 70px rgba(15,23,42,.32);
      color: #111827;
    }
    .qr-runtime-card {
      padding: 28px 22px;
      display: grid;
      justify-items: center;
      gap: 10px;
      text-align: center;
    }
    .qr-runtime-card strong { font-size: 18px; }
    .qr-runtime-card small { color:#64748b; font-size:11px; font-weight:700; line-height:1.45; }
    .qr-runtime-spinner {
      width: 46px;
      height: 46px;
      border: 4px solid #dbe5ff;
      border-top-color: #315bdc;
      border-radius: 50%;
      animation: panini-qr-spin .75s linear infinite;
    }
    @keyframes panini-qr-spin { to { transform: rotate(360deg); } }
    .qr-runtime-guide {
      position: relative;
      padding: 26px 20px 20px;
    }
    .qr-runtime-guide h3 { margin:0 44px 14px 0; font-size:21px; line-height:1.2; }
    .qr-runtime-guide ol { margin:0; padding-left:22px; color:#334155; font-size:13px; font-weight:700; line-height:1.55; }
    .qr-runtime-guide li + li { margin-top:8px; }
    .qr-runtime-guide p { margin:16px 0; padding:11px 12px; border-radius:13px; background:#f8fafc; color:#64748b; font-size:11px; font-weight:700; line-height:1.45; }
    .qr-runtime-guide-close {
      position:absolute;
      top:12px;
      right:12px;
      width:38px;
      height:38px;
      border-radius:50%;
      background:#eef1f6;
      color:#111827;
      font-size:20px;
      font-weight:900;
    }
    .qr-runtime-guide-retry {
      width:100%;
      min-height:48px;
      border-radius:15px;
      background:#315bdc;
      color:#fff;
      font-size:13px;
      font-weight:900;
    }
    .qr-runtime-error { color:#b42318 !important; }
    @media (max-width:520px) {
      .qr-runtime-actions { grid-template-columns:1fr; }
    }
  `
  document.head.appendChild(style)
}

function ensureQrLibrary() {
  if (window.Html5Qrcode) return Promise.resolve(window.Html5Qrcode)
  if (runtimeQrLibraryPromise) return runtimeQrLibraryPromise

  runtimeQrLibraryPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${QR_SCANNER_SCRIPT}"]`)
    if (existing) {
      if (window.Html5Qrcode) {
        resolve(window.Html5Qrcode)
        return
      }
      existing.addEventListener('load', () => resolve(window.Html5Qrcode), { once: true })
      existing.addEventListener('error', () => reject(new Error('No se pudo cargar el lector QR.')), { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = QR_SCANNER_SCRIPT
    script.async = true
    script.crossOrigin = 'anonymous'
    script.onload = () => resolve(window.Html5Qrcode)
    script.onerror = () => reject(new Error('No se pudo cargar el lector QR.'))
    document.head.appendChild(script)
  })

  return runtimeQrLibraryPromise
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

function getDeviceInfo() {
  const ua = navigator.userAgent || ''
  const isIOS = /iPad|iPhone|iPod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const isAndroid = /Android/i.test(ua)
  const isBrave = Boolean(navigator.brave) || /Brave/i.test(ua)
  const isChrome = /CriOS|Chrome/i.test(ua) && !isBrave
  const isFirefox = /FxiOS|Firefox/i.test(ua)
  const isSafari = isIOS && /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua) && !isBrave

  if (isBrave) return { isIOS, isAndroid, browser: 'Brave', packageName: 'com.brave.browser' }
  if (isChrome) return { isIOS, isAndroid, browser: 'Chrome', packageName: 'com.android.chrome' }
  if (isFirefox) return { isIOS, isAndroid, browser: 'Firefox', packageName: 'org.mozilla.firefox' }
  if (isSafari) return { isIOS, isAndroid, browser: 'Safari', packageName: '' }
  return { isIOS, isAndroid, browser: 'navegador', packageName: '' }
}

function showPermissionGuide() {
  document.querySelector('.qr-runtime-guide-overlay')?.remove()
  const device = getDeviceInfo()
  const overlay = document.createElement('div')
  overlay.className = 'qr-runtime-guide-overlay'

  const steps = device.isIOS
    ? [
        `Abre Ajustes del iPhone y entra en Apps > ${device.browser}.`,
        'Activa Cámara.',
        'Vuelve a Panini 2026 y pulsa Reintentar cámara.'
      ]
    : device.isAndroid
      ? [
          `Abre Información de la app de ${device.browser}.`,
          'Entra en Permisos > Cámara.',
          'Selecciona Permitir mientras se usa la aplicación.'
        ]
      : [
          'Abre la configuración o permisos del sitio en el navegador.',
          'Permite la cámara para eliparck-ai.github.io.',
          'Vuelve y pulsa Reintentar cámara.'
        ]

  overlay.innerHTML = `
    <div class="qr-runtime-guide">
      <button type="button" class="qr-runtime-guide-close" aria-label="Cerrar">×</button>
      <h3>Permitir cámara en ${device.browser}</h3>
      <ol>${steps.map(step => `<li>${step}</li>`).join('')}</ol>
      <p>${device.isIOS ? 'iOS no siempre permite abrir desde una web el permiso exacto. El botón intentará abrir Ajustes; si no lo hace, sigue estos pasos.' : 'El botón intentará abrir directamente la configuración de la aplicación.'}</p>
      <button type="button" class="qr-runtime-guide-retry">Reintentar cámara</button>
    </div>
  `
  document.body.appendChild(overlay)

  overlay.querySelector('.qr-runtime-guide-close')?.addEventListener('click', () => overlay.remove())
  overlay.querySelector('.qr-runtime-guide-retry')?.addEventListener('click', () => {
    overlay.remove()
    retryCamera()
  })

  try {
    if (device.isIOS) {
      window.location.href = 'app-settings:'
    } else if (device.isAndroid && device.packageName) {
      window.location.href = `intent:#Intent;action=android.settings.APPLICATION_DETAILS_SETTINGS;data=package:${device.packageName};end`
    }
  } catch (error) {
    console.warn('No se pudo abrir Ajustes directamente:', error)
  }
}

function retryCamera() {
  const closeButton = document.querySelector('.qr-scanner-head button')
  closeButton?.click()
  window.setTimeout(() => {
    document.querySelector('.qr-scan-button')?.click()
  }, 280)
}

function injectPermissionActions() {
  const errorBox = document.querySelector('.qr-scanner-error')
  if (!errorBox || errorBox.parentElement?.querySelector('.qr-runtime-actions')) return

  const actions = document.createElement('div')
  actions.className = 'qr-runtime-actions'
  actions.innerHTML = `
    <button type="button" class="qr-runtime-settings">⚙ Abrir ajustes de cámara</button>
    <button type="button" class="qr-runtime-retry">↻ Reintentar cámara</button>
  `
  errorBox.insertAdjacentElement('afterend', actions)
  actions.querySelector('.qr-runtime-settings')?.addEventListener('click', showPermissionGuide)
  actions.querySelector('.qr-runtime-retry')?.addEventListener('click', retryCamera)
}

function showProcessingOverlay(message = 'Leyendo código QR…') {
  document.querySelector('.qr-runtime-overlay')?.remove()
  const overlay = document.createElement('div')
  overlay.className = 'qr-runtime-overlay'
  overlay.innerHTML = `
    <div class="qr-runtime-card">
      <span class="qr-runtime-spinner"></span>
      <strong>${message}</strong>
      <small>Al terminar se abrirá automáticamente la ventana de match.</small>
    </div>
  `
  document.body.appendChild(overlay)
  return overlay
}

async function canvasToFile(canvas, name) {
  const blob = await new Promise((resolve, reject) => {
    canvas.toBlob(value => value ? resolve(value) : reject(new Error('No se pudo preparar la imagen.')), 'image/png', 1)
  })
  return new File([blob], name, { type: 'image/png' })
}

async function createVariants(file) {
  const variants = [file]
  let bitmap = null
  try {
    bitmap = await createImageBitmap(file)
    const side = Math.min(bitmap.width, bitmap.height)
    const crops = [
      { x: 0, y: 0, w: bitmap.width, h: bitmap.height, name: 'full' },
      { x: (bitmap.width - side) / 2, y: (bitmap.height - side) / 2, w: side, h: side, name: 'center' }
    ]
    for (const crop of crops) {
      const size = Math.min(1600, Math.max(900, Math.round(Math.max(crop.w, crop.h))))
      const canvas = document.createElement('canvas')
      canvas.width = size
      canvas.height = size
      const ctx = canvas.getContext('2d', { alpha: false })
      ctx.fillStyle = '#fff'
      ctx.fillRect(0, 0, size, size)
      ctx.imageSmoothingEnabled = true
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(bitmap, crop.x, crop.y, crop.w, crop.h, 0, 0, size, size)
      variants.push(await canvasToFile(canvas, `qr-${crop.name}.png`))
    }
  } catch (error) {
    console.warn('No se pudieron crear variantes de la imagen QR:', error)
  } finally {
    bitmap?.close?.()
  }
  return variants
}

async function decodeFile(file) {
  if ('BarcodeDetector' in window) {
    try {
      const detector = new window.BarcodeDetector({ formats: ['qr_code'] })
      const bitmap = await createImageBitmap(file)
      const results = await detector.detect(bitmap)
      bitmap.close?.()
      if (results?.[0]?.rawValue) return results[0].rawValue
    } catch (error) {
      console.warn('BarcodeDetector no pudo leer el QR:', error)
    }
  }

  const Html5Qrcode = await ensureQrLibrary()
  let reader = document.getElementById('panini-runtime-file-reader')
  if (!reader) {
    reader = document.createElement('div')
    reader.id = 'panini-runtime-file-reader'
    document.body.appendChild(reader)
  }

  const variants = await createVariants(file)
  let lastError = null
  for (const variant of variants) {
    const scanner = new Html5Qrcode('panini-runtime-file-reader', false)
    try {
      const value = await scanner.scanFile(variant, true)
      await scanner.clear().catch(() => {})
      return value
    } catch (error) {
      lastError = error
      await scanner.clear().catch(() => {})
    }
  }
  throw lastError || new Error('No se encontró un QR legible en la imagen.')
}

function openMatch(partnerId) {
  const base = '/panini2026/'
  window.location.assign(`${window.location.origin}${base}trade?qrUser=${encodeURIComponent(partnerId)}`)
}

async function processUploadedQr(file) {
  const key = `${file.name}:${file.size}:${file.lastModified}`
  if (processingFileKey === key) return
  processingFileKey = key
  const overlay = showProcessingOverlay()

  try {
    const decoded = await decodeFile(file)
    const partnerId = parsePartnerId(decoded)
    if (!partnerId) throw new Error('La imagen no contiene un QR válido de Panini 2026.')
    overlay.querySelector('strong').textContent = 'QR leído. Abriendo match…'
    openMatch(partnerId)
  } catch (error) {
    console.error('Error procesando foto QR:', error)
    overlay.querySelector('.qr-runtime-spinner')?.remove()
    const title = overlay.querySelector('strong')
    const detail = overlay.querySelector('small')
    title.textContent = 'No se pudo leer el QR'
    title.classList.add('qr-runtime-error')
    detail.textContent = error?.message || 'Prueba con una imagen más nítida y donde el QR se vea completo.'
    window.setTimeout(() => overlay.remove(), 4200)
  } finally {
    window.setTimeout(() => {
      if (processingFileKey === key) processingFileKey = ''
    }, 5000)
  }
}

function handleFileChangeCapture(event) {
  const input = event.target
  if (!(input instanceof HTMLInputElement) || !input.classList.contains('qr-file-input')) return
  const file = input.files?.[0]
  if (!file) return
  void processUploadedQr(file)
}

function startQrRuntimeFixes() {
  ensureRuntimeStyles()
  document.addEventListener('change', handleFileChangeCapture, true)
  const observer = new MutationObserver(() => injectPermissionActions())
  observer.observe(document.documentElement, { childList: true, subtree: true })
  injectPermissionActions()
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startQrRuntimeFixes, { once: true })
} else {
  startQrRuntimeFixes()
}
