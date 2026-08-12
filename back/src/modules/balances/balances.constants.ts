/**
 * Las cuentas grandes del plan IFRS: las que permiten comparar ejercicios.
 *
 * El detalle fino de un balance cambia de un año a otro —una empresa abre y
 * cierra cuentas continuamente—, pero estas raíces están siempre. Son las que
 * se muestran en la vista comparativa y las que después alimentarán
 * `concepto_financiero`, que es lo que hará comparables incluso los formularios
 * con planes de cuentas distintos.
 *
 * Los códigos y sus nombres salen de `categoria_cuenta`, no de suposiciones.
 */
export interface ConceptoClave {
  codigo: string;
  clave: string;
  etiqueta: string;
  /** Para agrupar la tabla comparativa en el front. */
  bloque: 'situacion' | 'resultados';
}

export const CONCEPTOS_CLAVE: ConceptoClave[] = [
  { codigo: '1', clave: 'activo', etiqueta: 'Activo total', bloque: 'situacion' },
  { codigo: '101', clave: 'activoCorriente', etiqueta: 'Activo corriente', bloque: 'situacion' },
  { codigo: '102', clave: 'activoNoCorriente', etiqueta: 'Activo no corriente', bloque: 'situacion' },
  { codigo: '2', clave: 'pasivo', etiqueta: 'Pasivo total', bloque: 'situacion' },
  { codigo: '201', clave: 'pasivoCorriente', etiqueta: 'Pasivo corriente', bloque: 'situacion' },
  { codigo: '202', clave: 'pasivoNoCorriente', etiqueta: 'Pasivo no corriente', bloque: 'situacion' },
  { codigo: '3', clave: 'patrimonio', etiqueta: 'Patrimonio neto', bloque: 'situacion' },
  { codigo: '401', clave: 'ingresos', etiqueta: 'Ingresos de actividades ordinarias', bloque: 'resultados' },
  { codigo: '402', clave: 'gananciaBruta', etiqueta: 'Ganancia bruta', bloque: 'resultados' },
  { codigo: '501', clave: 'costoVentas', etiqueta: 'Costo de ventas y producción', bloque: 'resultados' },
  { codigo: '502', clave: 'gastos', etiqueta: 'Gastos', bloque: 'resultados' },
  { codigo: '600', clave: 'utilidadAntesImpuestos', etiqueta: 'Ganancia antes de participación e impuestos', bloque: 'resultados' },
  { codigo: '707', clave: 'utilidadNeta', etiqueta: 'Ganancia (pérdida) neta del período', bloque: 'resultados' },
];

export const CODIGOS_CLAVE = CONCEPTOS_CLAVE.map((c) => c.codigo);

/** Formulario IFRS de 622 cuentas: el único cargado hoy. */
export const FORMULARIO_IFRS = 1;
