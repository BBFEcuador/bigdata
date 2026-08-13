import { CompaniasReadRepository } from '../ports/companias-read.repository';
import { ExportarCompaniasCsvUseCase } from './exportar-companias-csv.use-case';
import { ListarCompaniasUseCase } from './listar-companias.use-case';
import { ObtenerFichaCompaniaUseCase } from './obtener-ficha-compania.use-case';

function compania(id: string, expediente = id) {
  return {
    id,
    tipo: 'companies',
    expediente,
    ruc: null,
    nombre: id,
    ciiuNivel6: null,
  };
}

function repository(
  overrides: Partial<CompaniasReadRepository> = {},
): CompaniasReadRepository {
  return {
    findPage: jest.fn(async () => []),
    countBounded: jest.fn(async () => ({ valor: 0, exacto: true })),
    findForExport: jest.fn(async () => []),
    findByExpedienteOrRuc: jest.fn(async () => null),
    findActivityNames: jest.fn(async () => new Map()),
    findFichaRelaciones: jest.fn(async () => ({
      establecimientos: [],
      ejercicios: [],
      turismo: [],
      catastros: [],
    })),
    findFacetas: jest.fn(async () => ({
      provincias: [],
      situaciones: [],
      tipos: [],
      poblaciones: [],
      aniosCatastro: {},
    })),
    ...overrides,
  };
}

describe('casos de uso de lectura de compañías', () => {
  it('calcula paginación y cursor desde la página del repositorio', async () => {
    const repo = repository({
      findPage: jest.fn(async () => [
        compania('1', 'A'),
        compania('2', 'B'),
        compania('3', 'C'),
      ]),
    });
    const useCase = new ListarCompaniasUseCase(repo);

    const result = await useCase.execute({
      limit: 2,
      poblacion: 'natural_contable',
      cursor: 'antes',
    });

    expect(repo.findPage).toHaveBeenCalledWith(
      expect.objectContaining({
        poblacion: 'natural_contable',
        cursor: 'antes',
      }),
      3,
    );
    expect(result).toMatchObject({
      hayMas: true,
      cursorSiguiente: 'B',
      total: { valor: 0, exacto: true },
    });
    expect(result.datos).toHaveLength(2);
  });

  it('genera CSV en el caso de uso y mantiene el límite de exportación', async () => {
    const repo = repository({
      findForExport: jest.fn(async () => [
        {
          ...compania('1'),
          nombre: 'A; "B"',
          provincia: 'P',
          canton: 'C',
          estadoContribuyente: 'ACTIVO',
        },
      ]),
    });
    const result = await new ExportarCompaniasCsvUseCase(repo).execute({});

    expect(repo.findForExport).toHaveBeenCalledWith({}, 10_000);
    expect(result).toContain('"A; ""B"""');
  });

  it('compone ficha, actividad y ejercicios sin filtrar relaciones en el controlador', async () => {
    const repo = repository({
      findByExpedienteOrRuc: jest.fn(async () => ({
        ...compania('1', 'EXP-1'),
        ruc: '099',
        ciiuNivel6: 'A01',
      })),
      findActivityNames: jest.fn(async () => new Map([['A01', 'Actividad']])),
      findFichaRelaciones: jest.fn(async () => ({
        establecimientos: [{ numero: 1 }],
        ejercicios: [{ anio: '2025', formulario: '101' }],
        turismo: [],
        catastros: [],
      })),
    });
    const result = await new ObtenerFichaCompaniaUseCase(repo).execute('EXP-1');

    expect(repo.findFichaRelaciones).toHaveBeenCalledWith('099', 'EXP-1');
    expect(repo.findActivityNames).toHaveBeenCalledWith(['A01']);
    expect(result?.compania.actividad).toBe('Actividad');
    expect(result?.ejercicios).toEqual([{ anio: 2025, formulario: 101 }]);
  });
});
