import { headerKey } from '../../../common/text/normalize';
import { SourceRow } from '../xlsx/xlsx-row-source';

/**
 * Resolución de cabeceras por alias, para los archivos que no son el Excel de
 * compañías.
 *
 * `transform/header-map.ts` hace lo mismo pero está atado a las 24 columnas de
 * la Superintendencia. Los catastros públicos tienen otras columnas y, sobre
 * todo, cambian los rótulos entre publicaciones: el catastro de exportadores de
 * servicios llama "Numero Identificacion" en 2023 a lo que en 2024 pasa a ser
 * "RUC". Resolver por nombre —y no por posición— es lo que permite cargar los
 * dos con el mismo código.
 */

/** Índice (1-based, como `cells` de ExcelJS) de cada campo encontrado. */
export type IndicePorCampo<C extends string> = Partial<Record<C, number>>;

export interface CabeceraResuelta<C extends string> {
  /** Número de la fila del archivo donde estaba la cabecera. */
  fila: number;
  indices: IndicePorCampo<C>;
  /** Rótulos del archivo que no corresponden a ningún campo conocido. */
  desconocidos: string[];
  /** Rótulos tal cual, para poder explicarlos en un mensaje de error. */
  rotulos: string[];
}

/**
 * Busca la fila de cabecera dentro de las primeras `maxFilas` y la resuelve.
 *
 * No se asume que la cabecera sea la primera fila: estos archivos empiezan con
 * un título combinado sobre todas las columnas y una o dos filas en blanco.
 * Se elige la fila que resuelve MÁS campos requeridos y se devuelve aun cuando
 * no los resuelva todos: el llamador comprueba `faltantes()` y aborta con un
 * mensaje que incluye los rótulos que sí encontró. Sólo devuelve `null` si no
 * hay ninguna fila que mirar.
 */
export function buscarCabecera<C extends string>(
  filas: SourceRow[],
  alias: Record<C, readonly string[]>,
  requeridos: C[],
  maxFilas = 15,
): CabeceraResuelta<C> | null {
  const lookup = new Map<string, C>();
  for (const campo of Object.keys(alias) as C[]) {
    for (const a of alias[campo]) if (!lookup.has(a)) lookup.set(a, campo);
  }

  let mejor: CabeceraResuelta<C> | null = null;
  let mejorCuenta = -1;

  for (const fila of filas.slice(0, maxFilas)) {
    const indices: IndicePorCampo<C> = {};
    const desconocidos: string[] = [];
    const rotulos: string[] = [];

    for (let i = 0; i < fila.cells.length; i++) {
      const raw = fila.cells[i];
      if (raw === null || raw === undefined) continue;
      const key = headerKey(typeof raw === 'object' ? ((raw as any).text ?? raw) : raw);
      if (key === '') continue;
      rotulos.push(key);
      const campo = lookup.get(key);
      // Si un rótulo se repite gana la primera aparición: en varias hojas la
      // celda del título está combinada y repite el mismo texto en cada columna.
      if (!campo) desconocidos.push(key);
      else if (indices[campo] === undefined) indices[campo] = i;
    }

    const cuenta = requeridos.filter((c) => indices[c] !== undefined).length;
    if (cuenta > mejorCuenta) {
      mejorCuenta = cuenta;
      mejor = { fila: fila.rowNumber, indices, desconocidos, rotulos };
    }
    if (cuenta === requeridos.length) return mejor;
  }

  return mejor;
}

/** Campos requeridos que la cabecera no trae. */
export function faltantes<C extends string>(
  cabecera: CabeceraResuelta<C> | null,
  requeridos: C[],
): C[] {
  if (!cabecera) return requeridos;
  return requeridos.filter((c) => cabecera.indices[c] === undefined);
}
