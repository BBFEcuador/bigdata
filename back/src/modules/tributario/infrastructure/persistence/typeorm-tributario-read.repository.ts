import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  ConsultaCredito,
  ConsultaRiesgo,
  ConsultaUtilidades,
  FichaTributaria,
  MetadatosCredito,
  ResumenTributario,
  ResultadoCredito,
  ResultadoListadoRiesgo,
  ResultadoUtilidades,
  TributarioReadRepository,
} from '../../application/ports/tributario-read.repository';
import { RiesgoTributarioAnio } from './entities/riesgo-tributario-anio.entity';

@Injectable()
export class TypeormTributarioReadRepository implements TributarioReadRepository {
  constructor(
    @InjectRepository(RiesgoTributarioAnio)
    private readonly repository: Repository<RiesgoTributarioAnio>,
  ) {}

  async getResumen(): Promise<ResumenTributario> {
    const porAnio = await this.repository.query(
      `SELECT anio, count(*)::int AS balances, count(*) FILTER (WHERE poblacion = 'comparable')::int AS comparables, count(*) FILTER (WHERE poblacion = 'sin_utilidad')::int AS sin_utilidad, count(*) FILTER (WHERE poblacion = 'sin_ingresos')::int AS sin_ingresos, count(*) FILTER (WHERE base_manda = 'activos')::int AS manda_activos, count(*) FILTER (WHERE base_manda = 'costos_gastos')::int AS manda_costos, count(*) FILTER (WHERE base_manda = 'ingresos')::int AS manda_ingresos, percentile_cont(0.5) WITHIN GROUP (ORDER BY intensidad) FILTER (WHERE poblacion = 'comparable') AS intensidad_mediana FROM riesgo_tributario_anio GROUP BY anio ORDER BY anio`,
    );
    const [persistencia] = await this.repository.query(
      `SELECT count(*)::int AS companias, count(*) FILTER (WHERE anios_decil_alto = 4)::int AS decil_alto_4, count(*) FILTER (WHERE anios_decil_alto = 3)::int AS decil_alto_3, count(*) FILTER (WHERE anios_decil_alto >= 1)::int AS decil_alto_1mas FROM perfil_riesgo_tributario`,
    );
    const resoluciones = await this.repository.query(
      `SELECT anio, resolucion, suscrita, registro FROM resolucion_presuntiva ORDER BY anio`,
    );
    const credito = await this.repository.query(
      `SELECT anio, count(*) FILTER (WHERE (magnitudes->>'creditoIva')::numeric > 0)::int AS con_iva, count(*) FILTER (WHERE (magnitudes->>'creditoIr')::numeric > 0)::int AS con_ir, sum(greatest((magnitudes->>'creditoIva')::numeric, 0)) AS suma_iva, sum(greatest((magnitudes->>'creditoIr')::numeric, 0)) AS suma_ir FROM balance_magnitud GROUP BY anio ORDER BY anio`,
    );
    return { porAnio, persistencia, credito, resoluciones };
  }

