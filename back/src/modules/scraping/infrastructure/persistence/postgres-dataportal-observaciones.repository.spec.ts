import { DataSource } from 'typeorm';
import { PostgresDataportalObservacionesRepository } from './postgres-dataportal-observaciones.repository';

const identidad = { contribuyenteId: 'uuid-1', ruc: '099' };

type QueryMock = jest.Mock<Promise<unknown[]>, [string, unknown[]?]>;

function escenario(
  query: QueryMock = jest.fn<Promise<unknown[]>, [string, unknown[]?]>(
    async () => [],
  ),
) {
  const dataSource = {
    transaction: jest.fn(async (operacion) => operacion({ query })),
  } as unknown as DataSource;
  return {
    query,
    dataSource,
    repository: new PostgresDataportalObservacionesRepository(dataSource),
  };
}

describe('PostgresDataportalObservacionesRepository', () => {
  it('reemplaza cada sección en una transacción propia y deduplica', async () => {
    const e = escenario();
    await e.repository.reemplazarContactos(identidad, [
      { valor: 'a@b.ec', tipo: 'email', tipoCodigo: '3' },
      { valor: 'a@b.ec', tipo: 'email', tipoCodigo: '3' },
    ]);
    await e.repository.reemplazarPropiedades(identidad, [
      {
        cedulaCatastral: 'CAT-1',
        parroquia: null,
        codigoCalle: null,
        callePrincipal: null,
        numero: null,
        barrioSector: null,
        zona: null,
        telefono: null,
      },
      {
        cedulaCatastral: 'CAT-1',
        parroquia: null,
        codigoCalle: null,
        callePrincipal: null,
        numero: null,
        barrioSector: null,
        zona: null,
        telefono: null,
      },
    ]);

    expect(e.dataSource.transaction).toHaveBeenCalledTimes(2);
    expect(
      e.query.mock.calls.filter(([sql]) => /INSERT INTO/.test(sql)),
    ).toHaveLength(2);
    expect(e.query.mock.calls[0][1]).toEqual(['uuid-1']);
  });

  it('una lista vacía elimina la fotografía anterior', async () => {
    const e = escenario();
    await e.repository.reemplazarVehiculos(identidad, []);
    expect(e.query).toHaveBeenCalledTimes(1);
    expect(e.query.mock.calls[0][0]).toMatch(/DELETE FROM dataportal_vehiculo/);
  });

  it('propaga el fallo para que TypeORM revierta sólo esa sección', async () => {
    const error = new Error('falló nómina');
    const query = jest.fn<Promise<unknown[]>, [string, unknown[]?]>(
      async (sql: string) => {
        if (/INSERT INTO dataportal_nomina/.test(sql)) throw error;
        return [];
      },
    );
    const e = escenario(query);
    await expect(
      e.repository.reemplazarNomina(identidad, [
        {
          cedula: '01',
          nombre: null,
          fechaIngreso: null,
          rol: null,
          posibleSalario: null,
        },
      ]),
    ).rejects.toBe(error);
  });
});
