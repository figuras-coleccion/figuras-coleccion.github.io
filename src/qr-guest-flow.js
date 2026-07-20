import { onValue, push, set } from 'firebase/database'
import { auth, db, ref, get, update } from './firebase'
import { closeQrOverlay, formatCodes, formatQuantities, normalizeSticker, showQrOverlay, sumQuantities } from './qr-trade-ui'
import { getAlbumChildPath, getStoredActiveAlbumId, isProfileUsingAlbum } from './albums/runtime'
import { buildAbsoluteAppUrl, ALBUM_ROUTE } from './appRoutes.js'

let busy = false
let off = null

const code = el => String(el.querySelector('small')?.textContent || '').trim().toUpperCase()

function currentHostId() {
  try {
    return String(
      new URL(location.href).searchParams.get('qrUser') ||
      sessionStorage.getItem('panini_qr_partner') ||
      ''
    ).trim()
  } catch {
    return String(sessionStorage.getItem('panini_qr_partner') || '').trim()
  }
}

function selectedFromDom() {
  const receiveCodes = [...document.querySelectorAll('.qr-match-section.receive .qr-selected')]
    .map(code)
    .filter(Boolean)

  const deliverQuantities = {}
  document.querySelectorAll('.qr-match-section.deliver .qr-selected').forEach(el => {
    const stickerCode = code(el)
    const match = String(el.getAttribute('aria-label') || '').match(/:\s*(\d+)\s+seleccionada/i)
    const available = Number(el.dataset.qrAvailable) || 0
    const badge = el.querySelector('.qr-match-count')
    const remaining = badge && badge.style.display !== 'none' ? Number(badge.textContent) || 0 : 0
    const quantity = match ? Number(match[1]) : Math.max(0, available - remaining)
    if (stickerCode && quantity > 0) deliverQuantities[stickerCode] = quantity
  })

  return { receiveCodes, deliverQuantities }
}

function setButton(text, disabled = true) {
  const button = document.querySelector('.panini-qr-match-confirm')
  if (!button) return
  button.textContent = text
  button.disabled = disabled
  button.classList.toggle('qr-processing', disabled)
}

async function markRejected(session) {
  await update(ref(db), {
    [`users/${session.guestId}/qrTradeOutgoing/${session.id}/status`]: 'rejected',
    [`users/${session.guestId}/qrTradeOutgoing/${session.id}/rejectedAt`]: Date.now()
  }).catch(error => {
    console.warn('No se pudo cerrar la solicitud rechazada:', error)
  })

  localStorage.setItem(`qr_rejected_${session.id}`, '1')
  sessionStorage.removeItem('panini_active_qr_session')
}

async function applyDecision(session, decision) {
  if (decision.status === 'rejected') {
    const marker = `qr_rejected_${session.id}`
    if (localStorage.getItem(marker)) {
      busy = false
      off?.()
      off = null
      return
    }

    await markRejected(session)
    busy = false
    off?.()
    off = null
    setButton('Confirmar trueque', false)
    showQrOverlay({
      key: `guest-rejected-${session.id}`,
      title: 'Trueque rechazado',
      message: `${session.hostName} rechazó la solicitud.`,
      primary: { label: 'Cerrar', primary: true, action: closeQrOverlay }
    })
    return
  }

  if (decision.status !== 'accepted' || sessionStorage.getItem(`qr_applied_${session.id}`)) return

  const changes = {}
  const albumId = session.albumId || getStoredActiveAlbumId()
  const stickersPath = getAlbumChildPath(session.guestId, 'stickers', albumId)
  Object.entries(decision.guestPatch || {}).forEach(([stickerCode, value]) => {
    changes[`${stickersPath}/${stickerCode}`] = normalizeSticker(value)
  })
  changes[`users/${session.guestId}/qrTradeOutgoing/${session.id}/status`] = 'completed'
  changes[`users/${session.guestId}/qrTradeOutgoing/${session.id}/completedAt`] = Date.now()

  await update(ref(db), changes)
  sessionStorage.setItem(`qr_applied_${session.id}`, '1')
  sessionStorage.removeItem('panini_active_qr_session')
  busy = false
  off?.()
  off = null

  showQrOverlay({
    key: `guest-completed-${session.id}`,
    title: 'Trueque confirmado',
    message: 'Los dos álbumes fueron actualizados.',
    primary: {
      label: 'Ver álbum',
      primary: true,
      action: () => location.assign(buildAbsoluteAppUrl(ALBUM_ROUTE, '?trade=qr-success'))
    }
  })
}

