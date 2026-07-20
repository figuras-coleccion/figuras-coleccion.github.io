import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8')

const panini = read('src/albums/panini-world-cup-2026/catalog.js')
const reyes = read('src/albums/mundial-2026-3-reyes-705/catalog.js')
const register = read('src/components/Register.jsx')
const importModal = read('src/components/FiguritasImportModal.jsx')
const tradeModal = read('src/components/FiguritasTradeModal.jsx')
const tradeHub = read('src/components/TradeHub.jsx')
const app = read('src/App.jsx')
const protocol = read('src/integrations/figuritas/exportProtocol.js')

const assertions = [
  [panini.includes("brandTitleLines: ['WORLD CUP 2026', 'PANINI']"), 'Panini no tiene dos líneas explícitas.'],
  [reyes.includes("brandTitleLines: ['MUNDIAL 2026', '3 REYES']"), '3 Reyes no tiene dos líneas explícitas.'],
  [register.includes('<span>⚽ FIGURAS</span>') && register.includes('<span>COLECCIÓN</span>'), 'La marca general no está en dos líneas.'],
  [!importModal.includes('window.location.assign'), 'El importador todavía recarga o navega con window.location.assign.'],
  [importModal.includes('replaceStickersFromExternalImport'), 'El importador no refresca el contexto React.'],
  [importModal.includes('overflow-wrap:anywhere'), 'Falta la protección responsive del texto de confirmación.'],
  [tradeModal.includes('TRUEQUE REALIZADO CORRECTAMENTE'), 'Falta el mensaje normal de trueque completado.'],
  [tradeModal.includes('FINALIZAR'), 'Falta el único botón FINALIZAR.'],
  [!tradeModal.includes('Copiar código') && !tradeModal.includes('<textarea'), 'El modal final conserva controles no solicitados.'],
  [tradeModal.includes('hostDeliversCodes: receivedCodes'), 'La orientación del bloque 1 no corresponde a lo que entregó el anfitrión.'],
  [tradeModal.includes('hostReceivesCodes: deliveredCodes'), 'La orientación del bloque 2 no corresponde a lo que recibió el anfitrión.'],
  [tradeHub.includes('classifyFiguritasPayload'), 'Trueque QR no detecta el protocolo Figuritas.'],
  [tradeHub.includes('decodeQrFromImageFile'), 'Trueque QR no usa el lector robusto de capturas.'],
  [app.includes('`${LEGACY_ALBUM_PATH}/*`'), 'Falta redirección controlada para /album/*.'],
  [protocol.includes('allowShort: true'), 'El protocolo no admite máscaras de 123 a 124 bytes.']
]

for (const [ok, message] of assertions) {
  if (!ok) throw new Error(message)
}

const sourceFiles = []
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name)
    if (entry.isDirectory()) walk(full)
    else if (/\.(js|jsx|html|json)$/.test(entry.name)) sourceFiles.push(full)
  }
}
walk(path.join(root, 'src'))

const forbiddenOperationalAlbum = []
for (const file of sourceFiles) {
  const relative = path.relative(root, file)
  const content = fs.readFileSync(file, 'utf8')
  const lines = content.split(/\r?\n/)
  lines.forEach((line, index) => {
    if (/['"`]\/album(?:\/|\?|['"`])/.test(line)) {
      const allowedLegacyRedirect =
        relative === path.normalize('src/appRoutes.js') ||
        relative === path.normalize('src/App.jsx')
      if (!allowedLegacyRedirect) {
        forbiddenOperationalAlbum.push(`${relative}:${index + 1}: ${line.trim()}`)
      }
    }
  })
}
if (forbiddenOperationalAlbum.length) {
  throw new Error(`Persisten rutas operativas /album:\n${forbiddenOperationalAlbum.join('\n')}`)
}

const sourceText = sourceFiles.map(file => fs.readFileSync(file, 'utf8')).join('\n')
if (sourceText.includes('api.qrserver.com')) {
  throw new Error('Persisten QR generados por un servicio externo.')
}
if (sourceText.includes('cdnjs.cloudflare.com')) {
  throw new Error('Persisten lectores QR cargados desde CDN.')
}

console.log('VALIDACIÓN ESTÁTICA DE CORRECCIONES: OK')
