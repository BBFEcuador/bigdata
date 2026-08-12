import PanelImportacion from '../components/PanelImportacion'

/**
 * Los cuatro catastros del SRI comparten pantalla porque comparten importador:
 * el tipo se deduce del título que llevan dentro las hojas, así que no hay nada
 * que elegir antes de subir.
 */
export default function ImportarCatastros() {
  return (
    <PanelImportacion
      titulo="Importar catastros del SRI"
      ayuda={
        'Sube el .xlsx de cualquiera de los cuatro catastros: exportadores habituales de bienes ' +
        '(rebaja de 3 puntos de IR), exportadores habituales de bienes (retenciones de IVA), ' +
        'exportadores habituales de servicios, o prestadores de servicios digitales no ' +
        'residentes. El tipo y los ejercicios se detectan del propio archivo, que trae una hoja ' +
        'por año. Si el SRI te lo entrega en .xls, ábrelo en Excel y guárdalo como .xlsx antes ' +
        'de subirlo.'
      }
      endpoint="/imports/catastros"
      accept=".xlsx"
      etiquetaEntidad="filas"
    />
  )
}