export async function submitQrTrade({ hostId = '', receiveCodes = [], deliverQuantities = {} } = {}) {
  if (busy) return false

  const guest = auth.currentUser
  const host = String(hostId || currentHostId()).trim()
  const receives = Array.from(new Set(receiveCodes.map(value => String(value || '').trim().toUpperCase()).filter(Boolean)))
  const delivers = Object.fromEntries(
    Object.entries(deliverQuantities || {})
      .map(([stickerCode, quantity]) => [String(stickerCode || '').trim().toUpperCase(), Math.max(0, Number(quantity) || 0)])
      .filter(([stickerCode, quantity]) => stickerCode && quantity > 0)
  )

  if (!guest?.uid) {
    showQrOverlay({ title: 'No se pudo enviar', message: 'Tu sesión no está disponible.', primary: { label: 'Cerrar', primary: true, action: closeQrOverlay } })
    return false
  }
  if (!host || host === guest.uid) {
    showQrOverlay({ title: 'No se pudo enviar', message: 'No se encontró una cuenta anfitriona válida.', primary: { label: 'Cerrar', primary: true, action: closeQrOverlay } })
    return false
  }
  if (!receives.length || !sumQuantities(delivers)) return false

  busy = true
  setButton('Enviando solicitud…')
  showQrOverlay({ title: 'Enviando solicitud…', message: 'Conectando con la cuenta anfitriona.' })

  try {
    const [guestProfileSnapshot, hostProfileSnapshot] = await Promise.all([
      get(ref(db, `users/${guest.uid}/profile`)),
      get(ref(db, `users/${host}/profile`))
    ])

    if (!hostProfileSnapshot.exists()) throw new Error('La cuenta anfitriona ya no está disponible.')

    const id = push(ref(db, `users/${guest.uid}/qrTradeOutgoing`)).key
    if (!id) throw new Error('No se pudo crear la solicitud.')

    const guestProfile = guestProfileSnapshot.val() || {}
    const hostProfile = hostProfileSnapshot.val() || {}
    const albumId = getStoredActiveAlbumId()
    if (!isProfileUsingAlbum(hostProfile, albumId)) {
      throw new Error('La otra persona tiene cargado un álbum diferente.')
    }
    const now = Date.now()
    const session = {
      id,
      albumId,
      hostId: host,
      guestId: guest.uid,
      hostName: `${hostProfile.name || ''} ${hostProfile.surname || ''}`.trim() || 'Anfitrión',
      guestName: `${guestProfile.name || ''} ${guestProfile.surname || ''}`.trim() || 'Coleccionista',
      guestReceives: receives,
      guestDelivers: delivers,
      status: 'pending',
      createdAt: now,
      expiresAt: now + 900000
    }

    await set(ref(db, `users/${guest.uid}/qrTradeOutgoing/${id}`), session)

    try {
      await set(ref(db, `qrTradeRequests/${host}/${id}`), session)
    } catch (inboxError) {
      console.warn('Bandeja rápida QR no disponible; se usará detección de respaldo.', inboxError)
    }

    sessionStorage.setItem('panini_active_qr_session', JSON.stringify(session))
    sessionStorage.setItem('panini_qr_partner', host)

    off?.()
    off = onValue(ref(db, `users/${host}/qrTradeDecisions/${id}`), snapshot => {
      if (snapshot.exists()) void applyDecision(session, snapshot.val())
    })

    setButton('Esperando al anfitrión…')
    showQrOverlay({
      key: `guest-wait-${id}`,
      title: 'Esperando confirmación',
      message: `${session.hostName} debe aceptar o rechazar el trueque.`,
      receive: formatCodes(receives),
      deliver: formatQuantities(delivers)
    })
    return true
  } catch (error) {
    busy = false
    setButton('Confirmar trueque', false)
    showQrOverlay({
      title: 'No se pudo enviar la solicitud',
      message: error?.message || 'Revisa tu conexión.',
      primary: { label: 'Cerrar', primary: true, action: closeQrOverlay }
    })
    return false
  }
}

export function startQrGuestFlow() {
  window.paniniSubmitQrTrade = submitQrTrade

  window.addEventListener('panini:qr-partner', event => {
    const id = event.detail?.partnerId
    if (id) sessionStorage.setItem('panini_qr_partner', id)
  })

  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null
    if (!target?.closest('.panini-qr-match-confirm')) return
    event.preventDefault()
    event.stopPropagation()
    event.stopImmediatePropagation()
    const selected = selectedFromDom()
    void submitQrTrade({ hostId: currentHostId(), ...selected })
  }, true)
}
