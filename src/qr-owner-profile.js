import { onAuthStateChanged } from 'firebase/auth'
import { onValue } from 'firebase/database'
import { auth, db, ref } from './firebase'

let activeProfile = null
let stopProfile = null
let frame = 0

function initials(profile = {}) {
  const name = `${profile.name || ''} ${profile.surname || ''}`.trim()
  if (name) {
    return name
      .split(/\s+/)
      .slice(0, 2)
      .map(part => part.charAt(0))
      .join('')
      .toUpperCase()
  }
  return String(profile.email || 'U').charAt(0).toUpperCase()
}

function renderOwnerProfile() {
  const name = document.querySelector('.qr-own-card .qr-user-name')
  if (!name) return

  let wrapper = name.closest('.qr-owner-profile')
  if (!wrapper) {
    wrapper = document.createElement('div')
    wrapper.className = 'qr-owner-profile'
    name.parentNode?.insertBefore(wrapper, name)
    wrapper.appendChild(name)
  }

  let avatar = wrapper.querySelector('.qr-owner-profile-avatar')
  if (!avatar) {
    avatar = document.createElement('div')
    avatar.className = 'qr-owner-profile-avatar'
    wrapper.insertBefore(avatar, name)
  }

  const photoURL = String(activeProfile?.photoURL || auth.currentUser?.photoURL || '').trim()
  const fallback = initials(activeProfile || auth.currentUser || {})
  const signature = `${photoURL}|${fallback}`
  if (avatar.dataset.signature === signature) return

  avatar.dataset.signature = signature
  avatar.replaceChildren()

  if (photoURL) {
    const image = document.createElement('img')
    image.src = photoURL
    image.alt = `Foto de perfil de ${name.textContent?.trim() || 'coleccionista'}`
    image.loading = 'lazy'
    image.referrerPolicy = 'no-referrer'
    avatar.appendChild(image)
  } else {
    const text = document.createElement('span')
    text.textContent = fallback
    avatar.appendChild(text)
  }
}

function scheduleRender() {
  if (frame) return
  frame = window.requestAnimationFrame(() => {
    frame = 0
    renderOwnerProfile()
  })
}

function start() {
  const observer = new MutationObserver(scheduleRender)
  observer.observe(document.body, { childList: true, subtree: true })

  onAuthStateChanged(auth, user => {
    if (stopProfile) {
      stopProfile()
      stopProfile = null
    }

    activeProfile = user
      ? { name: user.displayName || '', email: user.email || '', photoURL: user.photoURL || '' }
      : null

    if (user?.uid) {
      stopProfile = onValue(ref(db, `users/${user.uid}/profile`), snapshot => {
        activeProfile = { ...(activeProfile || {}), ...(snapshot.val() || {}) }
        scheduleRender()
      })
    }

    scheduleRender()
  })

  window.addEventListener('popstate', scheduleRender)
  scheduleRender()
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true })
} else {
  start()
}
