import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useUser } from './UserContext'
import { useAlbum } from './AlbumContext'
import { db, ref, get, update } from '../firebase'
import { getAllStickers } from '../data/stickersData'
import { DEFAULT_ALBUM_ID, THREE_REYES_ALBUM_ID } from '../albums/constants'
import { getAlbumChildPath } from '../albums/runtime'
import { buildTradeHistoryUpdates, createManualTradeId } from '../trade-history'

const StickersContext = createContext()

const STANDARD_STICKERS = getAllStickers()
const STANDARD_CODES = STANDARD_STICKERS.map(s => s.code)
const STANDARD_CODE_SET = new Set(STANDARD_CODES)
const STANDARD_CODE_INDEX = new Map(STANDARD_CODES.map((code, index) => [code, index]))

const EMPTY_STICKERS = {}
STANDARD_STICKERS.forEach(s => {
  EMPTY_STICKERS[s.code] = { owned: false, duplicates: 0 }
})

function normalizeSticker(value = {}) {
  return {
    owned: Boolean(value.owned),
    duplicates: Math.max(0, Number(value.duplicates) || 0)
  }
}

function stickersAreEqual(a = {}, b = {}) {
  const left = normalizeSticker(a)
  const right = normalizeSticker(b)
  return left.owned === right.owned && left.duplicates === right.duplicates
}

function getOrderedIndex(code) {
  return STANDARD_CODE_INDEX.has(code) ? STANDARD_CODE_INDEX.get(code) : Number.MAX_SAFE_INTEGER
}

function localBackupKey(uid, albumId) {
  return albumId === DEFAULT_ALBUM_ID
    ? `panini_stickers_${uid}`
    : `panini_stickers_${uid}_${albumId}`
}

function normalizeCodeForCatalog(code, catalog) {
  const normalized = String(code || '').trim().toUpperCase()
  return catalog?.normalizeStickerCode ? catalog.normalizeStickerCode(normalized) : normalized
}

function isRemovedLegacyCode(code, catalog) {
  return catalog?.id === THREE_REYES_ALBUM_ID && String(code || '').trim().toUpperCase() === '0'
}

function mergeStickerStates(previous = {}, incoming = {}) {
  const left = normalizeSticker(previous)
  const right = normalizeSticker(incoming)
  return {
    owned: left.owned || right.owned,
    duplicates: Math.max(left.duplicates, right.duplicates)
  }
}

function mergeCloudStickers(data = {}, catalog) {
  const merged = { ...EMPTY_STICKERS }

  Object.entries(data).forEach(([code, value]) => {
    if (!code || typeof value !== 'object' || value === null) return
    if (isRemovedLegacyCode(code, catalog)) return
    const normalizedCode = normalizeCodeForCatalog(code, catalog)
    if (!normalizedCode) return
    merged[normalizedCode] = mergeStickerStates(merged[normalizedCode], value)
  })

  return merged
}

function buildCatalogMigrationUpdates(data = {}, catalog, stickersPath = '') {
  if (!stickersPath) return {}

  const merged = mergeCloudStickers(data, catalog)
  const updates = {}

  Object.entries(data).forEach(([code, value]) => {
    if (!code || typeof value !== 'object' || value === null) return

    if (isRemovedLegacyCode(code, catalog)) {
      updates[`${stickersPath}/${code}`] = null
      return
    }

    const normalizedCode = normalizeCodeForCatalog(code, catalog)
    if (!normalizedCode || normalizedCode === code) return

    updates[`${stickersPath}/${code}`] = null
    updates[`${stickersPath}/${normalizedCode}`] = merged[normalizedCode]
  })

  return updates
}

