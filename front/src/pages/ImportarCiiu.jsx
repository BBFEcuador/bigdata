import PanelImportacion from '../components/PanelImportacion'

export default function ImportarCiiu() {
  return (
    <PanelImportacion
      titulo="Importar catálogo CIIU"
      ayuda="Sube el archivo .xlsx del catálogo de actividades económicas. El nombre viene repartido en seis columnas, una por nivel (Sección, División, Grupo, Clase, Subclase y Actividad Económica); el importador deduce de ahí la jerarquía."
      endpoint="/imports/ciiu"
      accept=".xlsx"
      etiquetaEntidad="actividades"
    />
  )
}
