import { Readable } from 'node:stream';
import { detectarEncoding } from './encoding';
import { leerLineas } from './lineas';

/** Alimenta el lector con trozos de bytes controlados a mano. */
function stream(...chunks: Buffer[]): Readable {
  return Readable.from(chunks);
}

async function recoger(gen: AsyncGenerator<string>): Promise<string[]> {
  const out: string[] = [];
  for await (const linea of gen) out.push(linea);
  return out;
}

describe('detectarEncoding', () => {
  it('detecta latin1 en el archivo real de la Superintendencia', () => {
    // GANADERÍA en Latin-1: 0xCD es una secuencia UTF-8 inválida.
    const buf = Buffer.from([0x47, 0x41, 0x4e, 0x41, 0x44, 0x45, 0x52, 0xcd, 0x41]);
    expect(detectarEncoding(buf)).toEqual({ encoding: 'latin1', offsetBytes: 0 });
  });

  it('detecta utf-8 y no salta bytes', () => {
    expect(detectarEncoding(Buffer.from('GANADERÍA', 'utf8'))).toEqual({
      encoding: 'utf-8',
      offsetBytes: 0,
    });
  });

  it('detecta el BOM y manda saltar sus 3 bytes', () => {
    const buf = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('anio', 'utf8')]);
    expect(detectarEncoding(buf)).toEqual({ encoding: 'utf-8-bom', offsetBytes: 3 });
  });

  it('NO confunde con latin1 un UTF-8 cortado al final de la muestra', () => {
    // Éste es el fallo que justifica el `{ stream: true }`: la muestra acaba en
    // el primer byte de "Í" (0xC3 0x8D). Sin modo stream, la prueba estricta
    // fallaría y el archivo entero se leería como Latin-1, con todos los
    // acentos corruptos y sin un solo error.
    const completo = Buffer.from('GANADERÍA', 'utf8');
    const cortado = completo.subarray(0, completo.indexOf(0xc3) + 1);
    expect(cortado[cortado.length - 1]).toBe(0xc3); // la muestra acaba a medias
    expect(detectarEncoding(cortado).encoding).toBe('utf-8');
  });
});

describe('leerLineas', () => {
  it('trocea por saltos de línea', async () => {
    const lineas = await recoger(leerLineas(stream(Buffer.from('a\nb\nc\n')), 'utf-8'));
    expect(lineas).toEqual(['a', 'b', 'c']);
  });

  it('no emite una línea fantasma cuando el archivo acaba en salto', async () => {
    const lineas = await recoger(leerLineas(stream(Buffer.from('a\nb\n')), 'utf-8'));
    expect(lineas).toEqual(['a', 'b']);
  });

  it('emite la última línea cuando el archivo NO acaba en salto', async () => {
    const lineas = await recoger(leerLineas(stream(Buffer.from('a\nb')), 'utf-8'));
    expect(lineas).toEqual(['a', 'b']);
  });

  it('reconstruye una línea partida entre dos chunks', async () => {
    const lineas = await recoger(
      leerLineas(stream(Buffer.from('AGRICUL'), Buffer.from('TURA\nPESCA\n')), 'utf-8'),
    );
    expect(lineas).toEqual(['AGRICULTURA', 'PESCA']);
  });

  it('reconstruye un carácter UTF-8 partido entre dos chunks', async () => {
    const completo = Buffer.from('GANADERÍA\n', 'utf8');
    const corte = completo.indexOf(0xc3) + 1; // justo en medio de "Í"
    const lineas = await recoger(
      leerLineas(stream(completo.subarray(0, corte), completo.subarray(corte)), 'utf-8'),
    );
    expect(lineas).toEqual(['GANADERÍA']);
    expect(lineas[0]).not.toContain('�');
  });

  it('decodifica Latin-1 aunque el corte caiga sobre un byte acentuado', async () => {
    // COMPAÑÍAS en Latin-1, partido entre la Ñ y la Í.
    const bytes = Buffer.from([0x43, 0x4f, 0x4d, 0x50, 0x41, 0xd1, 0xcd, 0x41, 0x53, 0x0a]);
    const lineas = await recoger(
      leerLineas(stream(bytes.subarray(0, 6), bytes.subarray(6)), 'latin1'),
    );
    expect(lineas).toEqual(['COMPAÑÍAS']);
  });

  it('conserva las líneas vacías intermedias', async () => {
    const lineas = await recoger(leerLineas(stream(Buffer.from('a\n\nb\n')), 'utf-8'));
    expect(lineas).toEqual(['a', '', 'b']);
  });

  it('quita el retorno de carro de un archivo con CRLF', async () => {
    const lineas = await recoger(leerLineas(stream(Buffer.from('a\r\nb\r\n')), 'utf-8'));
    expect(lineas).toEqual(['a', 'b']);
  });

  it('no devuelve nada con un archivo vacío', async () => {
    expect(await recoger(leerLineas(stream(Buffer.alloc(0)), 'utf-8'))).toEqual([]);
  });

  it('mantiene los tabuladores intactos', async () => {
    const lineas = await recoger(leerLineas(stream(Buffer.from('2025\t1\tACEITES\n')), 'utf-8'));
    expect(lineas).toEqual(['2025\t1\tACEITES']);
  });
});
