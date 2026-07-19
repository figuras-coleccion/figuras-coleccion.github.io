import { useEffect, useMemo, useState } from 'react'
import { onValue } from 'firebase/database'
import { useNavigate } from 'react-router-dom'
import { useStickers } from '../context/StickersContext'
import { useUser } from '../context/UserContext'
import { useAlbum } from '../context/AlbumContext'
import { db, ref } from '../firebase'
import { buildAlbumGroups } from '../data/albumGroups'
import { DEFAULT_ALBUM_ID } from '../albums/constants'

function normalizeStickerState(state) {
  return {
    owned: Boolean(state?.owned),
    duplicates: Math.max(0, Number(state?.duplicates) || 0)
  }
}

function asTime(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : 0
}

const spanishNameByTeam = {
  MEX: 'México', RSA: 'Sudáfrica', KOR: 'Corea del Sur', CZE: 'República Checa', CAN: 'Canadá',
  BIH: 'Bosnia', QAT: 'Catar', SUI: 'Suiza', BRA: 'Brasil', MAR: 'Marruecos', HAI: 'Haití',
  SCO: 'Escocia', USA: 'Estados Unidos', PAR: 'Paraguay', AUS: 'Australia', TUR: 'Turquía',
  GER: 'Alemania', CUW: 'Curazao', CIV: 'Costa de Marfil', ECU: 'Ecuador', NED: 'Países Bajos',
  JPN: 'Japón', SWE: 'Suecia', TUN: 'Túnez', BEL: 'Bélgica', EGY: 'Egipto', IRN: 'Irán',
  NZL: 'Nueva Zelanda', ESP: 'España', CPV: 'Cabo Verde', KSA: 'Arabia Saudita', URU: 'Uruguay',
  FRA: 'Francia', SEN: 'Senegal', IRQ: 'Irak', NOR: 'Noruega', ARG: 'Argentina', ALG: 'Argelia',
  AUT: 'Austria', JOR: 'Jordania', POR: 'Portugal', COD: 'RD Congo', UZB: 'Uzbekistán',
  COL: 'Colombia', ENG: 'Inglaterra', CRO: 'Croacia', GHA: 'Ghana', PAN: 'Panamá', CC: 'Coca-Cola'
}

function buildSections(albumId) {
  const groups = buildAlbumGroups()
  if (albumId === DEFAULT_ALBUM_ID) {
    const leading = groups.filter(group => group.placement === 'leading')
    const teams = groups.filter(group => group.team)
    return [
      {
        id: 'specials',
        title: 'FIFA',
        total: leading.reduce((total, group) => total + group.codes.length, 0),
        codes: leading.flatMap(group => group.codes),
        albumTarget: '/specials'
      },
      ...teams.map(group => ({
        ...group,
        id: group.team,
        title: spanishNameByTeam[group.team] || group.title || group.team,
        total: group.codes.length,
        albumTarget: `/team/${group.team}`
      }))
    ]
  }

  return groups.map(group => ({
    ...group,
    total: group.codes.length,
    albumTarget: `/album#${group.id}`
  }))
}

function sectionLabel(section) {
  if (!section) return '—'
  return section.title || section.id
}

function sectionTarget(section) {
  if (!section) return ''
  return section.albumTarget || `/album#${section.id}`
}

function clampPercent(value) {
  return Math.max(0, Math.min(100, Math.round(Number(value) || 0)))
}

function formatShortDate(timestamp) {
  const value = Number(timestamp)
  if (!Number.isFinite(value) || value <= 0) return ''
  return new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: '2-digit', year: '2-digit' }).format(new Date(value))
}

function radarPoint(index, value, total = 5) {
  const centerX = 160
  const centerY = 155
  const radius = 102 * (clampPercent(value) / 100)
  const angle = (-Math.PI / 2) + ((Math.PI * 2 * index) / total)
  return `${centerX + Math.cos(angle) * radius},${centerY + Math.sin(angle) * radius}`
}

function gridPolygon(level, total = 5) {
  return Array.from({ length: total }, (_, index) => radarPoint(index, level, total)).join(' ')
}

