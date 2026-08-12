import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * El aviso pasa a colgar de la cuenta 306 RESULTADOS ACUMULADOS.
 *
 * Antes se armaba sumando `30601 GANANCIAS ACUMULADAS` y `30602 (-) PÉRDIDAS
 * ACUMULADAS`. La 306 es la cifra que el contribuyente ve en su balance, y
 * alcanza a **21.000 compañías más**: 90.411 la declaran en 2025 frente a
 * 69.018 que declaran ganancias acumuladas.
 *
 * Lo que hay que saber para leer la cifra, porque 306 no es sólo "utilidades
 * que se pueden repartir":
 *
 *   30601  ganancias acumuladas              20.007 M
 *   30602  (-) pérdidas acumuladas           -8.539 M
 *   30603  adopción por primera vez de NIIF   4.215 M   <- NO repartible
 *   ------------------------------------------------
 *   306    total                             18.225 M
 *
 * En 86.418 de las 90.411 la 306 cuadra exactamente con esas tres hijas. En las
 * 4.048 restantes cuelgan además reservas (30604-30607), que tampoco son
 * repartibles.
 *
 * Por eso el desglose viaja al lado del total en vez de quedarse dentro: quien
 * mire la lista tiene que poder descontar lo que no es dividendo pendiente. Un
 * total a secas invita a leer 18.225 M como utilidades por distribuir, y no lo
 * son.
 *
 * ## El repliegue en los ejercicios del formulario fiscal
 *
 * El formulario 3 no tiene un total equivalente —reparte lo mismo en 611, 612 y
 * 614—, así que en 2021 y 2022 la 306 falta para quien declaró en ese plan. Ahí
 * se cae a `utilidades + pérdidas`, y `origen` dice cuál de las dos se usó. Sin
 * esa columna, una serie 2021-2025 mezclaría dos definiciones sin avisar.
 */
export class ResultadosAcumuladosTotal1700000019000 implements MigrationInterface {
  name = 'ResultadosAcumuladosTotal1700000019000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`DROP MATERIALIZED VIEW utilidad_no_distribuida`);

    await q.query(`
      CREATE MATERIALIZED VIEW utilidad_no_distribuida AS
      WITH base AS (
        SELECT m.anio,
               m.expediente,
               c.ruc,
               c.situacion_legal,
               (m.magnitudes->>'resultadosAcumulados')::numeric AS total_306,
               (m.magnitudes->>'utilidadesAcumuladas')::numeric AS acumuladas,
               (m.magnitudes->>'perdidasAcumuladas')::numeric   AS perdidas,
               (m.magnitudes->>'resultadosNiif')::numeric       AS niif,
               (m.magnitudes->>'patrimonio')::numeric           AS patrimonio,
               (m.magnitudes->>'activo')::numeric               AS activo,
               (m.magnitudes->>'utilidadNeta')::numeric         AS utilidad_ejercicio
          FROM balance_magnitud m
          JOIN companias c USING (expediente)
         WHERE c.ausente_desde_job IS NULL
      ),
      resuelto AS (
        SELECT *,
               -- Las pérdidas ya vienen en negativo: se suman.
               coalesce(total_306, acumuladas + coalesce(perdidas, 0)) AS netas,
               CASE WHEN total_306 IS NOT NULL THEN 'cuenta_306' ELSE 'suma_30601_30602' END AS origen
          FROM base
      )
      SELECT anio, expediente, ruc, situacion_legal,
             netas, origen,
             total_306, acumuladas, perdidas, niif,
             -- Lo que queda al quitar lo que no se puede repartir. No es una
             -- base imponible: es el total menos la adopción NIIF, para que la
             -- cifra del aviso no prometa dividendos que no existen.
             netas - coalesce(niif, 0) AS netas_sin_niif,
             patrimonio, activo, utilidad_ejercicio,
             lag(netas) OVER (PARTITION BY expediente ORDER BY anio) AS netas_prev,
             netas - lag(netas) OVER (PARTITION BY expediente ORDER BY anio) AS variacion,
             CASE WHEN patrimonio > 0 THEN netas / patrimonio END AS peso_patrimonio
        FROM resuelto
    `);

    await q.query(
      `CREATE UNIQUE INDEX idx_und_pk ON utilidad_no_distribuida (anio, expediente)`,
    );
    await q.query(
      `CREATE INDEX idx_und_netas ON utilidad_no_distribuida (anio, netas DESC)
       WHERE netas > 0`,
    );
    await q.query(`CREATE INDEX idx_und_exp ON utilidad_no_distribuida (expediente)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP MATERIALIZED VIEW IF EXISTS utilidad_no_distribuida`);
  }
}
