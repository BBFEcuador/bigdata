import { porOrdenContable } from './infrastructure/persistence/typeorm-balances-read.repository';

const ordenar = (codigos: string[]): string[] =>
  codigos
    .map((codigo) => ({ codigo }))
    .sort(porOrdenContable)
    .map((c) => c.codigo);

/**
 * El orden de un estado financiero no es cosmético: es lo que permite leerlo.
 * Cada cuenta tiene que salir justo encima de las suyas.
 */
describe('porOrdenContable', () => {
  it('pone cada cuenta encima de sus hijas', () => {
    expect(ordenar(['102', '2', '10101', '1', '101', '10102'])).toEqual([
      '1',
      '101',
      '10101',
      '10102',
      '102',
      '2',
    ]);
  });

  /**
   * La regresión concreta que hubo que arreglar. Ordenando como NÚMERO salían
   * primero todas las madre —1, 2, 3, 101, 102— y las hijas agrupadas al final,
   * que es ilegible en un balance.
   */
  it('NO ordena como número', () => {
    const codigos = ['1', '101', '10101', '2', '201', '3'];
    const contable = ordenar(codigos);
    const numerico = [...codigos].sort((a, b) =>
      a.localeCompare(b, 'en', { numeric: true }),
    );

    // El padre es prefijo de la hija y más corto, así que va delante.
    expect(contable).toEqual(['1', '101', '10101', '2', '201', '3']);
    expect(numerico).toEqual(['1', '2', '3', '101', '201', '10101']);
    expect(contable).not.toEqual(numerico);
  });

  it('mantiene juntas las ramas profundas del plan real', () => {
    // Códigos reales del catálogo IFRS.
    expect(
      ordenar([
        '1010201',
        '10102',
        '101',
        '1',
        '10101',
        '1010101',
        '10103',
        '102',
      ]),
    ).toEqual([
      '1',
      '101',
      '10101',
      '1010101',
      '10102',
      '1010201',
      '10103',
      '102',
    ]);
  });

  it('es estable con códigos iguales y con la lista vacía', () => {
    expect(ordenar(['5', '5'])).toEqual(['5', '5']);
    expect(ordenar([])).toEqual([]);
  });
});
