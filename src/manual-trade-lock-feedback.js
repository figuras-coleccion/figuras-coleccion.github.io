const feedbackTimers = new WeakMap()

function vibrateLocked() {
  if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
    navigator.vibrate(8)
  }
}

function showLockedFeedback(item) {
  const wrap = item?.querySelector('.trade-sticker-wrap')
  if (!wrap) return

  let feedback = wrap.querySelector('.manual-trade-lock-feedback')
  if (!feedback) {
    feedback = document.createElement('span')
    feedback.className = 'manual-trade-lock-feedback'
    feedback.setAttribute('aria-hidden', 'true')
    feedback.textContent = '🔒'
    wrap.appendChild(feedback)
  }

  const previousTimer = feedbackTimers.get(item)
  if (previousTimer) window.clearTimeout(previousTimer)

  feedback.classList.remove('show')
  void feedback.offsetWidth
  feedback.classList.add('show')
  vibrateLocked()

  const timer = window.setTimeout(() => {
    feedback.classList.remove('show')
    feedbackTimers.delete(item)
  }, 430)
  feedbackTimers.set(item, timer)
}

function lockedTradeItemFrom(target) {
  return target?.closest?.('.manual-trade-page .manual-trade-panel .trade-sticker-item.editing-locked') || null
}

document.addEventListener('pointerdown', event => {
  const item = lockedTradeItemFrom(event.target)
  if (!item) return
  showLockedFeedback(item)
}, true)

document.addEventListener('keydown', event => {
  if (event.key !== 'Enter' && event.key !== ' ') return
  const item = lockedTradeItemFrom(event.target)
  if (!item) return
  event.preventDefault()
  showLockedFeedback(item)
}, true)
