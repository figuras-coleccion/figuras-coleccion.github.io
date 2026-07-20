import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_ALBUM_ID } from '../albums/constants'
import { useAlbum } from '../context/AlbumContext'
import { useStickers } from '../context/StickersContext'
import {
  classifyFiguritasPayload,
  decodeFiguritasTradePayload,
  encodeFiguritasTradeConfirmationPayload
} from '../integrations/figuritas/exportProtocol'
import { decodeQrFromImageFile } from '../integrations/figuritas/qrImageReader'
import { createLocalQrDataUrl } from './LocalQrCode'

const styles = `
.figuritas-trade-overlay{position:fixed;inset:0;z-index:5900;display:grid;align-items:end;background:rgba(15,23,42,.68);backdrop-filter:blur(7px);-webkit-backdrop-filter:blur(7px);overflow-x:hidden}
.figuritas-trade-sheet,.figuritas-trade-sheet *{box-sizing:border-box}
.figuritas-trade-sheet{width:min(100%,760px);max-width:100%;max-height:95vh;overflow:auto;overflow-x:hidden;margin:0 auto;padding:12px 20px 24px;border-radius:28px 28px 0 0;background:#fff;color:#0f172a;box-shadow:0 26px 80px rgba(15,23,42,.34)}
.figuritas-trade-handle{width:54px;height:6px;display:block;margin:2px auto 14px;border-radius:999px;background:#cbd5e1}
.figuritas-trade-head{position:relative;text-align:center;min-width:0}
.figuritas-trade-close{position:absolute;right:0;top:-2px;width:40px;height:40px;display:grid;place-items:center;border:0;border-radius:50%;background:#f1f5f9;color:#475569;font-size:25px}
.figuritas-trade-logo{width:62px;height:62px;margin:0 auto 10px;display:grid;place-items:center;border-radius:18px;background:linear-gradient(135deg,#315bdc,#2449b8);color:#fff;font-size:26px;font-weight:900}
.figuritas-trade-head h2{margin:0;padding:0 44px;font-size:26px;line-height:1.15;overflow-wrap:anywhere}
.figuritas-trade-head p{max-width:560px;margin:8px auto 0;color:#64748b;font-size:12px;font-weight:700;line-height:1.55}
.figuritas-trade-drop{position:relative;display:block;width:100%;max-width:100%;margin-top:18px;padding:20px 16px;border:2px dashed #aac0f5;border-radius:20px;background:#f6f8ff;text-align:center;cursor:pointer}
.figuritas-trade-drop input{position:absolute;width:1px;height:1px;overflow:hidden;opacity:0}
.figuritas-trade-drop strong{display:block;color:#2449b8;font-size:15px}
.figuritas-trade-drop small{display:block;margin-top:5px;color:#64748b;font-size:10px;font-weight:700}
.figuritas-trade-status{width:100%;max-width:100%;margin-top:13px;padding:12px 13px;border-radius:15px;font-size:11px;font-weight:800;line-height:1.5;overflow-wrap:anywhere}
.figuritas-trade-status.loading{background:#eef4ff;color:#2449b8}
.figuritas-trade-status.error{background:#fff0f0;color:#b42318}
.figuritas-trade-summary{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:16px}
.figuritas-trade-stat{min-width:0;padding:12px 8px;border-radius:15px;background:#f8fafc;text-align:center}
.figuritas-trade-stat strong{display:block;font-size:22px}
.figuritas-trade-stat span{display:block;margin-top:3px;color:#64748b;font-size:9px;font-weight:800;overflow-wrap:anywhere}
.figuritas-trade-panel{min-width:0;margin-top:14px;padding:14px;border:1px solid #dbe4f0;border-radius:18px;background:#fff}
.figuritas-trade-panel-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;min-width:0}
.figuritas-trade-panel-head>div{min-width:0}
.figuritas-trade-panel h3{margin:0;font-size:18px}
.figuritas-trade-panel p{margin:5px 0 0;color:#64748b;font-size:10px;font-weight:700;line-height:1.45;overflow-wrap:anywhere}
.figuritas-trade-select-all{flex:0 0 auto;border:0;background:transparent;color:#2563eb;font-size:12px;font-weight:900}
.figuritas-trade-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(64px,1fr));gap:8px;margin-top:12px}
.figuritas-trade-token{min-width:0;min-height:72px;padding:8px;border:1px solid #e2e8f0;border-radius:14px;background:#f8fafc;color:#475569;font-size:12px;font-weight:850;overflow-wrap:anywhere}
.figuritas-trade-token.selected{border-color:#315bdc;background:#315bdc;color:#fff;box-shadow:0 8px 20px rgba(49,91,220,.2)}
.figuritas-trade-empty{margin-top:12px;padding:12px;border-radius:13px;background:#f8fafc;color:#64748b;font-size:10px;font-weight:750;text-align:center}
.figuritas-trade-actions{display:grid;grid-template-columns:1fr 1.35fr;gap:10px;margin-top:16px}
.figuritas-trade-actions button,.figuritas-trade-final button{min-height:50px;border-radius:15px;font-size:12px;font-weight:900}
.figuritas-trade-cancel{border:1px solid #dbe4f0;background:#f8fafc;color:#334155}
.figuritas-trade-primary{border:0;background:#315bdc;color:#fff}
.figuritas-trade-primary:disabled,.figuritas-trade-cancel:disabled{opacity:.55}
.figuritas-trade-final{width:100%;max-width:100%;min-width:0;margin-top:14px;text-align:center}
.figuritas-trade-success-icon{width:62px;height:62px;margin:0 auto 10px;display:grid;place-items:center;border-radius:50%;background:#eaf8f1;color:#087f5b;font-size:30px;font-weight:900}
.figuritas-trade-final h3{margin:0;color:#087f5b;font-size:22px;line-height:1.2}
.figuritas-trade-final-intro{margin:8px auto 0;max-width:580px;color:#47705f;font-size:11px;font-weight:750;line-height:1.5}
.figuritas-trade-result-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px;text-align:left}
.figuritas-trade-result-card{min-width:0;padding:12px;border-radius:15px;background:#f8fafc}
.figuritas-trade-result-card strong{display:block;margin-bottom:6px;font-size:11px}
.figuritas-trade-result-card p{margin:0;color:#475569;font-size:11px;font-weight:750;line-height:1.45;overflow-wrap:anywhere}
.figuritas-trade-host-note{margin:14px auto 0;max-width:580px;padding:11px 12px;border-radius:14px;background:#eef4ff;color:#2449b8;font-size:11px;font-weight:800;line-height:1.5}
.figuritas-trade-qr-frame{width:min(100%,430px);margin:14px auto 0;padding:12px;border:1px solid #dbe4f0;border-radius:20px;background:#fff}
.figuritas-trade-qr-frame img{display:block;width:100%;height:auto;border-radius:12px}
.figuritas-trade-final .figuritas-trade-primary{width:100%;margin-top:16px}
@media(min-width:761px){.figuritas-trade-overlay{align-items:center;padding:22px}.figuritas-trade-sheet{border-radius:28px}}
@media(max-width:520px){
  .figuritas-trade-sheet{padding:12px 15px 20px}
  .figuritas-trade-head h2{font-size:22px}
  .figuritas-trade-grid{grid-template-columns:repeat(4,minmax(0,1fr))}
  .figuritas-trade-actions{grid-template-columns:1fr}
  .figuritas-trade-result-grid{grid-template-columns:1fr}
}
@media(max-width:360px){.figuritas-trade-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
`

