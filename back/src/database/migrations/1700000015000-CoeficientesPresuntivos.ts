import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Estimación presuntiva del impuesto a la renta: coeficientes del SRI y el
 * perfil de riesgo que sale de aplicarlos.
 *
 * ## Qué son estos coeficientes
 *
 * NO son márgenes de utilidad. Son multiplicadores que el SRI publica por rama
 * de actividad, una resolución por ejercicio, y que se aplican por separado
 * sobre el total de ingresos, el total de costos y gastos y el total de
 * activos: **la base imponible presunta es EL MAYOR de los tres resultados**
 * (art. 4 de cada resolución).
 *
 * Aplicar la media de los tres, o sólo el de ingresos, da un número más suave y
 * equivocado. El máximo es el que manda, y es también lo que hace que una
 * empresa con muchos activos parados salga señalada aunque facture poco.
 *
 * ## Por qué el grupo CIIU y no la división
 *
 * Las resoluciones fijan el coeficiente por **grupo** (letra y tres dígitos:
 * `H492`), que es un nivel más fino que la división con la que comparamos los
 * indicadores financieros. No se pueden reutilizar los sectores del análisis
 * financiero: en `H49` conviven el taxi y el tren, y el SRI les pone
 * coeficientes distintos.
 *
 * ## Los que no tienen coeficiente propio
 *
 * La base tiene 236 grupos y las resoluciones cubren 222. Los 14 restantes no
 * son un error de datos: el art. 3 fija un coeficiente **general** justo para
 * eso. Va en `coeficiente_general` y se aplica por repliegue, igual que la
 * sección hace de red para la división en los percentiles.
 *
 * Lo mismo pasa dentro de un año: las ramas Q872, Q873, Q881, Q889 y S942
 * aparecen por primera vez en la resolución de 2024, así que en 2021-2023 esas
 * filas están vacías y les toca el general.
 */
