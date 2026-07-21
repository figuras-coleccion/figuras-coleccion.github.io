import { useEffect, useRef, useState } from 'react'
import { getStickerDisplayNumber, isIrregularStickerCode } from '../data/albumGroups'
import { useEditLock } from '../context/EditLockContext'
import { useStickers } from '../context/StickersContext'

const LONG_PRESS_MS = 1000
const POST_REDUCTION_LOCK_MS = 500
const REDUCTION_ANIMATION_MS = 880

let gridInteractionLockedUntil = 0

const interactionStyles = `
  .sticker-reduction-floating{
    position:fixed;
    z-index:99999;
    width:62px;
    height:62px;
    display:grid;
    place-items:center;
    pointer-events:none;
    transform:translate(-50%,-50%);
    color:#fff;
    font-size:22px;
    font-weight:950;
    text-shadow:0 2px 8px rgba(15,23,42,.35);
    animation:stickerReductionFloat ${REDUCTION_ANIMATION_MS}ms ease-out forwards
  }
  .sticker-reduction-floating::before{
    content:'';
    position:absolute;
    inset:8px;
    border-radius:50%;
    background:rgba(239,68,68,.92);
    box-shadow:0 0 0 0 rgba(239,68,68,.38);
    animation:stickerReductionPulse ${REDUCTION_ANIMATION_MS}ms ease-out forwards
  }
  .sticker-reduction-floating span{
    position:relative;
    z-index:1
  }
  @keyframes stickerReductionFloat{
    0%{opacity:0;transform:translate(-50%,-34%) scale(.72)}
    18%{opacity:1;transform:translate(-50%,-50%) scale(1.08)}
    58%{opacity:1;transform:translate(-50%,-72%) scale(1)}
    100%{opacity:0;transform:translate(-50%,-112%) scale(.9)}
  }
  @keyframes stickerReductionPulse{
    0%{transform:scale(.65);box-shadow:0 0 0 0 rgba(239,68,68,.42)}
    42%{transform:scale(1);box-shadow:0 0 0 12px rgba(239,68,68,.12)}
    100%{transform:scale(.9);box-shadow:0 0 0 22px rgba(239,68,68,0)}
  }
`

function isGridInteractionLocked() {
  return Date.now() < gridInteractionLockedUntil
}

function lockGridInteraction(duration = POST_REDUCTION_LOCK_MS) {
  gridInteractionLockedUntil = Math.max(
    gridInteractionLockedUntil,
    Date.now() + duration
  )
}

function vibrate(pattern = 12) {
  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.vibrate === 'function'
  ) {
    navigator.vibrate(pattern)
  }
}

function showFloatingReductionFeedback(target) {
  if (typeof document === 'undefined' || !target?.getBoundingClientRect) return

  const rect = target.getBoundingClientRect()
  const feedback = document.createElement('div')
  feedback.className = 'sticker-reduction-floating'
  feedback.style.left = `${rect.left + (rect.width / 2)}px`
  feedback.style.top = `${rect.top + (rect.height / 2)}px`
  feedback.setAttribute('aria-hidden', 'true')

  const label = document.createElement('span')
  label.textContent = '−1'
  feedback.appendChild(label)
  document.body.appendChild(feedback)

  window.setTimeout(() => feedback.remove(), REDUCTION_ANIMATION_MS + 120)
}

