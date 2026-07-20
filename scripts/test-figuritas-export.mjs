import { paniniCatalog } from '../src/albums/panini-world-cup-2026/catalog.js'
import {
  classifyFiguritasPayload,
  decodeFiguritasExportPayload,
  decodeFiguritasTradePayload,
  decodeFiguritasTradeConfirmationPayload,
  encodeFiguritasTradeConfirmationPayload
} from '../src/integrations/figuritas/exportProtocol.js'

if (!globalThis.atob) {
  globalThis.atob = value => Buffer.from(value, 'base64').toString('binary')
}
if (!globalThis.btoa) {
  globalThis.btoa = value => Buffer.from(value, 'binary').toString('base64')
}

const exportSample = "站疑H4sIAAAAAAAAE2NgYGHABhghlEaLEgODAgMDAzuYq8jEwODIwAGRU2BgUGBhEIDpYGKDsRpgjA4wCVcBkmFkYGKAGcAAAJx28op9AAAA;H4sIAAAAAAAAEwXBIQ7CQBBA0T/LbDskiFENqdoWg+YEC3UoBBqFRvQEQ4JAEY7ECTgDR+G99DLoB2P5bCHuxjZ/vhiFIHUOF9yARBUQVlRlkfg1bG4CR5Bybgowa0TUlqt6Z9Nu0oNleh5+MobMyFr24FCc8a3wB+76Kzh9AAAA;H4sIAAAAAAAAE2NhZkIHzAiSGcZDlkHw4NLMmKbgBxjqWZgRUswAygy1qJUAAAA="
const decodedExport = await decodeFiguritasExportPayload(
  exportSample,
  paniniCatalog.allStickersOrdered
)

const exportExpected = {
  total: 994,
  owned: 961,
  missingCount: 33,
  repeatedStickerCount: 149,
  totalDuplicates: 168
}

for (const [key, value] of Object.entries(exportExpected)) {
  if (decodedExport[key] !== value) {
    throw new Error(`Exportación ${key}: esperado ${value}, recibido ${decodedExport[key]}`)
  }
}

const initialTradeSample = "⋋~H4sIAAAAAAAAA2tgMGDQYTzA4LGQgYHRgQEKHFQZpZJZwUwlRjAlcUhBgUOlgYOBQaXgmIIAWIyRoYH9o5sEIx+jksOUhqkxUxgmOZ1kYghjYGAQYFFgcJgwwYhZgc3CgYFhwaoAsA77CJPFRQyO4mAOAE0P6/57AAAA;H4sIAAAAAAAAAxXEMQrCQBBA0b/DoBMMsgHTxxQW9oLlJFgINnoEb5LoFik8RAQr7yF4D29hJb7i6QNnIRaYTC17di8Jg3yU2zld8mH1Tfm23MzpQVrp3ct109npqlQKh3okSheJleyocc8YqfBCM45qhH00YmjaolZbcgewf/5Osx9fIR+bewAAAA=="
const initialKind = classifyFiguritasPayload(initialTradeSample)
if (initialKind.type !== 'trade') {
  throw new Error(`El QR inicial fue clasificado como ${initialKind.type}`)
}

const decodedInitial = await decodeFiguritasTradePayload(
  initialTradeSample,
  paniniCatalog.allStickersOrdered
)

if (!decodedInitial.hostMissing.includes('TUR10')) {
  throw new Error('El QR inicial no detectó TUR10 entre las faltantes del anfitrión.')
}
if (!decodedInitial.hostRepeated.includes('USA4')) {
  throw new Error('El QR inicial no detectó USA4 entre las repetidas del anfitrión.')
}

const usa4Index = paniniCatalog.allStickersOrdered.indexOf('USA4')
const tur10Index = paniniCatalog.allStickersOrdered.indexOf('TUR10')
if (usa4Index !== 263) throw new Error(`USA4 debe estar en índice base cero 263 y está en ${usa4Index}.`)
if (tur10Index !== 329) throw new Error(`TUR10 debe estar en índice base cero 329 y está en ${tur10Index}.`)

const realFinalSample = ";⋋~H4sIAAAAAAAAE2NgwA8aCMhTBAAQ5hQ+fQAAAA==;H4sIAAAAAAAAE2NgIBIwEauQBAAANjWmb30AAAA="
const finalKind = classifyFiguritasPayload(realFinalSample)
if (finalKind.type !== 'trade-confirmation') {
  throw new Error(`El QR final fue clasificado como ${finalKind.type}`)
}

const decodedRealFinal = await decodeFiguritasTradeConfirmationPayload(
  realFinalSample,
  paniniCatalog.allStickersOrdered
)

if (decodedRealFinal.hostDelivers.join(',') !== 'USA4') {
  throw new Error(`Bloque 1 final inválido: ${decodedRealFinal.hostDelivers.join(',')}`)
}
if (decodedRealFinal.hostReceives.join(',') !== 'TUR10') {
  throw new Error(`Bloque 2 final inválido: ${decodedRealFinal.hostReceives.join(',')}`)
}

if ('CompressionStream' in globalThis) {
  const generated = await encodeFiguritasTradeConfirmationPayload({
    hostDeliversCodes: ['USA4'],
    hostReceivesCodes: ['TUR10']
  }, paniniCatalog.allStickersOrdered)

  if (!generated.startsWith(';⋋~')) {
    throw new Error('El QR final generado no conserva el punto y coma inicial.')
  }

  const roundTrip = await decodeFiguritasTradeConfirmationPayload(
    generated,
    paniniCatalog.allStickersOrdered
  )

  if (roundTrip.hostDelivers.join(',') !== 'USA4') {
    throw new Error(`Round trip bloque 1 inválido: ${roundTrip.hostDelivers.join(',')}`)
  }
  if (roundTrip.hostReceives.join(',') !== 'TUR10') {
    throw new Error(`Round trip bloque 2 inválido: ${roundTrip.hostReceives.join(',')}`)
  }
}

let rejectedFinalAsInitial = false
try {
  await decodeFiguritasTradePayload(realFinalSample, paniniCatalog.allStickersOrdered)
} catch (error) {
  rejectedFinalAsInitial = /QR final/.test(String(error?.message || ''))
}
if (!rejectedFinalAsInitial) {
  throw new Error('El lector inicial debe rechazar el QR final con un mensaje específico.')
}

console.log('PROTOCOLO FIGURITAS VERIFICADO')
console.log(JSON.stringify({
  export: exportExpected,
  initial: {
    hostMissingIncludes: 'TUR10',
    hostRepeatedIncludes: 'USA4',
    supports123ByteMasks: true
  },
  final: {
    block1HostDelivers: decodedRealFinal.hostDelivers,
    block2HostReceives: decodedRealFinal.hostReceives
  }
}, null, 2))
