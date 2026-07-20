import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '../context/UserContext'
import { useStickers } from '../context/StickersContext'
import { useAlbum } from '../context/AlbumContext'
import { db, ref, get } from '../firebase'
import { allStickersOrdered } from '../data/stickersData'
import { getCountryName } from '../data/countries'
import { getAlbumStickersFromUser, isProfileUsingAlbum } from '../albums/runtime'
import SafeProfileImage from './SafeProfileImage'

const ORDER_INDEX = new Map(allStickersOrdered.map((code, index) => [code, index]))

function sortCodes(codes = []) {
  return [...codes].sort((a, b) => {
    const ia = ORDER_INDEX.has(a) ? ORDER_INDEX.get(a) : Number.MAX_SAFE_INTEGER
    const ib = ORDER_INDEX.has(b) ? ORDER_INDEX.get(b) : Number.MAX_SAFE_INTEGER
    return ia - ib || a.localeCompare(b)
  })
}

function initials(user = {}) {
  const n = `${user.name || ''} ${user.surname || ''}`.trim() || user.email || 'U'
  return n.slice(0, 1).toUpperCase()
}

function compactList(codes = [], limit = 8) {
  const shown = codes.slice(0, limit).join(', ')
  const rest = codes.length > limit ? ` y ${codes.length - limit} más` : ''
  return `${shown}${rest}` || '—'
}

function buildMailtoUrl({ to, subject, body }) {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
}

