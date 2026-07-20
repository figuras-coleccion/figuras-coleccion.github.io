import { paniniCatalog } from '../src/albums/panini-world-cup-2026/catalog.js'
import { threeReyesCatalog } from '../src/albums/mundial-2026-3-reyes-705/catalog.js'

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function validateCatalog(catalog, expectedTotal) {
  const ordered = catalog.allStickersOrdered
  const grouped = catalog.albumGroups.flatMap(group => group.codes)

  assert(ordered.length === expectedTotal, `${catalog.id}: total inesperado`)
  assert(new Set(ordered).size === ordered.length, `${catalog.id}: codigos duplicados`)
  assert(grouped.length === expectedTotal, `${catalog.id}: grupos incompletos`)
  assert(new Set(grouped).size === grouped.length, `${catalog.id}: codigos repetidos entre grupos`)
  assert(ordered.every(code => grouped.includes(code)), `${catalog.id}: codigos sin grupo`)
}

validateCatalog(paniniCatalog, 994)
validateCatalog(threeReyesCatalog, 705)

assert(threeReyesCatalog.teams.length === 48, '3 Reyes: deben existir 48 selecciones')
assert(!threeReyesCatalog.allStickersOrdered.includes('0'), '3 Reyes: la figura 0 no debe existir')
assert(threeReyesCatalog.allStickersOrdered.includes('584'), '3 Reyes: falta la figura 584')
assert(threeReyesCatalog.allStickersOrdered.includes('A'), '3 Reyes: falta la letra A')
assert(threeReyesCatalog.allStickersOrdered.includes('G'), '3 Reyes: falta la letra G')
assert(threeReyesCatalog.allStickersOrdered.includes('E66'), '3 Reyes: falta E66')
assert(threeReyesCatalog.allStickersOrdered.includes('T-48'), '3 Reyes: falta T-48')
assert(!threeReyesCatalog.allStickersOrdered.includes('T48'), '3 Reyes: los escudos deben usar T-')

console.log('Catalogos validados: Panini 994 y Mundial 2026 3 Reyes 705.')
