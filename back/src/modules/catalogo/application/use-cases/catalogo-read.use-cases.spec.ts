import { NotFoundException } from '@nestjs/common';
import {
  CatalogoReadRepository,
  CategoriaCuentaReadModel,
  ResumenCatalogo,
} from '../ports/catalogo-read.repository';
import { ListarCatalogoUseCase } from './listar-catalogo.use-case';
import { ObtenerDetalleCatalogoUseCase } from './obtener-detalle-catalogo.use-case';
import { ObtenerResumenCatalogoUseCase } from './obtener-resumen-catalogo.use-case';

const cuenta = (codigo: string): CategoriaCuentaReadModel => ({
  formulario: 1,
  codigo,
  nombre: `Cuenta ${codigo}`,
  codigoPadre: null,
  nivel: 1,
  esHoja: false,
  longitud: codigo.length,
  rowHash: 'hash',
  primerJobId: null,
  ultimoJobId: null,
  ausenteDesdeJob: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
});

function repository(
  overrides: Partial<CatalogoReadRepository> = {},
): CatalogoReadRepository {
  return {
    findMany: jest.fn(async () => []),
    findByCodigo: jest.fn(async () => null),
    findChildren: jest.fn(async () => []),
    getSummary: jest.fn(async (): Promise<ResumenCatalogo> => ({
      total: 0,
      vigentes: 0,
      raices: 0,
      hojas: 0,
      nivelMax: 0,
    })),
    ...overrides,
  } as CatalogoReadRepository;
}

describe('casos de uso de lectura de catálogo', () => {
  it('propaga filtros y usa el formulario por defecto en el listado', async () => {
    const repo = repository({ findMany: jest.fn(async () => [cuenta('101')]) });
    const query = { q: '101', nivel: 3, soloHojas: 'true' };

    await expect(
      new ListarCatalogoUseCase(repo).execute(query),
    ).resolves.toEqual({
      datos: [cuenta('101')],
      total: 1,
    });
    expect(repo.findMany).toHaveBeenCalledWith(query, 1);
  });

  it('compone padre e hijos para el mismo formulario', async () => {
    const detalle = { ...cuenta('101'), codigoPadre: '1' };
    const repo = repository({
      findByCodigo: jest.fn(async (codigo) =>
        codigo === '101' ? detalle : cuenta('1'),
      ),
      findChildren: jest.fn(async () => [cuenta('10101')]),
    });

    await expect(
      new ObtenerDetalleCatalogoUseCase(repo).execute('101', 3),
    ).resolves.toEqual({
      cuenta: detalle,
      padre: cuenta('1'),
      hijos: [cuenta('10101')],
    });
    expect(repo.findByCodigo).toHaveBeenCalledWith('101', 3);
    expect(repo.findByCodigo).toHaveBeenCalledWith('1', 3);
    expect(repo.findChildren).toHaveBeenCalledWith('101', 3);
  });

  it('mantiene el 404 para una cuenta inexistente', async () => {
    await expect(
      new ObtenerDetalleCatalogoUseCase(repository()).execute('999'),
    ).rejects.toThrow(new NotFoundException('No existe la cuenta 999'));
  });

  it('devuelve los agregados para el formulario solicitado', async () => {
    const summary = { total: 8, vigentes: 7, raices: 1, hojas: 4, nivelMax: 6 };
    const repo = repository({ getSummary: jest.fn(async () => summary) });

    await expect(
      new ObtenerResumenCatalogoUseCase(repo).execute(2),
    ).resolves.toEqual(summary);
    expect(repo.getSummary).toHaveBeenCalledWith(2);
  });
});
