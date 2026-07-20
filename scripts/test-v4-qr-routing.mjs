import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8')

const app = read('src/App.jsx')
const tradeHub = read('src/components/TradeHub.jsx')
const runtime = read('src/qr-runtime-fixes.js')
const reader = read('src/integrations/figuritas/qrImageReader.js')
const protocol = read('src/integrations/figuritas/exportProtocol.js')

const assertions = [
  [!app.includes("import './qr-upload-reader.js'"), 'App todavía carga el lector global antiguo.'],
  [!fs.existsSync(path.join(root, 'src/qr-upload-reader.js')), 'El lector global antiguo todavía existe.'],
  [!runtime.includes("document.addEventListener('change'"), 'qr-runtime-fixes todavía intercepta la carga de imágenes.'],
  [!runtime.includes('Html5Qrcode'), 'qr-runtime-fixes todavía contiene un segundo lector QR.'],
  [!runtime.includes('processUploadedQr'), 'qr-runtime-fixes todavía procesa archivos QR.'],
  [tradeHub.indexOf('classifyFiguritasPayload(raw)') < tradeHub.indexOf('parseQrUserId(raw)'), 'TradeHub intenta validar Firebase antes de clasificar Figuritas.'],
  [tradeHub.includes("figuritasKind.type === 'trade'"), 'TradeHub no reconoce QR inicial de Figuritas.'],
  [tradeHub.includes("figuritasKind.type === 'trade-confirmation'"), 'TradeHub no distingue el QR final de Figuritas.'],
  [tradeHub.includes("figuritasKind.type === 'export'"), 'TradeHub no distingue el QR de exportación.'],
  [tradeHub.includes('scanLockedRef.current = false'), 'TradeHub no permite reintentar tras una lectura fallida.'],
  [reader.includes('context.imageSmoothingEnabled = enableSmoothing'), 'El lector no controla el suavizado.'],
  [reader.includes("smoothing: isCrop ? false : 'auto'"), 'Los recortes pequeños no usan vecino más cercano.'],
  [reader.includes("for (const mode of ['contrast', 'screen', 'threshold', 'adaptive'])"), 'Falta umbral adaptativo.'],
  [reader.includes('maximumUpscale: isCrop ? 7 : 1'), 'Falta ampliación fuerte para QR pequeños.'],
  [reader.includes('HTML5_CANDIDATE_LIMIT'), 'ZXing no prueba recortes ampliados.'],
  [reader.includes('canvasToFile('), 'No se preparan recortes para ZXing.'],
  [protocol.includes("FIGURITAS_TRADE_PREFIX = '⋋~'"), 'Prefijo inicial incorrecto.'],
  [protocol.includes('FIGURITAS_TRADE_CONFIRMATION_PREFIX'), 'Prefijo final no definido.'],
  [!reader.includes('cdnjs.cloudflare.com'), 'El lector todavía usa CDN.'],
  [!tradeHub.includes('cuenta válida de Panini 2026'), 'Sigue presente el mensaje antiguo de cuenta interna.']
]

for (const [ok, message] of assertions) {
  if (!ok) throw new Error(message)
}

console.log('VALIDACIÓN V4: lector único, clasificación externa y recortes robustos: OK')
