import { TypeormCatalogoReadRepository } from './typeorm-catalogo-read.repository';

function queryBuilder(rows: unknown[] = []) {
  const qb: any = {
    andWhere: jest.fn(() => qb),
    orderBy: jest.fn(() => qb),
    getMany: jest.fn(async () => rows),
  };
  return qb;
}

describe('TypeormCatalogoReadRepository', () => {
  it('acota el listado por formulario y aplica filtros y orden', async () => {
    const qb = queryBuilder();
    const adapter = new TypeormCatalogoReadRepository({
      createQueryBuilder: jest.fn(() => qb),
    } as any);

    await adapter.findMany({ q: '101', nivel: 3, soloHojas: 'true' }, 2);

    expect(qb.andWhere).toHaveBeenCalledWith('c.formulario = :formulario', {
      formulario: 2,
    });
    expect(qb.andWhere).toHaveBeenCalledWith('c.ausenteDesdeJob IS NULL');
    expect(qb.andWhere).toHaveBeenCalledWith(
      '(c.codigo LIKE :pref OR c.nombre ILIKE :like)',
      { pref: '101%', like: '%101%' },
    );
    expect(qb.andWhere).toHaveBeenCalledWith('c.nivel = :nivel', { nivel: 3 });
    expect(qb.andWhere).toHaveBeenCalledWith('c.esHoja = true');
    expect(qb.orderBy).toHaveBeenCalledWith('c.codigo', 'ASC');
  });

  it('consulta detalle jerárquico con la clave compuesta y resumen del formulario', async () => {
    const repo: any = {
      findOne: jest.fn(async () => null),
      find: jest.fn(async () => []),
      query: jest.fn(async () => [
        { total: '1', vigentes: '1', raices: '1', hojas: '0', nivel_max: '1' },
      ]),
    };
    const adapter = new TypeormCatalogoReadRepository(repo);

    await adapter.findByCodigo('101', 3);
    await adapter.findChildren('101', 3);
    await expect(adapter.getSummary(3)).resolves.toEqual({
      total: 1,
      vigentes: 1,
      raices: 1,
      hojas: 0,
      nivelMax: 1,
    });
    expect(repo.findOne).toHaveBeenCalledWith({
      where: { codigo: '101', formulario: 3 },
    });
    expect(repo.find).toHaveBeenCalledWith({
      where: { codigoPadre: '101', formulario: 3 },
      order: { codigo: 'ASC' },
    });
    expect(repo.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE formulario = $1'),
      [3],
    );
  });
});
