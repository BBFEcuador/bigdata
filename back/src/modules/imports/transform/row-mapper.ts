import { createHash } from 'node:crypto';
import { BUSINESS_COLUMNS, BusinessColumn, REQUIRED_COLUMNS } from '../imports.constants';
import {
  Coerced,
  coerceBoolean,
  coerceDate,
  coerceNumeric,
  coerceRuc,
  coerceText,
  coerceYear,
} from './coercions';
import { HeaderResolution } from './header-map';

/** Qué coerción aplica a cada columna. */
const COERCION: Record<BusinessColumn, (cell: unknown) => Coerced> = {
  expediente: coerceText,
  ruc: coerceRuc,
  nombre: coerceText,
  situacion_legal: coerceText,
  fecha_constitucion: coerceDate,
  tipo: coerceText,
  pais: coerceText,
  region: coerceText,
  provincia: coerceText,
  canton: coerceText,
  ciudad: coerceText,
  calle: coerceText,
  numero: coerceText,
  interseccion: coerceText,
  barrio: coerceText,
  telefono: coerceText,
  representante: coerceText,
  cargo: coerceText,
  capital_suscrito: coerceNumeric,
  ciiu_nivel_1: coerceText,
  ciiu_nivel_6: coerceText,
  ultimo_balance: coerceYear,
  presento_balance_inicial: coerceBoolean,
  fecha_presentacion_balance_inicial: coerceDate,
};

export interface MappedRow {
  kind: 'row';
  /** Valores en el orden EXACTO de `COPY_COLUMNS`. */
  values: (string | null)[];
  /** Avisos de celdas que no se pudieron interpretar (la fila sí se carga). */
  warnings: CellWarning[];
}

export interface RejectedRow {
  kind: 'reject';
  rowNumber: number;
  reason: string;
  raw: Record<string, unknown>;
}

export interface CellWarning {
  rowNumber: number;
  column: string;
  reason: string;
}

export type MapResult = MappedRow | RejectedRow;

/** Separador para el hash: un carácter de control que `sanitizeChars` ya eliminó. */
const HASH_SEP = String.fromCharCode(31);

/**
 * Huella de los 24 campos de negocio YA coercionados.
 *
 * Que sea sobre los valores coercionados y no sobre el texto original es lo que
 * hace que "1.000,00" y "1000.00" —o "SI" y "Sí"— produzcan el mismo hash y no
 * generen una actualización espuria al volver a subir el archivo.
 *
 * md5 son 128 bits exactos, que es justo el tamaño de un `uuid`: se guarda en
 * una columna uuid, se compara con un memcmp de 16 bytes y no hay que lidiar con
 * el escapado de `bytea` en el formato COPY.
 */
function rowHashAsUuid(businessValues: (string | null)[]): string {
  const h = createHash('md5').update(businessValues.join(HASH_SEP), 'utf8').digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * Convierte una fila cruda de ExcelJS en la línea de valores del COPY.
 *
 * Devuelve un rechazo (la fila no se carga) sólo si falta una columna
 * obligatoria. Cualquier otro problema de celda es un aviso: la celda queda en
 * NULL y la fila entra igual, porque perder una compañía entera por un teléfono
 * mal escrito sería peor que el propio dato malo.
 */
export function mapRow(
  rowNumber: number,
  cells: unknown[],
  header: HeaderResolution,
): MapResult {
  const businessValues: (string | null)[] = [];
  const warnings: CellWarning[] = [];

  for (const col of BUSINESS_COLUMNS) {
    const idx = header.indexByColumn[col];
    const cell = idx === undefined ? null : cells[idx];
    const { value, error } = COERCION[col](cell);
    if (error) warnings.push({ rowNumber, column: col, reason: error });
    businessValues.push(value);
  }

  for (const required of REQUIRED_COLUMNS) {
    const pos = BUSINESS_COLUMNS.indexOf(required);
    if (businessValues[pos] === null) {
      return {
        kind: 'reject',
        rowNumber,
        reason: `columna_obligatoria_vacia:${required}`,
        raw: rawSnapshot(cells, header),
      };
    }
  }

  return {
    kind: 'row',
    values: [String(rowNumber), ...businessValues, rowHashAsUuid(businessValues)],
    warnings,
  };
}

/** Copia recortada de la fila original, para poder diagnosticar el rechazo. */
function rawSnapshot(cells: unknown[], header: HeaderResolution): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const col of BUSINESS_COLUMNS) {
    const idx = header.indexByColumn[col];
    if (idx === undefined) continue;
    const v = cells[idx];
    if (v === null || v === undefined) continue;
    out[col] = typeof v === 'object' ? String((v as any).text ?? '[objeto]') : v;
  }
  return out;
}
