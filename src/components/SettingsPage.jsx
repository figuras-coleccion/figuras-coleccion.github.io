import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '../context/UserContext'
import { useStickers } from '../context/StickersContext'
import { db, ref, get, update } from '../firebase'
import HowItWorksModal from './HowItWorksModal'
import DonationModal from './DonationModal'
import { getAllStickers } from '../data/stickersData'

const ALL_CODES = getAllStickers().map(sticker => sticker.code)

const styles = `
.settings-page{max-width:880px;margin:0 auto;padding:4px 0 28px;color:#0f172a}.settings-page-header{display:flex;align-items:center;gap:14px;margin-bottom:18px;padding:18px;border:1px solid #e2e8f0;border-radius:22px;background:#fff;box-shadow:0 10px 28px rgba(15,23,42,.06)}.settings-page-avatar{width:58px;height:58px;display:grid;place-items:center;overflow:hidden;flex:0 0 58px;border-radius:50%;background:linear-gradient(135deg,#2563eb,#4f46e5);color:#fff;font-size:22px;font-weight:900}.settings-page-avatar img{width:100%;height:100%;object-fit:cover}.settings-page-header h2{margin:0;font-size:24px}.settings-page-header p{margin:5px 0 0;color:#64748b;font-size:12px;font-weight:700}.settings-menu-card{overflow:hidden;border:1px solid #e2e8f0;border-radius:22px;background:#fff;box-shadow:0 10px 28px rgba(15,23,42,.06)}.settings-menu-card>button{width:100%;min-height:78px;display:grid;grid-template-columns:48px minmax(0,1fr) 22px;align-items:center;gap:12px;padding:12px 16px;border:0;border-bottom:1px solid #e8edf4;background:#fff;color:#0f172a;text-align:left}.settings-menu-card>button:last-child{border-bottom:0}.settings-menu-card strong{display:block;font-size:14px}.settings-menu-card small{display:block;margin-top:3px;color:#64748b;font-size:10px;font-weight:700}.settings-menu-card>button>i{color:#94a3b8;font-size:28px;font-style:normal}.settings-menu-icon{width:42px;height:42px;display:grid;place-items:center;border-radius:13px;font-size:19px;font-weight:900}.settings-menu-icon.blue{background:#edf4ff;color:#2563eb}.settings-menu-icon.purple{background:#f5efff}.settings-menu-icon.amber{background:#fff7e8;color:#b45309}.settings-menu-icon.red{background:#fff0f0;color:#dc2626}.settings-menu-icon.donation{background:#eef4ff;color:#2563eb}.settings-logout-option strong{color:#b42318}.settings-page-footer{margin-top:20px;color:#64748b;text-align:center;font-size:10px;font-weight:700}.settings-help-overlay{position:fixed;inset:0;z-index:5000;display:grid;align-items:end;background:rgba(15,23,42,.58);backdrop-filter:blur(6px)}.settings-help-sheet{width:min(100%,700px);max-height:94vh;overflow:auto;margin:0 auto;padding:12px 20px 24px;border-radius:28px 28px 0 0;background:#fff}.settings-help-handle{width:54px;height:6px;display:block;margin:2px auto 18px;border-radius:999px;background:#cbd5e1}.settings-help-sheet h2{margin:0 0 18px;text-align:center;font-size:28px}.settings-help-step{padding:10px 0 14px;border-bottom:1px solid #eef2f7}.settings-help-step p{margin:0 0 10px;color:#64748b;text-align:center;font-size:14px;font-weight:700}.settings-help-demo{display:flex;align-items:center;justify-content:center;gap:20px}.settings-help-arrow{color:#64748b;font-size:32px}.settings-sticker-example{position:relative;width:70px;height:70px;display:grid;place-items:center;border-radius:50%;font-size:24px}.settings-sticker-example.missing{background:#edf1f6;color:#64748b}.settings-sticker-example.owned{background:#748196;color:#fff}.settings-sticker-example i{position:absolute;right:-5px;top:-5px;min-width:27px;height:27px;display:grid;place-items:center;border:2px solid #fff;border-radius:999px;background:#2563eb;color:#fff;font-size:12px;font-style:normal;font-weight:900}.settings-help-notes{display:grid;gap:9px;margin-top:14px}.settings-help-notes>div{display:grid;grid-template-columns:32px 1fr;gap:8px;padding:10px 11px;border-radius:13px;background:#f8fafc}.settings-help-notes p{margin:0;color:#475569;font-size:11px;font-weight:700;line-height:1.45}.settings-help-confirm{width:100%;min-height:52px;margin-top:16px;border:0;border-radius:16px;background:#315bdc;color:#fff;font-size:15px;font-weight:900}.settings-complete-overlay{position:fixed;inset:0;z-index:5200;display:grid;place-items:center;padding:20px;background:rgba(15,23,42,.62);backdrop-filter:blur(6px)}.settings-complete-dialog{position:relative;width:min(100%,430px);padding:26px 22px 22px;border-radius:24px;background:#fff;box-shadow:0 26px 70px rgba(15,23,42,.32);text-align:center}.settings-complete-close{position:absolute;right:14px;top:12px;width:36px;height:36px;display:grid;place-items:center;border:0;border-radius:50%;background:#f1f5f9;color:#475569;font-size:24px}.settings-complete-icon{width:62px;height:62px;margin:0 auto 12px;display:grid;place-items:center;border-radius:50%;background:#fff7e8;font-size:30px}.settings-complete-dialog h3{margin:0;color:#0f172a;font-size:21px}.settings-complete-dialog p{margin:10px 0 0;color:#64748b;font-size:12px;font-weight:700;line-height:1.55}.settings-complete-warning{margin-top:14px!important;padding:11px 12px;border-radius:14px;background:#fff7e8;color:#92400e!important}.settings-complete-error{margin-top:12px;color:#b42318;font-size:11px;font-weight:800}.settings-complete-actions{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:18px}.settings-complete-actions button{min-height:48px;border-radius:14px;font-size:12px;font-weight:900}.settings-complete-cancel{border:1px solid #dbe4f0;background:#f8fafc;color:#334155}.settings-complete-confirm{border:0;background:#315bdc;color:#fff}.settings-complete-confirm:disabled,.settings-complete-cancel:disabled{opacity:.6}@media(min-width:761px){.settings-help-overlay{align-items:center;padding:22px}.settings-help-sheet{border-radius:28px}}@media(max-width:520px){.settings-page-header{padding:14px;border-radius:18px}.settings-page-avatar{width:50px;height:50px;flex-basis:50px}.settings-page-header h2{font-size:21px}.settings-menu-card{border-radius:18px}.settings-menu-card>button{min-height:72px;padding:10px 13px}.settings-help-sheet h2{font-size:24px}.settings-help-step p{font-size:13px}.settings-sticker-example{width:64px;height:64px}.settings-complete-dialog{padding:24px 18px 18px;border-radius:22px}}
`

