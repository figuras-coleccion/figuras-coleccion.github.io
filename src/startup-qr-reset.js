// Evita que un qrUser antiguo fuerce la pestaña QR al recargar o abrir la app.
// Los QR escaneados dentro de la aplicación se procesan después de iniciar React.
try {
  const url = new URL(window.location.href)
  if (url.searchParams.has('qrUser')) {
    url.searchParams.delete('qrUser')
    window.history.replaceState({}, '', `${url.pathname}${url.search}${url.hash}`)
  }
} catch {
  // La limpieza de la URL nunca debe impedir que la aplicación cargue.
}

Promise.all([
  import('./collection-tracking.js'),
  import('./trade-tracking.js'),
  import('./qr-trade-history-migration.js')
])
  .then(([collectionModule, tradeModule, qrMigrationModule]) => {
    collectionModule.startCollectionTracking()
    tradeModule.startTradeTracking()
    qrMigrationModule.startQrTradeHistoryMigration()
  })
  .catch(error => console.warn('No se pudo iniciar el historial de la colección:', error))
