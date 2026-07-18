function installTradeTabOrderStyles() {
  if (document.getElementById('panini-trade-default-qr-styles')) return

  const style = document.createElement('style')
  style.id = 'panini-trade-default-qr-styles'
  style.textContent = `
    .manual-trade-page .trade-mode-tabs {
      display: flex;
    }

    .manual-trade-page .trade-mode-tabs > button:first-child {
      order: 2;
    }

    .manual-trade-page .trade-mode-tabs > button:nth-child(2) {
      order: 1;
    }

    .manual-trade-page.panini-qr-initializing {
      visibility: hidden !important;
    }
  `
  document.head.appendChild(style)
}

function revealWhenQrIsReady(page, qrButton, attempt = 0) {
  if (!page || !qrButton || !document.body.contains(page)) return

  if (qrButton.getAttribute('aria-selected') === 'true') {
    page.classList.remove('panini-qr-initializing')
    return
  }

  if (attempt >= 8) {
    page.classList.remove('panini-qr-initializing')
    return
  }

  window.requestAnimationFrame(() => revealWhenQrIsReady(page, qrButton, attempt + 1))
}

function activateQrByDefault() {
  document.querySelectorAll('.manual-trade-page .trade-mode-tabs').forEach(tabs => {
    if (tabs.dataset.paniniDefaultQrReady === '1') return

    const buttons = Array.from(tabs.querySelectorAll(':scope > button'))
    const qrButton = buttons.find(button => /trueque\s*qr/i.test(button.textContent || '')) || buttons[1]
    const page = tabs.closest('.manual-trade-page')
    if (!qrButton || !page) return

    tabs.dataset.paniniDefaultQrReady = '1'
    page.classList.add('panini-qr-initializing')

    if (qrButton.getAttribute('aria-selected') !== 'true') qrButton.click()
    revealWhenQrIsReady(page, qrButton)
  })
}

function syncTradeTabs() {
  installTradeTabOrderStyles()
  activateQrByDefault()
}

function start() {
  syncTradeTabs()

  const observer = new MutationObserver(syncTradeTabs)
  observer.observe(document.body, { childList: true, subtree: true })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true })
} else {
  start()
}
