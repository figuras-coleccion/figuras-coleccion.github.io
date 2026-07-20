import { auth, db, ref, get, update } from './firebase'
import { getAlbumChildPath, getStoredActiveAlbumId } from './albums/runtime'
import { buildAbsoluteAppUrl, ALBUM_ROUTE } from './appRoutes.js'

const state = {
  partnerId: '',
  receive: new Set(),
  deliver: new Map(),
  processing: false,
  initializedCard: null
}

let syncFrame = 0

function ensureStyles() {
  if (document.getElementById('panini-qr-selection-styles')) return

  const style = document.createElement('style')
  style.id = 'panini-qr-selection-styles'
  style.textContent = `
    .qr-match-token.qr-selectable{position:relative;cursor:pointer;pointer-events:auto!important;user-select:none;-webkit-user-select:none;touch-action:manipulation;-webkit-tap-highlight-color:transparent;transition:transform .14s ease}
    .qr-match-token.qr-selectable:active{transform:scale(.95)}
    .qr-match-token.qr-selected .qr-match-token-shape{background:#69778c!important;color:#fff!important;box-shadow:0 0 0 4px rgba(49,91,220,.20),0 8px 20px rgba(49,91,220,.18)}
    .qr-match-token.qr-selected small{color:#315bdc}
    .qr-selected-check{position:absolute;left:-6px;top:-6px;z-index:35;display:grid;place-items:center;min-width:25px;height:25px;padding:0 5px;border-radius:999px;border:2px solid #fff;background:#17a86b;color:#fff;font-size:11px;line-height:1;font-weight:900;font-style:normal;box-shadow:0 5px 13px rgba(23,168,107,.28)}
    .panini-qr-match-confirm:disabled{opacity:1!important;border-color:#d8dee8!important;background:#dfe5ee!important;color:#fff!important;cursor:not-allowed!important;box-shadow:none!important}
    .panini-qr-match-confirm.qr-ready{border-color:#315bdc!important;background:#315bdc!important;color:#fff!important;cursor:pointer!important;box-shadow:0 7px 18px rgba(49,91,220,.22)!important}
    .panini-qr-match-confirm.qr-processing{border-color:#315bdc!important;background:#315bdc!important;color:#fff!important;opacity:.76!important;cursor:wait!important}
    .panini-qr-trade-result{position:fixed;inset:0;z-index:2200;display:grid;place-items:center;padding:20px;background:rgba(15,23,42,.66);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
    .panini-qr-trade-result-card{width:min(100%,390px);padding:28px 22px;border-radius:24px;background:#fff;color:#111827;text-align:center;box-shadow:0 24px 70px rgba(15,23,42,.34)}
    .panini-qr-trade-result-icon{width:58px;height:58px;margin:0 auto 12px;display:grid;place-items:center;border-radius:50%;background:#17a86b;color:#fff;font-size:30px;font-weight:900}
    .panini-qr-trade-result-card h3{margin:0;font-size:21px;line-height:1.25}.panini-qr-trade-result-card p{margin:8px 0 0;color:#64748b;font-size:12px;font-weight:700;line-height:1.5}
    .panini-qr-trade-result-card.error h3{color:#b42318}.panini-qr-trade-result-card.error .panini-qr-trade-result-icon{background:#dc2626}
    .panini-qr-trade-result-card button{width:100%;min-height:48px;margin-top:18px;border-radius:15px;background:#315bdc;color:#fff;font-size:13px;font-weight:900}
    .manual-trade-page.panini-qr-match-active .qr-own-card{display:none!important}
  `
  document.head.appendChild(style)
}

function partnerIdFromUrl() {
  try {
    return new URL(window.location.href).searchParams.get('qrUser') || ''
  } catch {
    return ''
  }
}

function codeFromToken(token) {
  return String(token.querySelector('small')?.textContent || '').trim().toUpperCase()
}

