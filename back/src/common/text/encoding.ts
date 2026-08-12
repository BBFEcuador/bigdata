/**
 * Detección de codificación para archivos de texto plano.
 *
 * Los archivos de la Superintendencia vienen en Latin-1, no en UTF-8. Leerlos
 * con el default de Node no falla: simplemente entran todos los nombres
 * acentuados corruptos y el import parece haber ido bien. Por eso la
 * codificación se detecta explícitamente y se deja registrada en el job.
 */

export type EncodingDetectado = 'utf-8' | 'utf-8-bom' | 'latin1';

export interface TextoDecodificado {
  texto: string;
  encoding: EncodingDetectado;
}

/**
 * Decodifica un buffer probando UTF-8 primero y cayendo a Latin-1.
 *
 * El orden importa: UTF-8 tiene reglas de secuencia estrictas, así que un texto
 * Latin-1 con acentos españoles (`0xC1` seguido de ASCII) es UTF-8 *inválido* y
 * el decodificador estricto lo rechaza. Al revés no ocurre: todo UTF-8 válido se
 * acepta en el primer intento. Un archivo ASCII puro es UTF-8 válido y se
 * resuelve ahí, que es lo correcto.
 */
export function decodificarTexto(buffer: Buffer): TextoDecodificado {
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    return { texto: buffer.subarray(3).toString('utf8'), encoding: 'utf-8-bom' };
  }

  try {
    const texto = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    return { texto, encoding: 'utf-8' };
  } catch {
    // No es UTF-8 válido. Para el español, ISO-8859-1 y Windows-1252 sólo
    // difieren en el rango 0x80-0x9F, que no contiene ninguna letra acentuada;
    // `latin1` de Node cubre el caso sin dependencias.
    return { texto: buffer.toString('latin1'), encoding: 'latin1' };
  }
}
