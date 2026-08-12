import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Rehace `perfil_comercial` con TODOS los campos de las tres poblaciones.
 *
 * La primera versión se quedó corta: llevaba `obligado_contabilidad` pero
 * dejaba fuera `agente_retencion` y `contribuyente_especial`, que el padrón sí
 * trae y que son criterio comercial de primera —24.616 personas naturales son
 * agentes de retención—. También faltaban las fechas de suspensión y reinicio,
 * la jurisdicción y los datos mercantiles de la compañía.
 *
 * El perfil es la única fuente de la capa comercial: lo que no llegue aquí no
 * existe para un segmento, para la lista de trabajo ni para el CSV. Recortarlo
 * "porque ahora no hace falta" es exactamente cómo se pierde un dato que sí
 * estaba cargado.
 *
 * Una vista materializada no se puede ampliar con ALTER: hay que rehacerla
 * entera, y con ella sus índices.
 */
export class PerfilComercialCompleto1700000010000 implements MigrationInterface {
  name = 'PerfilComercialCompleto1700000010000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`DROP MATERIALIZED VIEW IF EXISTS perfil_comercial`);

    await q.query(`
      CREATE MATERIALIZED VIEW perfil_comercial AS
      WITH ejercicios AS (
        SELECT expediente, anio,
               row_number() OVER (PARTITION BY expediente ORDER BY anio DESC) AS r
        FROM balance WHERE formulario = 1 AND ausente_desde_job IS NULL
      ),
      val AS (
        SELECT d.expediente, d.r, d.anio,
               max(bc.valor) FILTER (WHERE bc.codigo_cuenta = '1')   AS activos,
               max(bc.valor) FILTER (WHERE bc.codigo_cuenta = '401') AS ingresos,
               max(bc.valor) FILTER (WHERE bc.codigo_cuenta = '3')   AS patrimonio,
               max(bc.valor) FILTER (WHERE bc.codigo_cuenta = '707') AS utilidad
        FROM (SELECT * FROM ejercicios WHERE r <= 2) d
        JOIN balance_cuenta bc
          ON bc.expediente = d.expediente AND bc.anio = d.anio AND bc.formulario = 1
         AND bc.codigo_cuenta IN ('1','401','3','707')
        GROUP BY d.expediente, d.r, d.anio
      ),
      /**
       * Los dos últimos ejercicios CON balance, no dos años fijos. Comparar
       * "2025 contra 2024" a pelo daría nulo para quien presentó 2025 y 2023,
       * que sí tiene una variación que interesa. Los años quedan en
       * "anio_ult" / "anio_prev" para el segmento que necesite fijarlos.
       */
      fin AS (
        SELECT expediente,
               max(anio)       FILTER (WHERE r = 1) AS anio_ult,
               max(activos)    FILTER (WHERE r = 1) AS activos_ult,
               max(ingresos)   FILTER (WHERE r = 1) AS ingresos_ult,
               max(patrimonio) FILTER (WHERE r = 1) AS patrimonio_ult,
               max(utilidad)   FILTER (WHERE r = 1) AS utilidad_ult,
               max(anio)       FILTER (WHERE r = 2) AS anio_prev,
               max(activos)    FILTER (WHERE r = 2) AS activos_prev,
               max(ingresos)   FILTER (WHERE r = 2) AS ingresos_prev
        FROM val GROUP BY expediente
      ),
      /** El local de menor número es la matriz: de ahí salen actividad y ubicación. */
      local_principal AS (
        SELECT DISTINCT ON (ruc)
               ruc, codigo_ciiu, actividad, provincia, canton, parroquia, nombre_comercial
        FROM establecimiento
        ORDER BY ruc, numero
      ),
      /** Hoy el catastro de turismo es la única fuente de correo directo. */
      contacto_turismo AS (
        SELECT DISTINCT ON (ruc) ruc, correo, telefono, sitio_web
        FROM turismo_establecimiento
        WHERE ausente_desde_job IS NULL AND (correo IS NOT NULL OR telefono IS NOT NULL)
        ORDER BY ruc, (correo IS NULL), numero_registro
      )
      SELECT
        'compania'::text AS tipo_sujeto,
        c.expediente     AS clave,
        c.ruc, c.expediente, c.nombre,
        c.sri_nombre_comercial AS nombre_comercial,

        replace(c.ciiu_nivel_6, '.', '') AS ciiu6,
        left(c.ciiu_nivel_6, 1)          AS ciiu_seccion,
        ac.nombre                        AS actividad,

        c.provincia, c.canton, c.sri_parroquia AS parroquia,
        nullif(concat_ws(', ', c.calle, c.numero, c.interseccion, c.barrio), '') AS direccion,

        c.situacion_legal,
        c.tipo               AS tipo_compania,
        c.fecha_constitucion,
        c.capital_suscrito,
        c.representante, c.cargo,
        c.ultimo_balance,

        c.sri_estado_contribuyente   AS estado_sri,
        c.sri_clase_contribuyente    AS clase_sri,
        NULL::text                   AS jurisdiccion,
        c.sri_obligado_contabilidad  AS obligado_contabilidad,
        c.sri_agente_retencion       AS agente_retencion,
        c.sri_contribuyente_especial AS contribuyente_especial,
        c.sri_fecha_inicio_actividades AS fecha_inicio_actividades,
        NULL::date                   AS fecha_actualizacion,
        NULL::date                   AS fecha_suspension_definitiva,
        NULL::date                   AS fecha_reinicio_actividades,
        c.sri_num_establecimientos   AS num_establecimientos,

        f.anio_ult, f.activos_ult, f.ingresos_ult, f.patrimonio_ult, f.utilidad_ult,
        f.anio_prev, f.activos_prev, f.ingresos_prev,

        coalesce(c.telefono, ct.telefono) AS telefono,
        ct.correo, ct.sitio_web,

        c.turismo_registros, c.turismo_ratificado,
        c.exportador_bienes_ir_anios,
        c.exportador_bienes_iva_anios,
        c.exportador_servicios_iva_anios
      FROM companias c
      LEFT JOIN fin f ON f.expediente = c.expediente
      LEFT JOIN contacto_turismo ct ON ct.ruc = c.ruc
      LEFT JOIN actividad_ciiu ac ON ac.codigo_supercias = c.ciiu_nivel_6
      WHERE c.ausente_desde_job IS NULL

      UNION ALL

      SELECT
        'persona_natural', p.ruc, p.ruc, NULL, p.razon_social,
        lp.nombre_comercial,

        replace(coalesce(lp.codigo_ciiu, ''), '.', ''), left(lp.codigo_ciiu, 1),
        lp.actividad,

        lp.provincia, lp.canton, lp.parroquia,
        NULL,

        NULL, NULL, NULL, NULL, NULL, NULL, NULL,

        p.estado_contribuyente, p.clase_contribuyente, p.jurisdiccion,
        p.obligado_contabilidad, p.agente_retencion, p.contribuyente_especial,
        p.fecha_inicio_actividades, p.fecha_actualizacion,
        p.fecha_suspension_definitiva, p.fecha_reinicio_actividades,
        p.num_establecimientos,

        NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,

        ct.telefono, ct.correo, ct.sitio_web,

        p.turismo_registros, p.turismo_ratificado,
        p.exportador_bienes_ir_anios, p.exportador_bienes_iva_anios,
        p.exportador_servicios_iva_anios
      FROM persona_natural p
      LEFT JOIN local_principal lp ON lp.ruc = p.ruc
      LEFT JOIN contacto_turismo ct ON ct.ruc = p.ruc
      WHERE p.ausente_desde_job IS NULL

      UNION ALL

      SELECT
        'sociedad_no_supervisada', s.ruc, s.ruc, NULL, s.razon_social,
        lp.nombre_comercial,

        replace(coalesce(lp.codigo_ciiu, ''), '.', ''), left(lp.codigo_ciiu, 1),
        lp.actividad,

        lp.provincia, lp.canton, lp.parroquia,
        NULL,

        NULL, NULL, NULL, NULL, NULL, NULL, NULL,

        s.estado_contribuyente, s.clase_contribuyente, s.jurisdiccion,
        s.obligado_contabilidad, s.agente_retencion, s.contribuyente_especial,
        s.fecha_inicio_actividades, s.fecha_actualizacion,
        s.fecha_suspension_definitiva, s.fecha_reinicio_actividades,
        s.num_establecimientos,

        NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,

        ct.telefono, ct.correo, ct.sitio_web,

        s.turismo_registros, s.turismo_ratificado,
        s.exportador_bienes_ir_anios, s.exportador_bienes_iva_anios,
        s.exportador_servicios_iva_anios
      FROM sociedad_no_supervisada s
      LEFT JOIN local_principal lp ON lp.ruc = s.ruc
      LEFT JOIN contacto_turismo ct ON ct.ruc = s.ruc
      WHERE s.ausente_desde_job IS NULL
    `);

