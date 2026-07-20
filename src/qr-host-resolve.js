import { onValue, set } from 'firebase/database'
import { db, ref, get, update } from './firebase'
import { closeQrOverlay, normalizeSticker, showQrOverlay } from './qr-trade-ui'
import { getAlbumChildPath, getStoredActiveAlbumId } from './albums/runtime'
import { buildAbsoluteAppUrl, ALBUM_ROUTE } from './appRoutes.js'

let ackOff = null

function transfer(donor, receiver, code, quantity) {
  const amount = Math.max(0, Number(quantity) || 0)
  const from = normalizeSticker(donor[code])
  const to = normalizeSticker(receiver[code])
  if (!amount || !from.owned || from.duplicates < amount) throw new Error(`${code} ya no tiene repetidas suficientes.`)
  donor[code] = { owned: true, duplicates: from.duplicates - amount }
  receiver[code] = to.owned ? { owned: true, duplicates: to.duplicates + amount } : { owned: true, duplicates: to.duplicates + Math.max(0, amount - 1) }
}

function waitAck(session) {
  ackOff?.()
  ackOff = onValue(ref(db, `users/${session.guestId}/qrTradeOutgoing/${session.id}`), snap => {
    if (snap.val()?.status !== 'completed') return
    ackOff?.()
    ackOff = null
    showQrOverlay({
      key: `host-done-${session.id}`,
      title: 'Trueque confirmado',
      message: 'Los dos álbumes fueron actualizados.',
      primary: { label: 'Ver álbum', primary: true, action: () => location.assign(buildAbsoluteAppUrl(ALBUM_ROUTE, '?trade=qr-success')) }
    })
  })
}

export async function resolveQrHost(session, accepted, hostUid) {
  if (!session || session.hostId !== hostUid) return
  const albumId = session.albumId || getStoredActiveAlbumId()
  if (albumId !== getStoredActiveAlbumId()) {
    showQrOverlay({ key: `host-album-mismatch-${session.id}`, title: 'Álbum diferente', message: 'Carga el mismo álbum que la otra persona antes de aceptar.', primary: { label: 'Cerrar', primary: true, action: closeQrOverlay } })
    return
  }
  if (!accepted) {
    await set(ref(db, `users/${hostUid}/qrTradeDecisions/${session.id}`), { sessionId: session.id, albumId, hostId: hostUid, guestId: session.guestId, status: 'rejected', decidedAt: Date.now() })
    closeQrOverlay()
    return
  }

  showQrOverlay({ key: `host-validating-${session.id}`, title: 'Validando trueque...', message: 'Comprobando las figuritas de ambas cuentas.' })
  try {
    const previous = await get(ref(db, `users/${hostUid}/qrTradeDecisions/${session.id}`))
    if (previous.exists()) throw new Error('Esta solicitud ya fue atendida.')
    const hostStickersPath = getAlbumChildPath(hostUid, 'stickers', albumId)
    const guestStickersPath = getAlbumChildPath(session.guestId, 'stickers', albumId)
    const [hostSnap, guestSnap] = await Promise.all([get(ref(db, hostStickersPath)), get(ref(db, guestStickersPath))])
    const host = { ...(hostSnap.val() || {}) }
    const guest = { ...(guestSnap.val() || {}) }
    const hostCodes = new Set(), guestCodes = new Set()

    ;(session.guestReceives || []).forEach(code => {
      transfer(host, guest, code, 1)
      hostCodes.add(code); guestCodes.add(code)
    })
    Object.entries(session.guestDelivers || {}).forEach(([code, qty]) => {
      transfer(guest, host, code, qty)
      hostCodes.add(code); guestCodes.add(code)
    })

    const guestPatch = {}
    guestCodes.forEach(code => { guestPatch[code] = normalizeSticker(guest[code]) })
    const changes = {}
    hostCodes.forEach(code => { changes[`${hostStickersPath}/${code}`] = normalizeSticker(host[code]) })
    changes[`users/${hostUid}/qrTradeDecisions/${session.id}`] = { sessionId: session.id, albumId, hostId: hostUid, guestId: session.guestId, status: 'accepted', guestPatch, decidedAt: Date.now() }
    await update(ref(db), changes)
    waitAck(session)
    showQrOverlay({ key: `host-wait-${session.id}`, title: 'Trueque aceptado', message: 'Tu álbum fue actualizado. Esperando que el huésped reciba la confirmación.' })
  } catch (error) {
    showQrOverlay({ key: `host-error-${session.id}`, title: 'No se pudo confirmar', message: error?.message || 'Revisa las figuritas.', primary: { label: 'Cerrar', primary: true, action: closeQrOverlay } })
  }
}
