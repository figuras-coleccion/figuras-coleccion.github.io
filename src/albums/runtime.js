import {
  ACTIVE_ALBUM_STORAGE_KEY,
  DEFAULT_ALBUM_ID,
  VALID_ALBUM_IDS
} from './constants.js'

export function normalizeAlbumId(value) {
  const candidate = String(value || '').trim()
  return VALID_ALBUM_IDS.has(candidate) ? candidate : DEFAULT_ALBUM_ID
}

export function getStoredActiveAlbumId() {
  try {
    return normalizeAlbumId(localStorage.getItem(ACTIVE_ALBUM_STORAGE_KEY))
  } catch {
    return DEFAULT_ALBUM_ID
  }
}

export function setStoredActiveAlbumId(albumId) {
  const normalized = normalizeAlbumId(albumId)
  try {
    localStorage.setItem(ACTIVE_ALBUM_STORAGE_KEY, normalized)
  } catch {
    // Firebase remains the source of truth when local storage is unavailable.
  }
  return normalized
}

export function getAlbumChildPath(uid, child, albumId = getStoredActiveAlbumId()) {
  const normalizedUid = String(uid || '').trim()
  const normalizedChild = String(child || '').replace(/^\/+|\/+$/g, '')
  const normalizedAlbumId = normalizeAlbumId(albumId)

  if (!normalizedUid) return ''
  if (normalizedAlbumId === DEFAULT_ALBUM_ID) {
    return `users/${normalizedUid}/${normalizedChild}`
  }
  return `users/${normalizedUid}/albums/${normalizedAlbumId}/${normalizedChild}`
}

export function getAlbumRecordFromUser(userRecord = {}, albumId = getStoredActiveAlbumId()) {
  const normalizedAlbumId = normalizeAlbumId(albumId)
  if (normalizedAlbumId === DEFAULT_ALBUM_ID) return userRecord || {}
  return userRecord?.albums?.[normalizedAlbumId] || {}
}

export function getAlbumStickersFromUser(userRecord = {}, albumId = getStoredActiveAlbumId()) {
  return getAlbumRecordFromUser(userRecord, albumId)?.stickers || {}
}

export function getProfileActiveAlbumId(profile = {}) {
  return normalizeAlbumId(profile?.activeAlbumId || DEFAULT_ALBUM_ID)
}

export function isProfileUsingAlbum(profile = {}, albumId = getStoredActiveAlbumId()) {
  return getProfileActiveAlbumId(profile) === normalizeAlbumId(albumId)
}
