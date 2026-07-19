import { paniniCatalog } from './panini-world-cup-2026/catalog.js'
import { threeReyesCatalog } from './mundial-2026-3-reyes-705/catalog.js'
import { DEFAULT_ALBUM_ID } from './constants.js'
import { getStoredActiveAlbumId, normalizeAlbumId } from './runtime.js'

export const availableAlbums = [paniniCatalog, threeReyesCatalog]

const albumsById = Object.fromEntries(availableAlbums.map(album => [album.id, album]))

export function getAlbumCatalog(albumId = DEFAULT_ALBUM_ID) {
  return albumsById[normalizeAlbumId(albumId)] || paniniCatalog
}

export function getActiveAlbumCatalog() {
  return getAlbumCatalog(getStoredActiveAlbumId())
}

export { DEFAULT_ALBUM_ID }
