import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Corrige el corte entre "comparable" y "sin ingresos".
 *
 * El corte era `ingresos > 0`, y con eso una compañía que declara céntimos de
 * facturación sobre dos millones de activo entraba al ranking comparable. La
 * intensidad es `brecha / ingresos`, así que dividía por casi cero: 15.168.265×
 * y percentil 100 garantizado. Salían en cabeza empresas que no operan,
 * desplazando justo lo que la pantalla existe para encontrar.
 *
 * El corte nuevo exige que los ingresos sean **al menos el 1 % del activo**.
 * Una empresa cuya facturación anual no llega a esa centésima parte no está
 * operando, y compararla por ingresos es dividir por ruido. Esas pasan a
 * `sin_ingresos`, que es su población: ahí la presunción sale entera del
 * coeficiente de activos y se lee como lo que es, patrimonio parado.
 *
 * El 1 % es un juicio, no una norma del SRI. Está aquí, en un solo sitio, para
 * que moverlo sea cambiar un número y volver a refrescar.
 *
 * Recrea las dos vistas porque `perfil_riesgo_tributario` se deriva de la otra:
 * cambiar sólo la de abajo dejaría el perfil calculado con el corte viejo.
 */
export class RiesgoUmbralOperacion1700000017000 implements MigrationInterface {
  name = 'RiesgoUmbralOperacion1700000017000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`DROP MATERIALIZED VIEW perfil_riesgo_tributario`);
    await q.query(`DROP MATERIALIZED VIEW riesgo_tributario_anio`);

    await q.query(`
      CREATE MATERIALIZED VIEW riesgo_tributario_anio AS
      WITH clasificado AS (
        SELECT r.*,
               substring(r.grupo_ciiu from 1 for 3) AS division,
               substring(r.grupo_ciiu from 1 for 1) AS seccion,
               CASE
                 -- Sin operación: ni ingresos, o unos ingresos que no llegan al
                 -- 1 % del activo. Ver el comentario de la migración.
                 WHEN r.ingresos IS NULL
                   OR r.ingresos <= 0
                   OR r.ingresos < 0.01 * coalesce(r.activo, 0) THEN 'sin_ingresos'
                 WHEN r.declarada IS NULL OR r.declarada <= 0 THEN 'sin_utilidad'
                 ELSE 'comparable'
               END AS poblacion,
               CASE WHEN r.ingresos > 0 THEN r.brecha / r.ingresos END AS intensidad
          FROM riesgo_tributario r
         WHERE NOT r.rimpe
      ),
      tamanos AS (
        SELECT anio, grupo_ciiu, division, seccion,
               count(*) FILTER (WHERE poblacion = 'comparable') OVER (PARTITION BY anio, grupo_ciiu) AS n_grupo,
               count(*) FILTER (WHERE poblacion = 'comparable') OVER (PARTITION BY anio, division)   AS n_division
          FROM clasificado
      ),
      pares AS (
        SELECT DISTINCT anio, grupo_ciiu, division, seccion, n_grupo, n_division FROM tamanos
      ),
      con_pares AS (
        SELECT c.*,
               CASE WHEN p.n_grupo    >= 30 THEN 'grupo'
                    WHEN p.n_division >= 30 THEN 'division'
                    ELSE 'seccion' END AS nivel_pares,
               CASE WHEN p.n_grupo    >= 30 THEN c.grupo_ciiu
                    WHEN p.n_division >= 30 THEN c.division
                    ELSE c.seccion END AS clave_pares
          FROM clasificado c
          JOIN pares p USING (anio, grupo_ciiu, division, seccion)
      )
      SELECT anio, expediente, ruc, grupo_ciiu, poblacion, nivel_pares, clave_pares,
             ingresos, costos_gastos, activo, declarada,
             base_presunta, base_manda, brecha, intensidad,
             count(*) FILTER (WHERE poblacion = 'comparable')
               OVER (PARTITION BY anio, clave_pares) AS n_pares,
             CASE WHEN poblacion = 'comparable' THEN
               cume_dist() OVER (PARTITION BY anio, clave_pares, poblacion ORDER BY intensidad)
                 - 0.5 * (count(*) OVER (PARTITION BY anio, clave_pares, poblacion, intensidad))::numeric
                       / nullif(count(*) OVER (PARTITION BY anio, clave_pares, poblacion), 0)
             END AS percentil
        FROM con_pares
    `);

    await q.query(
      `CREATE UNIQUE INDEX idx_riesgo_anio_pk ON riesgo_tributario_anio (anio, expediente)`,
    );
    await q.query(`CREATE INDEX idx_riesgo_anio_exp ON riesgo_tributario_anio (expediente)`);
    await q.query(
      `CREATE INDEX idx_riesgo_anio_percentil ON riesgo_tributario_anio (anio, percentil DESC)
       WHERE poblacion = 'comparable'`,
    );

    await q.query(`
      CREATE MATERIALIZED VIEW perfil_riesgo_tributario AS
      WITH ultimo AS (
        SELECT DISTINCT ON (expediente) *
          FROM riesgo_tributario_anio
         ORDER BY expediente, anio DESC
      )
      SELECT u.expediente, u.ruc, u.grupo_ciiu,
             u.anio           AS anio_ult,
             u.poblacion      AS poblacion_ult,
             u.nivel_pares, u.n_pares,
             u.declarada      AS declarada_ult,
             u.base_presunta  AS base_presunta_ult,
             u.base_manda     AS base_manda_ult,
             u.brecha         AS brecha_ult,
             u.intensidad     AS intensidad_ult,
             u.percentil      AS percentil_ult,
             a.anios_con_datos, a.anios_decil_alto, a.anios_sin_utilidad,
             a.brecha_total, a.percentil_maximo
        FROM ultimo u
        JOIN (
          SELECT expediente,
                 count(*)::int                                          AS anios_con_datos,
                 count(*) FILTER (WHERE percentil >= 0.9)::int           AS anios_decil_alto,
                 count(*) FILTER (WHERE poblacion = 'sin_utilidad')::int AS anios_sin_utilidad,
                 sum(greatest(brecha, 0))                                AS brecha_total,
                 max(percentil)                                         AS percentil_maximo
            FROM riesgo_tributario_anio
           GROUP BY expediente
        ) a USING (expediente)
    `);

    await q.query(
      `CREATE UNIQUE INDEX idx_perfil_riesgo_pk ON perfil_riesgo_tributario (expediente)`,
    );
    await q.query(
      `CREATE INDEX idx_perfil_riesgo_persistencia
         ON perfil_riesgo_tributario (anios_decil_alto DESC, percentil_ult DESC)`,
    );
    await q.query(`CREATE INDEX idx_perfil_riesgo_ruc ON perfil_riesgo_tributario (ruc)`);
  }

  public async down(): Promise<void> {
    throw new Error(
      'Sin vuelta atrás: revertir devolvería el corte `ingresos > 0`, que mete a ' +
        'empresas sin operación en el ranking comparable. Si hay que cambiarlo, ' +
        'que sea con una migración nueva.',
    );
  }
}
