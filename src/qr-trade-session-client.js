import { onAuthStateChanged } from 'firebase/auth'
import { onValue, push } from 'firebase/database'
import { auth, db, ref, get, update } from './firebase'
import { DEFAULT_ALBUM_ID } from './albums/constants'
import { getAlbumChildPath, getStoredActiveAlbumId, isProfileUsingAlbum } from './albums/runtime'

let sending = false
let hostOff = null
let guestOff = null
let activeHost = null

const sum = values => Object.values(values || {}).reduce((total, value) => total + Math.max(0, Number(value) || 0), 0)
const codeOf = token => String(token.querySelector('small')?.textContent || '').trim().toUpperCase()
const cleanSticker = value => ({ owned: Boolean(value?.owned), duplicates: Math.max(0, Number(value?.duplicates) || 0) })

function belongsToActiveAlbum(session = {}) {
  const activeAlbumId = getStoredActiveAlbumId()
  return session.albumId
    ? session.albumId === activeAlbumId
    : activeAlbumId === DEFAULT_ALBUM_ID
}

function partnerId() {
  try { return String(new URL(location.href).searchParams.get('qrUser') || '').trim() } catch { return '' }
}

function selectedTrade() {
  const receives = Array.from(document.querySelectorAll('.qr-match-section.receive .qr-selected')).map(codeOf).filter(Boolean)
  const delivers = {}
  document.querySelectorAll('.qr-match-section.deliver .qr-selected').forEach(token => {
    const code = codeOf(token)
    const match = String(token.getAttribute('aria-label') || '').match(/:\s*(\d+)\s+seleccionada/i)
    const available = Math.max(0, Number(token.dataset.qrAvailable) || 0)
    const badge = token.querySelector('.qr-match-count')
    const remaining = badge && badge.style.display !== 'none' ? Math.max(0, Number(badge.textContent) || 0) : 0
    const quantity = match ? Number(match[1]) : available - remaining
    if (code && quantity > 0) delivers[code] = quantity
  })
  return { receives, delivers }
}

function confirmButton(text, disabled = true) {
  const button = document.querySelector('.panini-qr-match-confirm')
  if (!button) return
  button.disabled = disabled
  button.textContent = text
}

function transfer(donor, receiver, code, quantity) {
  const amount = Math.max(0, Number(quantity) || 0)
  const from = cleanSticker(donor[code])
  const to = cleanSticker(receiver[code])
  if (!from.owned || from.duplicates < amount || !amount) throw new Error(`${code} ya no tiene repetidas suficientes.`)
  donor[code] = { owned: true, duplicates: from.duplicates - amount }
  receiver[code] = to.owned
    ? { owned: true, duplicates: to.duplicates + amount }
    : { owned: true, duplicates: to.duplicates + Math.max(0, amount - 1) }
}

function overlay(title, message, primary, secondary) {
  document.querySelector('.qr-bilateral-overlay')?.remove()
  const layer = document.createElement('div')
  layer.className = 'qr-bilateral-overlay'
  const card = document.createElement('div')
  card.className = 'qr-bilateral-card'
  const heading = document.createElement('h3')
  heading.textContent = title
  const paragraph = document.createElement('p')
  paragraph.textContent = message
  const actions = document.createElement('div')
  actions.className = 'qr-bilateral-actions'
  ;[secondary, primary].filter(Boolean).forEach(item => {
    const button = document.createElement('button')
    button.type = 'button'
    button.textContent = item.label
    button.className = item.primary ? 'primary' : ''
    button.onclick = item.action
    actions.appendChild(button)
  })
  card.append(heading, paragraph, actions)
  layer.appendChild(card)
  document.body.appendChild(layer)
}

function closeOverlay() {
  document.querySelector('.qr-bilateral-overlay')?.remove()
}

