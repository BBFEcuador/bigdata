import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import {
  ActividadCiiuReadModel,
  CiiuQuery,
  CiiuReadRepository,
  ResumenCiiu,
} from '../../application/ports/ciiu-read.repository';
import { ActividadCiiu } from './entities/actividad-ciiu.entity';

@Injectable()
export class TypeormCiiuReadRepository implements CiiuReadRepository {
  constructor(
    @InjectRepository(ActividadCiiu)
    private readonly repository: Repository<ActividadCiiu>,
  ) {}

  async findMany(query: CiiuQuery): Promise<ActividadCiiuReadModel[]> {
    const qb = this.repository.createQueryBuilder('a');
    this.applyFilters(qb, query);
    const actividades = await qb.orderBy('a.codigo', 'ASC').getMany();
    return actividades.map(toReadModel);
  }

  async findByCodigo(codigo: string): Promise<ActividadCiiuReadModel | null> {
    const actividad = await this.repository.findOne({ where: { codigo } });
    return actividad ? toReadModel(actividad) : null;
  }

  async findChildren(codigoPadre: string): Promise<ActividadCiiuReadModel[]> {
    const actividades = await this.repository.find({
      where: { codigoPadre },
      order: { codigo: 'ASC' },
    });
    return actividades.map(toReadModel);
  }

  async findCompanyCounts(): Promise<Map<string, number>> {
    const rows: Array<{ codigo_supercias: string; n: string | number }> =
      await this.repository.query(
        `SELECT ciiu_nivel_6 AS codigo_supercias, count(*)::bigint AS n
         FROM contribuyentes
         WHERE tipo = 'companies' AND ciiu_nivel_6 IS NOT NULL AND ausente_desde_job IS NULL
         GROUP BY ciiu_nivel_6`,
      );
    return new Map(rows.map((row) => [row.codigo_supercias, Number(row.n)]));
  }

  async countCompaniesByCode(codigo: string): Promise<number> {
    const [row] = await this.repository.query(
      `SELECT count(*)::bigint AS n
       FROM contribuyentes
       WHERE tipo = 'companies' AND ausente_desde_job IS NULL
         AND replace(ciiu_nivel_6, '.', '') LIKE $1`,
      [`${codigo}%`],
    );
    return Number(row?.n ?? 0);
  }

  async getSummary(): Promise<ResumenCiiu> {
    const [row] = await this.repository.query(
      `SELECT
         count(*)::int                                          AS total,
         count(*) FILTER (WHERE ausente_desde_job IS NULL)::int AS vigentes,
         count(*) FILTER (WHERE codigo_padre IS NULL)::int      AS raices,
         count(*) FILTER (WHERE es_hoja)::int                   AS hojas,
         coalesce(max(nivel), 0)::int                           AS nivel_max
       FROM actividad_ciiu`,
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
    qb: SelectQueryBuilder<ActividadCiiu>,
    query: CiiuQuery,
  ): void {
    if (query.incluirAusentes !== 'true')
      qb.andWhere('a.ausenteDesdeJob IS NULL');
    if (query.q) {
      qb.andWhere('(a.codigo LIKE :pref OR a.nombre ILIKE :like)', {
        pref: `${query.q.toUpperCase()}%`,
        like: `%${query.q}%`,
      });
    }
    if (query.nivel) qb.andWhere('a.nivel = :nivel', { nivel: query.nivel });
    if (query.soloHojas === 'true') qb.andWhere('a.esHoja = true');
    if (query.limit) qb.take(query.limit);
  }
}

function toReadModel(actividad: ActividadCiiu): ActividadCiiuReadModel {
  return {
    codigo: actividad.codigo,
    nombre: actividad.nombre,
    codigoSupercias: actividad.codigoSupercias,
    codigoPadre: actividad.codigoPadre,
    nivel: actividad.nivel,
    nivelNombre: actividad.nivelNombre,
    esHoja: actividad.esHoja,
    longitud: actividad.longitud,
    aplicacion: actividad.aplicacion,
    rowHash: actividad.rowHash,
    primerJobId: actividad.primerJobId,
    ultimoJobId: actividad.ultimoJobId,
    ausenteDesdeJob: actividad.ausenteDesdeJob,
    createdAt: actividad.createdAt,
    updatedAt: actividad.updatedAt,
  };
}
