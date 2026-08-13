import PanelImportacion from '../components/PanelImportacion'

export default function ImportarSri() {
  return (
    <PanelImportacion
      titulo="Importar personas naturales"
      ayuda={
        'Sube el CSV de una provincia, separado por barras verticales. Un archivo = una ' +
        'provincia. La carga es siempre parcial: nunca marca ausentes fuera de esa provincia. ' +
        'Las personas naturales se clasifican automáticamente como contables o no contables.'
      }
      endpoint="/imports/personas-naturales"
      accept=".csv,.txt"
      etiquetaEntidad="personas naturales"
      requiereProvincia
      modoFijo="parcial"
    />
  )
}
