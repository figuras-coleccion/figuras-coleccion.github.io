const PAYPAL_DONATION_URL = 'https://www.paypal.com/donate/?hosted_button_id=AULY2CSRXCBW2'
const MERCADO_PAGO_URL = 'https://link.mercadopago.com.pe/figurascoleccion'

const donationStyles = `
.donation-overlay{position:fixed;inset:0;z-index:5400;display:grid;align-items:end;background:rgba(15,23,42,.62);backdrop-filter:blur(6px)}.donation-sheet{position:relative;width:min(100%,620px);max-height:94vh;overflow:auto;margin:0 auto;padding:12px 20px 24px;border-radius:28px 28px 0 0;background:#fff;box-shadow:0 28px 80px rgba(15,23,42,.34)}.donation-handle{width:54px;height:6px;display:block;margin:2px auto 14px;border-radius:999px;background:#cbd5e1}.donation-close{position:absolute;right:15px;top:13px;width:38px;height:38px;display:grid;place-items:center;border:0;border-radius:50%;background:#f1f5f9;color:#475569;font-size:25px}.donation-heading{text-align:center}.donation-heart{width:62px;height:62px;display:grid;place-items:center;margin:0 auto 11px;border-radius:50%;background:#eef4ff;font-size:30px}.donation-heading h2{margin:0;color:#0f172a;font-size:26px}.donation-heading p{max-width:480px;margin:9px auto 0;color:#64748b;font-size:12px;font-weight:700;line-height:1.55}.donation-options{display:grid;grid-template-columns:1fr 1fr;gap:13px;margin-top:18px}.donation-option{display:flex;flex-direction:column;align-items:center;padding:16px;border:1px solid #e2e8f0;border-radius:20px;background:#f8fafc;text-align:center}.donation-option h3{margin:0;color:#0f172a;font-size:17px}.donation-option p{margin:6px 0 12px;color:#64748b;font-size:10px;font-weight:700;line-height:1.45}.donation-qr{width:144px;height:144px;padding:8px;border:1px solid #dbe4f0;border-radius:16px;background:#fff;object-fit:contain}.donation-button{width:100%;min-height:48px;display:flex;align-items:center;justify-content:center;margin-top:auto;border:0;border-radius:14px;color:#fff;text-decoration:none;font-size:13px;font-weight:900}.donation-button.paypal{margin-top:13px;background:#173b7a}.donation-button.mercadopago{background:#009ee3}.donation-security{margin:14px 0 0;padding:10px 12px;border-radius:13px;background:#f8fafc;color:#64748b;text-align:center;font-size:10px;font-weight:700;line-height:1.45}@media(min-width:761px){.donation-overlay{align-items:center;padding:22px}.donation-sheet{border-radius:28px}}@media(max-width:560px){.donation-options{grid-template-columns:1fr}.donation-option{padding:14px}.donation-qr{width:132px;height:132px}.donation-heading h2{font-size:23px}}
`

export default function DonationModal({ onClose }) {
  const qrSrc = `${import.meta.env.BASE_URL || '/'}paypal-donation-qr.png`

  return (
    <div className="donation-overlay" role="presentation" onClick={onClose}>
      <style>{donationStyles}</style>
      <section className="donation-sheet" role="dialog" aria-modal="true" aria-labelledby="donation-title" onClick={event => event.stopPropagation()}>
        <span className="donation-handle" aria-hidden="true" />
        <button type="button" className="donation-close" onClick={onClose} aria-label="Cerrar">×</button>

        <header className="donation-heading">
          <div className="donation-heart" aria-hidden="true">💙</div>
          <h2 id="donation-title">Realizar donación</h2>
          <p>Ayúdanos a mantener este servicio libre y sin publicidad, llegar a más personas e implementar nuevos álbumes.</p>
        </header>

        <div className="donation-options">
          <article className="donation-option">
            <h3>PayPal</h3>
            <p>Escanea el QR desde otro dispositivo o abre el enlace directo desde tu celular.</p>
            <img className="donation-qr" src={qrSrc} alt="Código QR para donar mediante PayPal" />
            <a className="donation-button paypal" href={PAYPAL_DONATION_URL} target="_blank" rel="noopener noreferrer">Donar con PayPal ↗</a>
          </article>

          <article className="donation-option">
            <h3>Yape / Mercado Pago</h3>
            <p>Abre el enlace de Mercado Pago y completa el aporte con el medio de pago disponible.</p>
            <div className="donation-heart" aria-hidden="true">📱</div>
            <a className="donation-button mercadopago" href={MERCADO_PAGO_URL} target="_blank" rel="noopener noreferrer">Donar con Yape o Mercado Pago ↗</a>
          </article>
        </div>

        <p className="donation-security">El pago se procesa fuera de Figuras Colección mediante PayPal o Mercado Pago. La aplicación no recibe ni almacena los datos de tu tarjeta o cuenta.</p>
      </section>
    </div>
  )
}
