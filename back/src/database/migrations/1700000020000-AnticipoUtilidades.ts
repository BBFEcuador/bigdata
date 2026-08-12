import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Anticipo (pago a cuenta) sobre utilidades no distribuidas: base y cálculo.
 *
 * ## La base
 *
 *     resultados acumulados (cuenta 306)  +  utilidad del ejercicio
 *
 * La utilidad del ejercicio entra **con su signo**: una pérdida resta, que es
 * lo que dice la norma ("utilidad o pérdida contable del ejercicio anterior").
 * Y entra ya neta del 15 % de participación laboral y del impuesto a la renta,
 * porque eso es exactamente lo que es la cuenta 707 / `utilidadNeta`: no hay
 * que volver a descontarlos.
 *
 * ## La tarifa vive en una tabla, y hoy tiene una sola fila
 *
 * La escala es progresiva por tramos de la LRTI y **no la tenemos**. El único
 * dato firme es que una base de 5.000.000 cae en el tramo 3 al 1,25 %.
 *
 * Con un punto no se reconstruye una escala, así que `anticipo_provisional`
 * aplica ese 1,25 % a todo el mundo. **No es el anticipo de nadie**: es un
 * orden de magnitud con la tarifa de un tramo que la mayoría no ocupa. El
 * nombre lleva "provisional" a propósito, para que no se cuele en un informe
 * como cifra definitiva.
 *
 * En cuanto se carguen los tramos en `tarifa_pago_a_cuenta`, el cálculo pasa a
 * ser progresivo cambiando una consulta, no el modelo.
 *
 * ## Lo que la base NO descuenta
 *
 * Dividendos distribuidos y capitalizaciones entre el 1 de enero y el 31 de
 * julio, y los ajustes por método de participación. Ninguno de los dos está en
 * el balance de la Superintendencia. La base es por tanto un **techo**: quien
 * ya repartió aparece más alto de lo que le toca. Se dice en pantalla, porque
 * un techo presentado como cifra exacta es una reclamación esperando a ocurrir.
 *
 * La reserva legal tampoco se descuenta aquí: su apropiación es una decisión de
 * junta que todavía no ocurrió, y estimarla exigía suponer qué hará cada tipo
 * societario. Queda como columna aparte para quien la quiera restar.
 */
export class AnticipoUtilidades1700000020000 implements MigrationInterface {
  name = 'AnticipoUtilidades1700000020000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE tarifa_pago_a_cuenta (
        tramo    smallint PRIMARY KEY,
        desde    numeric(18,2) NULL,
        hasta    numeric(18,2) NULL,
        tarifa   numeric(6,5) NOT NULL,
        vigencia smallint NULL,
        nota     text NULL
      )
    `);

    await q.query(`
      INSERT INTO tarifa_pago_a_cuenta (tramo, desde, hasta, tarifa, nota) VALUES
        (3, NULL, NULL, 0.01250,
         'Único tramo conocido: una base de 5.000.000 se ubica aquí. Los límites ' ||
         'y el resto de la escala están pendientes de cargar desde la LRTI.')
    `);

    await q.query(`DROP MATERIALIZED VIEW utilidad_no_distribuida`);

    await q.query(`
      CREATE MATERIALIZED VIEW utilidad_no_distribuida AS
      WITH base AS (
        SELECT m.anio, m.expediente, c.ruc, c.tipo, c.situacion_legal,
               (m.magnitudes->>'resultadosAcumulados')::numeric AS total_306,
               (m.magnitudes->>'utilidadesAcumuladas')::numeric AS acumuladas,
               (m.magnitudes->>'perdidasAcumuladas')::numeric   AS perdidas,
               (m.magnitudes->>'resultadosNiif')::numeric       AS niif,
               (m.magnitudes->>'utilidadNeta')::numeric         AS utilidad_ejercicio,
               (m.magnitudes->>'patrimonio')::numeric           AS patrimonio,
               (m.magnitudes->>'activo')::numeric               AS activo,
               -- Las aseguradoras y las instituciones financieras quedan fuera
               -- por sus utilidades restringidas (su organismo de control se
               -- las inmoviliza). Se marcan, no se borran: el conteo del
               -- mercado tiene que seguir diciendo la verdad.
               substring(c.ciiu_nivel_6 from 1 for 3) IN ('K64', 'K65') AS financiera
          FROM balance_magnitud m
          JOIN companias c USING (expediente)
         WHERE c.ausente_desde_job IS NULL
      ),
      resuelto AS (
        SELECT *,
               coalesce(total_306, acumuladas + coalesce(perdidas, 0)) AS netas,
               CASE WHEN total_306 IS NOT NULL THEN 'cuenta_306' ELSE 'suma_30601_30602' END AS origen
          FROM base
      ),
      con_base AS (
        SELECT *,
               -- La utilidad del ejercicio entra con su signo: la pérdida resta.
               coalesce(netas, 0) + coalesce(utilidad_ejercicio, 0) AS base_anticipo
          FROM resuelto
      )
      SELECT anio, expediente, ruc, tipo, situacion_legal, financiera,
             netas, origen, total_306, acumuladas, perdidas, niif,
             netas - coalesce(niif, 0) AS netas_sin_niif,
             utilidad_ejercicio, patrimonio, activo,
             base_anticipo,
             CASE WHEN base_anticipo > 0
                  THEN round(base_anticipo * (SELECT tarifa FROM tarifa_pago_a_cuenta WHERE tramo = 3), 2)
             END AS anticipo_provisional,
             lag(netas) OVER (PARTITION BY expediente ORDER BY anio) AS netas_prev,
             netas - lag(netas) OVER (PARTITION BY expediente ORDER BY anio) AS variacion,
             CASE WHEN patrimonio > 0 THEN netas / patrimonio END AS peso_patrimonio
        FROM con_base
    `);

    await q.query(`CREATE UNIQUE INDEX idx_und_pk ON utilidad_no_distribuida (anio, expediente)`);
    await q.query(
      `CREATE INDEX idx_und_base ON utilidad_no_distribuida (anio, base_anticipo DESC)
       WHERE base_anticipo > 0`,
    );
    await q.query(`CREATE INDEX idx_und_exp ON utilidad_no_distribuida (expediente)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP MATERIALIZED VIEW IF EXISTS utilidad_no_distribuida`);
    await q.query(`DROP TABLE IF EXISTS tarifa_pago_a_cuenta`);
  }
}
