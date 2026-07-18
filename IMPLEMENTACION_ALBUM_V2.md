# Panini 2026 · Álbum visual V2 e intercambio manual

## Respaldo GitHub

- Rama estable sin modificar: `main`
- Rama de respaldo: `backup/pre-album-v2-20260715`
- Rama de desarrollo: `feature/album-ui-v2-manual-trade`
- Commit base respaldado: `7107aa3dab125994937763778c929f55671d0f2e`

## Cambios incluidos

1. Álbum continuo con filtros `Todas`, `Me faltan` y `Repetidas`.
2. Dos formas de figurita:
   - irregular: `00`, `FWC1` a `FWC4` y figurita N.° 1 de cada selección;
   - circular: todas las demás.
3. Estados visuales:
   - gris humo: no obtenida;
   - dorado claro: especial/escudo no obtenido;
   - gris oscuro: obtenida;
   - círculo azul: cantidad de repetidas.
4. Interacción del álbum:
   - toque corto: obtener o sumar una repetida;
   - pulsación de 1.5 segundos: restar una repetida;
   - sin controles `+` y `−` en las tarjetas.
5. Intercambio manual sin QR:
   - seleccionar faltantes que se reciben;
   - seleccionar repetidas que se entregan;
   - confirmar y actualizar únicamente el álbum del usuario activo.
6. Compatibilidad con enlaces existentes `/album?page=N` mediante desplazamiento a la sección equivalente.
7. No se cambió el esquema de Firebase ni sus reglas.

## Archivos modificados

- `src/App.jsx`
- `src/main.jsx`
- `src/components/AlbumPage.jsx`
- `src/components/Layout.jsx`
- `src/components/StickerGrid.jsx`
- `src/context/StickersContext.jsx`
- `vite.config.js`

## Archivos nuevos

- `src/v2.css`
- `src/components/ManualTrade.jsx`
- `src/data/albumGroups.js`
- `IMPLEMENTACION_ALBUM_V2.md`

## Modelo de datos

Se conserva el modelo existente:

```text
users/{uid}/stickers/{code}
  owned: boolean
  duplicates: number
```

El intercambio manual realiza una actualización múltiple únicamente dentro de `users/{uid}/stickers`. No escribe en cuentas ajenas y no requiere modificar reglas Firebase.

## Pruebas técnicas

```bash
npm ci
npm run build
```

El build de producción debe terminar correctamente antes del despliegue. La advertencia histórica de bundle mayor a 500 kB no bloquea la compilación.

## Prueba manual

### Álbum

1. Iniciar sesión con una cuenta de prueba.
2. Abrir `Álbum`.
3. Verificar `Todas`, `Me faltan` y `Repetidas`.
4. Tocar una faltante: debe quedar obtenida en gris oscuro.
5. Tocar nuevamente: debe aparecer el círculo azul `1`.
6. Mantener 1.5 segundos: el círculo debe disminuir.
7. Guardar cambios y recargar.
8. Buscar por selección (`TUR`) y código (`TUR10`).
9. Probar en móvil y escritorio.

### Intercambio manual

1. Abrir `Cambiar`.
2. Seleccionar faltantes en `Recibir`.
3. Seleccionar repetidas en `Entregar`.
4. Confirmar.
5. Verificar que las recibidas queden obtenidas y las entregadas reduzcan una repetida.
6. Confirmar que no se modificó ninguna cuenta ajena.

## Vista previa online

La rama se compila con:

```bash
VITE_BASE_PATH=/panini2026/v2/ npm run build
```

La vista previa se publica en `/panini2026/v2/`, manteniendo intacta la versión estable ubicada en `/panini2026/`.

## Despliegue definitivo

Solo después de aprobación:

```bash
git checkout main
git merge --no-ff feature/album-ui-v2-manual-trade
npm ci
npm run build
npm run deploy
```

## Reversión

```bash
git checkout main
git reset --hard backup/pre-album-v2-20260715
npm ci
npm run build
npm run deploy
```

No existe migración de datos Firebase; el modelo anterior y el nuevo son compatibles.
