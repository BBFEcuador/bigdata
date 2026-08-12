import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Pago a cuenta sobre utilidades no distribuidas.
 *
 * Resolución NAC-DGERCGC26-00000026 (suscrita el 14 de julio de 2026): las
 * sociedades residentes y los establecimientos permanentes que **hasta el 31 de
 * julio del ejercicio corriente** no distribuyan las utilidades acumuladas de
 * ejercicios anteriores deben declarar y pagar el anticipo. Una cuota en agosto
 * (código 1077) o tres cuotas —agosto, septiembre y octubre— por noveno dígito
 * del RUC (código 1078). Elegida la modalidad, no se cambia con sustitutiva.
 *
 * Esto no es un ranking de riesgo: es una **lista de avisos**. Quien tiene
 * utilidades acumuladas positivas en su último balance tiene la obligación
 * encima, sin más análisis.
 *
 * ## Por qué no vale el patrimonio
 *
 * La obligación recae sobre las utilidades acumuladas, no sobre el patrimonio.
 * Las reservas —legal, facultativa, de capital— están en el patrimonio y **no
 * son distribuibles**, así que sumarlas inflaría la base del aviso. Se usa la
 * cuenta propia: `30601` en el plan IFRS y `611` en el fiscal, que se llama
 * literalmente "UTILIDAD NO DISTRIBUIDA EJERCICIOS ANTERIORES".
 *
 * ## Las pérdidas acumuladas van en negativo
 *
 * `30602` se declara con signo negativo, así que las netas se **suman**. Restar
 * habría duplicado la pérdida y dejado fuera del aviso a empresas que sí tienen
 * utilidades que distribuir.
 *
 * ## Lo que no se puede saber desde aquí
 *
 * Si la compañía distribuyó o no. Los casilleros de dividendos declarados y
 * pagados (626 y 627) sólo existen en el formulario fiscal, y desde 2023 todos
 * los balances vienen en el formulario 1. Lo que sí se ve es la **caída** de las
 * acumuladas de un año al siguiente, que es la huella que deja una
 * distribución: va en `variacion`. Es un indicio, no una prueba — una pérdida
 * del ejercicio las baja igual.
 */
export class UtilidadNoDistribuida1700000018000 implements MigrationInterface {
  name = 'UtilidadNoDistribuida1700000018000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE MATERIALIZED VIEW utilidad_no_distribuida AS
      WITH base AS (
        SELECT m.anio,
               m.expediente,
               c.ruc,
               c.situacion_legal,
               (m.magnitudes->>'utilidadesAcumuladas')::numeric AS acumuladas,
               (m.magnitudes->>'perdidasAcumuladas')::numeric   AS perdidas,
               (m.magnitudes->>'patrimonio')::numeric           AS patrimonio,
               (m.magnitudes->>'activo')::numeric               AS activo,
               (m.magnitudes->>'utilidadNeta')::numeric         AS utilidad_ejercicio
          FROM balance_magnitud m
          JOIN companias c USING (expediente)
         WHERE c.ausente_desde_job IS NULL
      )
      SELECT anio, expediente, ruc, situacion_legal,
             acumuladas, perdidas, patrimonio, activo, utilidad_ejercicio,
             -- Las pérdidas ya vienen en negativo: se suman.
             acumuladas + coalesce(perdidas, 0) AS netas,
             lag(acumuladas) OVER (PARTITION BY expediente ORDER BY anio) AS acumuladas_prev,
             acumuladas - lag(acumuladas) OVER (PARTITION BY expediente ORDER BY anio) AS variacion,
             -- Peso de lo retenido sobre el patrimonio: distingue a la que
             -- acumula de la que simplemente es grande.
             CASE WHEN patrimonio > 0 THEN acumuladas / patrimonio END AS peso_patrimonio
        FROM base
    `);

    await q.query(
      `CREATE UNIQUE INDEX idx_und_pk ON utilidad_no_distribuida (anio, expediente)`,
    );
    await q.query(
      `CREATE INDEX idx_und_acumuladas ON utilidad_no_distribuida (anio, acumuladas DESC)
       WHERE acumuladas > 0`,
    );
    await q.query(`CREATE INDEX idx_und_exp ON utilidad_no_distribuida (expediente)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP MATERIALIZED VIEW IF EXISTS utilidad_no_distribuida`);
  }
}
