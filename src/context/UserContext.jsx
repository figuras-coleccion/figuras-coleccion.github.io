import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import {
  auth,
  db,
  googleProvider,
  ref,
  set,
  get,
  update,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
  updateProfile,
  reload,
  getIdToken,
  signInWithPopup,
  getAdditionalUserInfo,
  deleteUser
} from '../firebase'
import { detectCountryCode, getCountryName } from '../data/countries'

const UserContext = createContext()

const ADMIN_EMAILS = (import.meta.env.VITE_ADMIN_EMAILS || 'elipark@gmail.com,neudud@gmail.com')
  .split(',')
  .map(item => item.trim().toLowerCase())
  .filter(Boolean)

function isAdminEmail(email) {
  return ADMIN_EMAILS.includes(normalizeEmail(email))
}

function getAppUrl() {
  const base = import.meta.env.BASE_URL || '/'
  return `${window.location.origin}${base}`
}

function cleanText(value) {
  return String(value || '').trim()
}

function normalizeEmail(email) {
  return cleanText(email).toLowerCase()
}

function splitDisplayName(displayName = '') {
  const parts = cleanText(displayName).split(' ').filter(Boolean)
  const name = parts.shift() || ''
  const surname = parts.join(' ')
  return { name, surname }
}

function isProfileComplete(userData) {
  return Boolean(
    cleanText(userData?.name) &&
    cleanText(userData?.surname)
  )
}

function buildUserData(firebaseUser, profile = {}) {
  const fallback = splitDisplayName(firebaseUser?.displayName)
  const googleProfile = firebaseUser?.providerData?.find(item => item.providerId === 'google.com')
  const googlePhotoURL = googleProfile?.photoURL || firebaseUser?.photoURL || ''

  return {
    id: firebaseUser.uid,
    name: cleanText(profile.name) || fallback.name || 'Usuario',
    surname: cleanText(profile.surname) || fallback.surname,
    email: normalizeEmail(profile.email || firebaseUser.email),
    countryCode: cleanText(profile.countryCode || profile.country || ''),
    countryName: getCountryName(profile.countryCode || profile.country || ''),
    photoURL: profile.photoURL || googlePhotoURL || '',
    googlePhotoURL,
    photoSource: profile.photoSource || (profile.photoURL ? 'profile' : (googlePhotoURL ? 'google' : 'none')),
    provider: profile.provider || firebaseUser.providerData?.[0]?.providerId || 'password',
    emailVerified: Boolean(firebaseUser.emailVerified),
    createdAt: profile.createdAt || Date.now(),
    verifiedAt: profile.verifiedAt || (firebaseUser.emailVerified ? Date.now() : null),
    showHowItWorksOnFirstLogin: profile.showHowItWorksOnFirstLogin === true,
    howItWorksSeenAt: profile.howItWorksSeenAt || null,
    isAdmin: isAdminEmail(profile.email || firebaseUser.email)
  }
}

async function readProfile(firebaseUser) {
  const snapshot = await get(ref(db, `users/${firebaseUser.uid}/profile`))
  return snapshot.exists() ? snapshot.val() : {}
}

async function loadProfile(firebaseUser) {
  const profile = await readProfile(firebaseUser)
  const userData = buildUserData(firebaseUser, profile)

  await update(ref(db, `users/${firebaseUser.uid}/profile`), {
    ...userData,
    emailVerified: firebaseUser.emailVerified,
    lastLoginAt: Date.now()
  })

  localStorage.setItem('panini_user', JSON.stringify(userData))
  return userData
}

