import { increment, onValue, push } from 'firebase/database'
import { auth, db, ref, get, update, onAuthStateChanged } from './firebase'
import { specials, teams, teamNames, getTeamStickerCount } from './data/stickersData'

export const COLLECTION_HISTORY_VERSION = 1

const TRACKED_FIELDS = [
  'obtainedAt',
  'updatedAt',
  'lastDuplicateAddedAt',
  'lastDuplicateRemovedAt',
  'duplicateAddsTotal',
  'duplicateRemovalsTotal'
]

export const collectionSections = [
  {
    id: 'specials',
    title: 'FWC',
    codes: specials
  },
  ...teams.map(team => ({
    id: team,
    title: teamNames[team] || team,
    codes: Array.from({ length: getTeamStickerCount(team) }, (_, index) => `${team}${index + 1}`)
  }))
]

let stopAuthListener = null
let stopStickerListener = null
let activeUid = ''
let previousStickers = {}
let completionCache = {}
let processingQueue = Promise.resolve()

function positiveNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : 0
}

export function normalizeTrackedSticker(value = {}) {
  return {
    ...(value && typeof value === 'object' ? value : {}),
    owned: Boolean(value?.owned),
    duplicates: Math.max(0, Number(value?.duplicates) || 0)
  }
}

function stateOf(value = {}) {
  return {
    owned: Boolean(value?.owned),
    duplicates: Math.max(0, Number(value?.duplicates) || 0)
  }
}

function eventKey(uid) {
  return push(ref(db, `users/${uid}/collectionEvents`)).key
}

function isSectionComplete(section, stickers = {}) {
  return section.codes.length > 0 && section.codes.every(code => Boolean(stickers[code]?.owned))
}

function createCollectionEvent(updates, uid, event) {
  const key = eventKey(uid)
  if (!key) return
  updates[`users/${uid}/collectionEvents/${key}`] = event
}

function preserveTrackedMetadata(previous = {}, current = {}) {
  const repaired = { ...current }
  let changed = false

  TRACKED_FIELDS.forEach(field => {
    if ((repaired[field] === undefined || repaired[field] === null) && previous[field] !== undefined && previous[field] !== null) {
      repaired[field] = previous[field]
      changed = true
    }
  })

  return { repaired, changed }
}

async function ensureMigration(uid) {
  const [stickersSnapshot, statsSnapshot, completionsSnapshot] = await Promise.all([
    get(ref(db, `users/${uid}/stickers`)),
    get(ref(db, `users/${uid}/collectionStats`)),
    get(ref(db, `users/${uid}/sectionCompletions`))
  ])

  const rawStickers = stickersSnapshot.val() || {}
  const stats = statsSnapshot.val() || {}
  const existingCompletions = completionsSnapshot.val() || {}
  const now = Date.now()
  const updates = {}
  const normalized = {}
  let ownedCount = 0
  let duplicateCount = 0
  let repairedCount = 0

  Object.entries(rawStickers).forEach(([code, rawValue]) => {
    const record = normalizeTrackedSticker(rawValue)
    const state = stateOf(record)
    ownedCount += state.owned ? 1 : 0
    duplicateCount += state.duplicates

    if (state.owned && !positiveNumber(record.obtainedAt)) {
      record.obtainedAt = now
      repairedCount += 1
    }

    if (state.duplicates > 0 && !positiveNumber(record.lastDuplicateAddedAt)) {
      record.lastDuplicateAddedAt = now
      repairedCount += 1
    }

    if (state.duplicates > 0 && Number(record.duplicateAddsTotal || 0) < state.duplicates) {
      record.duplicateAddsTotal = state.duplicates
      repairedCount += 1
    }

    if ((state.owned || state.duplicates > 0) && !positiveNumber(record.updatedAt)) {
      record.updatedAt = now
      repairedCount += 1
    }

    normalized[code] = record

    if (JSON.stringify(record) !== JSON.stringify(rawValue || {})) {
      updates[`users/${uid}/stickers/${code}`] = record
    }
  })

  const migratedAlready = Number(stats.historyVersion || 0) >= COLLECTION_HISTORY_VERSION

  if (!migratedAlready) {
    collectionSections.forEach(section => {
      if (!existingCompletions[section.id] && isSectionComplete(section, normalized)) {
        const completion = {
          sectionId: section.id,
          title: section.title,
          completedAt: now,
          source: 'migration',
          migrated: true,
          stickerCount: section.codes.length
        }
        updates[`users/${uid}/sectionCompletions/${section.id}`] = completion
        existingCompletions[section.id] = completion
      }
    })

    updates[`users/${uid}/collectionStats/historyVersion`] = COLLECTION_HISTORY_VERSION
    updates[`users/${uid}/collectionStats/trackingStartedAt`] = now
    updates[`users/${uid}/collectionStats/baselineOwned`] = ownedCount
    updates[`users/${uid}/collectionStats/baselineDuplicates`] = duplicateCount
    updates[`users/${uid}/collectionStats/duplicateAdds`] = Math.max(Number(stats.duplicateAdds || 0), duplicateCount)
    updates[`users/${uid}/collectionStats/duplicateRemovals`] = Number(stats.duplicateRemovals || 0)
    updates[`users/${uid}/collectionStats/tradesCompleted`] = Number(stats.tradesCompleted || 0)
    updates[`users/${uid}/collectionStats/manualTradesCompleted`] = Number(stats.manualTradesCompleted || 0)
    updates[`users/${uid}/collectionStats/qrTradesCompleted`] = Number(stats.qrTradesCompleted || 0)
    updates[`users/${uid}/collectionStats/stickersReceivedInTrades`] = Number(stats.stickersReceivedInTrades || 0)
    updates[`users/${uid}/collectionStats/stickersDeliveredInTrades`] = Number(stats.stickersDeliveredInTrades || 0)
    updates[`users/${uid}/collectionStats/lastActivityAt`] = now

    createCollectionEvent(updates, uid, {
      type: 'migration_baseline',
      source: 'migration',
      timestamp: now,
      ownedCount,
      duplicatesCount: duplicateCount,
      repairedStickers: repairedCount,
      historyVersion: COLLECTION_HISTORY_VERSION
    })
  }

  if (Object.keys(updates).length > 0) {
    await update(ref(db), updates)
  }

  return {
    stickers: normalized,
    completions: existingCompletions
  }
}

