import { THREE_REYES_ALBUM_ID } from '../constants.js'

function numericCodes(start, end) {
  return Array.from({ length: end - start + 1 }, (_, index) => String(start + index))
}

function prefixedCodes(prefix, count) {
  return Array.from({ length: count }, (_, index) => `${prefix}${index + 1}`)
}

const sectionDefinitions = [
  { id: 'initial', title: 'Figura inicial', shortCode: '0', type: 'special', placement: 'leading', codes: ['0'] },
  { id: 'stadiums', title: 'Estadios', shortCode: 'EST', type: 'special', placement: 'leading', codes: numericCodes(1, 16) },
  { id: 'team-mex', team: 'MEX', title: 'México', flagCode: 'mx', start: 17, end: 32 },
  { id: 'team-cze', team: 'CZE', title: 'República Checa', flagCode: 'cz', start: 33, end: 48 },
  { id: 'team-kor', team: 'KOR', title: 'Corea del Sur', flagCode: 'kr', start: 49, end: 55 },
  { id: 'team-rsa', team: 'RSA', title: 'Sudáfrica', flagCode: 'za', start: 56, end: 62 },
  { id: 'team-can', team: 'CAN', title: 'Canadá', flagCode: 'ca', start: 63, end: 78 },
  { id: 'team-bih', team: 'BIH', title: 'Bosnia y Herzegovina', flagCode: 'ba', start: 79, end: 94 },
  { id: 'team-sui', team: 'SUI', title: 'Suiza', flagCode: 'ch', start: 95, end: 101 },
  { id: 'team-qat', team: 'QAT', title: 'Catar', flagCode: 'qa', start: 102, end: 108 },
  { id: 'team-bra', team: 'BRA', title: 'Brasil', flagCode: 'br', start: 109, end: 124 },
  { id: 'team-mar', team: 'MAR', title: 'Marruecos', flagCode: 'ma', start: 125, end: 140 },
  { id: 'team-sco', team: 'SCO', title: 'Escocia', flagCode: 'gb-sct', start: 141, end: 147 },
  { id: 'team-hai', team: 'HAI', title: 'Haití', flagCode: 'ht', start: 148, end: 154 },
  { id: 'team-usa', team: 'USA', title: 'Estados Unidos', flagCode: 'us', start: 155, end: 170 },
  { id: 'team-par', team: 'PAR', title: 'Paraguay', flagCode: 'py', start: 171, end: 186 },
  { id: 'team-aus', team: 'AUS', title: 'Australia', flagCode: 'au', start: 187, end: 193 },
  { id: 'team-tur', team: 'TUR', title: 'Turquía', flagCode: 'tr', start: 194, end: 200 },
  { id: 'team-ger', team: 'GER', title: 'Alemania', flagCode: 'de', start: 201, end: 216 },
  { id: 'team-ecu', team: 'ECU', title: 'Ecuador', flagCode: 'ec', start: 217, end: 232 },
  { id: 'team-civ', team: 'CIV', title: 'Costa de Marfil', flagCode: 'ci', start: 233, end: 239 },
  { id: 'team-cuw', team: 'CUW', title: 'Curazao', flagCode: 'cw', start: 240, end: 246 },
  { id: 'team-ned', team: 'NED', title: 'Países Bajos', flagCode: 'nl', start: 247, end: 262 },
  { id: 'team-swe', team: 'SWE', title: 'Suecia', flagCode: 'se', start: 263, end: 278 },
  { id: 'team-jpn', team: 'JPN', title: 'Japón', flagCode: 'jp', start: 279, end: 285 },
  { id: 'team-tun', team: 'TUN', title: 'Túnez', flagCode: 'tn', start: 286, end: 292 },
  { id: 'team-bel', team: 'BEL', title: 'Bélgica', flagCode: 'be', start: 293, end: 308 },
  { id: 'team-egy', team: 'EGY', title: 'Egipto', flagCode: 'eg', start: 309, end: 324 },
  { id: 'team-irn', team: 'IRN', title: 'Irán', flagCode: 'ir', start: 325, end: 331 },
  { id: 'team-nzl', team: 'NZL', title: 'Nueva Zelanda', flagCode: 'nz', start: 332, end: 338 },
  { id: 'team-esp', team: 'ESP', title: 'España', flagCode: 'es', start: 339, end: 354 },
  { id: 'team-uru', team: 'URU', title: 'Uruguay', flagCode: 'uy', start: 355, end: 370 },
  { id: 'team-cpv', team: 'CPV', title: 'Cabo Verde', flagCode: 'cv', start: 371, end: 377 },
  { id: 'team-ksa', team: 'KSA', title: 'Arabia Saudita', flagCode: 'sa', start: 378, end: 384 },
  { id: 'team-fra', team: 'FRA', title: 'Francia', flagCode: 'fr', start: 385, end: 400 },
  { id: 'team-nor', team: 'NOR', title: 'Noruega', flagCode: 'no', start: 401, end: 416 },
  { id: 'team-sen', team: 'SEN', title: 'Senegal', flagCode: 'sn', start: 417, end: 423 },
  { id: 'team-irq', team: 'IRQ', title: 'Irak', flagCode: 'iq', start: 424, end: 430 },
  { id: 'team-arg', team: 'ARG', title: 'Argentina', flagCode: 'ar', start: 431, end: 446 },
  { id: 'team-aut', team: 'AUT', title: 'Austria', flagCode: 'at', start: 447, end: 453 },
  { id: 'team-jor', team: 'JOR', title: 'Jordania', flagCode: 'jo', start: 454, end: 460 },
  { id: 'team-alg', team: 'ALG', title: 'Argelia', flagCode: 'dz', start: 461, end: 476 },
  { id: 'team-por', team: 'POR', title: 'Portugal', flagCode: 'pt', start: 477, end: 492 },
  { id: 'team-col', team: 'COL', title: 'Colombia', flagCode: 'co', start: 493, end: 508 },
  { id: 'team-uzb', team: 'UZB', title: 'Uzbekistán', flagCode: 'uz', start: 509, end: 515 },
  { id: 'team-cod', team: 'COD', title: 'R.D. Congo', flagCode: 'cd', start: 516, end: 522 },
  { id: 'team-eng', team: 'ENG', title: 'Inglaterra', flagCode: 'gb-eng', start: 523, end: 538 },
  { id: 'team-cro', team: 'CRO', title: 'Croacia', flagCode: 'hr', start: 539, end: 554 },
  { id: 'team-gha', team: 'GHA', title: 'Ghana', flagCode: 'gh', start: 555, end: 561 },
  { id: 'team-pan', team: 'PAN', title: 'Panamá', flagCode: 'pa', start: 562, end: 568 },
  { id: 'world-champions', title: 'Campeones del Mundo', shortCode: 'CM', type: 'special', placement: 'trailing', codes: numericCodes(569, 580) },
  { id: 'first-world-cup', title: 'Primera vez en el Mundial', shortCode: '1RA', type: 'special', placement: 'trailing', codes: numericCodes(581, 584) },
  { id: 'new-qualified', title: 'Nuevos equipos clasificados', shortCode: 'A-F', type: 'special', placement: 'trailing', codes: ['A', 'B', 'C', 'D', 'E', 'F'] },
  { id: 'playoffs', title: 'Repechaje', shortCode: 'E', type: 'special', placement: 'trailing', codes: prefixedCodes('E', 66) },
  { id: 'shields', title: 'Escudos troquelados', shortCode: 'T', type: 'special', placement: 'trailing', codes: prefixedCodes('T', 48) }
]

