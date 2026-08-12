/**
 * Qué es un "sujeto" rastreable.
 *
 * El par `(tipo_sujeto, clave)` no se inventa aquí: viene de la migración 9000,
 * donde ya lo usan `segmento_miembro`, `segmento_evento` y
 * `sujeto_estado_comercial`, y `perfil_comercial` lo expone con un índice
 * único. `clave` es el **expediente** para una compañía y el **RUC** para las
 * otras dos poblaciones, porque el SRI no conoce el expediente y nunca lo
 * conocerá.
 */

export const TIPOS_SUJETO = ['compania', 'persona_natural', 'sociedad_no_supervisada'] as const;

export type TipoSujeto = (typeof TIPOS_SUJETO)[number];

export function esTipoSujeto(v: unknown): v is TipoSujeto {
  return typeof v === 'string' && (TIPOS_SUJETO as readonly string[]).includes(v);
}

/**
 * De dónde se comprueba que el sujeto existe.
 *
 * Contra la tabla de origen y no contra `perfil_comercial`: la vista es
 * materializada y se reconstruye cada tanto, así que un sujeto recién
 * importado no estaría en ella y se rechazaría un job válido.
 *
 * Estos nombres se interpolan en el SQL —no se pueden parametrizar, un
 * identificador no es un valor—, así que la tabla es **cerrada y constante**
 * y el índice sólo puede venir de un `TipoSujeto` ya validado. Nada de esto
 * toca nunca la entrada del usuario.
 */
export const ORIGEN_SUJETO: Record<TipoSujeto, { tabla: string; columna: string }> = {
  compania: { tabla: 'companias', columna: 'expediente' },
  persona_natural: { tabla: 'persona_natural', columna: 'ruc' },
  sociedad_no_supervisada: { tabla: 'sociedad_no_supervisada', columna: 'ruc' },
};

/** Para que un 404 diga «no existe la persona natural X» y no un código. */
export const ETIQUETA_SUJETO: Record<TipoSujeto, string> = {
  compania: 'la compañía',
  persona_natural: 'la persona natural',
  sociedad_no_supervisada: 'la sociedad no supervisada',
};
