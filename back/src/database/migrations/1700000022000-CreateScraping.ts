import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Jobs de scraping: uno por compañía.
 *
 * ## Por qué no es `import_job`
 *
 * Los importadores y los dos rastreadores masivos (`web`, `dataportal`) son
 * **un job grande con una lista de trabajo dentro**: un índice único parcial
 * garantiza uno solo activo por `kind`, el enum no tiene `pausado` ni
 * `cancelado`, y el `detener()` es un booleano en memoria del singleton.
 *
 * Esto es lo contrario: miles de jobs a la vez, uno por compañía, cada uno con
 * su propio estado, sus reintentos y sus acciones. Meterlo en `import_job`
 * exigiría ampliar su enum y reescribir el índice que protege los imports —
 * más riesgo, y para acabar necesitando igualmente una lista de trabajo aparte.
 *
 * ## El scraper escribe en `scraping_resultado` y en nada más
 *
 * Misma regla que el rastreador de webs: lo que sale de una página ajena es una
 * observación, no un dato de negocio. Esto NO toca `companias`, ni
 * `presencia_canal`, ni `perfil_comercial`. Promover un resultado es otra
 * decisión, y tiene que poder hacerla una persona.
 */
export class CreateScraping1700000022000 implements MigrationInterface {
  name = 'CreateScraping1700000022000';