    // Sin el índice único no se puede refrescar con CONCURRENTLY, y sin
    // CONCURRENTLY la vista queda bloqueada los 30 s que tarda el refresco.
    await q.query(`CREATE UNIQUE INDEX idx_perfil_pk ON perfil_comercial (tipo_sujeto, clave)`);
    await q.query(`CREATE INDEX idx_perfil_ciiu ON perfil_comercial (ciiu6 text_pattern_ops)`);
    await q.query(`CREATE INDEX idx_perfil_estado ON perfil_comercial (estado_sri)`);
    await q.query(`CREATE INDEX idx_perfil_provincia ON perfil_comercial (provincia, canton)`);
    await q.query(
      `CREATE INDEX idx_perfil_constitucion ON perfil_comercial (fecha_constitucion)
       WHERE fecha_constitucion IS NOT NULL`,
    );
    await q.query(
      `CREATE INDEX idx_perfil_ingresos ON perfil_comercial (ingresos_ult)
       WHERE ingresos_ult IS NOT NULL`,
    );
    await q.query(
      `CREATE INDEX idx_perfil_activos ON perfil_comercial (activos_ult)
       WHERE activos_ult IS NOT NULL`,
    );
    await q.query(`CREATE INDEX idx_perfil_ruc ON perfil_comercial (ruc)`);
    // Los tres indicadores tributarios son criterio de segmento por sí solos:
    // "agentes de retención obligados a contabilidad" es una lista que se pide.
    await q.query(
      `CREATE INDEX idx_perfil_agente ON perfil_comercial (agente_retencion)
       WHERE agente_retencion IS TRUE`,
    );
    await q.query(
      `CREATE INDEX idx_perfil_especial ON perfil_comercial (contribuyente_especial)
       WHERE contribuyente_especial IS TRUE`,
    );
    await q.query(
      `CREATE INDEX idx_perfil_obligado ON perfil_comercial (obligado_contabilidad)
       WHERE obligado_contabilidad IS TRUE`,
    );

    // La pertenencia guardada se calculó con la vista anterior; las condiciones
    // no han cambiado, así que sigue siendo válida. Se deja como está para no
    // inventar altas y bajas que no ocurrieron.
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP MATERIALIZED VIEW IF EXISTS perfil_comercial`);
  }
}
