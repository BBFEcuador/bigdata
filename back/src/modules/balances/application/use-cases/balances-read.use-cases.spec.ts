import { BalancesReadRepository } from '../ports/balances-read.repository';
import {
  ListarBalancesUseCase,
  ObtenerDetalleBalanceUseCase,
} from './balances-read.use-cases';

function repository(
  overrides: Partial<BalancesReadRepository> = {},
): BalancesReadRepository {
  return {
    list: jest.fn(async () => ({ datos: [], cursorSiguiente: null })),
    summary: jest.fn(async () => []),
    comparative: jest.fn(async () => ({})),
    statements: jest.fn(async () => ({})),
    indicators: jest.fn(async () => ({})),
    detail: jest.fn(async () => ({})),
    ...overrides,
  } as BalancesReadRepository;
}

describe('casos de uso de lectura de balances', () => {
  it('propaga los filtros de listado al puerto', async () => {
    const repo = repository();
    const query = { anio: 2024, rama: 'A', limit: 25 };

    await new ListarBalancesUseCase(repo).execute(query);

    expect(repo.list).toHaveBeenCalledWith(query);
  });

  it('preserva expediente, año y formulario para el detalle', async () => {
    const repo = repository();

    await new ObtenerDetalleBalanceUseCase(repo).execute('EXP-1', 2024, 3);

    expect(repo.detail).toHaveBeenCalledWith('EXP-1', 2024, 3);
  });
});
