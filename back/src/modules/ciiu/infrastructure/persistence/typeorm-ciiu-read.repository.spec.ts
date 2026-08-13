import { TypeormCiiuReadRepository } from './typeorm-ciiu-read.repository';

function queryBuilder(rows: unknown[] = []) {
  const qb: any = {
    andWhere: jest.fn(() => qb),
    orderBy: jest.fn(() => qb),
    take: jest.fn(() => qb),
    getMany: jest.fn(async () => rows),
  };
  return qb;
}

describe('TypeormCiiuReadRepository', () => {
  it('aplica filtros, orden y límite al listado', async () => {
    const qb = queryBuilder();
    const adapter = new TypeormCiiuReadRepository({
      createQueryBuilder: jest.fn(() => qb),
    } as any);

    await adapter.findMany({
      q: 'a01',
      nivel: 3,
      soloHojas: 'true',
      limit: 15,
    });

    expect(qb.andWhere).toHaveBeenCalledWith('a.ausenteDesdeJob IS NULL');
    expect(qb.andWhere).toHaveBeenCalledWith(
      '(a.codigo LIKE :pref OR a.nombre ILIKE :like)',
      { pref: 'A01%', like: '%a01%' },
    );
    expect(qb.andWhere).toHaveBeenCalledWith('a.nivel = :nivel', { nivel: 3 });
    expect(qb.andWhere).toHaveBeenCalledWith('a.esHoja = true');
    expect(qb.orderBy).toHaveBeenCalledWith('a.codigo', 'ASC');
    expect(qb.take).toHaveBeenCalledWith(15);
  });

  it('consulta el agregado de compañías y el conteo jerárquico normalizado', async () => {
    const repo: any = {
      query: jest
        .fn()
        .mockResolvedValueOnce([{ codigo_supercias: 'A01.01', n: '3' }])
        .mockResolvedValueOnce([{ n: '5' }]),
    };
    const adapter = new TypeormCiiuReadRepository(repo);

    await expect(adapter.findCompanyCounts()).resolves.toEqual(
      new Map([['A01.01', 3]]),
    );
    await expect(adapter.countCompaniesByCode('A01')).resolves.toBe(5);
    expect(repo.query).toHaveBeenCalledWith(
      expect.stringContaining('GROUP BY ciiu_nivel_6'),
    );
    expect(repo.query).toHaveBeenCalledWith(
      expect.stringContaining("replace(ciiu_nivel_6, '.', '') LIKE $1"),
      ['A01%'],
    );
  });

  it('obtiene padre, hijos ordenados y resumen desde las consultas adecuadas', async () => {
    const repo: any = {
      findOne: jest.fn(async () => null),
      find: jest.fn(async () => []),
      query: jest.fn(async () => [
        { total: '1', vigentes: '1', raices: '1', hojas: '0', nivel_max: '1' },
      ]),
    };
    const adapter = new TypeormCiiuReadRepository(repo);

    await adapter.findByCodigo('A');
    await adapter.findChildren('A');
    await expect(adapter.getSummary()).resolves.toEqual({
      total: 1,
      vigentes: 1,
      raices: 1,
      hojas: 0,
      nivelMax: 1,
    });
    expect(repo.findOne).toHaveBeenCalledWith({ where: { codigo: 'A' } });
    expect(repo.find).toHaveBeenCalledWith({
      where: { codigoPadre: 'A' },
      order: { codigo: 'ASC' },
    });
    expect(repo.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM actividad_ciiu'),
    );
  });
});
