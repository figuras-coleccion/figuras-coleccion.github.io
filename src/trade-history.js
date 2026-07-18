import { increment, push } from 'firebase/database'
import { db, ref, get } from './firebase'

function normalizeCode(value) {
  return String(value || '').trim().toUpperCase()
}

export function normalizeTradeQuantities(value = {}) {
  if (Array.isArray(value)) {
    return value.reduce((result, code) => {
      const normalized = normalizeCode(code)
      if (normalized) result[normalized] = (result[normalized] || 0) + 1
      return result
    }, {})
  }

  return Object.fromEntries(
    Object.entries(value || {})
      .map(([code, quantity]) => [normalizeCode(code), Math.max(0, Number(quantity) || 0)])
      .filter(([code, quantity]) => code && quantity > 0)
  )
}

export function sumTradeQuantities(value = {}) {
  return Object.values(normalizeTradeQuantities(value))
    .reduce((total, quantity) => total + quantity, 0)
}

function eventKey(uid) {
  return push(ref(db, `users/${uid}/collectionEvents`)).key
}

export function createManualTradeId(uid) {
  return push(ref(db, `users/${uid}/tradeHistory`)).key
}

export async function buildTradeHistoryUpdates({
  uid,
  tradeId,
  mode = 'manual',
  role = 'self',
  partnerId = '',
  partnerName = '',
  received = {},
  delivered = {},
  completedAt = Date.now()
} = {}) {
  const safeUid = String(uid || '').trim()
  const safeTradeId = String(tradeId || '').trim()
  if (!safeUid || !safeTradeId) return {}

  const historyPath = `users/${safeUid}/tradeHistory/${safeTradeId}`
  const existing = await get(ref(db, historyPath))
  if (existing.exists()) return {}

  const receivedQuantities = normalizeTradeQuantities(received)
  const deliveredQuantities = normalizeTradeQuantities(delivered)
  const receivedTotal = sumTradeQuantities(receivedQuantities)
  const deliveredTotal = sumTradeQuantities(deliveredQuantities)
  const updates = {}

  updates[historyPath] = {
    id: safeTradeId,
    mode,
    role,
    partnerId: String(partnerId || ''),
    partnerName: String(partnerName || ''),
    status: 'completed',
    received: receivedQuantities,
    delivered: deliveredQuantities,
    receivedTotal,
    deliveredTotal,
    completedAt
  }

  updates[`users/${safeUid}/collectionStats/tradesCompleted`] = increment(1)
  updates[`users/${safeUid}/collectionStats/${mode === 'qr' ? 'qrTradesCompleted' : 'manualTradesCompleted'}`] = increment(1)
  if (receivedTotal > 0) updates[`users/${safeUid}/collectionStats/stickersReceivedInTrades`] = increment(receivedTotal)
  if (deliveredTotal > 0) updates[`users/${safeUid}/collectionStats/stickersDeliveredInTrades`] = increment(deliveredTotal)
  updates[`users/${safeUid}/collectionStats/lastTradeAt`] = completedAt
  updates[`users/${safeUid}/collectionStats/lastActivityAt`] = completedAt

  Object.entries(receivedQuantities).forEach(([code, quantity]) => {
    const key = eventKey(safeUid)
    if (!key) return
    updates[`users/${safeUid}/collectionEvents/${key}`] = {
      type: 'trade_received',
      source: `${mode}_trade`,
      tradeId: safeTradeId,
      code,
      quantity,
      timestamp: completedAt
    }
  })

  Object.entries(deliveredQuantities).forEach(([code, quantity]) => {
    const key = eventKey(safeUid)
    if (!key) return
    updates[`users/${safeUid}/collectionEvents/${key}`] = {
      type: 'trade_delivered',
      source: `${mode}_trade`,
      tradeId: safeTradeId,
      code,
      quantity,
      timestamp: completedAt
    }
  })

  return updates
}
