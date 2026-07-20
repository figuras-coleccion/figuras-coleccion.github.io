import { useMemo, useRef, useState } from 'react'
import { db, get, ref, update } from '../firebase'
import { DEFAULT_ALBUM_ID } from '../albums/constants'
import { useAlbum } from '../context/AlbumContext'
import { useUser } from '../context/UserContext'
import {
  decodeFiguritasExportPayload,
  FIGURITAS_EXPORT_PREFIX
} from '../integrations/figuritas/exportProtocol'
import { decodeQrFromImageFile } from '../integrations/figuritas/qrImageReader'

const styles = `
.figuritas-import-overlay{position:fixed;inset:0;z-index:5600;display:grid;align-items:end;background:rgba(15,23,42,.66);backdrop-filter:blur(7px);-webkit-backdrop-filter:blur(7px)}
.figuritas-import-sheet{width:min(100%,720px);max-height:94vh;overflow:auto;margin:0 auto;padding:12px 20px 24px;border-radius:28px 28px 0 0;background:#fff;color:#0f172a;box-shadow:0 26px 80px rgba(15,23,42,.34)}
.figuritas-import-handle{width:54px;height:6px;display:block;margin:2px auto 14px;border-radius:999px;background:#cbd5e1}
.figuritas-import-head{position:relative;text-align:center}
.figuritas-import-close{position:absolute;right:0;top:-2px;width:38px;height:38px;display:grid;place-items:center;border:0;border-radius:50%;background:#f1f5f9;color:#475569;font-size:24px}
.figuritas-import-logo{width:62px;height:62px;margin:0 auto 10px;display:grid;place-items:center;border-radius:18px;background:linear-gradient(135deg,#315bdc,#2449b8);color:#fff;font-size:29px;font-weight:900}
.figuritas-import-head h2{margin:0;padding:0 42px;font-size:26px}
.figuritas-import-head p{max-width:540px;margin:8px auto 0;color:#64748b;font-size:12px;font-weight:700;line-height:1.55}
.figuritas-import-instructions{display:grid;gap:9px;margin:18px 0}
.figuritas-import-step{display:grid;grid-template-columns:30px 1fr;align-items:start;gap:10px;padding:11px 12px;border-radius:15px;background:#f8fafc}
.figuritas-import-step b{width:30px;height:30px;display:grid;place-items:center;border-radius:50%;background:#315bdc;color:#fff;font-size:12px}
.figuritas-import-step span{padding-top:5px;color:#475569;font-size:11px;font-weight:750;line-height:1.45}
.figuritas-import-drop{display:block;padding:20px 16px;border:2px dashed #aac0f5;border-radius:20px;background:#f6f8ff;text-align:center;cursor:pointer}
.figuritas-import-drop input{position:absolute;width:1px;height:1px;overflow:hidden;opacity:0}
.figuritas-import-drop strong{display:block;color:#2449b8;font-size:15px}
.figuritas-import-drop small{display:block;margin-top:5px;color:#64748b;font-size:10px;font-weight:700}
.figuritas-import-status{margin-top:13px;padding:12px 13px;border-radius:15px;font-size:11px;font-weight:800;line-height:1.5}
.figuritas-import-status.loading{background:#eef4ff;color:#2449b8}
.figuritas-import-status.error{background:#fff0f0;color:#b42318}
.figuritas-import-summary{margin-top:16px;padding:16px;border:1px solid #dbe4f0;border-radius:20px;background:#fff}
.figuritas-import-summary h3{margin:0 0 12px;font-size:17px}
.figuritas-import-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}
.figuritas-import-stat{padding:11px 7px;border-radius:14px;background:#f8fafc;text-align:center}
.figuritas-import-stat strong{display:block;font-size:20px}
.figuritas-import-stat span{display:block;margin-top:3px;color:#64748b;font-size:9px;font-weight:800}
.figuritas-import-preview{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}
.figuritas-import-preview>div{padding:11px;border-radius:14px;background:#f8fafc}
.figuritas-import-preview strong{display:block;margin-bottom:6px;font-size:10px}
.figuritas-import-preview p{margin:0;color:#64748b;font-size:10px;font-weight:700;line-height:1.55;word-break:break-word}
.figuritas-import-warning{margin-top:12px;padding:11px 12px;border-radius:14px;background:#fff7e8;color:#92400e;font-size:10px;font-weight:800;line-height:1.5}
.figuritas-import-confirm-row{display:flex;align-items:flex-start;gap:9px;margin-top:13px;padding:11px 12px;border:1px solid #e2e8f0;border-radius:14px}
.figuritas-import-confirm-row input{margin-top:2px}
.figuritas-import-confirm-row span{color:#475569;font-size:10px;font-weight:750;line-height:1.45}
.figuritas-import-actions{display:grid;grid-template-columns:1fr 1.35fr;gap:10px;margin-top:14px}
.figuritas-import-actions button{min-height:50px;border-radius:15px;font-size:12px;font-weight:900}
.figuritas-import-cancel{border:1px solid #dbe4f0;background:#f8fafc;color:#334155}
.figuritas-import-primary{border:0;background:#315bdc;color:#fff}
.figuritas-import-primary:disabled,.figuritas-import-cancel:disabled{opacity:.55}
.figuritas-import-success{margin-top:18px;padding:20px;border-radius:20px;background:#eaf8f1;text-align:center}
.figuritas-import-success div{font-size:34px}
.figuritas-import-success h3{margin:7px 0 0;color:#087f5b}
.figuritas-import-success p{margin:7px 0 0;color:#47705f;font-size:11px;font-weight:750;line-height:1.5}
.figuritas-import-success button{width:100%;min-height:50px;margin-top:14px;border:0;border-radius:15px;background:#087f5b;color:#fff;font-size:12px;font-weight:900}
@media(min-width:761px){.figuritas-import-overlay{align-items:center;padding:22px}.figuritas-import-sheet{border-radius:28px}}
@media(max-width:520px){.figuritas-import-sheet{padding:12px 15px 20px}.figuritas-import-head h2{font-size:22px}.figuritas-import-grid{grid-template-columns:repeat(2,1fr)}.figuritas-import-preview{grid-template-columns:1fr}.figuritas-import-actions{grid-template-columns:1fr}}
`

