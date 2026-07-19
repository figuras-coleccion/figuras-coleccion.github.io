import { getActiveAlbumCatalog } from '../albums/catalog.js'

export const activeAlbumCatalog = getActiveAlbumCatalog()
export const teams = activeAlbumCatalog.teams
export const teamNames = activeAlbumCatalog.teamNames
export const specials = activeAlbumCatalog.specials
export const stickerCountByTeam = activeAlbumCatalog.stickerCountByTeam
export const allStickersOrdered = activeAlbumCatalog.allStickersOrdered
export const albumGroups = activeAlbumCatalog.albumGroups

export const getTeamStickerCount = team => activeAlbumCatalog.getTeamStickerCount(team)
export const getAllStickers = () => activeAlbumCatalog.getAllStickers()
export const getPageFromCode = code => activeAlbumCatalog.getPageFromCode(code)
export const getAlbumPageRange = team => activeAlbumCatalog.getAlbumPageRange(team)
export const getAlbumPageLabel = team => activeAlbumCatalog.getAlbumPageLabel(team)

export const normalizeSearchText = (value = '') => {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ç/gi, 'c')
    .toUpperCase()
    .trim()
}
