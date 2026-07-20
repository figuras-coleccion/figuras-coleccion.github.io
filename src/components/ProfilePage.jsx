import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useUser } from '../context/UserContext'
import { COUNTRIES, getCountryName } from '../data/countries'
import SafeProfileImage from './SafeProfileImage'

const MAX_IMAGE_MB = 5
const MAX_IMAGE_BYTES = MAX_IMAGE_MB * 1024 * 1024
const AVATAR_SIZE = 320

function getProviderLabel(provider = '') {
  if (provider.includes('google')) return 'Google'
  if (provider.includes('password')) return 'Correo y contraseña'
  return provider || 'Cuenta'
}

function normalizeText(value) {
  return String(value || '').trim()
}

function normalizeProfileData({ name, surname, countryCode, photoURL }) {
  return {
    name: normalizeText(name),
    surname: normalizeText(surname),
    countryCode: normalizeText(countryCode),
    photoURL: String(photoURL || '')
  }
}

function resizeAvatarImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = () => {
      const image = new Image()

      image.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = AVATAR_SIZE
        canvas.height = AVATAR_SIZE
        const ctx = canvas.getContext('2d')

        const sourceSize = Math.min(image.width, image.height)
        const sourceX = (image.width - sourceSize) / 2
        const sourceY = (image.height - sourceSize) / 2

        ctx.fillStyle = '#ffffff'
        ctx.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE)
        ctx.drawImage(
          image,
          sourceX,
          sourceY,
          sourceSize,
          sourceSize,
          0,
          0,
          AVATAR_SIZE,
          AVATAR_SIZE
        )

        resolve(canvas.toDataURL('image/jpeg', 0.78))
      }

      image.onerror = () => reject(new Error('No se pudo leer la imagen seleccionada.'))
      image.src = reader.result
    }

    reader.onerror = () => reject(new Error('No se pudo cargar la imagen.'))
    reader.readAsDataURL(file)
  })
}

