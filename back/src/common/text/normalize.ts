/**
 * Utilidades de normalización de texto compartidas por el importador.
 * Sin dependencias externas: `String.prototype.normalize` y `\p{Diacritic}`
 * son suficientes para español y el target del proyecto es ES2021.
 */

const CHAR_SPACE = 32;
const CHAR_DEL = 127;
const CHAR_NBSP = 0xa0;
const CHAR_REPLACEMENT = 0xfffd;

/** Quita tildes y diacríticos: "SITUACIÓN" -> "SITUACION". */
export function deaccent(value: string): string {
  return value.normalize('NFD').replace(/\p{Diacritic}/gu, '');
}

/**
 * Sustituye por espacio todo carácter de control, el NBSP y el carácter de
 * reemplazo Unicode.
 *
 * El byte nulo es el motivo real de esta función: Postgres no puede almacenarlo
 * en una columna `text` y aborta el COPY entero con "invalid byte sequence" — a
 * mitad del stream, después de cientos de miles de filas ya enviadas.
 *
 * Se sustituye por espacio en vez de borrarse para no pegar palabras entre sí:
 * un salto de línea dentro de una razón social debe dejar "ACME S.A.", no
 * "ACMES.A.". El colapso posterior de espacios se encarga del resto.
 */
export function sanitizeChars(value: string): string {
  let out = '';
  let dirty = false;
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code < CHAR_SPACE || code === CHAR_DEL || code === CHAR_NBSP || code === CHAR_REPLACEMENT) {
      out += ' ';
      dirty = true;
    } else {
      out += value[i];
    }
  }
  return dirty ? out : value;
}

/** Colapsa espacios y recorta los extremos. */
export function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/**
 * Clave canónica de una cabecera, robusta a tildes, mayúsculas, NBSP,
 * espacios dobles y separadores variados.
 *
 * "SITUACIÓN LEGAL", "situacion  legal" y "Situacion_Legal" -> "SITUACION_LEGAL"
 */
export function headerKey(value: unknown): string {
  return deaccent(sanitizeChars(String(value ?? '')))
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Marcadores que en estos archivos significan "sin dato". */
const BLANK_TOKENS = new Set([
  '',
  '-',
  '--',
  '---',
  '.',
  'N/A',
  'NA',
  'N.A.',
  'S/N',
  'SN',
  'NULL',
  'NONE',
  'NINGUNO',
  'NINGUNA',
  'NO APLICA',
  'NO DISPONIBLE',
  'SIN DATO',
  'SIN DATOS',
  'SIN INFORMACION',
  'SIN NOMBRE',
  '#N/A',
  '#VALUE!',
  '0000-00-00',
]);

/**
 * Limpia un texto y devuelve `null` si equivale a "vacío".
 *
 * Ojo: la comparación se hace sobre una versión en mayúsculas y sin tildes,
 * pero lo que se devuelve conserva el texto original (acentos y capitalización).
 */
export function nullify(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const cleaned = collapseWhitespace(sanitizeChars(String(value)));
  if (cleaned === '') return null;
  return BLANK_TOKENS.has(deaccent(cleaned).toUpperCase()) ? null : cleaned;
}
