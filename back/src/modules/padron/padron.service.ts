import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { QueryPadronDto } from './dto/query-padron.dto';

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
    return {
      personas: Number(r.personas),
      noSupervisadas: Number(r.no_supervisadas),
      establecimientos: Number(r.establecimientos),
      companiasEnriquecidas: Number(r.companias_enriquecidas),
      personasActivas: Number(r.personas_activas),
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
    }));

    return { datos, cursorSiguiente: hayMas ? datos[datos.length - 1].ruc : null };
  }

  /** Establecimientos de un RUC, sea quien sea su titular. */
  async establecimientos(ruc: string) {
    const filas = await this.dataSource.query(
      `SELECT numero, tipo_titular, nombre_comercial, estado,
              provincia, canton, parroquia, codigo_ciiu, actividad
         FROM establecimiento WHERE ruc = $1 ORDER BY numero`,
      [ruc],
    );
    return { ruc, establecimientos: filas };
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
