import './jsQR.umd.js'

const jsQR = globalThis.jsQR

if (typeof jsQR !== 'function') {
  throw new Error('No se pudo inicializar el lector QR local.')
}

export default jsQR