function StickerToken({ sticker, onUpdate, onRemove, editingLocked }) {
  const { code, owned, duplicates, pending } = sticker
  const timerRef = useRef(null)
  const feedbackTimerRef = useRef(null)
  const activePointerIdRef = useRef(null)
  const pressTargetRef = useRef(null)
  const longPressTriggeredRef = useRef(false)
  const ignoredPressRef = useRef(false)
  const [pressing, setPressing] = useState(false)
  const [feedback, setFeedback] = useState('')

  useEffect(() => () => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current)
  }, [])

  const showFeedback = (value, duration = 620) => {
    setFeedback(value)
    if (feedbackTimerRef.current) window.clearTimeout(feedbackTimerRef.current)
    feedbackTimerRef.current = window.setTimeout(() => setFeedback(''), duration)
  }

  const clearPressTimer = () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setPressing(false)
  }

  const resetPointer = (event = null) => {
    if (
      event?.currentTarget?.hasPointerCapture?.(event.pointerId)
    ) {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId)
      } catch {
        // El navegador puede liberar la captura al desmontar una figurita.
      }
    }

    activePointerIdRef.current = null
    pressTargetRef.current = null
  }

  const handleShortPress = () => {
    if (editingLocked) {
      showFeedback('🔒')
      vibrate(8)
      return
    }

    if (isGridInteractionLocked()) {
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
      lockGridInteraction()
      showFloatingReductionFeedback(pressTargetRef.current)
      showFeedback('−1', REDUCTION_ANIMATION_MS)
      vibrate([0, 42, 28, 16])
      onUpdate(code, { duplicates: Math.max(0, duplicates - 1) })
      return
    }

    lockGridInteraction(POST_REDUCTION_LOCK_MS)
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
    ignoredPressRef.current = editingLocked || isGridInteractionLocked()
    activePointerIdRef.current = event.pointerId
    pressTargetRef.current = event.currentTarget

    if (ignoredPressRef.current) {
      if (editingLocked) {
        showFeedback('🔒')
        vibrate(8)
      }
      return
    }

    try {
      event.currentTarget.setPointerCapture?.(event.pointerId)
    } catch {
      // La captura es una mejora; el gesto sigue funcionando sin ella.
    }

    setPressing(true)
    timerRef.current = window.setTimeout(handleLongPress, LONG_PRESS_MS)
  }

  const handlePointerUp = (event) => {
    if (activePointerIdRef.current !== event.pointerId) return

    const ignored = ignoredPressRef.current
    const wasLongPress = longPressTriggeredRef.current

    ignoredPressRef.current = false
    clearPressTimer()
    resetPointer(event)

    if (ignored || wasLongPress || isGridInteractionLocked()) return
    handleShortPress()
  }

  const handlePointerCancel = (event) => {
    if (
      activePointerIdRef.current !== null &&
      activePointerIdRef.current !== event.pointerId
    ) return

    ignoredPressRef.current = false
    clearPressTimer()
    resetPointer(event)
  }

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      if (!isGridInteractionLocked()) handleShortPress()
    }
  }

  const irregular = isIrregularStickerCode(code)
  const displayNumber = getStickerDisplayNumber(code)
  const displayLengthClass = displayNumber.length >= 4
    ? 'sticker-number-long'
    : displayNumber.length >= 3
      ? 'sticker-number-compact'
      : ''
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
          className="sticker-token"
          onPointerDown={handlePointerDown}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
          onPointerLeave={(event) => {
            if (event.pointerType === 'mouse') handlePointerCancel(event)
          }}
          onLostPointerCapture={handlePointerCancel}
          onContextMenu={(event) => event.preventDefault()}
          onKeyDown={handleKeyDown}
          aria-disabled={editingLocked}
          aria-label={`${code}. ${stateLabel}`}
          title={`${code} · ${stateLabel}`}
        >
          <span className={`sticker-number ${displayLengthClass}`.trim()}>{displayNumber}</span>
          {pending && <span className="sticker-pending-dot" title="Sincronizando" />}
          {feedback && <span className="sticker-feedback">{feedback}</span>}
        </button>
        {duplicates > 0 && (
          <span className="sticker-duplicate-badge" aria-label={`${duplicates} repetidas`}>
            {duplicates}
          </span>
        )}
      </div>
    </div>
  )
}

export default function StickerGrid({ stickers, onUpdate }) {
  const { editingLocked } = useEditLock()
  const { deleteSavedSticker } = useStickers()

  return (
    <>
      <style>{interactionStyles}</style>
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
    </>
  )
}