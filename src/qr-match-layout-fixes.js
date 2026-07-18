const RESTORE_QR_MODE_KEY = 'panini_restore_qr_mode'

function ensureStyles() {
  if (document.getElementById('panini-qr-match-layout-styles')) return
  const style = document.createElement('style')
  style.id = 'panini-qr-match-layout-styles'
  style.textContent = `
    :root{--panini-trade-sticky-top:0px;--panini-trade-tabs-height:64px}
    .manual-trade-page .trade-mode-tabs.panini-trade-tabs-sticky{position:sticky!important;top:var(--panini-trade-sticky-top)!important;z-index:120!important;margin-bottom:14px!important;box-shadow:0 9px 24px rgba(15,23,42,.10)!important;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
    .manual-trade-page.panini-qr-match-active .qr-own-card,.manual-trade-page.panini-qr-match-active .qr-scan-again{display:none!important}
    .panini-qr-match-actions{position:sticky;top:calc(var(--panini-trade-sticky-top) + var(--panini-trade-tabs-height) + 7px);z-index:118;display:grid;grid-template-columns:.85fr 1.15fr;gap:9px;width:100%;margin:-5px 0 14px;padding:9px;border:1px solid #dfe4ec;border-radius:18px;background:rgba(255,255,255,.96);box-shadow:0 9px 24px rgba(15,23,42,.10);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px)}
    .panini-qr-match-actions button{width:100%;min-height:46px;border-radius:14px;font-size:12px;font-weight:900;touch-action:manipulation;-webkit-tap-highlight-color:transparent}
    .panini-qr-match-cancel{border:1px solid #d6dce6;background:#f8fafc;color:#475467}.panini-qr-match-confirm{border:1px solid #315bdc;background:#315bdc;color:#fff;box-shadow:0 7px 18px rgba(49,91,220,.22)}
    .panini-qr-match-active .qr-match-card{margin-top:0!important}
    @media(max-width:520px){.panini-qr-match-actions{grid-template-columns:.82fr 1.18fr;gap:7px;padding:7px;border-radius:16px}.panini-qr-match-actions button{min-height:43px;padding:7px 8px;font-size:10.5px;border-radius:12px}}
  `
  document.head.appendChild(style)
}

function updateMetrics() {
  const header = document.querySelector('.app-header')
  let stickyTop = 0
  if (header) {
    const position = window.getComputedStyle(header).position
    if (position === 'fixed' || position === 'sticky') stickyTop = Math.max(0, Math.round(header.getBoundingClientRect().bottom))
  }
  document.documentElement.style.setProperty('--panini-trade-sticky-top', `${stickyTop}px`)
  const tabs = document.querySelector('.manual-trade-page .trade-mode-tabs')
  if (tabs) document.documentElement.style.setProperty('--panini-trade-tabs-height', `${Math.ceil(tabs.getBoundingClientRect().height)}px`)
}

function restoreQrMode() {
  if (sessionStorage.getItem(RESTORE_QR_MODE_KEY) !== '1') return
  const tabs = document.querySelectorAll('.manual-trade-page .trade-mode-tabs button')
  if (tabs.length < 2) return
  sessionStorage.removeItem(RESTORE_QR_MODE_KEY)
  if (!tabs[1].classList.contains('active')) tabs[1].click()
}

function cancelMatch() {
  sessionStorage.setItem(RESTORE_QR_MODE_KEY, '1')
  const url = new URL(window.location.href)
  url.searchParams.delete('qrUser')
  window.location.replace(url.toString())
}

function ensureActionBar(page, tabs) {
  let bar = page.querySelector('.panini-qr-match-actions')
  if (bar) return bar
  bar = document.createElement('div')
  bar.className = 'panini-qr-match-actions'
  bar.innerHTML = '<button type="button" class="panini-qr-match-cancel">Cancelar</button><button type="button" class="panini-qr-match-confirm" disabled>Confirmar trueque</button>'
  tabs.insertAdjacentElement('afterend', bar)
  bar.querySelector('.panini-qr-match-cancel')?.addEventListener('click', cancelMatch, { once: true })
  return bar
}

function sync() {
  const page = document.querySelector('.manual-trade-page')
  const tabs = page?.querySelector('.trade-mode-tabs')
  if (!page || !tabs) return false

  tabs.classList.add('panini-trade-tabs-sticky')
  if (!tabs.dataset.paniniSyncReady) {
    tabs.dataset.paniniSyncReady = '1'
    tabs.addEventListener('click', () => window.setTimeout(sync, 0))
  }
  restoreQrMode()

  const match = page.querySelector('.qr-match-card')
  const currentBar = page.querySelector('.panini-qr-match-actions')
  if (match) {
    page.classList.add('panini-qr-match-active')
    ensureActionBar(page, tabs)
  } else {
    page.classList.remove('panini-qr-match-active')
    currentBar?.remove()
  }
  updateMetrics()
  return Boolean(match)
}

function start() {
  ensureStyles()
  if (sync()) return

  const observer = new MutationObserver(() => {
    if (sync()) observer.disconnect()
  })
  observer.observe(document.body, { childList: true, subtree: true })
  window.setTimeout(() => observer.disconnect(), 120000)

  window.addEventListener('resize', updateMetrics, { passive: true })
  window.addEventListener('orientationchange', () => window.setTimeout(updateMetrics, 180), { passive: true })
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true })
else start()