function toggleSet(previous, code) {
  const next = new Set(previous)
  if (next.has(code)) next.delete(code)
  else next.add(code)
  return next
}

function TokenGrid({ codes, selectedCodes, onToggle, emptyText }) {
  if (!codes.length) return <div className="figuritas-trade-empty">{emptyText}</div>

  return (
    <div className="figuritas-trade-grid">
      {codes.map(code => (
        <button
          key={code}
          type="button"
          className={`figuritas-trade-token ${selectedCodes.has(code) ? 'selected' : ''}`}
          onClick={() => onToggle(code)}
          aria-pressed={selectedCodes.has(code)}
        >
          {code}
        </button>
      ))}
    </div>
  )
}

export default function FiguritasTradeModal({ onClose, initialPayload = '' }) {
  const inputRef = useRef(null)
  const { activeAlbumId, activeAlbum } = useAlbum()
  const { stickers, applyManualTrade } = useStickers()
  const [reading, setReading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const [decoded, setDecoded] = useState(null)
  const [receiveSelection, setReceiveSelection] = useState(() => new Set())
  const [deliverSelection, setDeliverSelection] = useState(() => new Set())
  const [finalPayload, setFinalPayload] = useState('')
  const [finalQrDataUrl, setFinalQrDataUrl] = useState('')
  const [completedReceived, setCompletedReceived] = useState([])
  const [completedDelivered, setCompletedDelivered] = useState([])

  const isPaniniAlbum = activeAlbumId === DEFAULT_ALBUM_ID
  const orderedCodes = useMemo(() => activeAlbum?.allStickersOrdered || [], [activeAlbum])

  const match = useMemo(() => {
    if (!decoded) return { canReceive: [], canDeliver: [] }

    return {
      canReceive: decoded.hostRepeated.filter(code => !stickers[code]?.owned),
      canDeliver: decoded.hostMissing.filter(code => Number(stickers[code]?.duplicates || 0) > 0)
    }
  }, [decoded, stickers])

  const resetTrade = useCallback(() => {
    setDecoded(null)
    setReceiveSelection(new Set())
    setDeliverSelection(new Set())
    setFinalPayload('')
    setFinalQrDataUrl('')
    setCompletedReceived([])
    setCompletedDelivered([])
    setError('')
  }, [])

  const closeTrade = useCallback(() => {
    if (processing) return
    resetTrade()
    onClose?.()
  }, [onClose, processing, resetTrade])

  useEffect(() => {
    const handleEscape = event => {
      if (event.key === 'Escape') closeTrade()
    }

    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [closeTrade])

  const decodeInitialPayload = async payload => {
    const kind = classifyFiguritasPayload(payload)
    if (kind.type === 'trade-confirmation') {
      throw new Error(
        'Este es el QR final de actualización del anfitrión. Para iniciar el intercambio usa el QR inicial de Figuritas.'
      )
    }
    if (kind.type === 'export') {
      throw new Error(
        'Este es el QR de Exportar álbum. Para intercambiar usa el QR inicial de “Intercambiar figuritas”.'
      )
    }
    const result = await decodeFiguritasTradePayload(payload, orderedCodes)
    setDecoded(result)
  }

  useEffect(() => {
    if (!initialPayload || !orderedCodes.length || decoded || reading) return
    let cancelled = false
    setReading(true)
    setError('')

    decodeInitialPayload(initialPayload)
      .catch(readError => {
        if (!cancelled) setError(readError?.message || 'No se pudo leer el QR inicial.')
      })
      .finally(() => {
        if (!cancelled) setReading(false)
      })

    return () => {
      cancelled = true
    }
  }, [decoded, initialPayload, orderedCodes, reading])

  const handleFile = async event => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || reading || processing) return

    setReading(true)
    resetTrade()

    try {
      const qrText = await decodeQrFromImageFile(file)
      await decodeInitialPayload(qrText)
    } catch (readError) {
      console.error('No se pudo leer el QR de intercambio de Figuritas:', readError)
      setError(readError?.message || 'No se pudo leer el QR inicial de intercambio.')
    } finally {
      setReading(false)
    }
  }

  const selectAll = type => {
    if (type === 'receive') {
      setReceiveSelection(new Set(match.canReceive))
      return
    }
    setDeliverSelection(new Set(match.canDeliver))
  }

  const confirmTrade = async () => {
    if (processing || !receiveSelection.size || !deliverSelection.size) return

    setProcessing(true)
    setError('')

    const receivedCodes = Array.from(receiveSelection)
    const deliveredCodes = Array.from(deliverSelection)

    try {
      for (const code of deliveredCodes) {
        if (Number(stickers[code]?.duplicates || 0) <= 0) {
          throw new Error(`${code} ya no tiene una copia repetida disponible.`)
        }
      }

      const payload = await encodeFiguritasTradeConfirmationPayload({
        hostDeliversCodes: receivedCodes,
        hostReceivesCodes: deliveredCodes
      }, orderedCodes)

      const qrDataUrl = await createLocalQrDataUrl(payload, 430)

      const result = await applyManualTrade({
        receivedCodes,
        deliveredCodes,
        history: {
          mode: 'figuritas',
          role: 'guest',
          partnerName: 'Usuario de Figuritas',
          source: 'figuritas',
          status: 'completed-local',
          hostConfirmation: 'external-not-verifiable',
          protocol: 'figuritas-trade-v2'
        }
      })

      if (!result.success) {
        throw new Error('No hubo cambios válidos. Revisa las figuritas seleccionadas.')
      }

      setCompletedReceived(result.received)
      setCompletedDelivered(result.delivered)
      setFinalPayload(payload)
      setFinalQrDataUrl(qrDataUrl)
    } catch (confirmError) {
      console.error('No se pudo confirmar el intercambio de Figuritas:', confirmError)
      setError(confirmError?.message || 'No se pudo confirmar el intercambio.')
    } finally {
      setProcessing(false)
    }
  }

  if (!isPaniniAlbum) return null

  return (
    <div
      className="figuritas-trade-overlay"
      role="presentation"
      onClick={() => !processing && !finalPayload && closeTrade()}
    >
      <style>{styles}</style>
      <section
        className="figuritas-trade-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="figuritas-trade-title"
        onClick={event => event.stopPropagation()}
      >
        <span className="figuritas-trade-handle" />

        {!finalPayload ? (
          <>
            <header className="figuritas-trade-head">
              <button
                type="button"
                className="figuritas-trade-close"
                onClick={event => {
                  event.preventDefault()
                  event.stopPropagation()
                  closeTrade()
                }}
                disabled={processing}
                aria-label="Cerrar"
              >
                ×
              </button>
              <div className="figuritas-trade-logo" aria-hidden="true">QR</div>
              <h2 id="figuritas-trade-title">Intercambiar con Figuritas</h2>
              <p>
                Carga o escanea el QR inicial de la otra persona. Tu álbum se actualizará
                al confirmar y se generará el QR que debe escanear el anfitrión.
              </p>
            </header>

            {!decoded ? (
              <label className="figuritas-trade-drop">
                <input
                  ref={inputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFile}
                  disabled={reading || processing}
                />
                <strong>{reading ? 'Analizando el QR…' : 'Cargar QR inicial de intercambio'}</strong>
                <small>Admite captura completa, fotografía de pantalla o QR con logo central.</small>
              </label>
            ) : null}

            {error ? <div className="figuritas-trade-status error" role="alert">{error}</div> : null}

            {decoded ? (
              <>
                <div className="figuritas-trade-summary" aria-label="Resumen del QR de intercambio">
                  <div className="figuritas-trade-stat">
                    <strong>{decoded.hostRepeated.length}</strong>
                    <span>Repetidas del anfitrión</span>
                  </div>
                  <div className="figuritas-trade-stat">
                    <strong>{decoded.hostMissing.length}</strong>
                    <span>Faltantes del anfitrión</span>
                  </div>
                </div>

                <section className="figuritas-trade-panel">
                  <div className="figuritas-trade-panel-head">
                    <div>
                      <h3>Recibir</h3>
                      <p>Tu amigo/a tiene {match.canReceive.length} figuritas que necesitas.</p>
                    </div>
                    <button
                      type="button"
                      className="figuritas-trade-select-all"
                      onClick={() => selectAll('receive')}
                    >
                      Todas
                    </button>
                  </div>
                  <TokenGrid
                    codes={match.canReceive}
                    selectedCodes={receiveSelection}
                    onToggle={code => setReceiveSelection(previous => toggleSet(previous, code))}
                    emptyText="No hay figuritas para recibir con este QR."
                  />
                </section>

                <section className="figuritas-trade-panel">
                  <div className="figuritas-trade-panel-head">
                    <div>
                      <h3>Entregar</h3>
                      <p>Tienes {match.canDeliver.length} repetidas que tu amigo/a necesita.</p>
                    </div>
                    <button
                      type="button"
                      className="figuritas-trade-select-all"
                      onClick={() => selectAll('deliver')}
                    >
                      Todas
                    </button>
                  </div>
                  <TokenGrid
                    codes={match.canDeliver}
                    selectedCodes={deliverSelection}
                    onToggle={code => setDeliverSelection(previous => toggleSet(previous, code))}
                    emptyText="No hay repetidas tuyas para entregar con este QR."
                  />
                </section>

                <div className="figuritas-trade-actions">
                  <button
                    type="button"
                    className="figuritas-trade-cancel"
                    onClick={event => {
                      event.preventDefault()
                      event.stopPropagation()
                      closeTrade()
                    }}
                    disabled={processing}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="figuritas-trade-primary"
                    onClick={() => void confirmTrade()}
                    disabled={processing || !receiveSelection.size || !deliverSelection.size}
                  >
                    {processing
                      ? 'Confirmando…'
                      : `Confirmar cambio · ${receiveSelection.size} / ${deliverSelection.size}`}
                  </button>
                </div>
              </>
            ) : null}
          </>
        ) : (
          <div className="figuritas-trade-final">
            <div className="figuritas-trade-success-icon" aria-hidden="true">✓</div>
            <h3>TRUEQUE REALIZADO CORRECTAMENTE</h3>
            <p className="figuritas-trade-final-intro">
              Tu álbum de Figuras Colección ya fue actualizado.
            </p>

            <div className="figuritas-trade-result-grid">
              <div className="figuritas-trade-result-card">
                <strong>Recibiste</strong>
                <p>{completedReceived.join(', ') || 'Ninguna'}</p>
              </div>
              <div className="figuritas-trade-result-card">
                <strong>Entregaste</strong>
                <p>{completedDelivered.join(', ') || 'Ninguna'}</p>
              </div>
            </div>

            <p className="figuritas-trade-host-note">
              Escanea este QR desde la app Figuritas para actualizar el álbum del anfitrión.
            </p>

            <div className="figuritas-trade-qr-frame">
              <img
                src={finalQrDataUrl}
                alt="QR final compatible con Figuritas para actualizar al anfitrión"
              />
            </div>

            {error ? <div className="figuritas-trade-status error" role="alert">{error}</div> : null}

            <button type="button" className="figuritas-trade-primary" onClick={closeTrade}>
              FINALIZAR
            </button>
          </div>
        )}
      </section>
    </div>
  )
}
