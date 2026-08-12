import { nullify } from '../../../common/text/normalize';
import { SourceRow } from '../xlsx/xlsx-row-source';

/**
 * Parseo del catálogo CIIU.
 *
 * El archivo no tiene el nombre en una columna, sino repartido en SEIS, una por
 * nivel jerárquico: el nombre de cada fila está en la única columna B-G que le
 * corresponde por su profundidad.
 *
 *   A          -> B (Sección)
 *   A01        -> C (División)
 *   A011       -> D (Grupo)
 *   A0111      -> E (Clase)
 *   A01111     -> F (Subclase)
 *   A011111    -> G (Actividad Económica)
 */

/** Primera y última columna con datos. Ver AVISO abajo. */
const COL_CODIGO = 1;
const COL_NIVEL_MIN = 2; // B = Sección
const COL_NIVEL_MAX = 7; // G = Actividad Económica
const COL_APLICACION = 8;

/**
 * AVISO: hay que leer SÓLO hasta la columna H.
 *
 * Las columnas J-L del archivo contienen una leyenda ("nivel 1 = Sección", …)
 * que ocupa las MISMAS filas que los primeros datos. Cualquier lectura que
 * recorra "todas las columnas con contenido" se tragaría esa leyenda como si
 * fueran nombres de nivel.
 */

export const NOMBRE_NIVEL: Record<number, string> = {
  1: 'Sección',
  2: 'División',
  3: 'Grupo',
  4: 'Clase',
  5: 'Subclase',
  6: 'Actividad Económica',
};

export interface ActividadCruda {
  codigo: string;
  nombre: string;
  /** Nivel según en qué columna venía el nombre (1-6). */
  nivelColumna: number;
  aplicacion: string | null;
  fila: number;
}

export interface RechazoFila {
  fila: number;
  motivo: string;
  raw: Record<string, unknown>;
}

export interface ResultadoParseoCiiu {
  actividades: ActividadCruda[];
  rechazos: RechazoFila[];
  duplicados: number;
}

/** Reduce un valor de celda de ExcelJS a texto plano. */
function texto(celda: unknown): string {
  if (celda === null || celda === undefined) return '';
  if (typeof celda === 'string') return celda;
  if (typeof celda === 'number' || typeof celda === 'boolean') return String(celda);
  if (celda instanceof Date) return '';
  if (typeof celda === 'object') {
    const o = celda as Record<string, unknown>;
    if (Array.isArray(o.richText)) {
      return o.richText.map((r: { text?: string }) => r?.text ?? '').join('');
    }
    if ('result' in o) return texto(o.result);
    if (typeof o.text === 'string') return o.text;
  }
  return '';
}

/** Un código CIIU es una letra de sección seguida de dígitos. */
const CODIGO_VALIDO = /^[A-Z]\d*$/;

/** ¿Es ésta la fila de cabecera? La reconocemos por la celda A. */
function esCabecera(cells: unknown[]): boolean {
  const a = nullify(texto(cells[COL_CODIGO]));
  return a !== null && /C[ÓO]DIGO\s+CIIU/i.test(a);
}

/**
 * Convierte las filas crudas del XLSX en actividades.
 *
 * Descarta todo lo anterior a la fila de cabecera (título combinado incluido) y
 * a partir de ahí procesa cada fila que tenga código.
 */
export function parsearCiiu(filas: SourceRow[]): ResultadoParseoCiiu {
  const actividades: ActividadCruda[] = [];
  const rechazos: RechazoFila[] = [];
  const vistos = new Map<string, number>();
  let duplicados = 0;
  let cabeceraVista = false;

  for (const { rowNumber, cells } of filas) {
    if (!cabeceraVista) {
      if (esCabecera(cells)) cabeceraVista = true;
      continue; // el título y la cabecera nunca son datos
    }

    const codigo = (nullify(texto(cells[COL_CODIGO])) ?? '').toUpperCase().replace(/\s+/g, '');
    if (codigo === '') continue; // fila vacía al final de la hoja

    if (!CODIGO_VALIDO.test(codigo)) {
      rechazos.push({
        fila: rowNumber,
        motivo: `codigo_invalido: "${codigo.slice(0, 40)}" (se esperaba letra + dígitos)`,
        raw: { codigo },
      });
      continue;
    }

    // El nombre está en una sola de las columnas B-G. Si hubiera varias, gana la
    // más profunda (la de más a la derecha), que es la que describe la fila.
    let nivelColumna = 0;
    let nombre: string | null = null;
    for (let c = COL_NIVEL_MIN; c <= COL_NIVEL_MAX; c++) {
      const v = nullify(texto(cells[c]));
      if (v !== null) {
        nivelColumna = c - COL_NIVEL_MIN + 1;
        nombre = v;
      }
    }

    if (nombre === null) {
      rechazos.push({
        fila: rowNumber,
        motivo: 'sin_nombre: ninguna de las columnas de nivel tiene texto',
        raw: { codigo },
      });
      continue;
    }

    const aplicacion = nullify(texto(cells[COL_APLICACION]));

    // Gana la última aparición, como en los otros importadores: un código
    // repetido reventaría el ON CONFLICT del upsert.
    const previo = vistos.get(codigo);
    const item: ActividadCruda = { codigo, nombre, nivelColumna, aplicacion, fila: rowNumber };
    if (previo !== undefined) {
      duplicados++;
      actividades[previo] = item;
      continue;
    }
    vistos.set(codigo, actividades.length);
    actividades.push(item);
  }

  return { actividades, rechazos, duplicados };
}