export class CoeficientesPresuntivos1700000015000 implements MigrationInterface {
  name = 'CoeficientesPresuntivos1700000015000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TYPE base_presuntiva AS ENUM ('ingresos', 'costos_gastos', 'activos')
    `);

    /**
     * Un coeficiente por (ejercicio, grupo CIIU, base de cálculo).
     *
     * `numeric(6,4)` y no `real`: son valores normativos con cuatro decimales
     * exactos publicados en el Registro Oficial. Un binario de coma flotante los
     * guardaría "casi" iguales, y aquí el "casi" acaba en un recálculo que no
     * cuadra con el que se le enseñó al cliente.
     */
    await q.query(`
      CREATE TABLE coeficiente_presuntivo (
        anio        smallint NOT NULL,
        grupo_ciiu  text NOT NULL,
        base        base_presuntiva NOT NULL,
        coeficiente numeric(6,4) NOT NULL CHECK (coeficiente > 0),
        PRIMARY KEY (anio, grupo_ciiu, base)
      )
    `);

    /** El del art. 3, para las ramas sin coeficiente específico. */
    await q.query(`
      CREATE TABLE coeficiente_general (
        anio        smallint NOT NULL,
        concepto    text NOT NULL CHECK (concepto IN ('general', 'minerales')),
        base        base_presuntiva NOT NULL,
        coeficiente numeric(6,4) NOT NULL CHECK (coeficiente > 0),
        PRIMARY KEY (anio, concepto, base)
      )
    `);

    /**
     * Qué resolución respalda cada ejercicio.
     *
     * No es documentación de adorno: cada cifra que se le enseñe a un cliente
     * tiene que poder citarse, y las resoluciones salen con DOS AÑOS de rezago
     * (la del ejercicio 2024 se expidió en enero de 2026). Sin esta tabla, un
     * año sin coeficientes publicados y un año que nadie cargó se ven igual.
     */
    await q.query(`
      CREATE TABLE resolucion_presuntiva (
        anio       smallint PRIMARY KEY,
        resolucion text NOT NULL,
        suscrita   date NULL,
        registro   text NULL,
        nota       text NULL
      )
    `);

    await q.query(`
      INSERT INTO resolucion_presuntiva (anio, resolucion, suscrita, registro) VALUES
        (2021, 'NAC-DGERCGC23-00000002', '2023-01-25', NULL),
        (2022, 'NAC-DGERCGC24-00000005', '2024-01-22', 'Suplemento R.O. 494 de 07-02-2024'),
        (2023, 'NAC-DGERCGC25-00000002', '2025-01-30', '4to Suplemento R.O. 734 de 31-01-2025'),
        (2024, 'NAC-DGERCGC26-00000004', '2026-01-28', '2do Suplemento R.O. 214 de 29-01-2026')
    `);

    // ------------------------------------------------------- riesgo_tributario
    //
    // Una fila por (ejercicio, compañía) con la presunción ya calculada.
    //
    // Es vista materializada por lo mismo que `balance_magnitud`: recorre
    // 488.000 balances y ninguna pantalla puede pagar eso mientras alguien
    // espera. Se refresca junto a los percentiles.
    await q.query(`
      CREATE MATERIALIZED VIEW riesgo_tributario AS
      WITH coef AS (
        SELECT m.anio,
               m.expediente,
               substring(c.ciiu_nivel_6 from 1 for 4) AS grupo_ciiu,
               c.ruc,
               c.sri_clase_contribuyente = 'RMP' AS rimpe,
               (m.magnitudes->>'ingresos')::numeric    AS ingresos,
               (m.magnitudes->>'costoVentas')::numeric
                 + (m.magnitudes->>'gastos')::numeric  AS costos_gastos,
               (m.magnitudes->>'activo')::numeric      AS activo,
               (m.magnitudes->>'utilidadAntesImpuestos')::numeric AS declarada
          FROM balance_magnitud m
          JOIN companias c USING (expediente)
         WHERE c.ciiu_nivel_6 IS NOT NULL
           AND EXISTS (SELECT 1 FROM resolucion_presuntiva r WHERE r.anio = m.anio)
      ),
      -- El repliegue del art. 3. Se resuelve base por base y no en bloque: en
      -- 2021 la comercialización de minerales no fijó coeficiente de activos,
      -- así que un grupo puede tener específico en dos bases y general en la
      -- tercera.
      con_coef AS (
        SELECT b.*,
               coalesce(ci.coeficiente, gi.coeficiente) AS coef_ingresos,
               coalesce(cc.coeficiente, gc.coeficiente) AS coef_costos_gastos,
               coalesce(ca.coeficiente, ga.coeficiente) AS coef_activos,
               (ci.coeficiente IS NOT NULL
                OR cc.coeficiente IS NOT NULL
                OR ca.coeficiente IS NOT NULL)          AS coef_especifico
          FROM coef b
          LEFT JOIN coeficiente_presuntivo ci
                 ON ci.anio = b.anio AND ci.grupo_ciiu = b.grupo_ciiu AND ci.base = 'ingresos'
          LEFT JOIN coeficiente_presuntivo cc
                 ON cc.anio = b.anio AND cc.grupo_ciiu = b.grupo_ciiu AND cc.base = 'costos_gastos'
          LEFT JOIN coeficiente_presuntivo ca
                 ON ca.anio = b.anio AND ca.grupo_ciiu = b.grupo_ciiu AND ca.base = 'activos'
          LEFT JOIN coeficiente_general gi
                 ON gi.anio = b.anio AND gi.concepto = 'general' AND gi.base = 'ingresos'
          LEFT JOIN coeficiente_general gc
                 ON gc.anio = b.anio AND gc.concepto = 'general' AND gc.base = 'costos_gastos'
          LEFT JOIN coeficiente_general ga
                 ON ga.anio = b.anio AND ga.concepto = 'general' AND ga.base = 'activos'
      ),
      bases AS (
        SELECT *,
               -- Una base negativa no existe: un activo o unos ingresos en
               -- negativo son un error de declaración, no una presunción a la
               -- baja. Se descartan en vez de arrastrarse al GREATEST.
               CASE WHEN ingresos      > 0 THEN ingresos      * coef_ingresos      END AS base_ingresos,
               CASE WHEN costos_gastos > 0 THEN costos_gastos * coef_costos_gastos END AS base_costos_gastos,
               CASE WHEN activo        > 0 THEN activo        * coef_activos       END AS base_activos
          FROM con_coef
      )
      SELECT anio, expediente, ruc, grupo_ciiu, rimpe, coef_especifico,
             ingresos, costos_gastos, activo, declarada,
             coef_ingresos, coef_costos_gastos, coef_activos,
             base_ingresos, base_costos_gastos, base_activos,
             greatest(base_ingresos, base_costos_gastos, base_activos) AS base_presunta,
             -- Cuál de las tres manda. Es la mitad del valor del indicador: que
             -- mande "activos" describe a una empresa distinta que si manda
             -- "ingresos", y el argumento frente al cliente es otro.
             CASE greatest(base_ingresos, base_costos_gastos, base_activos)
               WHEN base_ingresos      THEN 'ingresos'
               WHEN base_costos_gastos THEN 'costos_gastos'
               WHEN base_activos       THEN 'activos'
             END::base_presuntiva AS base_manda,
             greatest(base_ingresos, base_costos_gastos, base_activos)
               - coalesce(declarada, 0) AS brecha
        FROM bases
    `);

    await q.query(
      `CREATE UNIQUE INDEX idx_riesgo_tributario_pk ON riesgo_tributario (anio, expediente)`,
    );
    await q.query(`CREATE INDEX idx_riesgo_tributario_exp ON riesgo_tributario (expediente)`);
    await q.query(
      `CREATE INDEX idx_riesgo_tributario_brecha ON riesgo_tributario (anio, brecha DESC)
       WHERE brecha > 0 AND NOT rimpe`,
    );
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP MATERIALIZED VIEW IF EXISTS riesgo_tributario`);
    await q.query(`DROP TABLE IF EXISTS resolucion_presuntiva`);
    await q.query(`DROP TABLE IF EXISTS coeficiente_general`);
    await q.query(`DROP TABLE IF EXISTS coeficiente_presuntivo`);
    await q.query(`DROP TYPE IF EXISTS base_presuntiva`);
  }
}
