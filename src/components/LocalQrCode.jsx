import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

export function createLocalQrDataUrl(
  value,
  size = 430,
  {
    errorCorrectionLevel = 'H',
    margin = 4
  } = {}
) {
  return QRCode.toDataURL(value, {
    errorCorrectionLevel,
    margin,
    width: size,
    type: 'image/png',
    color: {
      dark: '#000000',
      light: '#ffffff'
    }
  })
}

export default function LocalQrCode({
  value,
  size = 430,
  className = '',
  alt = 'Código QR',
  errorCorrectionLevel = 'H',
  margin = 4,
  onReady,
  onError
}) {
  const [source, setSource] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setSource('')
    setError('')

    if (!value) return () => { cancelled = true }

    createLocalQrDataUrl(value, size, {
      errorCorrectionLevel,
      margin
    })
      .then(dataUrl => {
        if (cancelled) return
        setSource(dataUrl)
        onReady?.(dataUrl)
      })
      .catch(qrError => {
        if (cancelled) return
        console.error('No se pudo generar el QR local:', qrError)
        setError('No se pudo generar el código QR.')
        onError?.(qrError)
      })

    return () => {
      cancelled = true
    }
  }, [
    errorCorrectionLevel,
    margin,
    onError,
    onReady,
    size,
    value
  ])

  if (error) {
    return <div className="local-qr-error" role="alert">{error}</div>
  }

  if (!source) {
    return <div className="local-qr-loading" role="status">Generando QR…</div>
  }

  return <img className={className} src={source} alt={alt} />
}