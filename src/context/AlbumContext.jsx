import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useUser } from './UserContext'
import { db, ref, update } from '../firebase'
import { availableAlbums, DEFAULT_ALBUM_ID, getAlbumCatalog } from '../albums/catalog'
import {
  getAlbumChildPath,
  getStoredActiveAlbumId,
  normalizeAlbumId,
  setStoredActiveAlbumId
} from '../albums/runtime'

const AlbumContext = createContext(null)

export function AlbumProvider({ children }) {
  const { user } = useUser()
  const [activeAlbumId, setActiveAlbumId] = useState(() => getStoredActiveAlbumId())

  useEffect(() => {
    if (!user?.id) return

    const profileAlbumId = normalizeAlbumId(user.activeAlbumId || DEFAULT_ALBUM_ID)
    const storedAlbumId = getStoredActiveAlbumId()

    if (!user.activeAlbumId) {
      void update(ref(db, `users/${user.id}/profile`), {
        activeAlbumId: DEFAULT_ALBUM_ID,
        activeAlbumInitializedAt: Date.now()
      })
    }

    if (profileAlbumId !== storedAlbumId) {
      setStoredActiveAlbumId(profileAlbumId)
      window.location.reload()
      return
    }

    setActiveAlbumId(profileAlbumId)
  }, [user?.activeAlbumId, user?.id])

  const activeAlbum = useMemo(() => getAlbumCatalog(activeAlbumId), [activeAlbumId])

  const changeAlbum = useCallback(async (nextAlbumId) => {
    if (!user?.id) throw new Error('Debes iniciar sesión para cambiar de álbum.')

    const normalized = normalizeAlbumId(nextAlbumId)
    const nextAlbum = getAlbumCatalog(normalized)
    const now = Date.now()
    const updates = {
      [`users/${user.id}/profile/activeAlbumId`]: normalized,
      [`users/${user.id}/profile/activeAlbumChangedAt`]: now
    }

    if (normalized !== DEFAULT_ALBUM_ID) {
      updates[`users/${user.id}/albums/${normalized}/meta`] = {
        albumId: normalized,
        title: nextAlbum.title,
        catalogVersion: nextAlbum.catalogVersion,
        lastOpenedAt: now
      }
    }

    await update(ref(db), updates)
    setStoredActiveAlbumId(normalized)
    setActiveAlbumId(normalized)
    return nextAlbum
  }, [user?.id])

  const value = useMemo(() => ({
    activeAlbumId,
    activeAlbum,
    availableAlbums,
    changeAlbum,
    getAlbumChildPath: (child, uid = user?.id, albumId = activeAlbumId) => (
      getAlbumChildPath(uid, child, albumId)
    )
  }), [activeAlbum, activeAlbumId, changeAlbum, user?.id])

  return <AlbumContext.Provider value={value}>{children}</AlbumContext.Provider>
}

export function useAlbum() {
  const context = useContext(AlbumContext)
  if (!context) throw new Error('useAlbum debe usarse dentro de AlbumProvider.')
  return context
}
