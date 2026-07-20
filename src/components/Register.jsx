import { useEffect, useRef, useState } from 'react'
import { useUser } from '../context/UserContext'
import { useAlbum } from '../context/AlbumContext'
import { DEFAULT_ALBUM_ID } from '../albums/constants'
import { COUNTRIES, detectCountryCode } from '../data/countries'

function getAuthErrorMessage(err) {
  const code = err?.code || ''

  if (code.includes('auth/email-already-in-use')) {
    return 'Ese correo ya está registrado. Inicia sesión o recupera tu contraseña.'
  }

  if (code.includes('auth/account-exists-with-different-credential')) {
    return 'Ese correo ya existe con otro método de acceso. Intenta con Google o con correo y contraseña.'
  }

  if (code.includes('auth/popup-closed-by-user') || code.includes('auth/cancelled-popup-request')) {
    return 'Se canceló el acceso con Google. Puedes intentarlo nuevamente.'
  }

  if (code.includes('auth/popup-blocked')) {
    return 'El navegador bloqueó la ventana de Google. Permite ventanas emergentes e inténtalo nuevamente.'
  }

  if (code.includes('auth/unauthorized-domain')) {
    return 'Este dominio no está autorizado en Firebase Authentication.'
  }

  if (code.includes('auth/invalid-email')) {
    return 'Ingresa un correo válido.'
  }

  if (code.includes('auth/weak-password')) {
    return 'La contraseña debe tener al menos 6 caracteres.'
  }

  if (code.includes('auth/user-not-found') || code.includes('auth/wrong-password') || code.includes('auth/invalid-credential')) {
    return 'Correo o contraseña incorrectos.'
  }

  if (code.includes('auth/too-many-requests')) {
    return 'Demasiados intentos. Espera unos minutos y vuelve a probar.'
  }

  return err?.message || 'Ocurrió un error. Intenta nuevamente.'
}

