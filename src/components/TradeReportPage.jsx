import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStickers } from '../context/StickersContext'
import { useUser } from '../context/UserContext'
import { useAlbum } from '../context/AlbumContext'
import { activeAlbumCatalog, getAllStickers, getPageFromCode, teamNames } from '../data/stickersData'

const groupNamesById = Object.fromEntries(
  activeAlbumCatalog.albumGroups.map(group => [group.id, group.title])
)

function getGroupLabel(code) {
  const page = getPageFromCode(code)
  if (page.groupId && groupNamesById[page.groupId]) return groupNamesById[page.groupId]
  if (page.type === 'team' || page.type === 'collection') return teamNames[page.team] || page.team
  if (page.type === 'special') return 'Especiales FWC'
  if (page.type === 'logo') return 'Logo Panini'
  return 'Extras'
}

function compactGroupName(label = '') {
  return label.replace(/^\p{Emoji_Presentation}\s*/u, '').trim()
}

function groupCodes(items, getCode) {
  return items.reduce((acc, item) => {
    const code = getCode(item)
    const label = compactGroupName(getGroupLabel(code))
    if (!acc[label]) acc[label] = []
    acc[label].push(item)
    return acc
  }, {})
}

function ReportSection({ title, subtitle, emptyText, groups, renderItem, className = '' }) {
  const groupEntries = Object.entries(groups)

  return (
    <section className={`trade-report-section ${className}`.trim()}>
      <div className="trade-report-section-header">
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </div>

      {groupEntries.length === 0 ? (
        <p className="trade-report-empty">{emptyText}</p>
      ) : (
        <div className="trade-report-groups">
          {groupEntries.map(([groupName, items]) => (
            <div key={groupName} className="trade-report-group">
              <h4>{groupName}</h4>
              <div className="trade-report-items">
                {items.map(renderItem)}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

export default function TradeReportPage() {
  const navigate = useNavigate()
  const { user } = useUser()
  const { activeAlbum } = useAlbum()
  const { savedStickers, getMissingStickers, getStats } = useStickers()

  const allStickers = useMemo(() => getAllStickers(), [])
  const duplicated = useMemo(() => {
    return allStickers
      .map(item => {
        const state = savedStickers[item.code] || { owned: false, duplicates: 0 }
        return {
          code: item.code,
          owned: Boolean(state.owned),
          duplicates: Math.max(0, Number(state.duplicates) || 0)
        }
      })
      .filter(item => item.owned && item.duplicates > 0)
  }, [allStickers, savedStickers])

  const missing = getMissingStickers()
  const stats = getStats()

  const duplicatedGroups = useMemo(() => groupCodes(duplicated, item => item.code), [duplicated])
  const missingGroups = useMemo(() => groupCodes(missing, code => code), [missing])

  const printedAt = new Date().toLocaleDateString('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  })

  return (
    <div className="trade-report-page">
      <div className="trade-report-actions no-print">
        <button type="button" className="btn-secondary" onClick={() => navigate(-1)}>
          ← Volver
        </button>
        <button type="button" className="btn-primary" onClick={() => window.print()}>
          🖨️ Imprimir / Guardar PDF
        </button>
      </div>

      <div className="trade-report-sheet">
        <header className="trade-report-header">
          <div>
            <h1>Reporte para trueque</h1>
            <p>{activeAlbum.title}</p>
          </div>
          <div className="trade-report-meta">
            <strong>{user?.name} {user?.surname}</strong>
            <span>{user?.email}</span>
            <span>Fecha: {printedAt}</span>
          </div>
        </header>

        <div className="trade-report-summary">
          <div><strong>{stats.owned}</strong><span>Pegadas</span></div>
          <div><strong>{stats.missing}</strong><span>Faltantes</span></div>
          <div><strong>{stats.duplicates}</strong><span>Repetidas</span></div>
          <div><strong>{Math.round((stats.owned / stats.total) * 100)}%</strong><span>Completado</span></div>
        </div>

        <div className="trade-report-notes">
          <span>Usa los casilleros para marcar a mano durante el intercambio.</span>
          <span>Luego actualiza el dashboard con lo entregado y recibido.</span>
        </div>

        <div className="trade-report-blocks">
          <ReportSection
            title="REPETIDAS"
            subtitle="Marca las repetidas que entregas. El número entre paréntesis indica cuántas tienes disponibles."
            emptyText="No tienes repetidas disponibles registradas."
            groups={duplicatedGroups}
            className="trade-report-obtained"
            renderItem={(item) => (
              <div key={item.code} className="trade-report-check-item obtained-item">
                <span className="paper-checkbox checked">X</span>
                <strong>{item.code}</strong>
                {item.duplicates > 0 && (
                  <em>({String(item.duplicates).padStart(2, '0')})</em>
                )}
              </div>
            )}
          />

          <ReportSection
            title="ME FALTAN"
            subtitle="Marca a mano las figuras que recibes y anota por cuál repetida la cambiaste."
            emptyText="No tienes faltantes registradas."
            groups={missingGroups}
            className="trade-report-missing"
            renderItem={(code) => (
              <div key={code} className="trade-report-check-item missing-item">
                <span className="paper-checkbox"></span>
                <strong>{code}</strong>
                <span className="exchange-line">x ______</span>
              </div>
            )}
          />
        </div>
      </div>
    </div>
  )
}
