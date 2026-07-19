import { useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useUser } from '../context/UserContext'
import { useAlbum } from '../context/AlbumContext'
import { db, ref, get } from '../firebase'
import { allStickersOrdered } from '../data/stickersData'
import { getCountryName } from '../data/countries'
import { getAlbumStickersFromUser } from '../albums/runtime'

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase()
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString()
}

function initials(profile = {}) {
  const name = `${profile.name || ''} ${profile.surname || ''}`.trim() || profile.email || 'U'
  return name.slice(0, 1).toUpperCase()
}

function getProviderLabel(provider = '') {
  if (provider.includes('google')) return 'Google'
  if (provider.includes('password')) return 'Correo'
  return provider || '—'
}

function computeUserStats(stickers = {}) {
  let owned = 0
  let duplicates = 0

  allStickersOrdered.forEach(code => {
    const item = stickers?.[code]
    if (item?.owned) owned += 1
    duplicates += Number(item?.duplicates || 0)
  })

  const total = allStickersOrdered.length
  const missing = Math.max(total - owned, 0)
  const percent = total ? Math.round((owned / total) * 100) : 0

  return { owned, duplicates, missing, total, percent }
}

function sanitizeCsvValue(value) {
  const text = String(value ?? '')
  return `"${text.replace(/"/g, '""')}"`
}