function availableFromToken(token) {
  const stored = Number(token.dataset.qrAvailable)
  if (Number.isFinite(stored) && stored >= 0) return stored

  const badgeValue = Number(String(token.querySelector('.qr-match-count')?.textContent || '0').trim())
  const available = Math.max(0, Number.isFinite(badgeValue) ? badgeValue : 0)
  token.dataset.qrAvailable = String(available)
  return available
}

function counts() {
  return {
    receive: state.receive.size,
    deliver: Array.from(state.deliver.values()).reduce((sum, value) => sum + value, 0)
  }
}

function ensureActionBar() {
  const page = document.querySelector('.manual-trade-page')
  const tabs = page?.querySelector('.trade-mode-tabs')
  if (!page || !tabs) return null

  let bar = page.querySelector('.panini-qr-match-actions')
  if (!bar) {
    bar = document.createElement('div')
    bar.className = 'panini-qr-match-actions'
    bar.innerHTML = '<button type="button" class="panini-qr-match-cancel">Cancelar</button><button type="button" class="panini-qr-match-confirm" disabled>Confirmar trueque</button>'
    tabs.insertAdjacentElement('afterend', bar)
  }
  return bar
}

function updateConfirmButton() {
  const button = document.querySelector('.panini-qr-match-confirm')
  if (!button) return

  const total = counts()
  const ready = total.receive > 0 && total.deliver > 0 && !state.processing
  const desiredText = state.processing
    ? 'Actualizando…'
    : (total.receive || total.deliver)
      ? `Confirmar · Recibes ${total.receive} · Entregas ${total.deliver}`
      : 'Confirmar trueque'

  if (button.disabled === ready) button.disabled = !ready
  button.classList.toggle('qr-ready', ready)
  button.classList.toggle('qr-processing', state.processing)
  if (button.textContent !== desiredText) button.textContent = desiredText
}

function ensureCountBadge(token) {
  const wrap = token.querySelector('.qr-match-token-wrap')
  if (!wrap) return null

  let badge = wrap.querySelector('.qr-match-count')
  if (!badge) {
    badge = document.createElement('i')
    badge.className = 'qr-match-count'
    wrap.appendChild(badge)
  }
  return badge
}

function paintToken(token) {
  const code = token.dataset.qrCode
  const mode = token.dataset.qrMode
  const wrap = token.querySelector('.qr-match-token-wrap')
  if (!code || !mode || !wrap) return

  wrap.querySelector('.qr-selected-check')?.remove()
  token.classList.remove('qr-selected')

  if (mode === 'receive') {
    const selected = state.receive.has(code)
    token.setAttribute('aria-pressed', selected ? 'true' : 'false')
    token.setAttribute('aria-label', `${selected ? 'Quitar' : 'Seleccionar'} ${code} para recibir`)

    const countBadge = wrap.querySelector('.qr-match-count')
    if (countBadge) countBadge.style.display = 'none'

    if (selected) {
      token.classList.add('qr-selected')
      const check = document.createElement('i')
      check.className = 'qr-selected-check'
      check.textContent = '✓'
      wrap.appendChild(check)
    }
    return
  }

  const available = availableFromToken(token)
  const quantity = state.deliver.get(code) || 0
  const remaining = Math.max(0, available - quantity)
  const countBadge = ensureCountBadge(token)

  token.setAttribute('aria-pressed', quantity > 0 ? 'true' : 'false')
  token.setAttribute('aria-label', quantity > 0
    ? `${code}: ${quantity} seleccionada${quantity === 1 ? '' : 's'} para entregar; ${remaining} disponible${remaining === 1 ? '' : 's'}`
    : `${code}: ${available} disponible${available === 1 ? '' : 's'} para entregar`)

  if (countBadge) {
    const shouldShow = quantity === 0 ? available >= 2 : available >= 2 && remaining > 0
    countBadge.textContent = String(quantity === 0 ? available : remaining)
    countBadge.style.display = shouldShow ? 'grid' : 'none'
  }

  if (quantity > 0) {
    token.classList.add('qr-selected')
    const check = document.createElement('i')
    check.className = 'qr-selected-check'
    check.textContent = '✓'
    wrap.appendChild(check)
  }
}

