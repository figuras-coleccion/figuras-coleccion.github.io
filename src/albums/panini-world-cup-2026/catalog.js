import {
  allStickersOrdered,
  getAlbumPageLabel,
  getAlbumPageRange,
  getAllStickers,
  getPageFromCode,
  getTeamStickerCount,
  specials,
  stickerCountByTeam,
  teamNames,
  teams
} from './stickersData.js'
import { DEFAULT_ALBUM_ID } from '../constants.js'

const flagCodeByTeam = {
  MEX: 'mx', RSA: 'za', KOR: 'kr', CZE: 'cz', CAN: 'ca', BIH: 'ba', QAT: 'qa', SUI: 'ch',
  BRA: 'br', MAR: 'ma', HAI: 'ht', SCO: 'gb-sct', USA: 'us', PAR: 'py', AUS: 'au', TUR: 'tr',
  GER: 'de', CUW: 'cw', CIV: 'ci', ECU: 'ec', NED: 'nl', JPN: 'jp', SWE: 'se', TUN: 'tn',
  BEL: 'be', EGY: 'eg', IRN: 'ir', NZL: 'nz', ESP: 'es', CPV: 'cv', KSA: 'sa', URU: 'uy',
  FRA: 'fr', SEN: 'sn', IRQ: 'iq', NOR: 'no', ARG: 'ar', ALG: 'dz', AUT: 'at', JOR: 'jo',
  POR: 'pt', COD: 'cd', UZB: 'uz', COL: 'co', ENG: 'gb-eng', CRO: 'hr', GHA: 'gh', PAN: 'pa'
}

function rangeCodes(prefix, count) {
  return Array.from({ length: count }, (_, index) => `${prefix}${index + 1}`)
}

const albumGroups = [
  {
    id: 'fwc-specials',
    title: 'FWC - Especiales 🏆',
    shortCode: 'FWC',
    type: 'special',
    placement: 'leading',
    codes: ['00', 'FWC1', 'FWC2', 'FWC3', 'FWC4']
  },
  {
    id: 'fwc-ball-countries',
    title: 'FWC - Balón ⚽ y Países 🌎',
    shortCode: 'FWC',
    type: 'special',
    placement: 'leading',
    codes: ['FWC5', 'FWC6', 'FWC7', 'FWC8']
  },
  {
    id: 'fwc-history',
    title: 'FWC - Historia 📜',
    shortCode: 'FWC',
    type: 'special',
    placement: 'leading',
    codes: Array.from({ length: 11 }, (_, index) => `FWC${index + 9}`)
  },
  ...teams.map(team => ({
    id: `team-${team.toLowerCase()}`,
    team,
    title: teamNames[team] || team,
    shortCode: team,
    type: team === 'CC' ? 'collection' : 'country',
    placement: team === 'CC' ? 'trailing' : 'country',
    flagCode: flagCodeByTeam[team] || '',
    codes: rangeCodes(team, getTeamStickerCount(team))
  }))
]

const irregularCodeSet = new Set([
  '00',
  ...Array.from({ length: 4 }, (_, index) => `FWC${index + 1}`),
  ...teams.map(team => `${team}1`)
])

export const paniniCatalog = {
  id: DEFAULT_ALBUM_ID,
  catalogVersion: 1,
  title: 'Panini World Cup 2026',
  shortTitle: 'Panini Mundial 2026',
  brandTitleLines: ['Panini World Cup 2026'],
  publisher: 'Panini',
  edition: 'Mundial 2026',
  icon: 'albums/panini-world-cup-2026/icon.svg',
  totalStickers: allStickersOrdered.length,
  allStickersOrdered,
  albumGroups,
  teams,
  teamNames,
  specials,
  stickerCountByTeam,
  getTeamStickerCount,
  getAllStickers,
  getPageFromCode,
  getAlbumPageRange,
  getAlbumPageLabel,
  irregularCodeSet,
  highlightGroupIds: ['fwc-specials', 'fwc-ball-countries', 'fwc-history']
}
