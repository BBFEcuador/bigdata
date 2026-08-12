import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CategoriaCuenta } from './entities/categoria-cuenta.entity';
import { QueryCatalogoDto } from './dto/query-catalogo.dto';

@Injectable()
export class CatalogoService {
  constructor(
    @InjectRepository(CategoriaCuenta)
    private readonly repo: Repository<CategoriaCuenta>,
  ) {}

  /**
   * Listado filtrado.
   *
   * Sin paginación ni conteo acotado, al revés que en `companias`: el catálogo
   * son unos cientos de filas y devolverlo entero es más simple y más rápido
   * que paginarlo. Es una diferencia deliberada, no un olvido.
   */
  async listar(q: QueryCatalogoDto) {
    const qb = this.repo.createQueryBuilder('c');

    if (q.incluirAusentes !== 'true') {
      qb.andWhere('c.ausenteDesdeJob IS NULL');
    }
    if (q.q) {
      // Busca a la vez por código y por nombre: el usuario teclea "1010102" o
      // "PÚBLICAS" en la misma caja.
      qb.andWhere('(c.codigo LIKE :pref OR c.nombre ILIKE :like)', {
        pref: `${q.q}%`,
        like: `%${q.q}%`,
      });
    }
    if (q.nivel) {
      qb.andWhere('c.nivel = :nivel', { nivel: q.nivel });
    }
    if (q.soloHojas === 'true') {
      qb.andWhere('c.esHoja = true');
    }

    const datos = await qb.orderBy('c.codigo', 'ASC').getMany();
    return { datos, total: datos.length };
  }

  /** Detalle de una cuenta, con su padre y sus hijos directos. */
  async detalle(codigo: string) {
    const cuenta = await this.repo.findOne({ where: { codigo } });
    if (!cuenta) throw new NotFoundException(`No existe la cuenta ${codigo}`);

    const [padre, hijos] = await Promise.all([
      cuenta.codigoPadre
        ? this.repo.findOne({ where: { codigo: cuenta.codigoPadre } })
        : Promise.resolve(null),
      this.repo.find({ where: { codigoPadre: codigo }, order: { codigo: 'ASC' } }),
    ]);

    return { cuenta, padre, hijos };
  }

  /** Contadores para la cabecera de la pantalla. */
  async resumen() {
    const [r] = await this.repo.query(
      `SELECT
         count(*)::int                                        AS total,
         count(*) FILTER (WHERE ausente_desde_job IS NULL)::int AS vigentes,
         count(*) FILTER (WHERE codigo_padre IS NULL)::int      AS raices,
         count(*) FILTER (WHERE es_hoja)::int                   AS hojas,
         coalesce(max(nivel), 0)::int                           AS nivel_max
       FROM categoria_cuenta`,
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
