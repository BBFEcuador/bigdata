import { DataSource } from 'typeorm';
import { ImportJobsService } from '../import-jobs.service';
import { DataportalImportService } from './dataportal-import.service';
import { Parseado } from './dataportal.parser';

const parseado: Parseado = {
  empresa: null,
  contactos: [{ ruc: '099', valor: 'a@b.ec', tipo: 'email', tipo_codigo: '3' }],
  nomina: [
    {
      ruc: '099',
      cedula: '01',
      nombre: null,
      ocupacion: null,
      sueldo: null,
      fecha_ingreso: null,
    },
  ],
  vehiculos: [],
  propiedades: [],
};

function servicio(coincidencias: Array<{ id: string }>) {
  const query = jest.fn<Promise<Array<{ id: string }>>, [string, unknown[]?]>(
    async (sql) =>
      /SELECT id FROM contribuyentes/.test(sql) ? coincidencias : [],
  );
  const dataSource = {
    transaction: jest.fn(async (fn) => fn({ query })),
  } as unknown as DataSource;
  return {
    service: new DataportalImportService({} as ImportJobsService, dataSource),
    query,
  };
}

async function guardar(service: DataportalImportService) {
  return (service as any).guardar('099', 'job-1', {}, parseado, 200, false);
}

describe('DataportalImportService - resolución histórica', () => {
  it('inserta contactos y nómina con una coincidencia exacta', async () => {
    const { service, query } = servicio([{ id: 'uuid-1' }]);
    await expect(guardar(service)).resolves.toBeNull();
    const inserts = query.mock.calls.filter(([sql]) =>
      /INSERT INTO dataportal_(contacto|nomina)/.test(sql),
    );
    expect(inserts).toHaveLength(2);
    expect(inserts.every(([, params]) => params[0] === 'uuid-1')).toBe(true);
  });

  it('omite ambas listas y avisa cuando el RUC no existe', async () => {
    const { service, query } = servicio([]);
    await expect(guardar(service)).resolves.toMatch(
      /No existe un contribuyente/,
    );
    expect(
      query.mock.calls.some(([sql]) =>
        /INSERT INTO dataportal_(contacto|nomina)/.test(sql),
      ),
    ).toBe(false);
  });

  it('omite ambas listas y avisa cuando el RUC es ambiguo', async () => {
    const { service, query } = servicio([{ id: '1' }, { id: '2' }]);
    await expect(guardar(service)).resolves.toMatch(/varios contribuyentes/);
    expect(
      query.mock.calls.some(([sql]) =>
        /INSERT INTO dataportal_(contacto|nomina)/.test(sql),
      ),
    ).toBe(false);
  });
});
