import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Percentiles sectoriales: dónde está una empresa respecto de las demás de su
 * sector, indicador por indicador y año por año.
 *
 * ## Por qué hay una vista de magnitudes en medio
 *
 * Los indicadores se calculan sobre CONCEPTOS (activo, pasivo, ingresos…), y un
 * concepto es una cuenta distinta en cada formulario: el activo es la cuenta `1`
 * en el IFRS y la `499` en el fiscal. Resolver eso dentro de la consulta de
 * percentiles significaría repetir el diccionario de conceptos en SQL, que es
 * justo lo que `common/finanzas/conceptos.ts` existe para evitar.
 *
 * `balance_magnitud` hace esa traducción una sola vez: una fila por (año,
 * expediente) con un `jsonb` de magnitudes ya con nombre de concepto. A partir
 * de ahí, todo el cálculo de percentiles es aritmética y no conoce ni un solo
 * código de cuenta.
 *
 * ## Por qué el diccionario vive en una tabla
 *
 * `concepto_cuenta` la puebla el servicio desde `CONCEPTOS`, no esta migración.
 * Es la misma razón: si los códigos se escribieran aquí, habría dos
 * diccionarios, y el día que se corrija uno el otro seguiría enlazando cuentas
 * que ya no son. La tabla es un espejo de la constante de TypeScript, y se
 * sincroniza en cada recálculo.
 *
 * ## Un año, un formulario, una empresa
 *
 * Si una compañía declaró el mismo año en los dos formularios, gana el IFRS —el
 * mismo criterio que el comparativo de la ficha—, y sólo entra una vez en el
 * percentil. Sin ese `DISTINCT ON`, las ~17.000 empresas que en 2021
 * presentaron los dos pesarían el doble en la mediana de su sector.
 *
 * ## Qué NO se guarda aquí
 *
 * Ni un umbral de "bueno" ni una nota. El percentil dice dónde está la empresa;
 * si eso es bueno o malo depende del indicador (estar arriba en endeudamiento no
 * es un logro) y esa lectura vive en la definición del indicador, no en la base.
 */
export class CreateIndicadoresSectoriales1700000013000 implements MigrationInterface {
  name = 'CreateIndicadoresSectoriales1700000013000';

