import PanelImportacion from '../components/PanelImportacion'

export default function ImportarTurismo() {
  return (
    <PanelImportacion
      titulo="Importar Catastro Nacional de Turismo"
      ayuda="Sube el .xlsx que publica el Ministerio de Turismo. Trae una fila por establecimiento registrado —con dirección, categoría, teléfono y correo— y se enlaza por RUC con compañías, personas naturales y sociedades no supervisadas: cuatro de cada cinco establecimientos turísticos pertenecen a personas naturales."
      endpoint="/imports/turismo"
      accept=".xlsx"
      etiquetaEntidad="registros"
    />
  )
}
