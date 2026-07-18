import { teams, teamNames, getTeamStickerCount } from './stickersData'

const FWC_GROUPS = [
  {
    id: 'fwc-specials',
    title: 'FWC - Especiales 🏆',
    codes: ['00', 'FWC1', 'FWC2', 'FWC3', 'FWC4']
  },
  {
    id: 'fwc-ball-countries',
    title: 'FWC - Balón ⚽ y Países 🌎',
    codes: ['FWC5', 'FWC6', 'FWC7', 'FWC8']
  },
  {
    id: 'fwc-history',
    title: 'FWC - Historia 📜',
    codes: Array.from({ length: 11 }, (_, index) => `FWC${index + 9}`)
  }
]

function splitTeamName(value = '') {
  const raw = String(value).trim()
  const parts = raw.split(/\s+/)
  const flag = parts[0] || ''
  const withoutFlag = parts.slice(1).join(' ').trim()
  const spanishMatch = withoutFlag.match(/\(([^)]+)\)\s*$/)
  const name = spanishMatch ? spanishMatch[1] : withoutFlag

  return {
    flag,
    name: name || raw
  }
}

export function getTeamDisplayTitle(team) {
  const { flag, name } = splitTeamName(teamNames[team] || team)
  return `${team} - ${name}${flag ? ` ${flag}` : ''}`
}

export function buildAlbumGroups() {
  return [
    ...FWC_GROUPS,
    ...teams.map(team => ({
      id: `team-${team.toLowerCase()}`,
      team,
      title: getTeamDisplayTitle(team),
      codes: Array.from({ length: getTeamStickerCount(team) }, (_, index) => `${team}${index + 1}`)
    }))
  ]
}

export function getStickerDisplayNumber(code = '') {
  const normalized = String(code).trim().toUpperCase()
  if (normalized === '00') return '00'

  const match = normalized.match(/(\d+)$/)
  return match ? String(Number(match[1])) : normalized
}

export function isIrregularStickerCode(code = '') {
  const normalized = String(code).trim().toUpperCase()
  if (normalized === '00') return true
  if (/^FWC[1-4]$/.test(normalized)) return true

  const match = normalized.match(/^[A-Z]{2,3}(\d+)$/)
  return Boolean(match && Number(match[1]) === 1)
}

export function getAlbumGroupIdFromLegacyPage(pageNumber) {
  const page = Number(pageNumber)
  if (!Number.isFinite(page) || page <= 1) return 'fwc-specials'

  const team = teams[page - 2]
  return team ? `team-${team.toLowerCase()}` : 'fwc-specials'
}
