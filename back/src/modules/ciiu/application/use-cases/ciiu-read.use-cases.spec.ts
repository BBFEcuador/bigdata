import { NotFoundException } from '@nestjs/common';
import {
  ActividadCiiuReadModel,
  CiiuReadRepository,
  ResumenCiiu,
} from '../ports/ciiu-read.repository';
import { ListarCiiuUseCase } from './listar-ciiu.use-case';
import { ObtenerDetalleCiiuUseCase } from './obtener-detalle-ciiu.use-case';
import { ObtenerResumenCiiuUseCase } from './obtener-resumen-ciiu.use-case';

const actividad = (codigo: string): ActividadCiiuReadModel => ({
  codigo,
  nombre: `Actividad ${codigo}`,
  codigoSupercias: `${codigo}.01`,
  codigoPadre: null,
  nivel: 1,
  nivelNombre: 'Sección',
  esHoja: false,
  longitud: codigo.length,
  aplicacion: null,
  rowHash: 'hash',
  primerJobId: null,
  ultimoJobId: null,
  ausenteDesdeJob: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
});

function repository(
  overrides: Partial<CiiuReadRepository> = {},
): CiiuReadRepository {
  return {
    findMany: jest.fn(async () => []),
    findByCodigo: jest.fn(async () => null),
    findChildren: jest.fn(async () => []),
    findCompanyCounts: jest.fn(async () => new Map()),
    countCompaniesByCode: jest.fn(async () => 0),
    getSummary: jest.fn(async (): Promise<ResumenCiiu> => ({
      total: 0,
      vigentes: 0,
      raices: 0,
      hojas: 0,
      nivelMax: 0,
    })),
    ...overrides,
  } as CiiuReadRepository;
}

describe('casos de uso de lectura CIIU', () => {
  it('propaga filtros y agrega conteos sólo cuando se solicitan', async () => {
    const fila = actividad('A01');
    const repo = repository({
      findMany: jest.fn(async () => [fila]),
      findCompanyCounts: jest.fn(async () => new Map([['A01.01', 7]])),
    });
    const useCase = new ListarCiiuUseCase(repo);
    const query = { q: 'a', nivel: 2, soloHojas: 'true', conConteo: 'true' };

    await expect(useCase.execute(query)).resolves.toEqual({
      datos: [{ ...fila, companias: 7 }],
      total: 1,
    });
    expect(repo.findMany).toHaveBeenCalledWith(query);
    expect(repo.findCompanyCounts).toHaveBeenCalledTimes(1);

    await useCase.execute({ q: 'A' });
    expect(repo.findCompanyCounts).toHaveBeenCalledTimes(1);
  });

  it('compone el detalle jerárquico y normaliza el código para buscarlo', async () => {
    const hijo = { ...actividad('A01'), codigoPadre: 'A' };
    const repo = repository({
      findByCodigo: jest.fn(async (codigo) =>
        codigo === 'A01' ? hijo : actividad('A'),
      ),
      findChildren: jest.fn(async () => [actividad('A010')]),
      countCompaniesByCode: jest.fn(async () => 4),
    });

    await expect(
      new ObtenerDetalleCiiuUseCase(repo).execute('a01'),
    ).resolves.toEqual({
      actividad: hijo,
      padre: actividad('A'),
      hijos: [actividad('A010')],
      companias: 4,
    });
    expect(repo.findByCodigo).toHaveBeenCalledWith('A01');
    expect(repo.findChildren).toHaveBeenCalledWith('A01');
    expect(repo.countCompaniesByCode).toHaveBeenCalledWith('A01');
  });

  it('mantiene el 404 cuando el código no existe', async () => {
    await expect(
      new ObtenerDetalleCiiuUseCase(repository()).execute('inexistente'),
    ).rejects.toThrow(
      new NotFoundException('No existe la actividad inexistente'),
    );
  });

  it('devuelve los agregados del resumen', async () => {
    const summary = { total: 8, vigentes: 7, raices: 1, hojas: 4, nivelMax: 6 };
    const repo = repository({ getSummary: jest.fn(async () => summary) });

    await expect(
      new ObtenerResumenCiiuUseCase(repo).execute(),
    ).resolves.toEqual(summary);
  });
});
