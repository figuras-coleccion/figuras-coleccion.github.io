import { auth, db, ref, get, update, onAuthStateChanged } from './firebase'
import { buildTradeHistoryUpdates } from './trade-history'
import { DEFAULT_ALBUM_ID } from './albums/constants'
import { getAlbumChildPath, getStoredActiveAlbumId } from './albums/runtime'

function belongsToActiveAlbum(record = {}) {
  const activeAlbumId = getStoredActiveAlbumId()
  return record.albumId
    ? record.albumId === activeAlbumId
    : activeAlbumId === DEFAULT_ALBUM_ID
}

function quantitiesFromCodes(codes = []) {
  return Array.from(codes || []).reduce((result, code) => {
    const normalized = String(code || '').trim().toUpperCase()
    if (normalized) result[normalized] = (result[normalized] || 0) + 1
    return result
  }, {})
}

async function saveTrade(data) {
  const updates = await buildTradeHistoryUpdates(data)
  if (Object.keys(updates).length > 0) await update(ref(db), updates)
}

async function migrateForUser(uid) {
  const markerPath = `${getAlbumChildPath(uid, 'collectionStats')}/qrHistoryMigratedAt`
  const markerSnapshot = await get(ref(db, markerPath))
  if (markerSnapshot.exists()) return

  const [outgoingSnapshot, decisionsSnapshot, inboxSnapshot] = await Promise.all([
    get(ref(db, `users/${uid}/qrTradeOutgoing`)),
    get(ref(db, `users/${uid}/qrTradeDecisions`)),
    get(ref(db, `qrTradeRequests/${uid}`))
  ])

  const outgoing = outgoingSnapshot.val() || {}
  const decisions = decisionsSnapshot.val() || {}
  const inbox = inboxSnapshot.val() || {}

  for (const session of Object.values(outgoing)) {
    if (!session?.id || session.status !== 'completed' || !belongsToActiveAlbum(session)) continue
    await saveTrade({
      uid,
      tradeId: session.id,
      mode: 'qr',
      role: 'guest',
      partnerId: session.hostId || '',
      partnerName: session.hostName || '',
      received: quantitiesFromCodes(session.guestReceives),
      delivered: session.guestDelivers || {},
      completedAt: Number(session.completedAt || session.createdAt) || Date.now()
    })
  }

  for (const decision of Object.values(decisions)) {
    if (!decision?.sessionId || decision.status !== 'accepted' || !belongsToActiveAlbum(decision)) continue
    const session = inbox[decision.sessionId] || {}
    if (!session?.id || !belongsToActiveAlbum(session)) continue

    await saveTrade({
      uid,
      tradeId: decision.sessionId,
      mode: 'qr',
      role: 'host',
      partnerId: decision.guestId || session.guestId || '',
      partnerName: session.guestName || '',
      received: session.guestDelivers || {},
      delivered: quantitiesFromCodes(session.guestReceives),
      completedAt: Number(decision.decidedAt || session.completedAt || session.createdAt) || Date.now()
    })
  }

  await update(ref(db), {
    [markerPath]: Date.now()
  })
}

export function startQrTradeHistoryMigration() {
  if (window.__paniniQrHistoryMigrationStarted) return
  window.__paniniQrHistoryMigrationStarted = true

  onAuthStateChanged(auth, user => {
    if (!user?.uid) return
    void migrateForUser(user.uid).catch(error => {
      console.warn('No se pudo migrar el historial QR anterior:', error)
    })
  })
}