function CollectorRadar({ metrics }) {
  const values = metrics.map(metric => metric.value)
  const polygon = values.map((value, index) => radarPoint(index, value, values.length)).join(' ')
  const labelPositions = [
    { x: 160, y: 14, anchor: 'middle' },
    { x: 302, y: 104, anchor: 'end' },
    { x: 250, y: 300, anchor: 'middle' },
    { x: 70, y: 300, anchor: 'middle' },
    { x: 18, y: 104, anchor: 'start' }
  ]

  return (
    <div className="collector-radar-wrap">
      <svg className="collector-radar" viewBox="0 0 320 320" role="img" aria-label="Perfil estadístico del coleccionista">
        {[20, 40, 60, 80, 100].map(level => (
          <polygon key={level} points={gridPolygon(level)} className="collector-radar-grid" />
        ))}

        {values.map((_, index) => (
          <line
            key={metrics[index].label}
            x1="160"
            y1="155"
            x2={radarPoint(index, 100).split(',')[0]}
            y2={radarPoint(index, 100).split(',')[1]}
            className="collector-radar-axis"
          />
        ))}

        <polygon points={polygon} className="collector-radar-area" />

        {values.map((value, index) => {
          const [x, y] = radarPoint(index, value).split(',')
          return <circle key={`point-${metrics[index].label}`} cx={x} cy={y} r="5" className="collector-radar-point" />
        })}

        {metrics.map((metric, index) => {
          const position = labelPositions[index]
          return (
            <g key={metric.label}>
              <text x={position.x} y={position.y} textAnchor={position.anchor} className="collector-radar-label">
                {metric.label}
              </text>
              <text x={position.x} y={position.y + 19} textAnchor={position.anchor} className="collector-radar-value">
                {metric.value}%
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export default function Dashboard() {
  const { getStats, savedStickers, saveToCloud, lastSaved, pendingChanges } = useStickers()
  const { user } = useUser()
  const { activeAlbum, getAlbumChildPath } = useAlbum()
  const stats = getStats()
  const navigate = useNavigate()
  const [collectionStats, setCollectionStats] = useState({})
  const [sectionCompletions, setSectionCompletions] = useState({})
  const [collectionEvents, setCollectionEvents] = useState({})

  const hasPendingChanges = Object.keys(pendingChanges).length > 0
  const completionPercent = stats.total > 0 ? Math.round((stats.owned / stats.total) * 100) : 0
  const userInitial = (user?.name || user?.email || 'U').slice(0, 1).toUpperCase()

  useEffect(() => {
    if (!user?.id) {
      setCollectionStats({})
      setSectionCompletions({})
      setCollectionEvents({})
      return undefined
    }

    const stopStats = onValue(ref(db, getAlbumChildPath('collectionStats')), snapshot => {
      setCollectionStats(snapshot.val() || {})
    })
    const stopCompletions = onValue(ref(db, getAlbumChildPath('sectionCompletions')), snapshot => {
      setSectionCompletions(snapshot.val() || {})
    })
    const stopEvents = onValue(ref(db, getAlbumChildPath('collectionEvents')), snapshot => {
      setCollectionEvents(snapshot.val() || {})
    })

    return () => {
      stopStats()
      stopCompletions()
      stopEvents()
    }
  }, [activeAlbum.id, getAlbumChildPath, user?.id])

  const progressSections = useMemo(() => {
    return buildSections(activeAlbum.id).map(section => {
      const owned = section.codes.reduce((count, code) => {
        return count + (normalizeStickerState(savedStickers[code]).owned ? 1 : 0)
      }, 0)

      const duplicates = section.codes.reduce((count, code) => {
        return count + normalizeStickerState(savedStickers[code]).duplicates
      }, 0)

      const missing = Math.max(section.total - owned, 0)
      const percent = section.total > 0 ? Math.round((owned / section.total) * 100) : 0

      return { ...section, owned, missing, duplicates, percent }
    })
  }, [activeAlbum.id, savedStickers])

  const completedSections = useMemo(
    () => progressSections.filter(section => section.percent >= 100),
    [progressSections]
  )

  const mostRepeated = useMemo(() => {
    return Object.entries(savedStickers).reduce((best, [code, value]) => {
      const duplicates = normalizeStickerState(value).duplicates
      if (duplicates > best.duplicates) return { code, duplicates }
      return best
    }, { code: '—', duplicates: 0 })
  }, [savedStickers])

  const latestCompletion = useMemo(() => {
    return Object.values(sectionCompletions || {})
      .filter(value => Number(value?.completedAt || 0) > 0)
      .sort((a, b) => Number(b.completedAt || 0) - Number(a.completedAt || 0))[0] || null
  }, [sectionCompletions])

  const recentObtained = useMemo(() => {
    const candidates = Object.entries(collectionEvents || {})
      .map(([id, event]) => ({ id, ...(event || {}) }))
      .filter(event => event.type === 'sticker_obtained' || event.type === 'trade_received')
      .map(event => ({
        id: event.id,
        code: String(event.code || '').toUpperCase(),
        timestamp: asTime(event.timestamp),
        source: event.type === 'trade_received' || String(event.source || '').includes('trade') ? 'trade' : 'manual'
      }))
      .filter(event => event.code && event.timestamp)

    Object.entries(savedStickers || {}).forEach(([code, sticker]) => {
      if (!sticker?.owned || !asTime(sticker.obtainedAt)) return
      candidates.push({
        id: `initial-${code}`,
        code: String(code).toUpperCase(),
        timestamp: asTime(sticker.obtainedAt),
        source: 'initial'
      })
    })

    candidates.sort((a, b) => b.timestamp - a.timestamp)

    const result = []
    candidates.forEach(candidate => {
      const repeated = result.findIndex(item => (
        item.code === candidate.code && Math.abs(item.timestamp - candidate.timestamp) <= 10000
      ))

      if (repeated >= 0) {
        if (candidate.source === 'trade') result[repeated] = candidate
        return
      }

      result.push(candidate)
    })

    return result.sort((a, b) => b.timestamp - a.timestamp).slice(0, 5)
  }, [collectionEvents, savedStickers])

  const specialSections = progressSections.filter(section => (
    activeAlbum.id === DEFAULT_ALBUM_ID
      ? section.id === 'specials'
      : activeAlbum.highlightGroupIds.includes(section.id)
  ))
  const specialOwned = specialSections.reduce((total, section) => total + section.owned, 0)
  const specialTotal = specialSections.reduce((total, section) => total + section.total, 0)
  const lastCompletedSection = progressSections.find(section => section.id === latestCompletion?.sectionId)
  const tradesCompleted = Math.max(0, Number(collectionStats.tradesCompleted) || 0)
  const tradeDelivered = Math.max(0, Number(collectionStats.stickersDeliveredInTrades) || 0)

  const academyMetrics = useMemo(() => {
    const specialPercent = specialTotal > 0 ? Math.round((specialOwned / specialTotal) * 100) : 0
    const tradeInventory = tradeDelivered + stats.duplicates
    const tradeScore = tradesCompleted > 0 && tradeInventory > 0
      ? clampPercent((tradeDelivered / tradeInventory) * 100)
      : 0
    const coverageScore = progressSections.length > 0
      ? clampPercent((progressSections.filter(section => section.percent >= 75).length / progressSections.length) * 100)
      : 0
    const averageDeviation = progressSections.length > 0
      ? progressSections.reduce((sum, section) => sum + Math.abs(section.percent - completionPercent), 0) / progressSections.length
      : 100
    const balanceScore = clampPercent(100 - averageDeviation)

    return [
      { label: 'Progreso', value: clampPercent(completionPercent) },
      { label: 'Especiales', value: clampPercent(specialPercent) },
      { label: 'Intercambio', value: tradeScore },
      { label: 'Cobertura', value: coverageScore },
      { label: 'Balance', value: balanceScore }
    ]
  }, [completionPercent, progressSections, specialOwned, specialTotal, stats.duplicates, tradeDelivered, tradesCompleted])

  const completionCount = Math.max(completedSections.length, Object.keys(sectionCompletions || {}).length)
  const latestDate = formatShortDate(latestCompletion?.completedAt)
  const latestValue = lastCompletedSection
    ? `${sectionLabel(lastCompletedSection)}${latestDate ? ` · ${latestDate}` : ''}`
    : '—'
  const latestTarget = sectionTarget(lastCompletedSection)
  const recentTitle = recentObtained
    .map(item => `${item.code} · ${new Date(item.timestamp).toLocaleString('es-PE')}`)
    .join('\n')

  const highlights = [
    {
      icon: '🏆',
      tone: 'orange',
      label: 'Más repetida',
      value: mostRepeated.duplicates > 0 ? mostRepeated.code : '—',
      onClick: () => navigate('/album?tab=duplicates')
    },
    {
      icon: '⭐',
      tone: 'purple',
      label: 'Especiales pegadas',
      value: `${specialOwned} / ${specialTotal}`,
      onClick: () => navigate(activeAlbum.id === DEFAULT_ALBUM_ID ? '/specials' : '/album')
    },
    {
      icon: '🌐',
      tone: 'blue',
      label: 'Secciones completas',
      value: completionCount,
      onClick: () => navigate('/album')
    },
    {
      icon: '📅',
      tone: 'amber',
      label: 'Última sección',
      value: latestValue,
      title: latestCompletion?.completedAt ? new Date(latestCompletion.completedAt).toLocaleString('es-PE') : '',
      onClick: latestTarget ? () => navigate(latestTarget) : null
    },
    {
      icon: '🕘',
      tone: 'green',
      label: 'Últimas obtenidas',
      recent: recentObtained,
      title: recentTitle,
      onClick: () => navigate('/album')
    }
  ]

  return (
    <div className="dashboard-page">
      <div className="dashboard-title-row">
        <h2><span aria-hidden="true">📊</span> Mi Dashboard</h2>
        <div className="dashboard-title-avatar" title={`${user?.name || ''} ${user?.surname || ''}`.trim() || 'Mi perfil'}>
          {user?.photoURL ? <img src={user.photoURL} alt="Foto de perfil" /> : <span>{userInitial}</span>}
        </div>
      </div>

      <div className="stats-row">
        <div className="stat-card">
          <div className="stat-value">{stats.owned}</div>
          <div className="stat-label">Pegadas</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.missing}</div>
          <div className="stat-label">Faltantes</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{stats.duplicates}</div>
          <div className="stat-label">Repetidas</div>
        </div>
        <div className="stat-card">
          <div className="stat-value">{completionPercent}%</div>
          <div className="stat-label">Completado</div>
        </div>
      </div>

      <div className="dashboard-progress-track" aria-label={`Álbum completado al ${completionPercent}%`}>
        <span style={{ width: `${completionPercent}%` }} />
      </div>
      <p className="dashboard-progress-caption">Tu álbum está al <strong>{completionPercent}%</strong> completado</p>

      <div className="dashboard-actions card">
        <button type="button" className="btn-primary" onClick={() => navigate('/album')}>
          📖 Ver Álbum
        </button>
        <div className="dashboard-report-actions">
          <button type="button" className="btn-secondary dashboard-report-button" onClick={() => navigate('/visual-report')}>
            📄 Reporte PDF
          </button>
        </div>
      </div>

      <section className="dashboard-insights-grid">
        <article className="collector-academy-card card">
          <div className="dashboard-card-heading">
            <h3>⚙️ Academia del Coleccionista</h3>
            <span
              className="dashboard-info-dot"
              title="Intercambio mide qué proporción de tus repetidas históricas ya fue entregada mediante trueques registrados."
            >i</span>
          </div>
          <CollectorRadar metrics={academyMetrics} />
        </article>

        <article className="collector-highlights-card card">
          <div className="dashboard-card-heading">
            <h3>⭐ Lo más importante</h3>
          </div>
          <div className="collector-highlights-list">
            {highlights.map(item => (
              <button
                key={item.label}
                type="button"
                className={`collector-highlight-row${item.recent ? ' collector-highlight-recent' : ''}`}
                onClick={item.onClick}
                disabled={!item.onClick}
                title={item.title || ''}
              >
                <span className={`collector-highlight-icon ${item.tone}`}>{item.icon}</span>
                <span className="collector-highlight-label">{item.label}</span>
                {item.recent ? (
                  <span className="collector-highlight-recent-codes">
                    {item.recent.length > 0
                      ? item.recent.map(entry => <b key={`${entry.code}-${entry.timestamp}`}>{entry.code}</b>)
                      : <em>Sin actividad</em>}
                  </span>
                ) : (
                  <strong>{item.value}</strong>
                )}
                <span className="collector-highlight-arrow" aria-hidden="true">›</span>
              </button>
            ))}
          </div>
        </article>
      </section>

      <footer className="dashboard-footer-note">
        Creado por un padre para su hijo <span>·</span> © 2026 <span>·</span> Perú 🇵🇪
      </footer>

      {hasPendingChanges && (
        <button className="btn-save" onClick={saveToCloud}>
          💾 Guardar cambios
          {lastSaved && (
            <span style={{ fontSize: '10px', display: 'block' }}>
              Último: {new Date(lastSaved).toLocaleTimeString()}
            </span>
          )}
        </button>
      )}
    </div>
  )
}
