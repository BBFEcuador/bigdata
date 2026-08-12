/**
 * Filtro por pertenencia a un catastro público, compartido por los listados de
 * compañías, personas naturales y sociedades no supervisadas.
 *
 * Las tres tablas tienen exactamente las mismas columnas `turismo_*` y
 * `exportador_*_anios`, porque el catastro no distingue: reparte sus RUC entre
 * las tres poblaciones. Escribir el filtro una sola vez es lo que impide que
 * "exportador de servicios en 2026" signifique una cosa en compañías y otra en
 * personas naturales.
 */

export const CATASTROS_FILTRABLES = [
  'turismo',
  'turismo_ratificado',
  'exportador',
  'exportador_bienes_ir',
  'exportador_bienes_iva',
  'exportador_servicios_iva',
  'ninguno',
] as const;

export type CatastroFiltrable = (typeof CATASTROS_FILTRABLES)[number];

/** Columna de años de cada catastro de exportadores. */
const COLUMNA: Record<string, string> = {
  exportador_bienes_ir: 'exportador_bienes_ir_anios',
  exportador_bienes_iva: 'exportador_bienes_iva_anios',
  exportador_servicios_iva: 'exportador_servicios_iva_anios',
};

const TODAS_LAS_COLUMNAS = Object.values(COLUMNA);

export interface CondicionCatastro {
  sql: string;
  params: Record<string, unknown>;
}

/**
 * Construye la condición SQL del filtro, o `null` si no hay filtro que aplicar.
 *
 * @param alias  alias de la tabla en la consulta (`c`, `p`, …)
 * @param valor  uno de `CATASTROS_FILTRABLES`
 * @param anio   año de aplicación; sólo aplica a los catastros de exportadores
 */
export function condicionCatastro(
  alias: string,
  valor: string | undefined,
  anio?: number,
): CondicionCatastro | null {
  const sql = sqlCatastro(alias, valor, anio, ':catastroAnio');
  if (sql === null) return null;
  return { sql, params: anio === undefined ? {} : { catastroAnio: anio } };
}

/**
 * La misma condición para consultas con parámetros posicionales (`$1`, `$2`),
 * que es como está escrito el listado del padrón.
 *
 * @param indice posición que ocupará el año en el array de parámetros
 */
export function condicionCatastroPosicional(
  alias: string,
  valor: string | undefined,
  anio: number | undefined,
  indice: number,
): { sql: string; usaAnio: boolean } | null {
  const sql = sqlCatastro(alias, valor, anio, `$${indice}`);
  if (sql === null) return null;
  return { sql, usaAnio: anio !== undefined && sql.includes(`$${indice}`) };
}

/**
 * Años de aplicación cargados de cada catastro de exportadores.
 *
 * Los desplegables de año salen de aquí y no de una constante: los catastros no
 * cubren los mismos ejercicios —la rebaja de renta llega a 2024 y el de IVA a
 * 2026— y ofrecer un año que no existe da siempre cero resultados.
 */
export async function aniosPorCatastro(
  query: (sql: string) => Promise<{ catastro: string; anio: number }[]>,
): Promise<Record<string, number[]>> {
  const filas = await query(
    `SELECT catastro, anio FROM catastro_sri
      WHERE ausente_desde_job IS NULL
      GROUP BY catastro, anio ORDER BY catastro, anio DESC`,
  );
  const out: Record<string, number[]> = {};
  for (const f of filas) (out[f.catastro] ??= []).push(Number(f.anio));
  return out;
}

/** Cuerpo común: el placeholder del año lo pone el llamador. */
function sqlCatastro(
  alias: string,
  valor: string | undefined,
  anio: number | undefined,
  ph: string,
): string | null {
  if (!valor) return null;
  if (!CATASTROS_FILTRABLES.includes(valor as CatastroFiltrable)) return null;

  const a = alias;

  if (valor === 'turismo') return `${a}.turismo_registros IS NOT NULL`;
  if (valor === 'turismo_ratificado') return `${a}.turismo_ratificado IS TRUE`;

  if (valor === 'ninguno') {
    // "En ninguno" incluye el turismo: es la lista de los que no tienen ningún
    // beneficio ni registro, que es como se usa para descartar.
    const nulas = [...TODAS_LAS_COLUMNAS, 'turismo_registros']
      .map((c) => `${a}.${c} IS NULL`)
      .join(' AND ');
    return `(${nulas})`;
  }

  if (valor === 'exportador') {
    // Sin año: basta con estar en cualquiera de los tres, en cualquier
    // ejercicio. Con año: en cualquiera de los tres, ese año.
    if (anio === undefined) {
      return `(${TODAS_LAS_COLUMNAS.map((c) => `${a}.${c} IS NOT NULL`).join(' OR ')})`;
    }
    return `(${TODAS_LAS_COLUMNAS.map((c) => `${ph} = ANY(${a}.${c})`).join(' OR ')})`;
  }

  const columna = COLUMNA[valor];
  if (anio === undefined) return `${a}.${columna} IS NOT NULL`;
  return `${ph} = ANY(${a}.${columna})`;
}