function buildTransitionRecord(previousRaw, currentRaw, now) {
  const previous = normalizeTrackedSticker(previousRaw)
  const current = normalizeTrackedSticker(currentRaw)
  const before = stateOf(previous)
  const after = stateOf(current)
  const record = { ...previous, ...current, ...after }
  const ownedAdded = !before.owned && after.owned
  const ownedRemoved = before.owned && !after.owned
  const duplicateDelta = after.duplicates - before.duplicates

  if (after.owned && !positiveNumber(record.obtainedAt)) {
    record.obtainedAt = now
  }

  if (duplicateDelta > 0) {
    record.lastDuplicateAddedAt = now
    record.duplicateAddsTotal = Math.max(Number(previous.duplicateAddsTotal || before.duplicates), before.duplicates) + duplicateDelta
  }

  if (duplicateDelta < 0) {
    record.lastDuplicateRemovedAt = now
    record.duplicateRemovalsTotal = Number(previous.duplicateRemovalsTotal || 0) + Math.abs(duplicateDelta)
  }

  record.updatedAt = now

  return {
    record,
    before,
    after,
    ownedAdded,
    ownedRemoved,
    duplicateAdded: Math.max(0, duplicateDelta),
    duplicateRemoved: Math.max(0, -duplicateDelta)
  }
}