export default function Register() {
  const { activeAlbum } = useAlbum()
  const {
    registerUser,
    loginUser,
    loginWithGoogle,
    completeProfile,
    resetPassword,
    resendVerificationEmail,
    refreshEmailVerification,
    pendingVerification,
    pendingProfile,
    loading,
    logout
  } = useUser()

  const [screen, setScreen] = useState('login')
  const [name, setName] = useState('')
  const [surname, setSurname] = useState('')
  const [countryCode, setCountryCode] = useState(() => detectCountryCode())
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const googleAttemptRef = useRef(0)

  useEffect(() => {
    if (pendingProfile) {
      setName(pendingProfile.name || '')
      setSurname(pendingProfile.surname || '')
      setCountryCode(pendingProfile.countryCode || detectCountryCode())
      setError('')
      setInfo('')
    }
  }, [pendingProfile])

  const resetMessages = () => {
    setError('')
    setInfo('')
  }

  const validateRegister = () => {
    if (!name.trim() || !surname.trim()) return 'Por favor completa nombre y apellido.'
    if (!countryCode) return 'Selecciona tu país para habilitar matches por ubicación.'
    if (!email.trim()) return 'Ingresa tu correo.'
    if (password.length < 6) return 'La contraseña debe tener al menos 6 caracteres.'
    if (password !== confirmPassword) return 'Las contraseñas no coinciden.'
    return ''
  }

  const validateProfile = () => {
    if (!name.trim() || !surname.trim()) return 'Completa nombre y apellido para identificar tu álbum.'
    if (!countryCode) return 'Selecciona tu país para habilitar matches por ubicación.'
    return ''
  }

  const handleGoogleAccess = async () => {
    const attemptId = Date.now()
    googleAttemptRef.current = attemptId
    resetMessages()
    setSubmitting(true)

    const safetyTimer = window.setTimeout(() => {
      if (googleAttemptRef.current === attemptId) setSubmitting(false)
    }, 15000)

    try {
      const result = await loginWithGoogle()
      if (result?.needsProfile) {
        setInfo('Acceso con Google correcto. Completa tus datos para entrar al álbum.')
      }
    } catch (err) {
      setError(getAuthErrorMessage(err))
      console.error(err)
    } finally {
      window.clearTimeout(safetyTimer)
      if (googleAttemptRef.current === attemptId) {
        googleAttemptRef.current = 0
        setSubmitting(false)
      }
    }
  }

  const handleLogin = async (event) => {
    event.preventDefault()
    resetMessages()

    if (!email.trim() || !password) {
      setError('Ingresa tu correo y contraseña.')
      return
    }

    setSubmitting(true)
    try {
      const result = await loginUser({ email, password })
      if (result?.needsVerification) {
        setInfo('Tu correo aún no está verificado. Revisa tu bandeja de entrada.')
      } else if (result?.needsProfile) {
        setInfo('Completa tus datos para entrar al álbum.')
      }
    } catch (err) {
      setError(getAuthErrorMessage(err))
      console.error(err)
    } finally {
      setSubmitting(false)
    }
  }

  const handleRegister = async (event) => {
    event.preventDefault()
    resetMessages()

    const validationError = validateRegister()
    if (validationError) {
      setError(validationError)
      return
    }

    setSubmitting(true)
    try {
      await registerUser({ name, surname, email, password, countryCode })
      setInfo('Te enviamos un correo de verificación. Ábrelo y confirma tu cuenta.')
    } catch (err) {
      setError(getAuthErrorMessage(err))
      console.error(err)
    } finally {
      setSubmitting(false)
    }
  }

  const handleCompleteProfile = async (event) => {
    event.preventDefault()
    resetMessages()

    const validationError = validateProfile()
    if (validationError) {
      setError(validationError)
      return
    }

    setSubmitting(true)
    try {
      await completeProfile({ name, surname, countryCode })
    } catch (err) {
      setError(getAuthErrorMessage(err))
      console.error(err)
    } finally {
      setSubmitting(false)
    }
  }

  const handleResetPassword = async () => {
    resetMessages()
    if (!email.trim()) {
      setError('Escribe tu correo para enviarte el enlace de recuperación.')
      return
    }

    setSubmitting(true)
    try {
      await resetPassword(email)
      setInfo('Te enviamos un correo para recuperar tu contraseña.')
    } catch (err) {
      setError(getAuthErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  const handleResendVerification = async () => {
    resetMessages()
    setSubmitting(true)
    try {
      await resendVerificationEmail()
      setInfo('Correo reenviado. Revisa tu bandeja de entrada o spam.')
    } catch (err) {
      setError(getAuthErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  const handleCheckVerification = async () => {
    resetMessages()
    setSubmitting(true)
    try {
      const verified = await refreshEmailVerification()
      if (!verified) {
        setError('Todavía no figura como verificado. Abre el enlace del correo y vuelve a presionar este botón.')
      }
    } catch (err) {
      setError(getAuthErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  if (loading) {
    return <div className="register-page"><div className="loading">Cargando...</div></div>
  }

  if (pendingProfile) {
    return (
      <div className="register-page">
        <div className="register-card">
          <h1>👤 Completa tu perfil</h1>
          <p className="subtitle">Tu cuenta ya está validada. Solo falta completar estos datos para usar tus álbumes.</p>
          <form onSubmit={handleCompleteProfile}>
            <div className="form-group"><label>Nombre</label><input type="text" placeholder="Tu nombre" value={name} onChange={event => setName(event.target.value)} autoComplete="given-name" autoFocus /></div>
            <div className="form-group"><label>Apellido</label><input type="text" placeholder="Tu apellido" value={surname} onChange={event => setSurname(event.target.value)} autoComplete="family-name" /></div>
            <div className="form-group"><label>País</label><select value={countryCode} onChange={event => setCountryCode(event.target.value)}><option value="">Selecciona tu país</option>{COUNTRIES.map(country => <option key={country.code} value={country.code}>{country.name}</option>)}</select><small className="field-hint">Usaremos tu país para mostrarte matches relevantes.</small></div>
            {info && <p className="form-info">{info}</p>}
            {error && <p className="form-error">{error}</p>}
            <button type="submit" className="btn-primary" disabled={submitting}>{submitting ? 'Guardando...' : 'Guardar y continuar'}</button>
          </form>
          <button type="button" className="btn-link" disabled={submitting} onClick={logout}>Usar otra cuenta</button>
        </div>
      </div>
    )
  }

  if (pendingVerification) {
    return (
      <div className="register-page">
        <div className="register-card">
          <h1>📩 Verifica tu correo</h1>
          <p className="subtitle">Tu cuenta está creada, pero falta confirmar el email.</p>
          <div className="auth-info-box">Enviamos un enlace de verificación a:<br /><strong>{pendingVerification.email}</strong></div>
          {info && <p className="form-info">{info}</p>}
          {error && <p className="form-error">{error}</p>}
          <button type="button" className="btn-primary" disabled={submitting} onClick={handleCheckVerification}>{submitting ? 'Verificando...' : 'Ya verifiqué mi correo'}</button>
          <button type="button" className="btn-secondary" disabled={submitting} onClick={handleResendVerification}>Reenviar correo de verificación</button>
          <button type="button" className="btn-link" disabled={submitting} onClick={logout}>Usar otro correo</button>
          <p className="auth-note">Si no lo ves, revisa spam o promociones. El acceso a tus álbumes se habilita cuando el correo esté verificado.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="register-page">
      <div className="register-card">
        <h1>⚽ FIGURAS COLECCIÓN</h1>
        <p className="subtitle">Todos tus álbumes en un solo lugar</p>

        {screen === 'login' ? (
          <div className="login-method-card auth-single-screen">
            <button type="button" className="btn-google" disabled={submitting} onClick={handleGoogleAccess}>
              <span className="google-icon">G</span>
              {submitting ? 'Conectando...' : 'Ingresar con Google'}
            </button>
            <p className="google-access-note">El mismo botón sirve para ingresar o crear tu cuenta con Google.</p>

            <div className="auth-divider"><span>o continúa con correo</span></div>

            <form onSubmit={handleLogin}>
              <div className="form-group"><label>Correo</label><input type="email" placeholder="tu@email.com" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" /></div>
              <div className="form-group"><label>Contraseña</label><input type="password" placeholder="Tu contraseña" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" /></div>
              {info && <p className="form-info">{info}</p>}
              {error && <p className="form-error">{error}</p>}
              <button type="submit" className="btn-primary" disabled={submitting} style={{ marginTop: '8px' }}>{submitting ? 'Procesando...' : 'Ingresar con correo'}</button>
            </form>

            <button type="button" className="btn-link" disabled={submitting} onClick={handleResetPassword}>Olvidé mi contraseña</button>
            <div className="auth-register-divider"><span>¿Todavía no tienes cuenta?</span></div>
            <button type="button" className="btn-secondary auth-register-email" disabled={submitting} onClick={() => { setScreen('register'); resetMessages() }}>Registrarme con correo</button>
          </div>
        ) : (
          <div className="register-method-card email-register-card">
            <h2>Crear cuenta con correo</h2>
            <p className="auth-section-title">Completa tus datos y verifica tu correo para ingresar.</p>
            <form onSubmit={handleRegister}>
              <div className="form-group"><label>Nombre</label><input type="text" placeholder="Tu nombre" value={name} onChange={event => setName(event.target.value)} autoComplete="given-name" /></div>
              <div className="form-group"><label>Apellido</label><input type="text" placeholder="Tu apellido" value={surname} onChange={event => setSurname(event.target.value)} autoComplete="family-name" /></div>
              <div className="form-group"><label>País</label><select value={countryCode} onChange={event => setCountryCode(event.target.value)}><option value="">Selecciona tu país</option>{COUNTRIES.map(country => <option key={country.code} value={country.code}>{country.name}</option>)}</select><small className="field-hint">Usaremos tu país para mostrarte matches relevantes.</small></div>
              <div className="form-group"><label>Correo</label><input type="email" placeholder="tu@email.com" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" /></div>
              <div className="form-group"><label>Contraseña</label><input type="password" placeholder="Mínimo 6 caracteres" value={password} onChange={event => setPassword(event.target.value)} autoComplete="new-password" /></div>
              <div className="form-group"><label>Confirmar contraseña</label><input type="password" placeholder="Repite tu contraseña" value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} autoComplete="new-password" /></div>
              {info && <p className="form-info">{info}</p>}
              {error && <p className="form-error">{error}</p>}
              <button type="submit" className="btn-primary" disabled={submitting} style={{ marginTop: '8px' }}>{submitting ? 'Procesando...' : 'Crear cuenta y verificar correo 🚀'}</button>
            </form>
            <button type="button" className="btn-link" disabled={submitting} onClick={() => { setScreen('login'); resetMessages() }}>← Volver a ingresar</button>
          </div>
        )}

        <p className="auth-note">Cada usuario gestiona sus propios álbumes. Tu avance queda guardado en la nube y separado por cuenta.</p>
      </div>
    </div>
  )
}
