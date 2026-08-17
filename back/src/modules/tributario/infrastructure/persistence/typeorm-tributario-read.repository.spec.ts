import { Repository } from 'typeorm';
import { RiesgoTributarioAnio } from './entities/riesgo-tributario-anio.entity';
import { TypeormTributarioReadRepository } from './typeorm-tributario-read.repository';

describe('TypeormTributarioReadRepository', () => {
  let query: jest.Mock;
  let repository: TypeormTributarioReadRepository;

  beforeEach(() => {
    query = jest.fn();
    repository = new TypeormTributarioReadRepository({
      query,
    } as unknown as Repository<RiesgoTributarioAnio>);
  });

  it('mantiene los filtros, orden y paginación del ranking en SQL parametrizado', async () => {
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([{ total: 0 }]);
    await repository.listarRiesgo({
      poblacion: 'comparable',
      orden: 'brecha_total',
      anio: 2024,
      persistencia: 2,
      rama: 'H52',
      q: ' ACME ',
      brechaMinima: 10,
      limit: 20,
      offset: 40,
    });

    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('a.anio = $2');
    expect(sql).toContain('p.anios_decil_alto >= $3');
    expect(sql).toContain('a.grupo_ciiu LIKE $5');
    expect(sql).toContain('ORDER BY p.brecha_total DESC NULLS LAST');
    expect(sql).toContain('LIMIT $7 OFFSET $8');
    expect(params).toEqual([
      'comparable',
      2024,
      2,
      10,
      'H52%',
      '%ACME%',
      20,
      40,
    ]);
  });

  it('consulta las cuatro proyecciones auxiliares del resumen', async () => {
    query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    await repository.getResumen();
    expect(query).toHaveBeenCalledTimes(4);
    expect(query.mock.calls.map(([sql]) => sql)).toEqual(
      expect.arrayContaining([
        expect.stringContaining('perfil_riesgo_tributario'),
        expect.stringContaining('resolucion_presuntiva'),
        expect.stringContaining('balance_magnitud'),
      ]),
    );
  });

  it('consulta utilidades, crédito y las partes de ficha con sus parámetros', async () => {
    query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([{}])
      .mockResolvedValueOnce([]);
    await repository.listarUtilidades({ limit: 5, offset: 2 }, 2024);
    expect(query.mock.calls[0][1]).toEqual([2024, 5, 2]);

    query.mockClear();
    query.mockResolvedValueOnce([]).mockResolvedValueOnce([{}]);
    await repository.listarCredito(
      { soloComparables: true, limit: 5, offset: 2 },
      2024,
    );
    expect(query.mock.calls[0][0]).toContain('riesgo_tributario_anio');
    expect(query.mock.calls[0][1]).toEqual([2024, 5, 2]);

    query.mockClear();
    query
      .mockResolvedValueOnce([{ expediente: 'x' }])
      .mockResolvedValue([])
      .mockResolvedValue([])
      .mockResolvedValue([])
      .mockResolvedValue([])
      .mockResolvedValue([])
      .mockResolvedValue([]);
    await repository.getFicha('x');
    expect(query).toHaveBeenCalledTimes(7);
    expect(query.mock.calls[0][0]).toContain('SELECT c.id, c.expediente');
    expect(query.mock.calls[0][1]).toEqual(['x']);
  });
});
