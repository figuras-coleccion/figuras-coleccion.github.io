import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStickers } from '../context/StickersContext'
import { useUser } from '../context/UserContext'
import { specials, teams, teamNames, getTeamStickerCount } from '../data/stickersData'

const flagCodeByTeam = {
  MEX: 'mx',
  RSA: 'za',
  KOR: 'kr',
  CZE: 'cz',
  CAN: 'ca',
  BIH: 'ba',
  QAT: 'qa',
  SUI: 'ch',
  BRA: 'br',
  MAR: 'ma',
  HAI: 'ht',
  SCO: 'gb-sct',
  USA: 'us',
  PAR: 'py',
  AUS: 'au',
  TUR: 'tr',
  GER: 'de',
  CUW: 'cw',
  CIV: 'ci',
  ECU: 'ec',
  NED: 'nl',
  JPN: 'jp',
  SWE: 'se',
  TUN: 'tn',
  BEL: 'be',
  EGY: 'eg',
  IRN: 'ir',
  NZL: 'nz',
  ESP: 'es',
  CPV: 'cv',
  KSA: 'sa',
  URU: 'uy',
  FRA: 'fr',
  SEN: 'sn',
  IRQ: 'iq',
  NOR: 'no',
  ARG: 'ar',
  ALG: 'dz',
  AUT: 'at',
  JOR: 'jo',
  POR: 'pt',
  COD: 'cd',
  UZB: 'uz',
  COL: 'co',
  ENG: 'gb-eng',
  CRO: 'hr',
  GHA: 'gh',
  PAN: 'pa'
}

function normalizeStickerState(state) {
  return {
    owned: Boolean(state?.owned),
    duplicates: Math.max(0, Number(state?.duplicates) || 0)
  }
}

function buildLabelMeta(team) {
  if (!team) {
    return {
      type: 'brand',
      brand: 'fifa',
      text: 'FIFA',
      code: 'FWC'
    }
  }

  if (team === 'CC') {
    return {
      type: 'brand',
      brand: 'coca-cola',
      text: 'Coca‑Cola',
      code: 'CC'
    }
  }

  return {
    type: 'flag',
    flagCode: flagCodeByTeam[team],
    code: team
  }
}

function buildTeamRow(team) {
  const count = getTeamStickerCount(team)
  const fullName = teamNames[team] || team

  return {
    id: team,
    labelMeta: buildLabelMeta(team),
    fullName,
    cells: Array.from({ length: count }, (_, index) => ({
      code: `${team}${index + 1}`,
      number: String(index + 1)
    }))
  }
}

function alphabeticalName(team) {
  const raw = String(teamNames[team] || team)
  const spanish = raw.match(/\(([^)]+)\)\s*$/)?.[1]
  const withoutFlag = raw.replace(/^\p{Extended_Pictographic}+\s*/u, '')
  return String(spanish || withoutFlag || team).trim()
}

function buildVisualRows(orderMode = 'album') {
  const countryTeams = teams.filter(team => team !== 'CC')
  const orderedTeams = orderMode === 'alphabetical'
    ? countryTeams.slice().sort((a, b) => alphabeticalName(a).localeCompare(alphabeticalName(b), 'es', { sensitivity: 'base' }))
    : countryTeams

  return [
    {
      id: 'fwc-specials',
      labelMeta: buildLabelMeta(null),
      fullName: 'FIFA World Cup Specials',
      cells: specials.map(code => ({
        code,
        number: code === '00' ? '00' : code.replace('FWC', '')
      }))
    },
    ...orderedTeams.map(buildTeamRow),
    buildTeamRow('CC')
  ]
}

function VisualRowLabel({ meta, fullName }) {
  return (
    <div className="visual-report-row-label" title={fullName}>
      <span className="visual-report-label-media">
        {meta.type === 'flag' && meta.flagCode ? (
          <img
            className="visual-report-flag-img"
            src={`https://flagcdn.com/w40/${meta.flagCode}.png`}
            alt=""
            loading="lazy"
          />
        ) : (
          <span className={`visual-report-brand-badge ${meta.brand || ''}`}>
            {meta.text}
          </span>
        )}
      </span>
      <span className="visual-report-label-separator">-</span>
      <strong>{meta.code}</strong>
    </div>
  )
}