  public async up(q: QueryRunner): Promise<void> {
    // -------------------------------------------------------- concepto_cuenta
    // Espejo de `CONCEPTOS`. Se llena desde el servicio en cada recálculo.
    await q.query(`
      CREATE TABLE concepto_cuenta (
        formulario smallint NOT NULL,
        codigo     text     NOT NULL,
        clave      text     NOT NULL,
        PRIMARY KEY (formulario, codigo)
      )
    `);
    await q.query(`CREATE INDEX idx_concepto_cuenta_clave ON concepto_cuenta (clave)`);

    // -------------------------------------------------------- balance_magnitud
    //
    // Nace vacía a propósito: depende de `concepto_cuenta`, que en este momento
    // todavía no tiene filas. La puebla el primer recálculo.
    //
    // Las magnitudes se montan como `base || valores`, donde `base` son todos
    // los conceptos del formulario a cero. Esa es la regla del modelo: en
    // `balance_cuenta` la ausencia de fila ES el cero. Pero un concepto que el
    // formulario no trae —los inventarios del fiscal— no aparece ni en `base`,
    // así que su clave falta en el jsonb, la aritmética da NULL y el indicador
    // sale sin calcular en vez de salir con un cero que nadie declaró.
    await q.query(`
      CREATE MATERIALIZED VIEW balance_magnitud AS
      WITH elegido AS (
        SELECT DISTINCT ON (expediente, anio)
               anio, formulario, expediente, rama_actividad, ciiu
          FROM balance
         WHERE ausente_desde_job IS NULL
         ORDER BY expediente, anio, (formulario = 1) DESC, formulario
      ),
      base AS (
        SELECT formulario, jsonb_object_agg(clave, 0) AS ceros
          FROM concepto_cuenta
         GROUP BY formulario
      ),
      valores AS (
        SELECT bc.anio, bc.formulario, bc.expediente,
               jsonb_object_agg(cc.clave, bc.valor) AS obj
          FROM balance_cuenta bc
          JOIN concepto_cuenta cc
            ON cc.formulario = bc.formulario AND cc.codigo = bc.codigo_cuenta
         GROUP BY bc.anio, bc.formulario, bc.expediente
      )
      SELECT e.anio,
             e.expediente,
             e.formulario,
             e.rama_actividad AS seccion,
             -- División CIIU: la letra y dos dígitos (H4923.01 -> H49). Es el
             -- nivel al que "transporte terrestre" ya no incluye al aeropuerto.
             CASE WHEN e.ciiu ~ '^[A-Z][0-9]{2}' THEN substr(e.ciiu, 1, 3) END AS division,
             b.ceros || coalesce(v.obj, '{}'::jsonb) AS magnitudes
        FROM elegido e
        JOIN base b ON b.formulario = e.formulario
        LEFT JOIN valores v
          ON v.anio = e.anio AND v.formulario = e.formulario AND v.expediente = e.expediente
    `);
    await q.query(`CREATE UNIQUE INDEX idx_balance_magnitud_pk ON balance_magnitud (anio, expediente)`);
    await q.query(`CREATE INDEX idx_balance_magnitud_division ON balance_magnitud (anio, division)`);
    await q.query(`CREATE INDEX idx_balance_magnitud_seccion ON balance_magnitud (anio, seccion)`);

    // ------------------------------------------------------ indicador_percentil
    //
    // Los cortes del sector: la caja contra la que se dibuja la empresa. Se
    // guardan los tres niveles (división, sección y total nacional) aunque una
    // empresa concreta sólo use uno: la pantalla sectorial también sirve para
    // mirar un sector sin mirar ninguna empresa.
    //
    // `n` es por indicador y no por sector: en el formulario fiscal no hay
    // inventarios, así que la prueba ácida de un sector puede tener la mitad de
    // muestra que su liquidez corriente. Publicar un solo `n` por sector
    // escondería eso.
    await q.query(`
      CREATE TABLE indicador_percentil (
        anio       smallint NOT NULL,
        nivel      text     NOT NULL CHECK (nivel IN ('division', 'seccion', 'total')),
        sector     text     NOT NULL,
        indicador  text     NOT NULL,
        n          integer  NOT NULL,
        p10        numeric,
        p25        numeric,
        p50        numeric,
        p75        numeric,
        p90        numeric,
        promedio   numeric,
        PRIMARY KEY (anio, nivel, sector, indicador)
      )
    `);

    // -------------------------------------------------------- indicador_empresa
    //
    // El percentil exacto de cada empresa dentro de su grupo de pares, ya
    // calculado. Interpolarlo entre los cortes de arriba habría salido más
    // barato en disco y habría dado un número aproximado presentado como exacto.
    //
    // Los valores van en dos `jsonb` (clave -> valor, clave -> percentil) y no
    // en una fila por indicador: son 670.000 balances por 16 indicadores, y en
    // formato largo eso son 9 millones de filas para responder siempre a la
    // misma pregunta, que es "todos los indicadores de esta empresa este año".
    await q.query(`
      CREATE TABLE indicador_empresa (
        anio        smallint NOT NULL,
        expediente  text     NOT NULL,
        nivel       text     NOT NULL CHECK (nivel IN ('division', 'seccion')),
        sector      text     NOT NULL,
        valores     jsonb    NOT NULL,
        percentiles jsonb    NOT NULL,
        PRIMARY KEY (anio, expediente)
      )
    `);
    await q.query(`CREATE INDEX idx_indicador_empresa_exp ON indicador_empresa (expediente)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS indicador_empresa`);
    await q.query(`DROP TABLE IF EXISTS indicador_percentil`);
    await q.query(`DROP MATERIALIZED VIEW IF EXISTS balance_magnitud`);
    await q.query(`DROP TABLE IF EXISTS concepto_cuenta`);
  }
}
