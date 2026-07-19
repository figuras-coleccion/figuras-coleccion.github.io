import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useUser } from '../context/UserContext'
import { useStickers } from '../context/StickersContext'
import { useEditLock } from '../context/EditLockContext'
import { useAlbum } from '../context/AlbumContext'
import { db, ref, get } from '../firebase'
import { buildAlbumGroups, getStickerDisplayNumber, isIrregularStickerCode } from '../data/albumGroups'
import { getAlbumStickersFromUser, isProfileUsingAlbum } from '../albums/runtime'

const QR_SCANNER_SCRIPT = 'https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js'
let qrScannerLibraryPromise = null

function ensureQrScannerLibrary() {
  if (window.Html5Qrcode) return Promise.resolve(window.Html5Qrcode)
  if (qrScannerLibraryPromise) return qrScannerLibraryPromise

  qrScannerLibraryPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${QR_SCANNER_SCRIPT}"]`)
    if (existing) {
      if (window.Html5Qrcode) {
        resolve(window.Html5Qrcode)
        return
      }
      existing.addEventListener('load', () => resolve(window.Html5Qrcode), { once: true })
      existing.addEventListener('error', () => reject(new Error('No se pudo cargar el lector QR.')), { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = QR_SCANNER_SCRIPT
    script.async = true
    script.crossOrigin = 'anonymous'
    script.onload = () => resolve(window.Html5Qrcode)
    script.onerror = () => reject(new Error('No se pudo cargar el lector QR.'))
    document.head.appendChild(script)
  })

  return qrScannerLibraryPromise
}

function parseQrUserId(rawValue) {
  const raw = String(rawValue || '').trim()
  if (!raw) return ''

  try {
    const parsedUrl = new URL(raw)
    return String(parsedUrl.searchParams.get('qrUser') || '').trim()
  } catch {
    // También aceptamos el formato corto interno por compatibilidad.
  }

  if (raw.startsWith('PANINI2026:')) {
    return raw.slice('PANINI2026:'.length).trim()
  }

  return /^[a-zA-Z0-9_-]{10,}$/.test(raw) ? raw : ''
}

function waitForElement(id, timeoutMs = 3500) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now()
    const check = () => {
      const element = document.getElementById(id)
      if (element) {
        resolve(element)
        return
      }
      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error('No se pudo preparar el visor de la cámara.'))
        return
      }
      window.setTimeout(check, 40)
    }
    check()
  })
}

function getCameraErrorMessage(error) {
  const name = String(error?.name || '')
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
    return 'El navegador no tiene permiso para usar la cámara. Activa el permiso de cámara o sube una foto del QR.'
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'No se encontró una cámara disponible. Puedes subir una foto del QR.'
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'La cámara está siendo usada por otra aplicación. Ciérrala o sube una foto del QR.'
  }
  if (!window.isSecureContext) {
    return 'La cámara solo puede abrirse desde una conexión segura. Puedes subir una foto del QR.'
  }
  return error?.message || 'No se pudo abrir la cámara. También puedes subir una foto del QR.'
}

function toggleSet(previous, code) {
  const next = new Set(previous)
  if (next.has(code)) next.delete(code)
  else next.add(code)
  return next
}

function getInitials(profile = {}) {
  const name = `${profile.name || ''} ${profile.surname || ''}`.trim() || 'U'
  return name.slice(0, 1).toUpperCase()
}

function TradeToken({ code, selected, duplicates, onToggle, mode, editingLocked }) {
  const irregular = isIrregularStickerCode(code)

  return (
    <button
      type="button"
      className={`trade-sticker-item ${irregular ? 'irregular' : 'circular'} ${selected ? 'selected' : ''} ${editingLocked ? 'editing-locked' : ''}`}
      onClick={() => {
        if (!editingLocked) onToggle(code)
      }}
      aria-pressed={selected}
      aria-disabled={editingLocked}
      title={editingLocked ? 'Edición bloqueada' : `${selected ? 'Quitar' : 'Seleccionar'} ${code}`}
    >
      <span className="trade-sticker-wrap">
        <span className="trade-sticker-shape">
          <span>{getStickerDisplayNumber(code)}</span>
        </span>
        {mode === 'deliver' && duplicates > 0 && <i className="trade-available-badge">{duplicates}</i>}
        {selected && <i className="trade-selected-badge">✓</i>}
      </span>
      <small>{code}</small>
    </button>
  )
}

