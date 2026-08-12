import PanelImportacion from '../components/PanelImportacion'

export default function ImportarSri() {
  return (
    <PanelImportacion
      titulo="Importar padrón del SRI"
      ayuda={
        'Sube el CSV de una provincia, separado por barras verticales. Un archivo = una ' +
        'provincia, y por eso esta carga es siempre parcial: tratarla como foto completa ' +
        'marcaría como desaparecidos a los contribuyentes de las otras 23. Las personas ' +
        'naturales se separan automáticamente de las sociedades, y éstas se reparten ' +
        'entre compañías de la Superintendencia y sociedades no supervisadas.'
      }
      endpoint="/imports/sri"
      accept=".csv,.txt"
      etiquetaEntidad="contribuyentes"
    />
  )
}
