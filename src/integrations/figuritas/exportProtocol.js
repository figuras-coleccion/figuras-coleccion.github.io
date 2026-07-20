export const FIGURITAS_EXPORT_PREFIX = '站疑'
export const FIGURITAS_TRADE_PREFIX = '站救'
export const FIGURITAS_EXPORT_BLOCKS = 3
export const FIGURITAS_MASK_BYTES = 125
export const PANINI_EXPORT_STICKER_COUNT = 994
export const FIGURITAS_PROTOCOL_VERSION = 1

const PAKO_SCRIPT = 'https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js'
let pakoPromise = null

function normalizeBase64(value) {
  const compact = String(value || '')
    .replace(/\s+/g, '')
    .replace(/-/g, '+')
    .replace(/_/g, '/')

  if (!compact) throw new Error('El QR contiene un bloque vacío.')

  const padding = compact.length % 4
  return padding === 0 ? compact : compact.padEnd(compact.length + (4 - padding), '=')
}

function base64ToBytes(value) {
  const normalized = normalizeBase64(value)

  let binary = ''
  try {
    binary = atob(normalized)
  } catch {
    throw new Error('El QR contiene datos Base64 inválidos.')
  }

  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function loadPakoFallback() {
  if (globalThis.pako?.ungzip) return Promise.resolve(globalThis.pako)
  if (pakoPromise) return pakoPromise

  pakoPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${PAKO_SCRIPT}"]`)
    if (existing) {
      existing.addEventListener('load', () => resolve(globalThis.pako), { once: true })
      existing.addEventListener('error', () => reject(new Error('No se pudo cargar el descompresor GZIP.')), { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = PAKO_SCRIPT
    script.async = true
    script.crossOrigin = 'anonymous'
    script.onload = () => resolve(globalThis.pako)
    script.onerror = () => reject(new Error('No se pudo cargar el descompresor GZIP.'))
    document.head.appendChild(script)
  })

  return pakoPromise
}

async function gunzipBytes(bytes) {
  if ('DecompressionStream' in globalThis) {
    const stream = new Blob([bytes])
      .stream()
      .pipeThrough(new DecompressionStream('gzip'))
    return new Uint8Array(await new Response(stream).arrayBuffer())
  }

  if (typeof document !== 'undefined') {
    const pako = await loadPakoFallback()
    if (pako?.ungzip) return pako.ungzip(bytes)
  }

  throw new Error('Este navegador no permite descomprimir el QR GZIP.')
}

async function inflateGzipBlock(value, label) {
  try {
    return await gunzipBytes(base64ToBytes(value))
  } catch (error) {
    console.error(`No se pudo descomprimir ${label}:`, error)
    throw new Error(`No se pudo descomprimir el bloque de ${label}.`)
  }
}

function assertMaskLength(bytes, label) {
  if (!(bytes instanceof Uint8Array) || bytes.length !== FIGURITAS_MASK_BYTES) {
    throw new Error(
      `El bloque de ${label} debe contener ${FIGURITAS_MASK_BYTES} bytes y contiene ${bytes?.length ?? 0}.`
    )
  }
}

function readEnabledIndices(bytes, maximumIndex = PANINI_EXPORT_STICKER_COUNT) {
  const indices = []

  for (let absoluteIndex = 1; absoluteIndex <= maximumIndex; absoluteIndex += 1) {
    const zeroBased = absoluteIndex - 1
    const byteIndex = Math.floor(zeroBased / 8)
    const bitIndex = zeroBased % 8

    if ((bytes[byteIndex] & (1 << bitIndex)) !== 0) {
      indices.push(absoluteIndex)
    }
  }

  return indices
}

function getUnexpectedTrailingIndices(bytes) {
  const unexpected = []

  for (let absoluteIndex = PANINI_EXPORT_STICKER_COUNT + 1; absoluteIndex <= FIGURITAS_MASK_BYTES * 8; absoluteIndex += 1) {
    const zeroBased = absoluteIndex - 1
    const byteIndex = Math.floor(zeroBased / 8)
    const bitIndex = zeroBased % 8

    if ((bytes[byteIndex] & (1 << bitIndex)) !== 0) {
      unexpected.push(absoluteIndex)
    }
  }

  return unexpected
}

function validateOrderedCodes(orderedCodes) {
  if (!Array.isArray(orderedCodes) || orderedCodes.length !== PANINI_EXPORT_STICKER_COUNT) {
    throw new Error(
      `El catálogo Panini debe contener exactamente ${PANINI_EXPORT_STICKER_COUNT} posiciones.`
    )
  }

  const normalized = orderedCodes.map(code => String(code || '').trim().toUpperCase())
  if (normalized.some(code => !code)) {
    throw new Error('El catálogo Panini contiene códigos vacíos.')
  }

  if (new Set(normalized).size !== PANINI_EXPORT_STICKER_COUNT) {
    throw new Error('El catálogo Panini contiene códigos duplicados.')
  }

  return normalized
}

export function isFiguritasExportPayload(value) {
  return String(value || '').trim().startsWith(FIGURITAS_EXPORT_PREFIX)
}

export async function decodeFiguritasExportPayload(value, orderedCodes) {
  const raw = String(value || '').trim()
  if (!raw) throw new Error('El QR no contiene información.')

  if (raw.startsWith(FIGURITAS_TRADE_PREFIX)) {
    throw new Error('Este es el QR de intercambio de Figuritas. Para importar tu colección usa el QR de “Exportar álbum”.')
  }

  if (!raw.startsWith(FIGURITAS_EXPORT_PREFIX)) {
    throw new Error('Este no es un QR de “Exportar álbum” de Figuritas.')
  }

  const payload = raw.slice(FIGURITAS_EXPORT_PREFIX.length)
  const blocks = payload.split(';')

  if (blocks.length !== FIGURITAS_EXPORT_BLOCKS) {
    throw new Error(
      `El QR de exportación debe contener ${FIGURITAS_EXPORT_BLOCKS} bloques y contiene ${blocks.length}.`
    )
  }

  const normalizedCodes = validateOrderedCodes(orderedCodes)
  const [missingMask, repeatedMask, copyCounts] = await Promise.all([
    inflateGzipBlock(blocks[0], 'faltantes'),
    inflateGzipBlock(blocks[1], 'repetidas'),
    inflateGzipBlock(blocks[2], 'cantidades')
  ])

  assertMaskLength(missingMask, 'faltantes')
  assertMaskLength(repeatedMask, 'repetidas')

  const unexpectedBits = [
    ...getUnexpectedTrailingIndices(missingMask),
    ...getUnexpectedTrailingIndices(repeatedMask)
  ]

  if (unexpectedBits.length > 0) {
    throw new Error(
      `El QR usa posiciones fuera del catálogo Panini: ${Array.from(new Set(unexpectedBits)).join(', ')}.`
    )
  }

  const missingIndices = readEnabledIndices(missingMask)
  const repeatedIndices = readEnabledIndices(repeatedMask)
  const missingSet = new Set(missingIndices)
  const overlappingIndices = repeatedIndices.filter(index => missingSet.has(index))

  if (overlappingIndices.length > 0) {
    throw new Error(
      `El QR es inconsistente: ${overlappingIndices.length} posiciones figuran como faltantes y repetidas a la vez.`
    )
  }

  if (copyCounts.length !== repeatedIndices.length) {
    throw new Error(
      `El QR declara ${repeatedIndices.length} figuritas repetidas, pero incluye ${copyCounts.length} cantidades.`
    )
  }

  const stickers = {}
  const repeated = []
  const missing = []
  let totalDuplicates = 0

  normalizedCodes.forEach((code, position) => {
    const absoluteIndex = position + 1
    const isMissing = missingSet.has(absoluteIndex)
    stickers[code] = {
      owned: !isMissing,
      duplicates: 0
    }

    if (isMissing) missing.push(code)
  })

  repeatedIndices.forEach((absoluteIndex, orderIndex) => {
    const code = normalizedCodes[absoluteIndex - 1]
    const totalCopies = Number(copyCounts[orderIndex])

    if (!Number.isInteger(totalCopies) || totalCopies < 2) {
      throw new Error(
        `La cantidad de la posición ${absoluteIndex} debe ser 2 o más y contiene ${totalCopies}.`
      )
    }

    const duplicates = totalCopies - 1
    stickers[code] = {
      owned: true,
      duplicates
    }
    totalDuplicates += duplicates
    repeated.push({
      code,
      absoluteIndex,
      totalCopies,
      duplicates
    })
  })

  return {
    protocol: 'figuritas-export',
    protocolVersion: FIGURITAS_PROTOCOL_VERSION,
    prefix: FIGURITAS_EXPORT_PREFIX,
    total: PANINI_EXPORT_STICKER_COUNT,
    owned: PANINI_EXPORT_STICKER_COUNT - missing.length,
    missingCount: missing.length,
    repeatedStickerCount: repeated.length,
    totalDuplicates,
    missing,
    repeated,
    stickers
  }
}
