import { createHash } from 'node:crypto';

/**
 * Huella de fila para la idempotencia de los importadores.
 *
 * md5 son 128 bits exactos, que es justo el tamaño de un `uuid`: se guarda en
 * una columna uuid, se compara con un memcmp de 16 bytes y no hay que lidiar
 * con el escapado de `bytea`.
 */

/** Separador de control; evita que "AB"+"C" colisione con "A"+"BC". */
export const SEPARADOR_HASH = String.fromCharCode(31);

/** md5 de un texto, formateado como uuid. */
export function comoUuid(texto: string): string {
  const h = createHash('md5').update(texto, 'utf8').digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Une los campos con el separador de control y devuelve su huella. */
export function huellaDeFila(campos: (string | number | boolean | null)[]): string {
  return comoUuid(
    campos
      .map((c) => (c === null ? '' : typeof c === 'boolean' ? (c ? '1' : '0') : String(c)))
      .join(SEPARADOR_HASH),
  );
}
