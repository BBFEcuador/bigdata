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

  // Utilidades de ejercicios anteriores que siguen en el patrimonio. Es la
  // magnitud sobre la que gira el pago a cuenta de la Resolución
  // NAC-DGERCGC26-00000026, y por eso no se aproxima con `patrimonio`: las
  // reservas (304 / 604-606) NO son distribuibles y quedan fuera a propósito.
  //
  // El nombre de la cuenta fiscal es literalmente el de la obligación:
  // "UTILIDAD NO DISTRIBUIDA EJERCICIOS ANTERIORES".
  { clave: 'utilidadesAcumuladas', etiqueta: 'Utilidades acumuladas de ejercicios anteriores', bloque: 'situacion', codigos: { 1: '30601', 3: '611' } },
  { clave: 'perdidasAcumuladas', etiqueta: 'Pérdidas acumuladas de ejercicios anteriores', bloque: 'situacion', codigos: { 1: '30602', 3: '612' } },

  // El total del grupo, que es la cifra que se lee en el balance. Alcanza a
  // 21.000 compañías más que `utilidadesAcumuladas` porque netea las pérdidas
  // y arrastra la adopción NIIF; en 4.048 casos cuelgan además reservas.
  //
  // El formulario fiscal NO tiene un total equivalente: reparte lo mismo en
  // 611, 612 y 614, y sumarlos aquí sería inventar una cuenta que el
  // contribuyente no declaró. Va a `null` y el dato falta en los ejercicios
  // declarados en ese plan, que es la regla de la casa.
  { clave: 'resultadosAcumulados', etiqueta: 'Resultados acumulados (total)', bloque: 'situacion', codigos: { 1: '306', 3: null } },

  // Se separa porque NO es utilidad repartible: son 4.215 millones en 2025 que
  // entran en el total y no deberían leerse como dividendos pendientes.
  { clave: 'resultadosNiif', etiqueta: 'Resultados acumulados por adopción de NIIF', bloque: 'situacion', codigos: { 1: '30603', 3: '614' } },

  { clave: 'ingresos', etiqueta: 'Ingresos de actividades ordinarias', bloque: 'resultados', codigos: { 1: '401', 3: '1005' } },
  { clave: 'gananciaBruta', etiqueta: 'Ganancia bruta', bloque: 'resultados', codigos: { 1: '402', 3: '1025' } },
  { clave: 'costoVentas', etiqueta: 'Costo de ventas y producción', bloque: 'resultados', codigos: { 1: '501', 3: '7991' } },
  { clave: 'gastos', etiqueta: 'Gastos operacionales', bloque: 'resultados', codigos: { 1: '502', 3: '1030' } },
  { clave: 'utilidadAntesImpuestos', etiqueta: 'Utilidad antes de participación e impuestos', bloque: 'resultados', codigos: { 1: '600', 3: '1065' } },
  { clave: 'utilidadNeta', etiqueta: 'Utilidad (pérdida) neta del período', bloque: 'resultados', codigos: { 1: '707', 3: '1099' } },

  // Sólo IFRS. El formulario fiscal reparte los inventarios en ocho cuentas
  // (340-347, una de ellas un deterioro que resta) y no trae un total; sumarlas
  // daría una cifra discutible. Los ratios que dependen de estos conceptos
  // quedan sin calcular en los años declarados en ese formulario, que es más
  // honesto que publicar un número inventado.
  { clave: 'inventarios', etiqueta: 'Inventarios', bloque: 'situacion', codigos: { 1: '10103', 3: null } },
  { clave: 'gastosFinancieros', etiqueta: 'Gastos financieros', bloque: 'resultados', codigos: { 1: '50203', 3: null } },
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