export function UserProvider({ children }) {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)
  const [firebaseUser, setFirebaseUser] = useState(null)
  const [pendingVerification, setPendingVerification] = useState(null)
  const [pendingProfile, setPendingProfile] = useState(null)

  const activateUserIfReady = useCallback(async (freshUser) => {
    await getIdToken(freshUser, true)
    const userData = await loadProfile(freshUser)

    if (!isProfileComplete(userData)) {
      setUser(null)
      setPendingVerification(null)
      setPendingProfile(userData)
      return { needsProfile: true, user: userData }
    }

    setUser(userData)
    setPendingVerification(null)
    setPendingProfile(null)
    return { needsProfile: false, user: userData }
  }, [])

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      setLoading(true)

      try {
        if (!fbUser) {
          setFirebaseUser(null)
          setUser(null)
          setPendingVerification(null)
          setPendingProfile(null)
          localStorage.removeItem('panini_user')
          return
        }

        await reload(fbUser)
        const freshUser = auth.currentUser || fbUser
        setFirebaseUser(freshUser)

        if (!freshUser.emailVerified) {
          setUser(null)
          setPendingProfile(null)
          setPendingVerification({
            uid: freshUser.uid,
            email: freshUser.email,
            sentAt: Date.now()
          })
          localStorage.removeItem('panini_user')
          return
        }

        await activateUserIfReady(freshUser)
      } catch (err) {
        console.error('Error cargando usuario:', err)
        setUser(null)
      } finally {
        setLoading(false)
      }
    })

    return () => unsub()
  }, [activateUserIfReady])

  const registerUser = useCallback(async ({ name, surname, email, password, countryCode }) => {
    const cleanName = cleanText(name)
    const cleanSurname = cleanText(surname)
    const cleanEmail = normalizeEmail(email)
    const cleanCountryCode = cleanText(countryCode || detectCountryCode())

    const credential = await createUserWithEmailAndPassword(auth, cleanEmail, password)
    const fbUser = credential.user

    await updateProfile(fbUser, {
      displayName: `${cleanName} ${cleanSurname}`.trim()
    })

    const userData = {
      id: fbUser.uid,
      name: cleanName,
      surname: cleanSurname,
      email: cleanEmail,
      countryCode: cleanCountryCode,
      countryName: getCountryName(cleanCountryCode),
      photoURL: '',
      googlePhotoURL: '',
      photoSource: 'none',
      provider: 'password',
      emailVerified: false,
      createdAt: Date.now(),
      verifiedAt: null,
      showHowItWorksOnFirstLogin: true
    }

    await set(ref(db, `users/${fbUser.uid}/profile`), userData)

    await sendEmailVerification(fbUser, {
      url: getAppUrl(),
      handleCodeInApp: false
    })

    setPendingVerification({
      uid: fbUser.uid,
      email: cleanEmail,
      sentAt: Date.now()
    })

    return userData
  }, [])

  const loginUser = useCallback(async ({ email, password }) => {
    const credential = await signInWithEmailAndPassword(auth, normalizeEmail(email), password)
    await reload(credential.user)

    const freshUser = auth.currentUser || credential.user

    if (!freshUser.emailVerified) {
      setUser(null)
      setPendingProfile(null)
      setPendingVerification({
        uid: freshUser.uid,
        email: freshUser.email,
        sentAt: Date.now()
      })
      return { needsVerification: true }
    }

    return activateUserIfReady(freshUser)
  }, [activateUserIfReady])

  const loginWithGoogle = useCallback(async ({ intent = 'login' } = {}) => {
    const credential = await signInWithPopup(auth, googleProvider)
    const additionalInfo = getAdditionalUserInfo(credential)

    // En modo Ingresar no queremos crear cuentas silenciosamente.
    // Si el correo de Google no existía todavía en Firebase, se elimina esa cuenta temporal
    // y se muestra un mensaje claro para que el usuario vaya a Registro.
    if (intent === 'login' && additionalInfo?.isNewUser) {
      try {
        await deleteUser(credential.user)
      } catch (deleteError) {
        console.warn('No se pudo eliminar el usuario Google temporal:', deleteError)
        await signOut(auth)
      }

      const error = new Error('Esta cuenta de Google todavía no está registrada. Entra a Registro y crea tu cuenta con Google.')
      error.code = 'auth/google-account-not-registered'
      throw error
    }

    if (intent === 'register' && additionalInfo?.isNewUser) {
      await update(ref(db, `users/${credential.user.uid}/profile`), {
        showHowItWorksOnFirstLogin: true,
        createdAt: Date.now()
      })
    }

    await reload(credential.user)
    const freshUser = auth.currentUser || credential.user
    return activateUserIfReady(freshUser)
  }, [activateUserIfReady])

  const completeProfile = useCallback(async ({ name, surname, countryCode }) => {
    if (!auth.currentUser) {
      throw new Error('No hay una sesión activa para completar el perfil.')
    }

    const cleanName = cleanText(name)
    const cleanSurname = cleanText(surname)
    const cleanCountryCode = cleanText(countryCode || detectCountryCode())
    await updateProfile(auth.currentUser, {
      displayName: `${cleanName} ${cleanSurname}`.trim()
    })

    await update(ref(db, `users/${auth.currentUser.uid}/profile`), {
      name: cleanName,
      surname: cleanSurname,
      countryCode: cleanCountryCode,
      countryName: getCountryName(cleanCountryCode),
      email: normalizeEmail(auth.currentUser.email),
      photoURL: auth.currentUser.providerData?.find(item => item.providerId === 'google.com')?.photoURL || auth.currentUser.photoURL || '',
      googlePhotoURL: auth.currentUser.providerData?.find(item => item.providerId === 'google.com')?.photoURL || auth.currentUser.photoURL || '',
      photoSource: (auth.currentUser.providerData?.find(item => item.providerId === 'google.com')?.photoURL || auth.currentUser.photoURL) ? 'google' : 'none',
      provider: auth.currentUser.providerData?.[0]?.providerId || 'google.com',
      emailVerified: auth.currentUser.emailVerified,
      profileCompletedAt: Date.now(),
      lastLoginAt: Date.now()
    })

    const userData = await loadProfile(auth.currentUser)
    setUser(userData)
    setPendingProfile(null)
    setPendingVerification(null)
    return userData
  }, [])


  const updateUserProfile = useCallback(async ({ name, surname, countryCode, photoURL = '', photoSource = 'profile' }) => {
    if (!auth.currentUser) {
      throw new Error('No hay una sesión activa para actualizar el perfil.')
    }

    const cleanName = cleanText(name)
    const cleanSurname = cleanText(surname)
    const cleanCountryCode = cleanText(countryCode || '')
    const cleanPhotoURL = cleanText(photoURL)
    const googlePhotoURL = auth.currentUser.providerData?.find(item => item.providerId === 'google.com')?.photoURL || auth.currentUser.photoURL || ''
    const resolvedPhotoSource = cleanPhotoURL
      ? (cleanPhotoURL === googlePhotoURL ? 'google' : photoSource || 'upload')
      : 'none'

    // Guardamos la foto pública del perfil en Realtime Database.
    // No actualizamos auth.photoURL con imágenes subidas en base64 para evitar límites o rechazos del perfil Auth.
    await updateProfile(auth.currentUser, {
      displayName: `${cleanName} ${cleanSurname}`.trim()
    })

    await update(ref(db, `users/${auth.currentUser.uid}/profile`), {
      name: cleanName,
      surname: cleanSurname,
      countryCode: cleanCountryCode,
      countryName: getCountryName(cleanCountryCode),
      photoURL: cleanPhotoURL,
      googlePhotoURL,
      photoSource: resolvedPhotoSource,
      email: normalizeEmail(auth.currentUser.email),
      provider: auth.currentUser.providerData?.[0]?.providerId || 'password',
      emailVerified: auth.currentUser.emailVerified,
      updatedAt: Date.now(),
      lastLoginAt: Date.now()
    })

    const userData = await loadProfile(auth.currentUser)
    setUser(userData)
    setPendingProfile(null)
    setPendingVerification(null)
    return userData
  }, [])

  const resendVerificationEmail = useCallback(async () => {
    if (!auth.currentUser) {
      throw new Error('No hay una sesión activa para reenviar el correo.')
    }

    await sendEmailVerification(auth.currentUser, {
      url: getAppUrl(),
      handleCodeInApp: false
    })

    setPendingVerification(prev => ({
      ...(prev || {}),
      uid: auth.currentUser.uid,
      email: auth.currentUser.email,
      sentAt: Date.now()
    }))
  }, [])

  const refreshEmailVerification = useCallback(async () => {
    if (!auth.currentUser) {
      return false
    }

    await reload(auth.currentUser)
    const freshUser = auth.currentUser

    if (!freshUser.emailVerified) {
      setPendingVerification(prev => ({
        ...(prev || {}),
        uid: freshUser.uid,
        email: freshUser.email,
        checkedAt: Date.now()
      }))
      return false
    }

    await getIdToken(freshUser, true)

    await update(ref(db, `users/${freshUser.uid}/profile`), {
      emailVerified: true,
      verifiedAt: Date.now()
    })

    await activateUserIfReady(freshUser)
    return true
  }, [activateUserIfReady])

  const resetPassword = useCallback(async (email) => {
    await sendPasswordResetEmail(auth, normalizeEmail(email), {
      url: getAppUrl(),
      handleCodeInApp: false
    })
  }, [])

  const markHowItWorksAsSeen = useCallback(async () => {
    if (!auth.currentUser) return

    const seenAt = Date.now()

    setUser(currentUser => {
      if (!currentUser) return currentUser
      const nextUser = {
        ...currentUser,
        showHowItWorksOnFirstLogin: false,
        howItWorksSeenAt: seenAt
      }
      localStorage.setItem('panini_user', JSON.stringify(nextUser))
      return nextUser
    })

    await update(ref(db, `users/${auth.currentUser.uid}/profile`), {
      showHowItWorksOnFirstLogin: false,
      howItWorksSeenAt: seenAt
    })
  }, [])

  const logout = useCallback(async () => {
    localStorage.removeItem('panini_user')
    setUser(null)
    setPendingVerification(null)
    setPendingProfile(null)
    await signOut(auth)
  }, [])

  return (
    <UserContext.Provider value={{
      user,
      loading,
      firebaseUser,
      pendingVerification,
      pendingProfile,
      registerUser,
      loginUser,
      loginWithGoogle,
      completeProfile,
      updateUserProfile,
      markHowItWorksAsSeen,
      logout,
      resendVerificationEmail,
      refreshEmailVerification,
      resetPassword,
      isAdmin: Boolean(user?.isAdmin)
    }}>
      {children}
    </UserContext.Provider>
  )
}

export const useUser = () => useContext(UserContext)
