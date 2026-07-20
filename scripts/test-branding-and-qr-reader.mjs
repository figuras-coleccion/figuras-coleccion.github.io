import fs from 'node:fs'

function read(path) {
  if (!fs.existsSync(path)) throw new Error(`No existe ${path}`)
  return fs.readFileSync(path, 'utf8')
}

const register = read('src/components/Register.jsx')
const index = read('index.html')
const reader = read('src/integrations/figuritas/qrImageReader.js')
const protocol = read('src/integrations/figuritas/exportProtocol.js')
const modal = read('src/components/FiguritasImportModal.jsx')
const tradeHub = read('src/components/TradeHub.jsx')

const required = [
  [register, '⚽ FIGURAS COLECCIÓN', 'marca general del login'],
  [register, 'Todos tus álbumes en un solo lugar', 'subtítulo general'],
  [register, 'Ingresar con Google', 'acceso único con Google'],
  [index, '<title>Figuras Colección</title>', 'título del navegador'],
  [tradeHub, 'html5-qrcode/2.3.8/html5-qrcode.min.js', 'motor de Trueque QR'],
  [tradeHub, 'fileScanner.scanFile(file, false)', 'lectura completa con Html5Qrcode'],
  [reader, 'buildCandidateCrops', 'recortes automáticos'],
  [reader, 'MAX_CANDIDATES = 30', 'barrido de regiones'],
  [protocol, "FIGURITAS_TRADE_PREFIX = '⋋~'", 'detección del QR de intercambio'],
  [protocol, "LEGACY_TRADE_PREFIX = '站救'", 'compatibilidad con QR legacy'],
  [protocol, 'encodeFiguritasTradeConfirmationPayload', 'generación del QR final de intercambio'],
  [protocol, 'Este es el QR de intercambio de Figuritas', 'mensaje correcto para QR equivocado'],
  [modal, 'recortes automáticos', 'estado visual del lector mejorado']
]

for (const [content, signature, label] of required) {
  if (!content.includes(signature)) throw new Error(`Falta ${label}: ${signature}`)
}

const forbidden = [
  'Panini World Cup 2026 Sticker Tracker',
  'Esta cuenta de Google todavía no está registrada'
]
for (const signature of forbidden) {
  if (register.includes(signature)) throw new Error(`Sigue presente texto antiguo: ${signature}`)
}

console.log('Validación estática correcta: marca general y lector QR robusto.')