  async listarRiesgo(query: ConsultaRiesgo): Promise<ResultadoListadoRiesgo> {
    const where: string[] = ['a.poblacion = $1'];
    const params: unknown[] = [query.poblacion];
    if (query.anio) {
      params.push(query.anio);
      where.push(`a.anio = $${params.length}`);
    } else where.push('a.anio = p.anio_ult');
    if (query.persistencia !== undefined) {
      params.push(query.persistencia);
      where.push(`p.anios_decil_alto >= $${params.length}`);
    }
    if (query.brechaMinima) {
      params.push(query.brechaMinima);
      where.push(`a.brecha >= $${params.length}`);
    }
    if (query.rama) {
      params.push(`${query.rama}%`);
      where.push(`a.grupo_ciiu LIKE $${params.length}`);
    }
    if (query.q) {
      params.push(`%${query.q.trim()}%`);
      const i = params.length;
      where.push(
        `(c.nombre ILIKE $${i} OR c.ruc LIKE $${i} OR a.expediente = $${i})`,
      );
    }
    const orderBy = {
      percentil: 'a.percentil DESC NULLS LAST, a.brecha DESC',
      brecha: 'a.brecha DESC NULLS LAST',
      brecha_total: 'p.brecha_total DESC NULLS LAST',
    }[query.orden];
    params.push(query.limit, query.offset);
    const datos = await this.repository.query(
      `SELECT a.anio, a.expediente, a.ruc, c.nombre, a.grupo_ciiu, ci.nombre AS actividad, a.nivel_pares, a.n_pares, a.ingresos, a.costos_gastos, a.activo, a.declarada, a.base_presunta, a.base_manda, a.brecha, a.intensidad, a.percentil, p.anios_con_datos, a.poblacion, p.anios_decil_alto, p.anios_sin_utilidad, p.brecha_total FROM riesgo_tributario_anio a JOIN perfil_riesgo_tributario p USING (expediente) JOIN contribuyentes c USING (expediente) LEFT JOIN actividad_ciiu ci ON ci.codigo = a.grupo_ciiu WHERE ${where.join(' AND ')} ORDER BY ${orderBy} LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    const [{ total }] = await this.repository.query(
      `SELECT count(*)::int AS total FROM riesgo_tributario_anio a JOIN perfil_riesgo_tributario p USING (expediente) JOIN contribuyentes c USING (expediente) WHERE ${where.join(' AND ')}`,
      params.slice(0, -2),
    );
    return { datos, total };
  }

  async getUltimoAnioUtilidades(): Promise<number | null> {
    const [{ anio }] = await this.repository.query(
      `SELECT max(anio)::int AS anio FROM utilidad_no_distribuida`,
    );
    return anio;
  }

  async listarUtilidades(
    query: ConsultaUtilidades,
    ejercicio: number | null,
  ): Promise<ResultadoUtilidades> {
    const where = ['u.anio = $1', 'u.base_anticipo > 0'];
    const params: unknown[] = [ejercicio];
    if (query.minimo) {
      params.push(query.minimo);
      where.push(`u.base_anticipo >= $${params.length}`);
    }
    if (query.rama) {
      params.push(`${query.rama}%`);
      where.push(`c.ciiu_nivel_6 LIKE $${params.length}`);
    }
    if (query.q) {
      params.push(`%${query.q.trim()}%`);
      const i = params.length;
      where.push(
        `(c.nombre ILIKE $${i} OR c.ruc LIKE $${i} OR u.expediente = $${i})`,
      );
    }
    params.push(query.limit, query.offset);
    const datos = await this.repository.query(
      `SELECT u.anio, u.expediente, u.ruc, c.nombre, c.situacion_legal, substring(c.ciiu_nivel_6 from 1 for 4) AS grupo_ciiu, u.netas, u.origen, u.total_306, u.acumuladas, u.perdidas, u.niif, u.netas_sin_niif, u.patrimonio, u.financiera, u.tipo, u.utilidad_ejercicio, u.base_anticipo, u.anticipo_provisional, u.netas_prev, u.variacion, u.peso_patrimonio FROM utilidad_no_distribuida u JOIN contribuyentes c USING (expediente) WHERE ${where.join(' AND ')} ORDER BY u.base_anticipo DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    const [total] = await this.repository.query(
      `SELECT count(*)::int AS filas, count(*) FILTER (WHERE u.financiera)::int AS financieras, sum(u.base_anticipo) AS suma_base, sum(u.anticipo_provisional) AS suma_anticipo, sum(coalesce(u.niif, 0)) AS suma_niif FROM utilidad_no_distribuida u JOIN contribuyentes c USING (expediente) WHERE ${where.join(' AND ')}`,
      params.slice(0, -2),
    );
    const [movimiento] = await this.repository.query(
      `SELECT count(*) FILTER (WHERE variacion < 0)::int AS bajaron, count(*) FILTER (WHERE variacion > 0)::int AS subieron, count(*) FILTER (WHERE variacion IS NULL)::int AS sin_comparativo FROM utilidad_no_distribuida WHERE anio = $1 AND netas > 0`,
      [ejercicio],
    );
    const tarifa = await this.repository.query(
      `SELECT tramo, desde, hasta, tarifa, nota FROM tarifa_pago_a_cuenta ORDER BY tramo`,
    );
    return { datos, total, movimiento, tarifa };
  }

  async getMetadatosCredito(): Promise<MetadatosCredito> {
    const anios = await this.repository.query(
      `SELECT DISTINCT anio FROM balance_magnitud ORDER BY anio`,
    );
    const [{ ultimo }] = await this.repository.query(
      `SELECT max(anio)::int AS ultimo FROM balance_magnitud`,
    );
    return { anios: anios.map((a: { anio: number }) => a.anio), ultimo };
  }

  async listarCredito(
    query: ConsultaCredito,
    ultimo: number | null,
  ): Promise<ResultadoCredito> {
    const where: string[] = [];
    const params: unknown[] = [ultimo];
    if (query.soloComparables)
      where.push(
        `EXISTS (SELECT 1 FROM riesgo_tributario_anio r WHERE r.expediente = m.expediente AND r.poblacion = 'comparable')`,
      );
    if (query.rama) {
      params.push(`${query.rama}%`);
      where.push(`c.ciiu_nivel_6 LIKE $${params.length}`);
    }
    if (query.q) {
      params.push(`%${query.q.trim()}%`);
      const i = params.length;
      where.push(
        `(c.nombre ILIKE $${i} OR c.ruc LIKE $${i} OR m.expediente = $${i})`,
      );
    }
    let having = '';
    if (query.minimo) {
      params.push(query.minimo);
      having = `HAVING sum(coalesce((m.magnitudes->>'creditoIva')::numeric, 0) + coalesce((m.magnitudes->>'creditoIr')::numeric, 0)) FILTER (WHERE m.anio = $1) >= $${params.length}`;
    }
    params.push(query.limit, query.offset);
    const datos = await this.repository.query(
      `SELECT m.expediente, c.ruc, c.nombre, substring(c.ciiu_nivel_6 from 1 for 4) AS grupo_ciiu, jsonb_object_agg(m.anio, jsonb_build_object('iva', (m.magnitudes->>'creditoIva')::numeric, 'ir', (m.magnitudes->>'creditoIr')::numeric)) AS por_anio, sum(coalesce((m.magnitudes->>'creditoIva')::numeric, 0) + coalesce((m.magnitudes->>'creditoIr')::numeric, 0)) FILTER (WHERE m.anio = $1) AS ultimo_total, min(d.diagnostico_iva) AS diagnostico_iva, min(d.diagnostico_ir) AS diagnostico_ir, min(d.iva_sube) AS iva_sube, min(d.iva_baja) AS iva_baja, min(d.ir_sube) AS ir_sube, min(d.ir_baja) AS ir_baja FROM balance_magnitud m JOIN contribuyentes c USING (expediente) LEFT JOIN credito_tributario_empresa d USING (expediente) ${where.length ? `WHERE ${where.join(' AND ')}` : ''} GROUP BY m.expediente, c.ruc, c.nombre, c.ciiu_nivel_6 ${having} ORDER BY ultimo_total DESC NULLS LAST LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );
    const parametrosTotales = params.slice(
      0,
      params.length - 2 - (query.minimo ? 1 : 0),
    );
    const [totales] = await this.repository.query(
      `SELECT count(*)::int AS companias, sum(greatest((m.magnitudes->>'creditoIva')::numeric, 0)) AS suma_iva, sum(greatest((m.magnitudes->>'creditoIr')::numeric, 0)) AS suma_ir FROM balance_magnitud m JOIN contribuyentes c USING (expediente) WHERE m.anio = $1 ${where.length ? `AND ${where.join(' AND ')}` : ''}`,
      parametrosTotales,
    );
    return { datos, totales };
  }

  async getFicha(expediente: string): Promise<FichaTributaria | null> {
    const [empresa] = await this.repository.query(
      `SELECT c.expediente, c.ruc, c.nombre, c.ciiu_nivel_6, c.situacion_legal, c.sri_clase_contribuyente = 'RMP' AS rimpe, p.anios_con_datos, p.anios_decil_alto, p.anios_sin_utilidad, p.brecha_total, p.percentil_maximo, p.grupo_ciiu, ci.nombre AS actividad FROM contribuyentes c LEFT JOIN perfil_riesgo_tributario p USING (expediente) LEFT JOIN actividad_ciiu ci ON ci.codigo = p.grupo_ciiu WHERE c.expediente = $1`,
      [expediente],
    );
    if (!empresa) return null;
    const ejercicios = await this.repository.query(
      `SELECT a.anio, a.poblacion, a.nivel_pares, a.clave_pares, a.n_pares, a.ingresos, a.costos_gastos, a.activo, a.declarada, r.coef_ingresos, r.coef_costos_gastos, r.coef_activos, r.coef_especifico, r.base_ingresos, r.base_costos_gastos, r.base_activos, a.base_presunta, a.base_manda, a.brecha, a.intensidad, a.percentil FROM riesgo_tributario_anio a JOIN riesgo_tributario r USING (anio, expediente) WHERE a.expediente = $1 ORDER BY a.anio`,
      [expediente],
    );
    const resoluciones = await this.repository.query(
      `SELECT anio, resolucion, suscrita, registro FROM resolucion_presuntiva ORDER BY anio`,
    );
    const credito = await this.repository.query(
      `SELECT anio, (magnitudes->>'creditoIva')::numeric AS iva, (magnitudes->>'creditoIr')::numeric AS ir, coalesce((magnitudes->>'creditoIva')::numeric, 0) + coalesce((magnitudes->>'creditoIr')::numeric, 0) AS total FROM balance_magnitud WHERE expediente = $1 ORDER BY anio`,
      [expediente],
    );
    const [diagnostico] = await this.repository.query(
      `SELECT anios, ultimo_anio, iva_ini, iva_ult, iva_max, iva_sube, iva_baja, ir_ini, ir_ult, ir_max, ir_sube, ir_baja, diagnostico_iva, diagnostico_ir FROM credito_tributario_empresa WHERE expediente = $1`,
      [expediente],
    );
    const noDistribuidas = await this.repository.query(
      `SELECT anio, netas, niif, utilidad_ejercicio, base_anticipo, anticipo_provisional, origen, financiera FROM utilidad_no_distribuida WHERE expediente = $1 ORDER BY anio`,
      [expediente],
    );
    const [tarifa] = await this.repository.query(
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
