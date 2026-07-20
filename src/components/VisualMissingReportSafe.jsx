import VisualMissingReportPage from './VisualMissingReportPage'

// Conserva la ruta existente, pero elimina la recarga artificial con ?print=1.
// La impresiÃƒÆ’Ã‚Â³n se ejecuta directamente desde el clic del usuario para que sea
// mÃƒÆ’Ã‚Â¡s estable en mÃƒÆ’Ã‚Â³viles y, al cerrar el diÃƒÆ’Ã‚Â¡logo, permanezca en el reporte.
export default function VisualMissingReportSafe() {
  return <VisualMissingReportPage />
}