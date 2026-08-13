import { TypeormBalancesReadRepository } from './typeorm-balances-read.repository';

function queryBuilder(rows: unknown[] = []) {
  const qb: any = {
    where: jest.fn(() => qb),
    andWhere: jest.fn(() => qb),
    orderBy: jest.fn(() => qb),
    addOrderBy: jest.fn(() => qb),
    take: jest.fn(() => qb),
    getMany: jest.fn(async () => rows),
  };
  return qb;
}

describe('TypeormBalancesReadRepository', () => {
  it('centraliza filtros, orden keyset y límite del listado', async () => {
    const qb = queryBuilder([{ expediente: '001' }]);
    const adapter = new TypeormBalancesReadRepository({
      createQueryBuilder: jest.fn(() => qb),
    } as any);

    await adapter.list({ anio: 2024, rama: 'a', cursor: '000', limit: 50 });

    expect(qb.where).toHaveBeenCalledWith('b.ausenteDesdeJob IS NULL');
    expect(qb.andWhere).toHaveBeenCalledWith('b.anio = :anio', { anio: 2024 });
    expect(qb.andWhere).toHaveBeenCalledWith('b.ramaActividad = :rama', {
      rama: 'A',
    });
    expect(qb.andWhere).toHaveBeenCalledWith('b.expediente > :cursor', {
      cursor: '000',
    });
    expect(qb.orderBy).toHaveBeenCalledWith('b.expediente', 'ASC');
    expect(qb.addOrderBy).toHaveBeenCalledWith('b.anio', 'ASC');
    expect(qb.take).toHaveBeenCalledWith(51);
  });

  it('consulta el resumen y detalle con el formulario seleccionado', async () => {
    const repo: any = {
      query: jest.fn(async () => []),
      find: jest.fn(async () => [{ formulario: 3 }]),
    };
    const adapter = new TypeormBalancesReadRepository(repo);

    await adapter.summary();
    await adapter.detail('EXP-1', 2024, 3);

    expect(repo.query).toHaveBeenCalledWith(
      expect.stringContaining('GROUP BY b.anio, b.formulario'),
    );
    expect(repo.query).toHaveBeenCalledWith(
      expect.stringContaining('bc.formulario = $3'),
      ['EXP-1', 2024, 3],
    );
  });
});
