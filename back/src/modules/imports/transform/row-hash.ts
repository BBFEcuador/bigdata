import { createHash } from 'node:crypto';

/** Separador de control para el hash; evita que "AB"+"C" colisione con "A"+"BC". */
const SEPARADOR = String.fromCharCode(31);

/**
 * Huella de una fila como uuid, para detectar "esta fila no ha cambiado" sin
 * comparar columna a columna.
 *
 * md5 (128 bits) formateado como uuid: es la misma convención que usan los
 * importadores de compañías, catálogo y CIIU. No es un hash criptográfico ni
 * pretende serlo — sólo tiene que distinguir dos versiones de la misma fila.
 */
export function huellaDeFila(valores: unknown[]): string {
  const texto = valores.map((v) => (v === null || v === undefined ? '' : String(v))).join(SEPARADOR);
  const h = createHash('md5').update(texto, 'utf8').digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
