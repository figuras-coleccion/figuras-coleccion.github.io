import { activeAlbumCatalog, albumGroups } from './stickersData.js'

function splitTeamName(value = '') {
  const raw = String(value).trim()
  const parts = raw.split(/\s+/)
  const flag = parts[0] || ''
  const withoutFlag = parts.slice(1).join(' ').trim()
  const spanishMatch = withoutFlag.match(/\(([^)]+)\)\s*$/)
  const name = spanishMatch ? spanishMatch[1] : withoutFlag

  return { flag, name: name || raw }
}

export function getTeamDisplayTitle(team) {
  const group = albumGroups.find(item => item.team === team)
  if (group && activeAlbumCatalog.id !== 'panini-world-cup-2026') {
    return `${team} - ${group.title}`
  }

  const { flag, name } = splitTeamName(group?.title || team)
  return `${team} - ${name}${flag ? ` ${flag}` : ''}`
}

export function buildAlbumGroups() {
  return albumGroups.map(group => ({
    ...group,
    title: activeAlbumCatalog.id === 'panini-world-cup-2026' && group.team
      ? getTeamDisplayTitle(group.team)
      : group.title,
    codes: [...group.codes]
  }))
}

export function getAlbumGroup(groupId) {
  const normalized = String(groupId || '').trim().toLowerCase()
  return albumGroups.find(group => (
    group.id.toLowerCase() === normalized ||
    String(group.team || '').toLowerCase() === normalized
  )) || null
}

export function normalizeStickerCodeForActiveAlbum(code = '') {
  const normalized = String(code || '').trim().toUpperCase()
  return activeAlbumCatalog.normalizeStickerCode
    ? activeAlbumCatalog.normalizeStickerCode(normalized)
    : normalized
}

export function formatStickerDisplayCode(normalizedCode = '', albumId = activeAlbumCatalog.id) {
  const normalized = String(normalizedCode || '').trim().toUpperCase()
  if (normalized === '00' || normalized === '0') return normalized
  if (/^\d+$/.test(normalized)) return String(Number(normalized))

  // Panini muestra solo el número dentro de cada figura (FWC1 → 1, USA4 → 4).
  // Otros álbumes pueden usar letras como parte esencial del código visual
  // (E1–E66 y T-1–T-48 en 3 Reyes), por lo que deben conservarse completas.
  if (albumId !== 'panini-world-cup-2026') return normalized

  const match = normalized.match(/(\d+)$/)
  return match ? String(Number(match[1])) : normalized
}

export function getStickerDisplayNumber(code = '') {
  const normalized = normalizeStickerCodeForActiveAlbum(code)
  return formatStickerDisplayCode(normalized, activeAlbumCatalog.id)
}

export function isIrregularStickerCode(code = '') {
  const normalized = normalizeStickerCodeForActiveAlbum(code)
  return activeAlbumCatalog.irregularCodeSet.has(normalized)
}

export function getAlbumGroupIdFromLegacyPage(pageNumber) {
  if (activeAlbumCatalog.id !== 'panini-world-cup-2026') return albumGroups[0]?.id || ''

  const page = Number(pageNumber)
  if (!Number.isFinite(page) || page <= 1) return 'fwc-specials'

  const countries = albumGroups.filter(group => group.team)
  return countries[page - 2]?.id || 'fwc-specials'
}
