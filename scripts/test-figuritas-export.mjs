import { paniniCatalog } from '../src/albums/panini-world-cup-2026/catalog.js'
import { decodeFiguritasExportPayload } from '../src/integrations/figuritas/exportProtocol.js'

const sample = "站疑H4sIAAAAAAAAE2NgYGHABhghlEaLEgODAgMDAzuYq8jEwODIwAGRU2BgUGBhEIDpYGKDsRpgjA4wCVcBkmFkYGKAGcAAAJx28op9AAAA;H4sIAAAAAAAAEwXBIQ7CQBBA0T/LbDskiFENqdoWg+YEC3UoBBqFRvQEQ4JAEY7ECTgDR+G99DLoB2P5bCHuxjZ/vhiFIHUOF9yARBUQVlRlkfg1bG4CR5Bybgowa0TUlqt6Z9Nu0oNleh5+MobMyFr24FCc8a3wB+76Kzh9AAAA;H4sIAAAAAAAAE2NhZkIHzAiSGcZDlkHw4NLMmKbgBxjqWZgRUswAygy1qJUAAAA="
const decoded = await decodeFiguritasExportPayload(sample, paniniCatalog.allStickersOrdered)

const expected = {
  total: 994,
  owned: 961,
  missingCount: 33,
  repeatedStickerCount: 149,
  totalDuplicates: 168
}

for (const [key, value] of Object.entries(expected)) {
  if (decoded[key] !== value) {
    throw new Error(`Validation failed for ${key}: expected ${value}, got ${decoded[key]}`)
  }
}

if (decoded.missing.length !== decoded.missingCount) {
  throw new Error('Missing list count does not match summary.')
}

if (decoded.repeated.length !== decoded.repeatedStickerCount) {
  throw new Error('Repeated list count does not match summary.')
}

console.log('Figuritas export protocol validation: OK')
console.log(JSON.stringify(expected, null, 2))
