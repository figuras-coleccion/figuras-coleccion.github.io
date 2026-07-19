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
  getAdditionalUserInfo
} from '../firebase'
import { detectCountryCode, getCountryName } from '../data/countries'

const UserContext = createContext()

const ONBOARDING_VERSION = 1
const ONBOARDING_RECOVERY_STARTED_AT = 1784438026000
const FIRST_RUN_STORAGE_PREFIX = 'panini_how_it_works_pending_'

function firstRunStorageKey(uid) {
  return `${FIRST_RUN_STORAGE_PREFIX}${uid}`
}

function hasLocalFirstRunPending(uid) {
  if (!uid) return false
  try {
    return localStorage.getItem(firstRunStorageKey(uid)) === '1'
  } catch {
    return false
  }
}

function markLocalFirstRunPending(uid) {
  if (!uid) return
  try {
    localStorage.setItem(firstRunStorageKey(uid), '1')
  } catch {
    // Firebase remains the source of truth if local storage is unavailable.
  }
}

function clearLocalFirstRunPending(uid) {
  if (!uid) return
  try {
    localStorage.removeItem(firstRunStorageKey(uid))
  } catch {
    // Nothing else is required.
  }
}

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
  const storedCreatedAt = Number(profile.createdAt || profile.onboardingInitializedAt) || 0
  const createdAt = storedCreatedAt || Date.now()
  const howItWorksSeenAt = Number(profile.howItWorksSeenAt) || null
  const onboardingVersion = Math.max(0, Number(profile.onboardingVersion) || 0)
  const onboardingSeenVersion = Math.max(
    0,
    Number(profile.onboardingSeenVersion) || (howItWorksSeenAt ? ONBOARDING_VERSION : 0)
  )
  const pendingFromFirebase = profile.showHowItWorksOnFirstLogin === true
  const pendingFromThisBrowser = hasLocalFirstRunPending(firebaseUser?.uid)
  const pendingFromVersion = onboardingVersion >= ONBOARDING_VERSION &&
    onboardingSeenVersion < onboardingVersion
  const recentAccountMissingOnboarding = storedCreatedAt >= ONBOARDING_RECOVERY_STARTED_AT &&
    !howItWorksSeenAt &&
    onboardingSeenVersion < ONBOARDING_VERSION

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
    createdAt,
    verifiedAt: profile.verifiedAt || (firebaseUser.emailVerified ? Date.now() : null),
    onboardingVersion,
    onboardingSeenVersion,
    showHowItWorksOnFirstLogin:
      pendingFromFirebase ||
      pendingFromThisBrowser ||
      pendingFromVersion ||
      recentAccountMissingOnboarding,
    howItWorksSeenAt,
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
  const shouldInitializeOnboarding = userData.showHowItWorksOnFirstLogin === true &&
    userData.onboardingSeenVersion < ONBOARDING_VERSION

  await update(ref(db, `users/${firebaseUser.uid}/profile`), {
    ...userData,
    ...(shouldInitializeOnboarding
      ? {
          onboardingVersion: ONBOARDING_VERSION,
          onboardingSeenVersion: userData.onboardingSeenVersion,
          showHowItWorksOnFirstLogin: true
        }
      : {}),
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
      onboardingVersion: ONBOARDING_VERSION,
      onboardingSeenVersion: 0,
      showHowItWorksOnFirstLogin: true,
      howItWorksSeenAt: null
    }

    await set(ref(db, `users/${fbUser.uid}/profile`), userData)
    markLocalFirstRunPending(fbUser.uid)

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

  const loginWithGoogle = useCallback(async () => {
    const credential = await signInWithPopup(auth, googleProvider)
    const additionalInfo = getAdditionalUserInfo(credential)
    const profileSnapshot = await get(ref(db, `users/${credential.user.uid}/profile`))
    const existingProfile = profileSnapshot.exists() ? profileSnapshot.val() : {}
    const isNewPaniniAccount = additionalInfo?.isNewUser === true || !profileSnapshot.exists()

    if (isNewPaniniAccount) {
      const now = Date.now()
      markLocalFirstRunPending(credential.user.uid)
      await update(ref(db, `users/${credential.user.uid}/profile`), {
        onboardingVersion: ONBOARDING_VERSION,
        onboardingSeenVersion: 0,
        showHowItWorksOnFirstLogin: true,
        howItWorksSeenAt: null,
        createdAt: Number(existingProfile.createdAt) || now,
        onboardingInitializedAt: now
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

    const existingProfile = await readProfile(auth.currentUser)
    const keepFirstRunPending = (
      hasLocalFirstRunPending(auth.currentUser.uid) ||
      existingProfile.showHowItWorksOnFirstLogin === true ||
      (
        Number(existingProfile.onboardingVersion) >= ONBOARDING_VERSION &&
        Number(existingProfile.onboardingSeenVersion || 0) < ONBOARDING_VERSION
      )
    )

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
      lastLoginAt: Date.now(),
      ...(keepFirstRunPending
        ? {
            onboardingVersion: ONBOARDING_VERSION,
            onboardingSeenVersion: 0,
            showHowItWorksOnFirstLogin: true,
            howItWorksSeenAt: null
          }
        : {})
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

    const uid = auth.currentUser.uid
    const seenAt = Date.now()

    await update(ref(db, `users/${uid}/profile`), {
      onboardingVersion: ONBOARDING_VERSION,
      onboardingSeenVersion: ONBOARDING_VERSION,
      showHowItWorksOnFirstLogin: false,
      howItWorksSeenAt: seenAt
    })

    clearLocalFirstRunPending(uid)

    setUser(currentUser => {
      if (!currentUser) return currentUser
      const nextUser = {
        ...currentUser,
        onboardingVersion: ONBOARDING_VERSION,
        onboardingSeenVersion: ONBOARDING_VERSION,
        showHowItWorksOnFirstLogin: false,
        howItWorksSeenAt: seenAt
      }
      localStorage.setItem('panini_user', JSON.stringify(nextUser))
      return nextUser
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