function addStyles() {
  if (document.getElementById('qr-bilateral-styles')) return
  const style = document.createElement('style')
  style.id = 'qr-bilateral-styles'
  style.textContent = '.qr-bilateral-overlay{position:fixed;inset:0;z-index:3000;display:grid;place-items:center;padding:22px;background:rgba(15,23,42,.6);backdrop-filter:blur(6px)}.qr-bilateral-card{width:min(100%,390px);padding:24px;border-radius:24px;background:#fff;text-align:center;box-shadow:0 24px 70px rgba(15,23,42,.35)}.qr-bilateral-card h3{margin:0;color:#111827;font-size:21px}.qr-bilateral-card p{margin:10px 0 0;color:#667085;font-size:12px;line-height:1.55;font-weight:700;white-space:pre-line}.qr-bilateral-actions{display:grid;grid-template-columns:1fr 1.25fr;gap:10px;margin-top:18px}.qr-bilateral-actions button{min-height:48px;border:1px solid #d8dee8;border-radius:15px;background:#fff;color:#475467;font-weight:900}.qr-bilateral-actions button.primary{border-color:#315bdc;background:#315bdc;color:#fff}'
  document.head.appendChild(style)
}

async function sendProposal() {
  if (sending) return
  const guest = auth.currentUser
  const hostId = partnerId()
  const trade = selectedTrade()
  if (!guest?.uid || !hostId || trade.receives.length === 0 || sum(trade.delivers) === 0) return
  sending = true
  confirmButton('Enviando propuesta…')
  try {
    const [guestProfile, hostProfile] = await Promise.all([
      get(ref(db, `users/${guest.uid}/profile`)), get(ref(db, `users/${hostId}/profile`))
    ])
    const albumId = getStoredActiveAlbumId()
    if (!isProfileUsingAlbum(hostProfile.val() || {}, albumId)) {
      throw new Error('La otra persona tiene cargado un álbum diferente.')
    }
    const sessionRef = push(ref(db, `qrTradeHostSessions/${hostId}`))
    const id = sessionRef.key
    const now = Date.now()
    const proposal = {
      id, albumId, hostId, guestId: guest.uid,
      hostName: `${hostProfile.val()?.name || ''} ${hostProfile.val()?.surname || ''}`.trim() || 'Anfitrión',
      guestName: `${guestProfile.val()?.name || ''} ${guestProfile.val()?.surname || ''}`.trim() || 'Coleccionista',
      guestReceives: trade.receives, guestDelivers: trade.delivers,
      status: 'pending', createdAt: now, expiresAt: now + 900000
    }
    await update(ref(db), {
      [`qrTradeHostSessions/${hostId}/${id}`]: proposal,
      [`qrTradeGuestSessions/${guest.uid}/${id}`]: proposal
    })
    confirmButton('Esperando al anfitrión…')
  } catch (error) {
    sending = false
    confirmButton('Confirmar trueque', false)
    alert(error?.message || 'No se pudo enviar la propuesta.')
  }
}

async function resolveHost(session, accepted) {
  if (!session) return
  const albumId = session.albumId || getStoredActiveAlbumId()
  if (albumId !== getStoredActiveAlbumId()) {
    overlay('Álbum diferente', 'Carga el mismo álbum que la otra persona antes de aceptar.', { label: 'Cerrar', primary: true, action: closeOverlay })
    return
  }
  if (!accepted) {
    await update(ref(db), {
      [`qrTradeHostSessions/${session.hostId}/${session.id}/status`]: 'rejected',
      [`qrTradeGuestSessions/${session.guestId}/${session.id}/status`]: 'rejected'
    })
    closeOverlay()
    return
  }
  overlay('Actualizando álbumes…', 'Espera un momento.', null, null)
  try {
    const fresh = await get(ref(db, `qrTradeHostSessions/${session.hostId}/${session.id}`))
    if (!fresh.exists() || fresh.val()?.status !== 'pending') throw new Error('La solicitud ya fue atendida.')
    await update(ref(db), {
      [`qrTradeHostSessions/${session.hostId}/${session.id}/status`]: 'processing',
      [`qrTradeGuestSessions/${session.guestId}/${session.id}/status`]: 'processing'
    })
    const hostStickersPath = getAlbumChildPath(session.hostId, 'stickers', albumId)
    const guestStickersPath = getAlbumChildPath(session.guestId, 'stickers', albumId)
    const [hostSnap, guestSnap] = await Promise.all([
      get(ref(db, hostStickersPath)), get(ref(db, guestStickersPath))
    ])
    const host = { ...(hostSnap.val() || {}) }
    const guest = { ...(guestSnap.val() || {}) }
    const touchedHost = new Set(), touchedGuest = new Set()
    ;(session.guestReceives || []).forEach(code => { transfer(host, guest, code, 1); touchedHost.add(code); touchedGuest.add(code) })
    Object.entries(session.guestDelivers || {}).forEach(([code, qty]) => { transfer(guest, host, code, qty); touchedHost.add(code); touchedGuest.add(code) })
    const changes = {}
    touchedHost.forEach(code => { changes[`${hostStickersPath}/${code}`] = host[code] })
    touchedGuest.forEach(code => { changes[`${guestStickersPath}/${code}`] = guest[code] })
    changes[`qrTradeHostSessions/${session.hostId}/${session.id}/status`] = 'completed'
    changes[`qrTradeGuestSessions/${session.guestId}/${session.id}/status`] = 'completed'
    changes[`qrTradeHostSessions/${session.hostId}/${session.id}/completedAt`] = Date.now()
    changes[`qrTradeGuestSessions/${session.guestId}/${session.id}/completedAt`] = Date.now()
    await update(ref(db), changes)
    overlay('Trueque confirmado', 'Los dos álbumes fueron actualizados.', { label: 'Ver álbum', primary: true, action: () => location.assign(`${location.origin}${import.meta.env.BASE_URL || '/'}album?trade=qr-success`) })
  } catch (error) {
    await update(ref(db), {
      [`qrTradeHostSessions/${session.hostId}/${session.id}/status`]: 'error',
      [`qrTradeGuestSessions/${session.guestId}/${session.id}/status`]: 'error'
    }).catch(() => {})
    overlay('No se pudo confirmar', error?.message || 'Revisa las figuritas.', { label: 'Cerrar', primary: true, action: closeOverlay })
  }
}

