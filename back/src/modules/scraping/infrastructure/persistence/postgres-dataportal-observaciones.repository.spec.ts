import { DataSource } from 'typeorm';
import { PostgresDataportalObservacionesRepository } from './postgres-dataportal-observaciones.repository';

describe('PostgresDataportalObservacionesRepository', () => {
  it('reemplaza ambas listas en una sola transacción y deduplica', async () => {
    const query = jest.fn<Promise<unknown[]>, [string, unknown[]?]>(
      async () => [],
    );
    const dataSource = {
      transaction: jest.fn(async (operacion) => operacion({ query })),
    } as unknown as DataSource;
    const repository = new PostgresDataportalObservacionesRepository(
      dataSource,
    );

    await repository.reemplazar({
      contribuyenteId: 'uuid-1',
      ruc: '099',
      contactos: [
        { valor: 'a@b.ec', tipo: 'email', tipoCodigo: '3' },
        { valor: 'a@b.ec', tipo: 'email', tipoCodigo: '3' },
      ],
      nomina: [
        {
          cedula: '01',
          nombre: null,
          fechaIngreso: null,
          rol: null,
          posibleSalario: null,
        },
        {
          cedula: '01',
          nombre: null,
          fechaIngreso: null,
          rol: null,
          posibleSalario: null,
        },
      ],
    });

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(
      query.mock.calls.filter(([sql]) =>
        /INSERT INTO dataportal_contacto/.test(sql),
      ),
    ).toHaveLength(1);
    expect(
      query.mock.calls.filter(([sql]) =>
        /INSERT INTO dataportal_nomina/.test(sql),
      ),
    ).toHaveLength(1);
    expect(query.mock.calls[0][1]).toEqual(['uuid-1']);
  });

  it('reemplaza por listas vacías mediante los dos DELETE', async () => {
    const query = jest.fn<Promise<unknown[]>, [string, unknown[]?]>(
      async () => [],
    );
    const dataSource = {
      transaction: jest.fn(async (fn) => fn({ query })),
    } as unknown as DataSource;
    await new PostgresDataportalObservacionesRepository(dataSource).reemplazar({
      contribuyenteId: 'uuid-1',
      ruc: '099',
      contactos: [],
      nomina: [],
    });
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls.every(([sql]) => /^DELETE/.test(sql.trim()))).toBe(
      true,
    );
  });

  it('propaga un fallo de nómina para que TypeORM revierta toda la transacción', async () => {
    const error = new Error('falló nómina');
    const query = jest.fn<Promise<unknown[]>, [string, unknown[]?]>(
      async (sql) => {
        if (/INSERT INTO dataportal_nomina/.test(sql)) throw error;
        return [];
      },
    );
    const dataSource = {
      transaction: jest.fn(async (fn) => fn({ query })),
    } as unknown as DataSource;
    const promise = new PostgresDataportalObservacionesRepository(
      dataSource,
    ).reemplazar({
      contribuyenteId: 'uuid-1',
      ruc: '099',
      contactos: [],
      nomina: [
        {
          cedula: '01',
          nombre: null,
          fechaIngreso: null,
          rol: null,
          posibleSalario: null,
        },
      ],
    });
    await expect(promise).rejects.toBe(error);
  });
});
