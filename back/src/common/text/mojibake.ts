/**
 * Reparación de texto doblemente codificado (mojibake).
 *
 * La API de DataPortal devuelve JSON UTF-8 válido, pero el contenido ya venía
 * mal de origen: sus bytes UTF-8 fueron interpretados como Windows-1252 y
 * vueltos a codificar. El resultado es un JSON perfectamente parseable con el
 * texto roto dentro:
 *
 *     TUBAY CARREÃ‘O        ->  TUBAY CARREÑO
 *     RECOLECCIÃ“N          ->  RECOLECCIÓN
 *     COMPAÃ‘ÃA            ->  COMPAÑÍA
 *
 * Es el mismo peligro que el Latin-1 de los archivos de la Superintendencia:
 * no falla, entra corrupto. Y aquí es peor, porque afecta a NOMBRES DE PERSONAS
 * y a números de cédula asociados: un "CARREÃ‘O" guardado así no se encuentra
 * nunca buscando "CARREÑO".
 *
 * La reparación es exactamente la inversa: codificar el texto en Windows-1252 y
 * decodificarlo como UTF-8.
 */

/**
 * Windows-1252 no es ISO-8859-1: difiere en el rango 0x80–0x9F, y justo ahí
 * están los caracteres que produce el mojibake más común (`“`, `‘`, `€`, `™`).
 * Node no sabe codificar a cp1252, así que la tabla va explícita.
 */
const CP1252_ALTOS: Record<number, number> = {
  0x20ac: 0x80, // €
  0x201a: 0x82, // ‚
  0x0192: 0x83, // ƒ
  0x201e: 0x84, // „
  0x2026: 0x85, // …
  0x2020: 0x86, // †
  0x2021: 0x87, // ‡
  0x02c6: 0x88, // ˆ
  0x2030: 0x89, // ‰
  0x0160: 0x8a, // Š
  0x2039: 0x8b, // ‹
  0x0152: 0x8c, // Œ
  0x017d: 0x8e, // Ž
  0x2018: 0x91, // ‘
  0x2019: 0x92, // ’
  0x201c: 0x93, // “
  0x201d: 0x94, // ”
  0x2022: 0x95, // •
  0x2013: 0x96, // –
  0x2014: 0x97, // —
  0x02dc: 0x98, // ˜
  0x2122: 0x99, // ™
  0x0161: 0x9a, // š
  0x203a: 0x9b, // ›
  0x0153: 0x9c, // œ
  0x017e: 0x9e, // ž
  0x0178: 0x9f, // Ÿ
};

/**
 * La firma del mojibake: una `Â`, `Ã`, `â`, `ð` o `Ñ` seguida de un carácter
 * del rango alto. Sin esta comprobación, un texto ya correcto que contenga
 * "Ã" legítimamente (raro, pero existe) se destrozaría al "repararlo".
 */
const SOSPECHA = /[ÂÃâàáäåæçèéêëìíîïðñòóôõö][-¿–-›Œ-Ÿ€]/;

export function pareceMojibake(texto: string): boolean {
  return SOSPECHA.test(texto);
}

/**
 * Repara el texto si detecta doble codificación; si no, lo devuelve intacto.
 *
 * Nunca lanza: ante cualquier duda devuelve la entrada sin tocar. Corromper un
 * nombre que estaba bien sería peor que dejar uno mal.
 */
export function repararMojibake(texto: string): string {
  if (texto === '' || !pareceMojibake(texto)) return texto;

  const bytes: number[] = [];
  for (const caracter of texto) {
    const punto = caracter.codePointAt(0)!;
    if (punto <= 0xff) {
      bytes.push(punto);
    } else if (CP1252_ALTOS[punto] !== undefined) {
      bytes.push(CP1252_ALTOS[punto]);
    } else {
      // Un carácter que no cabe en Windows-1252 significa que esto no era
      // mojibake, o que ya se perdió información. Se devuelve el original.
      return texto;
    }
  }

  try {
    const reparado = new TextDecoder('utf-8', { fatal: true }).decode(
      Uint8Array.from(bytes),
    );
    // La reparación tiene que MEJORAR el texto. Si el resultado sigue oliendo a
    // mojibake, o se quedó vacío, algo no cuadra y se conserva el original.
    return reparado !== '' && !pareceMojibake(reparado) ? reparado : texto;
  } catch {
    // No era UTF-8 válido: no era mojibake de este tipo.
    return texto;
  }
}

/** Aplica la reparación a todos los strings de un objeto plano. */
export function repararCampos<T extends Record<string, unknown>>(fila: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fila)) {
    out[k] = typeof v === 'string' ? repararMojibake(v) : v;
  }
  return out as T;
}