export default function SettingsPage() {
  const navigate = useNavigate()
  const { user, logout } = useUser()
  const { stickers } = useStickers()
  const [helpOpen, setHelpOpen] = useState(false)
  const [donationOpen, setDonationOpen] = useState(false)
  const [completeOpen, setCompleteOpen] = useState(false)
  const [completing, setCompleting] = useState(false)
  const [completeError, setCompleteError] = useState('')
  const [loggingOut, setLoggingOut] = useState(false)
  const initial = (user?.name || user?.email || 'U').slice(0, 1).toUpperCase()
  const missingCount = ALL_CODES.reduce((total, code) => total + (stickers[code]?.owned ? 0 : 1), 0)

  const handleLogout = async () => {
    if (loggingOut) return
    setLoggingOut(true)
    try { await logout() } finally { setLoggingOut(false) }
  }

  const handleCompleteAlbum = async () => {
    if (!user?.id || completing) return
    setCompleting(true)
    setCompleteError('')

    try {
      const snapshot = await get(ref(db, `users/${user.id}/stickers`))
      const cloudStickers = snapshot.val() || {}
      const now = Date.now()
      const updates = {}

      ALL_CODES.forEach(code => {
        const existing = cloudStickers[code] && typeof cloudStickers[code] === 'object'
          ? cloudStickers[code]
          : {}
        const local = stickers[code] || existing
        const duplicates = Math.max(0, Number(local?.duplicates ?? existing?.duplicates) || 0)
        const stateChanged = !Boolean(existing.owned) || duplicates !== Math.max(0, Number(existing.duplicates) || 0)
        if (!stateChanged) return

        updates[`users/${user.id}/stickers/${code}`] = {
          ...existing,
          owned: true,
          duplicates,
          obtainedAt: Number(existing.obtainedAt) > 0 ? existing.obtainedAt : now,
          updatedAt: now
        }
      })

      updates[`users/${user.id}/collectionStats/lastBulkCompleteAt`] = now
      updates[`users/${user.id}/collectionStats/lastActivityAt`] = now
      await update(ref(db), updates)

      window.setTimeout(() => {
        const base = import.meta.env.BASE_URL || '/'
        window.location.assign(`${base}album?completed=1`)
      }, 900)
    } catch (error) {
      console.error('No se pudo completar el álbum:', error)
      setCompleteError('No se pudo completar el álbum. Revisa tu conexión e inténtalo nuevamente.')
      setCompleting(false)
    }
  }

  return (
    <div className="settings-page">
      <style>{styles}</style>
      <header className="settings-page-header"><div className="settings-page-avatar">{user?.photoURL ? <img src={user.photoURL} alt="Foto de perfil" /> : <span>{initial}</span>}</div><div><h2>Configuración</h2><p>{`${user?.name || ''} ${user?.surname || ''}`.trim() || user?.email || 'Mi cuenta'}</p></div></header>
      <section className="settings-menu-card" aria-label="Opciones de configuración">
        <button type="button" onClick={() => setHelpOpen(true)}><span className="settings-menu-icon blue">?</span><span><strong>¿Cómo funciona?</strong><small>Aprende a usar el álbum y los trueques</small></span><i>›</i></button>
        <button type="button" onClick={() => navigate('/profile')}><span className="settings-menu-icon purple">👤</span><span><strong>Perfil</strong><small>Datos personales y foto de usuario</small></span><i>›</i></button>
        <button type="button" onClick={() => { setCompleteError(''); setCompleteOpen(true) }}><span className="settings-menu-icon amber">✓</span><span><strong>Marcar álbum como completo</strong><small>{missingCount > 0 ? `Marcar ${missingCount} figuritas faltantes como pegadas` : 'El álbum ya figura como completo'}</small></span><i>›</i></button>
        <button type="button" className="settings-logout-option" onClick={handleLogout} disabled={loggingOut}><span className="settings-menu-icon red">↪</span><span><strong>{loggingOut ? 'Cerrando sesión…' : 'Salir'}</strong><small>Cerrar la sesión de esta cuenta</small></span><i>›</i></button>
        <button type="button" onClick={() => setDonationOpen(true)}><span className="settings-menu-icon donation">💙</span><span><strong>Realizar donación</strong><small>Mantener el servicio libre, sin publicidad y con nuevos álbumes</small></span><i>›</i></button>
      </section>
      <footer className="settings-page-footer">Creado por un padre para su hijo · © 2026 · Perú 🇵🇪</footer>
      {helpOpen ? <HowItWorksModal onClose={() => setHelpOpen(false)} /> : null}
      {donationOpen ? <DonationModal onClose={() => setDonationOpen(false)} /> : null}
      {completeOpen ? (
        <div className="settings-complete-overlay" onClick={() => !completing && setCompleteOpen(false)} role="presentation">
          <section className="settings-complete-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-complete-title" onClick={event => event.stopPropagation()}>
            <button type="button" className="settings-complete-close" onClick={() => setCompleteOpen(false)} disabled={completing} aria-label="Cerrar">×</button>
            <div className="settings-complete-icon" aria-hidden="true">📘</div>
            <h3 id="settings-complete-title">¿Completar todo el álbum?</h3>
            <p>{missingCount > 0 ? `Se marcarán como pegadas las ${missingCount} figuritas que todavía aparecen como faltantes.` : 'Todas las figuritas ya aparecen como pegadas.'}</p>
            <p className="settings-complete-warning">Las repetidas actuales no cambiarán. Después podrás retirar manualmente las pocas figuritas que realmente no tengas.</p>
            {completeError ? <div className="settings-complete-error" role="alert">{completeError}</div> : null}
            <div className="settings-complete-actions">
              <button type="button" className="settings-complete-cancel" onClick={() => setCompleteOpen(false)} disabled={completing}>Cancelar</button>
              <button type="button" className="settings-complete-confirm" onClick={() => void handleCompleteAlbum()} disabled={completing || missingCount === 0}>{completing ? 'Completando…' : missingCount === 0 ? 'Ya está completo' : 'Sí, completar álbum'}</button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}
