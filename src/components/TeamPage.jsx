import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useStickers } from '../context/StickersContext'
import { getAlbumGroup } from '../data/albumGroups'
import StickerGrid from './StickerGrid'

export default function TeamPage() {
  const { teamCode } = useParams()
  const { stickers, pendingChanges, updateStickerLocal, saveTeamPage, isStickerLocked, deleteSavedSticker } = useStickers()
  const navigate = useNavigate()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const group = getAlbumGroup(teamCode)
  const validTeam = Boolean(group)
  
  useEffect(() => {
    if (!validTeam) {
      navigate('/', { replace: true })
    }
  }, [validTeam, navigate])

  if (!validTeam) return null

  const teamStickers = group.codes.map(code => ({
      code,
      owned: stickers[code]?.owned || false,
      duplicates: stickers[code]?.duplicates || 0,
      locked: isStickerLocked(code),
      pending: Boolean(pendingChanges[code])
  }))
  const teamTotal = teamStickers.length

  const ownedCount = teamStickers.filter(s => s.owned).length
  const missingList = teamStickers.filter(s => !s.owned).map(s => s.code)
  const duplicatesList = teamStickers.filter(s => s.duplicates > 0)

  const handleSave = async () => {
    setSaving(true)
    const success = await saveTeamPage(group.id)
    setSaving(false)
    if (success) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
        <button
          onClick={() => navigate('/')}
          style={{
            background: 'transparent',
            color: 'var(--text)',
            fontSize: '20px',
            padding: '4px 8px'
          }}
        >
          ←
        </button>
        <h2 style={{ fontSize: '18px' }}>
          {group.title}
        </h2>
        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
          ({ownedCount}/{teamTotal})
        </span>
      </div>

      <StickerGrid stickers={teamStickers} onUpdate={updateStickerLocal} onDeleteSaved={deleteSavedSticker} />

      {/* Resumen */}
      <div style={{ marginTop: '20px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
        <div className="card">
          <h4 style={{ fontSize: '13px', color: 'var(--success)', marginBottom: '8px' }}>
            ✅ Tengo ({ownedCount})
          </h4>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
            {teamStickers.filter(s => s.owned).map(s => s.code).join(', ') || 'Ninguna'}
          </div>
        </div>
        <div className="card">
          <h4 style={{ fontSize: '13px', color: 'var(--primary)', marginBottom: '8px' }}>
            ❌ Me faltan ({missingList.length})
          </h4>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', wordBreak: 'break-all' }}>
            {missingList.join(', ') || '¡Completa!'}
          </div>
        </div>
      </div>

      {duplicatesList.length > 0 && (
        <div className="card" style={{ marginTop: '12px' }}>
          <h4 style={{ fontSize: '13px', color: 'var(--accent)', marginBottom: '8px' }}>
            🔁 Repetidas en esta página
          </h4>
          {duplicatesList.map(s => (
            <span key={s.code} style={{ fontSize: '11px', marginRight: '8px' }}>
              {s.code} ({s.duplicates})
            </span>
          ))}
        </div>
      )}

      <div style={{ textAlign: 'center', marginTop: '20px' }}>
        <button
          onClick={handleSave}
          disabled={saving}
          className="btn-primary"
          style={{ background: saved ? 'var(--success)' : 'var(--primary)' }}
        >
          {saving ? 'Guardando...' : saved ? '✅ Guardado' : '💾 Guardar página'}
        </button>
      </div>
    </div>
  )
}
