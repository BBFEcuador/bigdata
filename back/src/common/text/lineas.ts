import { createReadStream } from 'node:fs';
import { open } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { EncodingDetectado, detectarEncoding } from './encoding';

/**
 * Lectura de archivos de texto plano grandes, línea a línea, sin cargarlos en
 * memoria.
 *
 * `decodificarTexto()` resuelve bien los archivos pequeños (el catálogo son
 * 25 KB), pero recibe un `Buffer` completo. Los balances son 251 MB y el padrón
 * del SRI son varios GB: ahí hay que decidir la codificación con una muestra y
 * decodificar sobre la marcha.
 */

/** Bytes del principio del archivo que se usan para detectar la codificación. */
export const TAMANO_MUESTRA = 64 * 1024;

export interface LectorDeLineas {
  encoding: EncodingDetectado;
  lineas: AsyncGenerator<string>;
}

/**
 * Abre un archivo, detecta su codificación con los primeros 64 KB y devuelve un
 * generador de líneas ya decodificadas.
 *
 * La codificación se devuelve aparte para poder registrarla en
 * `import_job.avisos`: un archivo que se esperaba en Latin-1 y llega en UTF-8
 * (o al revés) es exactamente el fallo que no da error y corrompe los acentos
 * en silencio.
 */
export async function abrirLectorDeLineas(ruta: string): Promise<LectorDeLineas> {
  const { encoding, offsetBytes } = await detectarEncodingDeArchivo(ruta);
  const stream = createReadStream(ruta, { start: offsetBytes });
  return { encoding, lineas: leerLineas(stream, encoding) };
}

export async function detectarEncodingDeArchivo(ruta: string) {
  const fh = await open(ruta, 'r');
  try {
    const buffer = Buffer.alloc(TAMANO_MUESTRA);
    const { bytesRead } = await fh.read(buffer, 0, TAMANO_MUESTRA, 0);
    return detectarEncoding(buffer.subarray(0, bytesRead));
  } finally {
    await fh.close();
  }
}

/**
 * Trocea un stream de bytes en líneas.
 *
 * Dos cortes distintos hay que respetar y son independientes:
 *
 * 1. **El corte de carácter.** Un chunk puede terminar en mitad de una
 *    secuencia UTF-8 multibyte. `TextDecoder` con `{ stream: true }` guarda los
 *    bytes pendientes hasta el chunk siguiente. Sin eso aparecen `` sueltos en
 *    posiciones que dependen del tamaño del buffer, es decir, irreproducibles.
 *    Latin-1 no tiene este problema —un byte, un carácter— y se decodifica con
 *    `toString('latin1')`, que además evita depender del ICU de Node.
 *
 * 2. **El corte de línea.** Un chunk casi nunca acaba en `\n`: la cola parcial
 *    se arrastra a la iteración siguiente en `resto`.
 */
export async function* leerLineas(
  origen: Readable,
  encoding: EncodingDetectado,
): AsyncGenerator<string> {
  const decodificar = decodificadorPara(encoding);
  let resto = '';

  for await (const chunk of origen) {
    resto += decodificar(chunk as Buffer);

    let corte = resto.indexOf('\n');
    while (corte !== -1) {
      yield sinRetorno(resto.slice(0, corte));
      resto = resto.slice(corte + 1);
      corte = resto.indexOf('\n');
    }
  }

  resto += decodificar(null);
  // La última línea sólo existe si el archivo no termina en salto de línea.
  // Emitir una línea vacía aquí haría que todo importador contase una fila
  // fantasma al final de cada archivo.
  if (resto !== '') {
    yield sinRetorno(resto);
  }
}

/** Tolera CRLF aunque los archivos de la Superintendencia vengan con LF. */
function sinRetorno(linea: string): string {
  return linea.endsWith('\r') ? linea.slice(0, -1) : linea;
}

function decodificadorPara(encoding: EncodingDetectado): (chunk: Buffer | null) => string {
  if (encoding === 'latin1') {
    return (chunk) => (chunk === null ? '' : chunk.toString('latin1'));
  }
  const decoder = new TextDecoder('utf-8');
  return (chunk) => (chunk === null ? decoder.decode() : decoder.decode(chunk, { stream: true }));
}
