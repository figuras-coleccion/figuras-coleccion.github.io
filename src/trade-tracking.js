import { onValue, push } from 'firebase/database'
import { auth, db, ref, update, onAuthStateChanged } from './firebase'
import { buildTradeHistoryUpdates } from './trade-history'
import { getAlbumChildPath, getStoredActiveAlbumId } from './albums/runtime'

function albumPath(userId, child) {
  return getAlbumChildPath(userId, child, getStoredActiveAlbumId())
}

let stopAuth = null
let stopStickers = null
let uid = ''
let previous = {}
let queue = Promise.resolve()

function state(value = {}) {
  return {
    owned: Boolean(value?.owned),
    duplicates: Math.max(0, Number(value?.duplicates) || 0)
  }
}

function add(target, code, quantity) {
  const amount = Math.max(0, Number(quantity) || 0)
  if (code && amount > 0) target[code] = (target[code] || 0) + amount
}

function readQrSession() {
  try {
    return JSON.parse(sessionStorage.getItem('panini_active_qr_session') || 'null')
  } catch {
    return null
  }
}

function getTradeContext() {
  const onTradePage = window.location.pathname.endsWith('/trade')
  const qrOverlay = document.querySelector('.qr-bilateral-overlay')
  if (!onTradePage && !qrOverlay) return null

  const session = readQrSession()
  const isQr = Boolean(qrOverlay || session)
  const isGuest = session?.guestId === uid

  return {
    mode: isQr ? 'qr' : 'manual',
    role: isQr ? (isGuest ? 'guest' : 'host') : 'self',
    partnerId: session ? (isGuest ? session.hostId : session.guestId) : '',
    partnerName: session ? (isGuest ? session.hostName : session.guestName) : '',
    tradeId: session?.id || ''
  }
}

async function inspect(beforeSnapshot = {}, afterSnapshot = {}) {
  if (!uid) return
  const context = getTradeContext()
  if (!context) return

  const received = {}
  const delivered = {}
  const codes = new Set([...Object.keys(beforeSnapshot), ...Object.keys(afterSnapshot)])

  codes.forEach(code => {
    const before = state(beforeSnapshot[code])
    const after = state(afterSnapshot[code])
    const duplicateDelta = after.duplicates - before.duplicates

    if (!before.owned && after.owned) add(received, code, 1 + Math.max(0, duplicateDelta))
    else if (duplicateDelta > 0) add(received, code, duplicateDelta)

    if (duplicateDelta < 0) add(delivered, code, Math.abs(duplicateDelta))
  })

  const receivedTotal = Object.values(received).reduce((sum, value) => sum + value, 0)
  const deliveredTotal = Object.values(delivered).reduce((sum, value) => sum + value, 0)
  if (!receivedTotal || !deliveredTotal) return

  const tradeId = context.tradeId || push(ref(db, albumPath(uid, 'tradeHistory'))).key
  if (!tradeId) return

  const updates = await buildTradeHistoryUpdates({
    uid,
    tradeId,
    mode: context.mode,
    role: context.role,
    partnerId: context.partnerId,
    partnerName: context.partnerName,
    received,
    delivered,
    completedAt: Date.now()
  })

  if (Object.keys(updates).length > 0) await update(ref(db), updates)
}

function bind(user) {
  stopStickers?.()
  stopStickers = null
  uid = user?.uid || ''
  previous = {}
  if (!uid) return

  let first = true
  stopStickers = onValue(ref(db, albumPath(uid, 'stickers')), snapshot => {
    const current = snapshot.val() || {}
    if (first) {
      first = false
      previous = current
      return
    }

    const before = previous
    previous = current
    queue = queue
      .then(() => inspect(before, current))
      .catch(error => console.warn('No se pudo registrar el intercambio:', error))
  })
}

export function startTradeTracking() {
  if (window.__paniniTradeTrackingStarted) return
  window.__paniniTradeTrackingStarted = true
  stopAuth?.()
  stopAuth = onAuthStateChanged(auth, bind)
}
