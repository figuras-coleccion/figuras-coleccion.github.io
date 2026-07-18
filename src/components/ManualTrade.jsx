import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useUser } from '../context/UserContext'
import { useStickers } from '../context/StickersContext'
import { useEditLock } from '../context/EditLockContext'
import { db, ref, get } from '../firebase'
import { buildAlbumGroups, getStickerDisplayNumber, isIrregularStickerCode } from '../data/albumGroups'

const QR_SCANNER_SCRIPT = 'https://cdnjs.cloudflare.com/ajax/libs/html5-qrcode/2.3.8/html5-qrcode.min.js'
let qrScannerLibraryPromise = null

function ensureQrScannerLibrary() {
  if (window.Html5Qrcode) return Promise.resolve(window.Html5Qrcode)
  if (qrScannerLibraryPromise) return qrScannerLibraryPromise

  qrScannerLibraryPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${QR_SCANNER_SCRIPT}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve(window.Html5Qrcode), { once: true })
      existing.addEventListener('error', () => reject(new Error('No se pudo cargar el lector QR.')), { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = QR_SCANNER_SCRIPT
    script.async = true
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

function QrTradePanel({ user, stickers, orderedCodes, initialPartnerId, onPartnerIdChange }) {
  const scannerRef = useRef(null)
  const scanLockedRef = useRef(false)
  const [scannerOpen, setScannerOpen] = useState(false)
  const [scannerStatus, setScannerStatus] = useState('')
  const [loadingMatch, setLoadingMatch] = useState(false)
  const [qrError, setQrError] = useState('')
  const [match, setMatch] = useState(null)
  const [loadedPartnerId, setLoadedPartnerId] = useState('')

  const myName = `${user?.name || ''} ${user?.surname || ''}`.trim() || 'Mi cuenta'
  const qrPayload = useMemo(() => {
    const basePath = import.meta.env.BASE_URL || '/'
    return `${window.location.origin}${basePath}trade?qrUser=${encodeURIComponent(user.id)}`
  }, [user.id])
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
      if (!snapshot.exists()) {
        throw new Error('La cuenta vinculada ya no existe.')
      }

      const partnerData = snapshot.val() || {}
      const partnerProfile = partnerData.profile || {}
      const partnerStickers = partnerData.stickers || {}

      if (partnerProfile.emailVerified === false) {
        throw new Error('La cuenta vinculada todavía no está habilitada.')
      }

      // Prioridad del usuario que escanea:
      // 1) Lo que yo necesito y la otra persona tiene repetido.
      // 2) Lo que la otra persona necesita y yo tengo repetido.
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
  }, [onPartnerIdChange, orderedCodes, stickers, user.id])

  useEffect(() => {
    if (!initialPartnerId || initialPartnerId === loadedPartnerId) return
    void loadPartnerMatch(initialPartnerId)
  }, [initialPartnerId, loadPartnerMatch, loadedPartnerId])

  const stopScanner = useCallback(async () => {
    const scanner = scannerRef.current
    scannerRef.current = null
    scanLockedRef.current = false

    if (scanner) {
      try {
        await scanner.stop()
      } catch {
        // Puede ocurrir si la cámara todavía estaba iniciando.
      }
      try {
        await scanner.clear()
      } catch {
        // No bloqueamos el cierre por limpieza visual.
      }
    }

    setScannerOpen(false)
    setScannerStatus('')
  }, [])

  useEffect(() => {
    if (!scannerOpen) return undefined

    let cancelled = false

    const startScanner = async () => {
      setScannerStatus('Activando cámara…')
      setQrError('')

      try {
        const Html5Qrcode = await ensureQrScannerLibrary()
        if (cancelled || !Html5Qrcode) return

        const scanner = new Html5Qrcode('panini-live-qr-reader')
        scannerRef.current = scanner
        const boxSize = Math.max(190, Math.min(260, window.innerWidth - 90))

        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: boxSize, height: boxSize }, aspectRatio: 1 },
          async decodedText => {
            if (scanLockedRef.current) return
            scanLockedRef.current = true

            const partnerId = parseQrUserId(decodedText)
            await stopScanner()

            if (!partnerId) {
              setQrError('El código escaneado no pertenece a Panini 2026.')
              return
            }

            await loadPartnerMatch(partnerId, { updateUrl: true })
          },
          () => {
            // Los intentos sin lectura son normales mientras la cámara está abierta.
          }
        )

        if (!cancelled) setScannerStatus('Apunta la cámara al QR de la otra persona.')
      } catch (error) {
        console.error('Error starting QR scanner:', error)
        setScannerStatus('')
        setQrError('No se pudo abrir la cámara. Revisa el permiso de cámara del navegador.')
      }
    }

    void startScanner()

    return () => {
      cancelled = true
      const scanner = scannerRef.current
      scannerRef.current = null
      scanLockedRef.current = false
      if (scanner) {
        scanner.stop().catch(() => {}).finally(() => scanner.clear().catch(() => {}))
      }
    }
  }, [loadPartnerMatch, scannerOpen, stopScanner])

  const partnerName = match
    ? `${match.profile.name || ''} ${match.profile.surname || ''}`.trim() || 'Coleccionista'
    : ''

  return (
    <div className="qr-trade-page">
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

        <button type="button" className="qr-scan-button" onClick={() => setScannerOpen(true)}>
          ⛶ Escanear QR
        </button>
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
              setScannerOpen(true)
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
            <div className="qr-scanner-status">{scannerStatus || 'Preparando lector…'}</div>
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
              {successSummary.received} recibida{successSummary.received === 1 ? '' : 's'} · {' '}
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

export default function ManualTrade() {
  const { user } = useUser()
  const { stickers, applyManualTrade } = useStickers()
  const { editingLocked } = useEditLock()
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
        />
      )}
    </div>
  )
}
