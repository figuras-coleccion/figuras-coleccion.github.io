import fs from 'node:fs'

const path = 'src/components/FiguritasTradeModal.jsx'
const source = fs.readFileSync(path, 'utf8')

const required = [
  "const closeTrade = useCallback(() =>",
  "resetTrade()",
  "onClose?.()",
  ">\n                    Cancelar\n",
  "onClick={closeTrade}",
  "event.key === 'Escape'"
]

for (const signature of required) {
  if (!source.includes(signature)) {
    throw new Error(`Falta la mejora V5 en ${path}: ${signature}`)
  }
}

const forbidden = [
  'Buscando el QR y descomprimiendo las máscaras de faltantes y repetidas…',
  'Elegir otro QR',
  'onClick={onClose}'
]

for (const signature of forbidden) {
  if (source.includes(signature)) {
    throw new Error(`Todavía existe el comportamiento anterior en ${path}: ${signature}`)
  }
}

console.log('V5 modal Figuritas: carga compacta, Cancelar y cierre verificados.')
