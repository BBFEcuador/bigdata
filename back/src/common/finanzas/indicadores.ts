/**
 * Indicadores financieros, con la nomenclatura de la Superintendencia.
 *
 * Se calculan a partir de los CONCEPTOS, no de códigos de cuenta, así que
 * funcionan igual venga el año del formulario IFRS o del fiscal.
 *
 * Dos reglas que atraviesan todo el archivo:
 *
 * 1. **Un denominador cero devuelve `null`, nunca cero ni infinito.** Con
 *    578.000 empresas hay patrimonio cero, activo cero e ingresos cero
 *    garantizados; devolver 0 los mezclaría con los que sí tienen un ratio de 0
 *    y falsearía cualquier promedio o percentil posterior.
 * 2. **Si falta un insumo, el indicador es `null`.** Los años del formulario
 *    fiscal no traen inventarios ni gastos financieros por separado, así que su
 *    prueba ácida y su cobertura de intereses no existen. No se aproximan.
 */

export type Magnitudes = Record<string, number | undefined>;

export interface DefinicionIndicador {
  clave: string;
  etiqueta: string;
  grupo: 'liquidez' | 'solvencia' | 'gestion' | 'rentabilidad';
  /** Cómo se lee: 'ratio' (veces), 'pct' (porcentaje) o 'dinero'. */
  formato: 'ratio' | 'pct' | 'dinero';
  calcular: (m: Magnitudes) => number | null;
}

/** División protegida: denominador nulo, cero o ausente -> null. */
const div = (a: number | undefined, b: number | undefined): number | null => {
  if (a === undefined || b === undefined || b === 0) return null;
  const r = a / b;
  return Number.isFinite(r) ? r : null;
};

const resta = (a: number | undefined, b: number | undefined): number | undefined =>
  a === undefined || b === undefined ? undefined : a - b;

export const INDICADORES: DefinicionIndicador[] = [
  // ---------------------------------------------------------------- liquidez
  {
    clave: 'liquidezCorriente',
    etiqueta: 'Liquidez corriente',
    grupo: 'liquidez',
    formato: 'ratio',
    calcular: m => div(m.activoCorriente, m.pasivoCorriente),
  },
  {
    clave: 'pruebaAcida',
    etiqueta: 'Prueba ácida',
    grupo: 'liquidez',
    formato: 'ratio',
    calcular: m => div(resta(m.activoCorriente, m.inventarios), m.pasivoCorriente),
  },
  {
    clave: 'capitalTrabajo',
    etiqueta: 'Capital de trabajo',
    grupo: 'liquidez',
    formato: 'dinero',
    calcular: m => resta(m.activoCorriente, m.pasivoCorriente) ?? null,
  },

  // --------------------------------------------------------------- solvencia
  {
    clave: 'endeudamientoActivo',
    etiqueta: 'Endeudamiento del activo',
    grupo: 'solvencia',
    formato: 'ratio',
    calcular: m => div(m.pasivo, m.activo),
  },
  {
    clave: 'endeudamientoPatrimonial',
    etiqueta: 'Endeudamiento patrimonial',
    grupo: 'solvencia',
    formato: 'ratio',
    calcular: m => div(m.pasivo, m.patrimonio),
  },
  {
    clave: 'apalancamiento',
    etiqueta: 'Apalancamiento',
    grupo: 'solvencia',
    formato: 'ratio',
    calcular: m => div(m.activo, m.patrimonio),
  },
  {
    clave: 'solvencia',
    etiqueta: 'Solvencia (activo / pasivo)',
    grupo: 'solvencia',
    formato: 'ratio',
    calcular: m => div(m.activo, m.pasivo),
  },
  {
    clave: 'coberturaIntereses',
    etiqueta: 'Cobertura de intereses',
    grupo: 'solvencia',
    formato: 'ratio',
    calcular: m => div(m.utilidadAntesImpuestos, m.gastosFinancieros),
  },

  // ----------------------------------------------------------------- gestión
  {
    clave: 'rotacionActivo',
    etiqueta: 'Rotación del activo',
    grupo: 'gestion',
    formato: 'ratio',
    calcular: m => div(m.ingresos, m.activo),
  },
  {
    clave: 'impactoCostoVentas',
    etiqueta: 'Costo de ventas sobre ingresos',
    grupo: 'gestion',
    formato: 'pct',
    calcular: m => div(m.costoVentas, m.ingresos),
  },
  {
    clave: 'impactoGastos',
    etiqueta: 'Gastos sobre ingresos',
    grupo: 'gestion',
    formato: 'pct',
    calcular: m => div(m.gastos, m.ingresos),
  },
  {
    clave: 'cargaFinanciera',
    etiqueta: 'Carga financiera',
    grupo: 'gestion',
    formato: 'pct',
    calcular: m => div(m.gastosFinancieros, m.ingresos),
  },

  // ------------------------------------------------------------ rentabilidad
  {
    clave: 'margenBruto',
    etiqueta: 'Margen bruto',
    grupo: 'rentabilidad',
    formato: 'pct',
    calcular: m => div(m.gananciaBruta, m.ingresos),
  },
  {
    clave: 'margenNeto',
    etiqueta: 'Margen neto',
    grupo: 'rentabilidad',
    formato: 'pct',
    calcular: m => div(m.utilidadNeta, m.ingresos),
  },
  {
    clave: 'roa',
    etiqueta: 'ROA (rentabilidad del activo)',
    grupo: 'rentabilidad',
    formato: 'pct',
    calcular: m => div(m.utilidadNeta, m.activo),
  },
  {
    clave: 'roe',
    etiqueta: 'ROE (rentabilidad del patrimonio)',
    grupo: 'rentabilidad',
    formato: 'pct',
    calcular: m => div(m.utilidadNeta, m.patrimonio),
  },
];

export const GRUPOS_INDICADOR: { id: DefinicionIndicador['grupo']; titulo: string }[] = [
  { id: 'liquidez', titulo: 'Liquidez' },
  { id: 'solvencia', titulo: 'Solvencia y endeudamiento' },
  { id: 'gestion', titulo: 'Gestión' },
  { id: 'rentabilidad', titulo: 'Rentabilidad' },
];

/** Calcula todos los indicadores de un ejercicio. */
export function calcularIndicadores(m: Magnitudes): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const ind of INDICADORES) out[ind.clave] = ind.calcular(m);
  return out;
}
