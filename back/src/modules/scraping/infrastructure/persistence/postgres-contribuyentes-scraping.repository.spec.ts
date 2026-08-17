import { DataSource } from 'typeorm';
import { PostgresContribuyentesScrapingRepository } from './postgres-contribuyentes-scraping.repository';

describe('PostgresContribuyentesScrapingRepository', () => {
  it.each([
    ['compania', "tipo = 'companies'", 'expediente'],
    [
      'persona_natural',
      "tipo IN ('natural_contable', 'natural_no_contable')",
      'ruc',
    ],
    ['sociedad_no_supervisada', "tipo = 'sociedad_no_supervisada'", 'ruc'],
  ] as const)(
    'resuelve %s con su población y clave propias',
    async (tipoSujeto, filtro, columna) => {
      const fila = { id: 'uuid-1', ruc: '099' };
      const dataSource = {
        query: jest.fn().mockResolvedValue([fila]),
      } as unknown as DataSource;
      const repository = new PostgresContribuyentesScrapingRepository(
        dataSource,
      );

      await expect(repository.buscar(tipoSujeto, 'clave')).resolves.toEqual(
        fila,
      );
      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringMatching(
          new RegExp(`${escapeRegExp(filtro)} AND ${columna} = \\$1`),
        ),
        ['clave'],
      );
    },
  );

  it('devuelve null cuando el sujeto no existe', async () => {
    const dataSource = {
      query: jest.fn().mockResolvedValue([]),
    } as unknown as DataSource;
    const repository = new PostgresContribuyentesScrapingRepository(dataSource);
    await expect(
      repository.buscar('persona_natural', 'no-existe'),
    ).resolves.toBeNull();
  });
});

function escapeRegExp(valor: string): string {
  return valor.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
