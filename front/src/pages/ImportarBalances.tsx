import PanelImportacion from '../components/PanelImportacion'

export default function ImportarBalances() {
  return (
    <PanelImportacion
      titulo="Importar balances"
      ayuda={
        'Sube el .txt de balances de un ejercicio, separado por tabuladores: una fila por ' +
        'compañía y una columna por cuenta. Un archivo = un año. El tipo de formulario NO se ' +
        'deduce del nombre del archivo (el sufijo _1 / _2 señala formularios distintos según ' +
        'el año): se detecta por el plan de cuentas de la cabecera. Hoy sólo se admite el ' +
        'formulario IFRS de 622 cuentas. Si el archivo no está en UTF-8 se detecta y se lee igual.'
      }
      endpoint="/imports/balances"
      accept=".txt"
      etiquetaEntidad="balances"
    />
  )
}