export default function AdminDashboard() {
  const { user, isAdmin } = useUser()
  const { activeAlbumId, activeAlbum } = useAlbum()
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!isAdmin) return
    loadUsers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAlbumId, isAdmin])

  const loadUsers = async () => {
    setLoading(true)
    setError('')

    try {
      const snapshot = await get(ref(db, 'users'))
      if (!snapshot.exists()) {
        setUsers([])
        return
      }

      const raw = snapshot.val() || {}
      const mapped = Object.entries(raw).map(([uid, record]) => {
        const profile = record?.profile || {}
        const stats = computeUserStats(getAlbumStickersFromUser(record, activeAlbumId))
        return {
          id: uid,
          profile,
          stats,
          email: normalizeEmail(profile.email),
          fullName: `${profile.name || ''} ${profile.surname || ''}`.trim() || 'Usuario sin nombre',
          provider: getProviderLabel(profile.provider),
          countryName: getCountryName(profile.countryCode) || 'Sin país',
          verified: profile.emailVerified !== false,
          createdAt: profile.createdAt || null,
          lastLoginAt: profile.lastLoginAt || null,
          updatedAt: profile.updatedAt || null
        }
      })

      mapped.sort((a, b) => (b.lastLoginAt || b.createdAt || 0) - (a.lastLoginAt || a.createdAt || 0))
      setUsers(mapped)
    } catch (err) {
      console.error('Error cargando panel admin:', err)
      setError('No se pudo cargar la información. Revisa que las reglas Firebase tengan permiso de administrador para tu correo.')
    } finally {
      setLoading(false)
    }
  }

  const summary = useMemo(() => {
    const totalUsers = users.length
    const verified = users.filter(item => item.verified).length
    const google = users.filter(item => item.provider === 'Google').length
    const password = users.filter(item => item.provider === 'Correo').length
    const withPhoto = users.filter(item => Boolean(item.profile.photoURL)).length
    const totalOwned = users.reduce((sum, item) => sum + item.stats.owned, 0)
    const totalDuplicates = users.reduce((sum, item) => sum + item.stats.duplicates, 0)
    const avgProgress = totalUsers
      ? Math.round(users.reduce((sum, item) => sum + item.stats.percent, 0) / totalUsers)
      : 0

    return { totalUsers, verified, google, password, withPhoto, totalOwned, totalDuplicates, avgProgress }
  }, [users])

  const filteredUsers = useMemo(() => {
    const clean = normalizeEmail(query)
    if (!clean) return users
    return users.filter(item => (
      item.fullName.toLowerCase().includes(clean) ||
      item.email.includes(clean) ||
      item.provider.toLowerCase().includes(clean) ||
      item.countryName.toLowerCase().includes(clean)
    ))
  }, [query, users])

  const exportCsv = () => {
    const headers = [
      'Nombre',
      'Correo',
      'Proveedor',
      'Pais',
      'Verificado',
      'Pegadas',
      'Faltantes',
      'Repetidas',
      'Avance %',
      'Creado',
      'Ultimo ingreso'
    ]

    const rows = filteredUsers.map(item => [
      item.fullName,
      item.email,
      item.provider,
      item.countryName,
      item.verified ? 'Si' : 'No',
      item.stats.owned,
      item.stats.missing,
      item.stats.duplicates,
      item.stats.percent,
      formatDate(item.createdAt),
      formatDate(item.lastLoginAt)
    ])

    const csv = [headers, ...rows]
      .map(row => row.map(sanitizeCsvValue).join(','))
      .join('\n')

    const blob = new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `panini_admin_usuarios_${new Date().toISOString().slice(0, 10)}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />
  }

  if (loading) {
    return <div className="loading">📈 Cargando panel administrador...</div>
  }

  return (
    <div className="admin-page">
      <div className="admin-head">
        <div>
          <h2>🛡️ Panel administrador</h2>
          <p>Álbum en vista: {activeAlbum.shortTitle}</p>
          <p>Vista privada para {user?.email}. No muestra contraseñas; Firebase no las expone.</p>
        </div>
        <button type="button" className="btn-refresh-matches" onClick={loadUsers}>
          🔄 Actualizar
        </button>
      </div>

      {error && <div className="admin-error card">⚠️ {error}</div>}

      <div className="admin-stats-grid">
        <div className="admin-stat-card">
          <strong>{summary.totalUsers}</strong>
          <span>Usuarios registrados</span>
        </div>
        <div className="admin-stat-card">
          <strong>{summary.verified}</strong>
          <span>Correos verificados</span>
        </div>
        <div className="admin-stat-card">
          <strong>{summary.google}</strong>
          <span>Registro Google</span>
        </div>
        <div className="admin-stat-card">
          <strong>{summary.password}</strong>
          <span>Registro correo</span>
        </div>
        <div className="admin-stat-card">
          <strong>{summary.avgProgress}%</strong>
          <span>Avance promedio</span>
        </div>
        <div className="admin-stat-card">
          <strong>{summary.totalDuplicates}</strong>
          <span>Repetidas acumuladas</span>
        </div>
      </div>

      <div className="admin-toolbar card">
        <div>
          <label>Buscar usuario</label>
          <input
            type="text"
            value={query}
            placeholder="Nombre, correo, país o proveedor..."
            onChange={(event) => setQuery(event.target.value)}
          />
          <small>{filteredUsers.length} usuario(s) visibles.</small>
        </div>
        <button type="button" className="btn-secondary" onClick={exportCsv} disabled={filteredUsers.length === 0}>
          ⬇️ Exportar CSV
        </button>
      </div>

      <div className="admin-users-list">
        {filteredUsers.length === 0 ? (
          <div className="card empty-matches-card">
            <p className="empty-icon">🔎</p>
            <h3>No hay usuarios para mostrar</h3>
            <p>Ajusta la búsqueda o actualiza el panel.</p>
          </div>
        ) : (
          filteredUsers.map(item => (
            <div className="admin-user-card" key={item.id}>
              <div className="admin-user-main">
                <div className="admin-avatar">
                  {item.profile.photoURL ? <img src={item.profile.photoURL} alt="Foto de usuario" /> : <span>{initials(item.profile)}</span>}
                </div>
                <div>
                  <h3>{item.fullName}</h3>
                  <p>{item.email}</p>
                  <div className="admin-tags">
                    <span>{item.provider}</span>
                    <span>📍 {item.countryName}</span>
                    <span>{item.verified ? 'Verificado' : 'No verificado'}</span>
                    {item.profile.photoURL ? <span>Con foto</span> : <span>Sin foto</span>}
                  </div>
                </div>
              </div>

              <div className="admin-progress-box">
                <strong>{item.stats.percent}%</strong>
                <small>{item.stats.owned}/{item.stats.total} pegadas</small>
                <div className="admin-mini-bar"><span style={{ width: `${item.stats.percent}%` }} /></div>
              </div>

              <div className="admin-user-stats">
                <span>❌ {item.stats.missing} faltan</span>
                <span>🔁 {item.stats.duplicates} repetidas</span>
                <span>🕒 {formatDate(item.lastLoginAt)}</span>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
