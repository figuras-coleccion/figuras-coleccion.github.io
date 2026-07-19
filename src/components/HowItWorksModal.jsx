const helpStyles = `
.settings-help-overlay{position:fixed;inset:0;z-index:5000;display:grid;align-items:end;background:rgba(15,23,42,.58);backdrop-filter:blur(6px)}.settings-help-sheet{width:min(100%,700px);max-height:94vh;overflow:auto;margin:0 auto;padding:12px 20px 24px;border-radius:28px 28px 0 0;background:#fff}.settings-help-handle{width:54px;height:6px;display:block;margin:2px auto 18px;border-radius:999px;background:#cbd5e1}.settings-help-sheet h2{margin:0 0 18px;text-align:center;font-size:28px}.settings-help-step{padding:10px 0 14px;border-bottom:1px solid #eef2f7}.settings-help-step p{margin:0 0 10px;color:#64748b;text-align:center;font-size:14px;font-weight:700}.settings-help-demo{display:flex;align-items:center;justify-content:center;gap:20px}.settings-help-arrow{color:#64748b;font-size:32px}.settings-sticker-example{position:relative;width:70px;height:70px;display:grid;place-items:center;border-radius:50%;font-size:24px}.settings-sticker-example.missing{background:#edf1f6;color:#64748b}.settings-sticker-example.owned{background:#748196;color:#fff}.settings-sticker-example i{position:absolute;right:-5px;top:-5px;min-width:27px;height:27px;display:grid;place-items:center;border:2px solid #fff;border-radius:999px;background:#2563eb;color:#fff;font-size:12px;font-style:normal;font-weight:900}.settings-help-notes{display:grid;gap:9px;margin-top:14px}.settings-help-notes>div{display:grid;grid-template-columns:32px 1fr;gap:8px;padding:10px 11px;border-radius:13px;background:#f8fafc}.settings-help-notes p{margin:0;color:#475569;font-size:11px;font-weight:700;line-height:1.45}.settings-help-confirm{width:100%;min-height:52px;margin-top:16px;border:0;border-radius:16px;background:#315bdc;color:#fff;font-size:15px;font-weight:900}@media(min-width:761px){.settings-help-overlay{align-items:center;padding:22px}.settings-help-sheet{border-radius:28px}}@media(max-width:520px){.settings-help-sheet h2{font-size:24px}.settings-help-step p{font-size:13px}.settings-sticker-example{width:64px;height:64px}}
`

function StickerExample({ state = 'missing', badge = '' }) {
  return <span className={`settings-sticker-example ${state}`} aria-hidden="true"><span>1</span>{badge ? <i>{badge}</i> : null}</span>
}

export default function HowItWorksModal({ onClose }) {
  return (
    <div className="settings-help-overlay" role="dialog" aria-modal="true" aria-labelledby="settings-help-title">
      <style>{helpStyles}</style>
      <div className="settings-help-sheet">
        <span className="settings-help-handle" aria-hidden="true" />
        <h2 id="settings-help-title">¿Cómo funciona?</h2>
        <div className="settings-help-step"><p>Toca una figurita para marcarla como pegada.</p><div className="settings-help-demo"><StickerExample state="missing" /><span className="settings-help-arrow">→</span><StickerExample state="owned" /></div></div>
        <div className="settings-help-step"><p>Toca nuevamente para añadir una repetida.</p><div className="settings-help-demo"><StickerExample state="owned" /><span className="settings-help-arrow">→</span><StickerExample state="owned" badge="1" /></div></div>
        <div className="settings-help-step"><p>Mantén presionado para disminuir una repetida o retirar la figurita.</p><div className="settings-help-demo"><StickerExample state="owned" badge="1" /><span className="settings-help-arrow">→</span><StickerExample state="owned" /></div></div>
        <div className="settings-help-notes"><div><span>🔒</span><p>Usa el candado superior para bloquear o habilitar la edición del álbum.</p></div><div><span>🔄</span><p>En Trueque QR ambas cuentas confirman. En Trueque manual actualizas directamente tu colección.</p></div></div>
        <button type="button" className="settings-help-confirm" onClick={onClose}>Entendido</button>
      </div>
    </div>
  )
}
