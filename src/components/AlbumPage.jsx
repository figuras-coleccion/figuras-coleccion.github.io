import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useStickers } from '../context/StickersContext'
import { buildAlbumGroups, getAlbumGroupIdFromLegacyPage } from '../data/albumGroups'
import { normalizeSearchText } from '../data/stickersData'
import StickerGrid from './StickerGrid'

const FILTERS = [
  { id: 'all', label: 'Todas' },
  { id: 'missing', label: 'Me faltan' },
  { id: 'duplicates', label: 'Repetidas' }
]

function normalizeFilter(value) {
  return FILTERS.some(filter => filter.id === value) ? value : 'all'
}

function matchesQuery(group, code, query) {
  if (!query) return true
  const normalizedQuery = normalizeSearchText(query)
  const groupMatch = normalizeSearchText(group.title).includes(normalizedQuery)
    || normalizeSearchText(group.team || '').includes(normalizedQuery)
    || normalizeSearchText(group.id).includes(normalizedQuery)

  return groupMatch || normalizeSearchText(code).includes(normalizedQuery)
}

export default function AlbumPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const {
    stickers,
    pendingChanges,
    updateStickerLocal
  } = useStickers()

  const groups = useMemo(() => buildAlbumGroups(), [])
  const [query, setQuery] = useState((searchParams.get('q') || '').toUpperCase())
  const [filter, setFilter] = useState(normalizeFilter(searchParams.get('tab')))
  const [collapsedGroups, setCollapsedGroups] = useState({})

  useEffect(() => {
    const params = {}
    if (query.trim()) params.q = query.trim()
    if (filter !== 'all') params.tab = filter
    setSearchParams(params, { replace: true })
  }, [query, filter, setSearchParams])

  useEffect(() => {
    const legacyPage = searchParams.get('page')
    if (!legacyPage) return

    const targetId = getAlbumGroupIdFromLegacyPage(legacyPage)
    const timeout = window.setTimeout(() => {
      document.getElementById(targetId)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 180)

    return () => window.clearTimeout(timeout)
    // Se ejecuta solo al abrir un enlace antiguo /album?page=N.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const visibleGroups = useMemo(() => {
    return groups
      .map(group => {
        const codes = group.codes.filter(code => {
          const sticker = stickers[code] || { owned: false, duplicates: 0 }
          const filterMatch = filter === 'all'
            || (filter === 'missing' && !sticker.owned)
            || (filter === 'duplicates' && Number(sticker.duplicates || 0) > 0)

          return filterMatch && matchesQuery(group, code, query)
        })

        return { ...group, codes }
      })
      .filter(group => group.codes.length > 0)
  }, [filter, groups, query, stickers])

  const buildGridStickers = (codes) => codes.map(code => ({
    code,
    owned: Boolean(stickers[code]?.owned),
    duplicates: Number(stickers[code]?.duplicates || 0),
    pending: Boolean(pendingChanges[code])
  }))

  const toggleGroup = (groupId) => {
    setCollapsedGroups(previous => ({
      ...previous,
      [groupId]: !previous[groupId]
    }))
  }

  return (
    <div className="album-v2-page">
      <header className="album-v2-header">
        <div>
          <h2>Mi álbum</h2>
        </div>
      </header>

      <div className="album-filter-tabs" role="tablist" aria-label="Filtros del álbum">
        {FILTERS.map(item => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={filter === item.id}
            className={filter === item.id ? 'active' : ''}
            onClick={() => setFilter(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="album-v2-search">
        <span aria-hidden="true">⌕</span>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value.toUpperCase())}
          placeholder="Buscar selección o código"
          aria-label="Buscar selección o código"
        />
        {query && (
          <button type="button" onClick={() => setQuery('')} aria-label="Limpiar búsqueda">×</button>
        )}
      </div>

      <div className="album-state-legend" aria-label="Leyenda de estados">
        <span><i className="legend-swatch missing" /> Falta</span>
        <span><i className="legend-swatch owned" /> Obtenida</span>
        <span><i className="legend-badge">2</i> Repetidas</span>
      </div>

      {visibleGroups.length === 0 && (
        <div className="album-v2-empty">
          <strong>No hay figuritas para mostrar.</strong>
        </div>
      )}

      <div className="album-groups-list">
        {visibleGroups.map(group => {
          const isCollapsed = Boolean(collapsedGroups[group.id])
          const fullGroup = groups.find(item => item.id === group.id)
          const ownedCount = fullGroup.codes.filter(code => stickers[code]?.owned).length
          const duplicateCount = fullGroup.codes.reduce(
            (total, code) => total + Number(stickers[code]?.duplicates || 0),
            0
          )

          return (
            <section key={group.id} id={group.id} className="album-group-section">
              <button
                type="button"
                className="album-group-heading"
                onClick={() => toggleGroup(group.id)}
                aria-expanded={!isCollapsed}
              >
                <span>
                  <strong>{group.title}</strong>
                  <small>{ownedCount}/{fullGroup.codes.length} obtenidas · {duplicateCount} repetidas</small>
                </span>
                <span className={`album-collapse-icon ${isCollapsed ? 'collapsed' : ''}`} aria-hidden="true">⌃</span>
              </button>

              {!isCollapsed && (
                <div className="album-group-content">
                  <StickerGrid stickers={buildGridStickers(group.codes)} onUpdate={updateStickerLocal} />
                </div>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}
