import { escapeCopyText, serializeCopyRow } from './copy-text';

describe('escapeCopyText', () => {
  it('deja intacto un texto sin caracteres especiales', () => {
    expect(escapeCopyText('COMPAÑÍA ANDINA S.A.')).toBe('COMPAÑÍA ANDINA S.A.');
  });

  it('escapa la barra invertida ANTES que el resto', () => {
    // Si se escapara al final, las barras de los propios escapes se volverían a
    // escapar y el resultado sería incorrecto.
    expect(escapeCopyText('a\\nb')).toBe('a\\\\nb');
  });

  it('escapa tabulador, salto de línea y retorno de carro', () => {
    expect(escapeCopyText('a\tb')).toBe('a\\tb');
    expect(escapeCopyText('a\nb')).toBe('a\\nb');
    expect(escapeCopyText('a\rb')).toBe('a\\rb');
  });

  it('convierte un "\\N" literal en algo que Postgres NO leerá como NULL', () => {
    // El contenido real del campo es la cadena "\N"; debe llegar como texto.
    expect(escapeCopyText('\\N')).toBe('\\\\N');
  });
});

describe('serializeCopyRow', () => {
  it('separa por tabulador y termina en salto de línea', () => {
    expect(serializeCopyRow(['a', 'b', 'c'])).toBe('a\tb\tc\n');
  });

  it('emite \\N para los nulos', () => {
    expect(serializeCopyRow(['a', null, 'c'])).toBe('a\t\\N\tc\n');
  });

  it('distingue la cadena vacía del nulo', () => {
    // Ésta es la razón de usar el formato TEXT y no CSV: en CSV ambos colisionan.
    expect(serializeCopyRow(['', null])).toBe('\t\\N\n');
  });

  it('no añade tabulador final', () => {
    expect(serializeCopyRow(['x'])).toBe('x\n');
  });
});
