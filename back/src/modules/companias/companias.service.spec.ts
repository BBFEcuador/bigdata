import { CompaniasService } from './companias.service';

function fila(tipo: string, clave: string) {
  return {
    id: `${tipo}-${clave}`,
    tipo,
    expediente: tipo === 'companies' ? clave : null,
    ruc: `09999999999${clave}`.slice(0, 13),
    nombre: `${tipo} ${clave}`,
    ciiuNivel6: null,
  } as any;
}

function queryBuilder(filas: any[]) {
  const qb: any = {
    andWhere: jest.fn(() => qb),
    select: jest.fn(() => qb),
    orderBy: jest.fn(() => qb),
    take: jest.fn(() => qb),
    limit: jest.fn(() => qb),
    getMany: jest.fn(async () => filas),
    getQueryAndParameters: jest.fn(() => ['SELECT 1', []]),
  };
  return qb;
}

describe('CompaniasService', () => {
  it('lista compañías y personas naturales en el mismo universo', async () => {
    const qb = queryBuilder([
      fila('companies', 'COMP-1'),
      fila('natural_contable', 'NAT-1'),
    ]);
    const repo: any = {
      createQueryBuilder: jest.fn(() => qb),
      query: jest.fn(async () => [{ n: '2' }]),
    };
    const service = new CompaniasService(repo);

    const resultado = await service.listar({});

    expect(resultado.datos.map((d: any) => d.tipo)).toEqual([
      'companies',
      'natural_contable',
    ]);
    expect(qb.andWhere).toHaveBeenCalledWith('c.tipo IN (:...poblaciones)', {
      poblaciones: ['companies', 'natural_contable', 'natural_no_contable'],
    });
  });

  it('usa una población explícita sin perder los filtros de catastro', async () => {
    const qb = queryBuilder([]);
    const repo: any = {
      createQueryBuilder: jest.fn(() => qb),
      query: jest.fn(async () => [{ n: '0' }]),
    };
    const service = new CompaniasService(repo);

    await service.listar({
      poblacion: 'natural_no_contable',
      catastro: 'turismo',
    });

    expect(qb.andWhere).toHaveBeenCalledWith('c.tipo = :poblacion', {
      poblacion: 'natural_no_contable',
    });
    expect(qb.andWhere).toHaveBeenCalledWith(
      'c.turismo_registros IS NOT NULL',
      {},
    );
  });

  it('convierte el UUID a texto al paginar y exportar', async () => {
    const qb = queryBuilder([]);
    const repo: any = {
      createQueryBuilder: jest.fn(() => qb),
      query: jest.fn(async () => [{ n: '0' }]),
    };
    const service = new CompaniasService(repo);

    await service.listar({ cursor: '0999999999999' });
    await service.exportarCsv({});

    expect(qb.andWhere).toHaveBeenCalledWith(
      'COALESCE(c.expediente, c.ruc, c.id::text) > :cursor',
      { cursor: '0999999999999' },
    );
    expect(qb.orderBy).toHaveBeenNthCalledWith(
      1,
      'COALESCE(c.expediente, c.ruc, c.id::text)',
      'ASC',
    );
    expect(qb.orderBy).toHaveBeenNthCalledWith(
      2,
      'COALESCE(c.expediente, c.ruc, c.id::text)',
      'ASC',
    );
  });
});
