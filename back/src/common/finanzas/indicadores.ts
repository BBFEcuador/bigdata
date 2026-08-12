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
 *
 * ## Por qué la fórmula es un dato y no una función
 *
 * Cada indicador se calcula en dos sitios: aquí en TypeScript, para la ficha de
 * una compañía, y **en SQL**, para sacar los percentiles sectoriales de las
 * 670.000 filas de balance de una pasada. Traer 670.000 balances a Node para
 * dividirlos aquí no es una opción, y escribir la fórmula dos veces tampoco: el
 * día que alguien corrija el ROE en un sitio y no en el otro, la empresa saldría
 * comparada contra un percentil que mide otra cosa, y nada fallaría.
 *
 * Por eso la fórmula se declara como datos —qué se suma, qué se resta, entre qué
 * se divide— y de ahí salen las dos implementaciones. Añadir un indicador es
 * añadir una entrada a `INDICADORES`; el SQL se genera solo.
 */

export type Magnitudes = Record<string, number | undefined>;

/**
 * Fórmula declarativa: `(sum(num) - sum(menos)) / sum(den)`.
 *
 * Sin `den` el indicador es una magnitud en dinero (el capital de trabajo) y no
 * hay división. Todos los indicadores de la Superintendencia caben en esta
 * forma; el día que uno no quepa, lo honesto es ampliar la forma y no colar una
 * excepción calculada a mano en uno de los dos lados.
 */
export interface Formula {
  num: string[];
  menos?: string[];
  den?: string[];
}

export interface DefinicionIndicador {
  clave: string;
  etiqueta: string;
  grupo: 'liquidez' | 'solvencia' | 'gestion' | 'rentabilidad';
  /** Cómo se lee: 'ratio' (veces), 'pct' (porcentaje) o 'dinero'. */
  formato: 'ratio' | 'pct' | 'dinero';
  /**
   * Hacia dónde es mejor estar en la comparación sectorial. Sin esto, el
   * percentil 90 en «endeudamiento del activo» se pintaría de verde.
   */
  mejor: 'alto' | 'bajo' | 'neutro';
  formula: Formula;
}

export const INDICADORES: DefinicionIndicador[] = [
  // ---------------------------------------------------------------- liquidez
  {
    clave: 'liquidezCorriente',
    etiqueta: 'Liquidez corriente',
    grupo: 'liquidez',
    formato: 'ratio',
    mejor: 'alto',
    formula: { num: ['activoCorriente'], den: ['pasivoCorriente'] },
  },
  {
    clave: 'pruebaAcida',
    etiqueta: 'Prueba ácida',
    grupo: 'liquidez',
    formato: 'ratio',
    mejor: 'alto',
    formula: { num: ['activoCorriente'], menos: ['inventarios'], den: ['pasivoCorriente'] },
  },
  {
    clave: 'capitalTrabajo',
    etiqueta: 'Capital de trabajo',
    grupo: 'liquidez',
    formato: 'dinero',
    mejor: 'alto',
    formula: { num: ['activoCorriente'], menos: ['pasivoCorriente'] },
  },

  // --------------------------------------------------------------- solvencia
  {
    clave: 'endeudamientoActivo',
    etiqueta: 'Endeudamiento del activo',
    grupo: 'solvencia',
    formato: 'ratio',
    mejor: 'bajo',
    formula: { num: ['pasivo'], den: ['activo'] },
  },
  {
    clave: 'endeudamientoPatrimonial',
    etiqueta: 'Endeudamiento patrimonial',
    grupo: 'solvencia',
    formato: 'ratio',
    mejor: 'bajo',
    formula: { num: ['pasivo'], den: ['patrimonio'] },
  },
  {
    // Ni alto ni bajo es mejor: apalancarse es la forma normal de crecer y
    // también la forma normal de quebrar. Se muestra el percentil sin color.
    clave: 'apalancamiento',
    etiqueta: 'Apalancamiento',
    grupo: 'solvencia',
    formato: 'ratio',
    mejor: 'neutro',
    formula: { num: ['activo'], den: ['patrimonio'] },
  },
  {
    clave: 'solvencia',
    etiqueta: 'Solvencia (activo / pasivo)',
    grupo: 'solvencia',
    formato: 'ratio',
    mejor: 'alto',
    formula: { num: ['activo'], den: ['pasivo'] },
  },
  {
    clave: 'coberturaIntereses',
    etiqueta: 'Cobertura de intereses',
    grupo: 'solvencia',
    formato: 'ratio',
    mejor: 'alto',
    formula: { num: ['utilidadAntesImpuestos'], den: ['gastosFinancieros'] },
  },

  // ----------------------------------------------------------------- gestión
  {
    clave: 'rotacionActivo',
    etiqueta: 'Rotación del activo',
    grupo: 'gestion',
    formato: 'ratio',
    mejor: 'alto',
    formula: { num: ['ingresos'], den: ['activo'] },
  },
  {
    clave: 'impactoCostoVentas',
    etiqueta: 'Costo de ventas sobre ingresos',
    grupo: 'gestion',
    formato: 'pct',
    mejor: 'bajo',
    formula: { num: ['costoVentas'], den: ['ingresos'] },
  },
  {
    clave: 'impactoGastos',
    etiqueta: 'Gastos sobre ingresos',
    grupo: 'gestion',
    formato: 'pct',
    mejor: 'bajo',
    formula: { num: ['gastos'], den: ['ingresos'] },
  },
  {
    clave: 'cargaFinanciera',
    etiqueta: 'Carga financiera',
    grupo: 'gestion',
    formato: 'pct',
    mejor: 'bajo',
    formula: { num: ['gastosFinancieros'], den: ['ingresos'] },
  },

  // ------------------------------------------------------------ rentabilidad
  {
    clave: 'margenBruto',
    etiqueta: 'Margen bruto',
    grupo: 'rentabilidad',
    formato: 'pct',
    mejor: 'alto',
    formula: { num: ['gananciaBruta'], den: ['ingresos'] },
  },
  {
    clave: 'margenNeto',
    etiqueta: 'Margen neto',
    grupo: 'rentabilidad',
    formato: 'pct',
    mejor: 'alto',
    formula: { num: ['utilidadNeta'], den: ['ingresos'] },
  },
  {
    clave: 'roa',
    etiqueta: 'ROA (rentabilidad del activo)',
    grupo: 'rentabilidad',
    formato: 'pct',
    mejor: 'alto',
    formula: { num: ['utilidadNeta'], den: ['activo'] },
  },
  {
    clave: 'roe',
    etiqueta: 'ROE (rentabilidad del patrimonio)',
    grupo: 'rentabilidad',
    formato: 'pct',
    mejor: 'alto',
    formula: { num: ['utilidadNeta'], den: ['patrimonio'] },
  },
];

