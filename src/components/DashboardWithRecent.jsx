import { useEffect, useState } from 'react'
import Dashboard from './Dashboard'

const radarLabels = ['Álbum', 'Especiales', 'Trueques', 'Selecciones', 'Equilibrio']

const radarHelp = [
  { icon: '📘', label: 'Álbum', text: 'Cuánto del álbum completo ya pegaste.' },
  { icon: '⭐', label: 'Especiales', text: 'Cuántas figuritas especiales FWC ya tienes.' },
  { icon: '🔁', label: 'Trueques', text: 'Qué parte de tus repetidas ya entregaste en trueques confirmados.' },
  { icon: '🌍', label: 'Selecciones', text: 'Cuántas selecciones están muy avanzadas: al menos al 75%.' },
  { icon: '⚖️', label: 'Equilibrio', text: 'Qué tan parejo avanzas. Baja si unas selecciones están completas y otras muy atrasadas.' }
]

export default function DashboardWithRecent() {
  const [showRadarHelp, setShowRadarHelp] = useState(false)

  useEffect(() => {
    const applyLabels = () => {
      const card = document.querySelector('.collector-academy-card')
      if (!card) return

      const heading = card.querySelector('.dashboard-card-heading h3')
      if (heading && heading.textContent !== '📈 Tu colección en 5 datos') {
        heading.textContent = '📈 Tu colección en 5 datos'
      }

      card.querySelectorAll('.collector-radar-label').forEach((label, index) => {
        if (radarLabels[index] && label.textContent !== radarLabels[index]) {
          label.textContent = radarLabels[index]
        }
      })

      const info = card.querySelector('.dashboard-info-dot')
      if (info) {
        info.removeAttribute('title')
        info.setAttribute('role', 'button')
        info.setAttribute('tabindex', '0')
        info.setAttribute('aria-label', 'Explicar los cinco datos del gráfico')
        info.classList.add('radar-help-ready')
        info.onclick = () => setShowRadarHelp(true)
        info.onkeydown = event => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            setShowRadarHelp(true)
          }
        }
      }
    }

    applyLabels()
    const observer = new MutationObserver(applyLabels)
    observer.observe(document.body, { childList: true, subtree: true, characterData: true })
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!showRadarHelp) return undefined
    const previousOverflow = document.body.style.overflow
    const closeOnEscape = event => {
      if (event.key === 'Escape') setShowRadarHelp(false)
    }
    document.body.style.overflow = 'hidden'
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [showRadarHelp])

  return (
    <div className="dashboard-with-recent">
      <Dashboard />
      <footer className="dashboard-footer-note dashboard-footer-recent">
        Creado por un padre para su hijo <span>·</span> © 2026 <span>·</span> Perú 🇵🇪
      </footer>

      {showRadarHelp && (
        <div className="radar-help-overlay" onClick={() => setShowRadarHelp(false)} role="presentation">
          <section
            className="radar-help-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="radar-help-title"
            onClick={event => event.stopPropagation()}
          >
            <button type="button" className="radar-help-close" aria-label="Cerrar" onClick={() => setShowRadarHelp(false)}>×</button>
            <h3 id="radar-help-title">¿Qué significa este gráfico?</h3>
            <p className="radar-help-intro">Cada punta muestra una parte de tu colección. Mientras más cerca esté del borde, mejor vas.</p>
            <div className="radar-help-list">
              {radarHelp.map(item => (
                <div key={item.label} className="radar-help-item">
                  <span>{item.icon}</span>
                  <div>
                    <strong>{item.label}</strong>
                    <p>{item.text}</p>
                  </div>
                </div>
              ))}
            </div>
            <button type="button" className="radar-help-ok" onClick={() => setShowRadarHelp(false)}>Entendido</button>
          </section>
        </div>
      )}
    </div>
  )
}
