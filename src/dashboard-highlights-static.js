function albumUrlFor(code) {
  const base = import.meta.env.BASE_URL || '/'
  return `${base}album?q=${encodeURIComponent(code)}`
}

function prepareHighlights() {
  document.querySelectorAll('.collector-highlights-list .collector-highlight-row').forEach(row => {
    row.classList.add('collector-highlight-static')
    row.tabIndex = -1
    row.setAttribute('aria-disabled', 'true')
    row.removeAttribute('title')

    row.querySelectorAll('.collector-highlight-recent-codes b').forEach(chip => {
      const code = String(chip.textContent || '').trim().toUpperCase()
      if (!code) return
      chip.classList.add('collector-highlight-code-link')
      chip.dataset.stickerCode = code
      chip.setAttribute('role', 'link')
      chip.setAttribute('tabindex', '0')
      chip.setAttribute('aria-label', `Abrir ${code} en el álbum`)
    })
  })
}

function openChip(chip, event) {
  const code = String(chip?.dataset?.stickerCode || '').trim().toUpperCase()
  if (!code) return
  event?.preventDefault()
  event?.stopPropagation()
  event?.stopImmediatePropagation()
  window.location.assign(albumUrlFor(code))
}

function start() {
  document.addEventListener('click', event => {
    const chip = event.target.closest('.collector-highlight-code-link')
    if (chip) {
      openChip(chip, event)
      return
    }

    const row = event.target.closest('.collector-highlights-list .collector-highlight-row')
    if (!row) return
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
  }, true)

  document.addEventListener('keydown', event => {
    const chip = event.target.closest('.collector-highlight-code-link')
    if (chip && (event.key === 'Enter' || event.key === ' ')) {
      openChip(chip, event)
      return
    }

    const row = event.target.closest('.collector-highlights-list .collector-highlight-row')
    if (row && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
    }
  }, true)

  const observer = new MutationObserver(prepareHighlights)
  observer.observe(document.body, { childList: true, subtree: true })
  prepareHighlights()
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true })
} else {
  start()
}