export default function MatchFinder() {
  const navigate = useNavigate()
  const { user } = useUser()
  const { getDuplicates, getMissingStickers } = useStickers()
  const { activeAlbumId, activeAlbum } = useAlbum()
  const [matches, setMatches] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedMatchId, setSelectedMatchId] = useState(null)
  const [showAll, setShowAll] = useState(false)

  const myDuplicates = useMemo(() => getDuplicates(), [getDuplicates])
  const myMissing = useMemo(() => getMissingStickers(), [getMissingStickers])
  const myDuplicateCodes = useMemo(() => myDuplicates.map(d => d.code), [myDuplicates])

  useEffect(() => {
    if (!user?.id) return
    if (!user.countryCode) {
      setLoading(false)
      setMatches([])
      return
    }
    loadAllUsers()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeAlbumId, user?.id, user?.countryCode])

  const loadAllUsers = async () => {
    setLoading(true)
    try {
      const snapshot = await get(ref(db, 'users'))
      if (!snapshot.exists()) {
        setMatches([])
        setLoading(false)
        return
      }

      const usersData = snapshot.val()
      const usersList = Object.keys(usersData)
        .filter(uid => uid !== user.id)
        .map(uid => {
          const record = usersData[uid] || {}
          const profile = record.profile || {}
          return {
            id: uid,
            ...profile,
            stickers: getAlbumStickersFromUser(record, activeAlbumId)
          }
        })
        .filter(otherUser => isProfileUsingAlbum(otherUser, activeAlbumId))
        .filter(otherUser => otherUser.emailVerified !== false && otherUser.email)
        .filter(otherUser => otherUser.countryCode === user.countryCode)

      const foundMatches = []

      usersList.forEach(otherUser => {
        const theirStickers = otherUser.stickers || {}

        const theyCanGiveMe = sortCodes(
          myMissing.filter(code => Number(theirStickers[code]?.duplicates || 0) > 0)
        )

        const iCanGiveThem = sortCodes(
          myDuplicateCodes.filter(code => !theirStickers[code]?.owned)
        )

        const exchangeCount = Math.min(theyCanGiveMe.length, iCanGiveThem.length)
        if (exchangeCount <= 0) return

        const myOffer = iCanGiveThem.slice(0, exchangeCount)
        const myRequest = theyCanGiveMe.slice(0, exchangeCount)

        foundMatches.push({
          user: otherUser,
          theyCanGiveMe,
          iCanGiveThem,
          myOffer,
          myRequest,
          exchangeCount,
          score: exchangeCount * 2 + Math.min(theyCanGiveMe.length, 20) * 0.1 + Math.min(iCanGiveThem.length, 20) * 0.1
        })
      })

      foundMatches.sort((a, b) => b.score - a.score || b.exchangeCount - a.exchangeCount)
      setMatches(foundMatches)
    } catch (err) {
      console.error('Error loading users for matching:', err)
    } finally {
      setLoading(false)
    }
  }

  const generateEmailBody = (match) => {
    const theirName = `${match.user.name || ''} ${match.user.surname || ''}`.trim() || 'amigo'
    const myName = `${user.name || ''} ${user.surname || ''}`.trim() || 'un coleccionista'

    return `Hola ${theirName},\n\nUn gusto, soy ${myName}. Vi que tenemos varias figuras de ${activeAlbum.shortTitle} para intercambiar.\n\nYo tengo repetidas para ofrecerte:\n${match.myOffer.join(', ')}\n\nY me gustaría intercambiar por estas figuras que tú tienes repetidas:\n${match.myRequest.join(', ')}\n\nPodemos coordinar por este correo si te parece bien.\n\nSaludos.`
  }

  const openEmailInvite = (match) => {
    if (!match.user.email) return
    const subject = `Invitación para intercambiar figuritas - ${activeAlbum.shortTitle}`
    const body = generateEmailBody(match)
    window.location.href = buildMailtoUrl({ to: match.user.email, subject, body })
  }

  const visibleMatches = showAll ? matches : matches.slice(0, 10)

  if (loading) {
    return <div className="loading">🔍 Buscando mejores matches...</div>
  }

  if (!user?.countryCode) {
    return (
      <div className="matches-page">
        <div className="matches-head">
          <div>
            <h2>🤝 Mejores matches</h2>
            <p>Para mostrarte intercambios relevantes necesitamos conocer tu país.</p>
          </div>
        </div>

        <div className="card empty-matches-card country-required-card">
          <p className="empty-icon">📍</p>
          <h3>Selecciona tu país para habilitar matches</h3>
          <p>Así evitamos mostrarte usuarios muy lejos de tu ubicación y priorizamos intercambios posibles.</p>
          <button type="button" className="btn-primary" onClick={() => navigate('/profile')}>
            Completar país en mi perfil
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="matches-page">
      <div className="matches-head">
        <div>
          <h2>🤝 Mejores matches</h2>
          <p>Ordenados por mayor cantidad de figuras intercambiables reales en {getCountryName(user.countryCode) || 'tu país'}.</p>
        </div>
        <button type="button" onClick={loadAllUsers} className="btn-refresh-matches">
          🔄 Actualizar
        </button>
      </div>

      <div className="card match-my-summary">
        <p>🔁 <strong>Tus repetidas:</strong> {myDuplicates.length}</p>
        <p>❌ <strong>Te faltan:</strong> {myMissing.length}</p>
        <small>El ranking prioriza usuarios que tienen repetidas que te faltan y a quienes tú puedes darles repetidas que ellos no tienen.</small>
      </div>

      {matches.length === 0 ? (
        <div className="card empty-matches-card">
          <p className="empty-icon">😔</p>
          <h3>Aún no hay matches útiles</h3>
          <p>Marca tus repetidas y espera que otros usuarios de {getCountryName(user.countryCode) || 'tu país'} también completen su álbum.</p>
        </div>
      ) : (
        <>
          <p className="match-count-line">
            ✅ {matches.length} match(es) encontrados. Mostrando {visibleMatches.length}{!showAll && matches.length > 10 ? ' mejores' : ''}.
          </p>

          <div className="match-list">
            {visibleMatches.map((match, index) => {
              const selected = selectedMatchId === match.user.id
              const hasEmail = Boolean(match.user.email)

              return (
                <div key={match.user.id} className="match-card enhanced-match-card">
                  <div className="match-card-head">
                    <div className="match-rank">#{index + 1}</div>
                    <div className="match-avatar">
                      <SafeProfileImage src={match.user.photoURL} alt="Foto de perfil" fallback={initials(match.user)} />
                    </div>
                    <div className="match-user-main">
                      <div className="user-name">{match.user.name} {match.user.surname}</div>
                      <div className="match-score-pill">{match.exchangeCount} intercambio{match.exchangeCount === 1 ? '' : 's'} posibles</div>
                    </div>
                  </div>

                  <div className="match-detail match-detail-grid">
                    <div>
                      <strong>🎁 Te puede dar</strong>
                      <p>{compactList(match.myRequest)}</p>
                    </div>
                    <div>
                      <strong>🎯 Tú le das</strong>
                      <p>{compactList(match.myOffer)}</p>
                    </div>
                  </div>

                  <div className="match-actions">
                    <button
                      className="btn-email-invite"
                      onClick={() => openEmailInvite(match)}
                      disabled={!hasEmail}
                      title={hasEmail ? 'Abrir correo con invitación automática' : 'Este usuario no tiene correo disponible'}
                    >
                      📩 Enviar invitación
                    </button>
                    <button
                      type="button"
                      className="btn-neutral-small"
                      onClick={() => setSelectedMatchId(selected ? null : match.user.id)}
                    >
                      {selected ? 'Ocultar mensaje' : 'Ver mensaje'}
                    </button>
                  </div>

                  {selected && (
                    <div className="message-preview-box">
                      <p>📝 Mensaje pre-armado:</p>
                      <div style={{ whiteSpace: 'pre-line' }}>{generateEmailBody(match)}</div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {matches.length > 10 && (
            <button type="button" className="btn-secondary" onClick={() => setShowAll(v => !v)}>
              {showAll ? 'Ver solo Top 10' : `Ver todos los matches (${matches.length})`}
            </button>
          )}
        </>
      )}
    </div>
  )
}
