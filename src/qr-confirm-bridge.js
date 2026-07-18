function readCode(element) {
  return String(element.querySelector('small')?.textContent || '').trim().toUpperCase()
}

function readSelection() {
  const receiveCodes = Array.from(
    document.querySelectorAll('.qr-match-section.receive .qr-match-token.qr-selected')
  ).map(readCode).filter(Boolean)

  const deliverQuantities = {}
  document.querySelectorAll('.qr-match-section.deliver .qr-match-token.qr-selected').forEach(element => {
    const code = readCode(element)
    const label = String(element.getAttribute('aria-label') || '')
    const selectedMatch = label.match(/:\s*(\d+)\s+seleccionada/i)
    const available = Math.max(0, Number(element.dataset.qrAvailable) || 0)
    const badge = element.querySelector('.qr-match-count')
    const remaining = badge && badge.style.display !== 'none'
      ? Math.max(0, Number(badge.textContent) || 0)
      : 0
    const quantity = selectedMatch
      ? Math.max(0, Number(selectedMatch[1]) || 0)
      : Math.max(0, available - remaining)

    if (code && quantity > 0) deliverQuantities[code] = quantity
  })

  return { receiveCodes, deliverQuantities }
}

function readHostId() {
  try {
    return String(
      new URL(window.location.href).searchParams.get('qrUser') ||
      sessionStorage.getItem('panini_qr_partner') ||
      ''
    ).trim()
  } catch {
    return String(sessionStorage.getItem('panini_qr_partner') || '').trim()
  }
}

function handleWindowClick(event) {
  const target = event.target instanceof Element ? event.target : null
  const button = target?.closest('.panini-qr-match-confirm')
  if (!button || button.disabled) return

  const submit = window.paniniSubmitQrTrade
  if (typeof submit !== 'function') return

  const selection = readSelection()
  const deliveredTotal = Object.values(selection.deliverQuantities)
    .reduce((sum, quantity) => sum + Math.max(0, Number(quantity) || 0), 0)

  if (!selection.receiveCodes.length || !deliveredTotal) return

  event.preventDefault()
  event.stopPropagation()
  event.stopImmediatePropagation()

  void submit({
    hostId: readHostId(),
    receiveCodes: selection.receiveCodes,
    deliverQuantities: selection.deliverQuantities
  })
}

window.addEventListener('click', handleWindowClick, true)
