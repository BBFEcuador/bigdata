import PanelImportacion from '../components/PanelImportacion'

export default function ImportarCatalogo() {
  return (
    <PanelImportacion
      titulo="Importar catálogo de cuentas"
      ayuda="Sube el archivo .txt del plan de cuentas, con el código y el nombre separados por tabulador en cada línea. Si el archivo no está en UTF-8 se detecta y se lee igualmente."
      endpoint="/imports/catalogo-cuentas"
      accept=".txt,.csv"
      etiquetaEntidad="cuentas"
    />
  )
}