export const GRUPOS_INDICADOR: { id: DefinicionIndicador['grupo']; titulo: string }[] = [
  { id: 'liquidez', titulo: 'Liquidez' },
  { id: 'solvencia', titulo: 'Solvencia y endeudamiento' },
  { id: 'gestion', titulo: 'Gestión' },
  { id: 'rentabilidad', titulo: 'Rentabilidad' },
];

/**
 * Suma de magnitudes. Si falta UNA, la suma entera es desconocida y no cero:
 * el formulario fiscal no desglosa inventarios, y tratarlos como cero daría una
 * prueba ácida igual a la liquidez corriente, que es un número inventado.
 */
function suma(claves: string[] | undefined, m: Magnitudes): number | undefined {
  if (!claves || claves.length === 0) return 0;
  let total = 0;
  for (const clave of claves) {
    const v = m[clave];
    if (v === undefined) return undefined;
    total += v;
  }
  return total;
}

/** Evalúa una fórmula sobre las magnitudes de un ejercicio. */
export function evaluar(f: Formula, m: Magnitudes): number | null {
  const positivo = suma(f.num, m);
  const negativo = suma(f.menos, m);
  if (positivo === undefined || negativo === undefined) return null;
  const numerador = positivo - negativo;

  if (!f.den) return numerador;

  const denominador = suma(f.den, m);
  if (denominador === undefined || denominador === 0) return null;
  const r = numerador / denominador;
  return Number.isFinite(r) ? r : null;
}

/**
 * La misma fórmula, en SQL, sobre una columna `jsonb` de magnitudes.
 *
 * `col` es la expresión de esa columna (por ejemplo `bm.magnitudes`). Una clave
 * ausente en el jsonb da `NULL` y el `NULL` se propaga por toda la aritmética,
 * que es exactamente la regla 2 de arriba. El `nullif(...,0)` del denominador es
 * la regla 1.
 *
 * Las claves salen de `INDICADORES`, nunca de la petición de un cliente, así que
 * no hay nada que escapar aquí; aun así se validan para que un indicador nuevo
 * con una clave rara falle al arrancar y no al interpolarse.
 */
export function sqlDeFormula(f: Formula, col: string): string {
  const magnitud = (clave: string) => {
    if (!/^[a-zA-Z]+$/.test(clave)) {
      throw new Error(`Clave de magnitud no válida: ${clave}`);
    }
    return `(${col} ->> '${clave}')::numeric`;
  };
  const sumar = (claves: string[]) => claves.map(magnitud).join(' + ');

  let numerador = `(${sumar(f.num)})`;
  if (f.menos?.length) numerador = `(${numerador} - (${sumar(f.menos)}))`;
  if (!f.den) return numerador;
  return `(${numerador} / nullif(${sumar(f.den)}, 0))`;
}

/** Calcula todos los indicadores de un ejercicio. */
export function calcularIndicadores(m: Magnitudes): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const ind of INDICADORES) out[ind.clave] = evaluar(ind.formula, m);
  return out;
}
