import { Outlet, NavLink, Link, useLocation } from 'react-router-dom'
import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { useUser } from '../context/UserContext'
import { useStickers } from '../context/StickersContext'
import { useEditLock } from '../context/EditLockContext'
import { db, ref, get } from '../firebase'
import HowItWorksModal from './HowItWorksModal'

const headerStyles = `
  .app-header{min-height:108px;padding:12px 16px;gap:14px}.brand-block{flex:1 1 auto;min-width:0}.brand-primary{display:flex;align-items:center;gap:14px;min-width:0}.brand-logo{width:clamp(74px,8vw,96px);height:clamp(74px,8vw,96px);flex:0 0 auto;display:block;object-fit:contain;filter:drop-shadow(0 5px 10px rgba(15,23,42,.14))}.app-header .brand-title{margin:0;max-width:none;color:#050505!important;font-family:'Poppins','Montserrat','Avenir Next',Arial,sans-serif;font-size:clamp(24px,3.2vw,42px)!important;font-weight:800!important;line-height:1.03!important;letter-spacing:-.035em}.brand-title-line{display:block;white-space:nowrap}.brand-tagline,.brand-members{margin-left:calc(clamp(74px,8vw,96px) + 14px)}
  @media(max-width:760px){.app-header{min-height:102px;padding:10px 12px}.brand-logo{width:76px;height:76px}.app-header .brand-title{font-size:clamp(19px,4.7vw,27px)!important}.brand-tagline,.brand-members{display:none!important}}
  @media(max-width:520px){.app-header{min-height:96px;padding:9px;gap:8px}.brand-primary{gap:10px}.brand-logo{width:68px;height:68px}.app-header .brand-title{font-size:clamp(17px,4.9vw,23px)!important;line-height:1.05!important}.header-profile-text{display:none!important}}
  @media(max-width:390px){.brand-logo{width:60px;height:60px}.app-header .brand-title{font-size:16px!important}}
`

export default function Layout() {
  const { user, logout, isAdmin, markHowItWorksAsSeen } = useUser()
  const { pendingChanges, saveToCloud } = useStickers()
  const { editingLocked, toggleEditingLock } = useEditLock()
  const location = useLocation()
  const [memberCount, setMemberCount] = useState(null)
  const [firstRunHelpOpen, setFirstRunHelpOpen] = useState(false)
  const initial = (user?.name || user?.email || 'U').slice(0, 1).toUpperCase()

  const pendingSignature = useMemo(
    () => Object.keys(pendingChanges || {}).sort().join('|'),
    [pendingChanges]
  )

  useLayoutEffect(() => {
    const resetScroll = () => {
      window.scrollTo({ top: 0, left: 0, behavior: 'auto' })
      document.documentElement.scrollTop = 0
      document.body.scrollTop = 0
      document.querySelector('.main-content')?.scrollTo?.({ top: 0, left: 0, behavior: 'auto' })
    }
    resetScroll()
    const frame = window.requestAnimationFrame(resetScroll)
    return () => window.cancelAnimationFrame(frame)
  }, [location.pathname])

  useEffect(() => {
    let mounted = true
    const loadMemberCount = async () => {
      try {
        const snapshot = await get(ref(db, 'users'))
        const total = snapshot.exists() ? Object.keys(snapshot.val() || {}).length : 0
        if (mounted) setMemberCount(total)
      } catch (error) {
        console.warn('No se pudo cargar el número de miembros:', error)
        if (mounted) setMemberCount(null)
      }
    }
    loadMemberCount()
    return () => { mounted = false }
  }, [])

  useEffect(() => {
    if (!user?.id || !pendingSignature) return undefined
    const timer = window.setTimeout(() => saveToCloud(), 650)
    return () => window.clearTimeout(timer)
  }, [pendingSignature, saveToCloud, user?.id])


  useEffect(() => {
    if (!user?.id || user.showHowItWorksOnFirstLogin !== true) {
      setFirstRunHelpOpen(false)
      return undefined
    }

    const timer = window.setTimeout(() => {
      setFirstRunHelpOpen(true)
    }, 180)

    return () => window.clearTimeout(timer)
  }, [user?.id, user?.showHowItWorksOnFirstLogin])

  const handleFirstRunHelpClose = async () => {
    setFirstRunHelpOpen(false)
    try {
      await markHowItWorksAsSeen()
    } catch (error) {
      console.warn('No se pudo registrar que el tutorial fue visto:', error)
    }
  }

  const formattedMembers = memberCount === null ? null : new Intl.NumberFormat('es-PE').format(memberCount)
  const navClass = ({ isActive }) => isActive ? 'active' : ''

  return (
    <>
      <style>{headerStyles}</style>
      <header className="app-header">
        <div className="brand-block">
          <div className="brand-primary">
            <img className="brand-logo" src={`${import.meta.env.BASE_URL || '/'}iconopanini2026album.svg`} alt="Panini World Cup 2026 Sticker Tracker" />
            <h1 className="brand-title"><span className="brand-title-line">Panini World Cup 2026</span><span className="brand-title-line">Sticker Tracker</span></h1>
          </div>
          <p className="brand-tagline">Completar el álbum es más rápido y fácil cuando todos aportamos.</p>
          {formattedMembers && <p className="brand-members">👥 {formattedMembers} miembros registrados</p>}
        </div>

        <div className="user-info">
          <div className="header-user-actions">
            <button type="button" className={`header-edit-lock ${editingLocked ? 'locked' : 'unlocked'}`} onClick={toggleEditingLock} aria-pressed={editingLocked} aria-label={editingLocked ? 'Desbloquear edición del álbum' : 'Bloquear edición del álbum'} title={editingLocked ? 'Edición bloqueada. Toca para desbloquear.' : 'Edición habilitada. Toca para bloquear.'}>{editingLocked ? '🔒' : '🔓'}</button>
            <Link to="/profile" className="header-profile-link" title="Ver mi perfil">
              <div className="header-avatar">{user?.photoURL ? <img src={user.photoURL} alt="Foto de perfil" /> : <span>{initial}</span>}</div>
              <div className="header-profile-text"><strong>{user?.name} {user?.surname}</strong><small>Mi perfil ⚙️</small></div>
            </Link>
          </div>
          <button className="header-logout" onClick={logout}>Salir</button>
        </div>
      </header>

      <main className="main-content"><Outlet /></main>

      <nav className="bottom-nav">
        <NavLink to="/" end className={navClass}><span className="icon">📊</span><span>Dashboard</span></NavLink>
        <NavLink to="/album" className={navClass}><span className="icon">📖</span><span>Álbum</span></NavLink>
        <NavLink to="/trade" className={navClass}><span className="icon">🔄</span><span>Trueque</span></NavLink>
        <NavLink to="/settings" className={navClass}><span className="icon">⚙️</span><span>Configuración</span></NavLink>
        {isAdmin && <NavLink to="/admin" className={navClass}><span className="icon">🛡️</span><span>Admin</span></NavLink>}
        <NavLink to="/extras" className={navClass}><span className="icon">📦</span><span>Extras</span></NavLink>
      </nav>

      {firstRunHelpOpen ? <HowItWorksModal onClose={() => void handleFirstRunHelpClose()} /> : null}
    </>
  )
}