function FlatTradePicker({ codes, stickers, selectedCodes, onToggle, mode, editingLocked }) {
  if (codes.length === 0) {
    return (
      <div className="manual-trade-empty">
        {mode === 'receive' ? 'No tienes figuritas faltantes.' : 'No tienes repetidas disponibles.'}
      </div>
    )
  }

  return (
    <div className="manual-trade-grid manual-trade-flat-grid">
      {codes.map(code => (
        <TradeToken
          key={code}
          code={code}
          selected={selectedCodes.has(code)}
          duplicates={Number(stickers[code]?.duplicates || 0)}
          onToggle={onToggle}
          mode={mode}
          editingLocked={editingLocked}
        />
      ))}
    </div>
  )
}

function QrMatchToken({ code, available }) {
  const irregular = isIrregularStickerCode(code)

  return (
    <div className={`qr-match-token ${irregular ? 'irregular' : 'circular'}`}>
      <span className="qr-match-token-wrap">
        <span className="qr-match-token-shape">
          <span>{getStickerDisplayNumber(code)}</span>
        </span>
        {available > 0 && <i className="qr-match-count">{available}</i>}
      </span>
      <small>{code}</small>
    </div>
  )
}

function QrMatchGrid({ codes, getAvailable, emptyMessage }) {
  if (codes.length === 0) {
    return <div className="qr-match-empty">{emptyMessage}</div>
  }

  return (
    <div className="qr-match-grid">
      {codes.map(code => (
        <QrMatchToken key={code} code={code} available={getAvailable(code)} />
      ))}
    </div>
  )
}

