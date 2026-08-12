/**
 * Diccionario de conceptos financieros: el puente entre "lo que dice cada
 * formulario" y "lo que significa".
 *
 * Es lo que hace comparables los ejercicios. El detalle fino de un balance
 * cambia de un año a otro y, peor, entre formularios el plan de cuentas es otro
 * completamente distinto — pero las magnitudes grandes (activo, pasivo,
 * patrimonio, ingresos, gastos, resultado) están siempre, sólo que con otro
 * código.
 *
 *     concepto        formulario 1 (IFRS)   formulario 3 (fiscal)
 *     activo          1                     499
 *     pasivo          2                     599
 *     patrimonio      3                     698
 *
 * Sin esto, 2021 —donde 92.127 compañías declararon en el formulario 3 y sólo
 * 17.365 en IFRS— quedaría fuera de cualquier serie histórica.
 *
 * Los códigos NO están adivinados: salen de los catálogos reales, y el mapeo se
 * validó comprobando que `activo = pasivo + patrimonio` cuadra en el 97,1 % de
 * los balances del formulario 3 (en el IFRS cuadra en el 100 %).
 */

export type BloqueFinanciero = 'situacion' | 'resultados';

export interface Concepto {
  clave: string;
  etiqueta: string;
  bloque: BloqueFinanciero;
  /** Código de la cuenta en cada formulario. `null` = ese plan no lo trae. */
  codigos: Record<number, string | null>;
}

export const CONCEPTOS: Concepto[] = [
  { clave: 'activo', etiqueta: 'Activo total', bloque: 'situacion', codigos: { 1: '1', 3: '499' } },
  { clave: 'activoCorriente', etiqueta: 'Activo corriente', bloque: 'situacion', codigos: { 1: '101', 3: '361' } },
  { clave: 'activoNoCorriente', etiqueta: 'Activo no corriente', bloque: 'situacion', codigos: { 1: '102', 3: '449' } },
  { clave: 'pasivo', etiqueta: 'Pasivo total', bloque: 'situacion', codigos: { 1: '2', 3: '599' } },
  { clave: 'pasivoCorriente', etiqueta: 'Pasivo corriente', bloque: 'situacion', codigos: { 1: '201', 3: '550' } },
  { clave: 'pasivoNoCorriente', etiqueta: 'Pasivo no corriente', bloque: 'situacion', codigos: { 1: '202', 3: '589' } },
  { clave: 'patrimonio', etiqueta: 'Patrimonio neto', bloque: 'situacion', codigos: { 1: '3', 3: '698' } },

  { clave: 'ingresos', etiqueta: 'Ingresos de actividades ordinarias', bloque: 'resultados', codigos: { 1: '401', 3: '1005' } },
  { clave: 'gananciaBruta', etiqueta: 'Ganancia bruta', bloque: 'resultados', codigos: { 1: '402', 3: '1025' } },
  { clave: 'costoVentas', etiqueta: 'Costo de ventas y producción', bloque: 'resultados', codigos: { 1: '501', 3: '7991' } },
  { clave: 'gastos', etiqueta: 'Gastos operacionales', bloque: 'resultados', codigos: { 1: '502', 3: '1030' } },
  { clave: 'utilidadAntesImpuestos', etiqueta: 'Utilidad antes de participación e impuestos', bloque: 'resultados', codigos: { 1: '600', 3: '1065' } },
  { clave: 'utilidadNeta', etiqueta: 'Utilidad (pérdida) neta del período', bloque: 'resultados', codigos: { 1: '707', 3: '1099' } },
];

/** Códigos de un formulario, en el orden de `CONCEPTOS`. */
export function codigosDe(formulario: number): string[] {
  return CONCEPTOS.map((c) => c.codigos[formulario]).filter((c): c is string => c !== null && c !== undefined);
}

/** `{ codigo -> clave }` para resolver de vuelta al leer de la base. */
export function clavePorCodigo(formulario: number): Map<string, string> {
  const m = new Map<string, string>();
  for (const c of CONCEPTOS) {
    const codigo = c.codigos[formulario];
    if (codigo) m.set(codigo, c.clave);
  }
  return m;
}

/**
 * Las tres cuentas de la ecuación contable en cada formulario.
 * Aplicar las de un plan al otro daría descuadres en masa que no existen.
 */
export function codigosEcuacion(formulario: number): {
  activo: string;
  pasivo: string;
  patrimonio: string;
} | null {
  const buscar = (clave: string) => CONCEPTOS.find((c) => c.clave === clave)?.codigos[formulario];
  const activo = buscar('activo');
  const pasivo = buscar('pasivo');
  const patrimonio = buscar('patrimonio');
  if (!activo || !pasivo || !patrimonio) return null;
  return { activo, pasivo, patrimonio };
}
