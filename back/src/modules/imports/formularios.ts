/**
 * Identificación del formulario a partir de su plan de cuentas.
 *
 * Vive fuera de los dos importadores que la usan —balances y catálogo— porque
 * ambos tienen que llegar EXACTAMENTE al mismo número. Si el catálogo de 925
 * cuentas entrara como formulario 3 y los balances de ese mismo plan como
 * formulario 2, el detalle de un balance no encontraría ni una sola cuenta y el
 * import los descartaría todos como códigos desconocidos.
 *
 * ## Por qué por número de cuentas y no por el nombre del archivo
 *
 * El sufijo del nombre NO es estable. Comprobado sobre los archivos reales de
 * 2021-2025:
 *
 *     plan de 622 cuentas (IFRS)  ->  _1 en los cinco años
 *     plan de 868 cuentas         ->  _2 en 2021 y 2022
 *     plan de 925 cuentas         ->  _3 en 2021 y 2022, pero _2 en 2023
 *
 * Lo que sí es estable es el plan: los tres son idénticos byte a byte entre
 * años. El número de cuentas los distingue sin ambigüedad.
 */

export const FORMULARIO_IFRS = 1;

/** Número de cuentas de cada plan conocido -> número de formulario. */
export const FORMULARIO_POR_NUM_CUENTAS: Record<number, number> = {
  622: FORMULARIO_IFRS,
  868: 2,
  925: 3,
};

export const FORMULARIOS_CONOCIDOS = Object.values(FORMULARIO_POR_NUM_CUENTAS);

/** Nombre legible para avisos y para la interfaz. */
export const NOMBRE_FORMULARIO: Record<number, string> = {
  1: 'IFRS (622 cuentas)',
  2: 'Formulario 868',
  3: 'Formulario fiscal (925 cuentas)',
};

export function detectarFormulario(numCuentas: number): number {
  const formulario = FORMULARIO_POR_NUM_CUENTAS[numCuentas];
  if (formulario === undefined) {
    throw new Error(
      `Plan de cuentas desconocido: el archivo trae ${numCuentas} cuentas y los planes ` +
        `conocidos tienen ${Object.keys(FORMULARIO_POR_NUM_CUENTAS).join(', ')}. ` +
        `Cargarlo mezclaría cuentas distintas bajo el mismo código.`,
    );
  }
  return formulario;
}