async function reconcileStickerChanges(uid, beforeSnapshot = {}, afterSnapshot = {}) {
  if (!uid || uid !== activeUid) return

  const now = Date.now()
  const updates = {}
  const codes = new Set([...Object.keys(beforeSnapshot || {}), ...Object.keys(afterSnapshot || {})])
  let obtainedAdded = 0
  let ownedRemoved = 0
  let duplicatesAdded = 0
  let duplicatesRemoved = 0

  codes.forEach(code => {
    const previousRaw = beforeSnapshot[code] || {}
    const currentRaw = afterSnapshot[code] || {}
    const before = stateOf(previousRaw)
    const after = stateOf(currentRaw)
    const stateChanged = before.owned !== after.owned || before.duplicates !== after.duplicates

    if (!stateChanged) {
      const { repaired, changed } = preserveTrackedMetadata(previousRaw, currentRaw)
      if (changed) updates[`users/${uid}/stickers/${code}`] = normalizeTrackedSticker(repaired)
      return
    }

    const transition = buildTransitionRecord(previousRaw, currentRaw, now)
    updates[`users/${uid}/stickers/${code}`] = transition.record

    if (transition.ownedAdded) {
      obtainedAdded += 1
      createCollectionEvent(updates, uid, {
        type: 'sticker_obtained',
        source: 'collection',
        code,
        quantity: 1,
        timestamp: transition.record.obtainedAt || now
      })
    }

    if (transition.ownedRemoved) {
      ownedRemoved += 1
      createCollectionEvent(updates, uid, {
        type: 'sticker_removed',
        source: 'collection',
        code,
        quantity: 1,
        timestamp: now
      })
    }

    if (transition.duplicateAdded > 0) {
      duplicatesAdded += transition.duplicateAdded
      createCollectionEvent(updates, uid, {
        type: 'duplicate_added',
        source: 'collection',
        code,
        quantity: transition.duplicateAdded,
        currentDuplicates: transition.after.duplicates,
        timestamp: now
      })
    }

    if (transition.duplicateRemoved > 0) {
      duplicatesRemoved += transition.duplicateRemoved
      createCollectionEvent(updates, uid, {
        type: 'duplicate_removed',
        source: 'collection',
        code,
        quantity: transition.duplicateRemoved,
        currentDuplicates: transition.after.duplicates,
        timestamp: now
      })
    }
  })

  const mergedAfter = { ...afterSnapshot }
  Object.entries(updates).forEach(([path, value]) => {
    const prefix = `users/${uid}/stickers/`
    if (path.startsWith(prefix)) mergedAfter[path.slice(prefix.length)] = value
  })

  collectionSections.forEach(section => {
    if (completionCache[section.id] || !isSectionComplete(section, mergedAfter)) return

    const completion = {
      sectionId: section.id,
      title: section.title,
      completedAt: now,
      source: 'collection',
      migrated: false,
      stickerCount: section.codes.length
    }

    completionCache[section.id] = completion
    updates[`users/${uid}/sectionCompletions/${section.id}`] = completion
    createCollectionEvent(updates, uid, {
      type: 'section_completed',
      source: 'collection',
      sectionId: section.id,
      title: section.title,
      quantity: section.codes.length,
      timestamp: now
    })
  })

  if (obtainedAdded > 0) updates[`users/${uid}/collectionStats/stickersObtainedTracked`] = increment(obtainedAdded)
  if (ownedRemoved > 0) updates[`users/${uid}/collectionStats/stickersRemovedTracked`] = increment(ownedRemoved)
  if (duplicatesAdded > 0) updates[`users/${uid}/collectionStats/duplicateAdds`] = increment(duplicatesAdded)
  if (duplicatesRemoved > 0) updates[`users/${uid}/collectionStats/duplicateRemovals`] = increment(duplicatesRemoved)

  if (obtainedAdded || ownedRemoved || duplicatesAdded || duplicatesRemoved) {
    updates[`users/${uid}/collectionStats/lastActivityAt`] = now
  }

  if (Object.keys(updates).length > 0) {
    await update(ref(db), updates)
  }
}

async function bindUser(user) {
  stopStickerListener?.()
  stopStickerListener = null
  activeUid = user?.uid || ''
  previousStickers = {}
  completionCache = {}

  if (!activeUid) return

  try {
    const migrated = await ensureMigration(activeUid)
    previousStickers = migrated.stickers || {}
    completionCache = migrated.completions || {}
  } catch (error) {
    console.warn('No se pudo preparar el historial de la colección:', error)
  }

  let firstSnapshot = true
  stopStickerListener = onValue(ref(db, `users/${activeUid}/stickers`), snapshot => {
    const current = snapshot.val() || {}

    if (firstSnapshot) {
      firstSnapshot = false
      previousStickers = current
      return
    }

    const before = previousStickers
    previousStickers = current
    processingQueue = processingQueue
      .then(() => reconcileStickerChanges(activeUid, before, current))
      .catch(error => console.warn('No se pudo registrar un cambio de colección:', error))
  })
}

export function startCollectionTracking() {
  if (window.__paniniCollectionTrackingStarted) return
  window.__paniniCollectionTrackingStarted = true

  stopAuthListener?.()
  stopAuthListener = onAuthStateChanged(auth, user => {
    void bindUser(user)
  })
}
