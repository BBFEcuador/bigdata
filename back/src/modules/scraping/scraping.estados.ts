/**
 * La máquina de estados de un job de scraping, declarada como dato.
 *
 * ## Esto NO es donde se valida
 *
 * La validación de verdad es el `WHERE estado IN (...)` de cada UPDATE del
 * servicio. Comprobar aquí con un SELECT previo y luego escribir sería una
 * carrera con el despachador: entre la lectura y la escritura, el job puede
 * haber sido reclamado.
 *
 * Lo que hay aquí sirve para dos cosas: para que un test afirme sobre la
 * máquina completa, y para que la pantalla sepa qué botones habilitar sin
 * repetir las reglas en JavaScript.
 */

export type EstadoScraping =
  | 'encolado'
  | 'corriendo'
  | 'pausado'
  | 'completado'
  | 'fallido'
  | 'cancelado';

export type AccionSolicitada = 'pausar' | 'cancelar';

/** Ocupan sitio: mientras un job esté en uno de estos, no se puede crear otro. */
export const ESTADOS_ACTIVOS: readonly EstadoScraping[] = ['encolado', 'corriendo', 'pausado'];

/** El job ya no se mueve solo. Sólo el usuario puede resucitarlo. */
export const ESTADOS_TERMINALES: readonly EstadoScraping[] = [
  'completado',
  'fallido',
  'cancelado',
];

/**
 * Adónde puede ir cada estado.
 *
 * Dos transiciones que parecen razonables y no están, a propósito:
 *
 * - `pausado -> corriendo` directo. Reanudar va SIEMPRE por `encolado`. Si el
 *   endpoint escribiera `corriendo`, no habría nadie ejecutando ese job (nadie
 *   lo reclamó) y además reanudar 500 de golpe se saltaría el tope de workers.
 * - `completado -> *`. Volver a rastrear es un job nuevo. El historial de una
 *   compañía es su lista de jobs, no un job mutando para siempre.
 */
export const TRANSICIONES: Record<EstadoScraping, readonly EstadoScraping[]> = {
  encolado: ['corriendo', 'pausado', 'cancelado'],
  corriendo: ['completado', 'fallido', 'encolado', 'pausado', 'cancelado'],
  pausado: ['encolado', 'cancelado'],
  completado: [],
  fallido: ['encolado'],
  cancelado: ['encolado'],
};

export function esTransicionLegal(desde: EstadoScraping, hasta: EstadoScraping): boolean {
  return TRANSICIONES[desde]?.includes(hasta) ?? false;
}

export function esTerminal(estado: EstadoScraping): boolean {
  return ESTADOS_TERMINALES.includes(estado);
}

/**
 * Desde qué estados tiene sentido cada acción del usuario.
 *
 * El servicio usa exactamente estas listas en el `WHERE` de su UPDATE, así que
 * la tabla de arriba y el SQL no pueden desincronizarse sin que falle el test.
 */
export const ORIGENES_ACCION = {
  pausar: ['encolado', 'corriendo'] as readonly EstadoScraping[],
  reanudar: ['pausado'] as readonly EstadoScraping[],
  cancelar: ['encolado', 'corriendo', 'pausado'] as readonly EstadoScraping[],
  reintentar: ['fallido', 'cancelado'] as readonly EstadoScraping[],
};

export type AccionUsuario = keyof typeof ORIGENES_ACCION;

/** Etiquetas para mensajes de error del API. La pantalla tiene las suyas. */
export const ETIQUETA_ESTADO: Record<EstadoScraping, string> = {
  encolado: 'en cola',
  corriendo: 'corriendo',
  pausado: 'pausado',
  completado: 'completado',
  fallido: 'fallido',
  cancelado: 'cancelado',
};