function formatPreview(items, formatter = value => value) {
  if (!items?.length) return 'Ninguna'
  const preview = items.slice(0, 12).map(formatter)
  return `${preview.join(', ')}${items.length > preview.length ? ` y ${items.length - preview.length} más` : ''}`
}

export default function FiguritasImportModal({ onClose }) {
  const inputRef = useRef(null)
  const { user } = useUser()
  const {
    activeAlbumId,
    activeAlbum,
    getAlbumChildPath
  } = useAlbum()
  const [reading, setReading] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState('')
  const [decoded, setDecoded] = useState(null)
  const [confirmed, setConfirmed] = useState(false)
  const [completed, setCompleted] = useState(false)
  const [fileName, setFileName] = useState('')

  const isPaniniAlbum = activeAlbumId === DEFAULT_ALBUM_ID
  const orderedCodes = useMemo(
    () => activeAlbum?.allStickersOrdered || [],
    [activeAlbum]
  )

  const handleFile = async event => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || reading || importing) return

    setReading(true)
    setError('')
    setDecoded(null)
    setConfirmed(false)
    setFileName(file.name)

    try {
      const qrText = await decodeQrFromImageFile(file)
      const result = await decodeFiguritasExportPayload(qrText, orderedCodes)
      setDecoded(result)
    } catch (readError) {
      console.error('No se pudo preparar la importación de Figuritas:', readError)
      setError(readError?.message || 'No se pudo leer el QR de exportación.')
    } finally {
      setReading(false)
    }
  }

  const handleImport = async () => {
    if (!decoded || !confirmed || importing || !user?.id) return
    if (!isPaniniAlbum) {
      setError('La importación de Figuritas solo está disponible para WORLD CUP 2026 - PANINI.')
      return
    }

    setImporting(true)
    setError('')

    try {
      const stickersPath = getAlbumChildPath('stickers')
      const statsPath = getAlbumChildPath('collectionStats')
      const backupsPath = getAlbumChildPath('importBackups')
      const historyPath = getAlbumChildPath('importHistory')
      const snapshot = await get(ref(db, stickersPath))
      const previousStickers = snapshot.val() || {}
      const now = Date.now()
      const importId = `${now}-${Math.random().toString(36).slice(2, 8)}`
      const updates = {}

      updates[`${backupsPath}/${importId}`] = {
        albumId: activeAlbumId,
        source: 'figuritas-export-qr',
        protocolPrefix: FIGURITAS_EXPORT_PREFIX,
        createdAt: now,
        previousStickers,
        previousStickerEntries: Object.keys(previousStickers).length
      }

      orderedCodes.forEach(code => {
        const existing = previousStickers[code] && typeof previousStickers[code] === 'object'
          ? previousStickers[code]
          : {}
        const imported = decoded.stickers[code] || { owned: false, duplicates: 0 }
        const wasOwned = Boolean(existing.owned)
        const owned = Boolean(imported.owned)
        const duplicates = owned ? Math.max(0, Number(imported.duplicates) || 0) : 0

        updates[`${stickersPath}/${code}`] = {
          ...existing,
          owned,
          duplicates,
          obtainedAt: owned
            ? (wasOwned && Number(existing.obtainedAt) > 0 ? Number(existing.obtainedAt) : now)
            : null,
          updatedAt: now,
          lastImportSource: 'figuritas-export-qr'
        }
      })

      const summary = {
        total: decoded.total,
        owned: decoded.owned,
        missing: decoded.missingCount,
        repeatedStickerCount: decoded.repeatedStickerCount,
        totalDuplicates: decoded.totalDuplicates
      }

      updates[`${historyPath}/${importId}`] = {
        albumId: activeAlbumId,
        source: 'figuritas-export-qr',
        protocolVersion: decoded.protocolVersion,
        importedAt: now,
        fileName,
        summary
      }
      updates[`${statsPath}/lastImportAt`] = now
      updates[`${statsPath}/lastImportSource`] = 'figuritas-export-qr'
      updates[`${statsPath}/lastImportSummary`] = summary
      updates[`${statsPath}/lastActivityAt`] = now

      await update(ref(db), updates)
      setCompleted(true)
    } catch (importError) {
      console.error('No se pudo importar el álbum de Figuritas:', importError)
      setError('No se pudo guardar la importación. Revisa tu conexión e inténtalo nuevamente.')
    } finally {
      setImporting(false)
    }
  }

  const openAlbum = () => {
    const base = import.meta.env.BASE_URL || '/'
    window.location.assign(`${base}album?imported=figuritas`)
  }

  if (!isPaniniAlbum) return null

  return (
    <div
      className="figuritas-import-overlay"
      role="presentation"
      onClick={() => !reading && !importing && !completed && onClose?.()}
    >
      <style>{styles}</style>
      <section
        className="figuritas-import-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="figuritas-import-title"
        onClick={event => event.stopPropagation()}
      >
        <span className="figuritas-import-handle" />
        <header className="figuritas-import-head">
          {!completed ? (
            <button
              type="button"
              className="figuritas-import-close"
              onClick={onClose}
              disabled={reading || importing}
              aria-label="Cerrar"
            >
              ×
            </button>
          ) : null}
          <div className="figuritas-import-logo" aria-hidden="true">QR</div>
          <h2 id="figuritas-import-title">Importar álbum Panini</h2>
          <p>
            Usa únicamente el QR de <strong>Exportar álbum</strong> de la app Figuritas.
            El QR de intercambio no será aceptado.
          </p>
        </header>

        {completed ? (
          <div className="figuritas-import-success">
            <div aria-hidden="true">✓</div>
            <h3>Álbum importado correctamente</h3>
            <p>
              Se creó un respaldo previo y se actualizó WORLD CUP 2026 - PANINI
              con las obtenidas, faltantes y cantidades de repetidas detectadas.
            </p>
            <button type="button" onClick={openAlbum}>Abrir mi álbum</button>
          </div>
        ) : (
          <>
            <div className="figuritas-import-instructions">
              <div className="figuritas-import-step">
                <b>1</b>
                <span>En Figuritas abre “Usa Méx Can 26” y entra a <strong>Exportar álbum</strong>.</span>
              </div>
              <div className="figuritas-import-step">
                <b>2</b>
                <span>Toma una captura donde se vea completo el QR, incluidos sus cuatro bordes.</span>
              </div>
              <div className="figuritas-import-step">
                <b>3</b>
                <span>Carga aquí la captura. Primero verás un resumen y nada cambiará hasta que confirmes.</span>
              </div>
            </div>

            <label className="figuritas-import-drop">
              <input
                ref={inputRef}
                type="file"
                accept="image/*"
                onChange={handleFile}
                disabled={reading || importing}
              />
              <strong>{reading ? 'Analizando el QR…' : 'Cargar captura del QR de exportación'}</strong>
              <small>PNG, JPG o una captura guardada en tu galería · máximo 20 MB</small>
            </label>

            {reading ? (
              <div className="figuritas-import-status loading" role="status">
                Buscando el QR en toda la captura y en recortes automáticos, validando sus tres bloques y descomprimiendo el álbum…
              </div>
            ) : null}

            {error ? (
              <div className="figuritas-import-status error" role="alert">{error}</div>
            ) : null}

            {decoded ? (
              <section className="figuritas-import-summary" aria-label="Resumen de importación">
                <h3>Vista previa del álbum detectado</h3>
                <div className="figuritas-import-grid">
                  <div className="figuritas-import-stat"><strong>{decoded.total}</strong><span>Total</span></div>
                  <div className="figuritas-import-stat"><strong>{decoded.owned}</strong><span>Obtenidas</span></div>
                  <div className="figuritas-import-stat"><strong>{decoded.missingCount}</strong><span>Faltantes</span></div>
                  <div className="figuritas-import-stat"><strong>{decoded.totalDuplicates}</strong><span>Repetidas</span></div>
                </div>

                <div className="figuritas-import-preview">
                  <div>
                    <strong>Primeras faltantes detectadas</strong>
                    <p>{formatPreview(decoded.missing)}</p>
                  </div>
                  <div>
                    <strong>Primeras repetidas detectadas</strong>
                    <p>{formatPreview(decoded.repeated, item => `${item.code} ×${item.totalCopies}`)}</p>
                  </div>
                </div>

                <div className="figuritas-import-warning">
                  Esta importación reemplazará el estado actual de las 994 posiciones de Panini.
                  Antes de hacerlo, la webapp guardará automáticamente una copia completa del estado anterior.
                </div>

                <label className="figuritas-import-confirm-row">
                  <input
                    type="checkbox"
                    checked={confirmed}
                    onChange={event => setConfirmed(event.target.checked)}
                    disabled={importing}
                  />
                  <span>
                    Confirmo que esta captura corresponde a mi QR de <strong>Exportar álbum</strong>
                    de Figuritas y deseo reemplazar mi estado Panini actual.
                  </span>
                </label>

                <div className="figuritas-import-actions">
                  <button
                    type="button"
                    className="figuritas-import-cancel"
                    onClick={() => {
                      setDecoded(null)
                      setConfirmed(false)
                      setError('')
                      setFileName('')
                    }}
                    disabled={importing}
                  >
                    Elegir otra imagen
                  </button>
                  <button
                    type="button"
                    className="figuritas-import-primary"
                    onClick={() => void handleImport()}
                    disabled={!confirmed || importing}
                  >
                    {importing ? 'Importando…' : 'IMPORTAR ÁLBUM'}
                  </button>
                </div>
              </section>
            ) : null}
          </>
        )}
      </section>
    </div>
  )
}
