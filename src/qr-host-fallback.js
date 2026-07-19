import { onAuthStateChanged } from 'firebase/auth'
import { auth, db, ref, get } from './firebase'
import { formatCodes, formatQuantities, showQrOverlay } from './qr-trade-ui'
import { resolveQrHost } from './qr-host-resolve'
import { DEFAULT_ALBUM_ID } from './albums/constants'
import { getStoredActiveAlbumId } from './albums/runtime'

let uid = ''
let busy = false
let shown = ''

function belongsToActiveAlbum(session = {}) {
  const activeAlbumId = getStoredActiveAlbumId()
  return session.albumId
    ? session.albumId === activeAlbumId
    : activeAlbumId === DEFAULT_ALBUM_ID
}

async function scan() {
  if (!uid || busy || document.visibilityState === 'hidden') return
  busy = true
  try {
    const snapshot = await get(ref(db, 'users'))
    const users = snapshot.val() || {}
    const decisions = users[uid]?.qrTradeDecisions || {}
    const pending = []
    Object.values(users).forEach(record => {
      Object.values(record?.qrTradeOutgoing || {}).forEach(session => {
        if (session?.hostId === uid && session?.status === 'pending' && belongsToActiveAlbum(session) && !decisions[session.id] && (!session.expiresAt || session.expiresAt > Date.now())) pending.push(session)
      })
    })
    pending.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
    const session = pending[0]
    if (!session || session.id === shown) return
    shown = session.id
    showQrOverlay({
      key: `host-fallback-${session.id}`,
      title: 'Solicitud de trueque QR',
      message: `${session.guestName || 'Un coleccionista'} quiere intercambiar contigo.`,
      receive: formatQuantities(session.guestDelivers),
      deliver: formatCodes(session.guestReceives),
      secondary: { label: 'Rechazar', action: () => { shown = ''; void resolveQrHost(session, false, uid) } },
      primary: { label: 'Aceptar trueque', primary: true, action: () => { shown = ''; void resolveQrHost(session, true, uid) } }
    })
  } catch (error) {
    console.warn('No se pudo revisar el respaldo QR:', error)
  } finally {
    busy = false
  }
}

export function startQrHostFallback() {
  onAuthStateChanged(auth, user => { uid = user?.uid || ''; shown = ''; void scan() })
  setInterval(() => void scan(), 2500)
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void scan() })
}
