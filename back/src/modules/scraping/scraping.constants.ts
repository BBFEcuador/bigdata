/** Ajustes del sistema de scraping. Todos con valor por defecto razonable. */

const num = (nombre: string, porDefecto: number): number => {
  const v = Number(process.env[nombre]);
  return Number.isFinite(v) && v > 0 ? v : porDefecto;
};

/**
 * Cuántos jobs corren a la vez EN ESTE PROCESO.
 *
 * Es un tope por proceso, no global: dos instancias del backend dan el doble.
 * `FOR UPDATE SKIP LOCKED` y los advisory locks hacen que eso sea correcto (no
 * se pisan), pero no lo limitan. Si algún día se despliega en varias
 * instancias, el tope tendría que contar los 'corriendo' en la base.
 */
export const CONCURRENCIA = num('SCRAPING_CONCURRENCIA', 4);

/** Cuánto duerme el bucle cuando no hay nada que reclamar. */
export const INTERVALO_OCIOSO_MS = num('SCRAPING_INTERVALO_OCIOSO_MS', 2000);

/** Cada cuántas vueltas del bucle se vuelve a barrer en busca de jobs muertos. */
export const TICKS_POR_BARRIDO = num('SCRAPING_TICKS_POR_BARRIDO', 60);

/** Margen que se da a los jobs en vuelo al apagar antes de soltarlos. */
export const ESPERA_APAGADO_MS = num('SCRAPING_ESPERA_APAGADO_MS', 10_000);

/** Intentos por defecto de un job nuevo. */
export const MAX_INTENTOS = num('SCRAPING_MAX_INTENTOS', 3);

/** Base del backoff exponencial entre reintentos: 30 s, 60 s, 120 s… */
export const BACKOFF_BASE_MS = num('SCRAPING_BACKOFF_BASE_MS', 30_000);

/** Tope del backoff, para que un job con muchos intentos no se duerma horas. */
export const BACKOFF_MAX_MS = num('SCRAPING_BACKOFF_MAX_MS', 600_000);

/** Cuántas filas devuelve el listado por página. */
export const LIMITE_LISTADO = 100;

/** Cuántos eventos acompañan al detalle de un job. */
export const EVENTOS_EN_DETALLE = 20;

/** Tope del alta masiva en una sola llamada. */
export const LIMITE_MASIVO = 50_000;

/** Quién firma lo que mueve la máquina y no una persona. */
export const USUARIO_SISTEMA = 'sistema';

export function calcularBackoffMs(intento: number): number {
  return Math.min(BACKOFF_BASE_MS * 2 ** Math.max(0, intento - 1), BACKOFF_MAX_MS);
}
