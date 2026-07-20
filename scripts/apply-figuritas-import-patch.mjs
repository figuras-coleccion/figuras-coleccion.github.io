import fs from 'node:fs'
import path from 'node:path'

const settingsPath = path.resolve('src/components/SettingsPage.jsx')

if (!fs.existsSync(settingsPath)) {
  throw new Error(`No existe ${settingsPath}`)
}

let content = fs.readFileSync(settingsPath, 'utf8')
const newline = content.includes('\r\n') ? '\r\n' : '\n'
const lines = content.split(/\r?\n/)

function insertAfterLine(predicate, newLine, label) {
  if (lines.some(line => line.includes(newLine.trim()))) {
    console.log(`YA ESTABA APLICADO: ${label}`)
    return
  }

  const index = lines.findIndex(predicate)
  if (index < 0) throw new Error(`No se encontró el punto de inserción para: ${label}`)
  lines.splice(index + 1, 0, newLine)
  console.log(`OK: ${label}`)
}

function insertBeforeLine(predicate, newLine, label) {
  if (lines.some(line => line.includes(newLine.trim()))) {
    console.log(`YA ESTABA APLICADO: ${label}`)
    return
  }

  const index = lines.findIndex(predicate)
  if (index < 0) throw new Error(`No se encontró el punto de inserción para: ${label}`)
  lines.splice(index, 0, newLine)
  console.log(`OK: ${label}`)
}

if (!content.includes("useAlbum")) {
  throw new Error('SettingsPage todavía no usa la estructura multiálbum.')
}

if (!content.includes('Cambiar de álbum')) {
  throw new Error('No se encontró la opción Cambiar de álbum. Primero publica el parche multiálbum.')
}

insertAfterLine(
  line => line.includes("import AlbumPickerModal from './AlbumPickerModal'"),
  "import FiguritasImportModal from './FiguritasImportModal'",
  'importación del modal Figuritas'
)

insertAfterLine(
  line => line.includes("import FiguritasImportModal from './FiguritasImportModal'"),
  "import { DEFAULT_ALBUM_ID } from '../albums/constants'",
  'constante del álbum Panini'
)

insertAfterLine(
  line => line.includes('const [albumPickerOpen, setAlbumPickerOpen]'),
  '  const [figuritasImportOpen, setFiguritasImportOpen] = useState(false)',
  'estado del modal Figuritas'
)

insertAfterLine(
  line => line.includes('setAlbumPickerOpen(true)') && line.includes('Cambiar de álbum'),
  '        {activeAlbumId === DEFAULT_ALBUM_ID ? <button type="button" onClick={() => setFiguritasImportOpen(true)}><span className="settings-menu-icon blue">⇩</span><span><strong>Importar álbum de Figuritas</strong><small>Cargar el QR de “Exportar álbum” de la app Figuritas</small></span><i>›</i></button> : null}',
  'opción visible solo en Panini'
)

insertAfterLine(
  line => line.includes('<AlbumPickerModal') && line.includes('albumPickerOpen'),
  '      {figuritasImportOpen && activeAlbumId === DEFAULT_ALBUM_ID ? <FiguritasImportModal onClose={() => setFiguritasImportOpen(false)} /> : null}',
  'renderizado del modal Figuritas'
)

content = lines.join(newline)

const required = [
  "import FiguritasImportModal from './FiguritasImportModal'",
  "import { DEFAULT_ALBUM_ID } from '../albums/constants'",
  'activeAlbumId === DEFAULT_ALBUM_ID',
  'Importar álbum de Figuritas',
  '<FiguritasImportModal'
]

for (const signature of required) {
  if (!content.includes(signature)) {
    throw new Error(`Falta la firma final: ${signature}`)
  }
}

const occurrences = (content.match(/Importar álbum de Figuritas/g) || []).length
if (occurrences !== 1) {
  throw new Error(`La opción Importar álbum de Figuritas aparece ${occurrences} veces.`)
}

fs.writeFileSync(settingsPath, content, 'utf8')
console.log('SettingsPage actualizado correctamente.')
