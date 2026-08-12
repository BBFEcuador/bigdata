import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Balance } from './entities/balance.entity';
import { QueryBalancesDto } from './dto/query-balances.dto';
import { FORMULARIO_IFRS } from './balances.constants';
import { CONCEPTOS, clavePorCodigo } from '../../common/finanzas/conceptos';

/** Todos los códigos clave de todos los formularios, para pedirlos de una vez. */
function todosLosCodigosClave(): string[] {
  const codigos = new Set<string>();
  for (const c of CONCEPTOS) {
    for (const codigo of Object.values(c.codigos)) {
      if (codigo) codigos.add(codigo);
    }
  }
  return [...codigos];
}

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
    // Sin filtro de formulario: en 2021 la mayoría de balances son del fiscal.
    const qb = this.repo.createQueryBuilder('b').where('b.ausenteDesdeJob IS NULL');

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
    // Sin filtrar por formulario: en 2021 la mayoría declaró en el fiscal y en
    // los demás años en el IFRS. Filtrar aquí dejaría 2021 fuera de la serie
    // justo en la empresa que sí lo presentó.
    const cabeceras = await this.repo.find({
      where: { expediente },
      order: { anio: 'ASC' },
    });
    if (cabeceras.length === 0) {
      throw new NotFoundException(`No hay balances del expediente ${expediente}`);
    }

    // Si una empresa declaró el mismo año en dos formularios, gana el IFRS: es
    // el plan con el que se compara todo lo demás.
    const porAnio = new Map<number, Balance>();
    for (const c of cabeceras) {
      const previa = porAnio.get(c.anio);
      if (!previa || c.formulario === FORMULARIO_IFRS) porAnio.set(c.anio, c);
    }
    const usadas = [...porAnio.values()].sort((a, b) => a.anio - b.anio);
    const anios = usadas.map((c) => c.anio);

    const valores = await this.repo.query(
      `SELECT anio, formulario, codigo_cuenta, valor
         FROM balance_cuenta
        WHERE expediente = $1 AND codigo_cuenta = ANY($2::text[])`,
      [expediente, todosLosCodigosClave()],
    );

    // La resolución código -> concepto depende del formulario de CADA año: el
    // activo es la cuenta `1` en el IFRS y la `499` en el fiscal, y el `3`
    // significa cosas distintas en cada uno.
    const claves = new Map<number, Map<string, string>>();
    for (const f of new Set(usadas.map((c) => c.formulario))) {
      claves.set(f, clavePorCodigo(f));
    }

    const valorPorAnioYClave = new Map<number, Record<string, number>>();
    for (const v of valores) {
      const anio = Number(v.anio);
      const formulario = Number(v.formulario);
      if (porAnio.get(anio)?.formulario !== formulario) continue; // el año usa el otro plan
      const clave = claves.get(formulario)?.get(v.codigo_cuenta);
      if (!clave) continue;
      if (!valorPorAnioYClave.has(anio)) valorPorAnioYClave.set(anio, {});
      valorPorAnioYClave.get(anio)![clave] = Number(v.valor);
    }

    const ultima = usadas[usadas.length - 1];

    return {
      expediente,
      ruc: ultima.ruc,
      nombre: ultima.nombre,
      ramaActividad: ultima.ramaActividad,
      descripcionRama: ultima.descripcionRama,
      ciiu: ultima.ciiu,
      anios,
      /** Qué plan de cuentas se usó cada año; el front lo señala. */
      formularios: usadas.map((c) => c.formulario),
      // Una fila por concepto y un valor por año. La ausencia de fila en
      // `balance_cuenta` significa cero, así que aquí se materializa como 0.
      conceptos: CONCEPTOS.map((c) => ({
        clave: c.clave,
        etiqueta: c.etiqueta,
        bloque: c.bloque,
        valores: anios.map((a) => valorPorAnioYClave.get(a)?.[c.clave] ?? 0),
      })),
    };
  }

  /** Balance completo de una compañía en un ejercicio, con nombre de cuenta. */
  async detalle(expediente: string, anio: number, formularioPedido?: number) {
    // El formulario no se asume: en 2021 la mayoría de balances no son IFRS.
    // Si el año tiene los dos, gana el IFRS.
    const candidatas = await this.repo.find({ where: { expediente, anio } });
    const cabecera =
      candidatas.find((c) => c.formulario === (formularioPedido ?? FORMULARIO_IFRS)) ??
      candidatas[0];
    if (!cabecera) {
      throw new NotFoundException(`No hay balance de ${expediente} para ${anio}`);
    }
    const formulario = cabecera.formulario;

    const cuentas = await this.repo.query(
      `SELECT bc.codigo_cuenta, cc.nombre, cc.nivel, cc.es_hoja, bc.valor
         FROM balance_cuenta bc
         JOIN categoria_cuenta cc
           ON cc.codigo = bc.codigo_cuenta AND cc.formulario = bc.formulario
        WHERE bc.expediente = $1 AND bc.anio = $2 AND bc.formulario = $3
        ORDER BY bc.codigo_cuenta`,
      [expediente, anio, formulario],
    );

    return {
      cabecera,
      formulario,
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