const albumGroups = sectionDefinitions.map(section => ({
  ...section,
  type: section.type || 'country',
  placement: section.placement || 'country',
  shortCode: section.shortCode || section.team || section.id.toUpperCase(),
  codes: section.codes || numericCodes(section.start, section.end)
}))

const allStickersOrdered = [
  '0',
  ...numericCodes(1, 584),
  'A', 'B', 'C', 'D', 'E', 'F',
  ...prefixedCodes('E', 66),
  ...prefixedCodes('T', 48)
]

if (allStickersOrdered.length !== 705) {
  throw new Error(`Catálogo 3 Reyes inválido: ${allStickersOrdered.length} figuritas`)
}

if (new Set(allStickersOrdered).size !== allStickersOrdered.length) {
  throw new Error('Catálogo 3 Reyes inválido: existen códigos duplicados')
}

const groupByCode = new Map()
albumGroups.forEach(group => group.codes.forEach(code => groupByCode.set(code, group)))

const teams = albumGroups.filter(group => group.type === 'country').map(group => group.team)
const teamNames = Object.fromEntries(
  albumGroups.filter(group => group.team).map(group => [group.team, group.title])
)
const stickerCountByTeam = Object.fromEntries(
  albumGroups.filter(group => group.team).map(group => [group.team, group.codes.length])
)
const specialGroups = albumGroups.filter(group => group.type === 'special')
const specials = specialGroups.flatMap(group => group.codes)
const irregularCodeSet = new Set(['0', 'A', 'B', 'C', 'D', 'E', 'F', ...prefixedCodes('E', 66), ...prefixedCodes('T', 48)])

function getTeamStickerCount(team) {
  return stickerCountByTeam[team] || 0
}

function getAllStickers() {
  return allStickersOrdered.map(code => {
    const group = groupByCode.get(code)
    return {
      code,
      team: group?.team || null,
      type: group?.type || 'special',
      groupId: group?.id || 'extras'
    }
  })
}

function getPageFromCode(code) {
  const normalized = String(code || '').trim().toUpperCase().replace(/^(E|T)-(?=\d)/, '$1')
  const group = groupByCode.get(normalized)
  if (!group) return { type: 'extras', team: null, groupId: 'extras' }
  return { type: group.type, team: group.team || null, groupId: group.id }
}

export const threeReyesCatalog = {
  id: THREE_REYES_ALBUM_ID,
  catalogVersion: 1,
  title: 'Mundial 2026 - 3 Reyes',
  shortTitle: 'Mundial 2026 - 3 Reyes',
  brandTitleLines: ['Mundial 2026', '3 Reyes'],
  publisher: '3 Reyes',
  edition: 'Versión completa de 705 figuritas',
  icon: 'albums/mundial-2026-3-reyes-705/icon.svg',
  totalStickers: 705,
  allStickersOrdered,
  albumGroups,
  teams,
  teamNames,
  specials,
  stickerCountByTeam,
  getTeamStickerCount,
  getAllStickers,
  getPageFromCode,
  getAlbumPageRange: () => ({ start: null, end: null }),
  getAlbumPageLabel: () => '',
  irregularCodeSet,
  highlightGroupIds: ['new-qualified', 'playoffs', 'shields']
}
