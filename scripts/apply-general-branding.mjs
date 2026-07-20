import fs from 'node:fs'

function read(path) {
  return fs.readFileSync(path, 'utf8')
}

function write(path, content) {
  fs.writeFileSync(path, content, 'utf8')
}

function replaceOptional(content, oldText, newText) {
  if (!content.includes(oldText)) return content
  return content.replace(oldText, newText)
}

function replaceRequired(content, oldText, newText, label) {
  if (newText && content.includes(newText)) return content
  if (!content.includes(oldText)) throw new Error(`No se encontró: ${label}`)
  return content.replace(oldText, newText)
}

const registerPath = 'src/components/Register.jsx'
let register = read(registerPath)

if (!register.includes('Ingresar con Google')) {
  throw new Error('Primero debe estar aplicado el acceso único con Google.')
}

register = replaceOptional(register, "import { useAlbum } from '../context/AlbumContext'\n", '')
register = replaceOptional(register, "import { DEFAULT_ALBUM_ID } from '../albums/constants'\n", '')
register = replaceOptional(register, '  const { activeAlbum } = useAlbum()\n', '')

register = replaceRequired(
  register,
  "        <h1>{activeAlbum.id === DEFAULT_ALBUM_ID ? '⚽ WORLD CUP 2026 - PANINI' : activeAlbum.shortTitle}</h1>",
  '        <h1>⚽ FIGURAS COLECCIÓN</h1>',
  'título general del login'
)
register = replaceRequired(
  register,
  "        <p className=\"subtitle\">{activeAlbum.id === DEFAULT_ALBUM_ID ? 'Mi álbum de figuritas' : 'Mi álbum de figuritas'}</p>",
  '        <p className="subtitle">Todos tus álbumes en un solo lugar</p>',
  'subtítulo general del login'
)

register = register
  .replace(
    'Tu cuenta ya está validada. Solo falta completar estos datos para usar el álbum.',
    'Tu cuenta ya está validada. Solo falta completar estos datos para usar tus álbumes.'
  )
  .replace('Guardar y entrar al álbum', 'Guardar y continuar')
  .replace(
    'El acceso al álbum se habilita cuando el correo esté verificado.',
    'El acceso a tus álbumes se habilita cuando el correo esté verificado.'
  )
  .replace(
    'Cada usuario tiene su propio álbum. Tu avance queda guardado en la nube y separado por cuenta.',
    'Cada usuario gestiona sus propios álbumes. Tu avance queda guardado en la nube y separado por cuenta.'
  )

write(registerPath, register)

const modalPath = 'src/components/FiguritasImportModal.jsx'
let modal = read(modalPath)
modal = modal.replace(
  'Buscando el QR, validando sus tres bloques y descomprimiendo el estado del álbum…',
  'Buscando el QR en toda la captura y en recortes automáticos, validando sus tres bloques y descomprimiendo el álbum…'
)
write(modalPath, modal)

const indexPath = 'index.html'
let index = read(indexPath)
index = index.replace(
  /<meta name="description" content="[^"]*"\s*\/>/,
  '<meta name="description" content="Organiza, completa e intercambia todos tus álbumes de figuritas en un solo lugar." />'
)
index = index.replace(/<title>[^<]*<\/title>/, '<title>Figuras Colección</title>')
write(indexPath, index)

for (const manifestPath of ['manifest.json', 'public/manifest.json']) {
  if (!fs.existsSync(manifestPath)) continue
  const manifest = JSON.parse(read(manifestPath))
  manifest.name = 'Figuras Colección'
  manifest.short_name = 'Figuras'
  write(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
}

console.log('Marca general FIGURAS COLECCIÓN aplicada.')
