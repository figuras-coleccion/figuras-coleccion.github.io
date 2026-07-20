function ensureRuntimeStyles() {
  if (document.getElementById('panini-qr-runtime-styles')) return

  const style = document.createElement('style')
  style.id = 'panini-qr-runtime-styles'
  style.textContent = `
    .qr-file-reader {
      position: fixed !important;
      left: -10000px !important;
      top: 0 !important;
      width: 8px !important;
      height: 8px !important;
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
    .qr-runtime-guide {
      position: relative;
      width: min(100%, 390px);
      padding: 26px 20px 20px;
      border-radius: 24px;
      background: #fff;
      box-shadow: 0 24px 70px rgba(15,23,42,.32);
      color: #111827;
    }
    .qr-runtime-guide h3 {
      margin: 0 44px 14px 0;
      font-size: 21px;
      line-height: 1.2;
    }
    .qr-runtime-guide ol {
      margin: 0;
      padding-left: 22px;
      color: #334155;
      font-size: 13px;
      font-weight: 700;
      line-height: 1.55;
    }
    .qr-runtime-guide li + li { margin-top: 8px; }
    .qr-runtime-guide p {
      margin: 16px 0;
      padding: 11px 12px;
      border-radius: 13px;
      background: #f8fafc;
      color: #64748b;
      font-size: 11px;
      font-weight: 700;
      line-height: 1.45;
    }
    .qr-runtime-guide-close {
      position: absolute;
      top: 12px;
      right: 12px;
      width: 38px;
      height: 38px;
      border-radius: 50%;
      background: #eef1f6;
      color: #111827;
      font-size: 20px;
      font-weight: 900;
    }
    .qr-runtime-guide-retry {
      width: 100%;
      min-height: 48px;
      border-radius: 15px;
      background: #315bdc;
      color: #fff;
      font-size: 13px;
      font-weight: 900;
    }
    @media (max-width:520px) {
      .qr-runtime-actions { grid-template-columns: 1fr; }
    }
  `
  document.head.appendChild(style)
}

function getDeviceInfo() {
  const ua = navigator.userAgent || ''
  const isIOS = /iPad|iPhone|iPod/i.test(ua) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  const isAndroid = /Android/i.test(ua)
  const isBrave = Boolean(navigator.brave) || /Brave/i.test(ua)
  const isChrome = /CriOS|Chrome/i.test(ua) && !isBrave
  const isFirefox = /FxiOS|Firefox/i.test(ua)
  const isSafari = isIOS &&
    /Safari/i.test(ua) &&
    !/CriOS|FxiOS|EdgiOS|OPiOS/i.test(ua) &&
    !isBrave

  if (isBrave) return { isIOS, isAndroid, browser: 'Brave', packageName: 'com.brave.browser' }
  if (isChrome) return { isIOS, isAndroid, browser: 'Chrome', packageName: 'com.android.chrome' }
  if (isFirefox) return { isIOS, isAndroid, browser: 'Firefox', packageName: 'org.mozilla.firefox' }
  if (isSafari) return { isIOS, isAndroid, browser: 'Safari', packageName: '' }
  return { isIOS, isAndroid, browser: 'navegador', packageName: '' }
}

function retryCamera() {
  const closeButton = document.querySelector('.qr-scanner-head button')
  closeButton?.click()

  window.setTimeout(() => {
    document.querySelector('.qr-scan-button')?.click()
  }, 280)
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
        'Vuelve a Figuras Colección y pulsa Reintentar cámara.'
      ]
    : device.isAndroid
      ? [
          `Abre Información de la app de ${device.browser}.`,
          'Entra en Permisos > Cámara.',
          'Selecciona Permitir mientras se usa la aplicación.'
        ]
      : [
          'Abre la configuración o permisos del sitio en el navegador.',
          'Permite la cámara para figuras-coleccion.github.io.',
          'Vuelve y pulsa Reintentar cámara.'
        ]

  overlay.innerHTML = `
    <div class="qr-runtime-guide">
      <button type="button" class="qr-runtime-guide-close" aria-label="Cerrar">×</button>
      <h3>Permitir cámara en ${device.browser}</h3>
      <ol>${steps.map(step => `<li>${step}</li>`).join('')}</ol>
      <p>${
        device.isIOS
          ? 'iOS no siempre permite abrir desde una web el permiso exacto. Si el botón no abre Ajustes, sigue los pasos anteriores.'
          : 'El botón intentará abrir directamente la configuración de la aplicación.'
      }</p>
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
      window.location.href =
        `intent:#Intent;action=android.settings.APPLICATION_DETAILS_SETTINGS;data=package:${device.packageName};end`
    }
  } catch (error) {
    console.warn('No se pudo abrir Ajustes directamente:', error)
  }
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

function startQrRuntimeFixes() {
  ensureRuntimeStyles()

  const observer = new MutationObserver(() => injectPermissionActions())
  observer.observe(document.documentElement, { childList: true, subtree: true })
  injectPermissionActions()
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startQrRuntimeFixes, { once: true })
} else {
  startQrRuntimeFixes()
}
