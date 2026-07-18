let currentKey = ''

function isWaitingTitle(value = '') {
  return /^esperando confirmaci[oó]n$/i.test(String(value || '').trim())
}

function lockWaitingOverlay(root = document) {
  root.querySelectorAll?.('.qr-bilateral-overlay').forEach(layer => {
    const card = layer.querySelector('.qr-bilateral-card')
    const title = card?.querySelector('h3')?.textContent || ''
    if (!card || !isWaitingTitle(title)) return

    layer.dataset.qrWaitingLocked = '1'
    card.dataset.qrWaitingLocked = '1'
    card.querySelectorAll('.qr-bilateral-actions, button').forEach(element => element.remove())
  })
}

export function installQrTradeUi() {
  if (!document.getElementById('qr-bilateral-styles')) {
    const style = document.createElement('style')
    style.id = 'qr-bilateral-styles'
    style.textContent = '.qr-bilateral-overlay{position:fixed;inset:0;z-index:4100;display:grid;place-items:center;padding:22px;background:rgba(15,23,42,.62);backdrop-filter:blur(7px)}.qr-bilateral-card{width:min(100%,410px);padding:24px;border-radius:24px;background:#fff;color:#111827;text-align:center;box-shadow:0 24px 72px rgba(15,23,42,.38)}.qr-bilateral-card h3{margin:0;font-size:21px}.qr-bilateral-card p{margin:10px 0 0;color:#667085;font-size:12px;font-weight:700;line-height:1.55;white-space:pre-line}.qr-bilateral-summary{display:grid;gap:9px;margin-top:16px;text-align:left}.qr-bilateral-summary div{padding:11px 12px;border:1px solid #e2e7ef;border-radius:14px;background:#f8fafc}.qr-bilateral-summary strong{display:block;margin-bottom:4px;font-size:11px;color:#315bdc}.qr-bilateral-summary span{font-size:11px;font-weight:800;color:#475467}.qr-bilateral-actions{display:grid;grid-template-columns:1fr 1.25fr;gap:10px;margin-top:18px}.qr-bilateral-actions.one{grid-template-columns:1fr}.qr-bilateral-actions button{min-height:48px;border:1px solid #d8dee8;border-radius:15px;background:#fff;color:#475467;font-weight:900}.qr-bilateral-actions button.primary{border-color:#315bdc;background:#315bdc;color:#fff}.qr-bilateral-overlay[data-qr-waiting-locked="1"] .qr-bilateral-actions,.qr-bilateral-card[data-qr-waiting-locked="1"] button{display:none!important}'
    document.head.appendChild(style)
  }

  if (!window.__paniniQrWaitingGuard) {
    window.__paniniQrWaitingGuard = new MutationObserver(records => {
      records.forEach(record => {
        record.addedNodes.forEach(node => {
          if (node instanceof Element) lockWaitingOverlay(node.matches('.qr-bilateral-overlay') ? node.parentElement || document : node)
        })
      })
      lockWaitingOverlay(document)
    })
    window.__paniniQrWaitingGuard.observe(document.body, { childList: true, subtree: true })
  }

  lockWaitingOverlay(document)
}

export function closeQrOverlay() {
  document.querySelector('.qr-bilateral-overlay')?.remove()
  currentKey = ''
}

export function showQrOverlay({ key = '', title, message = '', receive = '', deliver = '', primary, secondary }) {
  if (key && key === currentKey && document.querySelector('.qr-bilateral-overlay')) return
  closeQrOverlay()
  currentKey = key

  const waitingLocked = isWaitingTitle(title)
  const layer = document.createElement('div')
  layer.className = 'qr-bilateral-overlay'
  if (waitingLocked) layer.dataset.qrWaitingLocked = '1'

  const card = document.createElement('div')
  card.className = 'qr-bilateral-card'
  if (waitingLocked) card.dataset.qrWaitingLocked = '1'

  const heading = document.createElement('h3')
  heading.textContent = title
  card.appendChild(heading)

  if (message) {
    const paragraph = document.createElement('p')
    paragraph.textContent = message
    card.appendChild(paragraph)
  }

  if (receive || deliver) {
    const summary = document.createElement('div')
    summary.className = 'qr-bilateral-summary'
    ;[['Tú recibes', receive], ['Tú entregas', deliver]].forEach(([label, value]) => {
      if (!value) return
      const row = document.createElement('div')
      const strong = document.createElement('strong')
      const span = document.createElement('span')
      strong.textContent = label
      span.textContent = value
      row.append(strong, span)
      summary.appendChild(row)
    })
    card.appendChild(summary)
  }

  const actions = waitingLocked ? [] : [secondary, primary].filter(Boolean)
  if (actions.length) {
    const box = document.createElement('div')
    box.className = `qr-bilateral-actions ${actions.length === 1 ? 'one' : ''}`
    actions.forEach(action => {
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = action.label
      if (action.primary) button.classList.add('primary')
      button.onclick = action.action
      box.appendChild(button)
    })
    card.appendChild(box)
  }

  layer.appendChild(card)
  document.body.appendChild(layer)
  lockWaitingOverlay(document)
}

export const normalizeSticker = value => ({ owned: Boolean(value?.owned), duplicates: Math.max(0, Number(value?.duplicates) || 0) })
export const sumQuantities = values => Object.values(values || {}).reduce((total, value) => total + Math.max(0, Number(value) || 0), 0)
export const formatCodes = codes => Array.from(new Set(codes || [])).join(', ') || 'Ninguna'
export const formatQuantities = values => Object.entries(values || {}).map(([code, qty]) => Number(qty) > 1 ? `${code} x${qty}` : code).join(', ') || 'Ninguna'