function subscribe(uid) {
  hostOff?.(); guestOff?.(); hostOff = guestOff = null
  if (!uid) return
  hostOff = onValue(ref(db, `qrTradeHostSessions/${uid}`), snapshot => {
    const sessions = Object.values(snapshot.val() || {}).filter(item => item?.status === 'pending' && belongsToActiveAlbum(item) && (!item.expiresAt || item.expiresAt > Date.now())).sort((a,b) => b.createdAt-a.createdAt)
    activeHost = sessions[0] || null
    if (activeHost) overlay('Solicitud de trueque QR', `${activeHost.guestName} quiere intercambiar contigo.\nTú recibes ${sum(activeHost.guestDelivers)} y entregas ${(activeHost.guestReceives || []).length}.`, { label: 'Aceptar', primary: true, action: () => resolveHost(activeHost, true) }, { label: 'Rechazar', action: () => resolveHost(activeHost, false) })
  })
  guestOff = onValue(ref(db, `qrTradeGuestSessions/${uid}`), snapshot => {
    const sessions = Object.values(snapshot.val() || {}).filter(belongsToActiveAlbum).sort((a,b) => (b.completedAt || b.createdAt)-(a.completedAt || a.createdAt))
    const latest = sessions[0]
    if (!latest) return
    if (latest.status === 'pending') overlay('Esperando confirmación', `${latest.hostName} debe aceptar el trueque.`, { label: 'Seguir esperando', primary: true, action: closeOverlay })
    if (latest.status === 'completed' && !sessionStorage.getItem(`qr_done_${latest.id}`)) {
      sessionStorage.setItem(`qr_done_${latest.id}`, '1')
      overlay('Trueque confirmado', 'El anfitrión aceptó. Los dos álbumes fueron actualizados.', { label: 'Ver álbum', primary: true, action: () => location.assign(`${location.origin}${import.meta.env.BASE_URL || '/'}album?trade=qr-success`) })
    }
    if (latest.status === 'rejected' && !sessionStorage.getItem(`qr_rejected_${latest.id}`)) {
      sessionStorage.setItem(`qr_rejected_${latest.id}`, '1'); sending = false; confirmButton('Confirmar trueque', false)
      overlay('Trueque rechazado', 'El anfitrión rechazó la propuesta. No se modificó ningún álbum.', { label: 'Cerrar', primary: true, action: closeOverlay })
    }
  })
}

function start() {
  addStyles()
  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null
    if (!target?.closest('.panini-qr-match-confirm')) return
    event.preventDefault(); event.stopPropagation(); event.stopImmediatePropagation(); void sendProposal()
  }, true)
  onAuthStateChanged(auth, user => subscribe(user?.uid || ''))
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true })
else start()