export function StickersProvider({ children }) {
  const { user } = useUser()
  const { activeAlbumId, activeAlbum } = useAlbum()
  const stickersPath = user?.id ? getAlbumChildPath(user.id, 'stickers', activeAlbumId) : ''
  const [stickers, setStickers] = useState({ ...EMPTY_STICKERS })
  const [savedStickers, setSavedStickers] = useState({ ...EMPTY_STICKERS })
  const [pendingChanges, setPendingChanges] = useState({})
  const [lastSaved, setLastSaved] = useState(null)

  useEffect(() => {
    if (!user) {
      setStickers({ ...EMPTY_STICKERS })
      setSavedStickers({ ...EMPTY_STICKERS })
      setPendingChanges({})
      return
    }

    const loadStickers = async () => {
      try {
        const snapshot = await get(ref(db, stickersPath))
        if (snapshot.exists()) {
          const rawCloudStickers = snapshot.val() || {}
          const cloudStickers = mergeCloudStickers(rawCloudStickers, activeAlbum)
          setStickers(cloudStickers)
          setSavedStickers(cloudStickers)
          const migrationUpdates = buildCatalogMigrationUpdates(rawCloudStickers, activeAlbum, stickersPath)
          if (Object.keys(migrationUpdates).length > 0) {
            await update(ref(db), migrationUpdates)
          }
        } else {
          setStickers({ ...EMPTY_STICKERS })
          setSavedStickers({ ...EMPTY_STICKERS })
        }
      } catch (err) {
        console.error('Error loading stickers:', err)
        try {
          const saved = localStorage.getItem(localBackupKey(user.id, activeAlbumId))
          if (saved) {
            const localBackup = mergeCloudStickers(JSON.parse(saved), activeAlbum)
            setStickers(localBackup)
            setSavedStickers({ ...EMPTY_STICKERS })
          } else {
            setStickers({ ...EMPTY_STICKERS })
            setSavedStickers({ ...EMPTY_STICKERS })
          }
        } catch (localErr) {
          console.warn('Backup local corrupto. Se usará lista vacía.', localErr)
          localStorage.removeItem(localBackupKey(user.id, activeAlbumId))
          setStickers({ ...EMPTY_STICKERS })
          setSavedStickers({ ...EMPTY_STICKERS })
        }
      }
    }

    loadStickers()
  }, [activeAlbum, activeAlbumId, stickersPath, user])

  useEffect(() => {
    if (user) {
      localStorage.setItem(localBackupKey(user.id, activeAlbumId), JSON.stringify(stickers))
    }
  }, [activeAlbumId, stickers, user])

  const isStickerLocked = useCallback((code) => {
    const normalizedCode = normalizeCodeForCatalog(code, activeAlbum)
    return Boolean(savedStickers[normalizedCode]?.owned)
  }, [activeAlbum, savedStickers])

  const updateStickerLocal = useCallback((code, updates) => {
    const normalizedCode = normalizeCodeForCatalog(code, activeAlbum)
    if (!normalizedCode) return

    setStickers(prev => {
      const current = normalizeSticker(prev[normalizedCode] || { owned: false, duplicates: 0 })
      let safeUpdates = { ...updates }
      const alreadySavedAsOwned = Boolean(savedStickers[normalizedCode]?.owned)

      if (alreadySavedAsOwned && safeUpdates.owned === false) {
        safeUpdates.owned = true
      }

      const nextOwned = safeUpdates.owned ?? current.owned
      if (!nextOwned) {
        safeUpdates.duplicates = 0
      }

      if (safeUpdates.duplicates !== undefined) {
        safeUpdates.duplicates = Math.max(0, Number(safeUpdates.duplicates) || 0)
      }

      const nextSticker = normalizeSticker({
        ...current,
        ...safeUpdates
      })

      const savedSticker = normalizeSticker(savedStickers[normalizedCode] || { owned: false, duplicates: 0 })

      setPendingChanges(previousPending => {
        const nextPending = { ...previousPending }
        if (stickersAreEqual(nextSticker, savedSticker)) {
          delete nextPending[normalizedCode]
        } else {
          nextPending[normalizedCode] = true
        }
        return nextPending
      })

      return {
        ...prev,
        [normalizedCode]: nextSticker
      }
    })
  }, [activeAlbum, savedStickers])

  const saveStickersByCodes = useCallback(async (codes = []) => {
    if (!user) return false

    const normalizedCodes = Array.from(new Set(
      codes.map(code => normalizeCodeForCatalog(code, activeAlbum)).filter(Boolean)
    ))

    if (normalizedCodes.length === 0) return false

    try {
      const updates = {}
      const savedSnapshotUpdates = {}

      normalizedCodes.forEach(code => {
        const current = stickers[code] || { owned: false, duplicates: 0 }
        updates[`${stickersPath}/${code}`] = current
        savedSnapshotUpdates[code] = normalizeSticker(current)
      })

      await update(ref(db), updates)
      setSavedStickers(prev => ({ ...prev, ...savedSnapshotUpdates }))
      setPendingChanges(prev => {
        const next = { ...prev }
        normalizedCodes.forEach(code => delete next[code])
        return next
      })
      setLastSaved(Date.now())
      return true
    } catch (err) {
      console.error('Error saving selected stickers:', err)
      alert('Error al guardar esta página. Tus cambios se conservaron localmente.')
      return false
    }
  }, [activeAlbum, stickers, stickersPath, user])

  const saveToCloud = useCallback(async () => {
    if (!user) return false

    try {
      const updates = {}
      Object.keys(pendingChanges).forEach(code => {
        updates[`${stickersPath}/${code}`] = stickers[code]
      })

      if (Object.keys(updates).length > 0) {
        await update(ref(db), updates)
        setSavedStickers(prev => {
          const next = { ...prev }
          Object.keys(pendingChanges).forEach(code => {
            next[code] = normalizeSticker(stickers[code])
          })
          return next
        })
        setPendingChanges({})
        setLastSaved(Date.now())
      }

      return true
    } catch (err) {
      console.error('Error saving to cloud:', err)
      alert('Error al guardar en la nube. Tus cambios se guardaron localmente.')
      return false
    }
  }, [pendingChanges, stickers, stickersPath, user])

  const saveTeamPage = useCallback(async (teamCode) => {
    if (!user) return false

    try {
      const updates = {}
      const savedSnapshotUpdates = {}

      const group = activeAlbum.albumGroups.find(item => (
        item.id === teamCode || item.team === teamCode
      ))
      const pageCodes = new Set(group?.codes || [])

      Object.keys(stickers).forEach(code => {
        const belongsToPage = pageCodes.has(code)

        if (belongsToPage) {
          updates[`${stickersPath}/${code}`] = stickers[code]
          savedSnapshotUpdates[code] = normalizeSticker(stickers[code])
        }
      })

      if (Object.keys(updates).length > 0) {
        await update(ref(db), updates)
        setSavedStickers(prev => ({ ...prev, ...savedSnapshotUpdates }))
        setPendingChanges(prev => {
          const next = { ...prev }
          Object.keys(savedSnapshotUpdates).forEach(code => delete next[code])
          return next
        })
        setLastSaved(Date.now())
        return true
      }

      return false
    } catch (err) {
      console.error('Error saving team page:', err)
      return false
    }
  }, [activeAlbum.albumGroups, stickers, stickersPath, user])

  const deleteSavedSticker = useCallback(async (code) => {
    if (!user) {
      throw new Error('Debes iniciar sesión para eliminar una tarjeta guardada.')
    }

    const normalizedCode = normalizeCodeForCatalog(code, activeAlbum)
    if (!normalizedCode) return false

    const removedSticker = { owned: false, duplicates: 0 }

    await update(ref(db), {
      [`${stickersPath}/${normalizedCode}`]: removedSticker
    })

    setStickers(prev => ({
      ...prev,
      [normalizedCode]: removedSticker
    }))

    setSavedStickers(prev => ({
      ...prev,
      [normalizedCode]: removedSticker
    }))

    setPendingChanges(prev => {
      const next = { ...prev }
      delete next[normalizedCode]
      return next
    })

    setLastSaved(Date.now())
    return true
  }, [activeAlbum, stickersPath, user])

  const applyManualTrade = useCallback(async ({
    receivedCodes = [],
    deliveredCodes = [],
    history = null
  } = {}) => {
    if (!user) {
      throw new Error('Debes iniciar sesión para registrar un intercambio.')
    }

    const received = Array.from(new Set(
      receivedCodes.map(code => normalizeCodeForCatalog(code, activeAlbum)).filter(Boolean)
    ))
    const delivered = Array.from(new Set(
      deliveredCodes.map(code => normalizeCodeForCatalog(code, activeAlbum)).filter(Boolean)
    ))

    const nextByCode = {}
    const appliedReceived = []
    const appliedDelivered = []

    received.forEach(code => {
      const current = normalizeSticker(stickers[code] || { owned: false, duplicates: 0 })
      if (current.owned) return

      nextByCode[code] = { owned: true, duplicates: current.duplicates }
      appliedReceived.push(code)
    })

    delivered.forEach(code => {
      const current = normalizeSticker(nextByCode[code] || stickers[code] || { owned: false, duplicates: 0 })
      if (!current.owned || current.duplicates <= 0) return

      nextByCode[code] = { owned: true, duplicates: current.duplicates - 1 }
      appliedDelivered.push(code)
    })

    const changedCodes = Object.keys(nextByCode)
    if (changedCodes.length === 0) {
      return { success: false, received: [], delivered: [] }
    }

    const updates = {}
    changedCodes.forEach(code => {
      updates[`${stickersPath}/${code}`] = nextByCode[code]
    })

    if (history) {
      const tradeId = createManualTradeId(user.id)
      if (!tradeId) throw new Error('No se pudo preparar el historial del intercambio.')

      const historyUpdates = await buildTradeHistoryUpdates({
        uid: user.id,
        tradeId,
        mode: history.mode || 'manual',
        role: history.role || 'self',
        partnerId: history.partnerId || '',
        partnerName: history.partnerName || '',
        received: appliedReceived,
        delivered: appliedDelivered,
        source: history.source || history.mode || 'manual',
        status: history.status || 'completed',
        hostConfirmation: history.hostConfirmation || '',
        protocol: history.protocol || ''
      })

      Object.assign(updates, historyUpdates)
    }

    await update(ref(db), updates)

    setStickers(previous => ({ ...previous, ...nextByCode }))
    setSavedStickers(previous => ({ ...previous, ...nextByCode }))
    setPendingChanges(previous => {
      const next = { ...previous }
      changedCodes.forEach(code => delete next[code])
      return next
    })
    setLastSaved(Date.now())

    return {
      success: true,
      received: appliedReceived,
      delivered: appliedDelivered
    }
  }, [activeAlbum, stickers, stickersPath, user])

  const replaceStickersFromExternalImport = useCallback((nextStickers = {}) => {
    if (!user) return false

    const merged = mergeCloudStickers(nextStickers, activeAlbum)
    setStickers(merged)
    setSavedStickers(merged)
    setPendingChanges({})
    setLastSaved(Date.now())

    try {
      localStorage.setItem(localBackupKey(user.id, activeAlbum.id), JSON.stringify(merged))
    } catch (storageError) {
      console.warn('No se pudo actualizar el respaldo local de la importación:', storageError)
    }

    return true
  }, [activeAlbum, user])

  const getOwnedStickers = useCallback(() => {
    return STANDARD_CODES.filter(code => savedStickers[code]?.owned)
  }, [savedStickers])

  const getMissingStickers = useCallback(() => {
    return STANDARD_CODES.filter(code => !savedStickers[code]?.owned)
  }, [savedStickers])

  const getDuplicates = useCallback(() => {
    return Object.entries(savedStickers)
      .filter(([_, v]) => Number(v?.duplicates || 0) > 0)
      .map(([code, v]) => ({ code, duplicates: Number(v.duplicates) || 0 }))
      .sort((a, b) => {
        const indexA = getOrderedIndex(a.code)
        const indexB = getOrderedIndex(b.code)
        return indexA - indexB || a.code.localeCompare(b.code)
      })
  }, [savedStickers])

  const getStats = useCallback(() => {
    const total = STANDARD_CODES.length
    const owned = STANDARD_CODES.filter(code => savedStickers[code]?.owned).length
    const duplicates = Object.values(savedStickers).reduce((sum, v) => sum + (Number(v?.duplicates) || 0), 0)
    return { total, owned, duplicates, missing: total - owned }
  }, [savedStickers])

  return (
    <StickersContext.Provider value={{
      stickers,
      savedStickers,
      isStickerLocked,
      updateStickerLocal,
      deleteSavedSticker,
      applyManualTrade,
      replaceStickersFromExternalImport,
      saveStickersByCodes,
      saveToCloud,
      saveTeamPage,
      getOwnedStickers,
      getMissingStickers,
      getDuplicates,
      getStats,
      lastSaved,
      pendingChanges
    }}>
      {children}
    </StickersContext.Provider>
  )
}

export const useStickers = () => useContext(StickersContext)
