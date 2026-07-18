import { onAuthStateChanged } from 'firebase/auth'
import { onValue } from 'firebase/database'
import { auth, db, ref } from './firebase'
import { formatCodes, formatQuantities, showQrOverlay } from './qr-trade-ui'
import { resolveQrHost } from './qr-host-resolve'

let currentUid = ''
let off = null
let visibleId = ''

function showRequest(session) {
  if (!session || session.id === visibleId) return
  visibleId = session.id
  showQrOverlay({
    key: `host-request-${session.id}`,
    title: 'Solicitud de trueque QR',
    message: `${session.guestName || 'Un coleccionista'} quiere intercambiar contigo.`,
    receive: formatQuantities(session.guestDelivers),
    deliver: formatCodes(session.guestReceives),
    secondary: {
      label: 'Rechazar',
      action: () => {
        visibleId = ''
        void resolveQrHost(session, false, currentUid)
      }
    },
    primary: {
      label: 'Aceptar trueque',
      primary: true,
      action: () => {
        visibleId = ''
        void resolveQrHost(session, true, currentUid)
      }
    }
  })
}

function subscribe(uid) {
  currentUid = uid || ''
  off?.()
  off = null
  visibleId = ''
  if (!currentUid) return
  off = onValue(ref(db, `qrTradeRequests/${currentUid}`), snapshot => {
    const pending = Object.values(snapshot.val() || {})
      .filter(item => item?.status === 'pending' && (!item.expiresAt || item.expiresAt > Date.now()))
      .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
    if (pending[0]) showRequest(pending[0])
  }, error => {
    console.error('No se pudo escuchar la bandeja QR:', error)
    showQrOverlay({
      key: 'host-listener-error',
      title: 'No se pudo activar la bandeja QR',
      message: 'Firebase rechazó el acceso a las solicitudes. Revisa las reglas de la base de datos.'
    })
  })
}

export function startQrHostFlow() {
  onAuthStateChanged(auth, user => subscribe(user?.uid || ''))
}
