export const teams = [
  "MEX","RSA","KOR","CZE","CAN","BIH","QAT","SUI","BRA","MAR","HAI","SCO",
  "USA","PAR","AUS","TUR","GER","CUW","CIV","ECU","NED","JPN","SWE","TUN",
  "BEL","EGY","IRN","NZL","ESP","CPV","KSA","URU","FRA","SEN","IRQ","NOR",
  "ARG","ALG","AUT","JOR","POR","COD","UZB","COL","ENG","CRO","GHA","PAN","CC"
]

export const stickerCountByTeam = {
  CC: 14
}

export const getTeamStickerCount = (team) => stickerCountByTeam[team] || 20

export const specials = [
  "00",
  ...Array.from({ length: 19 }, (_, i) => `FWC${i + 1}`)
]

export const teamNames = {
  MEX: "🇲🇽 Mexico (México)",
  RSA: "🇿🇦 South Africa (Sudáfrica)",
  KOR: "🇰🇷 Korea Republic (Corea del Sur)",
  CZE: "🇨🇿 Czechia (República Checa)",
  CAN: "🇨🇦 Canada (Canadá)",
  BIH: "🇧🇦 Bosnia",
  QAT: "🇶🇦 Qatar (Catar)",
  SUI: "🇨🇭 Switzerland (Suiza)",
  BRA: "🇧🇷 Brazil (Brasil)",
  MAR: "🇲🇦 Morocco (Marruecos)",
  HAI: "🇭🇹 Haiti (Haití)",
  SCO: "🏴 Scotland (Escocia)",
  USA: "🇺🇸 United States (Estados Unidos)",
  PAR: "🇵🇾 Paraguay",
  AUS: "🇦🇺 Australia",
  TUR: "🇹🇷 Türkiye (Turquía)",
  GER: "🇩🇪 Germany (Alemania)",
  CUW: "🇨🇼 Curaçao (Curazao)",
  CIV: "🇨🇮 Côte D'Ivoire (Costa de Marfil)",
  ECU: "🇪🇨 Ecuador",
  NED: "🇳🇱 Netherlands (Países Bajos)",
  JPN: "🇯🇵 Japan (Japón)",
  SWE: "🇸🇪 Sweden (Suecia)",
  TUN: "🇹🇳 Tunisia (Túnez)",
  BEL: "🇧🇪 Belgium (Bélgica)",
  EGY: "🇪🇬 Egypt (Egipto)",
  IRN: "🇮🇷 IR Iran (Irán)",
  NZL: "🇳🇿 New Zealand (Nueva Zelanda)",
  ESP: "🇪🇸 Spain (España)",
  CPV: "🇨🇻 Cabo Verde",
  KSA: "🇸🇦 Saudi Arabia (Arabia Saudita)",
  URU: "🇺🇾 Uruguay",
  FRA: "🇫🇷 France (Francia)",
  SEN: "🇸🇳 Senegal",
  IRQ: "🇮🇶 Iraq (Irak)",
  NOR: "🇳🇴 Norway (Noruega)",
  ARG: "🇦🇷 Argentina",
  ALG: "🇩🇿 Algeria (Argelia)",
  AUT: "🇦🇹 Austria",
  JOR: "🇯🇴 Jordan (Jordania)",
  POR: "🇵🇹 Portugal",
  COD: "🇨🇩 DR Congo (RD Congo)",
  UZB: "🇺🇿 Uzbekistan (Uzbekistán)",
  COL: "🇨🇴 Colombia",
  ENG: "🏴 England (Inglaterra)",
  CRO: "🇭🇷 Croatia (Croacia)",
  GHA: "🇬🇭 Ghana",
  PAN: "🇵🇦 Panama (Panamá)",
  CC: "🎁 Coca-Cola"
}


export const getAlbumPageRange = (team) => {
  if (!team) return { start: 0, end: 7 }
  const index = teams.indexOf(team)
  if (index < 0) return { start: null, end: null }

  // México inicia en 08-09. Cada selección ocupa 2 páginas.
  // Después de Tunisia (Túnez), el álbum físico tiene una doble página sin stickers,
  // por eso la siguiente selección continúa recién en 58-59.
  const tunIndex = teams.indexOf('TUN')
  const blankSpreadOffset = index > tunIndex ? 2 : 0
  const start = 8 + (index * 2) + blankSpreadOffset

  return { start, end: start + 1 }
}

export const getAlbumPageLabel = (team) => {
  const { start, end } = getAlbumPageRange(team)
  if (start === null || end === null) return ''
  return `${String(start).padStart(2, '0')}-${String(end).padStart(2, '0')}`
}

export const normalizeSearchText = (value = '') => {
  return String(value)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ç/gi, 'c')
    .toUpperCase()
    .trim()
}

export const getAllStickers = () => {
  const stickers = []
  specials.forEach(code => stickers.push({ code, team: null, type: code === '00' ? 'logo' : 'special' }))
  teams.forEach(team => {
    const count = getTeamStickerCount(team)
    for (let i = 1; i <= count; i++) {
      stickers.push({ code: `${team}${i}`, team, type: team === 'CC' ? 'collection' : 'team' })
    }
  })
  return stickers
}

export const getPageFromCode = (code) => {
  if (code === '00') return { type: 'logo', team: null }
  if (code.startsWith('FWC')) return { type: 'special', team: null }
  const match = code.match(/^([A-Z]{2,3})\d+$/)
  if (match && teams.includes(match[1])) {
    const team = match[1]
    return { type: team === 'CC' ? 'collection' : 'team', team }
  }
  return { type: 'extras', team: null }
}

export const allStickersOrdered = getAllStickers().map(s => s.code)
