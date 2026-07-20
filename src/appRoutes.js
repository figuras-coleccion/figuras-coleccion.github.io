export const ALBUM_PATH = 'coleccion'
export const ALBUM_ROUTE = `/${ALBUM_PATH}`
export const LEGACY_ALBUM_PATH = 'album'

export function albumRoute(search = '', hash = '') {
  return `${ALBUM_ROUTE}${search || ''}${hash || ''}`
}

export function buildAppPath(route = '/', search = '', hash = '') {
  const base = import.meta.env.BASE_URL || '/'
  const normalizedBase = base.endsWith('/') ? base : `${base}/`
  const normalizedRoute = String(route || '/').replace(/^\/+/, '')
  return `${normalizedBase}${normalizedRoute}${search || ''}${hash || ''}`
}

export function buildAbsoluteAppUrl(route = '/', search = '', hash = '') {
  return `${window.location.origin}${buildAppPath(route, search, hash)}`
}