export default function VisualMissingReportPage() {
  const navigate = useNavigate()
  const { user } = useUser()
  const { savedStickers } = useStickers()
  const [orderMode, setOrderMode] = useState('album')

  const rows = useMemo(() => {
    return buildVisualRows(orderMode).map(row => {
      const cells = row.cells.map(cell => {
        const state = normalizeStickerState(savedStickers[cell.code])
        return {
          ...cell,
          owned: state.owned,
          duplicates: state.duplicates
        }
      })

      const owned = cells.filter(cell => cell.owned).length
      const missing = cells.length - owned

      return {
        ...row,
        cells,
        owned,
        missing
      }
    })
  }, [orderMode, savedStickers])

  return (
    <div className="visual-report-page">
      <div className="trade-report-actions no-print">
        <button type="button" className="btn-secondary" onClick={() => navigate(-1)}>
          ← Volver
        </button>

        <div className="visual-report-action-group">
          <div className="visual-report-order-switch" role="group" aria-label="Orden del reporte">
            <button
              type="button"
              className={orderMode === 'album' ? 'active' : ''}
              aria-pressed={orderMode === 'album'}
              onClick={() => setOrderMode('album')}
            >
              Orden del Álbum
            </button>
            <button
              type="button"
              className={orderMode === 'alphabetical' ? 'active' : ''}
              aria-pressed={orderMode === 'alphabetical'}
              onClick={() => setOrderMode('alphabetical')}
            >
              Orden Alfabético
            </button>
          </div>

          <button type="button" className="btn-primary" onClick={() => window.print()}>
            🖨️ Imprimir / Guardar PDF
          </button>
        </div>
      </div>

      <div className="visual-report-sheet">
        <div className="visual-report-summary visual-report-summary-legend-only">
          <div className="visual-report-legend">
            <span><i className="legend-missing" /> Faltan</span>
            <span><i className="legend-owned" /> Pegadas</span>
            <span><i className="legend-duplicate-one" /> Repetidas (01)</span>
            <span><i className="legend-duplicate-multi" /> Repetidas (02+)</span>
          </div>
        </div>

        <div className="visual-report-grid" aria-label="Mapa visual de figuritas obtenidas y faltantes">
          {rows.map(row => (
            <div key={row.id} className="visual-report-row" title={row.fullName}>
              <VisualRowLabel meta={row.labelMeta} fullName={row.fullName} />

              <div className="visual-report-cells">
                {Array.from({ length: 20 }, (_, index) => {
                  const cell = row.cells[index]
                  if (!cell) {
                    return <span key={`blank-${index}`} className="visual-sticker-cell blank" />
                  }

                  return (
                    <span
                      key={cell.code}
                      className={`visual-sticker-cell ${cell.owned ? 'owned' : 'missing'} ${cell.duplicates === 1 ? 'duplicate-one' : ''} ${cell.duplicates > 1 ? 'duplicate-multi' : ''}`}
                      title={`${cell.code} · ${cell.owned ? (cell.duplicates === 1 ? 'Repetida (01) para cambiar' : cell.duplicates > 1 ? 'Repetidas (02+) para cambiar' : 'Pegada') : 'Falta'}`}
                    >
                      {cell.number}
                      {cell.duplicates > 1 ? (
                        <sup className="visual-duplicate-count" aria-label={`${cell.duplicates} repetidas`}>
                          {cell.duplicates}
                        </sup>
                      ) : null}
                    </span>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        <footer className="visual-report-footer">
          <span>Dashboard made by Naoum Uceda</span>
          <strong>{user?.name} {user?.surname}</strong>
        </footer>
      </div>
    </div>
  )
}
