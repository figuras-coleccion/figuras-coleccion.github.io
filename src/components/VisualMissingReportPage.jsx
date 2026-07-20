import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStickers } from '../context/StickersContext'
import { useUser } from '../context/UserContext'
import { useAlbum } from '../context/AlbumContext'
import { buildAlbumGroups, getStickerDisplayNumber } from '../data/albumGroups'
import { DEFAULT_ALBUM_ID } from '../albums/constants'

function normalizeStickerState(state) {
  return {
    owned: Boolean(state?.owned),
    duplicates: Math.max(0, Number(state?.duplicates) || 0)
  }
}

function getCompactCategoryLabel(group) {
  const shortCode = String(group?.shortCode || '').trim().toUpperCase()
  const description = `${group?.id || ''} ${group?.title || ''}`.toLowerCase()

  if (shortCode === 'EST' || description.includes('estadio')) return 'Estadios'
  if (shortCode === 'CM' || description.includes('campeon')) return 'Campeones'
  if (shortCode === '1RA' || description.includes('primer mundial') || description.includes('1er mundial')) return '1er Mundial'
  if (description.includes('repech')) return 'Repechaje'
  if (description.includes('clasific') || shortCode === 'A-G') return 'Clasificados'
  if (description.includes('escud') || shortCode === 'E') return 'Escudos'
  if (description.includes('troquel') || shortCode === 'T') return 'Troqueladas'

  return String(group?.title || shortCode || 'Especiales').trim()
}

function getRowSizeForAlbumGroup(group, albumId) {
  if (albumId === DEFAULT_ALBUM_ID) return 20

  const shortCode = String(group?.shortCode || '').trim().toUpperCase()
  const description = `${group?.id || ''} ${group?.title || ''}`.toLowerCase()
  const forceTwoRows = shortCode === 'E' || shortCode === 'T' || description.includes('repech') || description.includes('escud') || description.includes('troquel')

  if (forceTwoRows) return Math.ceil(group.codes.length / 2)
  return Math.min(16, Math.max(1, group.codes.length))
}

function buildLabelMeta(group, part, totalParts, albumId) {
  const suffix = totalParts > 1 ? ` ${part + 1}` : ''
  if (group.flagCode) {
    return { type: 'flag', flagCode: group.flagCode, code: `${group.shortCode}${suffix}` }
  }

  if (albumId !== DEFAULT_ALBUM_ID) {
    return {
      type: 'category',
      text: getCompactCategoryLabel(group)
    }
  }

  return {
    type: 'brand',
    brand: group.type === 'collection' ? 'coca-cola' : 'fifa',
    text: group.type === 'collection' ? 'Coca-Cola' : group.id === 'fwc-specials' ? 'FIFA' : group.shortCode,
    code: `${group.shortCode}${suffix}`
  }
}

function chunks(values, size = 20) {
  const result = []
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size))
  }
  return result
}

function buildVisualRows(orderMode = 'album', albumId = DEFAULT_ALBUM_ID) {
  const groups = buildAlbumGroups()
  if (albumId === DEFAULT_ALBUM_ID) {
    const leadingGroups = groups.filter(group => group.placement === 'leading')
    const countryGroups = groups.filter(group => group.placement === 'country')
    const trailingGroups = groups.filter(group => group.placement === 'trailing')
    const orderedCountries = orderMode === 'alphabetical'
      ? [...countryGroups].sort((a, b) => a.shortCode.localeCompare(b.shortCode))
      : countryGroups
    const specials = {
      id: 'fwc-specials',
      title: 'FIFA World Cup Specials',
      shortCode: 'FWC',
      type: 'special',
      codes: leadingGroups.flatMap(group => group.codes)
    }

    return [specials, ...orderedCountries, ...trailingGroups].map(group => ({
      id: group.id,
      labelMeta: buildLabelMeta(group, 0, 1, albumId),
      fullName: group.title,
      columns: 20,
      cells: group.codes.map(code => ({ code, number: getStickerDisplayNumber(code) }))
    }))
  }

  const orderedGroups = orderMode === 'alphabetical'
    ? [
        ...groups.filter(group => group.placement === 'leading'),
        ...groups.filter(group => group.placement === 'country').sort((a, b) => a.shortCode.localeCompare(b.shortCode)),
        ...groups.filter(group => group.placement === 'trailing')
      ]
    : groups

  return orderedGroups.flatMap(group => {
    const rowSize = getRowSizeForAlbumGroup(group, albumId)
    const parts = chunks(group.codes, rowSize)
    return parts.map((codes, part) => ({
      id: `${group.id}-${part}`,
      labelMeta: buildLabelMeta(group, part, parts.length, albumId),
      fullName: group.title,
      columns: rowSize,
      cells: codes.map(code => ({ code, number: getStickerDisplayNumber(code) }))
    }))
  })
}

function VisualRowLabel({ meta, fullName }) {
  if (meta.type === 'category') {
    return (
      <div className="visual-report-row-label visual-report-row-label-category" title={fullName}>
        <span className="visual-report-category-badge">{meta.text}</span>
      </div>
    )
  }

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
  const { activeAlbum } = useAlbum()
  const [orderMode, setOrderMode] = useState('album')
  const isPaniniReport = activeAlbum.id === DEFAULT_ALBUM_ID

  const rows = useMemo(() => {
    return buildVisualRows(orderMode, activeAlbum.id).map(row => {
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
  }, [activeAlbum.id, orderMode, savedStickers])

  return (
    <div className={`visual-report-page ${isPaniniReport ? 'visual-report-panini' : 'visual-report-multi-page'}`}>
      <div className="trade-report-actions no-print">
        <button type="button" className="btn-secondary" onClick={() => navigate(-1)}>
          ÃƒÂ¢Ã¢â‚¬Â Ã‚Â Volver
        </button>

        <div className="visual-report-action-group">
          <div className="visual-report-order-switch" role="group" aria-label="Orden del reporte">
            <button
              type="button"
              className={orderMode === 'album' ? 'active' : ''}
              aria-pressed={orderMode === 'album'}
              onClick={() => setOrderMode('album')}
            >
              Orden del ÃƒÆ’Ã‚Âlbum
            </button>
            <button
              type="button"
              className={orderMode === 'alphabetical' ? 'active' : ''}
              aria-pressed={orderMode === 'alphabetical'}
              onClick={() => setOrderMode('alphabetical')}
            >
              Orden AlfabÃƒÆ’Ã‚Â©tico
            </button>
          </div>

          <button type="button" className="btn-primary" onClick={() => window.print()}>
            ÃƒÂ°Ã…Â¸Ã¢â‚¬â€œÃ‚Â¨ÃƒÂ¯Ã‚Â¸Ã‚Â Imprimir / Guardar PDF
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

              <div
                className="visual-report-cells"
                style={{ '--visual-report-columns': row.columns }}
              >
                {Array.from({ length: row.columns }, (_, index) => {
                  const cell = row.cells[index]
                  if (!cell) {
                    return <span key={`blank-${index}`} className="visual-sticker-cell blank" />
                  }

                  return (
                    <span
                      key={cell.code}
                      className={`visual-sticker-cell ${cell.owned ? 'owned' : 'missing'} ${cell.duplicates === 1 ? 'duplicate-one' : ''} ${cell.duplicates > 1 ? 'duplicate-multi' : ''}`}
                      title={`${cell.code} Ãƒâ€šÃ‚Â· ${cell.owned ? (cell.duplicates === 1 ? 'Repetida (01) para cambiar' : cell.duplicates > 1 ? 'Repetidas (02+) para cambiar' : 'Pegada') : 'Falta'}`}
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