function configureToken(token, mode) {
  if (!token) return

  const code = codeFromToken(token)
  if (!code) return

  const alreadyConfigured = token.dataset.qrSelectionReady === '1'

  if (!token.dataset.qrAvailable) {
    const initialBadge = token.querySelector('.qr-match-count')
    token.dataset.qrAvailable = String(Math.max(0, Number(initialBadge?.textContent || 0) || 0))
  }

  token.dataset.qrSelectionReady = '1'
  token.dataset.qrMode = mode
  token.dataset.qrCode = code
  token.classList.add('qr-selectable')
  token.setAttribute('role', 'button')
  token.setAttribute('tabindex', '0')

  if (!alreadyConfigured) paintToken(token)
}

function resetState() {
  state.partnerId = ''
  state.receive = new Set()
  state.deliver = new Map()
  state.processing = false
  state.initializedCard = null
}

function configureMatch(card) {
  const page = document.querySelector('.manual-trade-page')

  if (!card) {
    page?.classList.remove('panini-qr-match-active')
    page?.querySelector('.panini-qr-match-actions')?.remove()
    if (state.initializedCard && !document.body.contains(state.initializedCard)) resetState()
    return false
  }

  ensureActionBar()
  page?.classList.add('panini-qr-match-active')

  if (state.initializedCard !== card) {
    resetState()
    state.partnerId = partnerIdFromUrl()
    state.initializedCard = card
  }

  card.querySelectorAll('.qr-match-section.receive .qr-match-token').forEach(token => configureToken(token, 'receive'))
  card.querySelectorAll('.qr-match-section.deliver .qr-match-token').forEach(token => configureToken(token, 'deliver'))
  updateConfirmButton()
  return true
}

function scheduleSync() {
  if (syncFrame) return
  syncFrame = window.requestAnimationFrame(() => {
    syncFrame = 0
    configureMatch(document.querySelector('.qr-match-card'))
  })
}

function selectToken(token) {
  if (state.processing) return

  const section = token.closest('.qr-match-section')
  const mode = section?.classList.contains('receive') ? 'receive' : section?.classList.contains('deliver') ? 'deliver' : ''
  configureToken(token, mode)

  const code = token.dataset.qrCode
  if (!mode || !code) return

  if (mode === 'receive') {
    if (state.receive.has(code)) state.receive.delete(code)
    else state.receive.add(code)
  } else {
    const available = availableFromToken(token)
    if (available <= 0) return

    const current = state.deliver.get(code) || 0
    const next = current >= available ? 0 : current + 1
    if (next === 0) state.deliver.delete(code)
    else state.deliver.set(code, next)
  }

  paintToken(token)
  updateConfirmButton()
}

function clearPartnerQuery() {
  try {
    const url = new URL(window.location.href)
    url.searchParams.delete('qrUser')
    window.history.replaceState(window.history.state || {}, '', url.toString())
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }))
  } catch {
    // La limpieza del URL no debe bloquear la interfaz.
  }
}

function cancelMatch() {
  resetState()
  clearPartnerQuery()

  const tabs = document.querySelectorAll('.manual-trade-page .trade-mode-tabs button')
  if (tabs.length < 2) return

  tabs[0].click()
  window.setTimeout(() => tabs[1]?.click(), 80)
}

function showResult(success, title, message) {
  document.querySelector('.panini-qr-trade-result')?.remove()

  const overlay = document.createElement('div')
  overlay.className = 'panini-qr-trade-result'
  overlay.innerHTML = `<div class="panini-qr-trade-result-card ${success ? '' : 'error'}"><div class="panini-qr-trade-result-icon">${success ? '✓' : '!'}</div><h3>${title}</h3><p>${message}</p>${success ? '' : '<button type="button">Cerrar</button>'}</div>`
  document.body.appendChild(overlay)

  if (!success) overlay.querySelector('button')?.addEventListener('click', () => overlay.remove(), { once: true })
}