function QrTradePanel({ user, stickers, orderedCodes, initialPartnerId, onPartnerIdChange, activeAlbumId, activeAlbumTitle }) {
  const scannerRef = useRef(null)
  const fileScannerRef = useRef(null)
  const fileInputRef = useRef(null)
  const scanLockedRef = useRef(false)
  const startingCameraRef = useRef(false)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scannerStatus, setScannerStatus] = useState('')
  const [scannerError, setScannerError] = useState('')
  const [loadingMatch, setLoadingMatch] = useState(false)
  const [readingFile, setReadingFile] = useState(false)
  const [qrError, setQrError] = useState('')
  const [match, setMatch] = useState(null)
  const [loadedPartnerId, setLoadedPartnerId] = useState('')

  const myName = `${user?.name || ''} ${user?.surname || ''}`.trim() || 'Mi cuenta'
  const qrPayload = useMemo(() => {
    const basePath = import.meta.env.BASE_URL || '/'
    return `${window.location.origin}${basePath}trade?qrUser=${encodeURIComponent(user.id)}&album=${encodeURIComponent(activeAlbumId)}`
  }, [activeAlbumId, user.id])
  const qrImageUrl = useMemo(
    () => `https://api.qrserver.com/v1/create-qr-code/?size=360x360&margin=14&data=${encodeURIComponent(qrPayload)}`,
    [qrPayload]
  )

  const loadPartnerMatch = useCallback(async (partnerId, { updateUrl = false } = {}) => {
    const cleanPartnerId = String(partnerId || '').trim()
    if (!cleanPartnerId) {
      setQrError('El QR no corresponde a una cuenta Panini válida.')
      return
    }
    if (cleanPartnerId === user.id) {
      setQrError('Ese es tu propio QR. Escanea el QR de la otra persona.')
      return
    }

    setLoadingMatch(true)
    setQrError('')
    setMatch(null)

    try {
      const snapshot = await get(ref(db, `users/${cleanPartnerId}`))
      if (!snapshot.exists()) throw new Error('La cuenta vinculada ya no existe.')

      const partnerData = snapshot.val() || {}
      const partnerProfile = partnerData.profile || {}
      if (!isProfileUsingAlbum(partnerProfile, activeAlbumId)) {
        throw new Error(`La otra persona no tiene cargado ${activeAlbumTitle}. Ambos deben usar el mismo álbum.`)
      }
      const partnerStickers = getAlbumStickersFromUser(partnerData, activeAlbumId)

      if (partnerProfile.emailVerified === false) {
        throw new Error('La cuenta vinculada todavía no está habilitada.')
      }

      const iCanReceive = orderedCodes.filter(
        code => !stickers[code]?.owned && Number(partnerStickers[code]?.duplicates || 0) > 0
      )
      const iCanDeliver = orderedCodes.filter(
        code => Number(stickers[code]?.duplicates || 0) > 0 && !partnerStickers[code]?.owned
      )

      setMatch({
        id: cleanPartnerId,
        profile: partnerProfile,
        stickers: partnerStickers,
        iCanReceive,
        iCanDeliver
      })
      setLoadedPartnerId(cleanPartnerId)
      if (updateUrl) onPartnerIdChange(cleanPartnerId)
    } catch (error) {
      console.error('Error loading QR match:', error)
      setQrError(error.message || 'No se pudo cargar el match de esta cuenta.')
    } finally {
      setLoadingMatch(false)
    }
  }, [activeAlbumId, activeAlbumTitle, onPartnerIdChange, orderedCodes, stickers, user.id])

  useEffect(() => {
    if (!initialPartnerId || initialPartnerId === loadedPartnerId) return
    void loadPartnerMatch(initialPartnerId)
  }, [initialPartnerId, loadPartnerMatch, loadedPartnerId])

  const stopScanner = useCallback(async ({ closeSheet = true } = {}) => {
    const scanner = scannerRef.current
    scannerRef.current = null
    scanLockedRef.current = false
    startingCameraRef.current = false

    if (scanner) {
      try {
        await scanner.stop()
      } catch {
        // Puede ocurrir si la cámara todavía no terminó de iniciar.
      }
      try {
        await scanner.clear()
      } catch {
        // La limpieza visual no debe bloquear el cierre.
      }
    }

    if (closeSheet) setScannerOpen(false)
    setScannerStatus('')
  }, [])

  useEffect(() => {
    return () => {
      void stopScanner()
      const fileScanner = fileScannerRef.current
      fileScannerRef.current = null
      if (fileScanner) fileScanner.clear().catch(() => {})
    }
  }, [stopScanner])

  const acceptDecodedValue = useCallback(async (decodedText) => {
    if (scanLockedRef.current) return
    scanLockedRef.current = true

    const partnerId = parseQrUserId(decodedText)
    await stopScanner({ closeSheet: true })

    if (!partnerId) {
      setQrError('El código leído no pertenece a Panini 2026.')
      return
    }

    await loadPartnerMatch(partnerId, { updateUrl: true })
  }, [loadPartnerMatch, stopScanner])

  const startCameraScanner = useCallback(async () => {
    if (startingCameraRef.current) return
    startingCameraRef.current = true
    setScannerOpen(true)
    setScannerError('')
    setQrError('')
    setScannerStatus('Solicitando permiso para la cámara…')

    let permissionStream = null

    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
        throw new Error('Este navegador no permite abrir la cámara desde esta página.')
      }

      permissionStream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 1280 }
        },
        audio: false
      })

      const activeTrack = permissionStream.getVideoTracks()[0]
      const activeDeviceId = activeTrack?.getSettings?.().deviceId || ''
      permissionStream.getTracks().forEach(track => track.stop())
      permissionStream = null

      setScannerStatus('Preparando visor…')
      const Html5Qrcode = await ensureQrScannerLibrary()
      if (!Html5Qrcode) throw new Error('No se pudo iniciar el lector QR.')

      await waitForElement('panini-live-qr-reader')
      const cameras = await Html5Qrcode.getCameras().catch(() => [])
      const rearCamera = cameras.find(camera => /back|rear|environment|trasera/i.test(camera.label || ''))
      const cameraId = activeDeviceId || rearCamera?.id || cameras[cameras.length - 1]?.id

      const scanner = new Html5Qrcode('panini-live-qr-reader', false)
      scannerRef.current = scanner
      const boxSize = Math.max(190, Math.min(270, window.innerWidth - 82))

      await scanner.start(
        cameraId || { facingMode: { ideal: 'environment' } },
        {
          fps: 12,
          qrbox: { width: boxSize, height: boxSize },
          aspectRatio: 1,
          disableFlip: false
        },
        decodedText => {
          void acceptDecodedValue(decodedText)
        },
        () => {
          // Los intentos sin lectura son normales mientras el visor está abierto.
        }
      )

      setScannerStatus('Apunta la cámara al QR de la otra persona.')
    } catch (error) {
      console.error('Error starting QR scanner:', error)
      if (permissionStream) permissionStream.getTracks().forEach(track => track.stop())
      const scanner = scannerRef.current
      scannerRef.current = null
      if (scanner) {
        try {
          await scanner.clear()
        } catch {
          // Sin acción adicional.
        }
      }
      setScannerStatus('')
      setScannerError(getCameraErrorMessage(error))
    } finally {
      startingCameraRef.current = false
    }
  }, [acceptDecodedValue])

  const openFilePicker = useCallback(() => {
    setQrError('')
    setScannerError('')
    fileInputRef.current?.click()
  }, [])

  const handleQrImage = useCallback(async event => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setReadingFile(true)
    setQrError('')
    setScannerError('')
    setScannerStatus('Leyendo la imagen del QR…')

    try {
      await stopScanner({ closeSheet: true })
      const Html5Qrcode = await ensureQrScannerLibrary()
      if (!Html5Qrcode) throw new Error('No se pudo iniciar el lector de imágenes QR.')

      await waitForElement('panini-file-qr-reader')
      const fileScanner = new Html5Qrcode('panini-file-qr-reader', false)
      fileScannerRef.current = fileScanner
      const decodedText = await fileScanner.scanFile(file, false)
      await fileScanner.clear().catch(() => {})
      fileScannerRef.current = null

      const partnerId = parseQrUserId(decodedText)
      if (!partnerId) throw new Error('La imagen no contiene un QR válido de Panini 2026.')
      await loadPartnerMatch(partnerId, { updateUrl: true })
    } catch (error) {
      console.error('Error reading QR image:', error)
      const fileScanner = fileScannerRef.current
      fileScannerRef.current = null
      if (fileScanner) await fileScanner.clear().catch(() => {})
      setQrError(error.message || 'No se pudo leer el QR de esa imagen.')
    } finally {
      setReadingFile(false)
      setScannerStatus('')
    }
  }, [loadPartnerMatch, stopScanner])

  const partnerName = match
    ? `${match.profile.name || ''} ${match.profile.surname || ''}`.trim() || 'Coleccionista'
    : ''

  return (
    <div className="qr-trade-page">
      <input
        ref={fileInputRef}
        className="qr-file-input"
        type="file"
        accept="image/*"
        onChange={event => void handleQrImage(event)}
        aria-label="Subir foto del código QR"
      />
      <div id="panini-file-qr-reader" className="qr-file-reader" aria-hidden="true" />

      <section className="qr-own-card">
        <div className="qr-own-head">
          <div>
            <h3>Mi QR de intercambio</h3>
            <p>La otra persona verá tu álbum y tus repetidas actualizadas.</p>
          </div>
          <span className="qr-live-pill">● Activo</span>
        </div>

        <div className="qr-image-frame">
          <img src={qrImageUrl} alt="Código QR de mi cuenta Panini" />
        </div>
        <div className="qr-user-name">{myName}</div>

        <div className="qr-scan-actions">
          <button type="button" className="qr-scan-button" onClick={() => void startCameraScanner()}>
            ⛶ Escanear QR
          </button>
          <button type="button" className="qr-upload-button" onClick={openFilePicker} disabled={readingFile}>
            {readingFile ? 'Leyendo imagen…' : '▧ Subir foto del QR'}
          </button>
        </div>
      </section>

      {qrError && <div className="qr-trade-error" role="alert">{qrError}</div>}
      {loadingMatch && <div className="loading">Comparando álbumes…</div>}

      {match && !loadingMatch && (
        <section className="qr-match-card">
          <div className="qr-match-head">
            <div>
              <h3>Match con {partnerName}</h3>
              <p>{match.iCanReceive.length} para recibir · {match.iCanDeliver.length} para entregar</p>
            </div>
            <div className="qr-match-avatar">
              {match.profile.photoURL
                ? <img src={match.profile.photoURL} alt={`Perfil de ${partnerName}`} />
                : <span>{getInitials(match.profile)}</span>}
            </div>
          </div>

          <div className="qr-match-section receive">
            <h4>Puedes recibir de {partnerName}</h4>
            <p>Figuritas que te faltan y esa persona tiene repetidas.</p>
            <QrMatchGrid
              codes={match.iCanReceive}
              getAvailable={code => Number(match.stickers[code]?.duplicates || 0)}
              emptyMessage="No tiene repetidas que actualmente te falten."
            />
          </div>

          <div className="qr-match-section deliver">
            <h4>{partnerName} puede recibir de ti</h4>
            <p>Tus repetidas que esa persona todavía no tiene.</p>
            <QrMatchGrid
              codes={match.iCanDeliver}
              getAvailable={code => Number(stickers[code]?.duplicates || 0)}
              emptyMessage="No tienes repetidas que actualmente le falten."
            />
          </div>

          <button
            type="button"
            className="qr-scan-again"
            onClick={() => {
              setMatch(null)
              setLoadedPartnerId('')
              onPartnerIdChange('')
              void startCameraScanner()
            }}
          >
            Escanear otro QR
          </button>
        </section>
      )}

      {scannerOpen && (
        <div className="qr-scanner-overlay" role="dialog" aria-modal="true" aria-label="Escáner de código QR">
          <div className="qr-scanner-sheet">
            <div className="qr-scanner-head">
              <h3>Escanear QR</h3>
              <button type="button" onClick={() => void stopScanner()} aria-label="Cerrar escáner">×</button>
            </div>
            <div id="panini-live-qr-reader" />
            {scannerStatus && <div className="qr-scanner-status">{scannerStatus}</div>}
            {scannerError && <div className="qr-scanner-error" role="alert">{scannerError}</div>}
            <button type="button" className="qr-upload-button qr-upload-in-scanner" onClick={openFilePicker} disabled={readingFile}>
              {readingFile ? 'Leyendo imagen…' : '▧ Subir foto del QR'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ManualTradePanel({ stickers, orderedCodes, editingLocked, applyManualTrade }) {
  const navigate = useNavigate()
  const [receiveSelection, setReceiveSelection] = useState(() => new Set())
  const [deliverSelection, setDeliverSelection] = useState(() => new Set())
  const [processing, setProcessing] = useState(false)
  const [resultMessage, setResultMessage] = useState('')
  const [successSummary, setSuccessSummary] = useState(null)

  const missingCodes = useMemo(
    () => orderedCodes.filter(code => !stickers[code]?.owned),
    [orderedCodes, stickers]
  )

  const duplicateCodes = useMemo(
    () => orderedCodes.filter(code => stickers[code]?.owned && Number(stickers[code]?.duplicates || 0) > 0),
    [orderedCodes, stickers]
  )

  const receiveCount = receiveSelection.size
  const deliverCount = deliverSelection.size
  const canConfirm = receiveCount > 0 && deliverCount > 0 && !editingLocked

  const confirmTrade = async () => {
    if (editingLocked) {
      setResultMessage('Desbloquea la edición para registrar el trueque.')
      return
    }

    if (!canConfirm || processing || successSummary) return

    setProcessing(true)
    setResultMessage('Actualizando figuritas…')

    try {
      const result = await applyManualTrade({
        receivedCodes: Array.from(receiveSelection),
        deliveredCodes: Array.from(deliverSelection)
      })

      if (!result.success) {
        setResultMessage('No hubo cambios válidos. Revisa las figuritas seleccionadas.')
        return
      }

      setReceiveSelection(new Set())
      setDeliverSelection(new Set())
      setResultMessage('')
      setSuccessSummary({
        received: result.received.length,
        delivered: result.delivered.length
      })

      window.setTimeout(() => {
        navigate('/album?trade=success', { replace: true })
      }, 1700)
    } catch (error) {
      console.error('Error applying manual trade:', error)
      setResultMessage('No se pudo actualizar el álbum. Inténtalo nuevamente.')
    } finally {
      setProcessing(false)
    }
  }

  return (
    <>
      <section className="manual-trade-panel receive manual-trade-flat-panel">
        <div className="manual-trade-title-row manual-trade-flat-title">
          <h3>Me faltan</h3>
          <strong>{receiveCount} seleccionada{receiveCount === 1 ? '' : 's'}</strong>
        </div>
        <FlatTradePicker
          codes={missingCodes}
          stickers={stickers}
          selectedCodes={receiveSelection}
          onToggle={(code) => setReceiveSelection(previous => toggleSet(previous, code))}
          mode="receive"
          editingLocked={editingLocked}
        />
      </section>

      <section className="manual-trade-panel deliver manual-trade-flat-panel">
        <div className="manual-trade-title-row manual-trade-flat-title">
          <h3>Repetidas para entregar</h3>
          <strong>{deliverCount} seleccionada{deliverCount === 1 ? '' : 's'}</strong>
        </div>
        <FlatTradePicker
          codes={duplicateCodes}
          stickers={stickers}
          selectedCodes={deliverSelection}
          onToggle={(code) => setDeliverSelection(previous => toggleSet(previous, code))}
          mode="deliver"
          editingLocked={editingLocked}
        />
      </section>

      {resultMessage && (
        <div className={`manual-trade-result ${processing ? 'manual-trade-processing' : 'manual-trade-error'}`} role="status" aria-live="assertive">
          {resultMessage}
        </div>
      )}

      {successSummary && (
        <div className="trade-success-overlay" role="status" aria-live="assertive">
          <div className="trade-success-card">
            <span className="trade-success-icon">✓</span>
            <h3>Trueque exitoso</h3>
            <p>Figuritas actualizadas</p>
            <small>
              {successSummary.received} recibida{successSummary.received === 1 ? '' : 's'} ·{' '}
              {successSummary.delivered} entregada{successSummary.delivered === 1 ? '' : 's'}
            </small>
          </div>
        </div>
      )}

      <div className="manual-trade-confirm-dock">
        <div>
          <span>Recibes <strong>{receiveCount}</strong></span>
          <span>Entregas <strong>{deliverCount}</strong></span>
        </div>
        <button
          type="button"
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            void confirmTrade()
          }}
          disabled={!canConfirm || processing || Boolean(successSummary)}
          aria-busy={processing}
        >
          {processing ? 'Actualizando…' : successSummary ? 'Actualizado ✓' : 'Confirmar trueque'}
        </button>
      </div>
    </>
  )
}

export default function TradeHub() {
  const { user } = useUser()
  const { stickers, applyManualTrade } = useStickers()
  const { editingLocked } = useEditLock()
  const { activeAlbumId, activeAlbum } = useAlbum()
  const [searchParams, setSearchParams] = useSearchParams()
  const groups = useMemo(() => buildAlbumGroups(), [])
  const orderedCodes = useMemo(() => groups.flatMap(group => group.codes), [groups])
  const qrPartnerId = searchParams.get('qrUser') || ''
  const [activeMode, setActiveMode] = useState(qrPartnerId ? 'qr' : 'manual')

  useEffect(() => {
    if (qrPartnerId) setActiveMode('qr')
  }, [qrPartnerId])

  const changeMode = mode => {
    setActiveMode(mode)
    if (mode === 'manual' && qrPartnerId) {
      const nextParams = new URLSearchParams(searchParams)
      nextParams.delete('qrUser')
      setSearchParams(nextParams, { replace: true })
    }
  }

  const setPartnerIdInUrl = partnerId => {
    const nextParams = new URLSearchParams(searchParams)
    if (partnerId) nextParams.set('qrUser', partnerId)
    else nextParams.delete('qrUser')
    setSearchParams(nextParams, { replace: true })
  }

  return (
    <div className="manual-trade-page manual-trade-flat-page">
      <div className="trade-mode-tabs" role="tablist" aria-label="Tipo de trueque">
        <button
          type="button"
          role="tab"
          aria-selected={activeMode === 'manual'}
          className={activeMode === 'manual' ? 'active' : ''}
          onClick={() => changeMode('manual')}
        >
          Trueque manual
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeMode === 'qr'}
          className={activeMode === 'qr' ? 'active' : ''}
          onClick={() => changeMode('qr')}
        >
          Trueque QR
        </button>
      </div>

      {activeMode === 'manual' ? (
        <ManualTradePanel
          stickers={stickers}
          orderedCodes={orderedCodes}
          editingLocked={editingLocked}
          applyManualTrade={applyManualTrade}
        />
      ) : (
        <QrTradePanel
          user={user}
          stickers={stickers}
          orderedCodes={orderedCodes}
          initialPartnerId={qrPartnerId}
          onPartnerIdChange={setPartnerIdInUrl}
          activeAlbumId={activeAlbumId}
          activeAlbumTitle={activeAlbum.shortTitle}
        />
      )}
    </div>
  )
}
