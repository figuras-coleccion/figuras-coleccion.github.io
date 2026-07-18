function replaceHeaderLogo(root = document) {
  root.querySelectorAll?.('svg.brand-logo, canvas.brand-logo').forEach(currentLogo => {
    const image = document.createElement('img')
    image.className = 'brand-logo'
    image.src = `${import.meta.env.BASE_URL || '/'}iconopanini2026album.svg`
    image.alt = 'Panini World Cup 2026 Sticker Tracker'
    image.decoding = 'async'
    image.loading = 'eager'
    image.dataset.paniniSvgLogo = '1'
    currentLogo.replaceWith(image)
  })
}

function fixDashboardButtons(root = document) {
  const albumButton = root.querySelector?.('.dashboard-actions .btn-primary')
  const reportButton = root.querySelector?.('.dashboard-actions .dashboard-report-button')

  if (albumButton && albumButton.dataset.labelFixed !== '1') {
    albumButton.textContent = '📖 Ver Álbum'
    albumButton.dataset.labelFixed = '1'
  }

  if (reportButton && reportButton.dataset.labelFixed !== '1') {
    reportButton.textContent = '📄 Reporte PDF'
    reportButton.dataset.labelFixed = '1'
  }

  if (!document.getElementById('dashboard-button-label-reset')) {
    const style = document.createElement('style')
    style.id = 'dashboard-button-label-reset'
    style.textContent = `
      .dashboard-actions .btn-primary,
      .dashboard-actions .dashboard-report-button {
        font-size: 12px !important;
        font-weight: 900 !important;
        line-height: 1 !important;
      }
      .dashboard-actions .btn-primary::after,
      .dashboard-actions .dashboard-report-button::after {
        content: none !important;
        display: none !important;
      }
    `
    document.head.appendChild(style)
  }
}

function applyUiFixes(root = document) {
  replaceHeaderLogo(root)
  fixDashboardButtons(root)
}

function start() {
  applyUiFixes(document)

  const observer = new MutationObserver(records => {
    records.forEach(record => {
      record.addedNodes.forEach(node => {
        if (node instanceof Element) {
          if (node.matches?.('svg.brand-logo, canvas.brand-logo')) {
            replaceHeaderLogo(node.parentElement || document)
          }
          applyUiFixes(node)
        }
      })
    })
  })

  observer.observe(document.body, { childList: true, subtree: true })
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true })
} else {
  start()
}