async function confirmTrade() {
  if (state.processing) return

  const total = counts()
  if (total.receive === 0 || total.deliver === 0) return

  const currentUser = auth.currentUser
  if (!currentUser?.uid) {
    showResult(false, 'No se pudo confirmar', 'Tu sesión no está disponible. Vuelve a iniciar sesión.')
    return
  }

  state.processing = true
  updateConfirmButton()

  try {
    const stickersPath = getAlbumChildPath(currentUser.uid, 'stickers', getStoredActiveAlbumId())
    const snapshot = await get(ref(db, stickersPath))
    const current = snapshot.exists() ? snapshot.val() || {} : {}
    const changes = {}
    let received = 0
    let delivered = 0

    state.receive.forEach(code => {
      const item = current[code] || { owned: false, duplicates: 0 }
      if (item.owned) return
      changes[`${stickersPath}/${code}`] = {
        owned: true,
        duplicates: Math.max(0, Number(item.duplicates) || 0)
      }
      received += 1
    })

    state.deliver.forEach((requested, code) => {
      const item = current[code] || { owned: false, duplicates: 0 }
      const available = Math.max(0, Number(item.duplicates) || 0)
      const quantity = Math.min(available, Math.max(0, Number(requested) || 0))
      if (!item.owned || quantity <= 0) return

      changes[`${stickersPath}/${code}`] = {
        owned: true,
        duplicates: available - quantity
      }
      delivered += quantity
    })

    if (received === 0 || delivered === 0) {
      throw new Error('El álbum cambió. Vuelve a escanear el QR y selecciona nuevamente.')
    }

    await update(ref(db), changes)
    showResult(true, 'Trueque QR exitoso', `${received} recibida${received === 1 ? '' : 's'} · ${delivered} entregada${delivered === 1 ? '' : 's'}. Figuritas actualizadas.`)
    window.setTimeout(() => window.location.assign(buildAbsoluteAppUrl(ALBUM_ROUTE, '?trade=success')), 1400)
  } catch (error) {
    console.error('Error confirmando trueque QR:', error)
    state.processing = false
    updateConfirmButton()
    showResult(false, 'No se pudo confirmar el trueque', error?.message || 'Revisa tu conexión e inténtalo nuevamente.')
  }
}

function handleClick(event) {
  const target = event.target instanceof Element ? event.target : null
  if (!target) return

  const cancel = target.closest('.panini-qr-match-cancel')
  if (cancel) {
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    cancelMatch()
    return
  }

  const token = target.closest('.qr-match-card .qr-match-token')
  if (token) {
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    selectToken(token)
    return
  }

  const confirm = target.closest('.panini-qr-match-confirm')
  if (confirm) {
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    void confirmTrade()
    return
  }

  const tab = target.closest('.trade-mode-tabs button')
  if (tab) {
    const tabs = Array.from(tab.parentElement?.querySelectorAll('button') || [])
    if (tabs.indexOf(tab) === 0) resetState()
    window.setTimeout(scheduleSync, 0)
  }
}

function handleKeydown(event) {
  const target = event.target instanceof Element ? event.target : null
  const token = target?.closest('.qr-match-card .qr-match-token')
  if (!token || (event.key !== 'Enter' && event.key !== ' ')) return
  event.preventDefault()
  selectToken(token)
}

function start() {
  ensureStyles()
  document.addEventListener('click', handleClick, true)
  document.addEventListener('keydown', handleKeydown, true)

  const observer = new MutationObserver(scheduleSync)
  observer.observe(document.body, { childList: true, subtree: true })

  window.addEventListener('popstate', scheduleSync)
  window.addEventListener('panini:qr-partner', scheduleSync)
  scheduleSync()
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true })
} else {
  start()
}
