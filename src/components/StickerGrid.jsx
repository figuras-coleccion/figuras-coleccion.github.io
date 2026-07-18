import { useEffect, useRef, useState } from 'react'
import { getStickerDisplayNumber, isIrregularStickerCode } from '../data/albumGroups'
import { useEditLock } from '../context/EditLockContext'
import { useStickers } from '../context/StickersContext'

const LONG_PRESS_MS = 1000

function vibrate(duration = 12) {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(duration)
  }
}

function StickerToken({ sticker, onUpdate, onRemove, editingLocked }) {
  const { code, owned, duplicates, pending } = sticker
  const timerRef = useRef(null)
  const feedbackTimerRef = useRef(null)
  const longPressTriggeredRef = useRef(false)
  const ignoredPressRef = useRef(false)
  const [pressing, setPressing] = useState(false)
  const [feedback, setFeedback] = useState('')

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current)
  }, [])

  const showFeedback = (value) => {
    setFeedback(value)
    if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current)
    feedbackTimerRef.current = window.setTimeout(() => setFeedback(''), 420)
  }

  const clearPressTimer = () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setPressing(false)
  }

  const handleShortPress = () => {
    if (editingLocked) {
      showFeedback('🔒')
      vibrate(8)
      return
    }

    if (!owned) {
      onUpdate(code, { owned: true, duplicates: 0 })
      showFeedback('✓')
      vibrate(10)
      return
    }

    onUpdate(code, { duplicates: duplicates + 1 })
    showFeedback('+1')
    vibrate(10)
  }

  const handleLongPress = () => {
    longPressTriggeredRef.current = true
    setPressing(false)

    if (editingLocked) {
      showFeedback('🔒')
      vibrate(8)
      return
    }

    if (!owned) {
      showFeedback('0')
      vibrate(12)
      return
    }

    if (duplicates > 0) {
      onUpdate(code, { duplicates: Math.max(0, duplicates - 1) })
      showFeedback('−1')
      vibrate(28)
      return
    }

    Promise.resolve(onRemove(code))
      .then(() => {
        showFeedback('−')
        vibrate(28)
      })
      .catch((error) => {
        console.error('No se pudo desactivar la figurita:', error)
        showFeedback('!')
        vibrate(18)
      })
  }

  const handlePointerDown = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return

    longPressTriggeredRef.current = false
    ignoredPressRef.current = editingLocked

    if (editingLocked) {
      showFeedback('🔒')
      vibrate(8)
      return
    }

    setPressing(true)
    timerRef.current = window.setTimeout(handleLongPress, LONG_PRESS_MS)
  }

  const handlePointerUp = () => {
    if (ignoredPressRef.current) {
      ignoredPressRef.current = false
      clearPressTimer()
      return
    }

    const wasLongPress = longPressTriggeredRef.current
    clearPressTimer()
    if (!wasLongPress) handleShortPress()
  }

  const handlePointerCancel = () => {
    ignoredPressRef.current = false
    clearPressTimer()
  }

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      handleShortPress()
    }
  }

  const irregular = isIrregularStickerCode(code)
  const stateLabel = editingLocked
    ? 'Edición bloqueada.'
    : !owned
      ? 'No obtenida. Toca para marcar como obtenida.'
      : duplicates > 0
        ? `Obtenida con ${duplicates} repetida${duplicates === 1 ? '' : 's'}. Toca para sumar y mantén 1 segundo para disminuir.`
        : 'Obtenida. Toca para agregar una repetida o mantén 1 segundo para desactivarla.'

  return (
    <div className={`sticker-item ${owned ? 'owned' : 'missing'} ${irregular ? 'irregular' : 'circular'} ${pending ? 'pending' : ''} ${editingLocked ? 'editing-locked' : ''}`}>
      <div className="sticker-token-wrap">
        <button
          type="button"
          className={`sticker-token ${pressing ? 'pressing' : ''}`}
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onPointerLeave={handlePointerCancel}
          onContextMenu={(event) => event.preventDefault()}
          onKeyDown={handleKeyDown}
          aria-disabled={editingLocked}
          aria-label={`${code}. ${stateLabel}`}
          title={`${code} · ${stateLabel}`}
        >
          <span className="sticker-number">{getStickerDisplayNumber(code)}</span>
          {pending && <span className="sticker-pending-dot" title="Sincronizando" />}
          {feedback && <span className="sticker-feedback">{feedback}</span>}
        </button>
        {duplicates > 0 && (
          <span className="sticker-duplicate-badge" aria-label={`${duplicates} repetidas`}>
            {duplicates}
          </span>
        )}
      </div>
      <span className="sticker-code-caption">{code}</span>
    </div>
  )
}

export default function StickerGrid({ stickers, onUpdate }) {
  const { editingLocked } = useEditLock()
  const { deleteSavedSticker } = useStickers()

  return (
    <div className="sticker-grid">
      {stickers.map(sticker => (
        <StickerToken
          key={sticker.code}
          sticker={sticker}
          onUpdate={onUpdate}
          onRemove={deleteSavedSticker}
          editingLocked={editingLocked}
        />
      ))}
    </div>
  )
}
