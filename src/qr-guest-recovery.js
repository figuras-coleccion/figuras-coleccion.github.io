import { onAuthStateChanged } from 'firebase/auth'
import { onValue } from 'firebase/database'
import { auth, db, ref, get, update } from './firebase'
import { closeQrOverlay, formatCodes, formatQuantities, normalizeSticker, showQrOverlay } from './qr-trade-ui'
import { getAlbumChildPath, getStoredActiveAlbumId } from './albums/runtime'

let uid = ''
let busy = false
let active = ''
let off = null

async function markRejected(session) {
  await update(ref(db), {
    [`users/${uid}/qrTradeOutgoing/${session.id}/status`]: 'rejected',
    [`users/${uid}/qrTradeOutgoing/${session.id}/rejectedAt`]: Date.now()
  }).catch(error => {
    console.warn('No se pudo cerrar la solicitud rechazada:', error)
  })

  localStorage.setItem(`qr_rejected_${session.id}`, '1')
  sessionStorage.removeItem('panini_active_qr_session')
}

async function apply(session, decision) {
  if (decision.status === 'rejected') {
    const marker = `qr_rejected_${session.id}`
    if (localStorage.getItem(marker)) {
      off?.()
      off = null
      active = session.id
      return
    }

    await markRejected(session)
    off?.()
    off = null
    active = session.id
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
  const stickersPath = getAlbumChildPath(uid, 'stickers', albumId)
  Object.entries(decision.guestPatch || {}).forEach(([code, value]) => {
    changes[`${stickersPath}/${code}`] = normalizeSticker(value)
  })
  changes[`users/${uid}/qrTradeOutgoing/${session.id}/status`] = 'completed'
  changes[`users/${uid}/qrTradeOutgoing/${session.id}/completedAt`] = Date.now()

  await update(ref(db), changes)
  sessionStorage.setItem(`qr_applied_${session.id}`, '1')
  sessionStorage.removeItem('panini_active_qr_session')
  off?.()
  off = null
  active = session.id

  showQrOverlay({
    key: `guest-completed-${session.id}`,
    title: 'Trueque confirmado',
    message: 'Los dos álbumes fueron actualizados.',
    primary: {
      label: 'Ver álbum',
      primary: true,
      action: () => location.assign(`${location.origin}${import.meta.env.BASE_URL || '/'}album?trade=qr-success`)
    }
  })
}

async function scan() {
  if (!uid || busy) return
  busy = true

  try {
    const snap = await get(ref(db, `users/${uid}/qrTradeOutgoing`))
    const sessions = Object.values(snap.val() || {})
      .filter(item => (
        item?.status === 'pending' &&
        (!item.albumId || item.albumId === getStoredActiveAlbumId()) &&
        !localStorage.getItem(`qr_rejected_${item.id}`) &&
        !sessionStorage.getItem(`qr_applied_${item.id}`) &&
        (!item.expiresAt || item.expiresAt > Date.now())
      ))
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))

    const session = sessions[0]
    if (!session || session.id === active) return

    active = session.id
    showQrOverlay({
      key: `guest-recovery-${session.id}`,
      title: 'Esperando confirmación',
      message: `${session.hostName} debe aceptar o rechazar el trueque.`,
      receive: formatCodes(session.guestReceives || []),
      deliver: formatQuantities(session.guestDelivers || {})
    })

    off?.()
    off = onValue(ref(db, `users/${session.hostId}/qrTradeDecisions/${session.id}`), decision => {
      if (decision.exists()) void apply(session, decision.val())
    })
  } catch (error) {
    console.warn('No se pudo recuperar la solicitud QR:', error)
  } finally {
    busy = false
  }
}

export function startQrGuestRecovery() {
  onAuthStateChanged(auth, user => {
    uid = user?.uid || ''
    active = ''
    off?.()
    off = null
    void scan()
  })

  setInterval(() => void scan(), 2500)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void scan()
  })
}
