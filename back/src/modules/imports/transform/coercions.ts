import { deaccent, nullify } from '../../../common/text/normalize';

/**
 * Reglas de coerción de cada columna del Excel de la Superintendencia.
 *
 * Todas las funciones son puras y devuelven `{ value, error? }`:
 *   - `value` es la representación en texto lista para el formato COPY, o `null`.
 *   - `error` describe por qué no se pudo interpretar la celda; el llamador lo
 *     registra en `import_row_reject` junto al número de fila.
 *
 * Nunca lanzan excepciones: una celda basura entre un millón no puede tumbar
 * el import.
 */
export interface Coerced {
  value: string | null;
  error?: string;
}

const ok = (value: string | null): Coerced => ({ value });
const bad = (error: string): Coerced => ({ value: null, error });

/**
 * Reduce un valor de celda de ExcelJS a un primitivo.
 *
 * ExcelJS NO siempre devuelve primitivos: las celdas con formato enriquecido,
 * hipervínculos y fórmulas llegan como objetos. Sin este paso acaba un
 * "[object Object]" almacenado como razón social.
 */
export function cellToRaw(cell: unknown): string | number | boolean | Date | null {
  if (cell === null || cell === undefined) return null;
  if (cell instanceof Date) return cell;
  const t = typeof cell;
  if (t === 'string' || t === 'number' || t === 'boolean') {
    return cell as string | number | boolean;
  }
  if (t === 'object') {
    const o = cell as Record<string, unknown>;
    // Celda de error: #N/A, #VALUE!, ...
    if (typeof o.error === 'string') return null;
    // Texto enriquecido: { richText: [{ text }, ...] }
    if (Array.isArray(o.richText)) {
      return o.richText.map((r: { text?: string }) => r?.text ?? '').join('');
    }
    // Fórmula: el valor útil está en `result` (puede ser otro objeto).
    if ('result' in o) return cellToRaw(o.result);
    // Hipervínculo: { text, hyperlink }
    if (typeof o.text === 'string') return o.text;
  }
  return null;
}

/** Texto libre: limpieza, colapso de espacios y marcadores de vacío a NULL. */
export function coerceText(cell: unknown): Coerced {
  const raw = cellToRaw(cell);
  if (raw === null) return ok(null);
  if (raw instanceof Date) return ok(formatDateUTC(raw));
  return ok(nullify(String(raw)));
}

/**
 * RUC ecuatoriano: 13 dígitos, SIEMPRE texto.
 *
 * Los dos primeros dígitos son el código de provincia (01–24), así que una
 * parte enorme de los RUC empieza por cero. Si la columna se guardó como número
 * en Excel, ExcelJS entrega 190123456001 y el cero inicial ya se perdió: por eso
 * se recupera con padding hasta 13. Nunca `parseInt`, nunca columna numérica.
 */
export function coerceRuc(cell: unknown): Coerced {
  const raw = cellToRaw(cell);
  if (raw === null) return ok(null);

  let s: string;
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return bad('ruc_no_numerico');
    s = raw.toFixed(0); // 13 dígitos caben exactos en un double
  } else {
    s = String(raw);
  }

  s = s.replace(/\D/g, '');
  if (s === '') return ok(null);
  if (s.length > 13) return bad(`ruc_demasiado_largo:${s.length}`);
  if (s.length < 13) s = s.padStart(13, '0');

  const provincia = Number(s.slice(0, 2));
  if (provincia < 1 || provincia > 24) {
    // Dato sucio real: se conserva el valor, sólo se deja constancia.
    return { value: s, error: `ruc_provincia_fuera_de_rango:${s.slice(0, 2)}` };
  }
  return ok(s);
}

/** Formatea un Date como YYYY-MM-DD leyendo SIEMPRE en UTC. */
function formatDateUTC(d: Date): string | null {
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Valida que y/m/d formen una fecha real (rechaza 31/02) y la formatea. */
function buildDate(y: number, m: number, d: number): string | null {
  if (y < 1800 || y > new Date().getUTCFullYear() + 1) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  // Si JS "rodó" la fecha (31/02 -> 03/03) los componentes no coinciden.
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return null;
  }
  return formatDateUTC(dt);
}

const MESES_ES: Record<string, number> = {
  ENE: 1, FEB: 2, MAR: 3, ABR: 4, MAY: 5, JUN: 6,
  JUL: 7, AGO: 8, SEP: 9, SET: 9, OCT: 10, NOV: 11, DIC: 12,
};

/**
 * Fecha. Acepta Date nativo, serial de Excel y texto.
 *
 * En texto el orden es DÍA PRIMERO (convención ecuatoriana): "03/04/1998" es el
 * 3 de abril, no el 4 de marzo. Jamás se delega en `new Date(string)`, que
 * interpretaría mes primero.
 */
