import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Diagnóstico del crédito tributario: ¿se está consumiendo o se acumula?
 *
 * El saldo por sí solo no dice nada. Lo que informa es **la trayectoria**, y se
 * lee por separado para el IVA y para el impuesto a la renta porque una misma
 * compañía puede estar compensando uno y acumulando el otro. El caso que dio
 * origen a esto:
 *
 *     IVA    39,4 M → 69,8 M → 57,6 M → 52,2 M → 32,1 M    baja: se compensa
 *     Renta  34 mil → 58 mil → 74 mil → 82,0 M → 154,4 M   sube: nadie lo consume
 *
 * Un crédito que sólo crece es impuesto pagado que la empresa no ha logrado
 * imputar contra nada. Ahí hay una devolución que reclamar. Uno que baja se
 * está usando, y entonces la conversación es otra.
 *
 * ## Es una vista normal, no materializada
 *
 * Se deriva de `balance_magnitud`, que se reconstruye con cada recálculo de
 * percentiles. Materializarla añadiría un refresco más que alguien olvidará, y
 * un diagnóstico desincronizado del saldo que muestra al lado es peor que uno
 * que tarda medio segundo en calcularse.
 *
 * ## El diagnóstico nunca cierra el caso
 *
 * Ninguna etiqueta afirma que la devolución proceda: eso depende de la
 * naturaleza del crédito, de los plazos de caducidad y de la documentación de
 * respaldo, nada de lo cual está en un balance. Por eso las cuatro etiquetas
 * terminan igual —hay que analizar el detalle— y sólo cambian en la pista que
 * dan sobre dónde mirar primero.
 */
export class DiagnosticoCredito1700000021000 implements MigrationInterface {
  name = 'DiagnosticoCredito1700000021000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE VIEW credito_tributario_empresa AS
      WITH serie AS (
        SELECT expediente,
               anio,
               coalesce((magnitudes->>'creditoIva')::numeric, 0) AS iva,
               coalesce((magnitudes->>'creditoIr')::numeric, 0)  AS ir
          FROM balance_magnitud
      ),
      mov AS (
        SELECT s.*,
               lag(iva) OVER (PARTITION BY expediente ORDER BY anio) AS iva_prev,
               lag(ir)  OVER (PARTITION BY expediente ORDER BY anio) AS ir_prev
          FROM serie s
      ),
      agg AS (
        SELECT expediente,
               count(*)::int                                       AS anios,
               max(anio)::int                                      AS ultimo_anio,
               (array_agg(iva ORDER BY anio DESC))[1]              AS iva_ult,
               (array_agg(ir  ORDER BY anio DESC))[1]              AS ir_ult,
               (array_agg(iva ORDER BY anio))[1]                   AS iva_ini,
               (array_agg(ir  ORDER BY anio))[1]                   AS ir_ini,
               max(iva)                                            AS iva_max,
               max(ir)                                             AS ir_max,
               count(*) FILTER (WHERE iva > iva_prev)::int         AS iva_sube,
               count(*) FILTER (WHERE iva < iva_prev)::int         AS iva_baja,
               count(*) FILTER (WHERE ir  > ir_prev)::int          AS ir_sube,
               count(*) FILTER (WHERE ir  < ir_prev)::int          AS ir_baja
          FROM mov
         GROUP BY expediente
      )
      SELECT a.*,
             CASE
               WHEN iva_ult <= 0 THEN 'sin_saldo'
               WHEN anios < 3 THEN 'serie_corta'
               -- Termina en su máximo y sube más veces de las que baja: no se
               -- ha imputado contra nada.
               WHEN iva_ult >= iva_max AND iva_sube > iva_baja THEN 'acumula'
               -- Ha bajado desde el máximo: se viene usando.
               WHEN iva_ult < iva_max AND iva_baja >= iva_sube THEN 'consume'
               ELSE 'irregular'
             END AS diagnostico_iva,
             CASE
               WHEN ir_ult <= 0 THEN 'sin_saldo'
               WHEN anios < 3 THEN 'serie_corta'
               WHEN ir_ult >= ir_max AND ir_sube > ir_baja THEN 'acumula'
               WHEN ir_ult < ir_max AND ir_baja >= ir_sube THEN 'consume'
               ELSE 'irregular'
             END AS diagnostico_ir
        FROM agg a
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP VIEW IF EXISTS credito_tributario_empresa`);
  }
}
