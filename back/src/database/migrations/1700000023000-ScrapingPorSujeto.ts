import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Los jobs de scraping dejan de ser sólo de compañías.
 *
 * Nacieron claveados por `expediente`, que sólo existe en Supercias. Pero el
 * padrón —2,7 millones de personas naturales y las sociedades no supervisadas—
 * también hay que rastrearlo, y **el SRI no conoce el expediente**: esas dos
 * poblaciones se identifican por RUC y nunca tendrán otro identificador.
 *
 * ## No se inventa una convención: ya existe
 *
 * `segmento_miembro`, `segmento_evento` y `sujeto_estado_comercial` llevan el
 * par `(tipo_sujeto, clave)` desde la migración 9000, y `perfil_comercial` lo
 * expone con un índice único. `clave` es el expediente para una compañía y el
 * RUC para las otras dos. Es la misma forma que usa la capa comercial para
 * hablar de "un sujeto", y el scraping pasa a hablar ese idioma.
 *
 * La alternativa —añadir un `ruc` al lado del `expediente` y dejar uno nulo—
 * habría hecho que cada consulta tuviera que saber cuál mirar, y que el índice
 * de "un job activo por sujeto" no se pudiera escribir.
 *
 * ## El choque de nombre en `scraping_resultado`
 *
 * Esa tabla ya tenía una columna `clave`, pero significaba otra cosa: qué
 * documento es, cuando un job produce varios del mismo tipo. Se renombra a
 * `documento`, que es lo que siempre quiso decir, y `clave` queda libre para el
 * sujeto. Dos columnas con el mismo nombre y distinto significado en tablas
 * hermanas es una trampa para el siguiente que llegue.
 *
 * Las tablas están vacías, pero la migración sirve igual con datos: todo lo que
 * hubiera era necesariamente de compañías, y el DEFAULT lo rellena antes de
 * retirarse.
 */
export class ScrapingPorSujeto1700000023000 implements MigrationInterface {
  name = 'ScrapingPorSujeto1700000023000';

  public async up(q: QueryRunner): Promise<void> {
    // ------------------------------------------------------------ el job
    //
    // El DEFAULT rellena lo existente y se retira acto seguido: dejarlo puesto
    // haría que un alta a la que se le olvide el tipo se guarde en silencio
    // como compañía, y un job de scraping apuntando al sujeto equivocado no
    // falla, simplemente trae datos de otro.
    await q.query(`ALTER TABLE scraping_job ADD COLUMN tipo_sujeto text NOT NULL DEFAULT 'compania'`);
    await q.query(`ALTER TABLE scraping_job ALTER COLUMN tipo_sujeto DROP DEFAULT`);
    await q.query(`ALTER TABLE scraping_job RENAME COLUMN expediente TO clave`);

    // A diferencia de `segmento_miembro`, que sólo escriben las migraciones y
    // las corridas de segmento, esta tabla la escribe un endpoint público. Un
    // CHECK es la última línea cuando el que llama no es código de este repo.
    await q.query(`
      ALTER TABLE scraping_job ADD CONSTRAINT ck_scraping_job_tipo_sujeto
        CHECK (tipo_sujeto IN ('compania','persona_natural','sociedad_no_supervisada'))
    `);

    // Un solo job activo por (sujeto, fuente). Mismo criterio que antes, con
    // el tipo delante: un expediente y un RUC pueden coincidir como texto.
    await q.query(`DROP INDEX IF EXISTS idx_scraping_job_activo`);
    await q.query(`
      CREATE UNIQUE INDEX idx_scraping_job_activo
          ON scraping_job (tipo_sujeto, clave, fuente)
       WHERE estado IN ('encolado','corriendo','pausado')
    `);

    await q.query(`DROP INDEX IF EXISTS idx_scraping_job_expediente`);
    await q.query(`
      CREATE INDEX idx_scraping_job_sujeto
          ON scraping_job (tipo_sujeto, clave, creado_en DESC)
    `);

    // ------------------------------------------------------------ eventos
    await q.query(
      `ALTER TABLE scraping_job_evento ADD COLUMN tipo_sujeto text NOT NULL DEFAULT 'compania'`,
    );
    await q.query(`ALTER TABLE scraping_job_evento ALTER COLUMN tipo_sujeto DROP DEFAULT`);
    await q.query(`ALTER TABLE scraping_job_evento RENAME COLUMN expediente TO clave`);

    // --------------------------------------------------------- resultados
    //
    // El renombrado va en este orden a la fuerza: primero se libera el nombre
    // `clave`, y sólo entonces `expediente` puede tomarlo.
    await q.query(`ALTER TABLE scraping_resultado RENAME COLUMN clave TO documento`);
    await q.query(`ALTER TABLE scraping_resultado RENAME COLUMN expediente TO clave`);
    await q.query(
      `ALTER TABLE scraping_resultado ADD COLUMN tipo_sujeto text NOT NULL DEFAULT 'compania'`,
    );
    await q.query(`ALTER TABLE scraping_resultado ALTER COLUMN tipo_sujeto DROP DEFAULT`);

    await q.query(`DROP INDEX IF EXISTS idx_scraping_resultado_unico`);
    await q.query(`
      CREATE UNIQUE INDEX idx_scraping_resultado_unico
          ON scraping_resultado (tipo_sujeto, clave, fuente, tipo, documento)
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP INDEX IF EXISTS idx_scraping_resultado_unico`);
    await q.query(`ALTER TABLE scraping_resultado DROP COLUMN tipo_sujeto`);
    await q.query(`ALTER TABLE scraping_resultado RENAME COLUMN clave TO expediente`);
    await q.query(`ALTER TABLE scraping_resultado RENAME COLUMN documento TO clave`);
    await q.query(`
      CREATE UNIQUE INDEX idx_scraping_resultado_unico
          ON scraping_resultado (expediente, fuente, tipo, clave)
    `);

    await q.query(`ALTER TABLE scraping_job_evento RENAME COLUMN clave TO expediente`);
    await q.query(`ALTER TABLE scraping_job_evento DROP COLUMN tipo_sujeto`);

    await q.query(`DROP INDEX IF EXISTS idx_scraping_job_sujeto`);
    await q.query(`DROP INDEX IF EXISTS idx_scraping_job_activo`);
    await q.query(`ALTER TABLE scraping_job DROP CONSTRAINT ck_scraping_job_tipo_sujeto`);
    await q.query(`ALTER TABLE scraping_job RENAME COLUMN clave TO expediente`);
    await q.query(`ALTER TABLE scraping_job DROP COLUMN tipo_sujeto`);
    await q.query(`
      CREATE UNIQUE INDEX idx_scraping_job_activo ON scraping_job (expediente, fuente)
       WHERE estado IN ('encolado','corriendo','pausado')
    `);
    await q.query(
      `CREATE INDEX idx_scraping_job_expediente ON scraping_job (expediente, creado_en DESC)`,
    );
  }
}