export function coerceDate(cell: unknown): Coerced {
  const raw = cellToRaw(cell);
  if (raw === null) return ok(null);

  if (raw instanceof Date) {
    const v = formatDateUTC(raw);
    return v ? ok(v) : bad('fecha_invalida');
  }

  if (typeof raw === 'number') {
    const v = fromExcelSerial(raw);
    return v ? ok(v) : bad(`fecha_serial_fuera_de_rango:${raw}`);
  }

  const s = nullify(String(raw));
  if (s === null) return ok(null);

  // DD/MM/YYYY o DD-MM-YYYY (también con año de 2 dígitos)
  let m = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})$/.exec(s);
  if (m) {
    let year = Number(m[3]);
    if (m[3].length === 2) year = year <= 30 ? 2000 + year : 1900 + year;
    const v = buildDate(year, Number(m[2]), Number(m[1]));
    return v ? ok(v) : bad(`fecha_invalida:${s}`);
  }

  // YYYY-MM-DD / YYYY/MM/DD (no ambiguo)
  m = /^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})/.exec(s);
  if (m) {
    const v = buildDate(Number(m[1]), Number(m[2]), Number(m[3]));
    return v ? ok(v) : bad(`fecha_invalida:${s}`);
  }

  // DD-MMM-YYYY con mes abreviado en español
  m = /^(\d{1,2})[\s/\-.]+([A-Za-zÁÉÍÓÚáéíóú]{3,10})[\s/\-.]+(\d{2}|\d{4})$/.exec(s);
  if (m) {
    const mes = MESES_ES[deaccent(m[2]).toUpperCase().slice(0, 3)];
    if (mes) {
      let year = Number(m[3]);
      if (m[3].length === 2) year = year <= 30 ? 2000 + year : 1900 + year;
      const v = buildDate(year, mes, Number(m[1]));
      return v ? ok(v) : bad(`fecha_invalida:${s}`);
    }
  }

  return bad(`fecha_no_reconocida:${s.slice(0, 40)}`);
}

/**
 * Serial de Excel -> YYYY-MM-DD.
 * La época es 1899-12-30 y el serial 60 es el 29-feb-1900 inexistente.
 */
function fromExcelSerial(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 1 || serial > 80_000) return null;
  if (Math.floor(serial) === 60) return null;
  const ms = (serial - 25569) * 86_400_000;
  return formatDateUTC(new Date(Math.round(ms)));
}

/**
 * Importe monetario -> numeric(18,2).
 *
 * El separador decimal es ambiguo entre exportaciones ("1.234.567,89" y
 * "1234567.89" conviven), así que se decide por el separador MÁS A LA DERECHA.
 */
export function coerceNumeric(cell: unknown): Coerced {
  const raw = cellToRaw(cell);
  if (raw === null) return ok(null);

  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return bad('capital_no_finito');
    if (Math.abs(raw) >= 1e16) return bad('capital_fuera_de_rango');
    return ok(raw.toFixed(2));
  }

  const cleaned = nullify(String(raw));
  if (cleaned === null) return ok(null);

  let s = cleaned.replace(/[^\d.,-]/g, ''); // quita USD, $, espacios
  if (s === '' || s === '-') return ok(null);

  const lastDot = s.lastIndexOf('.');
  const lastComma = s.lastIndexOf(',');

  if (lastDot >= 0 && lastComma >= 0) {
    // El de más a la derecha manda; el otro es separador de miles.
    if (lastComma > lastDot) s = s.split('.').join('').replace(',', '.');
    else s = s.split(',').join('');
  } else if (lastComma >= 0) {
    const decimals = s.length - lastComma - 1;
    const single = s.indexOf(',') === lastComma;
    s = single && decimals >= 1 && decimals <= 2 ? s.replace(',', '.') : s.split(',').join('');
  } else if (lastDot >= 0) {
    const decimals = s.length - lastDot - 1;
    const single = s.indexOf('.') === lastDot;
    if (single && decimals >= 1 && decimals <= 2) {
      // ya está en formato con punto decimal
    } else {
      // "1.234" es mucho más habitual como miles que como 1 unidad con decimales
      s = s.split('.').join('');
    }
  }

  const n = Number(s);
  if (!Number.isFinite(n)) return bad(`capital_no_numerico:${cleaned.slice(0, 40)}`);
  if (Math.abs(n) >= 1e16) return bad('capital_fuera_de_rango');
  return ok(n.toFixed(2));
}

/**
 * SI/NO -> boolean.
 * Un valor desconocido es NULL, no `false`: "no sabemos" y "no" son cosas
 * distintas y colapsarlas falsea cualquier conteo posterior.
 */
export function coerceBoolean(cell: unknown): Coerced {
  const raw = cellToRaw(cell);
  if (raw === null) return ok(null);
  if (typeof raw === 'boolean') return ok(raw ? 't' : 'f');

  const s = nullify(String(raw));
  if (s === null) return ok(null);

  const k = deaccent(s).toUpperCase();
  if (['SI', 'S', 'X', '1', 'TRUE', 'VERDADERO', 'V', 'Y', 'YES'].includes(k)) return ok('t');
  if (['NO', 'N', '0', 'FALSE', 'FALSO', 'F'].includes(k)) return ok('f');
  return bad(`booleano_no_reconocido:${s.slice(0, 20)}`);
}

/**
 * Año del último balance -> smallint.
 *
 * El rango es la parte importante: si el archivo trae un IMPORTE en esta
 * columna, el filtro lo convierte en NULL en vez de reventar el COPY con un
 * desbordamiento de smallint a mitad de la carga.
 */
export function coerceYear(cell: unknown): Coerced {
  const raw = cellToRaw(cell);
  if (raw === null) return ok(null);

  let year: number | null = null;
  if (raw instanceof Date) year = raw.getUTCFullYear();
  else if (typeof raw === 'number') {
    year = raw > 3000 ? null : Math.trunc(raw);
    if (year === null) {
      const asDate = fromExcelSerial(raw);
      if (asDate) year = Number(asDate.slice(0, 4));
    }
  } else {
    const s = nullify(String(raw));
    if (s === null) return ok(null);
    const m = /(\d{4})/.exec(s);
    if (m) year = Number(m[1]);
  }

  if (year === null) return bad('anio_no_reconocido');
  const max = new Date().getUTCFullYear() + 1;
  if (year < 1900 || year > max) return bad(`anio_fuera_de_rango:${year}`);
  return ok(String(year));
}