export default function ProfilePage() {
  const navigate = useNavigate()
  const fileInputRef = useRef(null)
  const { user, firebaseUser, updateUserProfile, resetPassword } = useUser()
  const [name, setName] = useState('')
  const [surname, setSurname] = useState('')
  const [countryCode, setCountryCode] = useState('')
  const [photoURL, setPhotoURL] = useState('')
  const [photoSource, setPhotoSource] = useState('none')
  const [savedProfile, setSavedProfile] = useState(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState('')

  const googlePhotoURL = useMemo(() => {
    const providerPhoto = firebaseUser?.providerData?.find(item => item.providerId === 'google.com')?.photoURL
    return providerPhoto || user?.googlePhotoURL || ''
  }, [firebaseUser, user?.googlePhotoURL])

  useEffect(() => {
    if (!user) return

    const initial = normalizeProfileData({
      name: user.name || '',
      surname: user.surname || '',
      countryCode: user.countryCode || '',
      photoURL: user.photoURL || ''
    })

    setName(initial.name)
    setSurname(initial.surname)
    setCountryCode(initial.countryCode)
    setPhotoURL(initial.photoURL)
    setPhotoSource(user.photoSource || (initial.photoURL ? 'profile' : 'none'))
    setSavedProfile(initial)
  }, [user])

  const currentProfile = useMemo(() => normalizeProfileData({
    name,
    surname,
    countryCode,
    photoURL
  }), [name, surname, countryCode, photoURL])

  const hasChanges = useMemo(() => {
    if (!savedProfile) return false
    return (
      currentProfile.name !== savedProfile.name ||
      currentProfile.surname !== savedProfile.surname ||
      currentProfile.countryCode !== savedProfile.countryCode ||
      currentProfile.photoURL !== savedProfile.photoURL
    )
  }, [currentProfile, savedProfile])

  const photoLabel = useMemo(() => {
    if (!photoURL) return 'Avatar automático'
    if (googlePhotoURL && photoURL === googlePhotoURL) return 'Foto de Google'
    return 'Foto cargada desde galería'
  }, [photoURL, googlePhotoURL])

  const handleChoosePhoto = () => {
    fileInputRef.current?.click()
  }

  const handlePhotoChange = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    setError('')
    setInfo('')

    if (!file) return

    if (!file.type.startsWith('image/')) {
      setError('Selecciona una imagen válida desde tu galería.')
      return
    }

    if (file.size > MAX_IMAGE_BYTES) {
      setError(`La imagen es muy pesada. Usa una foto menor a ${MAX_IMAGE_MB} MB.`)
      return
    }

    try {
      const resized = await resizeAvatarImage(file)
      setPhotoURL(resized)
      setPhotoSource('upload')
      setInfo('Foto lista para guardar. Presiona “Guardar cambios” para actualizar tu perfil.')
    } catch (err) {
      console.error(err)
      setError(err?.message || 'No se pudo procesar la imagen.')
    }
  }

  const handleUseGooglePhoto = () => {
    if (!googlePhotoURL) return
    setError('')
    setInfo('Foto de Google lista para guardar.')
    setPhotoURL(googlePhotoURL)
    setPhotoSource('google')
  }

  const handleRemovePhoto = () => {
    setError('')
    setInfo('Foto retirada. Se mostrará un avatar automático al guardar.')
    setPhotoURL('')
    setPhotoSource('none')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setInfo('')

    if (!hasChanges) return

    if (!currentProfile.name || !currentProfile.surname) {
      setError('Completa nombre y apellido.')
      return
    }

    if (!currentProfile.countryCode) {
      setError('Selecciona tu país para habilitar matches por ubicación.')
      return
    }

    setSaving(true)
    try {
      const updated = await updateUserProfile({
        name: currentProfile.name,
        surname: currentProfile.surname,
        countryCode: currentProfile.countryCode,
        photoURL: currentProfile.photoURL,
        photoSource
      })

      const saved = normalizeProfileData({
        name: updated.name,
        surname: updated.surname,
        countryCode: updated.countryCode || '',
        photoURL: updated.photoURL
      })
      setSavedProfile(saved)
      setInfo('Perfil actualizado correctamente.')
    } catch (err) {
      console.error(err)
      setError(err?.message || 'No se pudo actualizar el perfil.')
    } finally {
      setSaving(false)
    }
  }

  const handleResetPassword = async () => {
    setError('')
    setInfo('')
    if (!user?.email) {
      setError('No encontramos un correo asociado a tu cuenta.')
      return
    }

    setSaving(true)
    try {
      await resetPassword(user.email)
      setInfo('Te enviamos un enlace para crear o restablecer tu contraseña.')
    } catch (err) {
      console.error(err)
      setError(err?.message || 'No se pudo enviar el correo de recuperación.')
    } finally {
      setSaving(false)
    }
  }

  if (!user) return null

  return (
    <div className="profile-page">
      <div className="profile-head">
        <button className="ghost-back" type="button" onClick={() => navigate(-1)}>←</button>
        <div>
          <h2>👤 Mi perfil</h2>
          <p>Actualiza tu nombre y foto para que otros coleccionistas te identifiquen en los matches.</p>
        </div>
      </div>

      <div className="card profile-summary-card">
        <div className="profile-avatar-lg">
          <SafeProfileImage src={photoURL} alt="Foto de perfil" fallback={(currentProfile.name || 'U').slice(0, 1).toUpperCase()} />
        </div>
        <div>
          <h3>{currentProfile.name || user.name} {currentProfile.surname || user.surname}</h3>
          <p>{user.email}</p>
          <p className="profile-country-line">📍 {getCountryName(currentProfile.countryCode) || 'País pendiente'}</p>
          <span className="profile-provider-pill">{getProviderLabel(user.provider)}</span>
        </div>
      </div>

      <form className="card profile-form" onSubmit={handleSubmit}>
        <div className="profile-photo-editor">
          <div className="profile-photo-preview">
            <SafeProfileImage src={photoURL} alt="Vista previa de perfil" fallback={(currentProfile.name || 'U').slice(0, 1).toUpperCase()} />
          </div>
          <div className="profile-photo-actions">
            <strong>Foto de perfil</strong>
            <small>{photoLabel}. Se verá en tus matches e invitaciones de intercambio.</small>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handlePhotoChange}
              className="hidden-file-input"
            />
            <div className="profile-photo-buttons">
              <button type="button" className="btn-secondary btn-mini" onClick={handleChoosePhoto}>
                📷 Cargar foto
              </button>
              {googlePhotoURL && photoURL !== googlePhotoURL && (
                <button type="button" className="btn-neutral-small" onClick={handleUseGooglePhoto}>
                  Usar foto de Google
                </button>
              )}
              {photoURL && (
                <button type="button" className="btn-danger-soft" onClick={handleRemovePhoto}>
                  Quitar foto
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="form-group">
          <label>Nombre</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Tu nombre"
            autoComplete="given-name"
          />
        </div>

        <div className="form-group">
          <label>Apellido</label>
          <input
            type="text"
            value={surname}
            onChange={(e) => setSurname(e.target.value)}
            placeholder="Tu apellido"
            autoComplete="family-name"
          />
        </div>

        <div className="form-group">
          <label>País</label>
          <select value={countryCode} onChange={(e) => setCountryCode(e.target.value)}>
            <option value="">Selecciona tu país</option>
            {COUNTRIES.map(country => (
              <option key={country.code} value={country.code}>{country.name}</option>
            ))}
          </select>
          <small className="field-hint">El país se usa para mostrarte matches de intercambio relevantes.</small>
        </div>

        {hasChanges ? (
          <p className="profile-dirty-note">Tienes cambios pendientes por guardar.</p>
        ) : (
          <p className="profile-clean-note">Tu perfil está actualizado.</p>
        )}

        {info && <p className="form-info">{info}</p>}
        {error && <p className="form-error">{error}</p>}

        <button className="btn-primary" type="submit" disabled={saving || !hasChanges}>
          {saving ? 'Guardando...' : 'Guardar cambios'}
        </button>
      </form>

      <div className="card profile-security-card">
        <h3>🔐 Acceso y seguridad</h3>
        <p>
          Si tu cuenta fue creada con Google, puedes seguir ingresando con Google. Si quieres habilitar o recuperar una contraseña, usa este botón.
        </p>
        <button className="btn-secondary" type="button" onClick={handleResetPassword} disabled={saving}>
          Enviar enlace para restablecer contraseña
        </button>
      </div>
    </div>
  )
}