  public async up(q: QueryRunner): Promise<void> {
    // ------------------------------------------------------------- los estados
    //
    // Seis, y ninguno más. Las dos ausencias son deliberadas:
    //
    // NO hay 'reintentando'. Un reintento es un job 'encolado' con intentos > 0
    // y `proximo_intento_en` en el futuro. Si fuese un estado propio, alguien
    // tendría que sacarlo de ahí —¿quién, y cuándo?— y la lógica de la cola
    // estaría escrita dos veces. La pantalla sí lo distingue, derivándolo.
    //
    // NO hay 'pausando' / 'cancelando'. La ORDEN vive en `accion_solicitada`,
    // que es otro eje: `estado` dice dónde está el job, no qué le han pedido.
    // Además, tras una caída un job en 'pausando' es ambiguo (¿llegó a
    // pausarse?), mientras que 'corriendo' + accion_solicitada no lo es: el
    // proceso murió, la petición sigue en pie, la recuperación la aplica.
    await q.query(`
      CREATE TYPE scraping_job_estado AS ENUM (
        'encolado','corriendo','pausado','completado','fallido','cancelado'
      )
    `);

    await q.query(`CREATE TYPE scraping_job_accion AS ENUM ('pausar','cancelar')`);

    // ----------------------------------------------------------------- el job
    //
    // No hay clave foránea a `companias(expediente)`, igual que en
    // `web_consulta` y `presencia_canal`, y por tres motivos:
    //
    // 1. Un job puede pedirse para un expediente que todavía no está importado.
    //    Con FK eso es un 23503 opaco; sin ella, el servicio devuelve un 404
    //    que dice qué compañía falta.
    // 2. El historial de POR QUÉ se rastreó algo tiene que sobrevivir a la
    //    compañía. Un ON DELETE CASCADE lo borraría justo cuando más se
    //    necesita.
    // 3. Es la convención ya establecida en este esquema.
    await q.query(`
      CREATE TABLE scraping_job (
        id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        expediente         text NOT NULL,
        /** Clave del ejecutor en el registro. Hoy sólo existe 'simulada'. */
        fuente             text NOT NULL,
        estado             scraping_job_estado NOT NULL DEFAULT 'encolado',
        /** Lo que el usuario ha PEDIDO. El worker lo obedece en el latido. */
        accion_solicitada  scraping_job_accion NULL,
        /**
         * Un job pedido a mano desde la ficha de una compañía adelanta a los
         * 300.000 del barrido masivo. Sin esto, pedir uno concreto y esperar
         * a que salga por orden de llegada no sirve de nada.
         */
        prioridad          smallint NOT NULL DEFAULT 0,
        intentos           smallint NOT NULL DEFAULT 0,
        max_intentos       smallint NOT NULL DEFAULT 3,
        proximo_intento_en timestamptz NOT NULL DEFAULT now(),
        paso               text NULL,
        progreso_pct       smallint NOT NULL DEFAULT 0,
        /** Entrada del ejecutor. */
        parametros         jsonb NOT NULL DEFAULT '{}'::jsonb,
        /**
         * Por dónde iba. Es lo que hace que pausar sea útil y no un cancelar
         * disfrazado: al reanudar, el ejecutor sigue desde aquí.
         */
        checkpoint         jsonb NOT NULL DEFAULT '{}'::jsonb,
        /** Contadores del resultado (documentos, páginas, avisos). */
        resumen            jsonb NOT NULL DEFAULT '{}'::jsonb,
        ultimo_error       text NULL,
        /** 'host:pid' del proceso que lo reclamó. Para depurar y para la UI. */
        reclamado_por      text NULL,
        latido_en          timestamptz NULL,
        iniciado_en        timestamptz NULL,
        finalizado_en      timestamptz NULL,
        /** X-Usuario de quien lo pidió, o 'sistema' en el alta masiva. */
        solicitado_por     text NOT NULL,
        creado_en          timestamptz NOT NULL DEFAULT now(),
        actualizado_en     timestamptz NOT NULL DEFAULT now()
      )
    `);

    // UN SOLO JOB ACTIVO por (compañía, fuente).
    //
    // 'pausado' cuenta como activo A PROPÓSITO: si no contase, crear un job
    // nuevo mientras hay uno pausado dejaría dos vivos, y al reanudar el viejo
    // los dos escribirían el mismo resultado.
    //
    // La fuente entra en la clave porque el día que haya dos scrapers distintos
    // no tienen por qué excluirse: son trabajos distintos sobre la misma
    // compañía. Con una sola fuente, esto es literalmente "un job por compañía".
    await q.query(`
      CREATE UNIQUE INDEX idx_scraping_job_activo ON scraping_job (expediente, fuente)
       WHERE estado IN ('encolado','corriendo','pausado')
    `);

    // La consulta del despachador, y sólo ella. Parcial: de los millones de
    // filas históricas, el índice sólo contiene las que están en cola.
    await q.query(`
      CREATE INDEX idx_scraping_job_cola
          ON scraping_job (prioridad DESC, proximo_intento_en, creado_en)
       WHERE estado = 'encolado'
    `);

    // Recuperación al arrancar y vigilancia de procesos colgados.
    await q.query(`
      CREATE INDEX idx_scraping_job_corriendo ON scraping_job (latido_en)
       WHERE estado = 'corriendo'
    `);

    // El listado de la pantalla, filtrado por estado.
    await q.query(`CREATE INDEX idx_scraping_job_listado ON scraping_job (estado, creado_en DESC)`);

    // El historial de una compañía, para su ficha.
    await q.query(
      `CREATE INDEX idx_scraping_job_expediente ON scraping_job (expediente, creado_en DESC)`,
    );

    // -------------------------------------------------------------- auditoría
    //
    // Se audita el CAMBIO, no el estado final — mismo criterio que
    // `presencia_evento` y `segmento_evento`. "Quién canceló 4.000 jobs y
    // cuándo" no se reconstruye desde una fila que se sobrescribe.
    //
    // Sin clave foránea al job: el día que se poden los jobs viejos, su
    // historial tiene que seguir ahí.
    await q.query(`
      CREATE TABLE scraping_job_evento (
        id             bigserial PRIMARY KEY,
        job_id         uuid NOT NULL,
        expediente     text NOT NULL,
        /**
         * 'creado', 'reclamado', 'pausa_solicitada', 'pausado', 'reanudado',
         * 'cancelacion_solicitada', 'cancelado', 'completado', 'fallido',
         * 'reintento_programado', 'recuperado'.
         */
        accion         text NOT NULL,
        estado_antes   scraping_job_estado NULL,
        estado_despues scraping_job_estado NULL,
        /** La persona (X-Usuario), o 'sistema' cuando lo movió la máquina. */
        usuario        text NOT NULL,
        detalle        text NULL,
        en             timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(`CREATE INDEX idx_scraping_evento_job ON scraping_job_evento (job_id, en DESC)`);
    await q.query(
      `CREATE INDEX idx_scraping_evento_usuario ON scraping_job_evento (usuario, en DESC)`,
    );
    // Para poder podar por rango de fechas cuando la tabla crezca: son unos
    // cuatro o seis eventos por job.
    await q.query(`CREATE INDEX idx_scraping_evento_fecha ON scraping_job_evento (en DESC)`);

    // ------------------------------------------------------------- resultados
    //
    // El producto va en tabla aparte, NO en una columna jsonb del job:
    //
    // 1. La fila del job se reescribe en cada latido. En Postgres cada UPDATE
    //    crea una versión nueva de la tupla; con el payload dentro, la fila
    //    engorda y se pierden las actualizaciones HOT justo en la tabla que el
    //    despachador consulta cada dos segundos.
    // 2. Un job puede producir varios documentos (ficha, listado, anexos). Con
    //    una columna, o se anidan a mano o el segundo se pierde.
    // 3. Los ciclos de vida no coinciden: los jobs se podarán, los resultados
    //    son el dato. Con el payload dentro, podar jobs borraría los datos.
    await q.query(`
      CREATE TABLE scraping_resultado (
        id          bigserial PRIMARY KEY,
        job_id      uuid NOT NULL,
        expediente  text NOT NULL,
        fuente      text NOT NULL,
        /** Qué documento es: 'ficha', 'actos', 'representantes'… */
        tipo        text NOT NULL,
        /** Desambigua varios documentos del mismo tipo. '' si sólo hay uno. */
        clave       text NOT NULL DEFAULT '',
        contenido   jsonb NOT NULL,
        /**
         * md5 del contenido. Permite que el upsert distinga "lo volvimos a
         * bajar y es idéntico" de "cambió", que es la señal que interesa.
         */
        hash        text NOT NULL,
        obtenido_en timestamptz NOT NULL DEFAULT now()
      )
    `);
    await q.query(`
      CREATE UNIQUE INDEX idx_scraping_resultado_unico
          ON scraping_resultado (expediente, fuente, tipo, clave)
    `);
    await q.query(`CREATE INDEX idx_scraping_resultado_job ON scraping_resultado (job_id)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS scraping_resultado`);
    await q.query(`DROP TABLE IF EXISTS scraping_job_evento`);
    await q.query(`DROP TABLE IF EXISTS scraping_job`);
    await q.query(`DROP TYPE IF EXISTS scraping_job_accion`);
    await q.query(`DROP TYPE IF EXISTS scraping_job_estado`);
  }
}
