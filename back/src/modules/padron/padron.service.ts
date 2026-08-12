import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { QueryPadronDto } from './dto/query-padron.dto';
import {
  aniosPorCatastro,
  condicionCatastroPosicional,
} from '../../common/catastros/filtro-catastro';

/**
 * Consulta del padrón del SRI.
 *
 * Las personas naturales y las sociedades no supervisadas viven en tablas
 * separadas y esa separación se respeta aquí: no hay ningún endpoint que las
 * devuelva mezcladas con las compañías. Es la garantía de que un promedio
 * sectorial no puede acabar incluyendo a siete millones de personas sin balance.
 */
@Injectable()
export class PadronService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  async resumen() {
    const [r] = await this.dataSource.query(`
      SELECT
        (SELECT count(*) FROM persona_natural)::bigint          AS personas,
        (SELECT count(*) FROM sociedad_no_supervisada)::bigint  AS no_supervisadas,
        (SELECT count(*) FROM establecimiento)::bigint          AS establecimientos,
        (SELECT count(*) FROM companias WHERE sri_job_id IS NOT NULL)::bigint AS companias_enriquecidas,
        (SELECT count(*) FROM persona_natural WHERE estado_contribuyente = 'ACTIVO')::bigint AS personas_activas
    `);
    // Los años se envían con el resumen para que el desplegable de catastro
    // ofrezca sólo ejercicios que existen de verdad.
    const aniosCatastro = await aniosPorCatastro((sql) => this.dataSource.query(sql));
    return {
      personas: Number(r.personas),
      noSupervisadas: Number(r.no_supervisadas),
      establecimientos: Number(r.establecimientos),
      companiasEnriquecidas: Number(r.companias_enriquecidas),
      personasActivas: Number(r.personas_activas),
      aniosCatastro,
    };
  }

  /**
   * Listado paginado por keyset sobre `ruc`.
   *
   * Con 7,6 millones de filas, `OFFSET` y `COUNT(*)` sin acotar se degradan en
   * las páginas profundas, igual que en compañías.
   */
  async listar(tabla: 'persona_natural' | 'sociedad_no_supervisada', q: QueryPadronDto) {
    const limit = q.limit ?? 50;
    const where: string[] = [];
    const params: unknown[] = [];

    if (q.nombre) {
      params.push(`%${q.nombre}%`);
      where.push(`p.razon_social ILIKE $${params.length}`);
    }
    if (q.ruc) {
      params.push(`${q.ruc}%`);
      where.push(`p.ruc LIKE $${params.length}`);
    }
    if (q.estado) {
      params.push(q.estado);
      where.push(`p.estado_contribuyente = $${params.length}`);
    }
    if (q.provincia) {
      params.push(q.provincia);
      where.push(
        `EXISTS (SELECT 1 FROM establecimiento e WHERE e.ruc = p.ruc AND e.provincia = $${params.length})`,
      );
    }
    // Catastros públicos, enlazados por RUC. Es el mismo filtro que usa el
    // listado de compañías: las tres tablas llevan las mismas columnas porque
    // el catastro reparte sus RUC entre las tres poblaciones.
    const catastro = condicionCatastroPosicional('p', q.catastro, q.catastroAnio, params.length + 1);
    if (catastro) {
      if (catastro.usaAnio) params.push(q.catastroAnio);
      where.push(catastro.sql);
    }

    if (q.cursor) {
      params.push(q.cursor);
      where.push(`p.ruc > $${params.length}`);
    }

    params.push(limit + 1); // una fila de más: así se sabe si hay siguiente sin contar

    // TODAS las columnas del contribuyente, no un subconjunto. La pantalla
    // decide cuáles enseña, pero la API no puede ser la que recorte: el padrón
    // sólo tiene 13 campos por contribuyente y devolverlos cuesta lo mismo.
    const filas = await this.dataSource.query(
      `SELECT p.ruc, p.razon_social, p.jurisdiccion, p.estado_contribuyente,
              p.clase_contribuyente, p.fecha_inicio_actividades, p.fecha_actualizacion,
              p.fecha_suspension_definitiva, p.fecha_reinicio_actividades,
              p.obligado_contabilidad, p.agente_retencion, p.contribuyente_especial,
              p.num_establecimientos,
              p.turismo_registros, p.turismo_actividades, p.turismo_ratificado,
              p.exportador_bienes_ir_anios, p.exportador_bienes_iva_anios,
              p.exportador_servicios_iva_anios,
              (SELECT string_agg(DISTINCT e.provincia, ', ')
                 FROM establecimiento e WHERE e.ruc = p.ruc) AS provincias,
              (SELECT e.actividad FROM establecimiento e
                WHERE e.ruc = p.ruc ORDER BY e.numero LIMIT 1) AS actividad_principal,
              (SELECT e.codigo_ciiu FROM establecimiento e
                WHERE e.ruc = p.ruc ORDER BY e.numero LIMIT 1) AS ciiu_principal
         FROM ${tabla} p
        ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
        ORDER BY p.ruc
        LIMIT $${params.length}`,
      params,
    );

    const hayMas = filas.length > limit;
    const datos = (hayMas ? filas.slice(0, limit) : filas).map((f: Record<string, unknown>) => ({
      ruc: f.ruc,
      razonSocial: f.razon_social,
      jurisdiccion: f.jurisdiccion,
      estadoContribuyente: f.estado_contribuyente,
      claseContribuyente: f.clase_contribuyente,
      fechaInicioActividades: f.fecha_inicio_actividades,
      fechaActualizacion: f.fecha_actualizacion,
      fechaSuspensionDefinitiva: f.fecha_suspension_definitiva,
      fechaReinicioActividades: f.fecha_reinicio_actividades,
      obligadoContabilidad: f.obligado_contabilidad,
      agenteRetencion: f.agente_retencion,
      contribuyenteEspecial: f.contribuyente_especial,
      numEstablecimientos: Number(f.num_establecimientos ?? 0),
      provincias: f.provincias,
      actividadPrincipal: f.actividad_principal,
      ciiuPrincipal: f.ciiu_principal,
      turismoRegistros: f.turismo_registros,
      turismoActividades: f.turismo_actividades,
      turismoRatificado: f.turismo_ratificado,
      exportadorBienesIrAnios: f.exportador_bienes_ir_anios,
      exportadorBienesIvaAnios: f.exportador_bienes_iva_anios,
      exportadorServiciosIvaAnios: f.exportador_servicios_iva_anios,
    }));

    return { datos, cursorSiguiente: hayMas ? datos[datos.length - 1].ruc : null };
  }

  /**
   * Todo lo que la base sabe de un RUC: sus locales del padrón, sus registros
   * turísticos y los catastros de exportadores en los que aparece.
   *
   * Las tres cosas se enlazan por RUC y se piden a la vez porque la pantalla
   * las enseña juntas; hacer tres viajes sólo añadiría parpadeo.
   */
  async establecimientos(ruc: string) {
    const [establecimientos, turismo, catastros] = await Promise.all([
      this.dataSource.query(
        `SELECT numero, tipo_titular, nombre_comercial, estado,
                provincia, canton, parroquia, codigo_ciiu, actividad
           FROM establecimiento WHERE ruc = $1 ORDER BY numero`,
        [ruc],
      ),
      this.dataSource.query(
        `SELECT numero_registro, codigo_establecimiento, nombre_comercial, actividad,
                clasificacion, categoria, provincia, canton, parroquia, direccion,
                telefono, correo, sitio_web, representante_legal, estado_registro
           FROM turismo_establecimiento
          WHERE ruc = $1 AND ausente_desde_job IS NULL
          ORDER BY codigo_establecimiento, numero_registro`,
        [ruc],
      ),
      this.dataSource.query(
        `SELECT catastro, anio, jurisdiccion, provincia, tipo_contribuyente,
                clase_contribuyente, obligado_contabilidad, anio_fiscal_analizado
           FROM catastro_sri
          WHERE ruc = $1 AND ausente_desde_job IS NULL
          ORDER BY catastro, anio DESC`,
        [ruc],
      ),
    ]);
    return { ruc, establecimientos, turismo, catastros };
  }

  /** Provincias con su número de establecimientos, para los desplegables. */
  async provincias() {
    return this.dataSource.query(
      `SELECT provincia, count(*)::int AS establecimientos
         FROM establecimiento
        WHERE provincia IS NOT NULL
        GROUP BY provincia ORDER BY provincia`,
    );
  }
}
