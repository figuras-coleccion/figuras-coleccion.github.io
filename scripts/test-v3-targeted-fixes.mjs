import fs from 'node:fs'
import path from 'node:path'
import { formatStickerDisplayCode } from '../src/data/albumGroups.js'

const root = process.cwd()
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8')

const stickerGrid = read('src/components/StickerGrid.jsx')
const stickerCss = read('src/v2.css')
const importModal = read('src/components/FiguritasImportModal.jsx')
const settings = read('src/components/SettingsPage.jsx')
const reader = read('src/integrations/figuritas/qrImageReader.js')

const THREE_REYES_ID = 'mundial-2026-3-reyes-705'
const PANINI_ID = 'panini-world-cup-2026'

const labelCases = [
  [formatStickerDisplayCode('E1', THREE_REYES_ID), 'E1'],
  [formatStickerDisplayCode('E66', THREE_REYES_ID), 'E66'],
  [formatStickerDisplayCode('T-1', THREE_REYES_ID), 'T-1'],
  [formatStickerDisplayCode('T-48', THREE_REYES_ID), 'T-48'],
  [formatStickerDisplayCode('A', THREE_REYES_ID), 'A'],
  [formatStickerDisplayCode('584', THREE_REYES_ID), '584'],
  [formatStickerDisplayCode('USA4', PANINI_ID), '4'],
  [formatStickerDisplayCode('FWC19', PANINI_ID), '19']
]

for (const [actual, expected] of labelCases) {
  if (actual !== expected) {
    throw new Error(`Etiqueta incorrecta: esperado ${expected}, recibido ${actual}`)
  }
}

const assertions = [
  [stickerGrid.includes('displayLengthClass'), 'StickerGrid no clasifica etiquetas largas.'],
  [stickerGrid.includes('sticker-number-long'), 'StickerGrid no aplica tamaño reducido a T-10/T-48.'],
  [stickerCss.includes('.sticker-number.sticker-number-compact'), 'Falta CSS compacto para E1-E66.'],
  [stickerCss.includes('.sticker-number.sticker-number-long'), 'Falta CSS largo para T-1-T-48.'],
  [importModal.includes('onClose, onFinish'), 'El importador no expone la acción final independiente.'],
  [importModal.includes("typeof onFinish === 'function'"), 'FINALIZAR no usa la acción final.'],
  [settings.includes("navigate('/', { replace: true })"), 'FINALIZAR no vuelve al dashboard principal.'],
  [reader.includes("import('html5-qrcode')"), 'El lector no incluye el motor ZXing local.'],
  [reader.includes('FAST_CANDIDATE_LIMIT'), 'El lector no tiene una ruta rápida de recortes.'],
  [reader.includes("for (const mode of ['contrast', 'screen', 'threshold', 'adaptive'])"), 'Faltan variantes para fotos de pantalla.'],
  [reader.includes('paddingRatio: isCrop ? (enhanced ? 0.14 : 0.105) : 0'), 'Falta borde blanco adicional alrededor del QR.'],
  [reader.includes('Promise.race([scanPromise, timeoutPromise])'), 'El motor alternativo no tiene límite de tiempo.'],
  [!reader.includes('cdnjs.cloudflare.com'), 'El lector todavía depende de CDN.']
]

for (const [ok, message] of assertions) {
  if (!ok) throw new Error(message)
}

console.log('VALIDACIÓN V3: etiquetas E/T, dashboard y lector robusto: OK')
