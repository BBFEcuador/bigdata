import { TypeormCompaniasReadRepository } from './typeorm-companias-read.repository';

function queryBuilder(rows: unknown[] = []) {
  const qb: any = {
    andWhere: jest.fn(() => qb),
    select: jest.fn(() => qb),
    orderBy: jest.fn(() => qb),
    take: jest.fn(() => qb),
    limit: jest.fn(() => qb),
    getMany: jest.fn(async () => rows),
    getQueryAndParameters: jest.fn(() => ['SELECT 1', []]),
  };
  return qb;
}

describe('TypeormCompaniasReadRepository', () => {
  it('centraliza población, filtros, cursor UUID-texto y orden de la página', async () => {
    const qb = queryBuilder();
    const repo: any = {
      createQueryBuilder: jest.fn(() => qb),
      query: jest.fn(async () => [{ n: '0' }]),
    };
    const adapter = new TypeormCompaniasReadRepository(repo);

    await adapter.findPage(
      { poblacion: 'natural_no_contable', catastro: 'turismo', cursor: '099' },
      51,
    );

    expect(qb.andWhere).toHaveBeenCalledWith('c.tipo = :poblacion', {
      poblacion: 'natural_no_contable',
    });
    expect(qb.andWhere).toHaveBeenCalledWith(
      'c.turismo_registros IS NOT NULL',
      {},
    );
    expect(qb.andWhere).toHaveBeenCalledWith(
      'COALESCE(c.expediente, c.ruc, c.id::text) > :cursor',
      { cursor: '099' },
    );
    expect(qb.orderBy).toHaveBeenCalledWith(
      'COALESCE(c.expediente, c.ruc, c.id::text)',
      'ASC',
    );
    expect(qb.take).toHaveBeenCalledWith(51);
  });

  it('limita la exportación y conserva las poblaciones por defecto', async () => {
    const qb = queryBuilder();
    const adapter = new TypeormCompaniasReadRepository({
      createQueryBuilder: jest.fn(() => qb),
    } as any);

    await adapter.findForExport({}, 10_000);

    expect(qb.andWhere).toHaveBeenCalledWith('c.tipo IN (:...poblaciones)', {
      poblaciones: [
        'companies',
        'natural_contable',
        'natural_no_contable',
        'sociedad_no_supervisada',
      ],
    });
    expect(qb.take).toHaveBeenCalledWith(10_000);
  });

  it('busca detalle por expediente o RUC y ejecuta las consultas auxiliares de ficha', async () => {
    const repo: any = {
      findOne: jest.fn(async () => null),
      query: jest.fn(async () => []),
    };
    const adapter = new TypeormCompaniasReadRepository(repo);

    await adapter.findByExpedienteOrRuc('EXP-1');
    await adapter.findFichaRelaciones('099', 'EXP-1');

    expect(repo.findOne).toHaveBeenCalledWith({
      where: [
        { expediente: 'EXP-1' },
        {
          ruc: 'EXP-1',
          tipo: expect.anything(),
        },
      ],
    });
    expect(repo.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM balance'),
      ['EXP-1'],
    );
    expect(repo.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM establecimiento'),
      ['099'],
    );
  });
});
