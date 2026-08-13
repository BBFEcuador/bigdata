import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import {
  CatalogoQuery,
  CatalogoReadRepository,
  CategoriaCuentaReadModel,
  ResumenCatalogo,
} from '../../application/ports/catalogo-read.repository';
import { CategoriaCuenta } from './entities/categoria-cuenta.entity';

@Injectable()
export class TypeormCatalogoReadRepository implements CatalogoReadRepository {
  constructor(
    @InjectRepository(CategoriaCuenta)
    private readonly repository: Repository<CategoriaCuenta>,
  ) {}

  async findMany(
    query: CatalogoQuery,
    formulario: number,
  ): Promise<CategoriaCuentaReadModel[]> {
    const qb = this.repository.createQueryBuilder('c');
    qb.andWhere('c.formulario = :formulario', { formulario });
    this.applyFilters(qb, query);
    const cuentas = await qb.orderBy('c.codigo', 'ASC').getMany();
    return cuentas.map(toReadModel);
  }

  async findByCodigo(
    codigo: string,
    formulario: number,
  ): Promise<CategoriaCuentaReadModel | null> {
    const cuenta = await this.repository.findOne({
      where: { codigo, formulario },
    });
    return cuenta ? toReadModel(cuenta) : null;
  }

  async findChildren(
    codigoPadre: string,
    formulario: number,
  ): Promise<CategoriaCuentaReadModel[]> {
    const cuentas = await this.repository.find({
      where: { codigoPadre, formulario },
      order: { codigo: 'ASC' },
    });
    return cuentas.map(toReadModel);
  }

  async getSummary(formulario: number): Promise<ResumenCatalogo> {
    const [row] = await this.repository.query(
      `SELECT
         count(*)::int                                          AS total,
         count(*) FILTER (WHERE ausente_desde_job IS NULL)::int AS vigentes,
         count(*) FILTER (WHERE codigo_padre IS NULL)::int      AS raices,
         count(*) FILTER (WHERE es_hoja)::int                   AS hojas,
         coalesce(max(nivel), 0)::int                           AS nivel_max
       FROM categoria_cuenta
       WHERE formulario = $1`,
      [formulario],
    );
    return {
      total: Number(row?.total ?? 0),
      vigentes: Number(row?.vigentes ?? 0),
      raices: Number(row?.raices ?? 0),
      hojas: Number(row?.hojas ?? 0),
      nivelMax: Number(row?.nivel_max ?? 0),
    };
  }

  private applyFilters(
    qb: SelectQueryBuilder<CategoriaCuenta>,
    query: CatalogoQuery,
  ): void {
    if (query.incluirAusentes !== 'true')
      qb.andWhere('c.ausenteDesdeJob IS NULL');
    if (query.q) {
      qb.andWhere('(c.codigo LIKE :pref OR c.nombre ILIKE :like)', {
        pref: `${query.q}%`,
        like: `%${query.q}%`,
      });
    }
    if (query.nivel) qb.andWhere('c.nivel = :nivel', { nivel: query.nivel });
    if (query.soloHojas === 'true') qb.andWhere('c.esHoja = true');
  }
}

function toReadModel(cuenta: CategoriaCuenta): CategoriaCuentaReadModel {
  return {
    formulario: cuenta.formulario,
    codigo: cuenta.codigo,
    nombre: cuenta.nombre,
    codigoPadre: cuenta.codigoPadre,
    nivel: cuenta.nivel,
    esHoja: cuenta.esHoja,
    longitud: cuenta.longitud,
    rowHash: cuenta.rowHash,
    primerJobId: cuenta.primerJobId,
    ultimoJobId: cuenta.ultimoJobId,
    ausenteDesdeJob: cuenta.ausenteDesdeJob,
    createdAt: cuenta.createdAt,
    updatedAt: cuenta.updatedAt,
  };
}
