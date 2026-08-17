import { DataSource } from 'typeorm';
import { PostgresCompaniasScrapingRepository } from './postgres-companias-scraping.repository';

describe('PostgresCompaniasScrapingRepository', () => {
  it('consulta una compañía con SQL parametrizado', async () => {
    const fila = { id: 'uuid-1', expediente: '123', ruc: '099' };
    const dataSource = { query: jest.fn().mockResolvedValue([fila]) } as unknown as DataSource;
    const repository = new PostgresCompaniasScrapingRepository(dataSource);

    await expect(repository.buscarPorExpediente('123')).resolves.toEqual(fila);
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining("tipo = 'companies' AND expediente = $1"),
      ['123'],
    );
  });

  it('devuelve null cuando el expediente no existe', async () => {
    const dataSource = { query: jest.fn().mockResolvedValue([]) } as unknown as DataSource;
    const repository = new PostgresCompaniasScrapingRepository(dataSource);
    await expect(repository.buscarPorExpediente('no-existe')).resolves.toBeNull();
  });
});
