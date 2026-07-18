import { useEffect, useMemo, useState } from 'react'
import { onValue } from 'firebase/database'
import { db, ref } from '../firebase'

function asTime(value) {
  const number = Number(value)
  return Number.isFinite(number) && number > 0 ? number : 0
}

function shortDate(value) {
  if (!asTime(value)) return ''
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: '2-digit'
  }).format(new Date(value))
}

function fullDate(value) {
  if (!asTime(value)) return ''
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  }).format(new Date(value))
}

function sourceOf(event) {
  if (event?.type === 'trade_received' || String(event?.source || '').includes('trade')) return 'trade'
  if (event?.type === 'sticker_obtained') return 'manual'
  return 'initial'
}

function sourceIcon(source) {
  if (source === 'trade') return '↔'
  if (source === 'manual') return '+'
  return '•'
}

function sourceLabel(source) {
  if (source === 'trade') return 'Recibida por trueque'
  if (source === 'manual') return 'Marcada manualmente'
  return 'Registro inicial'
}

export default function RecentObtained({ userId, savedStickers = {} }) {
  const [events, setEvents] = useState({})

  useEffect(() => {
    if (!userId) {
      setEvents({})
      return undefined
    }

    return onValue(ref(db, `users/${userId}/collectionEvents`), snapshot => {
      setEvents(snapshot.val() || {})
    })
  }, [userId])

  const recent = useMemo(() => {
    const candidates = Object.entries(events || {})
      .map(([id, event]) => ({ id, ...(event || {}) }))
      .filter(event => event.type === 'sticker_obtained' || event.type === 'trade_received')
      .map(event => ({
        id: event.id,
        code: String(event.code || '').toUpperCase(),
        timestamp: asTime(event.timestamp),
        source: sourceOf(event)
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
  }, [events, savedStickers])

  return (
    <section className="dashboard-recent-obtained" aria-label="Últimas cinco figuritas obtenidas">
      <div className="dashboard-recent-heading">
        <span aria-hidden="true">🕘</span>
        <strong>Últimas 5 obtenidas</strong>
        <small>Más reciente primero</small>
      </div>

      {recent.length > 0 ? (
        <div className="dashboard-recent-grid">
          {recent.map(item => (
            <div
              key={`${item.id}-${item.timestamp}`}
              className={`dashboard-recent-chip source-${item.source}`}
              title={`${item.code} · ${sourceLabel(item.source)} · ${fullDate(item.timestamp)}`}
            >
              <span className="dashboard-recent-source">{sourceIcon(item.source)}</span>
              <strong>{item.code}</strong>
              <small>{shortDate(item.timestamp)}</small>
            </div>
          ))}
        </div>
      ) : (
        <p className="dashboard-recent-empty">Aún no hay actividad reciente.</p>
      )}
    </section>
  )
}
