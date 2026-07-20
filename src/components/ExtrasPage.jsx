import { useState, useEffect } from 'react'
import { useStickers } from '../context/StickersContext'
import { getAllStickers } from '../data/stickersData'
import { normalizeStickerCodeForActiveAlbum } from '../data/albumGroups'
import DeleteStickerConfirmation from './DeleteStickerConfirmation'

const STANDARD_CODES = new Set(getAllStickers().map(s => s.code))

export default function ExtrasPage() {
  const { stickers, pendingChanges, updateStickerLocal, saveToCloud, isStickerLocked, deleteSavedSticker } = useStickers()
  const [extraCodes, setExtraCodes] = useState([])
  const [newCode, setNewCode] = useState('')
  const [deleteCandidate, setDeleteCandidate] = useState(null)
  const hasPendingExtras = extraCodes.some(code => pendingChanges[code])
  const normalizedNewCode = normalizeStickerCodeForActiveAlbum(newCode)
  const canAddExtra = Boolean(normalizedNewCode) && !STANDARD_CODES.has(normalizedNewCode) && !extraCodes.includes(normalizedNewCode)

  useEffect(() => {
    const extras = Object.keys(stickers)
      .filter(code => !STANDARD_CODES.has(code))
      .sort((a, b) => a.localeCompare(b))
    setExtraCodes(extras)
  }, [stickers])

  const addExtra = () => {
    const code = normalizeStickerCodeForActiveAlbum(newCode)
    if (code && !STANDARD_CODES.has(code) && !extraCodes.includes(code)) {
      updateStickerLocal(code, { owned: true, duplicates: 0 })
      setNewCode('')
    }
  }

  const handleToggleExtra = (code, sticker, locked) => {
    if (locked && sticker.owned) {
      setDeleteCandidate(prev => (prev === code ? null : code))
      return
    }

    setDeleteCandidate(null)
    updateStickerLocal(code, { owned: !sticker.owned })
  }

  return (
    <div>
      <h2 style={{ fontSize: '18px', marginBottom: '16px' }}>📦 Promocionales / Regionales</h2>
      <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
        Agrega códigos de pegatinas especiales que no están en la lista estándar.
      </p>

      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <input
          type="text"
          placeholder="Nuevo código (ej: PROMO1)"
          value={newCode}
          onChange={(e) => setNewCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => {
            if (e.key === 'Enter') addExtra()
          }}
          style={{ flex: 1 }}
        />
        <button
          onClick={addExtra}
          disabled={!canAddExtra}
          title={!normalizedNewCode ? 'Escribe un código extra' : STANDARD_CODES.has(normalizedNewCode) ? 'Ese código ya existe en el álbum estándar' : extraCodes.includes(normalizedNewCode) ? 'Ese extra ya fue agregado' : 'Agregar extra'}
          style={{
            background: canAddExtra ? 'var(--primary)' : 'var(--border)',
            color: 'white',
            padding: '12px 16px',
            borderRadius: 'var(--radius)',
            fontWeight: 600
          }}
        >
          +
        </button>
      </div>

      {extraCodes.length === 0 && (
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px' }}>
          No hay pegatinas extras agregadas aún.
        </p>
      )}

      {extraCodes.map(code => {
        const sticker = stickers[code] || { owned: false, duplicates: 0 }
        const locked = isStickerLocked(code)
        return (
          <div key={code} className="card extra-sticker-card">
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                justifyContent: 'space-between'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  className="checkbox"
                  onClick={() => handleToggleExtra(code, sticker, locked)}
                  title={locked ? 'Ya fue guardada. Toca para eliminar con confirmación segura.' : sticker.owned ? 'Quitar antes de guardar' : 'Marcar como pegada'}
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    border: `2px solid ${sticker.owned ? 'var(--success)' : 'var(--border)'}`,
                    background: sticker.owned ? 'var(--success)' : 'transparent',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: 'pointer',
                    color: 'white',
                    fontSize: '18px',
                    opacity: locked ? 0.9 : 1
                  }}
                >
                  {sticker.owned ? '✓' : ''}
                </div>
                <strong>{code}</strong>
              </div>
              {sticker.owned && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <button
                    onClick={() => updateStickerLocal(code, { duplicates: Math.max(0, sticker.duplicates - 1) })}
                    disabled={sticker.duplicates <= 0}
                    style={{
                      width: '26px',
                      height: '26px',
                      borderRadius: '50%',
                      background: sticker.duplicates > 0 ? 'var(--primary)' : 'var(--border)',
                      color: 'white',
                      fontWeight: 700
                    }}
                  >
                    -
                  </button>
                  <span style={{ fontWeight: 700, color: 'var(--accent)' }}>{sticker.duplicates}</span>
                  <button
                    onClick={() => updateStickerLocal(code, { duplicates: sticker.duplicates + 1 })}
                    style={{
                      width: '26px',
                      height: '26px',
                      borderRadius: '50%',
                      background: 'var(--success)',
                      color: 'white',
                      fontWeight: 700
                    }}
                  >
                    +
                  </button>
                </div>
              )}
            </div>

            {deleteCandidate === code && locked && sticker.owned && (
              <DeleteStickerConfirmation
                stickerCode={code}
                onCancel={() => setDeleteCandidate(null)}
                onDeleteConfirmed={deleteSavedSticker}
              />
            )}
          </div>
        )
      })}

      <div style={{ textAlign: 'center', marginTop: '20px' }}>
        <button onClick={saveToCloud} className="btn-primary" disabled={!hasPendingExtras}>
          {hasPendingExtras ? '💾 Guardar extras' : '✅ Extras guardados'}
        </button>
      </div>
    </div>
  )
}
