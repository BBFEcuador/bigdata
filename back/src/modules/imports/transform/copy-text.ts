/**
 * Serialización al formato TEXT de `COPY`.
 *
 * Se usa TEXT (el formato por defecto) y no CSV porque es el más barato de
 * generar y de parsear del lado del servidor, y porque en CSV la cadena vacía y
 * NULL colisionan salvo que se recurra a `WITH (NULL '')`, que a su vez impide
 * distinguirlas. En TEXT, NULL es el token `\N` y no hay ambigüedad.
 */

export const NULL_TOKEN = '\\N';
const FIELD_SEP = '\t';
const ROW_SEP = '\n';

/**
 * Escapa un valor para el formato TEXT.
 *
 * El ORDEN importa: la barra invertida se escapa PRIMERO. Si se hiciera al
 * final, las barras que introducen los propios escapes se volverían a escapar
 * y el resultado sería incorrecto. Por el mismo motivo, un campo cuyo contenido
 * literal sea `\N` acaba emitido como `\\N` y Postgres lo lee como el texto
 * "\N" y no como NULL, que es justo lo que se quiere.
 */
export function escapeCopyText(value: string): string {
  if (!/[\\\n\r\t]/.test(value)) return value; // caso común: sin coste
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
}

/** Serializa una fila completa, incluido el salto de línea final. */
export function serializeCopyRow(values: (string | null)[]): string {
  let line = '';
  for (let i = 0; i < values.length; i++) {
    if (i > 0) line += FIELD_SEP;
    const v = values[i];
    line += v === null ? NULL_TOKEN : escapeCopyText(v);
  }
  return line + ROW_SEP;
}
