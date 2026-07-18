import { useEffect } from 'react'
import VisualMissingReportPage from './VisualMissingReportPage'

export default function VisualMissingReportSafe() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const printMode = params.get('print') === '1'
    const requestedOrder = params.get('order') === 'alphabetical' ? 'alphabetical' : 'album'

    if (printMode) {
      if (window.__paniniPrintStarted) return undefined
      window.__paniniPrintStarted = true

      const selector = requestedOrder === 'alphabetical'
        ? '.visual-report-order-switch button:nth-child(2)'
        : '.visual-report-order-switch button:nth-child(1)'

      const runPrint = async () => {
        const orderButton = document.querySelector(selector)
        if (orderButton && !orderButton.classList.contains('active')) orderButton.click()

        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))
        await (document.fonts?.ready || Promise.resolve())
        window.print()
      }

      const returnToReport = () => window.history.back()
      window.addEventListener('afterprint', returnToReport, { once: true })
      void runPrint()

      return () => window.removeEventListener('afterprint', returnToReport)
    }

    const handlePrint = event => {
      const button = event.target.closest('.visual-report-page .visual-report-action-group .btn-primary')
      if (!button || !button.textContent.includes('Imprimir')) return

      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()

      const active = document.querySelector('.visual-report-order-switch button.active')
      const order = active?.textContent?.includes('Alfabético') ? 'alphabetical' : 'album'
      const url = new URL(window.location.href)
      url.searchParams.set('print', '1')
      url.searchParams.set('order', order)
      url.searchParams.set('run', String(Date.now()))
      window.location.assign(url.toString())
    }

    document.addEventListener('click', handlePrint, true)
    return () => document.removeEventListener('click', handlePrint, true)
  }, [])

  return <VisualMissingReportPage />
}
