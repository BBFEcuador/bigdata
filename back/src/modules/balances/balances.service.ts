import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Balance } from './entities/balance.entity';
import { QueryBalancesDto } from './dto/query-balances.dto';
import { CODIGOS_CLAVE, CONCEPTOS_CLAVE, FORMULARIO_IFRS } from './balances.constants';

@Injectable()
export class BalancesService {
  constructor(@InjectRepository(Balance) private readonly repo: Repository<Balance>) {}

  /**
   * Listado paginado por keyset.
   *
   * Ni `OFFSET` ni `COUNT(*)` sin acotar: son 577.557 cabeceras y ambos se
   * degradan en las páginas profundas. Se ordena por la clave y se devuelve un
   * cursor, igual que en el listado de compañías.
   */
  async listar(q: QueryBalancesDto) {
    const limit = q.limit ?? 50;
    const qb = this.repo
      .createQueryBuilder('b')
      .where('b.ausenteDesdeJob IS NULL')
      .andWhere('b.formulario = :f', { f: FORMULARIO_IFRS });

    if (q.anio) qb.andWhere('b.anio = :anio', { anio: q.anio });
    if (q.nombre) qb.andWhere('b.nombre ILIKE :nombre', { nombre: `%${q.nombre}%` });
    if (q.ruc) qb.andWhere('b.ruc LIKE :ruc', { ruc: `${q.ruc}%` });
    if (q.rama) qb.andWhere('b.ramaActividad = :rama', { rama: q.rama.toUpperCase() });
    if (q.cursor) qb.andWhere('b.expediente > :cursor', { cursor: q.cursor });

    // Una fila de más para saber si hay página siguiente sin contar nada.
    const filas = await qb
      .orderBy('b.expediente', 'ASC')
      .addOrderBy('b.anio', 'ASC')
      .take(limit + 1)
      .getMany();

    const hayMas = filas.length > limit;
    const datos = hayMas ? filas.slice(0, limit) : filas;

    return {
      datos,
      cursorSiguiente: hayMas ? datos[datos.length - 1].expediente : null,
    };
  }

  /** Cuántos balances y cuántas celdas hay por ejercicio. */
  async resumen() {
    const filas = await this.repo.query(`
      SELECT b.anio,
             b.formulario,
             count(*)::int AS balances,
             (SELECT count(*)::bigint FROM balance_cuenta c
               WHERE c.anio = b.anio AND c.formulario = b.formulario) AS celdas
      FROM balance b
      WHERE b.ausente_desde_job IS NULL
      GROUP BY b.anio, b.formulario
      ORDER BY b.anio DESC
    `);
    return filas.map((f: Record<string, string>) => ({
      anio: Number(f.anio),
      formulario: Number(f.formulario),
      balances: Number(f.balances),
      celdas: Number(f.celdas),
    }));
  }

  /**
   * Serie histórica de una compañía: las cuentas grandes, un año por columna.
   *
   * Es la consulta que da sentido a haber cargado cinco ejercicios. Sólo pide
   * las 13 cuentas de `CONCEPTOS_CLAVE`, así que toca unas decenas de filas por
   * empresa en vez de las ~7.000 que suman sus cinco balances completos.
   */
  async comparativo(expediente: string) {
    const cabeceras = await this.repo.find({
      where: { expediente, formulario: FORMULARIO_IFRS },
      order: { anio: 'ASC' },
    });
    if (cabeceras.length === 0) {
      throw new NotFoundException(`No hay balances del expediente ${expediente}`);
    }

    const valores = await this.repo.query(
      `SELECT anio, codigo_cuenta, valor
         FROM balance_cuenta
        WHERE expediente = $1 AND formulario = $2 AND codigo_cuenta = ANY($3::text[])`,
      [expediente, FORMULARIO_IFRS, CODIGOS_CLAVE],
    );

    const porAnio = new Map<number, Record<string, number>>();
    for (const v of valores) {
      const anio = Number(v.anio);
      if (!porAnio.has(anio)) porAnio.set(anio, {});
      porAnio.get(anio)![v.codigo_cuenta] = Number(v.valor);
    }

    const anios = cabeceras.map((c) => c.anio);
    const ultima = cabeceras[cabeceras.length - 1];

    return {
      expediente,
      ruc: ultima.ruc,
      nombre: ultima.nombre,
      ramaActividad: ultima.ramaActividad,
      descripcionRama: ultima.descripcionRama,
      ciiu: ultima.ciiu,
      anios,
      // Una fila por concepto y un valor por año. La ausencia de fila en
      // `balance_cuenta` significa cero, así que aquí se materializa como 0.
      conceptos: CONCEPTOS_CLAVE.map((c) => ({
        clave: c.clave,
        codigo: c.codigo,
        etiqueta: c.etiqueta,
        bloque: c.bloque,
        valores: anios.map((a) => porAnio.get(a)?.[c.codigo] ?? 0),
      })),
    };
  }

  /** Balance completo de una compañía en un ejercicio, con nombre de cuenta. */
  async detalle(expediente: string, anio: number) {
    const cabecera = await this.repo.findOne({
      where: { expediente, anio, formulario: FORMULARIO_IFRS },
    });
    if (!cabecera) {
      throw new NotFoundException(`No hay balance de ${expediente} para ${anio}`);
    }

    const cuentas = await this.repo.query(
      `SELECT bc.codigo_cuenta, cc.nombre, cc.nivel, cc.es_hoja, bc.valor
         FROM balance_cuenta bc
         JOIN categoria_cuenta cc ON cc.codigo = bc.codigo_cuenta
        WHERE bc.expediente = $1 AND bc.anio = $2 AND bc.formulario = $3
        ORDER BY bc.codigo_cuenta`,
      [expediente, anio, FORMULARIO_IFRS],
    );

    return {
      cabecera,
      cuentas: cuentas.map((c: Record<string, string>) => ({
        codigo: c.codigo_cuenta,
        nombre: c.nombre,
        nivel: Number(c.nivel),
        esHoja: c.es_hoja as unknown as boolean,
        valor: Number(c.valor),
      })),
    };
  }
}
