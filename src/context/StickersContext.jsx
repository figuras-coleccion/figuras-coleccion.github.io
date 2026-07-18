import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useUser } from './UserContext'
import { db, ref, get, update } from '../firebase'
import { getAllStickers } from '../data/stickersData'

const StickersContext = createContext()

const STANDARD_STICKERS = getAllStickers()
const STANDARD_CODES = STANDARD_STICKERS.map(s => s.code)
const STANDARD_CODE_SET = new Set(STANDARD_CODES)

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
  return STANDARD_CODE_SET.has(code) ? STANDARD_CODES.indexOf(code) : Number.MAX_SAFE_INTEGER
}

function mergeCloudStickers(data = {}) {
  const merged = { ...EMPTY_STICKERS }

  Object.entries(data).forEach(([code, value]) => {
    if (!code || typeof value !== 'object' || value === null) return
    merged[code] = normalizeSticker(value)
  })

  return merged
}

export function StickersProvider({ children }) {
  const { user } = useUser()
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
        const snapshot = await get(ref(db, `users/${user.id}/stickers`))
        if (snapshot.exists()) {
          const cloudStickers = mergeCloudStickers(snapshot.val())
          setStickers(cloudStickers)
          setSavedStickers(cloudStickers)
        } else {
          setStickers({ ...EMPTY_STICKERS })
          setSavedStickers({ ...EMPTY_STICKERS })
        }
      } catch (err) {
        console.error('Error loading stickers:', err)
        try {
          const saved = localStorage.getItem(`panini_stickers_${user.id}`)
          if (saved) {
            const localBackup = mergeCloudStickers(JSON.parse(saved))
            setStickers(localBackup)
            setSavedStickers({ ...EMPTY_STICKERS })
          } else {
            setStickers({ ...EMPTY_STICKERS })
            setSavedStickers({ ...EMPTY_STICKERS })
          }
        } catch (localErr) {
          console.warn('Backup local corrupto. Se usará lista vacía.', localErr)
          localStorage.removeItem(`panini_stickers_${user.id}`)
          setStickers({ ...EMPTY_STICKERS })
          setSavedStickers({ ...EMPTY_STICKERS })
        }
      }
    }

    loadStickers()
  }, [user])

  useEffect(() => {
    if (user) {
      localStorage.setItem(`panini_stickers_${user.id}`, JSON.stringify(stickers))
    }
  }, [stickers, user])

  const isStickerLocked = useCallback((code) => {
    const normalizedCode = String(code || '').trim().toUpperCase()
    return Boolean(savedStickers[normalizedCode]?.owned)
  }, [savedStickers])

  const updateStickerLocal = useCallback((code, updates) => {
    const normalizedCode = String(code || '').trim().toUpperCase()
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
  }, [savedStickers])

  const saveStickersByCodes = useCallback(async (codes = []) => {
    if (!user) return false

    const normalizedCodes = Array.from(new Set(
      codes.map(code => String(code || '').trim().toUpperCase()).filter(Boolean)
    ))

    if (normalizedCodes.length === 0) return false

    try {
      const updates = {}
      const savedSnapshotUpdates = {}

      normalizedCodes.forEach(code => {
        const current = stickers[code] || { owned: false, duplicates: 0 }
        updates[`users/${user.id}/stickers/${code}`] = current
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
  }, [user, stickers])

  const saveToCloud = useCallback(async () => {
    if (!user) return false

    try {
      const updates = {}
      Object.keys(pendingChanges).forEach(code => {
        updates[`users/${user.id}/stickers/${code}`] = stickers[code]
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
  }, [user, stickers, pendingChanges])

  const saveTeamPage = useCallback(async (teamCode) => {
    if (!user) return false

    try {
      const updates = {}
      const savedSnapshotUpdates = {}

      Object.keys(stickers).forEach(code => {
        const belongsToPage =
          (teamCode === 'specials' && (code.startsWith('FWC') || code === '00')) ||
          (teamCode === 'logo' && code === '00') ||
          (teamCode !== 'specials' && teamCode !== 'logo' && code.startsWith(teamCode))

        if (belongsToPage) {
          updates[`users/${user.id}/stickers/${code}`] = stickers[code]
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
  }, [user, stickers])

  const deleteSavedSticker = useCallback(async (code) => {
    if (!user) {
      throw new Error('Debes iniciar sesión para eliminar una tarjeta guardada.')
    }

    const normalizedCode = String(code || '').trim().toUpperCase()
    if (!normalizedCode) return false

    const removedSticker = { owned: false, duplicates: 0 }

    await update(ref(db), {
      [`users/${user.id}/stickers/${normalizedCode}`]: removedSticker
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
  }, [user])

  const applyManualTrade = useCallback(async ({ receivedCodes = [], deliveredCodes = [] } = {}) => {
    if (!user) {
      throw new Error('Debes iniciar sesión para registrar un intercambio.')
    }

    const received = Array.from(new Set(
      receivedCodes.map(code => String(code || '').trim().toUpperCase()).filter(Boolean)
    ))
    const delivered = Array.from(new Set(
      deliveredCodes.map(code => String(code || '').trim().toUpperCase()).filter(Boolean)
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
      updates[`users/${user.id}/stickers/${code}`] = nextByCode[code]
    })

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
  }, [user, stickers])

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
