import { useEffect, useState } from 'react'

export default function SafeProfileImage({
  src,
  alt = 'Foto de perfil',
  fallback = 'U'
}) {
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setFailed(false)
  }, [src])

  if (!src || failed) {
    return <span aria-label={alt}>{fallback || 'U'}</span>
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  )
}