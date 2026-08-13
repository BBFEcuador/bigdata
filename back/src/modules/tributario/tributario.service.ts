import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { QueryRiesgoDto } from './dto/query-riesgo.dto';

/**
 * Consulta del riesgo tributario.
 *
 * Todo lo caro está precalculado en `riesgo_tributario_anio` y
 * `perfil_riesgo_tributario`: aquí no se aplica ningún coeficiente ni se calcula
 * ningún percentil. Si esta capa hiciera cuentas propias, habría dos
 * definiciones del mismo indicador y sólo una se corregiría.
 */
@Injectable()
export class TributarioService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /** Panorama por ejercicio: para saber qué se está mirando antes de mirarlo. */
  async resumen() {
    const porAnio = await this.dataSource.query(`
      SELECT anio,
             count(*)::int                                          AS balances,
             count(*) FILTER (WHERE poblacion = 'comparable')::int   AS comparables,
             count(*) FILTER (WHERE poblacion = 'sin_utilidad')::int AS sin_utilidad,
             count(*) FILTER (WHERE poblacion = 'sin_ingresos')::int AS sin_ingresos,
             count(*) FILTER (WHERE base_manda = 'activos')::int      AS manda_activos,
             count(*) FILTER (WHERE base_manda = 'costos_gastos')::int AS manda_costos,
             count(*) FILTER (WHERE base_manda = 'ingresos')::int     AS manda_ingresos,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY intensidad)
               FILTER (WHERE poblacion = 'comparable')               AS intensidad_mediana
        FROM riesgo_tributario_anio
       GROUP BY anio
       ORDER BY anio
    `);

    const [persistencia] = await this.dataSource.query(`
      SELECT count(*)::int                                        AS companias,
             count(*) FILTER (WHERE anios_decil_alto = 4)::int     AS decil_alto_4,
             count(*) FILTER (WHERE anios_decil_alto = 3)::int     AS decil_alto_3,
             count(*) FILTER (WHERE anios_decil_alto >= 1)::int    AS decil_alto_1mas
        FROM perfil_riesgo_tributario
    `);

    // Sin esto la pantalla no puede decir de dónde sale cada cifra, y estas
    // cifras se acaban enseñando a un contribuyente.
    const resoluciones = await this.dataSource.query(
      `SELECT anio, resolucion, suscrita, registro FROM resolucion_presuntiva ORDER BY anio`,
    );

    // Devolución potencial: impuesto ya pagado que sigue en el activo.
    const credito = await this.dataSource.query(`
      SELECT anio,
             count(*) FILTER (WHERE (magnitudes->>'creditoIva')::numeric > 0)::int AS con_iva,
             count(*) FILTER (WHERE (magnitudes->>'creditoIr')::numeric > 0)::int  AS con_ir,
             sum(greatest((magnitudes->>'creditoIva')::numeric, 0)) AS suma_iva,
             sum(greatest((magnitudes->>'creditoIr')::numeric, 0))  AS suma_ir
        FROM balance_magnitud
       GROUP BY anio
       ORDER BY anio
    `);

    return { porAnio, persistencia, credito, resoluciones };
  }

  /** Ranking, con el detalle del ejercicio pedido. */
  async listar(q: QueryRiesgoDto) {
    const limit = q.limit ?? 50;
    const offset = q.offset ?? 0;
    const poblacion = q.poblacion ?? 'comparable';
    const orden = q.orden ?? 'percentil';

    const where: string[] = ['a.poblacion = $1'];
    const params: unknown[] = [poblacion];

    if (q.anio) {
      params.push(q.anio);
      where.push(`a.anio = $${params.length}`);
    } else {
      // Sin año, el último de cada empresa: mezclar ejercicios en una misma
      // lista compararía percentiles calculados contra poblaciones distintas.
      where.push(`a.anio = p.anio_ult`);
    }
    if (q.persistencia !== undefined) {
      params.push(q.persistencia);
      where.push(`p.anios_decil_alto >= $${params.length}`);
    }
    if (q.brechaMinima) {
      params.push(q.brechaMinima);
      where.push(`a.brecha >= $${params.length}`);
    }
    if (q.rama) {
      params.push(`${q.rama.toUpperCase()}%`);
      where.push(`a.grupo_ciiu LIKE $${params.length}`);
    }
    if (q.q) {
      params.push(`%${q.q.trim()}%`);
      const i = params.length;
      where.push(
        `(c.nombre ILIKE $${i} OR c.ruc LIKE $${i} OR a.expediente = $${i})`,
      );
    }

    // `NULLS LAST` no es cosmético: en un ranking descendente los nulos van
    // primero y llenarían la primera página de filas sin dato.
    const orderBy = {
      percentil: 'a.percentil DESC NULLS LAST, a.brecha DESC',
      brecha: 'a.brecha DESC NULLS LAST',
      brecha_total: 'p.brecha_total DESC NULLS LAST',
    }[orden];

    params.push(limit, offset);

    const datos = await this.dataSource.query(
      `SELECT a.anio, a.expediente, a.ruc, c.nombre, a.grupo_ciiu,
              ci.nombre                AS actividad,
              a.nivel_pares, a.n_pares,
              a.ingresos, a.costos_gastos, a.activo, a.declarada,
              a.base_presunta, a.base_manda, a.brecha, a.intensidad, a.percentil,
              p.anios_con_datos, a.poblacion,
              p.anios_decil_alto, p.anios_sin_utilidad, p.brecha_total
         FROM riesgo_tributario_anio a
         JOIN perfil_riesgo_tributario p USING (expediente)
         JOIN contribuyentes c USING (expediente)
         LEFT JOIN actividad_ciiu ci ON ci.codigo = a.grupo_ciiu
        WHERE ${where.join(' AND ')}
        ORDER BY ${orderBy}
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    const [{ total }] = await this.dataSource.query(
      `SELECT count(*)::int AS total
         FROM riesgo_tributario_anio a
         JOIN perfil_riesgo_tributario p USING (expediente)
         JOIN contribuyentes c USING (expediente)
        WHERE ${where.join(' AND ')}`,
      params.slice(0, params.length - 2),
    );

    return { datos, total, limit, offset };
  }

  /**
   * Pago a cuenta sobre utilidades no distribuidas
   * (Resolución NAC-DGERCGC26-00000026).
   *
   * No es un ranking: es una lista de avisos. Quien tiene resultados acumulados
   * positivos en su último balance tiene la obligación encima.
   *
   * El total sale de la cuenta 306, que es la que el contribuyente ve en su
   * balance. Se devuelve además cuánto de ese total es adopción de NIIF, que no
   * es repartible: sin ese desglose la cifra promete dividendos que no existen.
   */
  async utilidadesNoDistribuidas(q: {
    anio?: number;
    minimo?: number;
    rama?: string;
    q?: string;
    offset?: number;
    limit?: number;
  }) {
    const limit = q.limit ?? 50;
    const offset = q.offset ?? 0;

    const [{ anio }] = await this.dataSource.query(
      `SELECT max(anio)::int AS anio FROM utilidad_no_distribuida`,
    );
    const ejercicio = q.anio ?? anio;

    // La población es la de la obligación —base positiva—, no la de "tiene
    // acumuladas": una compañía con acumuladas negativas y un ejercicio muy
    // bueno también debe el anticipo, y al revés.
    const where = ['u.anio = $1', 'u.base_anticipo > 0'];
    const params: unknown[] = [ejercicio];

    if (q.minimo) {
      params.push(q.minimo);
      where.push(`u.base_anticipo >= $${params.length}`);
    }
    if (q.rama) {
      params.push(`${q.rama.toUpperCase()}%`);
      where.push(`c.ciiu_nivel_6 LIKE $${params.length}`);
    }
    if (q.q) {
      params.push(`%${q.q.trim()}%`);
      const i = params.length;
      where.push(
        `(c.nombre ILIKE $${i} OR c.ruc LIKE $${i} OR u.expediente = $${i})`,
      );
    }

    params.push(limit, offset);
    const datos = await this.dataSource.query(
      `SELECT u.anio, u.expediente, u.ruc, c.nombre, c.situacion_legal,
              substring(c.ciiu_nivel_6 from 1 for 4) AS grupo_ciiu,
              u.netas, u.origen, u.total_306, u.acumuladas, u.perdidas, u.niif,
              u.netas_sin_niif, u.patrimonio, u.financiera, u.tipo,
              u.utilidad_ejercicio, u.base_anticipo, u.anticipo_provisional,
              u.netas_prev, u.variacion, u.peso_patrimonio
         FROM utilidad_no_distribuida u
         JOIN contribuyentes c USING (expediente)
        WHERE ${where.join(' AND ')}
        ORDER BY u.base_anticipo DESC
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    const [total] = await this.dataSource.query(
      `SELECT count(*)::int AS filas,
              count(*) FILTER (WHERE u.financiera)::int AS financieras,
              sum(u.base_anticipo) AS suma_base,
              sum(u.anticipo_provisional) AS suma_anticipo,
              sum(coalesce(u.niif, 0)) AS suma_niif
         FROM utilidad_no_distribuida u
         JOIN contribuyentes c USING (expediente)
        WHERE ${where.join(' AND ')}`,
      params.slice(0, params.length - 2),
    );

    // La caída de las acumuladas es la huella que deja una distribución, y es
    // lo único que tenemos: los casilleros de dividendos (626/627) sólo existen
    // en el formulario fiscal, y desde 2023 todo viene en el 1.
    const [movimiento] = await this.dataSource.query(
      `SELECT count(*) FILTER (WHERE variacion < 0)::int AS bajaron,
              count(*) FILTER (WHERE variacion > 0)::int AS subieron,
              count(*) FILTER (WHERE variacion IS NULL)::int AS sin_comparativo
         FROM utilidad_no_distribuida
        WHERE anio = $1 AND netas > 0`,
      [ejercicio],
    );

    return {
      anio: ejercicio,
      datos,
      total: total.filas,
      financieras: total.financieras,
      sumaBase: total.suma_base,
      sumaAnticipo: total.suma_anticipo,
      sumaNiif: total.suma_niif,
      // La escala real todavía no está cargada. Se manda tal cual para que la
      // pantalla pueda decir con qué tarifa se calculó en vez de presentar el
      // número como si fuera definitivo.
      tarifa: await this.dataSource
        .query(
          `SELECT tramo, desde, hasta, tarifa, nota FROM tarifa_pago_a_cuenta ORDER BY tramo`,
        )
        .then((t) => ({ tramos: t, completa: t.length > 1 })),
      movimiento,
      limit,
      offset,
      resolucion: {
        numero: 'NAC-DGERCGC26-00000026',
        suscrita: '2026-07-14',
        corte: `31 de julio de ${ejercicio + 1}`,
        codigos: { unaCuota: '1077', tresCuotas: '1078' },
      },
    };
  }

  /**
   * Crédito tributario por compañía y ejercicio: la devolución potencial.
   *
   * Los años van en columnas —una fila por compañía— porque la pregunta es
   * "¿cuánto lleva acumulado y desde cuándo?", y eso en formato largo obliga a
   * leer cinco filas para responderla. El pivote se hace aquí y no en el
   * cliente: son 150.000 compañías y el filtro por monto tiene que aplicarse
   * antes de paginar.
   *
   * Por defecto sólo las **comparables** de la presuntiva: son las que
   * declararon ingresos y utilidad, y por tanto las que tienen una devolución
   * que reclamar de verdad.
   */
  async creditoTributario(q: {
    soloComparables?: boolean;
    minimo?: number;
    rama?: string;
    q?: string;
    offset?: number;
    limit?: number;
  }) {
    const limit = q.limit ?? 50;
    const offset = q.offset ?? 0;
    const soloComparables = q.soloComparables !== false;

    const anios: { anio: number }[] = await this.dataSource.query(
      `SELECT DISTINCT anio FROM balance_magnitud ORDER BY anio`,
    );
    const [{ ultimo }] = await this.dataSource.query(
      `SELECT max(anio)::int AS ultimo FROM balance_magnitud`,
    );

    const where: string[] = [];
    const params: unknown[] = [ultimo];

    if (soloComparables) {
      where.push(`EXISTS (SELECT 1 FROM riesgo_tributario_anio r
                           WHERE r.expediente = m.expediente
                             AND r.poblacion = 'comparable')`);
    }
    if (q.rama) {
      params.push(`${q.rama.toUpperCase()}%`);
      where.push(`c.ciiu_nivel_6 LIKE $${params.length}`);
    }
    if (q.q) {
      params.push(`%${q.q.trim()}%`);
      const i = params.length;
      where.push(
        `(c.nombre ILIKE $${i} OR c.ruc LIKE $${i} OR m.expediente = $${i})`,
      );
    }

    // El mínimo se aplica al ejercicio más reciente, no a la suma de todos:
    // un crédito de hace cuatro años que ya se compensó no es una devolución
    // pendiente, y sumarlo inflaría la lista con saldos muertos.
    let having = '';
    if (q.minimo) {
      params.push(q.minimo);
      having = `HAVING sum(coalesce((m.magnitudes->>'creditoIva')::numeric, 0)
                        + coalesce((m.magnitudes->>'creditoIr')::numeric, 0))
                       FILTER (WHERE m.anio = $1) >= $${params.length}`;
    }

    params.push(limit, offset);
    const datos = await this.dataSource.query(
      `SELECT m.expediente, c.ruc, c.nombre,
              substring(c.ciiu_nivel_6 from 1 for 4) AS grupo_ciiu,
              jsonb_object_agg(m.anio, jsonb_build_object(
                'iva', (m.magnitudes->>'creditoIva')::numeric,
                'ir',  (m.magnitudes->>'creditoIr')::numeric
              )) AS por_anio,
              sum(coalesce((m.magnitudes->>'creditoIva')::numeric, 0)
                + coalesce((m.magnitudes->>'creditoIr')::numeric, 0))
                FILTER (WHERE m.anio = $1) AS ultimo_total,
              min(d.diagnostico_iva) AS diagnostico_iva,
              min(d.diagnostico_ir)  AS diagnostico_ir,
              min(d.iva_sube) AS iva_sube, min(d.iva_baja) AS iva_baja,
              min(d.ir_sube)  AS ir_sube,  min(d.ir_baja)  AS ir_baja
         FROM balance_magnitud m
         JOIN contribuyentes c USING (expediente)
         LEFT JOIN credito_tributario_empresa d USING (expediente)
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        GROUP BY m.expediente, c.ruc, c.nombre, c.ciiu_nivel_6
        ${having}
        ORDER BY ultimo_total DESC NULLS LAST
        LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    const [totales] = await this.dataSource.query(
      `SELECT count(*)::int AS companias,
              sum(greatest((m.magnitudes->>'creditoIva')::numeric, 0)) AS suma_iva,
              sum(greatest((m.magnitudes->>'creditoIr')::numeric, 0))  AS suma_ir
         FROM balance_magnitud m
         JOIN contribuyentes c USING (expediente)
        WHERE m.anio = $1
          ${where.length ? `AND ${where.join(' AND ')}` : ''}`,
      params.slice(0, params.length - 2 - (q.minimo ? 1 : 0)),
    );

    return {
      anios: anios.map((a) => a.anio),
      ultimo,
      datos,
      totales,
      limit,
      offset,
    };
  }

  /** Ficha: la serie completa de la compañía, ejercicio por ejercicio. */
  async ficha(expediente: string) {
    const [empresa] = await this.dataSource.query(
      `SELECT c.expediente, c.ruc, c.nombre, c.ciiu_nivel_6, c.situacion_legal,
              c.sri_clase_contribuyente = 'RMP' AS rimpe,
              p.anios_con_datos, p.anios_decil_alto, p.anios_sin_utilidad,
              p.brecha_total, p.percentil_maximo, p.grupo_ciiu,
              ci.nombre AS actividad
         FROM contribuyentes c
         LEFT JOIN perfil_riesgo_tributario p USING (expediente)
         LEFT JOIN actividad_ciiu ci ON ci.codigo = p.grupo_ciiu
        WHERE c.expediente = $1`,
      [expediente],
    );
    if (!empresa) return null;

    const ejercicios = await this.dataSource.query(
      `SELECT a.anio, a.poblacion, a.nivel_pares, a.clave_pares, a.n_pares,
              a.ingresos, a.costos_gastos, a.activo, a.declarada,
              r.coef_ingresos, r.coef_costos_gastos, r.coef_activos, r.coef_especifico,
              r.base_ingresos, r.base_costos_gastos, r.base_activos,
              a.base_presunta, a.base_manda, a.brecha, a.intensidad, a.percentil
         FROM riesgo_tributario_anio a
         JOIN riesgo_tributario r USING (anio, expediente)
        WHERE a.expediente = $1
        ORDER BY a.anio`,
      [expediente],
    );

    const resoluciones = await this.dataSource.query(
      `SELECT anio, resolucion, suscrita, registro FROM resolucion_presuntiva ORDER BY anio`,
    );

    // El crédito tributario NO sale de las vistas de presuntiva: aquellas sólo
    // cubren los ejercicios con resolución (2021-2024) y esto interesa hasta el
    // último balance. Es un activo —impuesto ya pagado— y por tanto la
    // devolución a la que la compañía tiene derecho.
    const credito = await this.dataSource.query(
      `SELECT anio,
              (magnitudes->>'creditoIva')::numeric AS iva,
              (magnitudes->>'creditoIr')::numeric  AS ir,
              coalesce((magnitudes->>'creditoIva')::numeric, 0)
                + coalesce((magnitudes->>'creditoIr')::numeric, 0) AS total
         FROM balance_magnitud
        WHERE expediente = $1
        ORDER BY anio`,
      [expediente],
    );

    // El diagnóstico de la trayectoria: un saldo que sólo crece es impuesto que
    // nadie ha imputado contra nada.
    const [diagnostico] = await this.dataSource.query(
      `SELECT anios, ultimo_anio, iva_ini, iva_ult, iva_max, iva_sube, iva_baja,
              ir_ini, ir_ult, ir_max, ir_sube, ir_baja,
              diagnostico_iva, diagnostico_ir
         FROM credito_tributario_empresa
        WHERE expediente = $1`,
      [expediente],
    );

    const noDistribuidas = await this.dataSource.query(
      `SELECT anio, netas, niif, utilidad_ejercicio, base_anticipo, anticipo_provisional,
              origen, financiera
         FROM utilidad_no_distribuida
        WHERE expediente = $1
        ORDER BY anio`,
      [expediente],
    );

    const [tarifa] = await this.dataSource.query(
      `SELECT tramo, tarifa FROM tarifa_pago_a_cuenta ORDER BY tramo LIMIT 1`,
    );

    return {
      empresa,
      ejercicios,
      credito,
      diagnostico,
      noDistribuidas,
      tarifa,
      resoluciones,
    };
  }
}
