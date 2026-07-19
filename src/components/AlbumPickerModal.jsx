import { useEffect, useMemo, useState } from 'react'
import { db, get, ref } from '../firebase'
import { getAlbumChildPath } from '../albums/runtime'

const styles = `
.album-picker-overlay{position:fixed;inset:0;z-index:5600;display:grid;place-items:center;padding:18px;background:rgba(15,23,42,.66);backdrop-filter:blur(7px)}
.album-picker-dialog{width:min(100%,720px);max-height:92vh;overflow:auto;padding:22px;border-radius:24px;background:#fff;box-shadow:0 28px 80px rgba(15,23,42,.38)}
.album-picker-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px}.album-picker-head h3{margin:0;font-size:22px}.album-picker-head p{margin:5px 0 0;color:#64748b;font-size:12px;font-weight:700}.album-picker-close{width:38px;height:38px;display:grid;place-items:center;flex:0 0 38px;border:0;border-radius:50%;background:#f1f5f9;color:#475569;font-size:24px}
.album-picker-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:18px}.album-picker-card{min-width:0;display:grid;grid-template-columns:68px minmax(0,1fr);gap:13px;align-items:center;padding:14px;border:2px solid #e2e8f0;border-radius:16px;background:#fff;text-align:left}.album-picker-card.selected{border-color:#315bdc;background:#f4f7ff}.album-picker-card.current{box-shadow:inset 0 0 0 1px #315bdc}.album-picker-card img{width:64px;height:64px;object-fit:contain}.album-picker-card strong{display:block;font-size:14px}.album-picker-card small{display:block;margin-top:4px;color:#64748b;font-size:10px;font-weight:700;line-height:1.4}.album-picker-card em{display:inline-block;margin-top:8px;padding:4px 8px;border-radius:999px;background:#e8efff;color:#315bdc;font-size:9px;font-style:normal;font-weight:900}
.album-picker-progress{height:6px;margin-top:9px;overflow:hidden;border-radius:999px;background:#e2e8f0}.album-picker-progress span{display:block;height:100%;background:#315bdc}.album-picker-actions{display:grid;grid-template-columns:1fr 1.4fr;gap:10px;margin-top:18px}.album-picker-actions button{min-height:50px;border-radius:14px;font-size:12px;font-weight:900}.album-picker-cancel{border:1px solid #dbe4f0;background:#f8fafc;color:#334155}.album-picker-confirm{border:0;background:#315bdc;color:#fff}.album-picker-confirm:disabled{opacity:.55}
@media(max-width:620px){.album-picker-dialog{padding:18px;border-radius:20px}.album-picker-list{grid-template-columns:1fr}.album-picker-card{grid-template-columns:58px minmax(0,1fr)}.album-picker-card img{width:54px;height:54px}.album-picker-actions{grid-template-columns:1fr}}
`

export default function AlbumPickerModal({ albums, activeAlbumId, userId, onCancel, onConfirm }) {
  const [selectedAlbumId, setSelectedAlbumId] = useState(activeAlbumId)
  const [progressByAlbum, setProgressByAlbum] = useState({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    let mounted = true

    async function loadProgress() {
      try {
        const entries = await Promise.all(albums.map(async album => {
          const snapshot = await get(ref(db, getAlbumChildPath(userId, 'stickers', album.id)))
          const stickers = snapshot.val() || {}
          const owned = album.allStickersOrdered.reduce(
            (total, code) => total + (stickers[code]?.owned ? 1 : 0),
            0
          )
          return [album.id, { owned, total: album.totalStickers }]
        }))
        if (mounted) setProgressByAlbum(Object.fromEntries(entries))
      } catch (error) {
        console.warn('No se pudo cargar el progreso de todos los álbumes:', error)
      } finally {
        if (mounted) setLoading(false)
      }
    }

    void loadProgress()
    return () => { mounted = false }
  }, [albums, userId])

  const selectedAlbum = useMemo(
    () => albums.find(album => album.id === selectedAlbumId),
    [albums, selectedAlbumId]
  )

  const handleConfirm = async () => {
    if (!selectedAlbum || submitting) return
    setSubmitting(true)
    try {
      await onConfirm(selectedAlbum.id)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="album-picker-overlay" role="presentation" onClick={() => !submitting && onCancel()}>
      <style>{styles}</style>
      <section className="album-picker-dialog" role="dialog" aria-modal="true" aria-labelledby="album-picker-title" onClick={event => event.stopPropagation()}>
        <header className="album-picker-head">
          <div><h3 id="album-picker-title">Selecciona un álbum</h3><p>Tu colección y tus estadísticas se guardan por separado.</p></div>
          <button type="button" className="album-picker-close" onClick={onCancel} disabled={submitting} aria-label="Cerrar">×</button>
        </header>

        <div className="album-picker-list">
          {albums.map(album => {
            const progress = progressByAlbum[album.id] || { owned: 0, total: album.totalStickers }
            const percent = progress.total ? Math.round((progress.owned / progress.total) * 100) : 0
            const icon = `${import.meta.env.BASE_URL || '/'}${album.icon}`
            return (
              <button
                key={album.id}
                type="button"
                className={`album-picker-card ${selectedAlbumId === album.id ? 'selected' : ''} ${activeAlbumId === album.id ? 'current' : ''}`}
                onClick={() => setSelectedAlbumId(album.id)}
                disabled={submitting}
              >
                <img src={icon} alt="" />
                <span>
                  <strong>{album.shortTitle}</strong>
                  <small>{loading ? 'Cargando progreso…' : `${progress.owned} / ${progress.total} figuritas · ${percent}%`}</small>
                  <span className="album-picker-progress"><span style={{ width: `${percent}%` }} /></span>
                  {activeAlbumId === album.id ? <em>Álbum cargado</em> : null}
                </span>
              </button>
            )
          })}
        </div>

        <div className="album-picker-actions">
          <button type="button" className="album-picker-cancel" onClick={onCancel} disabled={submitting}>Cancelar</button>
          <button type="button" className="album-picker-confirm" onClick={() => void handleConfirm()} disabled={submitting || selectedAlbumId === activeAlbumId}>{submitting ? 'Cargando…' : 'CARGAR ÁLBUM'}</button>
        </div>
      </section>
    </div>
  )
}
