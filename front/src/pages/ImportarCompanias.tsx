import PanelImportacion from '../components/PanelImportacion'

export default function ImportarCompanias() {
  return (
    <PanelImportacion
      titulo="Importar compañías"
      ayuda="Sube el archivo .xlsx de la Superintendencia de Compañías. La carga continúa en el servidor aunque cierres esta página."
      endpoint="/imports/companias"
      accept=".xlsx"
      etiquetaEntidad="compañías"
    />
  )
}
