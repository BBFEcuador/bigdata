import { LOGO_ASCENDRA } from './marca-logo'

/**
 * Identidad visual de ASCENDRA, la firma que emite los informes.
 *
 * Todo lo que depende de la marca está aquí y sólo aquí: el informe no repite
 * ni un color ni un texto, los lee de este archivo. Cambiar de marca —o emitir
 * con otra— es tocar este archivo y nada más.
 *
 * Los valores salen del manual de campaña y de la hoja membretada:
 * `Manual_Campana_ASCENDRA_1.pdf` y `Hojas membretadas 2.pdf`.
 */

export const MARCA = {
  nombre: 'ASCENDRA',
  /** Aparece junto al logotipo, en versalitas finas. */
  descripcion: 'By BBF Consulting Group',

  /** Pie de todas las páginas, tal como consta en la hoja membretada. */
  contacto:
    'Av. 12 de Octubre y Av. La Coruña · Edif. UrbanPlaza, Piso 10 · Quito · ' +
    '02 600 8190 · www.ascendra.com.ec',

  /**
   * Título del documento.
   *
   * "Radiografía financiera" en lugar de "Análisis financiero": dice lo mismo,
   * se recuerda, y deja claro de un vistazo que muestra el estado real de la
   * empresa. El subtítulo carga la parte informativa, que es la que protege:
   * esto no es una auditoría y el documento no debe insinuar que lo sea.
   *
   * Alternativas si se prefiere algo más sobrio: "Diagnóstico financiero
   * empresarial", "Perfil financiero", "Informe de posición financiera".
   */
  tituloInforme: 'Radiografía financiera',
  subtituloInforme: 'Informe informativo sobre estados financieros publicados',

  /**
   * Paleta del manual.
   *
   * `primario` es el azul marino de la marca y `acento` el dorado del
   * isotipo. Son los dos únicos colores de empresa que entran en el documento:
   * el resto es tinta sobre blanco. Un informe financiero con cuatro colores
   * corporativos deja de leerse como un informe.
   */
  colores: {
    primario: '#051129',
    acento: '#c79b42',
    /** Dorado oscuro, para texto sobre fondo claro donde el dorado no contrasta. */
    acentoOscuro: '#a07e2f',
    tinta: '#16242a',
    tenue: '#5e747b',
    /** Arena del manual, para las bandas y las filas destacadas. */
    arena: '#f3eee1',
    arenaBorde: '#e0d7c3',
  },

  /**
   * Tipografía de marca.
   *
   * El manual usa Poppins. No viene con Windows ni con macOS, así que la pila
   * cae en las geométricas que sí suelen estar instaladas antes de llegar a la
   * del sistema. Si se instala Poppins —o se añade el archivo de fuente al
   * proyecto— el informe la toma sin tocar nada más.
   */
  tipografia: "'Poppins', 'Century Gothic', 'Avenir Next', 'Futura', system-ui, sans-serif",

  /**
   * Logotipo completo, en negro y dorado, sobre fondo claro.
   *
   * Alto fijo y ancho automático: el logotipo es muy apaisado (2793 x 739) y
   * fijar el ancho lo deformaría en cuanto alguien cambie el otro valor.
   */
  logo: <img src={LOGO_ASCENDRA} alt="ASCENDRA" height="30" />,
}

/**
 * Nota legal del pie.
 *
 * Dice de dónde salen las cifras y qué NO es el informe. No es una formalidad:
 * el documento se construye con datos públicos que la propia empresa analizada
 * presentó, y quien lo reciba tiene que poder distinguir eso de una auditoría.
 */
export const NOTA_LEGAL =
  'Informe elaborado a partir de los estados financieros que la compañía presentó ' +
  'ante la Superintendencia de Compañías, Valores y Seguros del Ecuador, y del ' +
  'Registro Único de Contribuyentes del SRI. Las cifras no han sido auditadas por ' +
  'ASCENDRA y se reproducen tal como constan en la fuente oficial. Este documento ' +
  'tiene carácter informativo y no constituye una opinión de auditoría ni una ' +
  'recomendación de inversión.'
