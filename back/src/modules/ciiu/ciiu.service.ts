import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ActividadCiiu } from './entities/actividad-ciiu.entity';
import { QueryCiiuDto } from './dto/query-ciiu.dto';

@Injectable()
export class CiiuService {
  constructor(
    @InjectRepository(ActividadCiiu)
    private readonly repo: Repository<ActividadCiiu>,
  ) {}

  /**
   * Listado filtrado, sin paginación: son ~3.000 filas y devolverlas enteras es
   * más simple y más rápido que paginarlas. Misma decisión que en el plan de
   * cuentas, y deliberadamente distinta de `companias`.
   */
  async listar(q: QueryCiiuDto) {
    const qb = this.repo.createQueryBuilder('a');

    if (q.incluirAusentes !== 'true') qb.andWhere('a.ausenteDesdeJob IS NULL');
    if (q.q) {
      qb.andWhere('(a.codigo LIKE :pref OR a.nombre ILIKE :like)', {
        pref: `${q.q.toUpperCase()}%`,
        like: `%${q.q}%`,
      });
    }
    if (q.nivel) qb.andWhere('a.nivel = :nivel', { nivel: q.nivel });
    if (q.soloHojas === 'true') qb.andWhere('a.esHoja = true');
    if (q.limit) qb.take(q.limit);

    const datos = await qb.orderBy('a.codigo', 'ASC').getMany();

    if (q.conConteo !== 'true') return { datos, total: datos.length };

    // Un solo agregado para todas las filas, en vez de una consulta por fila.
    const conteos: { codigo_supercias: string; n: string }[] = await this.repo.query(
      `SELECT ciiu_nivel_6 AS codigo_supercias, count(*)::bigint AS n
       FROM companias
       WHERE ciiu_nivel_6 IS NOT NULL AND ausente_desde_job IS NULL
       GROUP BY ciiu_nivel_6`,
    );
    const porCodigo = new Map(conteos.map((c) => [c.codigo_supercias, Number(c.n)]));

    return {
      datos: datos.map((d) => ({
        ...d,
        companias: d.codigoSupercias ? porCodigo.get(d.codigoSupercias) ?? 0 : null,
      })),
      total: datos.length,
    };
  }

  /** Detalle con su padre, sus hijos directos y cuántas compañías tiene. */
  async detalle(codigo: string) {
    const actividad = await this.repo.findOne({ where: { codigo: codigo.toUpperCase() } });
    if (!actividad) throw new NotFoundException(`No existe la actividad ${codigo}`);

    const [padre, hijos, conteo] = await Promise.all([
      actividad.codigoPadre
        ? this.repo.findOne({ where: { codigo: actividad.codigoPadre } })
        : Promise.resolve(null),
      this.repo.find({ where: { codigoPadre: actividad.codigo }, order: { codigo: 'ASC' } }),
      this.contarCompanias(actividad.codigo),
    ]);

    return { actividad, padre, hijos, companias: conteo };
  }

  /**
   * Cuántas compañías caen bajo un código, a cualquier nivel.
   *
   * Para el último nivel es una igualdad contra `codigo_supercias`; para un
   * nivel superior, un prefijo sobre el código normalizado sin punto, que es
   * justo lo que cubre el índice funcional `idx_companias_ciiu6_norm`.
   */
  private async contarCompanias(codigo: string): Promise<number> {
    const [r] = await this.repo.query(
      `SELECT count(*)::bigint AS n
       FROM companias
       WHERE ausente_desde_job IS NULL
         AND replace(ciiu_nivel_6, '.', '') LIKE $1`,
      [`${codigo}%`],
    );
    return Number(r?.n ?? 0);
  }

  async resumen() {
    const [r] = await this.repo.query(
      `SELECT
         count(*)::int                                          AS total,
         count(*) FILTER (WHERE ausente_desde_job IS NULL)::int  AS vigentes,
         count(*) FILTER (WHERE codigo_padre IS NULL)::int       AS raices,
         count(*) FILTER (WHERE es_hoja)::int                    AS hojas,
         coalesce(max(nivel), 0)::int                            AS nivel_max
       FROM actividad_ciiu`,
    );
    return {
      total: r?.total ?? 0,
      vigentes: r?.vigentes ?? 0,
      raices: r?.raices ?? 0,
      hojas: r?.hojas ?? 0,
      nivelMax: r?.nivel_max ?? 0,
    };
  }
}
